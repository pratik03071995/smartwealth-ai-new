import React, { useEffect, useState } from 'react'
import axios from 'axios'
const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export default function Sectors() {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => { (async () => {
    const { data } = await axios.get(`${api}/api/sectors`); setItems(data.items || [])
  })() }, [])

  return (
    <div>
      <h2 className="mb-4 text-3xl font-bold">Sectors</h2>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
        <table className="w-full text-left">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3">1w %</th>
              <th className="px-4 py-3">1m %</th>
              <th className="px-4 py-3">YTD %</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s, idx) => (
              <tr key={idx} className="odd:bg-black/5 dark:odd:bg-white/5">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">{s["1w"]}</td>
                <td className="px-4 py-3">{s["1m"]}</td>
                <td className="px-4 py-3">{s["ytd"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
