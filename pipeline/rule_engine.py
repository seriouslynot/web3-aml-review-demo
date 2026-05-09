"""
Rule detection engine and risk scoring.
Each rule compares node metrics against peer-group percentile thresholds.
"""

import pandas as pd
from config import RULE_WEIGHTS, RISK_BANDS


def evaluate_rules(df, peer_thresholds):
    """
    Evaluate R001-R005 rules against peer-group thresholds.
    Adds {rule_id}_hit and {rule_id}_score columns.
    """
    df = df.copy()

    # R001: High transaction activity
    df["R001_hit"] = (
        (df["total_degree"] > df["thresh_total_degree_p90"]) |
        (df["time_step_activity"] > df["thresh_time_step_activity_p90"])
    )

    # R002: Dense activity window
    df["R002_hit"] = (
        (df["time_step_activity"] > df["thresh_time_step_activity_p75"]) &
        (df["total_degree"] > df["thresh_total_degree_p75"])
    )

    # R003: High outbound flow proxy
    df["R003_hit"] = (
        (df["out_degree"] > df["thresh_out_degree_p90"]) |
        (df["anonymized_behavior_intensity"] > df["thresh_anonymized_behavior_intensity_p95"])
    )

    # R004: Outbound imbalance proxy
    df["R004_hit"] = (
        (df["out_in_ratio"] > df["thresh_out_in_ratio_p90"]) &
        (df["out_degree"] > df["thresh_out_degree_p75"])
    )

    # R005: Elevated graph exposure
    df["R005_hit"] = df["neighbor_complexity"] > df["thresh_neighbor_complexity_p90"]

    # R006: ERC20 — unsupported by Bitcoin dataset
    df["R006_hit"] = False

    return df


def apply_rule_weights(df):
    """Apply segment-specific weights to each triggered rule."""
    for rule_id in ["R001", "R002", "R003", "R004", "R005", "R006"]:
        df[f"{rule_id}_score"] = df.apply(
            lambda row: RULE_WEIGHTS.get(row["primary_segment"], {}).get(rule_id, 0)
            if row[f"{rule_id}_hit"] else 0,
            axis=1
        )
    return df


def compute_risk_score(df):
    """Sum rule scores (capped at 100) and assign risk band."""
    score_cols = [f"R00{i}_score" for i in range(1, 7)]
    df["risk_score_raw"] = df[score_cols].sum(axis=1)
    df["risk_score"] = df["risk_score_raw"].clip(upper=100)

    def band(score):
        for thresh, label in RISK_BANDS:
            if score >= thresh:
                return label
        return "Low"

    df["risk_level"] = df["risk_score"].apply(band)
    return df


def build_peer_thresholds_df(df, primary_segment_col="primary_segment"):
    """
    Compute P75, P90, P95 thresholds for each segment and join them
    back as columns on the main DataFrame.
    """
    metrics = ["total_degree", "time_step_activity", "out_degree",
               "out_in_ratio", "neighbor_complexity",
               "anonymized_behavior_intensity"]
    probs = [0.75, 0.90, 0.95]

    rows = []
    for segment, group in df.groupby(primary_segment_col):
        q = group[metrics].quantile(probs)
        for metric in metrics:
            row = {"primary_segment": segment, "metric": metric}
            for p in probs:
                row[f"p{int(p * 100):02d}"] = q.loc[p, metric]
            rows.append(row)

    thresholds = pd.DataFrame(rows)

    # Pivot to wide format: one row per segment, columns like thresh_out_degree_p90
    wide = thresholds.pivot(
        index="primary_segment", columns="metric",
        values=[f"p{int(p * 100):02d}" for p in probs]
    )
    wide.columns = [f"thresh_{col[1]}_{col[0]}" for col in wide.columns]
    wide = wide.reset_index()

    return df.merge(wide, on="primary_segment", how="left")
