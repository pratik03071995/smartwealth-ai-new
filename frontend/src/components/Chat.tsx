import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { apiBase } from '../services/api'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ScatterChart,
  Scatter,
} from 'recharts'

const API_BASE = apiBase

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})

const standardCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const METRIC_LABELS: Record<string, string> = {
  marketCap: 'Market Cap',
  price: 'Price',
  lastDividend: 'Dividend',
  change: 'Change',
  changePercentage: 'Change %',
  volume: 'Volume',
  averageVolume: 'Avg Volume',
  beta: 'Beta',
  fullTimeEmployees: 'Employees',
  score_innovation: 'Innovation Score',
  score_sentiment: 'Sentiment Score',
  score_valuation: 'Valuation Score',
  score_fundamentals: 'Fundamentals Score',
  score_macro: 'Macro Score',
  overall_score: 'Overall Score',
  guidanceEPS: 'Guidance EPS',
  guidanceRevenue: 'Guidance Revenue',
  revenue: 'Revenue',
  revenueEstimate: 'Revenue Est.',
  estimateEPS: 'Est. EPS',
  consensusEPS: 'Consensus EPS',
  relationship_strength: 'Relationship Strength',
  est_contract_value_usd_m: 'Contract Value (USDm)',
}

type TableColumn = { key: string; label: string }
type TablePayload = { columns: TableColumn[]; rows: Record<string, unknown>[] }
type ChartDatum = { label: string; value: number; key?: string }
type ChartFormat = 'currency' | 'number' | 'percent'
type ScatterDatum = { label: string; x: number; y: number; size?: number }

type ChartPayload =
  | { type: 'bar'; title: string; metric?: string; format?: ChartFormat; data: ChartDatum[] }
  | {
      type: 'scatter'
      title: string
      xKey: string
      yKey: string
      format?: { x?: ChartFormat; y?: ChartFormat; size?: ChartFormat }
      data: ScatterDatum[]
      sizeKey?: string
    }

type AssistantMsg = {
  role: 'assistant'
  id?: string
  text: string
  table?: TablePayload
  chart?: ChartPayload | null
  sql?: string | null
  latencyMs?: number
  prompt?: string
  feedback?: 'up' | 'down' | null
  plan?: Record<string, unknown> | null
  followups?: string[] | null
  tablePreview?: Record<string, unknown>[] | null
  sourceLabel?: string | null
  dataSource?: string | null
  llmSource?: string | null
  llmSourceRaw?: string | null
  searchProvider?: string | null
}

type UserMsg = { role: 'user'; text: string }
type Msg = AssistantMsg | UserMsg

const isAssistant = (msg: Msg): msg is AssistantMsg => msg.role === 'assistant'

function formatCell(value: unknown, key: string): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—'

  if (typeof value === 'number') {
    if (key === 'marketCap') return compactCurrency.format(value)
    if (key === 'price' || key === 'lastDividend' || key === 'change') return standardCurrency.format(value)
    if (key === 'changePercentage') return `${percentFormatter.format(value)}%`
    if (key === 'volume' || key === 'averageVolume' || key === 'fullTimeEmployees') return value.toLocaleString()
    return compactNumber.format(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '—'
    if (/^https?:\/\//i.test(trimmed)) {
      return (
        <a href={trimmed} target="_blank" rel="noreferrer" className="text-[var(--brand2)] hover:underline">
          Website
        </a>
      )
    }
    if (trimmed.length > 160) {
      return <span title={trimmed}>{trimmed.slice(0, 140)}…</span>
    }
    return trimmed
  }

  return String(value)
}

function formatChartValue(value: unknown, format: ChartFormat | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value ?? '')
  if (format === 'currency') return compactCurrency.format(value)
  if (format === 'percent') return `${percentFormatter.format(value)}%`
  return compactNumber.format(value)
}

function metricLabel(metric?: string | null) {
  if (!metric) return ''
  if (metric === 'multi') return 'Metric Mix'
  return METRIC_LABELS[metric] ?? metric
}

