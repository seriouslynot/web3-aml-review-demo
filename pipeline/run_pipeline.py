"""
Main pipeline entry point.
Usage:
    python run_pipeline.py --data-dir /path/to/elliptic/csvs --output-dir ../frontend/data
"""

import argparse
import sys
from pathlib import Path

from data_loader import find_csv_files, download_from_kaggle, load_as_pandas
from features import (compute_graph_metrics, segment_profiles, compute_network_exposure)
from rule_engine import (build_peer_thresholds_df, evaluate_rules,
                          apply_rule_weights, compute_risk_score)
from rag_builder import download_pdfs, build_rag_context
from llm_draft import get_client, generate_all_drafts
from export import build_demo_cases, export
from config import RULE_DOCS, SAMPLING_SEED, SKIP_TOP_N, BATCH_SIZE


def main():
    parser = argparse.ArgumentParser(description="Web3 AML Review Demo — Data Pipeline")
    parser.add_argument("--data-dir", required=True,
                        help="Directory containing Elliptic CSV files (elliptic_txs_classes.csv, etc.)")
    parser.add_argument("--output-dir", default="./output",
                        help="Output directory for frontend JSON files")
    parser.add_argument("--skip-llm", action="store_true",
                        help="Skip LLM API calls, use fallback drafts only")
    parser.add_argument("--skip-top", type=int, default=SKIP_TOP_N,
                        help=f"Skip top N highest-scoring nodes (default: {SKIP_TOP_N})")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE,
                        help=f"Number of cases to generate (default: {BATCH_SIZE})")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    rag_dir = output_dir / "rag_chunks"

    # ---- 1. Find or download data ----
    csv_paths = find_csv_files(str(data_dir))
    if len(csv_paths) < 3:
        print(f"Elliptic CSV files not found at {data_dir}. Attempting Kaggle download...")
        try:
            download_from_kaggle(str(data_dir))
            csv_paths = find_csv_files(str(data_dir))
        except Exception as e:
            print(f"Kaggle download failed: {e}")
            print("Please download the Elliptic dataset manually from kaggle.com/ellipticco/elliptic-data-set")
            sys.exit(1)

    print(f"Found CSV files: {[k for k in csv_paths]}")

    # ---- 2. Load data ----
    tables = load_as_pandas(csv_paths)
    df = tables["features"].merge(tables["classes"], on="txId", how="left")

    # ---- 3. Compute graph metrics ----
    print("Computing graph metrics...")
    edgelist = tables["edges"]
    df["out_degree"] = df["txId"].map(edgelist.groupby("src_txId").size()).fillna(0).astype(int)
    df["in_degree"] = df["txId"].map(edgelist.groupby("dst_txId").size()).fillna(0).astype(int)
    df = compute_graph_metrics(df)

    # ---- 4. Profile segmentation ----
    print("Segmenting profiles...")
    df = segment_profiles(df)

    # ---- 5. Network exposure ----
    print("Computing network exposure...")
    df = compute_network_exposure(df, edgelist)

    # ---- 6. Build peer thresholds & evaluate rules ----
    print("Building peer thresholds and evaluating rules...")
    df = build_peer_thresholds_df(df)
    df = evaluate_rules(df, None)  # thresholds already in df columns
    df = apply_rule_weights(df)
    df = compute_risk_score(df)

    # ---- 7. Sampling ----
    print(f"Sampling {args.batch_size} cases (skipping top {args.skip_top})...")
    df = df.sort_values("risk_score", ascending=False)
    pool = df.iloc[args.skip_top: args.skip_top + args.batch_size * 5]
    sample = pool.sample(n=min(args.batch_size, len(pool)), random_state=SAMPLING_SEED)
    print(f"Sampled {len(sample)} cases")
    print(f"Risk distribution:\n{sample['risk_level'].value_counts().to_string()}")

    # ---- 8. RAG context ----
    print("Building RAG contexts...")
    rag_chunks = download_pdfs(rag_dir)
    rag_contexts = [build_rag_context(row, rag_chunks, RULE_DOCS)
                    for _, row in sample.iterrows()]

    # ---- 9. LLM drafts ----
    if args.skip_llm:
        print("Skipping LLM (--skip-llm). Using fallback drafts.")
        from llm_draft import fallback_draft
        review_drafts = [fallback_draft(ctx) for ctx in rag_contexts]
    else:
        print("Generating LLM drafts...")
        client = get_client()
        review_drafts = generate_all_drafts(rag_contexts, client)

    # ---- 10. Build frontend cases ----
    print("Building frontend cases...")
    cases = build_demo_cases(sample, rag_contexts)

    # ---- 11. Export ----
    export(output_dir, cases, rag_contexts, review_drafts, sample)
    print(f"\nDone! Copy the files from {output_dir}/ to frontend/data/")


if __name__ == "__main__":
    main()
