import React, { useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
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

const NAV_TOP: Array<{ to: string; label: string }> = [
  { to: '/',          label: 'Chat'     },
  { to: '/calendar',  label: 'Calendar' },
  { to: '/sectors',   label: 'Sectors'  },
]

const NAV_DROPDOWNS: Record<string, Array<{ label: string; href?: string; disabled?: boolean }>> = {
  Calendar: [
    { label: 'Earnings Calendar', href: '/earnings' },
    { label: 'IPO Calendar', disabled: true },
    { label: 'Dividend Calendar', disabled: true },
  ],
  Sectors: [
    { label: 'Scoring', href: '/score' },
    { label: 'Vendors', href: '/vendors' },
    { label: 'Company Info', href: '/company-info' },
  ],
}

export default function App() {
  useThemeBoot()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < NAV_TOP.length) {
        e.preventDefault()
        navigate(NAV_TOP[idx].label === 'Calendar' ? '/earnings' : NAV_TOP[idx].to)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Keep your header exactly as-is (blur stays) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4">
          {/* Brand: SmartWealth gradient + AI white */}
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight select-none">
            <span
              className="text-xl bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, var(--brand2), var(--brand1))' }}
            >
              SmartWealth
            </span>
            <span className="text-xl text-white">AI</span>
          </Link>

          <ProTabs activePath={location.pathname} />
          <div aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 md:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border)] bg-gradient-to-b from-transparent to-[color:var(--bg)]">
        <div className="mx-auto max-w-6xl px-6 py-8 grid gap-6 md:grid-cols-3">
          <div className="opacity-80">
            <div className="font-semibold mb-1">SmartWealth AI</div>
            <div className="text-sm">Build. Learn. Invest smarter.</div>
          </div>
          <div className="opacity-80 text-sm">Built with ❤️ using Vite, React, Tailwind.</div>
          <FooterThemeToggle />
        </div>
      </footer>
    </div>
  )
}

type Rect = { left: number; top: number; width: number; height: number }

function DropdownPortal({
  anchorRect,
  children,
  onClose,
}: {
  anchorRect: Rect | null
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      // close if click outside the panel
      const el = document.getElementById('nav-portal-panel')
      if (el && !el.contains(e.target as Node)) onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  if (!anchorRect) return null

  const top = Math.round(anchorRect.top + anchorRect.height + 8) // 8px gap below trigger
  const left = Math.round(anchorRect.left)

  return createPortal(
    <div
      id="nav-portal-panel"
      className="fixed z-[200] w-56 rounded-xl border border-[var(--border)] shadow-2xl"
      style={{
        top,
        left,
        background: '#0A1630', // SOLID, OPAQUE (no transparency, no blur)
      }}
    >
      {children}
    </div>,
    document.body
  )
}

function ProTabs({ activePath }: { activePath: string }) {
  const [open, setOpen] = React.useState<string | null>(null)
  const [anchorRect, setAnchorRect] = React.useState<Rect | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    function onResize() {
      if (open && triggerRefs.current[open]) {
        const r = triggerRefs.current[open]!.getBoundingClientRect()
        setAnchorRect({ left: r.left, top: r.top, width: r.width, height: r.height })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  const idx = Math.max(
    0,
    NAV_TOP.findIndex(
      n => n.to === activePath || (n.label === 'Calendar' && activePath.startsWith('/earnings'))
    )
  )

  return (
    <nav role="tablist" aria-label="Primary" className="relative flex items-center justify-self-center" ref={containerRef}>
      <div className="relative flex rounded-2xl border border-[var(--border)] px-2 py-1 bg-[color:var(--bg)]/60">
        {NAV_TOP.map((item, i) => {
          const selected = i === idx
          const submenu = NAV_DROPDOWNS[item.label as keyof typeof NAV_DROPDOWNS]

          if (!submenu) {
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
                  />
                )}
                {item.label}
              </Link>
            )
          }

          return (
            <div key={item.label} className="relative">
              <button
                type="button"
                ref={(el) => (triggerRefs.current[item.label] = el)}
                onClick={() => {
                  if (open === item.label) {
                    setOpen(null)
                    setAnchorRect(null)
                  } else {
                    const r = triggerRefs.current[item.label]!.getBoundingClientRect()
                    setAnchorRect({ left: r.left, top: r.top, width: r.width, height: r.height })
                    setOpen(item.label)
                  }
                }}
                onMouseEnter={() => {
                  const r = triggerRefs.current[item.label]?.getBoundingClientRect()
                  if (r) setAnchorRect({ left: r.left, top: r.top, width: r.width, height: r.height })
                  setOpen(item.label)
                }}
                className={`
                  relative rounded-xl px-3 md:px-4 py-2 text-[15px] font-semibold
                  ${selected ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}
                  transition-transform hover:-translate-y-[1px] focus:outline-none
                `}
                aria-haspopup="menu"
                aria-expanded={open === item.label}
              >
                {selected && (
                  <motion.span
                    layoutId="pro-underline"
                    className="absolute left-2 right-2 -bottom-[6px] h-[3px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, var(--brand2), var(--brand1))',
                      boxShadow: '0 0 16px rgba(123,91,251,0.35)',
                    }}
                  />
                )}
                {item.label}
                <span className="ml-1 inline-block">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
              </button>

              {/* Render dropdown OUTSIDE the blurred header */}
              {open === item.label && (
                <DropdownPortal anchorRect={anchorRect} onClose={() => { setOpen(null); setAnchorRect(null) }}>
                  <div className="p-2">
                    {NAV_DROPDOWNS[item.label].map((sub) =>
                      sub.disabled ? (
                        <span
                          key={sub.label}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted)] opacity-70 select-none cursor-not-allowed"
                        >
                          {sub.label} <span className="text-xs">(soon)</span>
                        </span>
                      ) : (
                        <Link
                          key={sub.label}
                          to={sub.href!}
                          className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10"
                          onClick={() => { setOpen(null); setAnchorRect(null) }}
                        >
                          {sub.label}
                        </Link>
                      )
                    )}
                  </div>
                </DropdownPortal>
              )}
            </div>
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
