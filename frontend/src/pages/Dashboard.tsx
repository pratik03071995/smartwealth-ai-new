import React from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

type WL = { symbol: string; price: number; change: number; series: { x: string; y: number }[] }

const SAMPLE_WATCHLIST: WL[] = [
  {
    symbol: 'AAPL',
    price: 197.3,
    change: +1.26,
    series: makeSeries([187, 189, 191, 193, 192, 196, 197]),
  },
  { symbol: 'MSFT', price: 408.5, change: +2.05, series: makeSeries([399, 402, 404, 406, 408]) },
  { symbol: 'GOOGL', price: 158.37, change: -0.21, series: makeSeries([160, 159, 158, 158.5, 158.37]) },
  { symbol: 'AMZN', price: 181.1, change: +2.29, series: makeSeries([176, 177, 179, 180, 181.1]) },
  { symbol: 'NVDA', price: 953.65, change: +2.89, series: makeSeries([920, 930, 940, 945, 953.65]) },
]

const MARKET_SUMMARY = [
  { name: 'S&P 500', code: 'SPX', value: 5136.2, delta: +0.43 },
  { name: 'Dow Jones', code: 'DJI', value: 38338.5, delta: +0.35 },
  { name: 'NASDAQ', code: 'COMP', value: 17021.4, delta: +2.56 },
  { name: 'Nikkei 225', code: 'N225', value: 38362.3, delta: -0.50 },
  { name: 'FTSE 100', code: 'UKX', value: 8260.95, delta: +2.33 },
  { name: 'DAX', code: 'DAX', value: 17851.43, delta: -0.13 },
]

const FX = [
  { pair: 'EUR → USD', value: 1.08, delta: +0.07 },
  { pair: 'USD → JPY', value: 151.2, delta: -0.04 },
  { pair: 'GBP → USD', value: 1.27, delta: +0.03 },
  { pair: 'USD → CAD', value: 1.30, delta: +0.02 },
]

export default function Dashboard() {
  const { user } = useAuth()
  const [selected, setSelected] = React.useState<WL>(SAMPLE_WATCHLIST[0])
  const [range, setRange] = React.useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'All'>('1M')

  const mainSeries = React.useMemo(() => {
    // For dummy data just reuse with minor smoothing per range
    const base = selected.series
    if (range === '1D') return base.slice(-8)
    if (range === '1W') return base
    if (range === '1M') return densify(base, 24)
    if (range === '3M') return densify(base, 36)
    if (range === '1Y') return densify(base, 60)
    return densify(base, 90)
  }, [selected, range])

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <KPI title="Portfolio Value" value="$1,245,320" trend="▲ +0.84% today" />
        <KPI title="Today P/L" value="+$10,480" trend="▲ +0.84%" />
        <KPI title="Top Gainer" value="NVDA" trend="▲ +2.9%" />
        <KPI title="Top Loser" value="GOOGL" trend="▼ -0.2%" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr_320px]">
        <div className="space-y-3">
          <Card title="Watchlist">
            <ul className="space-y-2 text-sm">
              {SAMPLE_WATCHLIST.map((item) => (
                <li
                  key={item.symbol}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--divider)] bg-white p-3 transition hover:bg-black/[0.02] ${
                    selected.symbol === item.symbol ? 'ring-1 ring-[var(--brand2)]' : ''
                  }`}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{item.symbol}</span>
                      <span className={`text-xs ${item.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {item.change >= 0 ? '+' : ''}
                        {item.change.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-1 text-[var(--text-tertiary)]">${item.price.toFixed(2)}</div>
                  </div>
                  <div className="h-10 w-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={item.series} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`wl-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="y" stroke="#2563eb" fill={`url(#wl-${item.symbol})`} strokeWidth={1.6} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div>
          <Card title=" ">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold">{selected.symbol}</div>
              <div className="flex gap-1 text-xs">
                {(['1D', '1W', '1M', '3M', '1Y', 'All'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-lg border px-2 py-1 ${
                      range === r
                        ? 'border-[var(--divider)] bg-black/[0.03] text-[var(--text-primary)]'
                        : 'border-[var(--divider)] bg-white text-[var(--text-tertiary)] hover:bg-black/[0.03]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mainSeries} margin={{ top: 10, left: 6, right: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mainArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" hide tickLine={false} axisLine={false} />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip cursor={{ stroke: 'rgba(30,41,59,0.2)' }} contentStyle={{ borderRadius: 12, border: '1px solid var(--divider)' }} />
                  <Area type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={1.8} fill="url(#mainArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card title="Global Markets">
            <div className="space-y-2 text-sm">
              {MARKET_SUMMARY.map((m) => (
                <div key={m.code} className="flex items-center justify-between rounded-lg border border-[var(--divider)] bg-white px-3 py-2">
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">{m.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{m.value.toLocaleString()}</div>
                    <div className={`text-xs ${m.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.delta >= 0 ? '+' : ''}
                      {m.delta.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Currency Exchange">
            <div className="space-y-2 text-sm">
              {FX.map((f) => (
                <div key={f.pair} className="flex items-center justify-between rounded-lg border border-[var(--divider)] bg-white px-3 py-2">
                  <div className="font-medium">{f.pair}</div>
                  <div className={`text-right ${f.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {f.value.toFixed(2)} <span className="text-xs">({f.delta >= 0 ? '+' : ''}{f.delta.toFixed(2)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="text-sm text-[var(--text-tertiary)]">Welcome, {user?.name}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--divider)] bg-white p-4 shadow-sm">
      {title.trim() ? <div className="mb-3 text-sm font-semibold">{title}</div> : null}
      {children}
    </div>
  )
}

function KPI({ title, value, trend }: { title: string; value: string; trend: string }) {
  return (
    <div className="rounded-2xl border border-[var(--divider)] bg-white p-4">
      <div className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="text-xs text-[var(--text-tertiary)]">{trend}</div>
    </div>
  )
}

function makeSeries(points: number[]): { x: string; y: number }[] {
  return points.map((y, i) => ({ x: `${i + 1}`, y }))
}

function densify(base: { x: string; y: number }[], count: number) {
  if (base.length >= count) return base
  const out: { x: string; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const idx = t * (base.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(base.length - 1, lo + 1)
    const frac = idx - lo
    const y = base[lo].y * (1 - frac) + base[hi].y * frac
    out.push({ x: `${i + 1}`, y })
  }
  return out
}
