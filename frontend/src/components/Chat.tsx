import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

import {
  AssistantMsg,
  Msg,
  TablePayload,
  TableColumn,
  ChartPayload,
  ChartFormat,
  HealthSnapshot,
  HealthCheckEntry,
  SystemStatus,
  useChatSession,
  isAssistant,
  submitFeedbackAPI,
} from './chat/ChatSessionProvider'
import { useChatChime } from '../hooks/useChatChime'
import { useAuth } from '../auth/AuthProvider'

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

const STATUS_CONFIG: Record<SystemStatus, { label: string; container: string; dot: string; textClass: string }> = {
  checking: {
    label: 'Setting up…',
    container: 'border-[var(--divider)] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
    dot: 'border-2 border-current border-t-transparent',
    textClass: 'text-[var(--text-tertiary)]',
  },
  ready: {
    label: 'Ready',
    container: 'border-[var(--divider)] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]',
    dot: 'bg-[#10a37f]',
    textClass: 'text-[var(--text-tertiary)]',
  },
  degraded: {
    label: 'Warming up…',
    container: 'border-[var(--divider)] bg-white shadow-[0_12px_28px_rgba(253,186,116,0.25)]',
    dot: 'bg-amber-400 animate-pulse',
    textClass: 'text-amber-600',
  },
  unavailable: {
    label: 'Reconnecting…',
    container: 'border-[var(--divider)] bg-white shadow-[0_12px_28px_rgba(244,63,94,0.25)]',
    dot: 'bg-rose-500 animate-pulse',
    textClass: 'text-rose-600',
  },
}

