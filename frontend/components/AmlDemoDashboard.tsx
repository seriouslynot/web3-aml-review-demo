'use client'

import { useMemo, useState } from 'react'
import type { AmlDemoCase, DatasetSummary, DetailedReviewDraft, RiskBand } from '../types/aml'

type Props = {
  cases: AmlDemoCase[]
  datasetSummary: DatasetSummary
  reviewDrafts: DetailedReviewDraft[]
  caseSchema: Record<string, unknown>
  language?: 'en' | 'zh'
}

const bandStyles: Record<RiskBand, { badge: string; text: string; border: string; bar: string }> = {
  low: {
    badge: 'bg-[#e5efe6] text-[#315f3b]',
    text: 'text-[#315f3b]',
    border: 'border-[#94b79a]',
    bar: 'bg-[#6f9b72]',
  },
  medium: {
    badge: 'bg-[#f7e8bf] text-[#7d5b13]',
    text: 'text-[#7d5b13]',
    border: 'border-[#d7ad55]',
    bar: 'bg-[#d7ad55]',
  },
  high: {
    badge: 'bg-[#f6d2ad] text-[#8f431b]',
    text: 'text-[#8f431b]',
    border: 'border-[#d9894b]',
    bar: 'bg-[#d9894b]',
  },
  critical: {
    badge: 'bg-[#f3c4bd] text-[#8c231f]',
    text: 'text-[#8c231f]',
    border: 'border-[#c94e42]',
    bar: 'bg-[#c94e42]',
  },
}


const demoBoundaryItems = {
  en: [
    'wallet identity',
    'customer identity',
    'KYC profile',
    'final AML verdict',
  ],
  zh: [
    'wallet identity',
    'customer identity',
    'KYC profile',
    'final AML verdict',
  ],
}

const demoBoundaryNote = {
  en: 'Raw anonymous features are not displayed directly; they are transformed into review signals and evidence fields.',
  zh: '匿名原始特征不会直接展示；系统会将其整理为更容易阅读的复核信号和证据字段。',
}

const ruleCatalog = [
  {
    id: 'R001',
    name: 'High Frequency Transaction Proxy',
    brief: 'Elevated activity density within the same time window.',
    zhName: '高频活动信号',
    zhBrief: '同一时间窗口内交易活动明显集中。',
  },
  {
    id: 'R002',
    name: 'Short Lifecycle Dense Activity Proxy',
    brief: 'Rapid, concentrated activity over a short lifecycle window.',
    zhName: '短周期集中活动信号',
    zhBrief: '在较短时间内出现较密集的交易活动。',
  },
  {
    id: 'R003',
    name: 'High Outbound Flow Proxy',
    brief: 'Higher outbound links or fund-dispersion intensity.',
    zhName: '向外分散信号',
    zhBrief: '当前交易连接到较多下游节点，呈现向外分散特征。',
  },
  {
    id: 'R004',
    name: 'Abnormal Net Outflow Proxy',
    brief: 'Few inbound links with many outbound links, suggesting a net outflow pattern.',
    zhName: '净流出结构信号',
    zhBrief: '上游连接较少、下游连接较多，说明交易结构偏向向外扩散。',
  },
  {
    id: 'R005',
    name: 'Counterparty Complexity Proxy',
    brief: 'Complex neighboring nodes or local proximity to a known risk cluster.',
    zhName: '邻域复杂度信号',
    zhBrief: '周边交易结构较复杂，或在局部图谱中接近已知风险样本。',
  },
]

const severityRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const evidenceGlossary: Record<string, { label: string; explain: string }> = {
  total_degree: {
    label: 'Total graph degree',
    explain: 'The total number of inbound and outbound graph links for this transaction node.',
  },
  time_step_activity: {
    label: 'Time-window activity',
    explain: 'Activity density within the same Elliptic time step, used as a short-window concentration proxy.',
  },
  time_step: {
    label: 'Time step',
    explain: 'The Elliptic dataset time-window index, commonly interpreted as an approximate two-week window.',
  },
  out_degree: {
    label: 'Outbound degree',
    explain: 'The number of downstream graph links from this transaction node.',
  },
  in_degree: {
    label: 'Inbound degree',
    explain: 'The number of upstream graph links into this transaction node.',
  },
  out_in_ratio: {
    label: 'Outbound to inbound ratio',
    explain: 'The ratio between outbound and inbound links, used to flag unusual net-outflow structure.',
  },
  anonymized_behavior_intensity: {
    label: 'Behavior intensity',
    explain: 'A derived behavior-intensity proxy; the raw anonymized feature columns are not shown directly.',
  },
  neighbor_complexity: {
    label: 'Neighbor complexity',
    explain: 'A local graph-complexity proxy based on one-hop and two-hop neighborhood structure.',
  },
  one_hop_neighbor_count: {
    label: 'One-hop neighbors',
    explain: 'The number of directly connected neighboring nodes.',
  },
  two_hop_neighbor_count: {
    label: 'Two-hop neighbors',
    explain: 'The number of neighboring nodes reachable within two graph hops.',
  },
  distance_to_known_illicit_cluster: {
    label: 'Distance to known illicit cluster',
    explain: 'Local graph distance to a known illicit-labeled sample cluster; this is not full chain tracing.',
  },
}

const statusText: Record<string, string> = {
  'Pending Review': 'Pending human review',
  success: 'LLM draft generated',
  fallback: 'Fallback draft',
}

const statusTextZh: Record<string, string> = {
  'Pending Review': '等待人工复核',
  success: '已生成复核草稿',
  fallback: '使用备用草稿',
}


function zhSeverity(value: string) {
  const map: Record<string, string> = {
    low: '较低',
    medium: '中等',
    high: '较高',
    critical: '重点',
  }

  return map[value.toLowerCase()] ?? value
}

function displayCaseValue(value: string | number, isZh: boolean) {
  if (!isZh || typeof value !== 'string') return value

  const normalized = value.trim().toLowerCase()

  const map: Record<string, string> = {
    'licit for evaluation only': '合法样本（仅用于评估）',
    'illicit for evaluation only': '风险样本（仅用于评估）',
    'unknown for evaluation only': '未知样本（仅用于评估）',
    'transaction-level review': '交易节点级复核',
    'fan-out': '向外分散型',
  }

  return map[normalized] ?? value
}

function formatMetricNumber(value: number) {
  if (!Number.isFinite(value)) return String(value)
  if (Math.abs(value) >= 10000000) return value.toExponential(2)
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2)
}

function formatPlainNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDisplayValue(value: string | number) {
  if (typeof value === 'number') return formatMetricNumber(value)

  const trimmed = value.trim()
  const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/)
  if (percentMatch) return `${Number(percentMatch[1]).toFixed(2)}%`

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return formatMetricNumber(Number(trimmed))

  return value
}


function displayDatasetLabel(label: string, isZh: boolean) {
  if (!isZh) return readableLabel(label)

  const map: Record<string, string> = {
    licit: '合法样本',
    unknown: '未知',
    illicit: '风险样本',
  }

  return map[label] ?? readableLabel(label)
}



function displayBoundaryItem(item: string, isZh: boolean) {
  const normalized = item.trim()

  const enMap: Record<string, string> = {
    'wallet identity': 'Does not identify wallet ownership',
    'customer identity': 'Does not identify customer identity',
    'KYC profile': 'Does not include KYC information',
    'final AML verdict': 'Does not produce a final AML verdict',
    '不识别钱包真实归属': 'Does not identify wallet ownership',
    '不识别客户身份': 'Does not identify customer identity',
    '不包含 KYC 信息': 'Does not include KYC information',
    '不生成最终反洗钱结论': 'Does not produce a final AML verdict',
  }

  const zhMap: Record<string, string> = {
    'wallet identity': '不识别钱包真实归属',
    'customer identity': '不识别客户身份',
    'KYC profile': '不包含 KYC 信息',
    'final AML verdict': '不生成最终反洗钱结论',
    '不识别钱包真实归属': '不识别钱包真实归属',
    '不识别客户身份': '不识别客户身份',
    '不包含 KYC 信息': '不包含 KYC 信息',
    '不生成最终反洗钱结论': '不生成最终反洗钱结论',
  }

  if (!isZh) return enMap[normalized] ?? normalized
  return zhMap[normalized] ?? normalized
}


function displayFeaturePolicy(policy: string, isZh: boolean) {
  if (!isZh) return policy

  return '匿名原始特征不会直接展示；系统会将其整理为更容易阅读的复核信号和证据字段。'
}

function normalizeBand(value: string): RiskBand {
  const lower = value.toLowerCase()
  if (lower === 'low' || lower === 'medium' || lower === 'critical') return lower
  return 'high'
}

function readableLabel(label: string) {
  return label.replaceAll('_', ' ')
}

function normalizeRuleId(ruleId: string) {
  return ruleId.replace('-', '')
}

function getRuleSeverity(selectedCase: AmlDemoCase, ruleId: string) {
  const match = selectedCase.triggeredRules.find((rule) => normalizeRuleId(rule.ruleId) === ruleId)
  return match?.severity ?? 'medium'
}

