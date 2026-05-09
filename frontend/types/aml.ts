export type RiskBand = 'low' | 'medium' | 'high' | 'critical'

export type AmlRule = {
  ruleId: string
  name: string
  severity: string
  scoreContribution?: number
  keyEvidence: string[]
}

export type EvidenceField = {
  field: string
  value: string
  interpretation: string
}

export type GuidanceSource = {
  sourceId: string
  title: string
  publisher: string
  page?: number
  chunkId?: string
  excerpt: string
}

export type ReviewDraft = {
  summary: string
  keySignals: string[]
  reviewQuestions: string[]
  boundary: string
}

export type DetailedReviewDraft = {
  risk_summary: string
  risk_summary_zh?: string
  triggered_reason_codes: {
    rule_id: string
    rule_name: string
    description: string
    description_zh?: string
  }[]
  suspicious_behavior_description: string[]
  suspicious_behavior_description_zh?: string[]
  evidence_references: {
    rule_id: string
    evidence: string
  }[]
  missing_information: string[]
  missing_information_zh?: string[]
  human_review_questions: string[]
  human_review_questions_zh?: string[]
  suggested_next_review_action: string
  suggested_next_review_action_zh?: string
  txId: number
  risk_score: number
  risk_level: string
  llm_status: string
  analyst_decision: string
}

export type AmlDemoCase = {
  id: string
  source: string
  caseType: string
  timeStep: number
  transactionIdMasked: string
  demoLabel: string
  riskBand: RiskBand
  modelScore: number
  modelSignals?: {
    scoreType: string
    modelScore: number
    riskBand: RiskBand
    scoreMeaning: string
    scoreBreakdown: AmlRule[]
  }
  transactionProfile: {
    inputCount: number
    outputCount: number
    btcIn: number | null
    btcOut: number | null
    feeBtc: number | null
    avgInputValueBtc: number | null
    avgOutputValueBtc: number | null
    transactionVolumeBucket: string
    flowPattern: string
    structureSummary: string
  }
  graphContext: {
    inDegree: number
    outDegree: number
    oneHopNeighborCount: number
    oneHopRiskNeighborShare: number
    twoHopNeighborCount: number
    twoHopRiskNeighborShare: number
    distanceToKnownIllicitCluster: string
    neighborAggregationSignal: string
    graphSummary: string
  }
  temporalBehavior: {
    timeStep: number
    totalTimeSteps: number
    approximateWindow: string
    activityStage: string
    peerPercentileTxCount: number | null
    peerPercentileValueOut: number | null
  }
  triggeredRules: AmlRule[]
  evidenceFields: EvidenceField[]
  retrievedGuidance: GuidanceSource[]
  reviewDraft: ReviewDraft
  constraints: string[]
}

export type DatasetSummary = {
  projectName: string
  source: string
  sourceType: string
  caseType: string
  reviewObject: string
  notReviewObject: string[]
  keyFactors: {
    nodeCount: number
    directedEdgeCount: number
    timeStepCount: number
    timeStepRange: number[]
    approximateWindowPerTimeStep: string
    rawFeatureCountIncludingTxIdAndTimeStep: number
    anonymousFeatureCount: number
    featureDisplayPolicy: string
  }
  labelDistribution: Record<string, number>
  graphSummary?: {
    graphType: string
    directedEdgeCount: number
    averageDirectedDegreeApprox: number
    weakComponentCount: string
    largestWeakComponentSize: string
    singleNodeComponentCount: string
    note: string
  }
  generatedDemoCaseSummary: {
    maxDemoCases: number
    riskBandDistribution: Record<string, number>
    demoLabelDistribution: Record<string, number>
    samplingPolicy: string
  }
  analysisOutputs: Record<string, string[]>
  ragSources: {
    sourceId: string
    title: string
    publisher: string
    url: string
  }[]
  limitations: string[]
}
