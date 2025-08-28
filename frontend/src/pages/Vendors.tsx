import React, { useState } from 'react'
import axios from 'axios'

const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export default function Vendors() {
  const [items, setItems] = useState<any[]>([])

  async function load() {
    const { data } = await axios.get(`${api}/api/vendors`)
    setItems(data.vendors || [])
  }

  return (
    <div>
      <h2 className="mb-4 text-3xl font-bold">Vendors</h2>
      <button onClick={load} className="mb-4 rounded-xl bg-primary px-4 py-3 font-semibold text-black shadow-glow hover:opacity-90">Load</button>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((v, idx) => (
          <div key={idx} className="glass rounded-2xl p-5">
            <div className="text-xl font-semibold">{v.name}</div>
            <div className="mt-2 text-sm text-white/60">Status: <span className="font-semibold">{v.status}</span></div>
            <div className="mt-2 text-sm text-white/60">{v.notes}</div>
          </div>
        ))}
        {!items.length && <div className="text-white/50">Click Load to fetch vendors.</div>}
      </div>
    </div>
  )
}
