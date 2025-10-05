import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './layout/Sidebar'
import TopBar from './layout/TopBar'
import { useChatSession } from './components/chat/ChatSessionProvider'
import type { SystemStatus } from './components/chat/ChatSessionProvider'

const ROUTE_TITLES = [
  { label: 'Chat', match: (path: string) => path === '/' },
  { label: 'Earnings Calendar', match: (path: string) => path.startsWith('/earnings') },
  { label: 'Smart Scores', match: (path: string) => path.startsWith('/score') },
  { label: 'Vendors', match: (path: string) => path.startsWith('/vendors') },
  { label: 'Company Insights', match: (path: string) => path.startsWith('/company-info') },
]

function resolveRouteTitle(pathname: string) {
  const found = ROUTE_TITLES.find((entry) => entry.match(pathname))
  return found ? found.label : 'Workspace'
}

type OutletContext = {
  onNewChat: () => void
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearConversation, systemStatus, refreshHealth, isHealthRefreshing } = useChatSession()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  const handleNavigate = React.useCallback(
    (path: string) => {
      if (!path) return
      if (path.startsWith('http')) {
        window.open(path, '_blank', 'noopener,noreferrer')
        setSidebarOpen(false)
        return
      }
      if (location.pathname !== path) {
        navigate(path)
      }
      setSidebarOpen(false)
    },
    [navigate, location.pathname],
  )

  const handleNewChat = React.useCallback(() => {
    clearConversation()
    navigate('/')
    setSidebarOpen(false)
  }, [clearConversation, navigate])

  const context = React.useMemo<OutletContext>(() => ({ onNewChat: handleNewChat }), [handleNewChat])
  const pageTitle = React.useMemo(() => resolveRouteTitle(location.pathname), [location.pathname])

  return (
    <div className={`flex h-screen w-full bg-[var(--app-bg)] text-[var(--text-primary)]`}>
      <Sidebar
        activePath={location.pathname}
        onNavigate={handleNavigate}
        onNewChat={handleNewChat}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeLabel={pageTitle}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          systemStatus={systemStatus as SystemStatus}
          onRefreshStatus={() => refreshHealth({ force: true })}
          refreshing={isHealthRefreshing}
        />
        <main className="flex min-h-0 flex-1 overflow-hidden bg-[var(--app-bg)]">
          <div className="flex min-h-0 flex-1 overflow-auto">
            <Outlet context={context} />
          </div>
        </main>
      </div>
    </div>
  )
}
