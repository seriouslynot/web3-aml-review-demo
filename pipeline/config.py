"""
Pipeline configuration for the Web3 AML Review Demo.
All business rules, thresholds, and adapter definitions live here.
"""

# --- Dataset ---
ELLIPTIC_DATASET = "ellipticco/elliptic-data-set"

# --- PDR-to-Elliptic field adapter ---
PDR_ADAPTER = {
    "review_object": {
        "pdr_object": "Ethereum address",
        "elliptic_object": "Bitcoin transaction node txId",
    },
    "supported_proxy_fields": {
        "transaction_activity": ["in_degree", "out_degree", "total_degree", "time_step_activity"],
        "counterparty_complexity": ["neighbor_complexity"],
        "net_outflow_proxy": ["out_in_ratio"],
        "anonymized_behavior": ["anonymized_behavior_intensity"],
    },
    "unavailable_fields": [
        "Total Ether Sent", "Total Ether Received",
        "Max Val Sent", "Avg Val Sent", "Total Ether Balance",
        "ERC20 sent/received counts", "ERC20 token types",
        "KYC records", "wallet/entity attribution",
        "sanctions or mixer labels", "full transaction paths",
    ],
}

# --- Rule definitions ---
RULE_DOCS = {
    "R001": {
        "rule_name": "High Frequency Transaction Proxy",
        "pdr_rule_name": "高频交易",
        "description": "Detects transaction nodes with activity above peer-group thresholds.",
        "dataset_limit": "Elliptic has transaction graph nodes, not full address transaction intervals.",
    },
    "R002": {
        "rule_name": "Short Lifecycle Dense Activity Proxy",
        "pdr_rule_name": "短生命周期密集活动",
        "description": "Uses time_step density as a limited proxy for concentrated activity.",
        "dataset_limit": "Elliptic does not provide address first/last transaction lifecycle.",
    },
    "R003": {
        "rule_name": "High Outbound Flow Proxy",
        "pdr_rule_name": "大额资金外流",
        "description": "Uses out_degree and anonymized behavior intensity as proxy signals.",
        "dataset_limit": "Elliptic does not expose BTC amount, ETH amount, or Max Val Sent fields.",
    },
    "R004": {
        "rule_name": "Abnormal Net Outflow Proxy",
        "pdr_rule_name": "异常净流出模式",
        "description": "Uses out_degree / in_degree as a graph-only outflow proxy.",
        "dataset_limit": "This is not a monetary outbound ratio.",
    },
    "R005": {
        "rule_name": "Counterparty Complexity Proxy",
        "pdr_rule_name": "对手方复杂度异常",
        "description": "Uses graph neighbor complexity from in/out degree.",
        "dataset_limit": "Counterparties are transaction graph neighbors, not attributed entities.",
    },
    "R006": {
        "rule_name": "ERC20 Interaction Anomaly",
        "pdr_rule_name": "ERC20 交互异常",
        "description": "Unsupported for Elliptic Bitcoin graph.",
        "dataset_limit": "Bitcoin/Elliptic dataset has no ERC20 token fields.",
    },
}

# --- Rule weights per segment ---
# Higher weight = more sensitive to this rule in this segment
RULE_WEIGHTS = {
    "Low Activity / Retail-like":    {"R001": 25, "R002": 25, "R003": 25, "R004": 20, "R005": 15, "R006": 0},
    "Active / Complex":               {"R001": 12, "R002": 18, "R003": 22, "R004": 18, "R005": 12, "R006": 0},
    "High-Value / Flow-Intensive":    {"R001": 18, "R002": 18, "R003": 28, "R004": 28, "R005": 18, "R006": 0},
}

# --- Risk band thresholds ---
RISK_BANDS = [
    (80, "Critical"),
    (60, "High"),
    (30, "Medium"),
    (0,  "Low"),
]

# --- RAG PDF sources ---
PDF_SOURCES = [
    {
        "source_id": "FATF_VA_RED_FLAGS_2020",
        "title": "FATF Virtual Assets Red Flag Indicators of Money Laundering and Terrorist Financing",
        "url": "https://www.fatf-gafi.org/content/dam/fatf-gafi/publications/Virtual-Assets-Red-Flag-Indicators.pdf.coredownload.pdf",
        "publisher": "FATF",
    },
    {
        "source_id": "FINCEN_CVC_ADVISORY_2019",
        "title": "FinCEN Advisory on Illicit Activity Involving Convertible Virtual Currency",
        "url": "https://www.fincen.gov/system/files/advisory/2019-05-10/FinCEN%20Advisory%20CVC%20FINAL%20508.pdf",
        "publisher": "FinCEN",
    },
]

# --- RAG retrieval keywords per rule ---
RULE_RAG_KEYWORDS = {
    "R001": ["frequency", "transaction pattern", "rapid", "high volume", "activity"],
    "R002": ["rapid movement", "short period", "immediately", "multiple transactions", "layering"],
    "R003": ["large", "value", "transaction size", "volume", "funds"],
    "R004": ["outgoing", "transfer", "movement", "layering", "flow"],
    "R005": ["counterparty", "exposure", "red flag", "darknet", "peer-to-peer", "mixing", "neighbor"],
    "R006": ["virtual asset", "token", "anonymity", "unavailable", "limitations"],
}
DEFAULT_RAG_KEYWORDS = ["virtual currency", "red flag", "suspicious", "money laundering", "typology"]

# --- LLM prompt template ---
LLM_PROMPT_TEMPLATE = """
You are a specialized AML compliance review assistant.
Your goal is to generate a risk review draft in JSON format based on the provided context.

STRICT RULES:
1. The output MUST be a valid JSON object.
2. Do not make final legal conclusions.
3. Every risk point must reference a rule_id and use evidence_fields.
4. If information is missing, list it in the 'missing_information' field.

The required JSON structure:
{
  "risk_summary": "Summary of the transaction risk",
  "triggered_reason_codes": [{"rule_id": "...", "rule_name": "...", "description": "..."}],
  "suspicious_behavior_description": ["point 1", "point 2"],
  "evidence_references": [{"rule_id": "...", "evidence": "..."}],
  "missing_information": ["..."],
  "human_review_questions": ["..."],
  "suggested_next_review_action": "..."
}
""".strip()

# --- Sampling config ---
SAMPLING_SEED = 42
SKIP_TOP_N = 5000
BATCH_SIZE = 100
PER_STRATUM = 25
SPARK_PARTITIONS = 24
EPSILON = 1e-9

# --- Feature columns from Elliptic CSV ---
# Column 0 = txId, Column 1 = time_step, Columns 2+ = anonymous features (f_001 through f_165)
ANONYMIZED_FEATURE_COUNT = 165
TOTAL_FEATURE_COLS = 167  # txId + time_step + 165 anonymous
