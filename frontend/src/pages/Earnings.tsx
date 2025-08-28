import React, { useState } from 'react'
import axios from 'axios'

const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export default function Earnings() {
  const [symbol, setSymbol] = useState('AAPL')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function fetchIt() {
    setLoading(true)
    try {
      const { data } = await axios.get(`${api}/api/earnings`, { params: { symbol } })
      setItems(data.items || [])
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2 className="mb-4 text-3xl font-bold">Earnings</h2>
      <div className="mb-4 flex gap-2">
        <input className="glass rounded-xl px-4 py-3" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
        <button onClick={fetchIt} className="rounded-xl bg-primary px-4 py-3 font-semibold text-black shadow-glow hover:opacity-90">
          {loading ? 'Loading...' : 'Fetch'}
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/5">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Report Date</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Est. EPS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, idx) => (
              <tr key={idx} className="odd:bg-white/5">
                <td className="px-4 py-3">{row.symbol}</td>
                <td className="px-4 py-3">{row.reportDate}</td>
                <td className="px-4 py-3">{row.period}</td>
                <td className="px-4 py-3">{row.estimateEPS}</td>
              </tr>
            ))}
            {!items.length && <tr><td className="px-4 py-6 text-white/50" colSpan={4}>No data yet. Try fetching.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
