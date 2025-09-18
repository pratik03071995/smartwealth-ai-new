import React, { useRef, useState, useEffect } from 'react'
import axios from 'axios'
import { apiBase } from '../services/api'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine
} from 'recharts' // <-- Brush removed

const API_BASE = apiBase
type Msg = { role: 'user' | 'assistant', content: string }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! Ask me about earnings, scoring, or sectors. Try: “show AAPL last 5 years graph”.' }
  ])
  const [input, setInput] = useState('')
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)
  const [graphTitle, setGraphTitle] = useState('AAPL – Last 5 Years (Demo)')
  const [graphData, setGraphData] = useState<{ t: string; v: number }[]>([])
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function buildDemoSeries(len = 60) {
    const out: { t: string; v: number }[] = []; let val = 100
    for (let i = len - 1; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      val += (Math.random() - 0.4) * 2 + 0.6
      out.push({ t: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }), v: Math.round(val * 100) / 100 })
    }
    return out
  }

  function maybeOpenGraph(q: string) {
    const s = q.toLowerCase()
    if (/graph|chart|plot/.test(s) || /last\s*5\s*year/.test(s)) {
      setGraphTitle('AAPL – Last 5 Years (Demo)')
      setGraphData(buildDemoSeries())
      setGraphOpen(true)
      setGraphReady(false); setTimeout(() => setGraphReady(true), 50) // ensure modal paints before chart mounts
      return true
    }
    return false
  }

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    const didGraph = maybeOpenGraph(text)
    setMessages(m => [...m, { role: 'user', content: text }])
    try {
      const { data } = await axios.post(`${API_BASE}/chat`, { message: text })
      setMessages(m => [...m, { role: 'assistant', content: didGraph ? 'Opening a 5-year interactive chart…' : data.reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Error reaching API.' }])
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-xl">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 backdrop-blur">
        {/* SCROLLABLE feed */}
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2 scroll-slim">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-[color:var(--brand2)]/20' : 'bg-[var(--panel)]'}`} >
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{m.role}</div>
              <div className="mt-1 leading-relaxed">{m.content}</div>
            </motion.div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 pr-10 outline-none placeholder:text-[var(--muted)]"
            placeholder="Try: show AAPL last 5 years graph"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' ? send() : undefined}
          />
          <motion.button onClick={send} whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-[var(--brand2)] px-4 py-3 font-semibold text-[var(--btnText)] shadow-glow hover:opacity-90">
            Send
          </motion.button>
        </div>
      </div>

      {/* Chart Modal */}
      {graphOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">  {/* higher z-index */}
          {/* darker overlay so text behind is not readable */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur" onClick={() => setGraphOpen(false)} />
          <div className="relative z-[1001] w-full max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-glow">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">{graphTitle}</div>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span className="rounded px-2 py-1 bg-[var(--panel)] border border-[var(--border)]">5Y</span>
                <span className="rounded px-2 py-1 bg-[var(--panel)] border border-[var(--border)]">AAPL</span>
                <button onClick={() => setGraphOpen(false)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm hover:opacity-90">Close</button>
              </div>
            </div>

            {/* Solid chart background to avoid any see-through */}
            <div className="h-[380px] w-full rounded-xl bg-[var(--bg)] p-1">
              {graphReady ? (
                <ResponsiveContainer width="100%" height="100%" key={graphOpen ? 'open' : 'closed'} >
                  <AreaChart data={graphData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="swFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand2)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="var(--brand1)" stopOpacity={0.12} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(0,0,0,0.08)" className="dark:stroke-[rgba(255,255,255,0.09)]" />
                    <XAxis dataKey="t" stroke="var(--muted)" fontSize={10} minTickGap={24} />
                    <YAxis stroke="var(--muted)" fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip
                      cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
                      contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
                      formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Value']}
                      labelStyle={{ color: 'var(--muted)' }}
                    />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ color: 'var(--text)' }} />
                    <ReferenceLine y={graphData.length ? graphData[graphData.length - 1].v : undefined} stroke="var(--accent-green)" strokeDasharray="4 4" opacity={0.6} />
                    <Area type="monotone" name="AAPL (demo)" dataKey="v" stroke="var(--accent-green)" fill="url(#swFill)" strokeWidth={2.2} activeDot={{ r: 4 }} />
                    {/* Brush removed */}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full grid place-items-center text-[var(--muted)] text-sm">Loading chart…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
