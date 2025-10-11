import React from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useNavigate } from 'react-router-dom'
import { useChatSession } from '../components/chat/ChatSessionProvider'

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
  action?: 'new-chat' | 'open-session'
  sessionId?: string
}

type Section = {
  title?: string
  items: NavItem[]
}

export default function Sidebar({
  activePath,
  onNavigate,
  onNewChat,
  open,
  onOpenChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { sessions, activeSessionId, openSession } = useChatSession()

  const FEATURE_SECTION: Section = React.useMemo(() => ({
    title: 'Features',
    items: [
      { label: 'Earnings Calendar', icon: <CalendarIcon />, path: '/earnings' },
      { label: 'Smart Scorecards', icon: <ClipboardIcon />, path: '/score' },
      { label: 'Vendor Network', icon: <BriefcaseIcon />, path: '/vendors' },
      { label: 'Company Info', icon: <BuildingIcon />, path: '/company-info' },
    ],
  }), [])

  const TOP_DASHBOARD: Section | null = React.useMemo(() => (
    user ? { items: [{ label: 'Dashboard', icon: <HomeIcon />, path: '/dashboard' }] } : null
  ), [user])

  const CHAT_SECTION: Section = React.useMemo(() => {
    const items: NavItem[] = [
      { label: 'New chat', icon: <ComposeIcon />, action: 'new-chat' },
      ...sessions.map<NavItem>((session) => ({
        label: session.title || 'New chat',
        icon: <ChatBubbleIcon />,
        action: 'open-session',
        sessionId: session.id,
        path: '/',
      })),
    ]
    return { title: 'Chats', items }
  }, [sessions])

  const SECTIONS: Section[] = React.useMemo(() => {
    return [TOP_DASHBOARD, FEATURE_SECTION, CHAT_SECTION].filter(Boolean) as Section[]
  }, [TOP_DASHBOARD, FEATURE_SECTION, CHAT_SECTION])

  const content = (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex h-full ${collapsed ? 'w-[68px]' : 'w-[240px]'} flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 pb-3 pt-4`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-11 w-11 place-items-center text-[var(--sidebar-text)]">
            <GrowthIcon />
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
              const isActive = item.sessionId
                ? item.sessionId === activeSessionId
                : !!item.path && activePath.startsWith(item.path)
              const handleClick = () => {
                if (item.action === 'new-chat') {
                  onNewChat()
                  return
                }
                if (item.action === 'open-session' && item.sessionId) {
                  openSession(item.sessionId)
                    .then(() => {
                      onNavigate('/')
                      onOpenChange(false)
                    })
                    .catch((error) => {
                      console.error('Failed to open session', error)
                    })
                  return
                }
                if (item.path) onNavigate(item.path)
              }
              const disabled = item.disabled && !item.path
              return (
                <SidebarButton
                  key={item.sessionId ?? item.label}
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

      <div className="mt-auto" />
      <footer className={`border-t border-[var(--sidebar-border)] ${collapsed ? 'px-0 py-2 text-[10px]' : 'px-3 py-3 text-xs'} text-[var(--sidebar-muted)]`}> 
        {user ? (
          <div className={`${collapsed ? 'px-1' : 'px-1'}`}>
            <div className={`flex w-full items-center gap-3 ${collapsed ? 'px-1 py-1.5' : 'px-2.5 py-2'}`}>
              <div className="relative">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[#E5E7EB] text-[13px] font-semibold text-[#111827] shadow-sm">
                  {user.initials || (user.name || '?').slice(0, 1)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--sidebar-bg)]" />
              </div>
              {collapsed ? null : (
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-semibold text-[var(--sidebar-text)]">{user.name}</div>
                  <div className="truncate text-[11px] text-[var(--sidebar-muted)]">Online</div>
                </div>
              )}
              {collapsed ? null : (
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    onOpenChange(false)
                    navigate('/login')
                  }}
                  className="ml-auto rounded-lg border border-white/20 px-2 py-[6px] text-[11px] text-white/90 hover:bg-white/10"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`${collapsed ? 'px-1' : 'px-3'}`}>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                navigate('/login')
              }}
              className="w-full rounded-xl bg-[var(--sidebar-active-icon-bg)] px-3 py-2 text-center font-semibold text-white"
            >
              Sign in
            </button>
          </div>
        )}
        {!collapsed ? (
          <div className="mt-3 text-[var(--sidebar-muted)]">
            <p>© {new Date().getFullYear()} SmartWealth AI</p>
            <p className="mt-1">AI-assisted financial intelligence</p>
          </div>
        ) : null}
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

function GrowthIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 15l3.2-3.2 2 2L17 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 9v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7" cy="15" r="0.9" fill="currentColor" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-5.5h-3V21H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
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

function ComposeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 15l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 15h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 6.5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2V14c0 1.1-.9 2-2 2h-4.2l-3.8 3.2c-.66.55-1.66.07-1.66-.79V16H7c-1.1 0-2-.9-2-2V6.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.5 9.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.5 12.5H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 3.5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 3.5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 9.2h16" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 3.8h6a1 1 0 0 1 1 1V6H8V4.8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 11.5h6M9 15h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16.5" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16.5" cy="17" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 11.6l5.1-2.6M9.2 13.4l5.1 2.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 21v-4h6v4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 8.5h2M13.5 8.5h2M8.5 12h2M13.5 12h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 12c2.49 0 4.5-2.01 4.5-4.5S14.49 3 12 3 7.5 5.01 7.5 7.5 9.51 12 12 12Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20.5c0-3.04 3.13-5.5 7-5.5s7 2.46 7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
