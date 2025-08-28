import React, { useRef, useState, useEffect } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Brush, Legend, ReferenceLine
} from 'recharts'

const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
type Msg = { role: 'user' | 'assistant', content: string }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! Ask me about earnings, scoring, or sectors. Try: “show AAPL last 5 years graph”.' }
  ])
  const [input, setInput] = useState('')
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)   // <-- ensure chart mounts after modal visible
  const [graphTitle, setGraphTitle] = useState('AAPL – Last 5 Years (Demo)')
  const [graphData, setGraphData] = useState<{ t: string; v: number }[]>([])
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function buildDemoSeries(len = 60) {
    const out: { t: string; v: number }[] = []
    let val = 100
    for (let i = len - 1; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      val += (Math.random() - 0.4) * 2 + 0.6
      out.push({ t: d.toLocaleDateString(undefined, { year: '2-digit', month: 'short' }), v: Math.round(val * 100) / 100 })
    }
    return out
  }

  function maybeOpenGraph(q: string) {
    const s = q.toLowerCase()
    const wantsGraph = /graph|chart|plot/.test(s) || /last\s*5\s*year/.test(s)
    if (wantsGraph) {
      setGraphTitle('AAPL – Last 5 Years (Demo)')
      setGraphData(buildDemoSeries())
      setGraphOpen(true)
      // allow modal to paint before mounting chart
      setGraphReady(false)
      setTimeout(() => setGraphReady(true), 50)
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
      const { data } = await axios.post(`${api}/api/chat`, { message: text })
      setMessages(m => [...m, { role: 'assistant', content: didGraph ? 'Opening a 5-year interactive chart…' : data.reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Error reaching API.' }])
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-xl">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        {/* SCROLLABLE feed */}
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2 scroll-slim">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-primary/20' : 'bg-white/5'}`}>
              <div className="text-[10px] uppercase tracking-widest text-white/50">{m.role}</div>
              <div className="mt-1 leading-relaxed">{m.content}</div>
            </motion.div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 pr-10 outline-none placeholder:text-white/40"
            placeholder="Try: show AAPL last 5 years graph"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' ? send() : undefined}
          />
          <motion.button onClick={send} whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-primary px-4 py-3 font-semibold text-black shadow-[0_0_30px_-10px_rgba(177,140,255,0.8)] hover:opacity-90">
            Send
          </motion.button>
        </div>
      </div>

      {/* Chart Modal */}
      {graphOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur" onClick={() => setGraphOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-white/15 bg-[#0d0e14] p-5 shadow-[0_0_40px_-10px_rgba(177,140,255,0.9)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">{graphTitle}</div>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className="rounded px-2 py-1 bg-white/5 border border-white/10">5Y</span>
                <span className="rounded px-2 py-1 bg-white/5 border border-white/10">AAPL</span>
                <button onClick={() => setGraphOpen(false)} className="ml-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10">Close</button>
              </div>
            </div>

            <div className="h-[380px] w-full">
              {graphReady && (
                <ResponsiveContainer width="100%" height="100%" key={graphOpen ? 'opened' : 'closed'}>
                  <AreaChart data={graphData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="swFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b18cff" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#7b5bfb" stopOpacity={0.12} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#ffffff15" strokeDasharray="3 3" />
                    <XAxis dataKey="t" stroke="#a7a3ff" fontSize={10} minTickGap={24} />
                    <YAxis stroke="#a7a3ff" fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip
                      cursor={{ stroke: '#ffffff30', strokeWidth: 1 }}
                      contentStyle={{ background: '#0f1022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white' }}
                      formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Value']}
                      labelStyle={{ color: '#a7a3ff' }}
                    />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ color: 'white' }} />
                    <ReferenceLine y={graphData.length ? graphData[graphData.length - 1].v : undefined} stroke="#22c55e" strokeDasharray="4 4" opacity={0.6} />
                    <Area type="monotone" name="AAPL (demo)" dataKey="v" stroke="#22c55e" fill="url(#swFill)" strokeWidth={2.2} activeDot={{ r: 4 }} />
                    <Brush height={22} travellerWidth={10} stroke="#a78bfa" fill="rgba(167,139,250,0.1)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {!graphReady && <div className="h-full w-full grid place-items-center text-white/60 text-sm">Loading chart…</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
