"""
Load and preprocess the Elliptic Bitcoin Transaction Graph dataset.
Supports both local CSV files and Kaggle API download.
"""

import glob
import os
from pathlib import Path
import pandas as pd

try:
    from pyspark.sql import SparkSession, functions as F
    HAS_SPARK = True
except ImportError:
    HAS_SPARK = False

from config import ELLIPTIC_DATASET, SPARK_PARTITIONS, TOTAL_FEATURE_COLS


def find_csv_files(search_dir: str) -> dict:
    """Locate Elliptic CSV files in a directory tree."""
    targets = {"classes": "elliptic_txs_classes.csv",
               "edges": "elliptic_txs_edgelist.csv",
               "features": "elliptic_txs_features.csv"}
    found = {}
    for path in glob.glob(str(Path(search_dir) / "**" / "*.csv"), recursive=True):
        fname = Path(path).name
        for key, expected in targets.items():
            if fname == expected:
                found[key] = Path(path)
    return found


def download_from_kaggle(output_dir: str):
    """Download Elliptic dataset from Kaggle."""
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
    api.dataset_download_files(ELLIPTIC_DATASET, path=str(output_dir), unzip=True)


def init_spark(app_name="web3-aml-pipeline"):
    """Initialize a local Spark session."""
    return (
        SparkSession.builder
        .appName(app_name)
        .master("local[*]")
        .config("spark.sql.shuffle.partitions", str(SPARK_PARTITIONS))
        .config("spark.default.parallelism", str(SPARK_PARTITIONS))
        .config("spark.driver.memory", "4g")
        .getOrCreate()
    )


def load_elliptic_tables(spark, csv_paths: dict):
    """
    Load classes, edges, and features into Spark DataFrames.
    Returns (classes_df, edges_df, features_df).
    """
    # Classes (labels)
    classes_df = (
        spark.read.option("header", True)
        .csv(str(csv_paths["classes"]))
        .select(F.col("txId").cast("long"), F.col("class").alias("class_raw"))
        .withColumn(
            "label_name",
            F.when(F.col("class_raw") == "1", F.lit("illicit"))
            .when(F.col("class_raw") == "2", F.lit("licit"))
            .otherwise(F.lit("unknown"))
        )
    )

    # Edges (directed transaction graph)
    edges_df = (
        spark.read.option("header", True)
        .csv(str(csv_paths["edges"]))
        .select(
            F.col("txId1").cast("long").alias("src_txId"),
            F.col("txId2").cast("long").alias("dst_txId"),
        )
        .dropna()
    )

    # Features (165 anonymous + txId + time_step)
    raw = spark.read.option("header", False).csv(str(csv_paths["features"]))
    renamed = raw
    for idx, old_col in enumerate(raw.columns):
        if idx == 0:
            new_col = "txId"
        elif idx == 1:
            new_col = "time_step"
        else:
            new_col = f"f_{idx - 1:03d}"
        renamed = renamed.withColumnRenamed(old_col, new_col)

    features_df = renamed.withColumn("txId", F.col("txId").cast("long"))
    for col_name in [c for c in features_df.columns if c != "txId"]:
        features_df = features_df.withColumn(col_name, F.col(col_name).cast("double"))

    return classes_df, edges_df, features_df


def load_as_pandas(csv_paths: dict) -> dict:
    """
    Fallback: load Elliptic data as pandas DataFrames when Spark is unavailable.
    """
    classes = pd.read_csv(csv_paths["classes"])
    classes["label_name"] = classes["class"].map({"1": "illicit", "2": "licit"}).fillna("unknown")

    edges = pd.read_csv(csv_paths["edges"])
    edges.columns = ["src_txId", "dst_txId"]

    features = pd.read_csv(csv_paths["features"], header=None)
    col_names = ["txId", "time_step"] + [f"f_{i:03d}" for i in range(1, TOTAL_FEATURE_COLS - 1)]
    features.columns = col_names

    return {"classes": classes, "edges": edges, "features": features}
