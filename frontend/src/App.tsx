import React, { useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

function useThemeBoot() {
  const getInitial = () => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  const [theme] = React.useState<'light' | 'dark'>(getInitial)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

const NAV: Array<{ to: string; label: string }> = [
  { to: '/',          label: 'Chat'     },
  { to: '/earnings',  label: 'Earnings' },
  { to: '/score',     label: 'Scoring'  },
  { to: '/vendors',   label: 'Vendors'  },
  { to: '/sectors',   label: 'Sectors'  },
]

export default function App() {
  useThemeBoot()
  const location = useLocation()
  const navigate = useNavigate()

  // 1–5 keyboard hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < NAV.length) { e.preventDefault(); navigate(NAV[idx].to) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
        {/* 3-col grid ensures nav is centered */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4">
          {/* Brand (as it was before) */}
          <Link
            to="/"
            className="justify-self-start font-semibold tracking-wide text-xl md:text-2xl"
            aria-label="SmartWealth AI Home"
          >
            <span className="gradient-text font-black">SmartWealth</span>{" "}
            <span className="opacity-70">AI</span>
          </Link>

          {/* Navigation tabs */}
          <ProTabs activePath={location.pathname} />

          {/* Right spacer to keep tabs centered */}
          <div aria-hidden />
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-6 py-10 md:py-12">
        <Outlet />
      </main>

      {/* FOOTER (unchanged, includes theme toggle) */}
      <footer className="border-t border-[var(--border)] bg-gradient-to-b from-transparent to-[color:var(--bg)]">
        <div className="mx-auto max-w-6xl px-6 py-8 grid gap-6 md:grid-cols-3 text-sm">
          <div>
            <div className="text-base font-semibold">SmartWealth AI</div>
            <p className="mt-2 text-[var(--muted)]">Actionable insights, elegant UI, and instant answers.</p>
          </div>
          <div>
            <div className="text-[var(--muted)]">Product</div>
            <ul className="mt-2 space-y-1">
              <li><Link className="hover:underline" to="/earnings">Earnings</Link></li>
              <li><Link className="hover:underline" to="/score">Scoring</Link></li>
              <li><Link className="hover:underline" to="/sectors">Sectors</Link></li>
            </ul>
          </div>
          <FooterThemeToggle />
        </div>
        <div className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} SmartWealth AI. All rights reserved.
        </div>
      </footer>
    </div>
  )
}

/* ----------------- Components ----------------- */

function ProTabs({ activePath }: { activePath: string }) {
  const idx = Math.max(0, NAV.findIndex(n => n.to === activePath))
  return (
    <nav role="tablist" aria-label="Primary" className="relative flex items-center justify-self-center">
      <div className="relative flex rounded-2xl border border-[var(--border)] px-2 py-1 bg-[color:var(--bg)]/60">
        {NAV.map((item, i) => {
          const selected = i === idx
          return (
            <Link
              key={item.to}
              to={item.to}
              role="tab"
              aria-selected={selected}
              className={`
                relative rounded-xl px-3 md:px-4 py-2 text-[15px] font-semibold
                ${selected ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}
                transition-transform hover:-translate-y-[1px] focus:outline-none
              `}
            >
              {selected && (
                <motion.span
                  layoutId="pro-underline"
                  className="absolute left-2 right-2 -bottom-[6px] h-[3px] rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, var(--brand2), var(--brand1))',
                    boxShadow: '0 0 16px rgba(123,91,251,0.35)',
                  }}
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function FooterThemeToggle() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return (
    <div className="flex flex-col items-center md:items-end gap-3">
      <div className="text-[var(--muted)]">Controls</div>
      <button
        onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          document.documentElement.classList.toggle('dark', next === 'dark')
          localStorage.setItem('theme', next)
          setTheme(next)
        }}
        className="mt-2 rounded-xl px-3 py-2 text-sm border border-[var(--border)] bg-[var(--panel)] hover:opacity-90"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </div>
  )
}
