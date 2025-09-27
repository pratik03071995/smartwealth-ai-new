import React, { useEffect, useState } from 'react'
import Chat from '../components/Chat'

export default function Home() {
  return (
    <div className="relative">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="mb-3 text-[28px] font-extrabold leading-tight md:text-[40px]">
          Create <span className="gradient-text">Wealth</span> With Just a Prompt
        </h1>

        {/* Updated subtitle with futuristic Powered by AI badge */}
        <p className="mb-6 text-sm md:text-base text-[var(--muted)] whitespace-nowrap flex items-center justify-center gap-2">
          <span>Type a prompt, get insights instantly. Earnings, scores, sectors — </span>
          <PoweredByAIBadge />
        </p>
      </div>
      <Terminal />
      <Chat />
    </div>
  )
}

/* === Futuristic Powered by AI badge === */
function PoweredByAIBadge() {
  return (
    <span
      className="relative inline-flex items-center rounded-full px-2 py-[5px] text-[11px] md:text-[12px] leading-none select-none"
      style={{
        background: '#0A1630',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow:
          'inset 0 0 0 1px rgba(255,255,255,0.04), 0 6px 30px rgba(123,91,251,0.18)',
      }}
      title="Powered by AI"
    >
      <span className="mr-1 font-medium uppercase tracking-[0.16em] text-white/90">powered by</span>
      <span
        className="font-semibold tracking-wide bg-clip-text text-transparent"
        style={{
          backgroundImage: 'linear-gradient(90deg, var(--brand2), var(--brand1))',
          textShadow: '0 0 14px rgba(123,91,251,0.25)',
        }}
      >
        AI
      </span>

      {/* Animated sheen covering full badge */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span className="absolute -left-full top-0 h-full w-full sheen" />
      </span>

      <style>{`
        .sheen {
          background: linear-gradient(
            120deg,
            transparent,
            rgba(255,255,255,0.35),
            transparent
          );
          animation: sweep 2.8s linear infinite;
        }
        @keyframes sweep {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </span>
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
    <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-glow backdrop-blur">
      <div className="mb-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
        <div className="h-2 w-2 rounded-full bg-red-500/80" />
        <div className="h-2 w-2 rounded-full bg-yellow-500/80" />
        <div className="h-2 w-2 rounded-full bg-green-500/80" />
        <span className="ml-auto">smartwealth-terminal</span>
      </div>
      <div className="rounded-xl bg-black/10 dark:bg-black/40 p-3 text-xs leading-relaxed text-green-700 dark:text-green-300 min-h-[100px]">
        {LINES.slice(0, lineIndex).map((l, i) => <div key={i}>{l}</div>)}
        {lineIndex < LINES.length && (<div>{typed}<span className="ml-1 inline-block w-2 animate-pulse border-b-2 border-green-700 dark:border-green-300" /></div>)}
        {isDone && <div className="opacity-70">(Done)</div>}
      </div>
    </div>
  )
}