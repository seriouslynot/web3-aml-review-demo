"""
LLM review draft generation.
Calls DeepSeek (or compatible) API to generate structured AML review drafts.
Includes fallback mechanism when API is unavailable.
"""

import json
import os
from config import LLM_PROMPT_TEMPLATE


def get_client(base_url="https://api.deepseek.com"):
    """Initialize OpenAI-compatible client. Set DEEPSEEK_API_KEY in env."""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print("Warning: DEEPSEEK_API_KEY not set. Will use fallback drafts.")
        return None

    try:
        from openai import OpenAI
        return OpenAI(api_key=api_key, base_url=base_url)
    except ImportError:
        print("Warning: openai package not installed. Will use fallback drafts.")
        return None


def generate_draft(rag_context, client=None) -> dict:
    """Generate a structured review draft for one transaction."""
    txid = rag_context["review_object"]["txId"]

    if client is None:
        client = get_client()

    if client is None:
        return fallback_draft(rag_context)

    input_payload = {
        "txId": txid,
        "risk_level": rag_context["risk"]["risk_level"],
        "triggered_rules": [
            {
                "rule_id": r["rule_id"],
                "rule_name": r["rule_name"],
                "evidence": r["evidence_fields"],
                "limit": r["rule_doc"]["dataset_limit"],
            }
            for r in rag_context["triggered_rules"]
        ],
        "missing_info": rag_context["missing_information"],
    }

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": LLM_PROMPT_TEMPLATE},
                {"role": "user", "content": f"Analyze this transaction and output strictly in JSON:\n{json.dumps(input_payload)}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        draft = json.loads(response.choices[0].message.content)
        draft.update({
            "txId": txid,
            "risk_score": rag_context["risk"]["risk_score"],
            "risk_level": rag_context["risk"]["risk_level"],
            "llm_status": "success",
            "analyst_decision": "Pending Review",
        })
        return draft

    except Exception as e:
        print(f"LLM API error for txId {txid}: {e}")
        return fallback_draft(rag_context)


def fallback_draft(rag_context) -> dict:
    """Generate a rule-based fallback draft when LLM is unavailable."""
    txid = rag_context["review_object"]["txId"]
    return {
        "txId": txid,
        "risk_score": rag_context["risk"]["risk_score"],
        "risk_level": rag_context["risk"]["risk_level"],
        "risk_summary": f"Fallback: Manual review required for transaction {txid}. "
                        "Graph-based rule signals triggered; monetary data unavailable.",
        "triggered_reason_codes": [
            {
                "rule_id": r["rule_id"],
                "rule_name": r["rule_name"],
                "description": f"{r['rule_name']} triggered with score {r['score']}.",
            }
            for r in rag_context["triggered_rules"]
        ],
        "suspicious_behavior_description": [
            f"[{r['rule_id']}] {r['evidence_fields'].get('proxy_note', '')}"
            for r in rag_context["triggered_rules"]
        ],
        "evidence_references": [
            {
                "rule_id": r["rule_id"],
                "evidence": ", ".join(
                    f"{k}: {v}" for k, v in r["evidence_fields"].items()
                    if k != "proxy_note"
                ),
            }
            for r in rag_context["triggered_rules"]
        ],
        "missing_information": rag_context["missing_information"],
        "human_review_questions": [
            "Can entity attribution be established?",
            "Are neighbors associated with known illicit clusters?",
            "What is the source of funds for outbound flows?",
        ],
        "suggested_next_review_action": "Manual analyst review required due to graph-proxy-only signals.",
        "analyst_decision": "Pending Review",
        "llm_status": "fallback",
    }


def generate_all_drafts(rag_contexts, client=None):
    """Generate drafts for all RAG contexts. Returns list of draft dicts."""
    if client is None:
        client = get_client()

    drafts = []
    total = len(rag_contexts)
    for i, ctx in enumerate(rag_contexts):
        txid = ctx["review_object"]["txId"]
        print(f"[{i+1}/{total}] txId={txid} ...", end=" ", flush=True)
        draft = generate_draft(ctx, client)
        drafts.append(draft)
        print(draft.get("llm_status", "?"))
    return drafts
