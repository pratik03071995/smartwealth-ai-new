import React from 'react'

type SidebarProps = {
  activePath: string
  onNavigate: (path: string) => void
  onNewChat: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

type NavItem = {
  label: string
  icon: React.ReactNode
  path?: string
  badge?: string
  disabled?: boolean
  action?: 'new-chat'
}

type Section = {
  title?: string
  items: NavItem[]
}

const QUICK_ACTIONS: Section = {
  items: [
    { label: 'New chat', icon: <NewChatIcon />, action: 'new-chat' },
  ],
}

const FEATURE_SECTION: Section = {
  title: 'Features',
  items: [
    { label: 'Earnings Calendar', icon: <CalendarIcon />, path: '/earnings' },
    { label: 'Smart Scorecards', icon: <ClipboardIcon />, path: '/score' },
    { label: 'Vendor Network', icon: <BriefcaseIcon />, path: '/vendors' },
    { label: 'Company Info', icon: <BuildingIcon />, path: '/company-info' },
  ],
}

const CHAT_SECTION: Section = {
  title: 'Chats',
  items: [
    { label: 'Getting started', icon: <HistoryIcon />, path: '/' },
    { label: 'Market pulse', icon: <HistoryIcon />, path: '/' },
  ],
}

const SECTIONS: Section[] = [QUICK_ACTIONS, FEATURE_SECTION, CHAT_SECTION]

export default function Sidebar({
  activePath,
  onNavigate,
  onNewChat,
  open,
  onOpenChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const content = (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex h-full ${collapsed ? 'w-[68px]' : 'w-[240px]'} flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 pb-3 pt-4`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--sidebar-active-icon-bg)] text-white">
            <MoneyIcon />
          </div>
          {collapsed ? null : (
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight text-[var(--sidebar-text)]">SmartWealth AI</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--sidebar-muted)] transition hover:bg-[var(--sidebar-hover-bg)] lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-1.5' : 'px-2.5'} pb-6`}> 
        {SECTIONS.map((section, index) => (
          <SidebarSection key={section.title ?? index} title={section.title} collapsed={collapsed}>
            {section.items.map((item) => {
              const isActive = !!item.path && activePath.startsWith(item.path)
              const handleClick = () => {
                if (item.action === 'new-chat') {
                  onNewChat()
                  return
                }
                if (item.path) onNavigate(item.path)
              }
              const disabled = item.disabled && !item.path
              return (
                <SidebarButton
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  active={isActive}
                  onClick={disabled ? undefined : handleClick}
                  disabled={disabled}
                  collapsed={collapsed}
                />
              )
            })}
          </SidebarSection>
        ))}
      </nav>

      <footer className={`border-t border-[var(--sidebar-border)] ${collapsed ? 'px-0 py-3 text-[10px]' : 'px-4 py-4 text-xs'} text-[var(--sidebar-muted)]`}> 
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <span>© {new Date().getFullYear()}</span>
            <span>SW AI</span>
          </div>
        ) : (
          <>
            <p>© {new Date().getFullYear()} SmartWealth AI</p>
            <p className="mt-1">AI-assisted financial intelligence</p>
          </>
        )}
      </footer>
    </aside>
  )

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
        onClick={() => onOpenChange(false)}
      />
      {content}
    </>
  )
}

type SidebarButtonProps = {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  collapsed?: boolean
}

function SidebarButton({ label, icon, onClick, active, disabled, collapsed }: SidebarButtonProps) {
  const baseClasses = [
    'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors',
    active
      ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-accent-text)]'
      : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text)]',
    disabled ? 'cursor-not-allowed opacity-60' : '',
    collapsed ? 'justify-center px-1 py-2.5' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={baseClasses} onClick={onClick} disabled={disabled} title={collapsed ? label : undefined}>
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl text-[var(--sidebar-muted)] transition ${
          active ? 'bg-[var(--sidebar-active-icon-bg)] text-white' : 'hover:bg-[var(--sidebar-hover-bg)]'
        }`}
      >
        {icon}
      </span>
      {collapsed ? null : <span className="flex-1 text-left leading-5">{label}</span>}
    </button>
  )
}

type SidebarSectionProps = {
  title?: string
  children: React.ReactNode
  collapsed: boolean
}

function SidebarSection({ title, children, collapsed }: SidebarSectionProps) {
  return (
    <section className="mb-6">
      {title ? (
        <div
          className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--sidebar-muted)] ${
            collapsed ? 'px-0 text-center text-transparent' : ''
          }`}
        >
          {collapsed ? (
            <span className="sr-only">{title}</span>
          ) : (
            title
          )}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function MoneyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.1)" />
      <path
        d="M12 7.25c-1.38 0-2.5.9-2.5 2.1 0 1.05.72 1.74 2.07 2.08l.86.21c.71.18 1.07.46 1.07.93 0 .63-.62 1.02-1.55 1.02-.84 0-1.46-.32-1.75-.86a.75.75 0 0 0-1.33.7c.38.71 1.12 1.22 2.01 1.42V16a.75.75 0 0 0 1.5 0v-1.12c1.37-.23 2.32-1.11 2.32-2.39 0-1.29-.83-2.02-2.29-2.38l-.96-.23c-.73-.18-.99-.41-.99-.82 0-.48.52-.8 1.27-.8.73 0 1.28.28 1.53.74a.75.75 0 0 0 1.34-.67c-.36-.7-1.06-1.19-1.92-1.39V8a.75.75 0 0 0-1.5 0v.12Z"
        fill="currentColor"
      />
    </svg>
  )
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 7.5 14.5 12 10 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 7.5 9.5 12 14 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function NewChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 3v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M17 3v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 4h1.5A2.5 2.5 0 0 1 19 6.5v12A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-12A2.5 2.5 0 0 1 7.5 4H9" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="3" width="6" height="3" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6V4.8C9 4.08 9.56 3.5 10.25 3.5h3.5c.69 0 1.25.58 1.25 1.3V6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 11h16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 21V6.5A2.5 2.5 0 0 1 7.5 4H16a2.5 2.5 0 0 1 2.5 2.5V21" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 21v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 12a7.5 7.5 0 1 1 2 5L4 20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
