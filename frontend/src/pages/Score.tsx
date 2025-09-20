import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
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
      <div className="h-2 w-full rounded-full bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${accent}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

function ScoreCard({ row, position }: { row: ScoreRow; position: number }) {
  const symbol = row.symbol || '—'
  const rank = position || row.rank_overall || '—'
  const valuationItems = [
    row.ev_ebitda != null ? `EV/EBITDA ${formatNumber(row.ev_ebitda, 1)}` : null,
    row.pe != null ? `P/E ${formatNumber(row.pe, 1)}` : null,
    row.pt_consensus != null ? `PT ${formatCurrency(row.pt_consensus, 0)}` : null,
  ].filter(Boolean) as string[]

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative flex flex-col gap-5 rounded-3xl border border-[var(--border)]/60 bg-[var(--panel)]/80 p-6 shadow-glow backdrop-blur"
    >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
              <CompanyLogo symbol={symbol} className="h-full w-full" />
            </div>
            <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Rank</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-[var(--text)]">{rank}</span>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                {row.sector || '—'}
              </span>
            </div>
            <div className="mt-1 text-sm text-[var(--muted)]">{row.industry}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Symbol</div>
          <div className="text-2xl font-extrabold">{symbol}</div>
          <div className="mt-2 grid gap-1 text-[11px] text-[var(--muted)]">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)]/60 bg-black/10 px-3 py-1">
              <span className="font-semibold text-[var(--text)]">Price</span>
              <span>${formatNumber(row.px, 2)}</span>
            </div>
            {valuationItems.length ? (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)]/50 bg-black/5 px-3 py-1">
                {valuationItems.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <span>{item}</span>
                    {idx < valuationItems.length - 1 ? <span>•</span> : null}
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-2xl border border-[var(--border)]/40 bg-black/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Overall score</div>
              <div className="text-3xl font-bold text-[var(--brand2)]">
                {formatNumber((row.overall_score ?? 0) * 100, 1)}
              </div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--brand2)]/20 to-[var(--brand1)]/10 text-lg font-bold">
              {formatPct(row.overall_score)}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {SCORE_KEYS.map((item) => (
            <ScoreBar key={item.key} value={row[item.key] as number | undefined} label={item.label} accent={item.accent} />
          ))}
        </div>
      </div>
    </motion.article>
  )
}

export default function Score() {
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sector, setSector] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)

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

  const renderLeaderboard = () => {
    if (!topFive.length) return null
    return (
      <div className="rounded-3xl border border-[var(--border)]/50 bg-[var(--panel)]/50 p-5 shadow-inner">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Top performers</h2>
            <p className="text-xs text-[var(--muted)]">Ranked by overall SmartWealth score</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {topFive.map(({ row, position }) => (
            <div
              key={row.symbol}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)]/40 bg-black/10 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-sm font-bold">
                  #{position}
                </span>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{row.symbol}</div>
                  <div className="text-[11px] text-[var(--muted)]">{row.industry || row.sector || '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-[var(--muted)]">
                <span>Overall {formatPct(row.overall_score)}</span>
                <span className="hidden sm:inline">Innovation {formatPct(row.score_innovation)}</span>
                <span className="hidden md:inline">Insider {formatPct(row.score_insider)}</span>
              </div>
            </div>
          ))}
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
              <ScoreCard row={hero.row} position={hero.position} />
              {renderLeaderboard()}
            </div>
          ) : null}
          {remainder.length ? (
            <motion.div layout className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {remainder.map(({ row, position }) => (
                <ScoreCard key={row.symbol} row={row} position={position} />
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
  )
}
