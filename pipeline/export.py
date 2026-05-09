"""
Export pipeline outputs to frontend-ready JSON and CSV files.
"""

import json
import pandas as pd
from pathlib import Path
from config import RULE_DOCS


def _mask_txid(txid) -> str:
    s = str(int(txid))
    return f"{s[:2]}...{s[-2:]}"


def _label_for_demo(label_name: str) -> str:
    if label_name == "illicit":
        return "illicit_for_evaluation_only"
    if label_name == "licit":
        return "licit_for_evaluation_only"
    return "unknown"


def _risk_band(risk_level: str) -> str:
    return {"Critical": "high", "High": "high", "Medium": "medium"}.get(risk_level, "low")


def _severity(score: int) -> str:
    if score >= 25:
        return "high"
    if score >= 15:
        return "medium"
    return "low"


def _flow_pattern(in_deg: int, out_deg: int) -> str:
    if out_deg >= max(3, in_deg * 2):
        return "fan-out"
    if in_deg >= max(3, out_deg * 2):
        return "fan-in"
    return "balanced"


def build_demo_cases(df: pd.DataFrame, rag_contexts: list) -> list:
    """Build the frontend aml_demo_cases.json records."""
    cases = []

    # Compute global percentiles for volume bucket
    percentile_cols = ["total_degree", "out_degree", "time_step_activity",
                       "anonymized_behavior_intensity", "two_hop_risk_neighbor_share"]
    pct = {}
    for col in percentile_cols:
        if col in df.columns:
            pct[col] = df[col].rank(pct=True)

    for idx, (_, row) in enumerate(df.iterrows()):
        txid = int(row["txId"])
        in_d = int(row.get("in_degree", 0))
        out_d = int(row.get("out_degree", 0))
        total_d = int(row.get("total_degree", 0))
        pattern = _flow_pattern(in_d, out_d)

        triggered = [rid for rid in ["R001", "R002", "R003", "R004", "R005"]
                     if row.get(f"{rid}_hit", False)]

        rules_frontend = []
        rule_names = {
            "R001": "High transaction activity",
            "R002": "Dense activity window",
            "R003": "High outbound flow proxy",
            "R004": "Outbound imbalance proxy",
            "R005": "Elevated graph exposure / complexity",
        }
        evidence_keys = {
            "R001": ["totalDegree", "timeStepActivity"],
            "R002": ["timeStepActivity", "totalDegree"],
            "R003": ["outDegree", "anonymizedBehaviorIntensity"],
            "R004": ["outInRatio", "outDegree", "flowPattern"],
            "R005": ["oneHopNeighborCount", "twoHopRiskNeighborShare",
                     "distanceToKnownIllicitCluster"],
        }
        for rid in triggered:
            rules_frontend.append({
                "ruleId": rid.replace("R", "R-"),
                "name": rule_names[rid],
                "severity": _severity(int(row.get(f"{rid}_score", 0))),
                "scoreContribution": int(row.get(f"{rid}_score", 0)),
                "keyEvidence": evidence_keys.get(rid, []),
            })

        cases.append({
            "id": f"ELL-{idx+1:03d}",
            "source": "Elliptic Bitcoin Transaction Graph",
            "caseType": "Transaction-level review",
            "timeStep": int(row.get("time_step", 0)),
            "transactionIdMasked": _mask_txid(txid),
            "demoLabel": _label_for_demo(row.get("label_name", "unknown")),
            "riskBand": _risk_band(row.get("risk_level", "Low")),
            "modelScore": round(float(row.get("risk_score", 0)) / 100.0, 2),
            "modelSignals": {
                "scoreType": "rule_based_priority_score",
                "modelScore": round(float(row.get("risk_score", 0)) / 100.0, 2),
                "riskBand": _risk_band(row.get("risk_level", "Low")),
                "scoreMeaning": "Prioritization signal only, not a final AML decision.",
                "scoreBreakdown": [
                    {
                        "ruleId": r["ruleId"],
                        "name": r["name"],
                        "scoreContribution": r["scoreContribution"],
                        "severity": r["severity"],
                        "keyEvidence": r["keyEvidence"],
                        "explanation": f"{r['name']} contributed {r['scoreContribution']} points.",
                    }
                    for r in rules_frontend
                ],
            },
            "transactionProfile": {
                "inputCount": in_d,
                "outputCount": out_d,
                "btcIn": None, "btcOut": None, "feeBtc": None,
                "avgInputValueBtc": None, "avgOutputValueBtc": None,
                "transactionVolumeBucket": "high" if pct.get("out_degree", pd.Series([0])).get(idx, 0) >= 0.8 else "medium",
                "flowPattern": pattern,
                "structureSummary": {
                    "fan-out": "Multiple outputs suggest graph dispersion",
                    "fan-in": "Multiple inputs suggest graph aggregation",
                }.get(pattern, "Input/output structure appears relatively balanced"),
            },
            "graphContext": {
                "inDegree": in_d,
                "outDegree": out_d,
                "oneHopNeighborCount": int(row.get("one_hop_neighbor_count", total_d)),
                "oneHopRiskNeighborShare": round(float(row.get("one_hop_risk_neighbor_share", 0)), 2),
                "twoHopNeighborCount": int(row.get("two_hop_neighbor_count", 0)),
                "twoHopRiskNeighborShare": round(float(row.get("two_hop_risk_neighbor_share", 0)), 2),
                "distanceToKnownIllicitCluster": row.get("distance_to_known_illicit_cluster", "Not observed within 2 hops"),
                "neighborAggregationSignal": "elevated" if row.get("two_hop_risk_neighbor_share", 0) > 0 else "normal",
                "graphSummary": f"Node with {total_d} total connections, "
                               f"{int(row.get('one_hop_neighbor_count', total_d))} one-hop neighbors.",
            },
            "temporalBehavior": {
                "timeStep": int(row.get("time_step", 0)),
                "totalTimeSteps": 49,
                "approximateWindow": "Approximately two weeks per time step",
                "activityStage": "Active spike" if row.get("total_degree", 0) > 5 else "Normal",
                "peerPercentileTxCount": None,
                "peerPercentileValueOut": None,
            },
            "triggeredRules": rules_frontend,
            "evidenceFields": [],
            "retrievedGuidance": [],
            "reviewDraft": {
                "summary": f"Transaction reviewed with {len(triggered)} rules triggered. "
                          f"Risk score: {int(row.get('risk_score', 0))}.",
                "keySignals": [rule_names[rid] for rid in triggered],
                "reviewQuestions": [
                    "Can entity attribution be established?",
                    "Are neighboring transactions associated with known risk clusters?",
                ],
                "boundary": "Transaction-level review only. No KYC, no identity, no final verdict.",
            },
            "constraints": [
                "wallet identity", "customer identity",
                "KYC profile", "final AML verdict",
            ],
        })

    return cases


def export(output_dir: Path, cases: list, rag_contexts: list,
           review_drafts: list, review_queue_df: pd.DataFrame):
    """Write all output files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    (output_dir / "aml_demo_cases.json").write_text(
        json.dumps(cases, indent=2, ensure_ascii=False), encoding="utf-8")
    (output_dir / "rag_contexts.json").write_text(
        json.dumps(rag_contexts, indent=2, ensure_ascii=False), encoding="utf-8")
    (output_dir / "review_drafts.json").write_text(
        json.dumps(review_drafts, indent=2, ensure_ascii=False), encoding="utf-8")
    review_queue_df.to_csv(output_dir / "human_review_queue.csv", index=False)

    print(f"Exported {len(cases)} cases, {len(rag_contexts)} RAG contexts, "
          f"{len(review_drafts)} drafts → {output_dir}")
