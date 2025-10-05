import React from 'react'

type SystemStatus = 'checking' | 'ready' | 'degraded' | 'unavailable'

type TopBarProps = {
  activeLabel: string
  onToggleSidebar: () => void
  systemStatus: SystemStatus
  onRefreshStatus: () => void
  refreshing: boolean
  userInitials?: string
}

export default function TopBar({ activeLabel, onToggleSidebar }: TopBarProps) {

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--divider)] bg-[var(--app-bg)]/90 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--divider)] bg-white text-[var(--text-primary)] shadow-sm transition hover:bg-white/70 lg:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <MenuIcon />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">{activeLabel}</h1>
          </div>
          <span className="mt-1 text-xs uppercase tracking-[0.28em] text-[var(--text-tertiary)]/80" />
        </div>
      </div>

      <div className="flex items-center gap-3" />
    </header>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function RefreshGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12a7 7 0 0 1 11.9-4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 5.5v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 12a7 7 0 0 1-11.9 4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 18.5v-4H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
