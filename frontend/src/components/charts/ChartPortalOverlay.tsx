import React from 'react'
import { createPortal } from 'react-dom'

type Point = { t: string; close: number }

function toXY(points: Point[]) {
  return points.map((p, i) => ({ x: i, y: Number(p.close) }))
}

function buildPath(pts: { x: number; y: number }[], w: number, h: number, pad = 16) {
  if (!pts.length) return ''
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (v: number) => pad + ((w - pad * 2) * (v - minX)) / (maxX - minX || 1)
  const sy = (v: number) => h - pad - ((h - pad * 2) * (v - minY)) / (maxY - minY || 1)
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
    .join(' ')
}

function round(num: number, places: number) {
  const factor = 10 ** places
  return Math.round(num * factor) / factor
}

export default function ChartPortalOverlay() {
  const [open, setOpen] = React.useState(true)
  const [chart, setChart] = React.useState<any>(null)

  React.useEffect(() => {
    const w = window as any
    try { w.__SW_OVERLAY_MOUNTED__ = true } catch {}
    const sync = () => {
      if (w.__SW_LAST_CHART__) setChart(w.__SW_LAST_CHART__)
      else if (w.SW_LAST_CHART) setChart(w.SW_LAST_CHART)
    }
    const id = window.setInterval(sync, 600)
    sync()
    return () => window.clearInterval(id)
  }, [])

  if (!open || !chart) return null

  const series = (chart.series && chart.series[0] && chart.series[0].points) || []
  const pts = toXY(series)
  const W = 720
  const H = 260
  const d = buildPath(pts, W, H, 18)

  return createPortal(
    <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
      <div className="rounded-2xl border border-[var(--divider)] bg-white p-3 shadow-[0_22px_66px_rgba(17,23,41,0.24)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{chart.symbol} (overlay)</div>
          <button className="text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="overlay-chart">
          <defs>
            <linearGradient id="overlayFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
          <path d={d} stroke="#2563eb" strokeWidth="2" fill="none" />
        </svg>
      </div>
    </div>,
    document.body,
  )
}
