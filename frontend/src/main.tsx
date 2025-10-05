import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import App from './App'
import Home from './pages/Home'
import Earnings from './pages/Earnings'
import Score from './pages/Score'
import Vendors from './pages/Vendors'
import CompanyInfo from './pages/CompanyInfo'
import { ChatSessionProvider } from './components/chat/ChatSessionProvider'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/onboarding', element: (
      <Protected>
        <App />
      </Protected>
    ), children: [
      { index: true, element: <Onboarding /> },
    ] },
  { path: '/', element: (
      <Protected>
        <App />
      </Protected>
    ), children: [
      { index: true, element: <Home /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'earnings', element: <Earnings /> },
      { path: 'score', element: <Score /> },
      { path: 'vendors', element: <Vendors /> },
      { path: 'company-info', element: <CompanyInfo /> },
    ]},
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ChatSessionProvider>
        <RouterProvider router={router} />
      </ChatSessionProvider>
    </AuthProvider>
  </React.StrictMode>
)
