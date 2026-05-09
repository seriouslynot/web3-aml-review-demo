import { AmlDemoDashboard } from '../components/AmlDemoDashboard'
import cases from '../data/aml_demo_cases.json'
import datasetSummary from '../data/elliptic_dataset_summary.json'
import reviewDrafts from '../data/review_drafts.json'
import caseSchema from '../data/aml_demo_case_schema.json'
import type { AmlDemoCase, DatasetSummary, DetailedReviewDraft } from '../types/aml'

export default function Page() {
  return (
    <AmlDemoDashboard
      cases={cases as AmlDemoCase[]}
      datasetSummary={datasetSummary as DatasetSummary}
      reviewDrafts={reviewDrafts as DetailedReviewDraft[]}
      caseSchema={caseSchema as Record<string, unknown>}
    />
  )
}
