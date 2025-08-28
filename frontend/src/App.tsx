import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

export default function App() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // ⌘K / Ctrl+K toggle
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
    <div className="min-h-screen bg-background text-white relative overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg md:text-xl font-semibold tracking-wide">
            <span className="gradient-text font-black">SmartWealth</span> <span className="opacity-70">AI</span>
          </Link>
        </div>
      </header>

      {/* Floating neon FAB */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.98 }}
        className="fixed right-6 top-20 z-50 h-12 w-12 rounded-full border border-white/20 bg-white/10 backdrop-blur shadow-[0_0_30px_-8px_rgba(177,140,255,0.9)]"
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
            className="fixed left-0 top-0 z-50 h-full w-72 border-r border-white/10 bg-[#0b0c10]/95 backdrop-blur px-5 py-6"
          >
            <div className="mb-6 text-sm uppercase tracking-widest text-white/60">Navigation</div>
            <nav className="space-y-2">
              {[['/', 'Chat'], ['/earnings', 'Earnings'], ['/score', 'Scoring'], ['/vendors', 'Vendors'], ['/sectors', 'Sectors']].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setOpen(false)}
                  className={`block rounded-xl px-4 py-3 hover:bg-white/5 ${location.pathname === to ? 'bg-white/10 ring-1 ring-white/10' : ''}`}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 text-xs text-white/50">© {new Date().getFullYear()} SmartWealth AI</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 md:py-12">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-4 border-t border-white/10 bg-gradient-to-b from-transparent to-[#0f1120]">
        <div className="mx-auto max-w-6xl px-6 py-8 grid gap-6 md:grid-cols-3 text-sm">
          <div>
            <div className="text-base font-semibold">SmartWealth AI</div>
            <p className="mt-2 text-white/60">Actionable insights, elegant UI, and instant answers.</p>
          </div>
          <div>
            <div className="text-white/60">Product</div>
            <ul className="mt-2 space-y-1 text-white/70">
              <li><Link className="hover:underline" to="/earnings">Earnings</Link></li>
              <li><Link className="hover:underline" to="/score">Scoring</Link></li>
              <li><Link className="hover:underline" to="/sectors">Sectors</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-white/60">Shortcuts</div>
            <ul className="mt-2 space-y-1 text-white/70"><li>⌘K / Ctrl+K – Toggle menu</li></ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} SmartWealth AI. All rights reserved.</div>
      </footer>
    </div>
  )
}
