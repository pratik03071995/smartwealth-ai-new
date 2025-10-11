import React from 'react'
import { createPortal } from 'react-dom'

type Point = { t: string; close: number }

function toXY(points: Point[]) {
  return points.map((p, i) => ({ x: i, y: Number(p.close) }))
}

function buildPath(pts: { x: number; y: number }[], w: number, h: number) {
  if (!pts.length) return ''
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 6
  const sx = (v: number) => pad + ((w - pad * 2) * (v - minX)) / (maxX - minX || 1)
  const sy = (v: number) => h - pad - ((h - pad * 2) * (v - minY)) / (maxY - minY || 1)
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
    .join(' ')
}

export default function ChartBannerPortal() {
  const [open, setOpen] = React.useState(true)
  const [chart, setChart] = React.useState<any>(null)

  React.useEffect(() => {
    const w = window as any
    const sync = () => {
      if (w.__SW_LAST_CHART__) setChart(w.__SW_LAST_CHART__)
      else if (w.SW_LAST_CHART) setChart(w.SW_LAST_CHART)
    }
    const id = window.setInterval(sync, 500)
    sync()
    return () => window.clearInterval(id)
  }, [])

  if (!open || !chart) return null
  const series = (chart.series && chart.series[0] && chart.series[0].points) || []
  const pts = toXY(series)
  const W = 260
  const H = 36
  const d = buildPath(pts, W, H)

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000 }}>
      <div className="mx-auto mt-2 flex w-[min(1080px,95vw)] items-center justify-between rounded-xl border border-[var(--divider)] bg-white/95 px-3 py-2 shadow-[0_16px_42px_rgba(17,23,41,0.18)] backdrop-blur">
        <div className="text-xs font-semibold text-[var(--text)]">
          Chart payload received • {chart.symbol} • {(series && series.length) || 0} pts
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="banner-chart">
          <defs>
            <linearGradient id="bannerFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={d} stroke="#2563eb" strokeWidth={2} fill="none" />
        </svg>
        <button className="rounded-md border border-[var(--divider)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}

