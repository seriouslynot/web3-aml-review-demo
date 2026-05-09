"""
RAG (Retrieval-Augmented Generation) context builder.
Downloads and chunks FATF/FinCEN AML guidance PDFs,
then retrieves relevant excerpts for each review case.
"""

import json
import re
import urllib.request
from pathlib import Path
from pypdf import PdfReader

from config import PDF_SOURCES, RULE_RAG_KEYWORDS, DEFAULT_RAG_KEYWORDS


def download_pdfs(output_dir: Path) -> list[dict]:
    """Download FATF/FinCEN PDFs. Returns list of chunk dicts."""
    output_dir.mkdir(parents=True, exist_ok=True)
    all_chunks = []

    for source in PDF_SOURCES:
        dest = output_dir / f"{source['source_id']}.pdf"
        if not dest.exists() or dest.stat().st_size == 0:
            print(f"Downloading {source['title'][:60]}...")
            urllib.request.urlretrieve(source["url"], dest)

        reader = PdfReader(str(dest))
        for page_idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            text = re.sub(r"\s+", " ", text).strip()
            chunks = _chunk_text(text)
            for chunk_idx, chunk in enumerate(chunks, start=1):
                all_chunks.append({
                    "source_id": source["source_id"],
                    "title": source["title"],
                    "publisher": source["publisher"],
                    "url": source["url"],
                    "page": page_idx,
                    "chunk_id": f"{source['source_id']}-p{page_idx:03d}-c{chunk_idx:02d}",
                    "text": chunk,
                })

    return all_chunks


def _chunk_text(text, chunk_size=1200, overlap=160):
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if len(chunk) > 120:
            chunks.append(chunk)
        if end == len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def retrieve_chunks(triggered_rule_ids: list[str],
                    all_chunks: list[dict],
                    top_k: int = 6) -> list[dict]:
    """Keyword-based retrieval of relevant PDF chunks for triggered rules."""
    keywords = []
    for rid in triggered_rule_ids:
        keywords.extend(RULE_RAG_KEYWORDS.get(rid, []))
    keywords.extend(DEFAULT_RAG_KEYWORDS)
    keywords = [kw.lower() for kw in keywords]

    scored = []
    for chunk in all_chunks:
        text = chunk["text"].lower()
        score = sum(text.count(kw) for kw in keywords)
        if score > 0:
            item = dict(chunk)
            item["retrieval_score"] = score
            item["text"] = chunk["text"][:900]
            scored.append(item)

    scored.sort(key=lambda x: (x["retrieval_score"], -x["page"]), reverse=True)
    return scored[:top_k]


def build_rag_context(row, all_chunks, rule_docs):
    """Build the full RAG context for one transaction node."""
    from config import PDR_ADAPTER

    triggered = []
    for rid in ["R001", "R002", "R003", "R004", "R005"]:
        if row.get(f"{rid}_hit"):
            triggered.append(_build_triggered_rule(row, rid, rule_docs))

    unsupported = [_build_unsupported_rule("R006", rule_docs)]

    return {
        "review_object": {
            "type": "elliptic_bitcoin_transaction_node",
            "txId": int(row["txId"]),
        },
        "known_label_for_research_only": row.get("label_name", "unknown"),
        "address_profile_adapter": {
            "primary_segment": row.get("primary_segment", ""),
        },
        "risk": {
            "risk_score": int(row.get("risk_score", 0)),
            "risk_level": row.get("risk_level", "Low"),
        },
        "graph_exposure": {
            "one_hop_neighbor_count": int(row.get("one_hop_neighbor_count", 0)),
            "one_hop_risk_neighbor_share": float(row.get("one_hop_risk_neighbor_share", 0)),
            "two_hop_neighbor_count": int(row.get("two_hop_neighbor_count", 0)),
            "two_hop_risk_neighbor_share": float(row.get("two_hop_risk_neighbor_share", 0)),
            "distance_to_known_illicit_cluster": row.get("distance_to_known_illicit_cluster", ""),
        },
        "triggered_rules": triggered,
        "unsupported_rules": unsupported,
        "retrieved_pdf_chunks": retrieve_chunks(
            [t["rule_id"] for t in triggered], all_chunks
        ),
        "missing_information": PDR_ADAPTER["unavailable_fields"],
        "generation_boundaries": [
            "Do not make final compliance conclusions.",
            "Do not infer KYC, identity, source of funds, or full transaction paths.",
            "Every risk point must reference rule_id, evidence_fields, or retrieved chunks.",
        ],
    }


def _build_triggered_rule(row, rule_id, rule_docs):
    """Build one triggered rule entry with evidence fields."""
    doc = rule_docs[rule_id]
    evidence_map = {
        "R001": {
            "total_degree": int(row.get("total_degree", 0)),
            "time_step_activity": int(row.get("time_step_activity", 0)),
            "proxy_note": "High-frequency proxy from graph activity, not raw address transaction intervals.",
        },
        "R002": {
            "time_step": float(row.get("time_step", 0)),
            "time_step_activity": int(row.get("time_step_activity", 0)),
            "total_degree": int(row.get("total_degree", 0)),
            "proxy_note": "Elliptic lacks first/last address lifecycle; uses time-step density proxy.",
        },
        "R003": {
            "out_degree": int(row.get("out_degree", 0)),
            "anonymized_behavior_intensity": float(row.get("anonymized_behavior_intensity", 0)),
            "proxy_note": "No amount field exists; this is not Total Ether Sent or Max Val Sent.",
        },
        "R004": {
            "out_degree": int(row.get("out_degree", 0)),
            "in_degree": int(row.get("in_degree", 0)),
            "out_in_ratio": float(row.get("out_in_ratio", 0)),
            "proxy_note": "Graph out/in ratio proxy, not monetary outbound ratio.",
        },
        "R005": {
            "neighbor_complexity": int(row.get("neighbor_complexity", 0)),
            "one_hop_neighbor_count": int(row.get("one_hop_neighbor_count", 0)),
            "one_hop_risk_neighbor_share": float(row.get("one_hop_risk_neighbor_share", 0)),
            "two_hop_neighbor_count": int(row.get("two_hop_neighbor_count", 0)),
            "two_hop_risk_neighbor_share": float(row.get("two_hop_risk_neighbor_share", 0)),
            "distance_to_known_illicit_cluster": row.get("distance_to_known_illicit_cluster", ""),
            "proxy_note": "Graph exposure and complexity; neighbors are transaction graph nodes, not attributed entities.",
        },
    }

    return {
        "rule_id": rule_id,
        "rule_name": doc["rule_name"],
        "pdr_rule_name": doc["pdr_rule_name"],
        "status": "triggered",
        "score": int(row.get(f"{rule_id}_score", 0)),
        "evidence_fields": evidence_map.get(rule_id, {}),
        "rule_doc": doc,
    }


def _build_unsupported_rule(rule_id, rule_docs):
    """Build an unsupported rule entry (R006 for Bitcoin dataset)."""
    doc = rule_docs[rule_id]
    return {
        "rule_id": rule_id,
        "rule_name": doc["rule_name"],
        "pdr_rule_name": doc["pdr_rule_name"],
        "status": "unsupported_by_dataset",
        "score": 0,
        "evidence_fields": {
            "status": "unavailable",
            "missing_fields": ["ERC20 transfer counts", "ERC20 token values", "ERC20 token types"],
            "proxy_note": "Bitcoin Elliptic dataset does not support ERC20 interaction evidence.",
        },
        "rule_doc": doc,
    }
