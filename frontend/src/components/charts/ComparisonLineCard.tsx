import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export type ComparisonPoint = { t: string; close: number }
export type ComparisonSeries = { name: string; points: ComparisonPoint[] }

type SummaryRow = {
  symbol: string
  finalInvestment?: number | null
  returnPct?: number | null
  absoluteReturn?: number | null
}

type Props = {
  series: ComparisonSeries[]
  window: string
  availableWindows?: string[]
  onSelectWindow?: (window: string) => void
  isLoading?: boolean
  baseInvestment: number
  summary?: SummaryRow[]
  activeSymbols: string[]
  onRemoveSymbol?: (symbol: string) => void
  excludedSymbols?: string[]
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const COLORS = ['#2563eb', '#14b8a6', '#f97316', '#f43f5e', '#a855f7', '#0ea5e9']

function toChartData(series: ComparisonSeries[]) {
  return series.map((entry) => ({
    name: entry.name,
    data: (entry.points || [])
      .map((p) => {
        const raw = typeof p.t === 'number' ? p.t : Date.parse(p.t)
        if (!Number.isFinite(raw) || p.close === undefined || p.close === null) return null
        const ts = typeof p.t === 'number' && p.t < 1_000_000_000_000 ? p.t * 1000 : raw
        return {
          x: ts,
          close: Number(p.close),
          name: entry.name,
          label: new Date(ts).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        }
      })
      .filter((value): value is { x: number; close: number; name: string; label: string } => !!value),
  }))
}

function windowTickFormatter(window: string) {
  const normalized = window.toUpperCase()
  if (normalized === '1D' || normalized === '1W') {
    return (value: number) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (normalized === '1M' || normalized === '3M') {
    return (value: number) => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  if (normalized === 'ALL' || normalized === '5Y') {
    return (value: number) => new Date(value).getFullYear().toString()
  }
  return (value: number) => new Date(value).toLocaleDateString([], { month: 'short', year: 'numeric' })
}

const DEFAULT_WINDOWS = ['1M', '3M', '6M', '1Y', '2Y', '5Y']

export default function ComparisonLineCard({
  series,
  window,
  availableWindows,
  onSelectWindow,
  isLoading = false,
  baseInvestment,
  summary,
  activeSymbols,
  onRemoveSymbol,
  excludedSymbols = [],
}: Props) {
  const chartSeries = React.useMemo(() => toChartData(series), [series])
  const windows = availableWindows && availableWindows.length ? availableWindows : DEFAULT_WINDOWS
  const tickFormatter = React.useMemo(() => windowTickFormatter(window), [window])

  const flattened = chartSeries.flatMap((entry) => entry.data)
  const yDomain = React.useMemo(() => {
    if (!flattened.length) return ['auto', 'auto']
    const values = flattened.map((d) => d.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    const pad = range === 0 ? Math.max(min * 0.005, 0.5) : Math.max(range * 0.08, 0.5)
    return [Math.max(0, min - pad), max + pad] as [number, number]
  }, [flattened])

  return (
    <div className="space-y-4 rounded-3xl border border-[#e1e5ee] bg-white p-4 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold text-[#0f172a]">Normalized investment comparison</div>
          <div className="text-xs text-[#6b7280]">Each line shows how ${intFormatter(baseInvestment)} grows over {window.toUpperCase()}.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {windows.map((w) => (
            <button
              key={w}
              onClick={() => onSelectWindow?.(w)}
              disabled={isLoading}
              className={`rounded-full border px-3 py-1 transition ${
                window.toUpperCase() === w.toUpperCase()
                  ? 'border-[#cbd5f5] bg-[#f1f5f9] text-[#0f172a]'
                  : 'border-transparent bg-[#f8fafc] text-[#64748b] hover:bg-[#eef2f8]'
              } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeSymbols.map((sym, idx) => (
          <div key={sym} className="flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--panel)] px-3 py-1 text-xs text-[var(--text)]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
            <span className="font-semibold uppercase tracking-wide">{sym}</span>
            {onRemoveSymbol && activeSymbols.length > 2 ? (
              <button
                type="button"
                onClick={() => onRemoveSymbol(sym)}
                className="rounded-full bg-white/70 px-1 text-[10px] text-[var(--muted)] hover:bg-white"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {excludedSymbols.length ? (
        <div className="text-[11px] text-[#f97316]">
          Unable to plot: {excludedSymbols.join(', ')} (no overlapping data for this window).
        </div>
      ) : null}

      <div className="h-72 w-full">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-[#94a3b8]">Updating…</div>
        ) : chartSeries.some((entry) => entry.data.length) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 12, right: 18, left: 12, bottom: 16 }}>
              <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tickFormatter} stroke="#cbd5f5" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis dataKey="close" stroke="#cbd5f5" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} domain={yDomain} tickFormatter={(value) => currencyFormatter.format(value as number)} width={72} />
              <Tooltip
                formatter={(value: number) => currencyFormatter.format(value)}
                labelFormatter={(label) => new Date(Number(label)).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)' }}
                itemStyle={{ color: '#0f172a' }}
                labelStyle={{ color: '#64748b', fontWeight: 500 }}
              />
              {chartSeries.map((entry, idx) => (
                <Line key={entry.name || idx} type="monotone" data={entry.data} dataKey="close" name={entry.name} stroke={COLORS[idx % COLORS.length]} strokeWidth={2.2} dot={false} connectNulls />
              ))}
              <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11, color: '#4b5563' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-sm text-[#94a3b8]">No overlapping data available.</div>
        )}
      </div>

      {summary && summary.length ? (
        <div className="grid gap-2 text-xs text-[#475569] md:grid-cols-3">
          {summary.map((row) => (
            <div key={row.symbol} className="rounded-2xl border border-[#e2e8f0] bg-[var(--panel)]/70 p-3 shadow-inner">
              <div className="text-[10px] uppercase tracking-[0.32em] text-[#94a3b8]">{row.symbol}</div>
              <div className="mt-1 text-[var(--text)] font-semibold">
                {typeof row.finalInvestment === 'number' ? currencyFormatter.format(row.finalInvestment) : 'n/a'}
              </div>
              <div className="text-[11px] text-[#64748b]">
                Return: {typeof row.returnPct === 'number' ? `${percentFormatter.format(row.returnPct)}%` : 'n/a'}
              </div>
              {typeof row.absoluteReturn === 'number' ? (
                <div className={`text-[11px] ${row.absoluteReturn >= 0 ? 'text-[#0f9d58]' : 'text-[#d93025]'}`}>
                  {row.absoluteReturn >= 0 ? '+' : '-'}{currencyFormatter.format(Math.abs(row.absoluteReturn))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function intFormatter(value: number) {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)
}
