import React, { useMemo, useState, useEffect } from 'react'
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

function ScoreCard({ row }: { row: ScoreRow }) {
  const symbol = row.symbol || '—'
  const rank = row.rank_overall ?? '—'
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

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get('scores/ranked')
        if (!mounted) return
        const items: ScoreRow[] = (data.items || []).map((row: ScoreRow, idx: number) => ({
          ...row,
          rank_overall: row.rank_overall ?? idx + 1,
        }))
        setRows(items)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Unable to load scores')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

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

  const asOf = useMemo(() => {
    if (!rows.length) return null
    return rows[0].as_of || null
  }, [rows])

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Equity Scoreboard</h1>
          <p className="text-sm text-[var(--muted)]">Ranked by overall composite score. </p>
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
        <motion.div layout className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <ScoreCard key={row.symbol} row={row} />
          ))}
          {!filtered.length && (
            <div className="col-span-full rounded-3xl border border-[var(--border)]/40 bg-[var(--panel)]/50 p-12 text-center text-sm text-[var(--muted)]">
              No companies for this filter.
            </div>
          )}
        </motion.div>
      )}
    </section>
  )
}
