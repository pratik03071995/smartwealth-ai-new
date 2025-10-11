import React from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type StockPoint = { t: string; close: number }

type Props = {
  symbol: string
  points: StockPoint[]
  window?: string
  availableWindows?: string[]
  onSelectWindow?: (w: string) => void
  isLoading?: boolean
  headline?: string
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function windowTickFormatter(window: string) {
  if (window === '1D' || window === '1W') {
    return (value: number) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (window === '1M' || window === '3M') {
    return (value: number) => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  if (window === 'All') {
    return (value: number) => new Date(value).getFullYear().toString()
  }
  return (value: number) => new Date(value).toLocaleDateString([], { month: 'short', year: 'numeric' })
}

type ChartDatum = { x: number; close: number; label: string }

function toChartData(points: StockPoint[]): ChartDatum[] {
  return points
    .map((p) => {
      const raw = typeof p.t === 'number' ? p.t : Date.parse(p.t)
      if (!Number.isFinite(raw) || Number.isNaN(p.close)) return null
      const ts = typeof p.t === 'number' && p.t < 1_000_000_000_000 ? p.t * 1000 : raw
      return {
        x: ts,
        close: p.close,
        label: new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      }
    })
    .filter((entry): entry is ChartDatum => !!entry)
}

function computeChange(points: ChartDatum[]) {
  if (!points.length) return { change: 0, changePct: 0 }
  const first = points[0]?.close
  const last = points[points.length - 1]?.close
  if (typeof first !== 'number' || typeof last !== 'number' || Number.isNaN(first) || Number.isNaN(last)) {
    return { change: 0, changePct: 0 }
  }
  const change = last - first
  const changePct = first !== 0 ? (change / first) * 100 : 0
  return { change, changePct }
}

export default function StockLineCard({
  symbol,
  points,
  window = '1Y',
  availableWindows,
  onSelectWindow,
  isLoading = false,
  headline,
}: Props) {
  const chartData = React.useMemo(() => {
    const data = toChartData(points)
    return data.sort((a, b) => a.x - b.x)
  }, [points])
  const lastPrice = chartData.length ? chartData[chartData.length - 1].close : null
  const rawChange = React.useMemo(() => computeChange(chartData), [chartData])
  const normalizedChange = Math.abs(rawChange.change) < 0.005 ? 0 : rawChange.change
  const normalizedPct = Math.abs(rawChange.changePct) < 0.005 ? 0 : rawChange.changePct
  const isGain = normalizedChange > 0
  const isLoss = normalizedChange < 0
  const strokeColor = isGain ? '#16a34a' : isLoss ? '#dc2626' : '#0ea5e9'
  const changeTone = isGain ? 'text-[#0f9d58]' : isLoss ? 'text-[#d93025]' : 'text-[#64748b]'
  const changeValue = `${isGain ? '+' : isLoss ? '-' : ''}${currencyFormatter.format(Math.abs(normalizedChange))}`
  const changePctLabel = `${isGain ? '+' : isLoss ? '-' : ''}${normalizedPct.toFixed(2)}%`
  const fillGradientId = React.useMemo(() => `stock-fill-${symbol}-${window}`.replace(/[^a-zA-Z0-9-_]/g, ''), [symbol, window])
  const windows = availableWindows && availableWindows.length ? availableWindows : ['1D', '1W', '1M', '3M', '1Y', 'All']
  const tickFormatter = React.useMemo(() => windowTickFormatter(window), [window])
  const yDomain = React.useMemo(() => {
    if (!chartData.length) return ['auto', 'auto']
    const values = chartData.map((entry) => entry.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    const pad = range === 0 ? Math.max(min * 0.005, 0.5) : Math.max(range * 0.12, (min + max) * 0.0025)
    const lower = Math.max(0, min - pad)
    const upper = max + pad
    return [lower, upper] as [number, number]
  }, [chartData])

  return (
    <div className="rounded-3xl border border-[#e1e5ee] bg-white p-4 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-lg font-semibold capitalize text-[#0f172a]">
            {headline || `${symbol} price`}
          </div>
          {lastPrice !== null ? (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <span className="text-3xl font-semibold tracking-tight text-[#0f172a]">
                {currencyFormatter.format(lastPrice)}
              </span>
              <span className={`font-medium ${changeTone}`}>{`${changeValue} (${changePctLabel})`}</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-[#64748b]">
          {windows.map((w) => (
            <button
              key={w}
              onClick={() => onSelectWindow?.(w)}
              disabled={isLoading}
              className={`rounded-xl border px-2.5 py-1 transition ${
                window === w
                  ? 'border-[#d0d7e6] bg-[#f1f5f9] text-[#0f172a]'
                  : 'border-transparent bg-[#f8fafc] text-[#64748b] hover:bg-[#eef2f8]'
              } ${isLoading ? 'opacity-60' : ''}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-[#94a3b8]">Updating…</div>
        ) : chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 18, left: 12, bottom: 14 }}
            >
              <defs>
                <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="x"
                tickFormatter={tickFormatter}
                stroke="#cbd5f5"
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                minTickGap={24}
              />
              <YAxis
                dataKey="close"
                stroke="#cbd5f5"
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => currencyFormatter.format(value as number)}
                width={64}
                orientation="left"
                mirror={false}
                domain={yDomain}
              />
              <Tooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                formatter={(value: number) => currencyFormatter.format(value)}
                labelFormatter={(label) => new Date(Number(label)).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                contentStyle={{
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
                }}
                itemStyle={{ color: '#0f172a' }}
                labelStyle={{ color: '#64748b', fontWeight: 500 }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={strokeColor}
                strokeWidth={2.2}
                fill={`url(#${fillGradientId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: strokeColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-sm text-[#94a3b8]">No data</div>
        )}
      </div>
    </div>
  )
}
