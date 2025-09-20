import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../services/api'
import { CompanyLogo } from '../utils/logos'

type ScoreRow = {
  symbol: string
  as_of?: string
  sector?: string
  industry?: string
  px?: number
  pe?: number
  ev_ebitda?: number
  pt_consensus?: number
  score_fundamentals?: number
  score_valuation?: number
  score_sentiment?: number
  score_innovation?: number
  score_macro?: number
  score_insider?: number
  score_events?: number
  overall_score?: number
  rank_overall?: number
}

const SCORE_KEYS: Array<{ key: keyof ScoreRow; label: string; accent: string }> = [
  { key: 'score_fundamentals', label: 'Fundamentals', accent: 'from-[#76fcb9] to-[#3cc4ff]' },
  { key: 'score_valuation', label: 'Valuation', accent: 'from-[#fdf06f] to-[#fc924c]' },
  { key: 'score_sentiment', label: 'Sentiment', accent: 'from-[#9b8cff] to-[#5f4bde]' },
  { key: 'score_innovation', label: 'Innovation', accent: 'from-[#ff9add] to-[#ff5fa6]' },
  { key: 'score_macro', label: 'Macro', accent: 'from-[#7cf0ff] to-[#3bb0ff]' },
  { key: 'score_insider', label: 'Insider', accent: 'from-[#ffd6a5] to-[#ff924c]' },
  { key: 'score_events', label: 'Events', accent: 'from-[#c8b5ff] to-[#7d5fff]' },
]

function formatPct(val?: number) {
  if (val == null || Number.isNaN(val)) return '—'
  return `${Math.round(val * 100)}%`
}

function formatNumber(val?: number, digits = 2) {
  if (val == null || Number.isNaN(val)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val)
}

function formatCurrency(val?: number, digits = 2) {
  if (val == null || Number.isNaN(val)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  }).format(val)
}

