"""
Compute graph metrics, profile segmentation, and peer-group thresholds.
Core feature engineering for the AML rule engine.
"""

import pandas as pd
from config import EPSILON


def compute_graph_metrics(df):
    """
    Compute in-degree, out-degree, total-degree, time-step activity,
    out-in ratio, and anonymized behavior intensity.
    Works on both Spark and pandas DataFrames.
    """
    use_spark = not isinstance(df, pd.DataFrame)

    if use_spark:
        from pyspark.sql import functions as F
        # Build degree tables from edges (edges must be provided separately in Spark path)
        return df  # Spark path handled inline in run_pipeline.py

    # --- Pandas path ---
    # out_degree = count of edges where this txId is source
    # in_degree = count of edges where this txId is destination
    if "out_degree" not in df.columns:
        df["out_degree"] = 0
    if "in_degree" not in df.columns:
        df["in_degree"] = 0

    df["total_degree"] = df["in_degree"] + df["out_degree"]
    df["neighbor_complexity"] = df["total_degree"]
    df["out_in_ratio"] = df["out_degree"] / (df["in_degree"] + EPSILON)

    # Anonymized behavior intensity: mean absolute value of first 20 feature columns
    feature_cols = [c for c in df.columns if c.startswith("f_")]
    intensity_cols = feature_cols[: min(20, len(feature_cols))]
    if intensity_cols:
        df["anonymized_behavior_intensity"] = df[intensity_cols].abs().mean(axis=1)
    else:
        df["anonymized_behavior_intensity"] = 0.0

    # time_step_activity: count of transactions in same time step
    if "time_step_activity" not in df.columns:
        ts_counts = df.groupby("time_step").size().to_dict()
        df["time_step_activity"] = df["time_step"].map(ts_counts)

    return df


def compute_percentiles(df, metrics, probs=(0.10, 0.25, 0.75, 0.90, 0.95)):
    """
    Compute percentile thresholds for each metric, optionally per segment.
    Returns a dict: {segment: {metric: {pXX: value}}}
    """
    thresholds = {}
    group_col = "primary_segment" if "primary_segment" in df.columns else None

    if group_col:
        for segment, group in df.groupby(group_col):
            thresholds[segment] = {}
            for metric in metrics:
                if metric in group.columns:
                    q = group[metric].quantile(list(probs))
                    thresholds[segment][metric] = {
                        f"p{int(p * 100):02d}": q[p] for p in probs
                    }
    else:
        thresholds["_global"] = {}
        for metric in metrics:
            if metric in df.columns:
                q = df[metric].quantile(list(probs))
                thresholds["_global"][metric] = {
                    f"p{int(p * 100):02d}": q[p] for p in probs
                }

    return thresholds


def segment_profiles(df):
    """
    Assign each node to a behavioral peer group:
    - High-Value / Flow-Intensive Proxy
    - Active / Complex
    - Low Activity / Retail-like
    """
    metrics = ["out_degree", "total_degree", "neighbor_complexity",
               "time_step_activity", "anonymized_behavior_intensity"]

    # Global thresholds for segmentation
    qt = {}
    for m in metrics:
        if m in df.columns:
            qt[m] = df[m].quantile([0.85, 0.90])

    def classify(row):
        if (row.get("out_degree", 0) > qt.get("out_degree", {}).get(0.90, float("inf"))
                or row.get("anonymized_behavior_intensity", 0) > qt.get("anonymized_behavior_intensity", {}).get(0.90, float("inf"))):
            return "High-Value / Flow-Intensive Proxy"
        if (row.get("total_degree", 0) > qt.get("total_degree", {}).get(0.85, float("inf"))
                or row.get("neighbor_complexity", 0) > qt.get("neighbor_complexity", {}).get(0.85, float("inf"))
                or row.get("time_step_activity", 0) > qt.get("time_step_activity", {}).get(0.85, float("inf"))):
            return "Active / Complex"
        return "Low Activity / Retail-like"

    df["primary_segment"] = df.apply(classify, axis=1)

    # Secondary tags
    tags = []
    if "total_degree" in df.columns:
        tags.append(df["total_degree"] > qt.get("total_degree", {}).get(0.85, 0))
    if "neighbor_complexity" in df.columns:
        tags.append(df["neighbor_complexity"] > qt.get("neighbor_complexity", {}).get(0.85, 0))
    # Simplified: store count of elevated metrics as complexity signal
    df["secondary_tag_count"] = sum(tags).astype(int) if tags else 0

    return df


def compute_network_exposure(df, edges_df):
    """
    Compute 1-hop and 2-hop neighbor counts and risk-neighbor shares.
    df must have txId and label_name columns.
    edges_df must have src_txId and dst_txId columns.
    """
    import networkx as nx

    # Build undirected graph from edges
    G = nx.Graph()
    for _, row in edges_df.iterrows():
        G.add_edge(row["src_txId"], row["dst_txId"])

    # Build label lookup
    label_map = dict(zip(df["txId"], df["label_name"]))

    one_hop_counts, one_hop_risks, two_hop_counts, two_hop_risks, distances = [], [], [], [], []
    for _, row in df.iterrows():
        tx = row["txId"]
        # 1-hop
        neighbors_1 = set(G.neighbors(tx))
        n1 = len(neighbors_1)
        risky_1 = sum(1 for n in neighbors_1 if label_map.get(n) == "illicit") / max(n1, 1)

        # 2-hop
        neighbors_2 = set()
        for n in neighbors_1:
            neighbors_2.update(G.neighbors(n))
        neighbors_2.discard(tx)
        neighbors_2 -= neighbors_1
        n2 = len(neighbors_2)
        risky_2 = sum(1 for n in neighbors_2 if label_map.get(n) == "illicit") / max(n2, 1)

        # Distance to illicit cluster
        if risky_1 > 0:
            dist = "1 hop"
        elif risky_2 > 0:
            dist = "2 hops"
        else:
            dist = "Not observed within 2 hops"

        one_hop_counts.append(n1)
        one_hop_risks.append(round(risky_1, 4))
        two_hop_counts.append(n2)
        two_hop_risks.append(round(risky_2, 4))
        distances.append(dist)

    df["one_hop_neighbor_count"] = one_hop_counts
    df["one_hop_risk_neighbor_share"] = one_hop_risks
    df["two_hop_neighbor_count"] = two_hop_counts
    df["two_hop_risk_neighbor_share"] = two_hop_risks
    df["distance_to_known_illicit_cluster"] = distances

    return df