const BRAND_COLORS = {
  primary: 'url(#swGradientPrimary)',
  scatter: '#8B5CF6',
  accent: '#EC4899',
}

function formatLatency(raw: number | undefined) {
  if (raw === undefined || Number.isNaN(raw)) return ''
  if (raw < 1000) return `${Math.round(raw)} ms`
  if (raw < 60000) return `${(raw / 1000).toFixed(raw < 10000 ? 2 : 1)} s`
  const totalSeconds = Math.round(raw / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch (_) {
      // fall through to fallback id
    }
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const INITIAL_ASSISTANT: AssistantMsg = {
  role: 'assistant',
  text: 'Hi! Ask me about company fundamentals, earnings, scores, or vendor relationships. Try “Where is Meta headquartered?” or “Who are Nvidia’s customers?”.',
  id: 'welcome',
  feedback: null,
  plan: null,
  followups: null,
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([INITIAL_ASSISTANT])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chartSpec, setChartSpec] = useState<ChartPayload | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)
  const [pendingLatencyMs, setPendingLatencyMs] = useState(0)
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({})
  const endRef = useRef<HTMLDivElement | null>(null)
  const pendingTimerRef = useRef<number | null>(null)
  const pendingStartRef = useRef<number | null>(null)
  const lastPromptRef = useRef('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const chartHighlights = useMemo(() => {
    if (!chartSpec) return null
    if (chartSpec.type === 'bar') {
      const dataset = (chartSpec.data || []).filter((item) => typeof item.value === 'number')
      if (!dataset.length) return null
      const sorted = [...dataset].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      const total = dataset.reduce((acc, cur) => acc + (cur.value ?? 0), 0)
      return {
        kind: 'bar' as const,
        top: sorted[0],
        low: sorted[sorted.length - 1],
        average: total / dataset.length,
      }
    }
    if (chartSpec.type === 'scatter') {
      const dataset = (chartSpec.data || []).filter(
        (item) => typeof item.x === 'number' && typeof item.y === 'number' && !Number.isNaN(item.x) && !Number.isNaN(item.y),
      )
      if (!dataset.length) return null
      const orderedByY = [...dataset].sort((a, b) => b.y - a.y)
      const centroid = dataset.reduce(
        (acc, cur) => ({ x: acc.x + cur.x, y: acc.y + cur.y }),
        { x: 0, y: 0 },
      )
      const count = dataset.length
      return {
        kind: 'scatter' as const,
        highest: orderedByY[0],
        lowest: orderedByY[orderedByY.length - 1],
        centroid: { x: centroid.x / count, y: centroid.y / count },
      }
    }
    return null
  }, [chartSpec])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    if (isLoading) {
      pendingStartRef.current = now()
      if (pendingTimerRef.current) window.clearInterval(pendingTimerRef.current)
      pendingTimerRef.current = window.setInterval(() => {
        if (pendingStartRef.current) {
          setPendingLatencyMs(now() - pendingStartRef.current)
        }
      }, 120)
      return () => {
        if (pendingTimerRef.current) window.clearInterval(pendingTimerRef.current)
      }
    }

    if (pendingTimerRef.current) {
      window.clearInterval(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    pendingStartRef.current = null
    setPendingLatencyMs(0)
    return () => {
      if (pendingTimerRef.current) window.clearInterval(pendingTimerRef.current)
    }
  }, [isLoading])

  const renderTable = (table: TablePayload | undefined) => {
    if (!table || !table.rows?.length) return null

    return (
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)]/70 shadow-inner">
        <table className="w-full min-w-[22rem] border-separate border-spacing-y-2 text-xs">
          <thead className="bg-transparent text-[var(--muted)]">
            <tr>
              {table.columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, idx) => (
              <tr
                key={idx}
                className="rounded-xl bg-[var(--panel)]/70 backdrop-blur transition hover:bg-[var(--panel)]/90"
              >
                {table.columns.map((col) => (
                  <td key={col.key} className="px-3 py-3 align-top text-[var(--text)]">
                    {formatCell(row[col.key], col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderTableSection = (msg: Msg) => {
    if (!isAssistant(msg) || !msg.table) return null
    const table = msg.table
    const previewSource = msg.tablePreview && msg.tablePreview.length ? msg.tablePreview : table.rows.slice(0, 3)
    const previewColumns = table.columns.slice(0, Math.min(3, table.columns.length))

    return (
      <details className="group mt-3 overflow-hidden rounded-2xl border border-[var(--border)]/80 bg-[var(--panel)]/50 text-xs backdrop-blur transition">
        <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--brand2)] outline-none transition">
          <span>View detailed table</span>
          <span className="text-[8px] text-[var(--muted)]">Click to expand</span>
        </summary>
        <div className="space-y-3 px-3 pb-3">
          {previewSource && previewSource.length ? (
            <ul className="space-y-2 text-[11px] text-[var(--muted)]">
              {previewSource.map((row, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-[var(--border)]/40 bg-[var(--bg)]/40 px-3 py-2 text-[var(--text)]/90"
                >
                  {previewColumns.map((col, colIdx) => (
                    <span key={`${col.key}-${colIdx}`}>
                      <span className="font-semibold text-[var(--text)]">{col.label}:</span>{' '}
                      <span>{formatCell((row as any)[col.key], col.key)}</span>
                      {colIdx < previewColumns.length - 1 ? (
                        <span className="mx-1 text-[var(--muted)]">•</span>
                      ) : null}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}
          {renderTable(table)}
        </div>
      </details>
    )
  }

  async function submitFeedback(msg: AssistantMsg, rating: 'up' | 'down') {
    if (!msg.id) return
    if (msg.feedback && msg.feedback === rating) return
    setFeedbackLoading((prev) => ({ ...prev, [msg.id!]: true }))

    const payload = {
      messageId: msg.id,
      rating,
      prompt: msg.prompt,
      answer: msg.text,
      sql: msg.sql,
      plan: msg.plan,
      table: msg.table,
      chart: msg.chart,
      latencyMs: msg.latencyMs,
      dataset: (msg.plan as any)?.dataset ?? undefined,
      createdAt: new Date().toISOString(),
    }

    try {
      await axios.post(`${API_BASE}/chat/feedback`, payload)
      setMessages((prev) =>
        prev.map((entry) =>
          isAssistant(entry) && entry.id === msg.id
            ? { ...entry, feedback: rating }
            : entry,
        ),
      )
    } catch (error) {
      console.error('Failed to submit feedback', error)
    } finally {
      setFeedbackLoading((prev) => {
        const next = { ...prev }
        delete next[msg.id!]
        return next
      })
    }
  }

  function renderFeedbackControls(msg: AssistantMsg) {
    if (!msg.id) return null
    const busy = !!feedbackLoading[msg.id]
    const selected = msg.feedback ?? null
    const latencyLabel =
      typeof msg.latencyMs === 'number' && !Number.isNaN(msg.latencyMs)
        ? `Answered in ${formatLatency(msg.latencyMs)}`
        : null
    return (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-[var(--muted)]">
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="opacity-80">Helpful?</span>
          <button
            type="button"
            disabled={busy || selected === 'up'}
            onClick={() => submitFeedback(msg, 'up')}
            className={`group rounded-full border border-[var(--border)] bg-[var(--panel)]/80 px-2 py-[5px] transition hover:bg-[var(--panel)] ${
              selected === 'up' ? 'shadow-[0_0_12px_rgba(91,136,251,0.35)] text-[var(--brand2)]' : 'text-[var(--text)]'
            } ${busy ? 'opacity-50' : ''}`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="text-base leading-none">👍</span>
              <span className="hidden sm:inline">Yes</span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy || selected === 'down'}
            onClick={() => submitFeedback(msg, 'down')}
            className={`group rounded-full border border-[var(--border)] bg-[var(--panel)]/80 px-2 py-[5px] transition hover:bg-[var(--panel)] ${
              selected === 'down' ? 'shadow-[0_0_12px_rgba(239,68,68,0.35)] text-red-400' : 'text-[var(--text)]'
            } ${busy ? 'opacity-50' : ''}`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="text-base leading-none">👎</span>
              <span className="hidden sm:inline">No</span>
            </span>
          </button>
          {selected ? <span className="text-[var(--brand2)]">Appreciated!</span> : null}
        </div>
        {latencyLabel ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel)]/60 px-2.5 py-[4px] text-[8px] uppercase tracking-[0.18em] text-[var(--muted)]">
            <span className="h-1 w-1 rounded-full bg-[var(--brand2)]/70" />
            {latencyLabel}
          </span>
        ) : null}
      </div>
    )
  }

  function renderFollowupChips(msg: AssistantMsg) {
    if (!msg.followups || msg.followups.length === 0) return null
    return (
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-[var(--muted)]">
        {msg.followups.slice(0, 4).map((tip, idx) => (
          <button
            key={`${msg.id}-followup-${idx}`}
            type="button"
            onClick={() => {
              send(tip)
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-[5px] text-[9px] uppercase tracking-wider text-[var(--brand2)] transition hover:bg-[var(--panel)]/80"
          >
            {tip}
          </button>
        ))}
      </div>
    )
  }

  function handleOpenChart(spec: ChartPayload) {
    setChartSpec(spec)
    setGraphOpen(true)
    setGraphReady(false)
    setTimeout(() => setGraphReady(true), 40)
  }

  function clearConversation() {
    setMessages([INITIAL_ASSISTANT])
    setChartSpec(null)
    setGraphOpen(false)
    setFeedbackLoading({})
  }

  async function send(messageOverride?: string) {
    const text = (messageOverride ?? input).trim()
    if (!text || isLoading) return

    setInput('')
    setIsLoading(true)
    setMessages((m) => [...m, { role: 'user', text }])
    lastPromptRef.current = text
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

    try {
      const { data } = await axios.post(`${API_BASE}/chat`, { message: text })
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const latencyMs = Math.max(0, endedAt - startedAt)
      const assistantId = (data?.messageId as string) || createMessageId()
      const sourceLabel = (data?.sourceLabel as string | undefined) ?? null
      const dataSource = (data?.data_source as string | undefined) ?? null
      const llmSource = (data?.llmSource as string | undefined) ?? null
      const llmSourceRaw = (data?.llmSourceRaw as string | undefined) ?? null
      const searchProvider = (data?.search_provider as string | undefined) ?? null
      const assistant: AssistantMsg = {
        role: 'assistant',
        text: data?.reply || 'I could not craft a response for that.',
        table: data?.table,
        chart: data?.chart,
        sql: data?.sql,
        latencyMs,
        id: assistantId,
        prompt: lastPromptRef.current,
        feedback: null,
        plan: data?.plan ?? null,
        followups: (data?.followups as string[] | undefined) ?? null,
        tablePreview: (data?.tablePreview as Record<string, unknown>[] | undefined) ?? null,
        sourceLabel,
        dataSource,
        llmSource,
        llmSourceRaw,
        searchProvider,
      }
      setMessages((m) => [...m, assistant])
    } catch (err) {
      const assistantId = createMessageId()
      const fallback: AssistantMsg = {
        role: 'assistant',
        text: 'Error reaching API.',
        latencyMs: 0,
        id: assistantId,
        prompt: lastPromptRef.current,
        feedback: null,
        plan: null,
        followups: null,
      }
      setMessages((m) => [...m, fallback])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-xl">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]">
          <span className="font-semibold tracking-wide uppercase">SmartWealth Assistant</span>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <motion.span
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2.5 py-[6px] text-[9px] uppercase tracking-wider text-[var(--brand2)] shadow-glow"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-[var(--brand2)]/70 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-[var(--brand2)]" />
                </span>
                Synthesizing • {formatLatency(pendingLatencyMs) || '…'}
              </motion.span>
            ) : null}
            {messages.length > 1 ? (
              <button
                onClick={clearConversation}
                className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 font-medium uppercase tracking-wide text-[var(--brand2)] transition hover:opacity-80"
              >
                Clear Chat
              </button>
            ) : null}
          </div>
        </div>
        {/* SCROLLABLE feed */}
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2 scroll-slim">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-[color:var(--brand2)]/20' : 'bg-[var(--panel)]'}`}
            >
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{m.role}</div>
              <div className="mt-1 space-y-3 leading-relaxed">
                <div>{m.text}</div>
                {isAssistant(m) && m.sourceLabel ? (
                  <div className="text-[8px] uppercase tracking-[0.28em] text-[var(--muted)] opacity-80">
                    {m.sourceLabel}
                  </div>
                ) : null}
                {renderTableSection(m)}
                {isAssistant(m) && m.chart?.data?.length ? (
                  <button
                    onClick={() => handleOpenChart(m.chart!)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--brand2)] hover:opacity-90"
                  >
                    Explore Chart
                  </button>
                ) : null}
                {isAssistant(m) && m.sql ? (
                  <details className="text-xs text-[var(--muted)]">
                    <summary className="cursor-pointer select-none text-[var(--muted)]">Show SQL</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--bg)]/70 p-3 text-[var(--muted)]">
                      {m.sql}
                    </pre>
                  </details>
                ) : null}
                {isAssistant(m) ? renderFollowupChips(m) : null}
                {isAssistant(m) && m.id !== 'welcome' ? renderFeedbackControls(m) : null}
              </div>
            </motion.div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 pr-10 outline-none placeholder:text-[var(--muted)]"
            placeholder=" "
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' ? send() : undefined)}
            disabled={isLoading}
            ref={inputRef}
          />
          <motion.button
            onClick={() => send()}
            whileTap={{ scale: 0.98 }}
            disabled={isLoading}
            className={`rounded-xl bg-[var(--brand2)] px-4 py-3 font-semibold text-[var(--btnText)] shadow-glow hover:opacity-90 ${
              isLoading ? 'opacity-60' : ''
            }`}
          >
            {isLoading ? 'Thinking…' : 'Send'}
          </motion.button>
        </div>
      </div>

      {/* Chart Modal */}
      {graphOpen && chartSpec ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur" onClick={() => setGraphOpen(false)} />
          <div className="relative z-[1001] w-full max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-glow">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">{chartSpec.title}</div>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                {chartSpec.type === 'bar' && 'metric' in chartSpec && metricLabel(chartSpec.metric) ? (
                  <span className="rounded px-2 py-1 border border-[var(--border)] bg-[var(--panel)]">
                    {metricLabel(chartSpec.metric)}
                  </span>
                ) : null}
                {chartSpec.type === 'scatter' ? (
                  <>
                    <span className="rounded px-2 py-1 border border-[var(--border)] bg-[var(--panel)]">
                      X: {metricLabel(chartSpec.xKey)}
                    </span>
                    <span className="rounded px-2 py-1 border border-[var(--border)] bg-[var(--panel)]">
                      Y: {metricLabel(chartSpec.yKey)}
                    </span>
                  </>
                ) : null}
                <button
                  onClick={() => setGraphOpen(false)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm hover:opacity-90"
                >
                  Close
                </button>
              </div>
            </div>

            {chartHighlights && chartSpec ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 grid gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--panel)]/70 p-4 text-xs text-[var(--muted)] md:grid-cols-3"
              >
                {chartHighlights.kind === 'bar' && chartSpec.type === 'bar' ? (
                  <>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Top Performer</div>
                      <div className="text-sm font-semibold text-[var(--text)]">{chartHighlights.top.label}</div>
                      <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.top.value, chartSpec.format)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Average</div>
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {metricLabel(chartSpec.metric) || 'Metric'}
                      </div>
                      <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.average, chartSpec.format)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Trailing</div>
                      <div className="text-sm font-semibold text-[var(--text)]">{chartHighlights.low.label}</div>
                      <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.low.value, chartSpec.format)}</div>
                    </div>
                  </>
                ) : null}
                {chartHighlights.kind === 'scatter' && chartSpec.type === 'scatter' ? (
                  <>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Peak Signal</div>
                      <div className="text-sm font-semibold text-[var(--text)]">{chartHighlights.highest.label}</div>
                      <div className="mt-1 text-[var(--brand2)]">
                        {formatChartValue(chartHighlights.highest.y, chartSpec.format?.y)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Centroid</div>
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {formatChartValue(chartHighlights.centroid.x, chartSpec.format?.x)}
                        <span className="mx-1 text-[var(--muted)]">/</span>
                        {formatChartValue(chartHighlights.centroid.y, chartSpec.format?.y)}
                      </div>
                      <div className="mt-1 text-[var(--muted)]">Average position</div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/80 p-3 shadow-inner">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Baseline</div>
                      <div className="text-sm font-semibold text-[var(--text)]">{chartHighlights.lowest.label}</div>
                      <div className="mt-1 text-[var(--brand2)]">
                        {formatChartValue(chartHighlights.lowest.y, chartSpec.format?.y)}
                      </div>
                    </div>
                  </>
                ) : null}
              </motion.div>
            ) : null}

            <div className="relative h-[380px] w-full overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--panel)] via-[var(--bg)] to-[var(--bg)] p-3">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top,var(--brand2)/20,transparent_60%)]" />
              {graphReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  {chartSpec.type === 'bar' ? (
                    <BarChart data={chartSpec.data} margin={{ top: 18, right: 24, left: 4, bottom: 24 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="4 6" />
                      <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} minTickGap={16} interval="preserveStartEnd" />
                      <YAxis
                        stroke="var(--muted)"
                        fontSize={10}
                        width={70}
                        tickFormatter={(value) => formatChartValue(value, chartSpec.format)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          color: 'var(--text)',
                        }}
                        formatter={(v: unknown) => [formatChartValue(v, chartSpec.format), metricLabel(chartSpec.metric) || 'Value']}
                        labelStyle={{ color: 'var(--muted)' }}
                      />
                      <Legend wrapperStyle={{ color: 'var(--text)' }} iconType="circle" />
                      <defs>
                        <linearGradient id="swGradientPrimary" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={1} />
                          <stop offset="100%" stopColor="#EC4899" stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <Bar
                        dataKey="value"
                        name={metricLabel(chartSpec.metric) || 'Value'}
                        fill={BRAND_COLORS.primary}
                        radius={[10, 10, 4, 4]}
                        stroke="rgba(236,72,153,0.4)"
                        strokeWidth={1.2}
                      />
                    </BarChart>
                  ) : (
                    <ScatterChart margin={{ top: 20, right: 36, bottom: 24, left: 32 }}>
                      <defs>
                        <radialGradient id="swScatter" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#EC4899" stopOpacity={0.35} />
                        </radialGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
                      <XAxis
                        dataKey="x"
                        name={metricLabel(chartSpec.xKey)}
                        stroke="var(--muted)"
                        tickFormatter={(value) => formatChartValue(value, chartSpec.format?.x)}
                      />
                      <YAxis
                        dataKey="y"
                        name={metricLabel(chartSpec.yKey)}
                        stroke="var(--muted)"
                        tickFormatter={(value) => formatChartValue(value, chartSpec.format?.y)}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(value: unknown, name: string) => {
                          if (name === 'x') return [formatChartValue(value, chartSpec.format?.x), metricLabel(chartSpec.xKey)]
                          if (name === 'y') return [formatChartValue(value, chartSpec.format?.y), metricLabel(chartSpec.yKey)]
                          return value as any
                        }}
                        labelStyle={{ color: 'var(--muted)' }}
                        contentStyle={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          color: 'var(--text)',
                        }}
                      />
                      <Legend wrapperStyle={{ color: 'var(--text)' }} />
                      <Scatter data={chartSpec.data} fill="url(#swScatter)" line shape="circle" />
                    </ScatterChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full w-full place-items-center text-sm text-[var(--muted)]">Loading chart…</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
