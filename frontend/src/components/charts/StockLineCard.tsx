import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

export type StockPoint = { t: string; close: number }

type Props = {
  symbol: string
  points: StockPoint[]
  window?: string
  availableWindows?: string[]
  onSelectWindow?: (w: string) => void
}

export default function StockLineCard({ symbol, points, window = '1Y', availableWindows, onSelectWindow }: Props) {
  const data = React.useMemo(() => points.map((p, idx) => ({ x: idx + 1, y: p.close })), [points])
  const windows = availableWindows && availableWindows.length
    ? availableWindows
    : ['1D', '1W', '1M', '3M', '1Y', 'All']

  return (
    <div className="rounded-2xl border border-[var(--divider)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{symbol}</div>
        <div className="flex gap-1 text-xs">
          {windows.map((w) => (
            <button
              key={w}
              onClick={() => onSelectWindow?.(w)}
              className={`rounded-lg border px-2 py-1 ${
                window === w
                  ? 'border-[var(--divider)] bg-black/[0.03] text-[var(--text-primary)]'
                  : 'border-[var(--divider)] bg-white text-[var(--text-tertiary)] hover:bg-black/[0.03]'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, left: 6, right: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={`chatArea-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="x" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip cursor={{ stroke: 'rgba(30,41,59,0.2)' }} contentStyle={{ borderRadius: 12, border: '1px solid var(--divider)' }} />
            <Area type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={1.8} fill={`url(#chatArea-${symbol})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

