# Web3 Transaction Risk Review — AML Demo

A **transaction-level risk review prototype** built on the public Elliptic Bitcoin Transaction Graph.
It organizes on-chain transaction behavior into reviewable risk signals — not a money laundering detection system.

**Built April 15 – May 3, 2026** · Solo project

---

## What this is

This is a demo of a review workflow, not a compliance product. It takes Bitcoin transaction graph data,
applies configurable risk rules, binds evidence fields to each rule hit, and generates an AI-assisted
review draft that an analyst can check, question, and override.

**It does not:**
- Identify wallet owners or real-world entities
- Access KYC, sanctions lists, or source-of-funds data
- Make final AML conclusions
- Use any confidential or proprietary data

**It does:**
- Turn raw graph metrics (degree, neighbors, time-step activity) into readable risk signals
- Show why each rule triggered, with specific evidence fields
- Generate a constrained AI review draft that cites evidence, not guesses
- Leave every case in "Pending Review" status

---

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. You'll see the demo dashboard with 200 prepared review cases.
Click "Open a random case" to start exploring.

The **Methodology** tab explains how the rules work, how the risk score is calculated,
and what boundaries the system operates within.

---

## Project structure

```
├── README.md
├── frontend/                    # Next.js app (TypeScript + Tailwind)
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Entry point — loads JSON, renders dashboard
│   │   └── global.css
│   ├── components/
│   │   └── AmlDemoDashboard.tsx # Main dashboard component (~1500 lines)
│   ├── types/
│   │   └── aml.ts               # TypeScript types for all data structures
│   └── data/                     # Pre-computed demo data (200 cases)
│       ├── aml_demo_cases.json
│       ├── review_drafts.json
│       ├── rag_contexts.json
│       ├── elliistic_dataset_summary.json
│       └── aml_demo_case_schema.json
├── pipeline/                     # Python data pipeline (the "data factory")
│   ├── config.py                 # All business rules, weights, thresholds
│   ├── data_loader.py            # Load Elliptic CSV files
│   ├── features.py               # Graph metrics, profile segmentation, network exposure
│   ├── rule_engine.py            # Rule detection, peer-group thresholds, risk scoring
│   ├── rag_builder.py            # PDF retrieval, RAG context construction
│   ├── llm_draft.py              # LLM API call + rule-based fallback
│   ├── export.py                 # Build frontend JSON files
│   ├── run_pipeline.py           # CLI entry point
│   └── requirements.txt
└── data/                         # Reference copy of the demo data
```

---

## How the pipeline works

### 1. Data input
The [Elliptic Bitcoin Transaction Graph](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set)
is a public research dataset with 203,769 transaction nodes, 234,355 directed edges, and 49 time steps
(~2 years of Bitcoin transactions). Each node has 165 anonymous features, a time step, and a research label
(licit / illicit / unknown).

### 2. Profile segmentation
Each transaction node is placed into one of three behavioral peer groups:
- **Low Activity / Retail-like** — low connectivity, limited local exposure
- **Active / Complex** — elevated connectivity or time-step density
- **High-Value / Flow-Intensive Proxy** — high out-degree or anonymized behavior intensity

Segmentation happens before rule detection, so a node is compared against a more reasonable peer group.

### 3. Rule engine
Five rules (R001–R005) check whether a node's metrics exceed peer-group percentile thresholds (P75, P90, P95).
The same out_degree value might trigger a rule in the "Retail-like" group but be perfectly normal in the
"Flow-Intensive" group. A sixth rule (R006, ERC20 interaction) is defined but unsupported by the Bitcoin dataset.

### 4. Risk scoring
Each triggered rule receives a segment-specific weight. Raw contributions are summed and capped at 100.
The score is a **review-priority signal**, not a probability of crime.

| Segment | R001 | R002 | R003 | R004 | R005 |
|---------|------|------|------|------|------|
| Low Activity | 25 | 25 | 25 | 20 | 15 |
| Active | 12 | 18 | 22 | 18 | 12 |
| Flow-Intensive | 18 | 18 | 28 | 28 | 18 |

### 5. RAG context
FATF and FinCEN AML guidance PDFs are chunked and indexed. For each case, relevant excerpts are retrieved
via keyword matching and included in the LLM context. This constrains the model to cite authoritative sources
rather than invent risk narratives.

### 6. LLM review draft
A structured prompt with strict evidence boundaries is sent to the LLM. The model must reference
rule_id and evidence_fields for every risk point. It cannot infer identity, KYC status,
source of funds, or final compliance conclusions. If the API is unavailable, a rule-based fallback is used.

### 7. Export
Three JSON files are generated for the frontend: case profiles, RAG contexts, and review drafts.
The frontend reads these directly — no database, no API calls at runtime.

---

## Running the pipeline

```bash
cd pipeline
pip install -r requirements.txt

# Download Elliptic dataset from Kaggle first, then:
python run_pipeline.py \
    --data-dir /path/to/elliptic/csvs \
    --output-dir ../frontend/data \
    --skip-llm  # Remove this flag to use DeepSeek API (set DEEPSEEK_API_KEY env var)
```

---

## Design decisions

**Why peer-group thresholds instead of global thresholds?**
Applying one threshold to every graph node would flag all highly-connected nodes and miss
suspicious behavior in quieter parts of the graph. Peer-group thresholds adapt to what is
"normal" for that segment.

**Why constrain the LLM rather than fine-tune it?**
Fine-tuning requires labeled AML review data that doesn't exist publicly.
Constraint-based generation is more transparent, easier to audit, and avoids
the model learning spurious correlations from training data.

**Why Elliptic and not a live chain?**
The Elliptic dataset provides a clean, reproducible benchmark. It has known limitations
(no amounts, no identity, no full paths) — but those limitations are exactly what make it
useful for a review-workflow demo. It forces the system to be honest about what it doesn't know.

---

## Limitations (explicit)

- Transaction-level review only — not wallet, entity, or customer-level
- No KYC, sanctions screening, or source-of-funds analysis
- BTC amounts are null (Elliptic features are anonymized)
- Distance to illicit cluster is local graph exposure within the sample, not full chain tracing
- Rule-based scores are prioritization signals, not probabilities
- LLM drafts are constrained to available evidence — they are drafts, not decisions

---

## Tech stack

**Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
**Pipeline:** Python 3.10+, pandas, PyPDF, networkx, OpenAI SDK
**Data:** Elliptic Bitcoin Transaction Graph (public Kaggle dataset)
**LLM:** DeepSeek (via OpenAI-compatible API)

---

## Why this project exists

I interned in a bank AML department where I saw analysts spend most of their time not on
judgment, but on evidence collection — tracing which fields triggered an alert,
checking whether rules were correctly applied, and documenting what was still missing.
This project is my attempt to build a workflow that treats those tasks as first-class concerns:
organize the evidence, show your work, and let the analyst decide.

It's a demo, not a product. But the thinking behind it — understand the business boundary first,
then decide what the technology should and shouldn't do — is what I'd bring to any fintech team.

---

## License

MIT
