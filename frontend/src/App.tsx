import React, { useEffect, useMemo } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

function useThemeBoot() {
  const getInitial = () => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark'
    return 'light'
  }
  const [theme] = React.useState<'light' | 'dark'>(getInitial)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

type NavKey = 'chat' | 'calendar' | 'insights'

type DropdownLink = {
  label: string
  to: string
  disabled?: boolean
  description?: string
}

type NavItem = {
  key: NavKey
  label: string
  to: string
  match: (path: string) => boolean
  dropdown?: DropdownLink[]
}

const matchPath = (path: string, patterns: string[]) =>
  patterns.some((pattern) => {
    if (pattern === '/') return path === '/'
    return path === pattern || path.startsWith(`${pattern}/`)
  })

const NAV_ITEMS: NavItem[] = [
  {
    key: 'chat',
    label: 'Chat',
    to: '/',
    match: (path) => matchPath(path, ['/']),
  },
  {
    key: 'calendar',
    label: 'Calendar',
    to: '/earnings',
    match: (path) => matchPath(path, ['/earnings']),
    dropdown: [
      { label: 'Earnings Calendar', to: '/earnings' },
      { label: 'IPO Calendar', to: '', disabled: true },
      { label: 'Dividend Calendar', to: '', disabled: true },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    to: '/sectors',
    match: (path) => matchPath(path, ['/sectors', '/score', '/vendors', '/company-info']),
    dropdown: [
      { label: 'Scoring', to: '/score' },
      { label: 'Vendors', to: '/vendors' },
      { label: 'Company Info', to: '/company-info' },
    ],
  },
]

export default function App() {
  useThemeBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const activeItem = useMemo(() => NAV_ITEMS.find((item) => item.match(location.pathname)) ?? NAV_ITEMS[0], [location.pathname])
  const [openDropdown, setOpenDropdown] = React.useState<NavKey | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [mobileExpanded, setMobileExpanded] = React.useState<NavKey | null>(null)
  const navRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = Number(e.key) - 1
      if (!Number.isNaN(idx) && idx >= 0 && idx < NAV_ITEMS.length) {
        e.preventDefault()
        navigate(NAV_ITEMS[idx].to)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  useEffect(() => {
    if (!openDropdown) return
    const handleClick = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  useEffect(() => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
    setMobileExpanded(null)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Keep your header exactly as-is (blur stays) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4">
          {/* Brand: SmartWealth mark with luminous AI capsule */}
          <Link to="/" className="select-none">
            <BrandMark />
          </Link>

          <div ref={navRef} className="relative justify-self-center">
            <DesktopNav
              items={NAV_ITEMS}
              activeKey={activeItem.key}
              openKey={openDropdown}
              onOpenChange={setOpenDropdown}
              onNavigate={navigate}
            />
            <MobileNav
              items={NAV_ITEMS}
              activeKey={activeItem.key}
              isOpen={mobileMenuOpen}
              expandedKey={mobileExpanded}
              onToggleOpen={setMobileMenuOpen}
              onExpandChange={setMobileExpanded}
              onNavigate={navigate}
            />
          </div>
          <div aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 md:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border)] bg-gradient-to-b from-transparent to-[color:var(--bg)]">
        <div className="mx-auto max-w-6xl px-6 py-8 grid gap-6 md:grid-cols-3">
          <div className="opacity-80">
            <div className="text-sm">©2025 SmartWealth AI • AI-assisted research platform</div>
          </div>
          <FooterGlyphRow />
          <FooterThemeToggle />
        </div>
      </footer>
    </div>
  )
}

type DesktopNavProps = {
  items: NavItem[]
  activeKey: NavKey
  openKey: NavKey | null
  onOpenChange: (key: NavKey | null) => void
  onNavigate: (to: string) => void
}

function DesktopNav({ items, activeKey, openKey, onOpenChange, onNavigate }: DesktopNavProps) {
  return (
    <div className="relative hidden md:block" onMouseLeave={() => onOpenChange(null)}>
      <nav className="relative flex items-center rounded-full border border-[var(--border)]/60 bg-white/70 px-2 py-1 shadow-[0_14px_36px_rgba(15,23,42,0.16)] backdrop-blur-md dark:bg-[var(--panel)]/80 dark:shadow-[0_14px_40px_rgba(8,12,35,0.55)]">
        {items.map((item) => {
          const selected = activeKey === item.key
          const hasDropdown = !!item.dropdown?.length
          const baseClasses = `relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 focus:outline-none ${
            selected ? 'text-slate-900 dark:text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`

          const highlight = selected ? (
            <motion.span
              layoutId="nav-highlight"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(120deg, rgba(123,91,251,0.28), rgba(60,196,255,0.18))',
                boxShadow: '0 12px 32px rgba(123,91,251,0.25)',
                border: '1px solid rgba(255,255,255,0.35)',
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            />
          ) : null

          return (
            <div key={item.key} className="relative px-1">
              {hasDropdown ? (
                <button
                  type="button"
                  className={baseClasses}
                  onClick={() => onOpenChange(openKey === item.key ? null : item.key)}
                  onMouseEnter={() => onOpenChange(item.key)}
                  onFocus={() => onOpenChange(item.key)}
                  aria-haspopup="menu"
                  aria-expanded={openKey === item.key}
                >
                  {highlight}
                  <span className="relative z-10 whitespace-nowrap">{item.label}</span>
                  <span className="relative z-10 text-xs opacity-70">
                    <ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${openKey === item.key ? 'rotate-180' : ''}`} />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className={baseClasses}
                  onClick={() => {
                    onOpenChange(null)
                    onNavigate(item.to)
                  }}
                >
                  {highlight}
                  <span className="relative z-10 whitespace-nowrap">{item.label}</span>
                </button>
              )}

              <AnimatePresence>
                {hasDropdown && openKey === item.key && (
                  <motion.div
                    key={`${item.key}-dropdown`}
                    initial={{ opacity: 0, y: -10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute left-1/2 top-[calc(100%+14px)] z-40 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#070f2a] text-white shadow-[0_26px_70px_rgba(7,12,35,0.7)]"
                    onMouseEnter={() => onOpenChange(item.key)}
                  >
                    <div className="flex flex-col gap-1 py-2">
                      {item.dropdown!.map((sub) => {
                        const disabled = sub.disabled || !sub.to
                        return disabled ? (
                          <div
                            key={`${item.key}-${sub.label}`}
                            className="mx-2 rounded-xl px-3 py-2 text-sm text-white/50 backdrop-blur-sm"
                          >
                            <div>{sub.label}</div>
                            <div className="text-xs text-white/40">Coming soon</div>
                          </div>
                        ) : (
                          <button
                            key={`${item.key}-${sub.label}`}
                            type="button"
                            onClick={() => {
                              onOpenChange(null)
                              onNavigate(sub.to)
                            }}
                            className="mx-2 flex w-[calc(100%-1rem)] flex-col gap-1 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                          >
                            <span>{sub.label}</span>
                            {sub.description && <span className="text-xs text-white/60">{sub.description}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>
    </div>
  )
}

type MobileNavProps = {
  items: NavItem[]
  activeKey: NavKey
  isOpen: boolean
  expandedKey: NavKey | null
  onToggleOpen: (open: boolean) => void
  onExpandChange: (key: NavKey | null) => void
  onNavigate: (to: string) => void
}

function MobileNav({ items, activeKey, isOpen, expandedKey, onToggleOpen, onExpandChange, onNavigate }: MobileNavProps) {
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => onToggleOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-[0_12px_26px_rgba(15,23,42,0.14)] backdrop-blur-md transition hover:-translate-y-[1px] hover:shadow-[0_16px_40px_rgba(15,23,42,0.18)] dark:bg-[var(--panel)]/80"
      >
        Menu
        <MenuIcon open={isOpen} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute left-1/2 z-[180] mt-3 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-[var(--border)]/60 bg-[color:var(--bg)]/95 p-3 shadow-[0_28px_70px_rgba(15,23,42,0.28)] backdrop-blur-xl"
          >
            <div className="space-y-2">
              {items.map((item) => {
                const hasDropdown = !!item.dropdown?.length
                const expanded = hasDropdown && ((expandedKey ?? activeKey) === item.key)
                return (
                  <div
                    key={`mobile-${item.key}`}
                    className="overflow-hidden rounded-2xl border border-[var(--border)]/40 bg-white/92 shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:bg-[var(--panel)]/80"
                  >
                    <div className="flex items-center justify-between">
                      {hasDropdown ? (
                        <button
                          type="button"
                          onClick={() => onExpandChange(expanded ? null : item.key)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[var(--text)]"
                        >
                          <span>{item.label}</span>
                          <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleOpen(false)
                            onNavigate(item.to)
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-[var(--text)]"
                        >
                          {item.label}
                        </button>
                      )}
                    </div>

                    {hasDropdown && (
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="space-y-1 border-t border-[var(--border)]/40 bg-black/5 px-3 py-2 dark:bg-white/5"
                          >
                            {item.dropdown!.map((sub) => {
                              const disabled = sub.disabled || !sub.to
                              return disabled ? (
                                <div
                                  key={`mobile-${item.key}-${sub.label}`}
                                  className="rounded-xl px-3 py-2 text-sm text-[var(--muted)] opacity-60"
                                >
                                  {sub.label} <span className="text-xs uppercase tracking-[0.2em]">Soon</span>
                                </div>
                              ) : (
                                <button
                                  key={`mobile-${item.key}-${sub.label}`}
                                  type="button"
                                  onClick={() => {
                                    onToggleOpen(false)
                                    onNavigate(sub.to)
                                  }}
                                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-white/60 dark:hover:bg-white/10"
                                >
                                  {sub.label}
                                </button>
                              )
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M5 7l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: '2px',
    borderRadius: '999px',
    background: 'currentColor',
    transition: 'transform 0.2s ease, opacity 0.2s ease, top 0.2s ease',
  }

  return (
    <span className="relative block h-[18px] w-[22px]">
      <span
        style={{
          ...common,
          top: open ? '50%' : '0%',
          transform: open ? 'translateY(-50%) rotate(45deg)' : 'translateY(0) rotate(0deg)',
        }}
      />
      <span
        style={{
          ...common,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: open ? 0 : 1,
        }}
      />
      <span
        style={{
          ...common,
          top: open ? '50%' : 'calc(100% - 2px)',
          transform: open ? 'translateY(-50%) rotate(-45deg)' : 'translateY(0) rotate(0deg)',
        }}
      />
    </span>
  )
}

/* ================= Brand Mark ================= */
const IconTrend = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 18l5-5 3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconPiggy = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 11c0-3.866 3.582-7 8-7 3.314 0 6.125 2.01 7.36 4.582.42.86 1.3 1.396 2.248 1.396H22v2h-1.4c-.58 0-1.074.328-1.264.822A7 7 0 0 1 12 20c-4.418 0-8-3.134-8-7Z" />
    <path d="M6 13H4a1 1 0 0 0-1 1v1.5a1.5 1.5 0 0 0 1.5 1.5H6" strokeLinecap="round" />
    <path d="M14 5V3" strokeLinecap="round" />
    <circle cx="15" cy="11" r="1.2" fill="currentColor" />
  </svg>
)

const IconPie = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 3v9l6.3 3.64A8 8 0 1 1 12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 2.05A8 8 0 0 1 21.95 11H13Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconSpark = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 3v4" strokeLinecap="round" />
    <path d="M12 17v4" strokeLinecap="round" />
    <path d="M5.64 5.64l2.83 2.83" strokeLinecap="round" />
    <path d="M15.53 15.53l2.83 2.83" strokeLinecap="round" />
    <path d="M3 12h4" strokeLinecap="round" />
    <path d="M17 12h4" strokeLinecap="round" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
)

const FOOTER_GLYPHS = [
  { icon: IconTrend },
  { icon: IconPiggy },
  { icon: IconPie },
  { icon: IconSpark },
]

function BrandMark() {
  return (
    <span className="group relative inline-flex items-baseline gap-1 text-[26px] leading-none">
      <span
        className="font-black tracking-tight text-transparent drop-shadow-sm transition-transform duration-200 group-hover:-translate-y-[1px]"
        style={{ backgroundImage: 'linear-gradient(95deg, #8b5bff 0%, #b18cff 55%, #7b5bfb 100%)', WebkitBackgroundClip: 'text' }}
      >
        SmartWealth
      </span>
      <sup className="relative -top-2 text-[11px] font-semibold text-slate-800 tracking-[0.28em] opacity-90 dark:text-white/80">
        AI
      </sup>
    </span>
  )
}

function FooterGlyphRow() {
  return (
    <div className="flex items-center justify-center gap-4 text-[var(--muted)]">
      {FOOTER_GLYPHS.map((glyph, idx) => (
        <span
          key={idx}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)]/35 bg-white/90 text-[var(--brand1)] shadow-[0_12px_26px_rgba(15,23,42,0.12)] dark:bg-white/10"
        >
          {glyph.icon}
        </span>
      ))}
    </div>
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
      <div className="text-[var(--muted)]"></div>
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