function cleanReviewText(text: string) {
  return text
    .replaceAll('time_step_activity', 'time-window activity')
    .replaceAll('total_degree', 'total graph degree')
    .replaceAll('out_degree', 'outbound degree')
    .replaceAll('in_degree', 'inbound degree')
    .replaceAll('out_in_ratio', 'outbound-to-inbound ratio')
    .replaceAll('anonymized_behavior_intensity', 'behavior intensity proxy')
    .replaceAll('two_hop_neighbor_count', 'two-hop neighbor count')
    .replaceAll('one_hop_neighbor_count', 'one-hop neighbor count')
    .replaceAll('distance_to_known_illicit_cluster', 'distance to known illicit cluster')
    .replaceAll('neighbor_complexity', 'neighbor complexity')
    .replaceAll('—', '-')
}

function parseEvidence(evidence: string) {
  return evidence.split(',').map((part) => {
    const [rawKey, ...rest] = part.trim().split(':')
    const key = rawKey.trim()
    const value = rest.join(':').trim()
    const glossary = evidenceGlossary[key]
    return {
      key,
      value: formatDisplayValue(value),
      label: glossary?.label ?? readableLabel(key),
      explain: glossary?.explain ?? 'Structured evidence field generated by the notebook pipeline.',
    }
  })
}

function ruleNameForDraft(ruleId: string, draft: DetailedReviewDraft) {
  return draft.triggered_reason_codes.find((rule) => rule.rule_id === ruleId)?.rule_name ?? `${ruleId} rule`
}


function fullTxIdFromDraft(selectedDraft: DetailedReviewDraft | null) {
  return selectedDraft?.txId === undefined || selectedDraft?.txId === null ? null : String(selectedDraft.txId)
}


function maskTxId(txId: number) {
  const value = String(txId)
  return `${value.slice(0, 2)}...${value.slice(-2)}`
}

function chineseRiskSummary(selectedCase: AmlDemoCase, selectedDraft: DetailedReviewDraft | null) {
  const risk = selectedDraft?.risk_level ?? selectedCase.riskBand
  const score = selectedDraft?.risk_score ?? Math.round(selectedCase.modelScore * 100)
  const ruleNames = selectedDraft?.triggered_reason_codes.map((rule) => rule.rule_name).join('、')
    ?? selectedCase.triggeredRules.map((rule) => rule.name).join('、')

  return `交易 ${selectedCase.transactionIdMasked} 被标记为 ${risk} 风险，规则分数为 ${score}。当前判断主要来自局部交易图谱中的结构化代理信号，包括出入度关系、邻居暴露、短时间窗口活动密度以及触发规则：${ruleNames || '暂无规则名称'}。这些信号用于帮助分析师安排复核优先级，不代表最终反洗钱结论；仍需要结合客户身份、资金来源、交易目的和外部链上/链下信息进行人工审查。`
}

function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative ml-1 inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#d8c7b8] bg-white/90 text-[0.62rem] font-semibold normal-case tracking-normal text-[#8f6a4f] transition hover:border-[#8f6a4f] hover:bg-[#fff8f1]"
        aria-label={text}
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 border border-[#d8c7b8] bg-[#fffaf4] p-3 text-left text-xs font-normal leading-5 tracking-normal text-[#5f564f] shadow-[0_14px_34px_rgba(74,51,31,0.16)]">
          {text}
        </span>
      )}
    </span>
  )
}


function TxIdHover({
  masked,
  full,
  label,
  copiedLabel,
  copyLabel,
  maskedOnlyLabel,
}: {
  masked: string
  full?: string | number | null
  label: string
  copiedLabel: string
  copyLabel: string
  maskedOnlyLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const fullValue = full === undefined || full === null ? null : String(full)
  const canRevealFull = Boolean(fullValue && fullValue !== masked)

  async function copyTxId() {
    if (!fullValue) return

    try {
      await navigator.clipboard.writeText(fullValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  if (!canRevealFull) {
    return (
      <span className="font-semibold text-[#6d513e]" title={maskedOnlyLabel}>
        tx {masked}
      </span>
    )
  }

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false)
        setCopied(false)
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false)
        setCopied(false)
      }}
    >
      <button
        type="button"
        onClick={copyTxId}
        className="font-semibold text-[#6d513e] underline decoration-[#d8b18f] decoration-dotted underline-offset-4 transition hover:text-[#8f431b]"
        aria-label={label}
      >
        tx {masked}
      </button>

      {open && (
        <span className="absolute left-0 top-7 z-50 w-[18rem] border border-[#d8c7b8] bg-[#fffaf4] p-3 text-left text-xs leading-5 text-[#5f564f] shadow-[0_14px_34px_rgba(74,51,31,0.16)]">
          <span className="block font-semibold text-[#342a24]">{label}</span>
          <span className="mt-1 block break-all font-mono text-[0.72rem] text-[#6d513e]">{fullValue}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={copyTxId}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') copyTxId()
            }}
            className="mt-2 inline-flex cursor-pointer border border-[#dfd0c2] bg-white/82 px-2 py-1 text-[0.68rem] font-semibold text-[#6d513e]"
          >
            {copied ? copiedLabel : copyLabel}
          </span>
        </span>
      )}
    </span>
  )
}

function TimeStepHint({ value, text }: { value: number; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>time step {value}</span>
      <InfoHint text={text} />
    </span>
  )
}

function StatCard({
  label,
  value,
  detail,
  info,
}: {
  label: string
  value: string
  detail: string
  info?: string
}) {
  return (
    <div className="border border-[#e6d8c9] bg-white/76 p-4 shadow-[0_10px_28px_rgba(74,51,31,0.06)]">
      <p className="flex items-center text-[0.68rem] font-semibold tracking-[0.04em] text-[#9a7556]">
        {label}
        {info && <InfoHint text={info} />}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[#171717]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#7b7166]">{detail}</p>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-b border-[#eee4da] py-3 last:border-0">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#221b17]">{value}</p>
    </div>
  )
}

function MiniGraph({ selectedCase }: { selectedCase: AmlDemoCase }) {
  const nodes = useMemo(() => {
    const count = Math.min(18, Math.max(9, selectedCase.graphContext.oneHopNeighborCount || 9))
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count
      const radius = index % 3 === 0 ? 78 : index % 3 === 1 ? 58 : 94
      return {
        x: 120 + Math.cos(angle) * radius,
        y: 110 + Math.sin(angle) * radius,
        hot: index < Math.max(1, Math.ceil(count * selectedCase.graphContext.twoHopRiskNeighborShare)),
      }
    })
  }, [selectedCase])

  return (
    <svg viewBox="0 0 240 220" role="img" aria-label="Prepared transaction graph" className="h-full w-full">
      {nodes.map((node, index) => (
        <line
          key={`edge-${index}`}
          x1="120"
          y1="110"
          x2={node.x}
          y2={node.y}
          stroke={node.hot ? '#d4692d' : '#d7c7b9'}
          strokeWidth={node.hot ? 2 : 1}
          opacity={node.hot ? 0.78 : 0.5}
        />
      ))}
      {nodes.map((node, index) => (
        <circle
          key={`node-${index}`}
          cx={node.x}
          cy={node.y}
          r={node.hot ? 7 : 5}
          fill={node.hot ? '#d4692d' : '#b8aca1'}
          opacity={node.hot ? 0.95 : 0.68}
        />
      ))}
      <circle cx="120" cy="110" r="19" fill="#e28645" />
      <circle cx="120" cy="110" r="7" fill="#fff2e6" />
    </svg>
  )
}

