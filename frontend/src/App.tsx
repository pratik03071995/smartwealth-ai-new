import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

function useTheme() {
  const getInitial = () => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitial)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  return { theme, setTheme }
}

export default function App() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { theme, setTheme } = useTheme()

  // ⌘K / Ctrl+K to toggle sidebar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] relative overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--bg)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg md:text-xl font-semibold tracking-wide">
            <span className="gradient-text font-black">SmartWealth</span> <span className="opacity-70">AI</span>
          </Link>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-xl px-3 py-2 text-sm border border-[var(--border)] bg-[var(--panel)] hover:opacity-90"
            aria-label="Toggle theme"
            title="Toggle light/dark"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      {/* Floating neon FAB */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.98 }}
        className="fixed right-6 top-20 z-50 h-12 w-12 rounded-full border border-[var(--border)] bg-[var(--panel)] backdrop-blur shadow-glow"
        title="Toggle menu (⌘K)"
      >
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="block text-center text-xl leading-[48px] select-none">
          {open ? '✖' : '≡'}
        </motion.span>
      </motion.button>

      {/* Sidebar */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed left-0 top-0 z-50 h-full w-72 border-r border-[var(--border)] bg-[color:var(--bg)]/95 backdrop-blur px-5 py-6"
          >
            <div className="mb-6 text-sm uppercase tracking-widest text-[var(--muted)]">Navigation</div>
            <nav className="space-y-2">
              {[['/', 'Chat'], ['/earnings', 'Earnings'], ['/score', 'Scoring'], ['/vendors', 'Vendors'], ['/sectors', 'Sectors']].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setOpen(false)}
                  className={`block rounded-xl px-4 py-3 hover:bg-[var(--panel)] ${location.pathname === to ? 'bg-[var(--panel)] ring-1 ring-[var(--border)]' : ''}`}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 text-xs text-[var(--muted)]">© {new Date().getFullYear()} SmartWealth AI</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 md:py-12">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-4 border-t border-[var(--border)] bg-gradient-to-b from-transparent to-[color:var(--bg)]">
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
          <div>
            <div className="text-[var(--muted)]">Shortcuts</div>
            <ul className="mt-2 space-y-1"><li>⌘K / Ctrl+K – Toggle menu</li></ul>
          </div>
        </div>
        <div className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} SmartWealth AI. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