const HEALTH_LABELS: Record<string, string> = {
  primary_llm: 'Primary engine',
  fallback_llm: 'Backup engine',
  search_backend: 'Search',
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

type ChatProps = {
  variant?: 'full' | 'embedded' | 'canvas'
  className?: string
}

export default function Chat({ variant = 'full', className }: ChatProps) {
  const { user } = useAuth()
  const {
    messages,
    isLoading,
    isStreaming,
    pendingLatencyMs,
    systemStatus,
    healthSnapshot,
    isHealthRefreshing,
    refreshHealth,
    sendMessage,
    clearConversation,
    updateMessages,
  } = useChatSession()
  const [input, setInput] = useState('')
  const [chartSpec, setChartSpec] = useState<ChartPayload | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({})
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [glowPulse, setGlowPulse] = useState(false)
  const prevStreamingRef = useRef(isStreaming)
  const { play: playChime, muted: chimeMuted, toggleMute: toggleChimeMute } = useChatChime()

  const isCanvas = variant === 'canvas'

  const visibleMessages = React.useMemo(() => {
    if (!isCanvas) return messages
    return messages.filter((entry, index) => {
      if (!isAssistant(entry)) return true
      if (entry.id === 'welcome' && index === 0) return false
      return true
    })
  }, [isCanvas, messages])

  const hasCanvasMessages = visibleMessages.length > 0
  const showCanvasHero = isCanvas && !hasCanvasMessages && !isStreaming

  const outerClasses = useMemo(() => {
    const classes: string[] = [className ?? '']
    if (isCanvas) {
      classes.push('flex h-full w-full flex-col')
    } else {
      classes.push('relative z-10')
      classes.push(variant === 'embedded' ? 'w-full' : 'mx-auto max-w-xl')
    }
    return classes.filter(Boolean).join(' ')
  }, [className, isCanvas, variant])

  const scrollAreaClasses = useMemo(() => {
    if (isCanvas) {
      return 'flex-1 w-full overflow-y-auto'
    }
    if (variant === 'embedded') {
      return 'max-h-[60vh] overflow-y-auto px-3 pb-4 pt-3'
    }
    return 'max-h-[28rem] overflow-y-auto px-4 pb-4 pt-3'
  }, [isCanvas, variant])

  const cardClasses = useMemo(() => {
    if (isCanvas) {
      return 'flex h-full w-full flex-col'
    }
    return variant === 'embedded'
      ? 'relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--panel)]/96 p-3 shadow-[0_30px_60px_rgba(17,21,41,0.24)] backdrop-blur'
      : 'relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--panel)]/95 p-4 shadow-[0_24px_60px_rgba(19,24,52,0.16)] backdrop-blur'
  }, [isCanvas, variant])

  const statusHint = useMemo(() => {
    if (!healthSnapshot?.checks) return ''
    const segments = Object.entries(healthSnapshot.checks)
      .map(([key, check]) => {
        if (!check) return null
        const status = String(check.status || '').toLowerCase()
        if (status === 'skipped') return null
        const summary = check.summary || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '')
        if (!summary) return null
        const label = HEALTH_LABELS[key] || key.replace(/_/g, ' ')
        return `${label}: ${summary}`
      })
      .filter(Boolean) as string[]
    return segments.join(' • ')
  }, [healthSnapshot])

  const lastCheckedLabel = useMemo(() => {
    if (!healthSnapshot?.updatedAt) return ''
    try {
      const value = new Date(healthSnapshot.updatedAt)
      return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (_) {
      return ''
    }
  }, [healthSnapshot?.updatedAt])

  const statusTitle = useMemo(() => {
    const parts: string[] = []
    if (statusHint) parts.push(statusHint)
    if (lastCheckedLabel) parts.push(`Checked ${lastCheckedLabel}`)
    return parts.length ? parts.join('\n') : 'Click to rerun setup check.'
  }, [statusHint, lastCheckedLabel])

  const statusInfo = STATUS_CONFIG[systemStatus] ?? STATUS_CONFIG.ready
  const showSpinner = systemStatus === 'checking'
  const dotClassName = showSpinner
    ? 'h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent'
    : `h-1.5 w-1.5 rounded-full ${statusInfo.dot} ${
        systemStatus === 'ready' && isHealthRefreshing ? 'animate-pulse' : ''
      }`

  const statusButtonDisabled = isHealthRefreshing || systemStatus === 'checking'
  const sendDisabled =
    isLoading || systemStatus === 'unavailable' || systemStatus === 'checking' || isHealthRefreshing

  const providerBadges = useMemo(() => {
    if (!healthSnapshot?.checks) return []
    const entries = [
      { key: 'primary_llm', label: 'DeepSeek' },
      { key: 'fallback_llm', label: 'Ollama' },
      { key: 'search_backend', label: 'Search' },
    ] as const
    return entries
      .map((entry) => ({ ...entry, check: healthSnapshot.checks?.[entry.key] }))
      .filter((entry) => entry.check)
  }, [healthSnapshot])
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
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (isAssistant(last)) {
      setGlowPulse(true)
      const timer = window.setTimeout(() => setGlowPulse(false), 900)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [messages])

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const last = messages[messages.length - 1]
      if (last && isAssistant(last)) {
        playChime()
      }
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, messages, playChime])

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
      await submitFeedbackAPI(payload)
      updateMessages((prev) =>
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
    if (!msg.id || !msg.text || isLoading) return null
    const busy = !!feedbackLoading[msg.id]
    const selected = msg.feedback ?? null
    const latencyLabel =
      typeof msg.latencyMs === 'number' && !Number.isNaN(msg.latencyMs)
        ? `Answered in ${formatLatency(msg.latencyMs)}`
        : null
    return (
      <div className="mt-3 flex items-center gap-2 text-[7px] uppercase tracking-[0.32em] text-[var(--muted)]">
        <div className="flex items-center gap-1">
          <motion.button
            type="button"
            disabled={busy || selected === 'up'}
            onClick={() => submitFeedback(msg, 'up')}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ${
              selected === 'up'
                ? 'border-[var(--brand2)] bg-[var(--brand2)]/15 text-[var(--brand2)] shadow-[0_6px_14px_rgba(123,91,251,0.25)]'
                : 'border-[var(--border)]/60 bg-[var(--panel)] text-[var(--text)] hover:border-[var(--brand2)]/70 hover:text-[var(--brand2)]'
            } ${busy ? 'opacity-30 pointer-events-none' : ''}`}
            aria-label="Mark answer helpful"
            whileHover={{ scale: busy || selected === 'up' ? 1 : 1.08 }}
            whileTap={{ scale: busy || selected === 'up' ? 1 : 0.92 }}
          >
            <span className="text-[11px] leading-none">👍</span>
          </motion.button>
          <motion.button
            type="button"
            disabled={busy || selected === 'down'}
            onClick={() => submitFeedback(msg, 'down')}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ${
              selected === 'down'
                ? 'border-rose-400 bg-rose-500/15 text-rose-400 shadow-[0_6px_14px_rgba(244,63,94,0.25)]'
                : 'border-[var(--border)]/60 bg-[var(--panel)] text-[var(--text)] hover:border-rose-300/70 hover:text-rose-300'
            } ${busy ? 'opacity-30 pointer-events-none' : ''}`}
            aria-label="Mark answer unhelpful"
            whileHover={{ scale: busy || selected === 'down' ? 1 : 1.08 }}
            whileTap={{ scale: busy || selected === 'down' ? 1 : 0.92 }}
          >
            <span className="text-[11px] leading-none">👎</span>
          </motion.button>
        </div>
        {latencyLabel ? (
          <span className="ml-auto inline-flex items-center gap-[6px] rounded-full border border-[var(--border)]/60 bg-[var(--panel)] px-2 py-[2px] text-[7px] uppercase tracking-[0.32em] text-[var(--muted)]">
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--brand2)]/70" />
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

  const handleClearConversation = useCallback(() => {
    clearConversation()
    setChartSpec(null)
    setGraphOpen(false)
    setFeedbackLoading({})
  }, [clearConversation])

  async function send(messageOverride?: string) {
    const text = (messageOverride ?? input).trim()
    if (!text || sendDisabled) return
    setInput('')
    await sendMessage(text)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const composer = isCanvas ? (
    <form
      className="mx-auto w-full max-w-3xl space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!sendDisabled) send()
      }}
    >
      <div className="relative rounded-full border border-[var(--divider)] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-2 px-3 sm:px-4">
          <input
            className="flex-1 bg-transparent py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            placeholder="Ask anything"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !sendDisabled) {
                e.preventDefault()
                send()
              }
            }}
            disabled={isLoading}
            ref={inputRef}
          />
          <motion.button
            type="submit"
            whileTap={sendDisabled ? { scale: 1 } : { scale: 0.95 }}
            disabled={sendDisabled}
            className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[var(--brand2)] to-[var(--brand1)] text-white shadow-[0_12px_28px_rgba(37,99,235,0.45)] transition hover:brightness-110 ${
              sendDisabled ? 'cursor-not-allowed opacity-60' : ''
            }`}
            aria-label="Send message"
          >
            <SendIcon />
          </motion.button>
        </div>
      </div>
      {isStreaming ? (
        <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-tertiary)]">
          <div className="flex items-end gap-[4px]">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className="waveform-bar h-3 w-1.5 rounded-full bg-[#10a37f]/70"
                style={{ animationDelay: `${bar * 0.12}s` }}
              />
            ))}
          </div>
          <span>Generating insights…</span>
        </div>
      ) : null}
      <p className="text-center text-[11px] text-[var(--text-tertiary)]">
        SmartWealth AI may produce inaccurate information about markets. Double-check critical guidance.
      </p>
    </form>
  ) : (
    <>
      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 pr-10 outline-none placeholder:text-[var(--muted)]"
          placeholder=" "
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !sendDisabled) {
              e.preventDefault()
              send()
            }
          }}
          disabled={isLoading}
          ref={inputRef}
        />
        <motion.button
          onClick={() => {
            if (!sendDisabled) send()
          }}
          whileTap={sendDisabled ? { scale: 1 } : { scale: 0.98 }}
          disabled={sendDisabled}
          className={`rounded-xl bg-gradient-to-r from-[var(--brand2)] to-[var(--brand1)] px-4 py-3 font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.45)] hover:brightness-110 ${
            sendDisabled ? 'cursor-not-allowed opacity-60' : ''
          }`}
        >
          {isLoading ? 'Thinking…' : 'Send'}
        </motion.button>
      </div>
      {isStreaming ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]">
          <div className="flex items-end gap-[4px]">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className="waveform-bar h-3 w-1.5 rounded-full bg-[var(--brand2)]/70"
                style={{ animationDelay: `${bar * 0.12}s` }}
              />
            ))}
          </div>
          <span>Generating response…</span>
        </div>
      ) : null}
    </>
  )

  const chartModal =
    graphOpen && chartSpec
      ? (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur" onClick={() => setGraphOpen(false)} />
            <div className="relative z-[1001] w-full max-w-4xl rounded-2xl border border-[var(--divider)] bg-white p-5 shadow-[0_48px_120px_rgba(15,23,42,0.32)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold text-[var(--text-primary)]">{chartSpec.title}</div>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  {chartSpec.type === 'bar' && 'metric' in chartSpec && metricLabel(chartSpec.metric) ? (
                    <span className="rounded-lg border border-[var(--divider)] bg-[var(--panel)] px-2 py-1">
                      {metricLabel(chartSpec.metric)}
                    </span>
                  ) : null}
                  {chartSpec.type === 'scatter' ? (
                    <>
                      <span className="rounded-lg border border-[var(--divider)] bg-[var(--panel)] px-2 py-1">
                        X: {metricLabel(chartSpec.xKey)}
                      </span>
                      <span className="rounded-lg border border-[var(--divider)] bg-[var(--panel)] px-2 py-1">
                        Y: {metricLabel(chartSpec.yKey)}
                      </span>
                    </>
                  ) : null}
                  <button
                    onClick={() => setGraphOpen(false)}
                    className="rounded-lg border border-[var(--divider)] bg-[var(--panel)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--panel)]/90"
                  >
                    Close
                  </button>
                </div>
              </div>

              {chartHighlights && chartSpec ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 grid gap-3 rounded-2xl border border-[var(--divider)] bg-[var(--panel)]/80 p-4 text-xs text-[var(--muted)] md:grid-cols-3"
                >
                  {chartHighlights.kind === 'bar' && chartSpec.type === 'bar' ? (
                    <>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Top Performer</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{chartHighlights.top.label}</div>
                        <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.top.value, chartSpec.format)}</div>
                      </div>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Average</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {metricLabel(chartSpec.metric) || 'Metric'}
                        </div>
                        <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.average, chartSpec.format)}</div>
                      </div>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Trailing</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{chartHighlights.low.label}</div>
                        <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.low.value, chartSpec.format)}</div>
                      </div>
                    </>
                  ) : null}

                  {chartHighlights.kind === 'scatter' && chartSpec.type === 'scatter' ? (
                    <>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Highest Y</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{chartHighlights.highest.label}</div>
                        <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.highest.y, chartSpec.format?.y)}</div>
                      </div>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Centroid</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          ({formatChartValue(chartHighlights.centroid.x, chartSpec.format?.x)}, {formatChartValue(chartHighlights.centroid.y, chartSpec.format?.y)})
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg)]/85 p-3 shadow-inner">
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Lowest Y</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{chartHighlights.lowest.label}</div>
                        <div className="mt-1 text-[var(--brand2)]">{formatChartValue(chartHighlights.lowest.y, chartSpec.format?.y)}</div>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              ) : null}

              <div className="h-[420px] w-full rounded-2xl border border-[var(--divider)] bg-white/95 p-4">
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
                            border: '1px solid var(--divider)',
                            borderRadius: 12,
                            color: 'var(--text-primary)',
                          }}
                          formatter={(v: unknown) => [formatChartValue(v, chartSpec.format), metricLabel(chartSpec.metric) || 'Value']}
                          labelStyle={{ color: 'var(--muted)' }}
                        />
                        <Legend wrapperStyle={{ color: 'var(--text-primary)' }} iconType="circle" />
                        <defs>
                          <linearGradient id="swGradientPrimary" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <Bar
                          dataKey="value"
                          name={metricLabel(chartSpec.metric) || 'Value'}
                          fill={BRAND_COLORS.primary}
                          radius={[10, 10, 4, 4]}
                          stroke="rgba(30,64,175,0.4)"
                          strokeWidth={1.1}
                        />
                      </BarChart>
                    ) : (
                      <ScatterChart margin={{ top: 20, right: 36, bottom: 24, left: 32 }}>
                        <defs>
                          <radialGradient id="swScatter" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.35} />
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
                            border: '1px solid var(--divider)',
                            borderRadius: 12,
                            color: 'var(--text-primary)',
                          }}
                        />
                        <Legend wrapperStyle={{ color: 'var(--text-primary)' }} />
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
        )
      : null

  if (isCanvas) {
    const [greetingIdx, setGreetingIdx] = React.useState<number>(() => Math.floor(Math.random() * 5))
    React.useEffect(() => {
      // When there are no visible messages, pick a new greeting
      if (!visibleMessages.length) setGreetingIdx(Math.floor(Math.random() * 5))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleMessages.length])

    const name = user?.name || 'there'
    const greetings = [
      `How can I help you?`,
      `Good to see you, ${name}. What’s on the agenda?`,
      `Hey ${name}, ready to dive in?`,
      `Welcome back, ${name}. Ask anything.`,
      `${name}, what would you like to explore?`,
    ]

    const subtitle = `${name}, ask anything about earnings, vendor relationships, or company fundamentals.`

    const hero = (
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-16 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.5rem]">{greetings[greetingIdx]}</p>
            <p className="text-sm leading-relaxed text-[var(--text-tertiary)] sm:text-base">
              {subtitle}
            </p>
          </div>
          <motion.div layoutId="composerDock" className="mx-auto w-full max-w-3xl">
            {composer}
          </motion.div>
        </div>
      </div>
    )

    const feed = (
      <div className="flex-1 overflow-y-auto scroll-slim">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-36 pt-10">
          {visibleMessages.map((m, i) => {
            const isAssistantMsg = m.role === 'assistant'
            const containerClasses = 'mx-auto max-w-3xl w-full'
            const bubbleBase = isAssistantMsg
              ? 'w-full px-1 py-0 text-[15px] leading-7 text-[var(--text-primary)]'
              : 'ml-auto max-w-[85%] rounded-3xl bg-[#EAF1FF] px-4 py-2.5 text-[14px] leading-6 text-[#0b1220]'

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${containerClasses}`}
              >
                <div className={`${bubbleBase} ${isAssistantMsg ? '' : 'text-right'}`}>
                  <div className={`${isAssistantMsg ? 'whitespace-pre-wrap' : ''}`}>{m.text}</div>
                  {isAssistant(m) && m.sourceLabel ? (
                    <div className="text-[8px] uppercase tracking-[0.28em] text-[var(--muted)] opacity-75">
                      {m.sourceLabel}
                    </div>
                  ) : null}
                  {renderTableSection(m)}
                  {isAssistant(m) && m.chart?.data?.length ? (
                    <button
                      onClick={() => handleOpenChart(m.chart!)}
                      className="rounded-lg border border-[var(--divider)] bg-[var(--panel)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--brand2)] hover:opacity-90"
                    >
                      Explore Chart
                    </button>
                  ) : null}
                  {isAssistant(m) && m.sql ? (
                    <details className="mt-2 text-xs text-[var(--muted)]">
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
            )
          })}
        <div ref={endRef} />
      </div>
    </div>
    )

    return (
      <div className={outerClasses}>
        <div className={cardClasses}>
          {showCanvasHero ? (
            hero
          ) : (
            <>
              {feed}
              <div className="px-3 pb-8 pt-4 sm:px-4">
                <motion.div layoutId="composerDock" className="mx-auto w-full max-w-3xl">
                  {composer}
                </motion.div>
              </div>
            </>
          )}
        </div>
        {chartModal}
      </div>
    )
  }

  return (
    <div className={outerClasses}>
      <div className={cardClasses}>
        <div
          className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top,rgba(123,91,251,0.16),rgba(123,91,251,0))] transition-opacity duration-500 ${
            glowPulse ? 'opacity-100 animate-[glowPulse_1.4s_ease-in-out]' : 'opacity-0'
          }`}
        />
        <div className="sticky top-0 z-20 bg-[var(--panel)]/92 px-4 pt-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-gradient-to-r from-[#3B4252] via-[#444B5A] to-[#4C5363] px-3 py-1 text-[11px] font-medium text-white shadow-[0_10px_24px_rgba(24,30,44,0.16)]">
                SmartWealth Assistant
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--muted)]">
              <div className="relative group/status">
                <button
                  type="button"
                  onClick={() => refreshHealth({ force: true })}
                  disabled={statusButtonDisabled}
                  aria-label={statusTitle || 'Refresh system status'}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-[6px] font-semibold transition ${
                    statusInfo.container
                  } ${statusInfo.textClass} ${statusButtonDisabled ? 'cursor-not-allowed opacity-70' : 'hover:opacity-90'}`}
                >
                  <span className={dotClassName} />
                  <span>{statusInfo.label}</span>
                </button>
                {providerBadges.length ? (
                  <div className="pointer-events-none absolute right-0 mt-2 hidden min-w-[200px] flex-col gap-2 rounded-2xl border border-white/60 bg-white/95 p-3 text-[9px] shadow-[0_18px_38px_rgba(17,23,41,0.18)] backdrop-blur transition group-hover/status:flex group-focus-within/status:flex">
                    {providerBadges.map(({ key, label, check }) => {
                      const status = String(check?.status || 'skipped').toLowerCase() as 'ready' | 'degraded' | 'unavailable' | 'skipped'
                      const badgeStyles: Record<typeof status, string> = {
                        ready: 'border-emerald-200/70 bg-emerald-50/95 text-emerald-600',
                        degraded: 'border-amber-200/70 bg-amber-50/95 text-amber-600',
                        unavailable: 'border-rose-200/80 bg-rose-50/95 text-rose-600',
                        skipped: 'border-[var(--border)]/60 bg-[var(--panel)]/95 text-[var(--muted)]',
                      }
                      const dotStyles: Record<typeof status, string> = {
                        ready: 'bg-emerald-400',
                        degraded: 'bg-amber-400',
                        unavailable: 'bg-rose-500',
                        skipped: 'bg-[var(--muted)]',
                      }
                      const checkedAt = check?.checkedAt
                        ? new Date(check.checkedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : null
                      return (
                        <div
                          key={key}
                          className={`pointer-events-none rounded-xl border px-3 py-2 shadow-[0_10px_18px_rgba(17,23,41,0.12)] ${badgeStyles[status]}`}
                        >
                          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em]">
                            <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
                            {label}
                          </div>
                          <div className="mt-1 text-[8px] normal-case tracking-normal text-[var(--muted)]/85">
                            {check?.summary || 'No recent update'}
                            {checkedAt ? <span className="ml-1 text-[var(--muted)]/70">• {checkedAt}</span> : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={toggleChimeMute}
                className={`hidden h-8 w-8 items-center justify-center rounded-full border text-[var(--muted)] transition md:inline-flex ${
                  chimeMuted
                    ? 'border-[var(--border)]/70 bg-[var(--panel)]/80'
                    : 'border-transparent bg-white/90 text-[var(--brand2)] shadow-[0_8px_18px_rgba(123,91,251,0.18)]'
                }`}
                aria-label={chimeMuted ? 'Unmute response chime' : 'Mute response chime'}
              >
                {chimeMuted ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 9v6h3l5 4V5L7 9H4Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m16 9 4 6M20 9l-4 6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 9v6h3l5 4V5L7 9H4Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M17 9.34a4 4 0 0 1 0 5.32M19.54 6.46a7.5 7.5 0 0 1 0 11.08" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              {isLoading ? (
                <motion.span
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex min-w-[74px] items-center justify-center gap-1 rounded-full border border-[var(--border)]/70 bg-gradient-to-r from-[var(--brand2)]/18 via-[var(--panel)] to-[var(--brand1)]/12 px-3 py-[6px] text-[var(--brand2)] shadow-[0_0_16px_rgba(123,91,251,0.22)]"
                >
                  <span className="text-[var(--brand2)]">●</span>
                  <span>{formatLatency(pendingLatencyMs) || '…'}</span>
                </motion.span>
              ) : null}
              {messages.length > 1 ? (
                <button
                  onClick={handleClearConversation}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--panel)]/70 px-3 py-[6px] text-[10px] font-semibold text-[var(--brand2)] transition hover:border-[var(--brand2)]/60 hover:text-[var(--text)]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--brand2)]/35 to-transparent" />

        <div className={`flex flex-col gap-3 ${scrollAreaClasses} scroll-slim`}>
          {visibleMessages.map((m, i) => {
            const baseAlignment = 'group relative max-w-[90%] rounded-2xl border px-4 py-4 text-sm transition-all duration-200'
            const bubbleTone =
              m.role === 'assistant'
                ? 'self-start border-[#d9dde8] bg-[#f7f8fb] text-[var(--text)] shadow-[0_18px_38px_rgba(17,23,41,0.08)]'
                : 'self-end border-[#d7d5dd] bg-[#f3f1f6] text-[var(--text)] shadow-[0_18px_36px_rgba(17,23,41,0.12)]'

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={[baseAlignment, bubbleTone, m.role === 'assistant' ? 'self-start' : 'self-end'].join(' ')}
              >
                <div
                  className={`flex items-center text-[10px] font-medium uppercase tracking-[0.35em] text-[var(--muted)] opacity-80 ${
                    m.role === 'assistant' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-white/90 px-2.5 py-1 text-[var(--brand2)] shadow-[0_10px_24px_rgba(123,91,251,0.15)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand2)] to-[var(--brand1)] text-white">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M12 3c-3.87 0-7 2.92-7 6.52 0 2.26 1.52 4.28 3.9 5.24L8 20l4-2 4 2-.9-5.24c2.38-.96 3.9-2.98 3.9-5.24C19 5.92 15.87 3 12 3Z"
                            stroke="white"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M9.5 9.75h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                          <path d="M9.5 12.25h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                          <circle cx="9" cy="8.5" r="0.7" fill="white" />
                          <circle cx="15" cy="8.5" r="0.7" fill="white" />
                        </svg>
                      </span>
                      <span className="text-[0.62rem] tracking-[0.32em] text-[var(--muted)]">AI</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--panel)]/90 px-2.5 py-1 text-[0.62rem] tracking-[0.32em] text-[var(--muted)] shadow-[0_8px_18px_rgba(19,23,41,0.12)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--panel)] text-[var(--muted)]">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6.5 19c0-2.49 2.69-4.5 5.5-4.5s5.5 2.01 5.5 4.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span>You</span>
                    </span>
                  )}
                </div>
                <div className={`mt-2 space-y-3 leading-relaxed ${m.role === 'user' ? 'text-right' : ''}`}>
                  <div className="text-[var(--text)] opacity-90">{m.text}</div>
                  {isAssistant(m) && m.sourceLabel ? (
                    <div className="text-[8px] uppercase tracking-[0.28em] text-[var(--muted)] opacity-75">
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
            )
          })}
          <div ref={endRef} />
        </div>

        <div className="mt-3">
          {composer}
        </div>
      </div>

      {chartModal}
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 4.5 13.4 8c.2.47.6.84 1.08 1.02l3.52 1.3-3.52 1.3a1.7 1.7 0 0 0-1.08 1.02L12 16.5l-1.4-3.36a1.7 1.7 0 0 0-1.08-1.02L6 10.32l3.52-1.3c.48-.18.87-.55 1.08-1.02L12 4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9v6h3l5 4V5l-5 4H6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M19.5 7a6 6 0 0 1 0 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function MutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9v6h3l5 4V5l-5 4H6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M18 9.5 21 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="m21 13-3 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function PlusCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M12 8.5v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 11.5a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 18v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9 20.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.5 11.25 19 4.5l-6.75 14.5-1.65-5.8-6.1-1.95Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
