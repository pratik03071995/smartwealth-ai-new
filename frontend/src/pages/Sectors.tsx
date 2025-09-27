import React, { useEffect, useState } from 'react'
import api from '../services/api'

type SectorRow = {
  name: string
  '1w'?: number
  '1m'?: number
  ytd?: number
}

const formatPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return '—'
  const pct = value >= -1 && value <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}

export default function Sectors() {
  const [items, setItems] = useState<SectorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get('sectors')
        if (!cancelled) {
          const rows = Array.isArray(data?.items) ? data.items : []
          setItems(rows)
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load sectors')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-extrabold">Sector Momentum</h1>
        <p className="text-sm text-[var(--muted)]">Weekly, monthly, and YTD performance pulled from the SmartWealth sectors feed.</p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-white/98 shadow-[0_22px_70px_rgba(15,23,42,0.12)] dark:bg-[var(--panel)]/80">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5 text-[var(--muted)] dark:bg-white/5">
            <tr>
              <th className="px-5 py-3 font-semibold uppercase tracking-[0.18em] text-[11px] text-[var(--muted)]">Sector</th>
              <th className="px-5 py-3 font-semibold uppercase tracking-[0.18em] text-[11px] text-[var(--muted)]">1W</th>
              <th className="px-5 py-3 font-semibold uppercase tracking-[0.18em] text-[11px] text-[var(--muted)]">1M</th>
              <th className="px-5 py-3 font-semibold uppercase tracking-[0.18em] text-[11px] text-[var(--muted)]">YTD</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-[var(--muted)]">
                  Loading sectors…
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-red-500">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-[var(--muted)]">
                  No sector performance data yet.
                </td>
              </tr>
            )}

            {!loading && !error &&
              items.map((row, idx) => (
                <tr key={`${row.name}-${idx}`} className="border-t border-[var(--border)]/40 odd:bg-black/3 dark:odd:bg-white/5">
                  <td className="px-5 py-4 text-base font-semibold text-[var(--text)]">{row.name}</td>
                  <td className="px-5 py-4 font-medium text-[var(--text)]">{formatPercent(row['1w'])}</td>
                  <td className="px-5 py-4 font-medium text-[var(--text)]">{formatPercent(row['1m'])}</td>
                  <td className="px-5 py-4 font-medium text-[var(--text)]">{formatPercent(row.ytd)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
