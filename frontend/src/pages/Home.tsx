import React, { useEffect, useRef, useState } from 'react'
import Chat from '../components/Chat'

export default function Home() {
  return (
    <div className="relative">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="mb-3 text-[28px] font-extrabold leading-tight md:text-[40px]">
          Create <span className="gradient-text">Wealth</span> With Just a Prompt
        </h1>
        <p className="mb-6 text-sm md:text-base text-white/70">
          Type a prompt, get insights instantly. Earnings, scores, sectors — powered by AI.
        </p>
      </div>
      <Terminal />
      <Chat />
    </div>
  )
}

const LINES = [
  '$ create-insight "Best semiconductors under $20B?"',
  'Fetching market data…',
  'Scoring fundamentals…',
  'Analyzing momentum & sectors…',
  '✅ Ready. See chat for details.'
]

function Terminal() {
  const [lineIndex, setLineIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [isDone, setIsDone] = useState(false)
  useEffect(() => {
    if (lineIndex >= LINES.length) { setIsDone(true); return }
    const target = LINES[lineIndex]
    let i = 0
    const id = setInterval(() => {
      i += 1; setTyped(target.slice(0, i))
      if (i >= target.length) { clearInterval(id); setTimeout(() => { setLineIndex(n => n + 1); setTyped('') }, 350) }
    }, 18)
    return () => clearInterval(id)
  }, [lineIndex])

  return (
    <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_0_24px_-10px_rgba(177,140,255,0.8)] backdrop-blur">
      <div className="mb-1 flex items-center gap-2 text-[10px] text-white/60">
        <div className="h-2 w-2 rounded-full bg-red-500/80" />
        <div className="h-2 w-2 rounded-full bg-yellow-500/80" />
        <div className="h-2 w-2 rounded-full bg-green-500/80" />
        <span className="ml-auto">smartwealth-terminal</span>
      </div>
      <div className="rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-green-300/90 min-h-[100px]">
        {LINES.slice(0, lineIndex).map((l, i) => <div key={i}>{l}</div>)}
        {lineIndex < LINES.length && (<div>{typed}<span className="ml-1 inline-block w-2 animate-pulse border-b-2 border-green-300/90" /></div>)}
        {isDone && <div className="opacity-70">(Done)</div>}
      </div>
    </div>
  )
}