function ScoreBar({ value, label, accent }: { value?: number; label: string; accent: string }) {
  const pct = Math.max(0, Math.min(1, value ?? 0))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
        <span>{label}</span>
        <span className="font-semibold text-[var(--text)]">{formatPct(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--border)]/40 bg-white/70 dark:bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${accent}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

function ScoreCard({
  row,
  position,
  isActive,
  isDimmed,
  onSelect,
  onExpand,
}: {
  row: ScoreRow
  position: number
  isActive: boolean
  isDimmed: boolean
  onSelect: (symbol: string | null) => void
  onExpand: (row: ScoreRow) => void
}) {
  const symbol = row.symbol || '—'
  const rank = position || row.rank_overall || '—'
  const palette = isActive
    ? 'border-[var(--brand2)]/70 bg-gradient-to-br from-[var(--brand2)]/16 via-white to-white shadow-[0_32px_94px_rgba(112,88,255,0.25)] dark:from-[var(--brand2)]/24 dark:via-[#0b1325] dark:to-[#0b1325]'
    : 'border-[var(--border)]/60 bg-white/97 shadow-[0_22px_70px_rgba(15,23,42,0.12)] dark:bg-[var(--panel)]/80'
  const dimmed = isDimmed ? 'opacity-45 scale-[0.985] blur-[0.2px]' : ''

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      onClick={() => onSelect(row.symbol || null)}
      className={`group relative flex cursor-pointer flex-col gap-6 rounded-2xl border px-6 py-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_36px_110px_rgba(15,23,42,0.18)] ${palette} ${dimmed}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <span
        className={`pointer-events-none absolute inset-0 rounded-2xl border border-white/30 transition-opacity duration-200 ${
          isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-50'
        }`}
      />
      <span
        className={`pointer-events-none absolute -top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(176,151,255,0.22),transparent_65%)] blur-xl transition-opacity duration-200 ${
          isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-50'
        }`}
      />

      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.12)] dark:bg-[var(--panel)]/70">
              <CompanyLogo symbol={symbol} className="h-full w-full" />
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Rank</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--text)]">{rank}</span>
                <span className="rounded-full border border-[var(--border)]/40 bg-white/90 px-2 py-0.5 text-[11px] text-[var(--muted)] dark:bg-white/10">
                  {row.sector || '—'}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">{row.industry || '—'}</div>
            </div>
          </div>

          <div className="text-left lg:text-right">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Symbol</div>
            <div className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{symbol}</div>
          </div>
        </div>

        <div className="grid gap-3">
          {SCORE_KEYS.map((item) => (
            <ScoreBar key={item.key} value={row[item.key] as number | undefined} label={item.label} accent={item.accent} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onExpand(row)
            }}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--brand2)]/60 bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--brand1)] transition hover:bg-[var(--brand2)]/12"
          >
            View analysis
          </button>
        </div>
      </div>
    </motion.article>
  )
}

function buildScoreInsights(row: ScoreRow) {
  return SCORE_KEYS.map((item) => ({
    key: item.key,
    label: item.label,
    accent: item.accent,
    value: row[item.key] as number | undefined,
    narrative: describeScore(item.key, row),
  }))
}

function describeScore(key: keyof ScoreRow, row: ScoreRow) {
  const pct = formatPct(row[key] as number | undefined)
  switch (key) {
    case 'score_fundamentals': {
      const metrics = [
        row.pe != null ? `P/E ${formatNumber(row.pe, 1)}` : null,
        row.ev_ebitda != null ? `EV/EBITDA ${formatNumber(row.ev_ebitda, 1)}` : null,
      ].filter(Boolean)
      const metricText = metrics.length ? ` Key inputs: ${metrics.join(', ')}.` : ''
      return `Composite profitability and balance-sheet percentile. ${pct} indicates the company screens better than most peers on core fundamentals.${metricText}`
    }
    case 'score_valuation': {
      const pt = row.pt_consensus != null ? `Street PT ${formatCurrency(row.pt_consensus, 0)}` : null
      const price = row.px != null ? `spot price ${formatCurrency(row.px, 2)}` : null
      const parts = [price, pt].filter(Boolean)
      const detail = parts.length ? ` Anchors: ${parts.join(', ')}.` : ''
      return `Relative valuation percentile across enterprise-value and earnings multiples. ${pct} captures how attractively the name trades versus the coverage universe.${detail}`
    }
    case 'score_sentiment':
      return `${pct} sentiment score derived from alternative data, news tone, and transcript analytics. Higher values highlight sustained positive buzz around the ticker.`
    case 'score_innovation':
      return `${pct} innovation score combines R&D intensity, patent velocity, and product momentum indicators inside the Databricks innovation feed.`
    case 'score_macro':
      return `${pct} macro resilience score captures exposure to rates, inflation, and FX shocks based on SmartWealth macro factor modelling.`
    case 'score_insider':
      return `${pct} insider activity score aggregates Form 4 filings and executive trading behaviours to gauge alignment with shareholders.`
    case 'score_events':
      return `${pct} events score incorporates catalysts tracked in the SmartWealth events lakehouse—earnings surprises, guidance changes, product launches, and regulatory updates.`
    default:
      return '—'
  }
}

function ScoreDetailModal({ row, onClose }: { row: ScoreRow; onClose: () => void }) {
  const symbol = row.symbol || '—'
  const rank = row.rank_overall || '—'
  const insights = buildScoreInsights(row)
  const topSignal = insights
    .slice()
    .sort((a, b) => ((b.value ?? 0) - (a.value ?? 0)))
    .find((item) => item.value != null)
  const valuation = [
    row.px != null ? { label: 'Spot price', value: `$${formatNumber(row.px, 2)}` } : null,
    row.pe != null ? { label: 'P/E', value: formatNumber(row.pe, 1) } : null,
    row.ev_ebitda != null ? { label: 'EV/EBITDA', value: formatNumber(row.ev_ebitda, 1) } : null,
    row.pt_consensus != null ? { label: 'Street PT', value: formatCurrency(row.pt_consensus, 0) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  const infoChips = [
    row.sector ? `Sector • ${row.sector}` : null,
    row.industry ? `Industry • ${row.industry}` : null,
    row.as_of ? `As of ${new Date(row.as_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : null,
  ].filter(Boolean) as string[]

  const overallPct = formatPct(row.overall_score)

  return (
    <motion.div
      key={symbol}
      className="fixed inset-0 z-[360] flex items-center justify-center bg-black/45 px-4 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-white text-[var(--text)] shadow-[0_50px_140px_rgba(15,23,42,0.32)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(177,140,255,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(124,240,255,0.14),transparent_60%)]" />
        <div className="relative z-10 flex max-h-[90vh] flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-4 border-b border-[var(--border)]/40 px-8 py-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand2)]/40 bg-[var(--brand2)]/16 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--brand1)]">
                SmartWealth highlight
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-5xl font-black tracking-tight text-[var(--text)]">{symbol}</span>
                <span className="rounded-full border border-[var(--border)]/40 bg-white/90 px-3 py-1 text-xs text-[var(--muted)]">Rank {rank}</span>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                SmartWealth’s composite model places {symbol} in the {overallPct} percentile across our monitored universe.
                {topSignal
                  ? ` Signal strength is led by ${topSignal.label.toLowerCase()} at ${formatPct(topSignal.value)}, anchoring the idea.`
                  : ''}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                {infoChips.map((chip, idx) => (
                  <span key={`${chip}-${idx}`} className="rounded-full border border-[var(--border)]/40 bg-white/95 px-3 py-1">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 text-right">
              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]/50 bg-white/95 text-sm font-semibold text-[var(--muted)] shadow-sm transition hover:bg-[var(--brand2)]/20 hover:text-[var(--brand1)]"
              >
                ✕
              </button>
              <div className="rounded-3xl border border-[var(--border)]/35 bg-white/90 px-6 py-4 shadow-[0_16px_48px_rgba(15,23,42,0.12)]">
                <div className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Overall score</div>
                <div className="mt-2 text-5xl font-black text-[var(--brand2)]">
                  {formatNumber((row.overall_score ?? 0) * 100, 1)}
                  <span className="ml-1 text-lg font-semibold text-[var(--muted)]">%</span>
                </div>
                <div className="mt-3 text-[11px] text-[var(--muted)]">
                  Composite rank position <span className="font-semibold text-[var(--text)]">{rank}</span> among SmartWealth equities.
                </div>
              </div>
            </div>
          </header>

          <div className="grid flex-1 gap-6 overflow-y-auto px-8 py-8 lg:grid-cols-[1.35fr_1fr]">
            <section className="space-y-5 rounded-2xl border border-[var(--border)]/40 bg-white/96 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Signal breakdown</h3>
                <span className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Percentile</span>
              </div>
              <div className="grid gap-4">
                {insights.map((insight) => {
                  const pct = Math.max(0, Math.min(1, insight.value ?? 0))
                  return (
                    <div key={insight.key as string} className="rounded-2xl border border-[var(--border)]/35 bg-white/98 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[var(--text)]">{insight.label}</span>
                        <span className="text-sm font-bold text-[var(--brand1)]">{formatPct(insight.value)}</span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-[var(--border)]/35 bg-white/70">
                        <div className={`h-full rounded-full bg-gradient-to-r ${insight.accent}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                      <p className="mt-3 text-[12px] leading-snug text-[var(--muted)]">{insight.narrative}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-[var(--border)]/40 bg-white/96 p-5 shadow-[0_16px_52px_rgba(15,23,42,0.1)]">
                <h3 className="text-lg font-semibold">Market snapshot</h3>
                <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                  {valuation.length ? (
                    valuation.map((item, idx) => (
                      <li key={`${item.label}-${idx}`} className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-[var(--text)]">{item.label}</span>
                        <span>{item.value}</span>
                      </li>
                    ))
                  ) : (
                    <li>No valuation metrics available.</li>
                  )}
                </ul>
              </div>

              <div className="rounded-2xl border border-[var(--border)]/40 bg-white/96 p-5 shadow-[0_16px_52px_rgba(15,23,42,0.1)]">
                <h3 className="text-lg font-semibold">Data lineage</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                  Scores originate from the <span className="font-semibold text-[var(--text)]">smartwealth.scores_ranked</span> table in Databricks. Signals blend structured fundamentals, alternative data feeds, insider filings, macro exposures, and event catalysts to justify the composite percentile above.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                  <div className="rounded-xl border border-[var(--border)]/35 bg-white/98 px-3 py-3">
                    <div className="font-semibold text-[var(--text)]">Update cadence</div>
                    <div className="mt-1">Nightly ETL + intraday event refresh</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)]/35 bg-white/98 px-3 py-3">
                    <div className="font-semibold text-[var(--text)]">Coverage</div>
                    <div className="mt-1">Top 1500 US & global large caps</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function Score() {
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sector, setSector] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<ScoreRow | null>(null)

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const refresh = opts?.refresh ?? false
    if (refresh) setRefreshing(true)
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('scores/ranked', {
        params: refresh ? { refresh: 1 } : undefined,
      })
      const items: ScoreRow[] = (data.items || []).map((row: ScoreRow, idx: number) => ({
        ...row,
        rank_overall: row.rank_overall ?? idx + 1,
      }))
      setRows(items)
    } catch (err: any) {
      setError(err?.message || 'Unable to load scores')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sectors = useMemo(() => {
    const uniq = new Set<string>()
    rows.forEach((r) => {
      if (r.sector) uniq.add(r.sector)
    })
    return Array.from(uniq).sort()
  }, [rows])

  const filtered = useMemo(() => {
    if (sector === 'all') return rows
    return rows.filter((r) => (r.sector || '').toLowerCase() === sector.toLowerCase())
  }, [rows, sector])

  const ranked = useMemo(() => {
    const rankedRows = filtered
      .slice()
      .sort((a, b) => (b.overall_score ?? -Infinity) - (a.overall_score ?? -Infinity))
      .map((row, idx) => ({ row, position: idx + 1 }))
    return rankedRows
  }, [filtered])

  const hero = ranked[0]
  const remainder = ranked.slice(1)

  const sectorName = sector === 'all' ? 'All sectors' : sector

  const sectorStats = useMemo(() => {
    if (!ranked.length) return null
    const count = ranked.length
    const avgOverall =
      ranked.reduce((acc, { row }) => acc + (row.overall_score ?? 0), 0) / count
    const avgInnovation =
      ranked.reduce((acc, { row }) => acc + (row.score_innovation ?? 0), 0) / count
    const avgInsider =
      ranked.reduce((acc, { row }) => acc + (row.score_insider ?? 0), 0) / count
    return {
      count,
      avgOverall,
      avgInnovation,
      avgInsider,
    }
  }, [ranked])

  const asOf = useMemo(() => {
    if (!rows.length) return null
    return rows[0].as_of || null
  }, [rows])

  const topFive = ranked.slice(0, 5)

  useEffect(() => {
    if (!ranked.length) {
      setActiveSymbol(null)
      return
    }
    setActiveSymbol((prev) => {
      if (prev && ranked.some(({ row }) => row.symbol === prev)) return prev
      return ranked[0].row.symbol || null
    })
  }, [ranked])

  useEffect(() => {
    if (detailRow && !ranked.some(({ row }) => row.symbol === detailRow.symbol)) {
      setDetailRow(null)
    }
  }, [ranked, detailRow])

  const renderLeaderboard = () => {
    if (!topFive.length) return null
    return (
      <div className="rounded-3xl border border-[var(--border)]/45 bg-white/94 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.14)] dark:bg-[var(--panel)]/70">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Top performers</h2>
            <p className="text-xs text-[var(--muted)]">Ranked by overall SmartWealth score</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {topFive.map(({ row, position }) => {
            const sym = row.symbol || null
            const isActive = activeSymbol === sym
            const dimmed = activeSymbol && !isActive ? 'opacity-60' : ''
            return (
              <div
                key={`${row.symbol || position}`}
                onClick={() => setActiveSymbol(sym)}
                className={`group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_18px_48px_rgba(15,23,42,0.16)] ${
                  isActive
                    ? 'border-[var(--brand2)]/60 bg-[var(--brand2)]/14 text-[var(--text)]'
                    : 'border-[var(--border)]/40 bg-white/90 dark:bg-white/10'
                } ${dimmed}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-bold transition ${
                      isActive
                        ? 'border-[var(--brand2)]/60 bg-white text-[var(--brand1)]'
                        : 'border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]'
                    }`}
                  >
                    #{position}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">{row.symbol}</div>
                    <div className="text-[11px] text-[var(--muted)]">{row.industry || row.sector || '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--muted)]">
                  <span className="hidden sm:inline">Overall {formatPct(row.overall_score)}</span>
                  <span className="hidden sm:inline">Innovation {formatPct(row.score_innovation)}</span>
                  <span className="hidden md:inline">Insider {formatPct(row.score_insider)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDetailRow(row)
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--brand2)]/60 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--brand1)] transition hover:bg-[var(--brand2)]/20"
                  >
                    View
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderInsights = () => {
    if (!ranked.length || !sectorStats) return null
    return (
      <div className="grid gap-4 rounded-3xl border border-[var(--border)]/40 bg-[var(--panel)]/40 p-6 text-sm text-[var(--muted)] md:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide">Companies analysed</div>
          <div className="mt-1 text-3xl font-bold text-[var(--text)]">{sectorStats.count}</div>
          <p className="mt-2 text-xs">{sectorName} universe currently monitored.</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide">Avg. overall score</div>
          <div className="mt-1 text-3xl font-bold text-[var(--brand2)]">{formatNumber(sectorStats.avgOverall * 100, 1)}%</div>
          <p className="mt-2 text-xs">Composite SmartWealth score across the cohort.</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide">Innovation & insider pulse</div>
          <div className="mt-1 flex items-baseline gap-3 text-[var(--text)]">
            <span className="text-2xl font-semibold">{formatNumber(sectorStats.avgInnovation * 100, 1)}%</span>
            <span className="text-xs text-[var(--muted)]">Innovation avg.</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3 text-[var(--text)]">
            <span className="text-2xl font-semibold">{formatNumber(sectorStats.avgInsider * 100, 1)}%</span>
            <span className="text-xs text-[var(--muted)]">Insider avg.</span>
          </div>
          <p className="mt-2 text-xs">Signals how ideas and insiders align in this segment.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <section className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Equity Scoreboard</h1>
          <p className="text-sm text-[var(--muted)]">
            Choose a sector to surface the highest conviction names ranked by SmartWealth’s composite model.
          </p>
          {asOf && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--border)]/50 bg-black/10 px-3 py-1 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--brand2)]" />
              As of {new Date(asOf).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Sector</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm outline-none"
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => load({ refresh: true })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:text-[var(--text)]"
            title="Refresh data from Databricks"
            disabled={refreshing}
          >
            <svg
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 16v-4h-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 14.5a6 6 0 0 1 0-8.5L8 8" />
              <path d="M14.5 5.5a6 6 0 0 1 0 8.5L12 12" />
            </svg>
          </button>
        </div>
      </header>

      {loading && (
        <div className="grid place-items-center rounded-3xl border border-[var(--border)]/40 bg-[var(--panel)]/40 p-16 text-sm text-[var(--muted)]">
          Loading scorecards…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <motion.div layout className="space-y-6">
          {renderInsights()}
          {hero ? (
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <ScoreCard
                row={hero.row}
                position={hero.position}
                isActive={activeSymbol === (hero.row.symbol || null)}
                isDimmed={!!activeSymbol && activeSymbol !== (hero.row.symbol || null)}
                onSelect={setActiveSymbol}
                onExpand={(row) => setDetailRow(row)}
              />
              {renderLeaderboard()}
            </div>
          ) : null}
          {remainder.length ? (
            <motion.div layout className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {remainder.map(({ row, position }) => (
                <ScoreCard
                  key={row.symbol || position}
                  row={row}
                  position={position}
                  isActive={activeSymbol === (row.symbol || null)}
                  isDimmed={!!activeSymbol && activeSymbol !== (row.symbol || null)}
                  onSelect={setActiveSymbol}
                  onExpand={(r) => setDetailRow(r)}
                />
              ))}
            </motion.div>
          ) : !hero ? (
            <div className="rounded-3xl border border-[var(--border)]/40 bg-[var(--panel)]/50 p-12 text-center text-sm text-[var(--muted)]">
              No companies for this filter.
            </div>
          ) : null}
        </motion.div>
      )}
      </section>
      <AnimatePresence>
        {detailRow && <ScoreDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
      </AnimatePresence>
    </>
  )
}