function DetailDrawer({
  draft,
  selectedCase,
  onClose,
  t,
  status,
  isZh,
}: {
  draft: DetailedReviewDraft
  selectedCase: AmlDemoCase
  onClose: () => void
  t: (en: string, zh: string) => string
  status: (value: string) => string
  isZh: boolean
}) {
  const riskSummary = isZh ? (draft.risk_summary_zh || draft.risk_summary) : draft.risk_summary
  const nextAction = isZh ? (draft.suggested_next_review_action_zh || draft.suggested_next_review_action) : draft.suggested_next_review_action
  const suspiciousItems = isZh && draft.suspicious_behavior_description_zh
    ? draft.suspicious_behavior_description_zh
    : draft.suspicious_behavior_description
  const reviewQuestions = isZh && draft.human_review_questions_zh
    ? draft.human_review_questions_zh
    : draft.human_review_questions
  const fmt = (text: string) => isZh ? text : cleanReviewText(text)
  return (
    <div className="fixed inset-0 z-[1000] bg-[#17120f]/38 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-3xl flex-col border border-[#e0cfc0] bg-[#fffaf4] shadow-[0_24px_90px_rgba(41,28,20,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#eadccd] px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9a7556]">{t('Detailed LLM review', 'Detailed AI Review Draft')}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#171717]">{selectedCase.id}</h2>
              <p className="mt-1 text-sm text-[#746a60]">txId {draft.txId} · {status(draft.analyst_decision)}</p>
            </div>
            <button onClick={onClose} className="bg-[#171717] px-5 py-2.5 text-sm font-medium text-white">
              {t('Close', '关闭')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <section className="bg-[#fbefe5] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{t('1. Risk summary', '1. Risk Summary')}</p>
            <p className="mt-3 text-base leading-8 text-[#342a24]">{fmt(riskSummary)}</p>
          </section>

          <section className="mt-5 border border-[#e0cfc0] bg-white/76 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{t('2. Suggested next action', '2. Suggested Next Action')}</p>
            <p className="mt-3 text-base leading-8 text-[#342a24]">{fmt(nextAction)}</p>
            <div className="mt-4 grid gap-3 border-t border-[#eee4da] pt-4 text-sm text-[#5f564f] sm:grid-cols-3">
              <p>{t('Analyst status', '人工复核状态')}: <span className="font-semibold">{status(draft.analyst_decision)}</span></p>
              <p>{t('LLM status', '草稿状态')}: <span className="font-semibold">{status(draft.llm_status)}</span></p>
              <p>{t('Risk score', '规则评分')}: <span className="font-semibold">{draft.risk_score}</span></p>
            </div>
          </section>

          <section className="mt-5">
            <h3 className="text-lg font-semibold">{t('3. Triggered reason codes', '3. Triggered Rules')}</h3>
            <div className="mt-3 space-y-3">
              {draft.triggered_reason_codes.map((rule) => (
                <div key={rule.rule_id} className="border-l-4 border-[#d9894b] bg-white/76 px-4 py-3">
                  <p className="text-sm font-semibold">{rule.rule_id} · {rule.rule_name}</p>
                  <p className="mt-1 text-sm leading-6 text-[#6d6258]">{fmt(rule.description_zh || rule.description)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <DetailList title={t('4. Suspicious behavior', '4. Suspicious Behavior')} items={suspiciousItems.map(fmt)} />
          </section>

          <section className="mt-6">
            <h3 className="text-lg font-semibold">{t('5. Evidence dashboard', '5. Evidence Dashboard')}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6d6258]">
              {t('Open each rule to inspect the evidence fields used by the draft. The values are supporting signals, not final conclusions.', '点击每条规则查看草稿引用的证据字段。这里的数值只是支持信号，不是最终结论。')}
            </p>
            <div className="mt-3 space-y-3">
              {draft.evidence_references.map((item) => (
                <details key={`${item.rule_id}-${item.evidence}`} className="border border-[#eadccd] bg-white/70 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#8f431b]">
                          {item.rule_id} · {ruleNameForDraft(item.rule_id, draft)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#7b7166]">
                          {t('Metrics involved', 'Related metrics')}: {parseEvidence(item.evidence).map((field) => field.label).join(', ')}
                        </p>
                      </div>
                      <span className="shrink-0 border border-[#eadccd] bg-[#fff8f1] px-3 py-1 text-xs font-semibold text-[#6d513e]">
                        {t('Click to expand', 'Expand')}
                      </span>
                    </div>
                  </summary>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {parseEvidence(item.evidence).map((field) => (
                      <div key={`${item.rule_id}-${field.key}`} className="bg-[#fff8f1] p-2">
                        <p className="text-sm font-semibold">{field.label}: {field.value}</p>
                        <p className="mt-1 text-xs leading-5 text-[#6d6258]">{field.explain}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <DetailList title={t('6. Human review questions', '6. Human Review Questions')} items={reviewQuestions.map(fmt)} />
          </section>
        </div>
      </aside>
    </div>
  )
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border border-[#eadccd] bg-white/70 p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-[#5f564f]">{item}</li>
        ))}
      </ul>
    </div>
  )
}

function MethodologyPanel({
  datasetSummary,
  caseSchema,
  onBackToDemo,
  onBack,
  t,
  isZh,
}: {
  datasetSummary: DatasetSummary
  caseSchema: Record<string, unknown>
  onBackToDemo: () => void
  onBack: () => void
  t: (en: string, zh: string) => string
  isZh: boolean
}) {
  const [methodologyTab, setMethodologyTab] = useState<'part1' | 'part2' | 'rules' | 'rag'>('part1')
  const schemaTerms: [string, unknown][] = [
    ['caseType', caseSchema.caseType],
    ['riskBand', caseSchema.riskBand],
    ['modelScore', caseSchema.modelScore],
    ['transactionProfile', caseSchema.transactionProfile],
    ['graphContext', caseSchema.graphContext],
    ['temporalBehavior', caseSchema.temporalBehavior],
    ['triggeredRules', caseSchema.triggeredRules],
    ['evidenceFields', caseSchema.evidenceFields],
    ['reviewDraft', caseSchema.reviewDraft],
    ['constraints', caseSchema.constraints],
  ]
  const schemaTermLabel: Record<string, string> = {
    caseType: '案例类型',
    riskBand: '风险等级',
    modelScore: '模型评分',
    transactionProfile: '交易画像',
    graphContext: '图谱上下文',
    temporalBehavior: '时间行为',
    triggeredRules: '触发规则',
    evidenceFields: '证据字段',
    reviewDraft: '复核草稿',
    constraints: '约束边界',
  }
  const panelClass = (tab: 'part1' | 'part2' | 'rules' | 'rag') =>
    `border border-[#e5d8ca] bg-white/78 p-6 ${methodologyTab === tab ? 'block aml-panel-enter' : 'hidden'}`
  const tabButtonClass = (tab: 'part1' | 'part2' | 'rules' | 'rag') =>
    `w-full border px-4 py-3 text-left text-sm transition ${
      methodologyTab === tab
        ? 'border-[#d9894b] bg-[#171717] text-white shadow-[0_12px_28px_rgba(74,51,31,0.14)]'
        : 'border-[#eadccd] bg-white/72 text-[#5f564f] hover:border-[#d9894b]/70 hover:bg-[#fff8f1]'
    }`

  return (
    <main className="min-h-screen bg-[#f7f1ea] text-[#171717] aml-page-enter">
      <div className="mx-auto max-w-[1500px] px-5 py-5 md:px-8 lg:px-12">
        <header className="flex flex-col gap-4 border-b border-[#eadccd] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <a href={isZh ? '/zh?tab=projects&item=web3-aml-demo' : '/?tab=projects&item=web3-aml-demo'} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
            <button onClick={onBack} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Back', '返回')}</button>
          </div>
          <button onClick={onBackToDemo} className="bg-[#171717] px-4 py-2 text-sm text-white">{t('Back to demo', '返回 Demo')}</button>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[0.54fr_1.46fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9a7556]">{t('Methodology', '方法论')}</p>
            <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight text-[#2a1710]">{t('How this review demo is built', '这个复核 Demo 是怎么做出来的')}</h1>
            <p className="mt-6 text-base leading-8 text-[#665d55]">
              {t(
                'The methodology has two parts. First, it explains how public Elliptic transaction graph data is converted into prepared review cases. Second, it explains how the rule engine calculates review-priority signals.',
                '方法论分为两部分：先说明公开 Elliptic 交易图谱数据如何被加工成可展示的复核案例，再说明规则引擎如何计算复核优先级信号。'
              )}
            </p>
            <div className="mt-6 border border-[#eadccd] bg-white/70 p-5">
              <p className="text-sm font-semibold text-[#342a24]">{t('Important boundary', '重要边界')}</p>
              <p className="mt-2 text-sm leading-7 text-[#6d6258]">
                {t(
                  'This is transaction-level graph review. The reviewed object is a Bitcoin transaction node, not a wallet, customer, entity, KYC profile, or final AML verdict.',
                  '这是交易节点层面的图谱复核。被复核对象是一个比特币交易节点，不是钱包、客户、实体、KYC 档案，也不是最终反洗钱结论。'
                )}
              </p>
            </div>
            <nav className="mt-6 space-y-2">
              <button onClick={() => setMethodologyTab('part1')} className={tabButtonClass('part1')}>
                {t('Part 1 · Case construction', 'Part 1 · 案例构建')}
              </button>
              <button onClick={() => setMethodologyTab('part2')} className={tabButtonClass('part2')}>
                {t('Part 2 · Data signals', 'Part 2 · 数据信号')}
              </button>
              <button onClick={() => setMethodologyTab('rules')} className={tabButtonClass('rules')}>
                {t('Rule logic & risk score', '规则逻辑与风险分数')}
              </button>
              <button onClick={() => setMethodologyTab('rag')} className={tabButtonClass('rag')}>
                {t('RAG and boundaries', 'RAG 与边界')}
              </button>
            </nav>
          </div>

          <div className="grid gap-5">
            <section className={panelClass('part1')}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">Part 1</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{t('How the review cases are constructed', '一份复核案例是怎么生成的')}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5f564f]">
                {t(
                  'The notebook works as a data factory. It reads the Elliptic transaction graph, derives graph-review signals, applies rule logic, builds RAG context from AML guidance, and exports website-ready review cases. The website does not read raw CSV files or expose the anonymized feature dump.',
                  'Notebook 充当数据工厂的角色：读取 Elliptic 交易图谱，衍生图谱复核信号，应用规则逻辑，基于 AML 指引构建 RAG 上下文，最终导出网站可直接使用的复核案例。网站本身不读取原始 CSV 文件，也不直接暴露匿名特征数据。'
                )}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-7">
                {[
                  ['01', t('Data input', '数据输入'), t('Node features, directed edges, and research labels are loaded from Elliptic.', '从 Elliptic 数据集加载节点特征、有向边和研究标签。')],
                  ['02', t('Node profiling', '节点画像'), t('Each transaction node is placed into a coarse behavior segment.', '每笔交易节点被归入一个粗略的行为分段。')],
                  ['03', t('Rule engine', '规则引擎'), t('Peer-group thresholds trigger explainable reason codes.', '基于同群阈值触发可解释的规则代码。')],
                  ['04', t('Priority score', '优先级评分'), t('Rule hits become a bounded review-priority score and risk band.', '规则命中汇总为有上限的复核优先级评分和风险等级。')],
                  ['05', t('RAG context', 'RAG 上下文'), t('FATF and FinCEN guidance chunks are retrieved for constrained drafting.', '检索 FATF 和 FinCEN 指引片段，用于约束 LLM 草稿生成。')],
                  ['06', t('LLM draft', 'LLM 草稿'), t('The model writes a structured draft from evidence only.', '模型仅基于证据字段撰写结构化草稿。')],
                  ['07', t('Human review', '人工复核'), t('The output remains pending analyst review and is not a final decision.', '输出始终处于待人工复核状态，不是最终决策。')],
                ].map(([step, title, body]) => (
                  <div key={step} className="border border-[#eadccd] bg-[#fff8f1] p-3">
                    <p className="text-xs font-semibold text-[#d9894b]">{step}</p>
                    <p className="mt-2 text-sm font-semibold">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-[#6d6258]">{body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <InfoCard title={t('Raw graph input', '原始图谱输入')} body={t('The raw layer uses transaction-node features, directed transaction edges, and licit / illicit / unknown research labels.', '原始层使用交易节点特征、有向交易边，以及 licit / illicit / unknown 研究标签。')} />
                <InfoCard title={t('Derived review fields', '衍生复核字段')} body={t('The notebook derives in-degree, out-degree, total degree, time-window activity, out-in ratio, behavior intensity, and local graph exposure.', 'Notebook 衍生出入度、总度、时间窗活动、出入比、行为强度和局部图谱暴露等字段。')} />
                <InfoCard title={t('Website case format', '网站案例格式')} body={t('The front end receives prepared review cases with profiles, triggered rules, evidence fields, retrieved guidance, review draft, and constraints.', '前端接收预处理好的复核案例，包含画像、触发规则、证据字段、检索到的指引、复核草稿和约束边界。')} />
              </div>
            </section>

            <section className={panelClass('part1')}>
              <h2 className="text-2xl font-semibold tracking-tight">{t('Transaction node profiling', '交易节点画像')}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5f564f]">
                {t(
                  'The public dataset does not provide customer types, wallet ownership, KYC, or business purpose. The demo therefore adapts traditional customer segmentation into transaction-node profiling. Profiling happens before rule detection so that a node is compared against a more reasonable peer group.',
                  '公开数据集不提供客户类型、钱包归属、KYC 或业务目的。因此本 Demo 将传统的客户分群思路适配为交易节点画像。画像在规则检测之前完成，确保每个节点与更合理的同群进行比较。'
                )}
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <InfoCard title={t('Low Activity / Retail-like', '低活跃 / 散户型')} body={t('Low connectivity and limited local exposure. Sudden dense activity or fan-out behavior is treated more sensitively.', '连接度低、局部暴露有限。对突然出现的密集活动或向外分散行为更敏感。')} />
                <InfoCard title={t('Active / Complex', '活跃 / 复杂型')} body={t('High connectivity alone is not enough. The rule engine looks for combined signals such as outflow imbalance or graph exposure.', '仅高连接度不足以判定风险。规则引擎会进一步寻找流出失衡或图谱暴露等组合信号。')} />
                <InfoCard title={t('High-Value / Flow-Intensive Proxy', '高价值 / 大流量代理型')} body={t('A proxy segment based on out-degree, fan-out structure, and anonymized behavior intensity. It does not represent real BTC amount.', '基于出度、扇出结构和匿名行为强度的代理分段，不代表真实 BTC 金额。')} />
              </div>
            </section>

            <section className={panelClass('part2')}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">Part 2</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{t('How the rules are calculated', '规则是怎么算出来的')}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5f564f]">
                {t(
                  'First, each transaction node is assigned to a peer group based on its connectivity profile (Low Activity, Active, or Flow-Intensive). Then, within each group, we compute percentile thresholds (P75, P90, P95) for every metric. A rule triggers when a node\'s metric crosses its own group\'s threshold — this means the same out_degree might be flagged in one group but treated as normal in another. This peer-group approach avoids flagging every highly-connected node and missing suspicious behavior in quieter corners of the graph.',
                  '首先，每笔交易根据其连接特征被归入一个同群（低活跃/活跃/大流量）。然后，在每个同群内部，对每项指标计算百分位阈值（P75、P90、P95）。一条规则是否触发，不是看绝对值，而是看"这个节点的指标在其同群内排在什么位置"——同一个出度值，在散户型里可能触警，在大流量型里可能完全正常。这样做的好处是：不会因为图里存在大量高连接节点就把它们全标成高风险，也不会漏掉安静角落里那些行为异常的小节点。'
                )}
              </p>
              <div className="mt-4 border border-[#eadccd] bg-[#fffaf4] p-4 text-sm leading-6 text-[#5f564f]">
                <p className="font-semibold text-[#342a24]">{t('Example', '举个例子')}</p>
                <p className="mt-2">
                  {t(
                    'Suppose a node in the "Low Activity" group has out_degree = 5. The P90 for out_degree in this group might be 3, so 5 exceeds P90 → R003 triggers. But a node in the "Flow-Intensive" group with the same out_degree = 5 would likely not trigger R003, because the P90 in that group might be 20. The threshold adapts to what is "normal" for that peer group.',
                    '假设"散户型"同群中某个节点出度 = 5，而这个同群中出度的 P90 阈值是 3，那么 5 超过 P90 → R003 触发。但同样出度 = 5 落到"大流量型"同群，P90 可能是 20，完全不触发任何规则。阈值是跟着同群走的，"正常"的定义因群而异。'
                  )}
                </p>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  ['in_degree', t('Number of directed edges pointing into the transaction node.', '有多少条有向边指向该节点（即有多少笔前置交易把资金流向它）。'), t('Inbound graph-structure strength.', '越大说明该节点是多个上游交易的归集点。')],
                  ['out_degree', t('Number of directed edges pointing out from the transaction node.', '该节点指向多少下游交易（即把资金分散给了多少个后续交易）。'), t('Outbound graph-structure strength.', '越大说明该节点在向外分散资金。')],
                  ['total_degree', t('in_degree + out_degree.', '入度加出度。'), t('Overall connectivity of the transaction node.', '该节点在图中的整体连接量。')],
                  ['time_step_activity', t('Number of transactions in the same Elliptic time step.', '在同一个时间片窗口内发生的交易总数。'), t('Short-window activity-density proxy.', '用于衡量某一小段时间内交易密度是否异常集中。')],
                  ['out_in_ratio', t('out_degree / (in_degree + epsilon).', '出度除以入度（加一个极小值防止除零）。'), t('Fan-out or outbound imbalance proxy.', '比值越大，越像单向往外分散；接近 1 则出入较均衡。')],
                  ['two_hop_risk_neighbor_share', t('Share of illicit-labeled nodes among two-hop neighbors.', '两跳范围内被 Elliptic 标注为 illicit 的节点占比。'), t('Local graph exposure proxy.', '值越高说明该节点周边存在较多已知风险节点，局部暴露面更大。')],
                ].map(([metric, calculation, meaning]) => (
                  <div key={metric} className="border border-[#eadccd] bg-white/72 p-4">
                    <p className="text-sm font-semibold text-[#8f431b]">{metric}</p>
                    <p className="mt-2 text-sm leading-6 text-[#5f564f]">{calculation}</p>
                    <p className="mt-2 text-xs leading-5 text-[#7b7166]">{meaning}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={panelClass('rules')}>
              <h2 className="text-2xl font-semibold tracking-tight">{t('Rule trigger logic', '规则触发逻辑')}</h2>
              <div className="mt-4 grid gap-3">
                {[
                  ['R001', t('High transaction activity', '高交易活跃度'), t('total_degree > peer P90 OR time_step_activity > peer P90', '连接总数或同时间片内活动量显著高于同类节点（超出同群 90% 的节点）')],
                  ['R002', t('Dense activity window', '密集活动窗口'), t('time_step_activity > peer P75 AND total_degree > peer P75', '短时间内交易活动密度高，且整体连接数也偏高（两项均超出同群 75% 节点）')],
                  ['R003', t('High outbound flow proxy', '高流出代理'), t('out_degree > peer P90 OR anonymized_behavior_intensity > peer P95', '资金流出通道明显多于同类节点，或链上行为强度异常偏高')],
                  ['R004', t('Outbound imbalance proxy', '流出失衡代理'), t('out_in_ratio > peer P90 AND out_degree > peer P75', '流出连接远超流入连接，呈现典型的单向向外扩散结构')],
                  ['R005', t('Graph exposure and complexity', '图谱暴露与复杂度'), t('neighbor complexity or two-hop risky-neighbor share is elevated', '节点周边的交易网络结构复杂，或两跳范围内存在较多已知风险节点')],
                ].map(([ruleId, title, condition]) => (
                  <div key={ruleId} className="grid gap-3 border border-[#eadccd] bg-[#fff8f1] p-4 md:grid-cols-[0.12fr_0.34fr_0.54fr]">
                    <p className="text-sm font-semibold text-[#8f431b]">{ruleId}</p>
                    <p className="text-sm font-semibold text-[#342a24]">{title}</p>
                    <p className="text-sm leading-6 text-[#5f564f]">{condition}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={panelClass('rules')}>
              <h2 className="text-2xl font-semibold tracking-tight">{t('Risk score and priority band', '风险评分与优先级分档')}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5f564f]">
                {t(
                  'Each triggered rule receives a segment-specific weight. The raw rule contributions are summed and capped at 100. The resulting score is a review-priority signal, not a probability of crime.',
                  '每条触发规则根据节点所属分段获得不同权重，各规则贡献加总后封顶 100 分。最终评分是复核优先级信号，不是犯罪概率。'
                )}
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.82fr]">
                <div className="overflow-hidden border border-[#eadccd]">
                  <div className="grid grid-cols-4 bg-[#f3e8dc] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a5b45]">
                    <span>{t('Segment', '分段')}</span>
                    <span>{t('R001 / R002', 'R001 / R002')}</span>
                    <span>{t('R003 / R004', 'R003 / R004')}</span>
                    <span>{t('R005', 'R005')}</span>
                  </div>
                  {[
                    [t('Low Activity / Retail-like', '低活跃 / 散户型'), '25 / 25', '25 / 20', '15 / 0'],
                    [t('Active / Complex', '活跃 / 复杂型'), '12 / 18', '22 / 18', '12 / 0'],
                    [t('High-Value / Flow-Intensive Proxy', '高价值 / 大流量代理型'), '18 / 18', '28 / 28', '18 / 0'],
                  ].map((row) => (
                    <div key={row[0]} className="grid grid-cols-4 border-t border-[#eadccd] bg-white/72 px-4 py-3 text-sm text-[#5f564f]">
                      {row.map((cell) => <span key={cell}>{cell}</span>)}
                    </div>
                  ))}
                </div>
                <div className="border border-[#eadccd] bg-[#fff8f1] p-4">
                  <p className="text-sm font-semibold text-[#342a24]">{t('Priority bands', '优先级分档')}</p>
                  <div className="mt-3 space-y-2 text-sm text-[#5f564f]">
                    <p>{t('Critical: score >= 80', '重点关注：评分 ≥ 80')}</p>
                    <p>{t('High: score >= 60', '高风险：评分 ≥ 60')}</p>
                    <p>{t('Medium: score >= 30', '中风险：评分 ≥ 30')}</p>
                    <p>{t('Low: score below 30', '低风险：评分 < 30')}</p>
                  </div>
                  <p className="mt-4 border-t border-[#eadccd] pt-4 text-xs leading-5 text-[#7b7166]">
                    {t(
                      'Rule-aware and risk-band-aware sampling is then used to build representative demo cases instead of only selecting the highest-connectivity transactions.',
                      '随后使用基于规则和风险分档的分层抽样来构建具有代表性的 Demo 案例，而非仅选择连接度最高的交易。'
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className={panelClass('rag')}>
              <h2 className="text-2xl font-semibold tracking-tight">{t('Schema terms', '数据结构术语')}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {schemaTerms.map(([term, definition]) => (
                  <div key={term} className="border border-[#eadccd] bg-white/72 p-4">
                    <p className="text-sm font-semibold text-[#8f431b]">{isZh ? (schemaTermLabel[term] || term) : term}</p>
                    <p className="mt-2 text-sm leading-6 text-[#5f564f]">{isZh ? schemaDefinitionZh(definition) : schemaDefinition(definition)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={panelClass('rag')}>
              <h2 className="text-2xl font-semibold tracking-tight">{t('RAG and review boundaries', 'RAG 与复核边界')}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5f564f]">
                {t(
                  'The LLM does not read raw data freely or invent risk facts. It receives a controlled context containing transaction profile, triggered rules, evidence fields, retrieved FATF and FinCEN guidance chunks, and human review constraints. It must not infer identity, KYC status, source of funds, or a final compliance conclusion.',
                  'LLM 不会自由读取原始数据，也不允许编造风险事实。它接收的是一个受控上下文，仅包含交易画像、触发规则、证据字段、检索到的 FATF/FinCEN 指引片段，以及人工复核约束。LLM 不得推断身份、KYC 状态、资金来源或做出最终合规结论。'
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {datasetSummary.limitations.map((item) => (
                  <span key={item} className="bg-[#f3e8dc] px-3 py-2 text-xs leading-5 text-[#655549]">{item}</span>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-[#eadccd] bg-[#fff8f1] p-4">
      <p className="text-sm font-semibold text-[#342a24]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#6d6258]">{body}</p>
    </div>
  )
}

const schemaDefZh: Record<string, string> = {
  'Transaction-level review': '交易节点级复核',
  'rule-based priority score between 0 and 1': '0-1 之间的规则优先评分',
  'graph in-degree': '图谱入度',
  'graph out-degree': '图谱出度',
  'number if available': '如有则显示数值',
  'string if available': '如有则显示文本',
  'evidence-bound rule list': '绑定证据的规则列表',
  'displayable evidence fields': '可展示的证据字段',
  'structured review draft': '结构化复核草稿',
  'review boundaries': '复核边界',
}

function schemaDefinition(definition: unknown) {
  if (typeof definition === 'string') return definition
  if (Array.isArray(definition)) return definition.join(' / ')
  if (definition && typeof definition === 'object') {
    return Object.entries(definition)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' / ') : String(value)}`)
      .join('; ')
  }
  return 'Structured field used to keep the review case display consistent.'
}

function schemaDefinitionZh(definition: unknown) {
  if (typeof definition === 'string') return schemaDefZh[definition] || definition
  if (Array.isArray(definition)) return definition.map((v) => schemaDefZh[String(v)] || v).join(' / ')
  if (definition && typeof definition === 'object') {
    return Object.entries(definition)
      .map(([key, value]) => {
        const zhKey = schemaDefZh[key] || key
        const zhValue = Array.isArray(value)
          ? value.map((v) => schemaDefZh[String(v)] || v).join(' / ')
          : schemaDefZh[String(value)] || String(value)
        return `${zhKey}: ${zhValue}`
      })
      .join('; ')
  }
  return '用于保持复核案例展示一致性的结构化字段。'
}

export function AmlDemoDashboard({ cases, datasetSummary, reviewDrafts, caseSchema, language = 'en' }: Props) {
  const isZh = language === 'zh'
  const t = (en: string, zh: string) => (isZh ? zh : en)
  const status = (value: string) => (isZh ? statusTextZh[value] : statusText[value]) ?? value
  const [selectedCase, setSelectedCase] = useState<AmlDemoCase | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'demo' | 'methodology' | 'why-dataset'>('demo')

  const draftByMaskedTx = useMemo(() => {
    return new Map(reviewDrafts.map((draft) => [maskTxId(draft.txId), draft]))
  }, [reviewDrafts])

  const selectedDraft = selectedCase ? draftByMaskedTx.get(selectedCase.transactionIdMasked) ?? null : null
  const casesWithDetailedDraft = useMemo(
    () => cases.filter((item) => draftByMaskedTx.has(item.transactionIdMasked)),
    [cases, draftByMaskedTx],
  )
  const randomCasePool = casesWithDetailedDraft.length > 0 ? casesWithDetailedDraft : cases
  const selectedBand = normalizeBand(selectedDraft?.risk_level ?? selectedCase?.riskBand ?? 'high')
  const styles = bandStyles[selectedBand]

  const labelDistribution = Object.entries(datasetSummary.labelDistribution)
  const ruleNames = selectedDraft?.triggered_reason_codes.map((rule) => rule.rule_name) ?? []

  function drawRandomCase() {
    const next = randomCasePool[Math.floor(Math.random() * randomCasePool.length)]
    setSelectedCase(next)
    setDetailOpen(false)
    setActiveTab('demo')
  }

  function goBack() {
    window.location.href = isZh ? '/zh?tab=projects' : '/?tab=projects'
  }

  if (activeTab === 'methodology') {
    return (
      <MethodologyPanel
        datasetSummary={datasetSummary}
        caseSchema={caseSchema}
        onBackToDemo={() => setActiveTab('demo')}
        onBack={goBack}
        t={t}
        isZh={isZh}
      />
    )
  }

  if (activeTab === 'why-dataset') {
    return (
      <main className="min-h-screen bg-[#f7f1ea] text-[#171717] aml-page-enter">
        <div className="mx-auto max-w-[1680px] px-5 py-5 md:px-8 lg:px-12">
          <header className="flex flex-col gap-4 border-b border-[#eadccd] pb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <a href={isZh ? '/zh' : '/'} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
              <button onClick={goBack} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Back', '返回')}</button>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => setActiveTab('demo')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-[#4e443d]">Demo</button>
              <button onClick={() => setActiveTab('methodology')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-[#4e443d]">{t('Methodology', '方法论')}</button>
              <button onClick={() => setActiveTab('why-dataset')} className="bg-[#171717] px-4 py-2 text-white">{t('Why this dataset?', '为什么选择这个数据集？')}</button>
            </nav>
          </header>

          <section className="py-10">
            <div className="mx-auto max-w-4xl">
              <p className="text-xs font-semibold tracking-[0.22em] text-[#9a7556]">{t('Why this dataset?', '为什么选择这个数据集？')}</p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight text-[#2a1710]">{t('Why the Elliptic dataset', '为什么选择 Elliptic 数据集')}</h1>

              <div className="mt-10 space-y-6 text-base leading-8 text-[#5f564f]">
                <p>
                  {t(
                    'Elliptic Bitcoin Transaction Graph is not the richest possible blockchain dataset. That is exactly why it is useful for this demo.',
                    'Elliptic Bitcoin Transaction Graph 并不是信息最完整的链上数据集。恰恰因为它不完整，它才适合这个 Demo。'
                  )}
                </p>
                <p>
                  {t(
                    'It gives enough structure to reason about risk: transactions are represented as nodes, fund-flow relationships are represented as directed edges, and each transaction sits inside a time step. This makes it possible to ask questions that are closer to real AML review than a simple table classification problem: does this transaction mainly receive or distribute flow, how quickly does its local network expand, and whether it sits close to known high-risk clusters?',
                    '它提供了足够的图结构：交易被表示为节点，交易之间的资金流向被表示为有向边，每笔交易也被放在一个时间片里。这样一来，复核问题就不只是"这个样本是不是高风险"，而是可以进一步拆开：这笔交易更像接收资金还是向外分散？它的局部网络扩张得快不快？它离已知风险样本簇有多近？'
                  )}
                </p>
                <p>
                  {t(
                    'At the same time, the dataset is deliberately limited. It does not provide customer identity, KYC records, wallet ownership, sanctions-list matching, or complete transaction paths. Monetary values are also not available in the public feature set used here. These limits make it unsuitable for final AML decisions, but suitable for a more realistic analyst-triage exercise: how can incomplete graph evidence be organized into reviewable signals?',
                    '同时，它的边界也很清楚。公开数据集中没有客户身份、KYC 记录、钱包真实归属、制裁名单匹配，也没有完整链上路径；这里使用的公开特征也不包含可直接解释的金额字段。这意味着它不适合直接生成最终 AML 结论，但很适合做一个更接近真实工作的 analyst triage：在信息不完整的情况下，如何把图谱证据整理成可以复核的信号。'
                  )}
                </p>
                <p>
                  {t(
                    'The demo is therefore not trying to prove that a model can detect money laundering on its own. It shows how a transaction-level review workflow can be reconstructed from public graph data: graph signals become rule triggers, rule triggers become evidence fields, and evidence fields become an AI-assisted review draft that still requires human judgment.',
                    '因此，这个 Demo 不是想证明模型可以独立"识别洗钱"，而是展示一个交易级复核流程如何被重构：图谱信号如何变成规则命中，规则命中如何变成证据字段，证据字段又如何进入一份 AI 辅助的复核草稿，并最终交还给人工判断。'
                  )}
                </p>
                <p className="text-[#3f332b]">
                  {t(
                    'In other words, Elliptic is useful not because it answers everything, but because it forces the system to be honest about what it knows, what it does not know, and what should be escalated for review.',
                    '换句话说，Elliptic 的价值不在于它回答了一切，而在于它迫使系统诚实地说明：我们知道什么，不知道什么，哪些信号只能用于排序，哪些问题必须升级给人工复核。'
                  )}
                </p>
              </div>

              <div className="mt-10 grid gap-6 md:grid-cols-2">
                <div className="border border-[#eadccd] bg-[#fbf4ec] p-6">
                  <p className="text-sm font-semibold tracking-[0.2em] text-[#9a7556]">
                    {t('What it enables', '它支持什么')}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-[#5f564f]">
                    {[
                      t('Transaction-as-node review', '交易节点级复核'),
                      t('Directed flow relationship', '有向资金流关系'),
                      t('Time-step context', '时间片上下文'),
                      t('Local graph exposure', '局部图谱暴露'),
                    ].map((item) => (
                      <li key={item} className="border-l border-[#d9a05f] pl-3">{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border border-[#eadccd] bg-[#fffaf4] p-6">
                  <p className="text-sm font-semibold tracking-[0.2em] text-[#9a7556]">
                    {t('What it cannot support', '它不支持什么')}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-[#5f564f]">
                    {[
                      t('Customer identity', '客户身份识别'),
                      t('KYC profile', 'KYC 档案'),
                      t('Wallet ownership', '钱包真实归属'),
                      t('Final AML verdict', '最终 AML 结论'),
                    ].map((item) => (
                      <li key={item} className="border-l border-[#c8b8a8] pl-3">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (!selectedCase) {
    return (
      <main className="min-h-screen bg-[#f7f1ea] text-[#171717] aml-page-enter">
        <div className="mx-auto max-w-[1680px] px-5 py-5 md:px-8 lg:px-12">
          <header className="hidden flex-col gap-4 border-b border-[#eadccd] pb-5 md:flex md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <a href={isZh ? '/zh' : '/'} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
              <button onClick={goBack} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Back', '返回')}</button>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => setActiveTab('demo')} className="bg-[#171717] px-4 py-2 text-white">Demo</button>
              <button onClick={() => setActiveTab('methodology')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-[#4e443d]">{t('Methodology', '方法论')}</button>
              <button onClick={() => setActiveTab('why-dataset')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-[#4e443d]">{t('Why this dataset?', '为什么这个数据集？')}</button>
            </nav>
          </header>

          <section id="demo" className="hidden min-h-[calc(100vh-92px)] gap-8 py-8 md:grid lg:grid-cols-[0.74fr_1.26fr]">
            <div className="flex flex-col justify-center">
              <p className="mb-4 w-fit border border-[#eadccd] bg-white/62 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#7c5c2e]">
                {t('Demo · Elliptic Bitcoin Transaction Graph', 'Demo · Elliptic 比特币交易图谱')}
              </p>
              <h1 className="max-w-xl text-5xl font-semibold leading-[1.03] tracking-tight text-[#2a1710] md:text-7xl">
                {t('Web3 Transaction Risk Review Assistant', 'Web3 交易风险复核助手')}
              </h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-[#6b6258]">
                {t('This demo uses the public Elliptic transaction graph to show how a transaction-level risk review can be structured: rules are triggered, evidence fields are organized, and an AI draft supports human review.', '这个 Demo 基于公开的 Elliptic 交易图谱，展示一笔交易级风险复核可以如何被结构化：规则如何触发，证据字段如何整理，以及 AI 草稿如何辅助人工复核。')}
              </p>
              <button
                onClick={drawRandomCase}
                className="mt-8 w-full max-w-sm bg-[#dc8d52] px-6 py-4 text-left text-lg font-semibold text-white shadow-[0_16px_34px_rgba(164,91,45,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ce7c41]"
              >
                {t('Open a random case', '随机查看一个案例')}
              </button>
              <p className="mt-3 max-w-sm text-center text-xs text-[#8a8178]">{t('Open 1 of', '从')} {cases.length} {t('prepared cases', '个预处理样本中随机打开 1 个')}</p>
            </div>

            <div id="about-data" className="grid content-center gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={t('Transaction nodes', '交易节点')} value={formatPlainNumber(datasetSummary.keyFactors.nodeCount)} detail={t('Each node represents one Bitcoin transaction sample in the Elliptic public graph.', '每个节点代表公开 Elliptic 图谱中的一笔比特币交易样本。')} />
              <StatCard label={t('Directed edges', '有向边')} value={formatPlainNumber(datasetSummary.keyFactors.directedEdgeCount)} detail={t('Each directed edge represents a transaction-flow link between two transaction samples.', '每条有向边表示两个交易样本之间的资金流向连接。')} />
              <StatCard label={t('Time steps', '时间片')} value={String(datasetSummary.keyFactors.timeStepCount)} detail={t('The dataset is split into 49 time steps; each step is roughly a two-week period.', 'Elliptic 数据集将约两年的比特币交易图谱按时间切分为 49 个时间片，每片约覆盖两周窗口。49 是该数据集本身的划分方式，并非 Demo 自行决定。')} />
              <StatCard label={t('Prepared samples', '预处理样本')} value={String(cases.length)} detail={t('A small review queue prepared from the dataset for this interactive demo.', '从数据集中预处理出的演示复核队列，用于随机查看案例。')} />
              <div className="border border-[#e6d8c9] bg-white/76 p-5 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">{t('Dataset label distribution', '数据集标签分布')}</p>
                <div className="mt-4 space-y-3">
                  {labelDistribution.map(([label, value]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-[#5a4b40]">{displayDatasetLabel(label, isZh)}</span>
                        <span className="font-semibold">{formatDisplayValue(value)}</span>
                      </div>
                      <div className="h-2 bg-[#efe4d9]">
                        <div className="h-2 bg-[#d9894b]" style={{ width: `${(value / datasetSummary.keyFactors.nodeCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#e6d8c9] bg-white/76 p-5 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">{t('Review boundary', '演示边界')}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {datasetSummary.notReviewObject.map((item) => (
                    <span key={item} className="bg-[#f1e6dc] px-3 py-1.5 text-xs text-[#6b5546]">{isZh ? displayBoundaryItem(item, true) : item}</span>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-[#746a60]">{displayFeaturePolicy(datasetSummary.keyFactors.featureDisplayPolicy, isZh)}</p>
              </div>
            </div>
          </section>

          <section className="flex min-h-screen flex-col justify-center py-8 md:hidden aml-panel-enter">
            <div className="absolute left-5 top-5 flex gap-2">
              <a href={isZh ? '/zh' : '/'} className="border border-[#dfd0c2] bg-white/72 px-3 py-2 text-xs font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
              <button onClick={goBack} className="border border-[#dfd0c2] bg-white/72 px-3 py-2 text-xs text-[#4e443d]">{t('Back', '返回')}</button>
            </div>
            <p className="mb-4 w-fit border border-[#eadccd] bg-white/62 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7c5c2e]">
              {t('Demo · Mobile preview', 'Demo · 手机预览')}
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#2a1710]">
              {t('Web3 Transaction Risk Review Assistant', 'Web3 交易风险复核助手')}
            </h1>
            <p className="mt-5 text-sm leading-7 text-[#6b6258]">
              {t('Draw one prepared review case. The full graph dashboard, rule explanations, and detailed review are optimized for PC/Mac.', '随机抽取一个预处理复核案例。完整图谱看板、规则解释和详细复核内容更适合在 PC/Mac 上查看。')}
            </p>
            <button
              onClick={drawRandomCase}
              className="mt-8 w-full bg-[#dc8d52] px-6 py-4 text-left text-lg font-semibold text-white shadow-[0_16px_34px_rgba(164,91,45,0.22)]"
            >
              {t('Open a random case', '随机查看一个案例')}
            </button>
            <p className="mt-3 text-center text-xs text-[#8a8178]">{t('Open 1 of', '从')} {cases.length} {t('prepared cases', '个预处理样本中随机打开 1 个')}</p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f1ea] text-[#171717] aml-page-enter">
      <div className="mx-auto max-w-[1720px] px-5 py-5 md:px-8 lg:px-10">
        <section className="min-h-screen py-6 md:hidden aml-panel-enter">
          <div className="flex items-center justify-between gap-3 border-b border-[#eadccd] pb-4">
            <div className="flex gap-2">
              <a href={isZh ? '/zh' : '/'} className="border border-[#dfd0c2] bg-white/72 px-3 py-2 text-xs font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
              <button onClick={goBack} className="border border-[#dfd0c2] bg-white/72 px-3 py-2 text-xs text-[#4e443d]">{t('Back', '返回')}</button>
            </div>
            <button onClick={drawRandomCase} className="bg-[#dc8d52] px-3 py-2 text-xs font-semibold text-white">{t('Draw again', '重新抽取')}</button>
          </div>

          <div className="mt-6 border border-[#e5d8ca] bg-white/84 p-5 shadow-[0_18px_50px_rgba(74,51,31,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{t('Selected case', '当前样本')}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{selectedCase.id}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#746a60]">
              <TxIdHover
                masked={selectedCase.transactionIdMasked}
                full={fullTxIdFromDraft(selectedDraft)}
                label={t('Full transaction id', '完整交易 ID')}
                copyLabel={t('Copy tx id', '复制交易 ID')}
                copiedLabel={t('Copied', '已复制')}
                maskedOnlyLabel={t(
                  'Only the masked transaction id is available for this prepared case.',
                  '当前样本只保留了脱敏交易 ID，未提供完整 txId。'
                )}
              />
              <span className="text-[#b7a798]">·</span>
              <TimeStepHint
                value={selectedCase.timeStep}
                text={t(
                  'Elliptic divides the public transaction graph into 49 time steps. Each step is roughly a two-week window, so cases may appear in different windows such as 2, 38, or 42.',
                  'time step 是 Elliptic 数据集里的时间片编号，不是自然日期。数据集一共被切分为 49 个时间片，每个时间片大约对应两周，所以不同案例可能来自 time step 2、38 或 42。'
                )}
              />
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={`border ${styles.border} bg-[#fff8f1] p-4`}>
                <p className="text-xs text-[#8a8178]">{t('Predicted priority', '复核优先级')}</p>
                <p className={`mt-2 text-2xl font-semibold capitalize ${styles.text}`}>{isZh ? zhSeverity(selectedDraft?.risk_level ?? selectedCase.riskBand) : selectedDraft?.risk_level ?? selectedCase.riskBand}</p>
              </div>
              <div className="border border-[#eadccd] bg-white/70 p-4">
                <p className="text-xs text-[#8a8178]">{t('Risk score', '规则评分')}</p>
                <p className="mt-2 text-2xl font-semibold">{selectedDraft?.risk_score ?? Math.round(selectedCase.modelScore * 100)}</p>
              </div>
            </div>
            <div className="mt-5">
              <FactRow label={t('Ground-truth sample label', '数据集标签')} value={displayCaseValue(readableLabel(selectedCase.demoLabel), isZh)} />
              <FactRow label={t('Analyst status', '人工复核状态')} value={status(selectedDraft?.analyst_decision ?? 'Pending Review')} />
              <FactRow label={t('Case type', '复核对象')} value={displayCaseValue(selectedCase.caseType, isZh)} />
            </div>
          </div>

          <div className="mt-5 border border-[#e5d8ca] bg-white/86 p-5 shadow-[0_18px_50px_rgba(74,51,31,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{t('Risk summary', 'Risk Summary')}</p>
            <p className="mt-3 text-sm leading-7 text-[#342a24]">
              {selectedDraft
                ? (isZh ? (selectedDraft.risk_summary_zh || cleanReviewText(selectedDraft.risk_summary)) : cleanReviewText(selectedDraft.risk_summary))
                : selectedCase.reviewDraft.summary}
            </p>
          </div>

          <div className="mt-5 border border-[#eadccd] bg-[#fff8f1] p-4 text-sm leading-7 text-[#6d6258]">
            {t('Richer graph interpretation, triggered-rule severity, evidence drill-down, and detailed LLM review are available on PC/Mac.', '更完整的图谱解释、规则严重程度、证据展开和详细 AI 复核内容请在 PC/Mac 上查看。')}
          </div>
        </section>

        <div className="hidden md:block aml-panel-enter">
        <header className="flex flex-col gap-4 border-b border-[#eadccd] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <a href={isZh ? '/zh' : '/'} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm font-semibold text-[#6d513e]">{t('Home', '首页')}</a>
            <button onClick={goBack} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Back', '返回')}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveTab('methodology')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Methodology', '方法论')}</button>
            <button onClick={() => setActiveTab('why-dataset')} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Why this dataset?', '为什么这个数据集？')}</button>
            <button onClick={drawRandomCase} className="bg-[#dc8d52] px-4 py-2 text-sm font-semibold text-white">{t('Draw another case', '再抽一个案例')}</button>
            <button onClick={() => setSelectedCase(null)} className="border border-[#dfd0c2] bg-white/72 px-4 py-2 text-sm text-[#4e443d]">{t('Back to data overview', '返回数据概览')}</button>
          </div>
        </header>

        <section className="grid items-stretch gap-5 py-6 xl:min-h-[calc(100vh-118px)] xl:grid-cols-[0.28fr_0.42fr_0.30fr]">
          <aside className="flex h-full flex-col gap-5">
            <section className="border border-[#e5d8ca] bg-white/82 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">{t('Selected case', '当前样本')}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">{selectedCase.id}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#746a60]">
              <TxIdHover
                masked={selectedCase.transactionIdMasked}
                full={fullTxIdFromDraft(selectedDraft)}
                label={t('Full transaction id', '完整交易 ID')}
                copyLabel={t('Copy tx id', '复制交易 ID')}
                copiedLabel={t('Copied', '已复制')}
                maskedOnlyLabel={t(
                  'Only the masked transaction id is available for this prepared case.',
                  '当前样本只保留了脱敏交易 ID，未提供完整 txId。'
                )}
              />
              <span className="text-[#b7a798]">·</span>
              <TimeStepHint
                value={selectedCase.timeStep}
                text={t(
                  'Elliptic divides the public transaction graph into 49 time steps. Each step is roughly a two-week window, so cases may appear in different windows such as 2, 38, or 42.',
                  'time step 是 Elliptic 数据集里的时间片编号，不是自然日期。数据集一共被切分为 49 个时间片，每个时间片大约对应两周，所以不同案例可能来自 time step 2、38 或 42。'
                )}
              />
            </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className={`border ${styles.border} bg-[#fff8f1] p-4`}>
                  <p className="text-xs text-[#8a8178]">{t('Predicted priority', '复核优先级')}</p>
                  <p className={`mt-2 text-2xl font-semibold capitalize ${styles.text}`}>{isZh ? zhSeverity(selectedDraft?.risk_level ?? selectedCase.riskBand) : selectedDraft?.risk_level ?? selectedCase.riskBand}</p>
                </div>
                <div className="border border-[#eadccd] bg-white/70 p-4">
                  <p className="text-xs text-[#8a8178]">{t('Risk score', '规则评分')}</p>
                  <p className="mt-2 text-2xl font-semibold">{selectedDraft?.risk_score ?? Math.round(selectedCase.modelScore * 100)}</p>
                </div>
              </div>
              <div className="mt-5">
                <FactRow label={t('Ground-truth sample label', '数据集标签')} value={displayCaseValue(readableLabel(selectedCase.demoLabel), isZh)} />
                <FactRow label={t('Analyst status', '人工复核状态')} value={status(selectedDraft?.analyst_decision ?? 'Pending Review')} />
                <FactRow label={t('LLM status', '草稿状态')} value={status(selectedDraft?.llm_status ?? 'fallback')} />
                <FactRow label={t('Case type', '复核对象')} value={displayCaseValue(selectedCase.caseType, isZh)} />
              </div>
            </section>

            <section className="flex-1 border border-[#e5d8ca] bg-white/82 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)]">
              <h2 className="text-lg font-semibold tracking-tight">{t('Triggered rule labels', '触发的复核规则')}</h2>
              <div className="mt-4 space-y-2">
                {ruleCatalog.map((rule) => {
                  const active = ruleNames.includes(rule.name) || selectedCase.triggeredRules.some((hit) => normalizeRuleId(hit.ruleId) === rule.id)
                  const severity = getRuleSeverity(selectedCase, rule.id)
                  const rank = active ? severityRank[severity] ?? 2 : 0
                  const activeClass =
                    rank >= 3
                      ? 'border-[#d36a38] bg-[linear-gradient(90deg,#fff1e5,#f4c19c)] text-[#5f2b16]'
                      : rank === 2
                        ? 'border-[#d7ad55] bg-[linear-gradient(90deg,#fff8e8,#f4dfa8)] text-[#604913]'
                        : 'border-[#e6d8c9] bg-white/62 text-[#9a8f84]'

                  return (
                    <div key={rule.id} className={`border px-3 py-3 transition ${activeClass}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{rule.id} · {isZh ? rule.zhName : rule.name}</p>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em]">{active ? (isZh ? zhSeverity(severity) : severity) : t('not hit', '未触发')}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 opacity-80">{isZh ? rule.zhBrief : rule.brief}</p>
                    </div>
                  )
                })}
              </div>
            </section>

          </aside>

          <section className="flex h-full flex-col gap-5">
            <div className="grid gap-5 md:grid-cols-3">
              <StatCard
                label={t('Input degree', '入向连接')}
                value={formatDisplayValue(selectedCase.graphContext.inDegree)}
                detail={t('Inbound graph links', '指向当前样本的上游连接数量')}
                info={t('How many earlier transaction nodes point into this case. A value of 0 means the prepared local graph does not show an inbound link for this node.', '有多少上游交易节点指向当前案例。0 表示准备好的局部图谱中没有观察到入边。')}
              />
              <StatCard
                label={t('Output degree', '出向连接')}
                value={formatDisplayValue(selectedCase.graphContext.outDegree)}
                detail={String(displayCaseValue(selectedCase.transactionProfile.flowPattern, isZh))}
                info={t('How many later transaction nodes this case points to. Higher values can suggest fund splitting or outward dispersion.', '当前节点指向多少下游交易节点。数值较高可能表示资金分散或向外扩散。')}
              />
              <StatCard
                label={t('Two-hop neighbors', '两跳邻域')}
                value={formatDisplayValue(selectedCase.graphContext.twoHopNeighborCount)}
                detail={`${formatDisplayValue(selectedCase.graphContext.twoHopRiskNeighborShare * 100)}% ${t('risk-neighbor share', '风险邻域占比')}`}
                info={t('How many nodes are reachable within two graph steps. This helps show whether the transaction sits near a larger local network.', '两步图谱距离内可到达的节点数量，用于观察该交易是否处在更大的局部网络附近。')}
              />
            </div>

            <section className="grid gap-5 border border-[#e5d8ca] bg-white/82 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)] md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t('Graph exposure dashboard', '局部交易网络')}</h2>
                <p className="mt-2 text-sm leading-6 text-[#6d6258]">
                  {t('Read this as a local transaction-neighborhood map. The center is the selected transaction; surrounding nodes are nearby transactions from the prepared graph.', '这里展示的是当前交易在预处理图谱中的局部邻域。中心节点代表当前样本，周围节点代表相邻的一跳或两跳交易。')}
                </p>
                <div className="mt-4 aspect-[1.18/1] bg-[#fbf5ef]">
                  <MiniGraph selectedCase={selectedCase} />
                </div>
              </div>
              <div className="space-y-4">
                <MetricBar
                  label={t('Outbound concentration', '出向连接数')}
                  value={selectedCase.graphContext.outDegree}
                  max={Math.max(10, selectedCase.graphContext.outDegree)}
                  info={t('A simple count of outgoing graph links. Higher values can indicate more outward dispersion, but not necessarily illicit behavior by itself.', '出边数量的简单计数。数值较高可能代表更强的向外分散，但不能单独证明违法行为。')}
                />
                <MetricBar
                  label={t('One-hop exposure', '一跳邻域')}
                  value={selectedCase.graphContext.oneHopNeighborCount}
                  max={Math.max(20, selectedCase.graphContext.oneHopNeighborCount)}
                  info={t('Direct neighbors around the selected transaction. This is the closest local context.', '当前交易的直接邻居，是最接近的局部上下文。')}
                />
                <MetricBar
                  label={t('Two-hop exposure', '两跳邻域')}
                  value={selectedCase.graphContext.twoHopNeighborCount}
                  max={Math.max(80, selectedCase.graphContext.twoHopNeighborCount)}
                  info={t('Neighbors reachable after one more step. This shows whether the local graph quickly expands.', '再向外走一步可到达的邻居，用于观察局部网络是否快速扩张。')}
                />
                <MetricBar
                  label={t('Rule score', '规则评分')}
                  value={selectedDraft?.risk_score ?? selectedCase.modelScore * 100}
                  max={100}
                  info={t('A capped review-priority score from triggered rules. It is not a probability of crime.', '由触发规则加总得到的复核优先级分数，不是犯罪概率。')}
                />
                <div className="bg-[#fbefe5] p-4 text-sm leading-6 text-[#655549]">
                  <p className="font-semibold text-[#171717]">{t('Distance to known illicit cluster', '距已知风险样本簇')}</p>
                  <p className="mt-2 text-base font-semibold text-[#8f431b]">
                    {isZh
                      ? String(selectedCase.graphContext.distanceToKnownIllicitCluster)
                          .replace('Not observed within 2 hops', '两跳范围内未发现')
                          .replace('2 hops', '两跳')
                          .replace('1 hop', '一跳')
                      : selectedCase.graphContext.distanceToKnownIllicitCluster}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#7b7166]">
                    {t('This is a local exposure signal within the prepared sample. It is not full chain tracing or a final attribution.', '该信号仅反映当前样本局部图谱内的距离，不等同于完整链上追踪，也不代表最终归因。')}
                  </p>
                </div>
              </div>
            </section>

            <section className="flex-1 border border-[#e5d8ca] bg-white/82 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)]">
              <h2 className="text-xl font-semibold tracking-tight">{t('How to read the graph panel', '如何理解这些信号')}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoCard title={t('Start with direction', '先看资金方向')} body={t('Compare inbound and outbound links first. A fan-out case has more outgoing than incoming links, so the review focuses on dispersion.', '先比较入向连接和出向连接。如果出向连接明显更多，说明这笔交易更像是在向外分散，需要进一步看资金去向和交易对手。')} />
                <InfoCard title={t('Then check neighborhood size', '再看邻域是否扩张')} body={t('One-hop exposure is the immediate context. Two-hop exposure shows how quickly the local network expands beyond direct neighbors.', '一跳邻域代表直接交易上下文，两跳邻域可以帮助观察局部网络是否快速扩张，是否靠近更复杂的交易结构。')} />
                <InfoCard title={t('Read score as triage', '把评分当作排序工具')} body={t('The rule score decides review priority. It helps analysts sort cases, but the final conclusion still needs human review and external context.', '规则评分用于帮助分析师决定先看哪些样本。它不是最终结论，仍需要结合身份信息、资金来源和外部数据人工判断。')} />
              </div>
            </section>
          </section>

          <aside className="flex h-full flex-col gap-5">
            <section className="flex-1 border border-[#e5d8ca] bg-white/86 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7556]">{t('LLM review overview', 'AI Review Draft')}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{t('Risk summary', 'Risk Summary')}</h2>
              <div className="mt-5 bg-[#fbefe5] p-5 text-sm leading-7 text-[#342a24]">
                {selectedDraft
                  ? (isZh ? (selectedDraft.risk_summary_zh || cleanReviewText(selectedDraft.risk_summary)) : cleanReviewText(selectedDraft.risk_summary))
                  : selectedCase.reviewDraft.summary}
              </div>
              {selectedDraft && (
                <div className="mt-4 border border-[#eadccd] bg-white/72 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7556]">{t('Suggested next action', 'Suggested Next Action')}</p>
                  <p className="mt-2 text-sm leading-6 text-[#5f564f]">{isZh ? (selectedDraft.suggested_next_review_action_zh || cleanReviewText(selectedDraft.suggested_next_review_action)) : cleanReviewText(selectedDraft.suggested_next_review_action)}</p>
                </div>
              )}
              {selectedDraft && (
                <button
                  onClick={() => setDetailOpen(true)}
                  className="mt-5 w-full bg-[#171717] px-5 py-3 text-sm font-semibold text-white"
                >
                  {t('Detailed review', 'Open Full Draft')}
                </button>
              )}
            </section>

            <section className="border border-[#e5d8ca] bg-white/86 p-6 shadow-[0_18px_60px_rgba(74,51,31,0.08)]">
              <h2 className="text-lg font-semibold tracking-tight">{t('Human review questions', 'Human Review Questions')}</h2>
              <ul className="mt-4 space-y-3">
                {(isZh && selectedDraft?.human_review_questions_zh
                  ? selectedDraft.human_review_questions_zh
                  : (selectedDraft?.human_review_questions ?? selectedCase.reviewDraft.reviewQuestions)
                ).slice(0, 4).map((question) => (
                  <li key={question} className="bg-[#fff8f1] p-3 text-sm leading-6 text-[#5f564f]">{question}</li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
        </div>
      </div>

      {detailOpen && selectedDraft && (
        <DetailDrawer
          draft={selectedDraft}
          selectedCase={selectedCase}
          onClose={() => setDetailOpen(false)}
          t={t}
          status={status}
          isZh={isZh}
        />
      )}
    </main>
  )
}

function MetricBar({
  label,
  value,
  max,
  info,
}: {
  label: string
  value: number
  max: number
  info?: string
}) {
  const width = Math.max(3, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="flex items-center text-[#6d6258]">
          {label}
          {info && <InfoHint text={info} />}
        </span>
        <span className="font-semibold text-[#171717]">{formatDisplayValue(value)}</span>
      </div>
      <div className="h-2 bg-[#efe4d9]">
        <div className="h-2 bg-[#d9894b]" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
