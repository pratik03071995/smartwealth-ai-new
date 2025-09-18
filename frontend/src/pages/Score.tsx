import React, { useState } from 'react'
import api from '../services/api'

export default function Score() {
  const [symbol, setSymbol] = useState('AAPL')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const { data } = await api.get('score', { params: { symbol } })
      setData(data)
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 className="mb-4 text-3xl font-bold">Scoring</h2>
      <div className="mb-4 flex gap-2">
        <input className="rounded-xl px-4 py-3 bg-[var(--panel)] border border-[var(--border)]" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
        <button onClick={run} className="rounded-xl bg-[var(--brand2)] px-4 py-3 font-semibold text-[var(--btnText)] shadow-glow hover:opacity-90">
          {loading ? 'Scoring...' : 'Score'}
        </button>
      </div>
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl p-5 bg-[var(--panel)] border border-[var(--border)]">
            <div className="text-sm text-[var(--muted)]">Symbol</div>
            <div className="text-2xl font-bold">{data.symbol}</div>
            <div className="mt-4 text-sm text-[var(--muted)]">Overall</div>
            <div className="text-4xl font-extrabold">{data.overall}</div>
            <div className="mt-2 rounded-xl bg-black/5 dark:bg-white/5 px-3 py-1 text-sm">Verdict: <span className="font-semibold">{data.verdict}</span></div>
          </div>
          <div className="rounded-2xl p-5 bg-[var(--panel)] border border-[var(--border)]">
            <div className="mb-3 text-sm text-[var(--muted)]">Factors</div>
            <div className="space-y-2">
              {Object.entries(data.factors).map(([k,v]: any) => (
                <div key={k} className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2">
                  <span className="capitalize">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
