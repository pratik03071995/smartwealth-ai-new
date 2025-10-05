import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import Home from './pages/Home'
import Earnings from './pages/Earnings'
import Score from './pages/Score'
import Vendors from './pages/Vendors'
import CompanyInfo from './pages/CompanyInfo'
import { ChatSessionProvider } from './components/chat/ChatSessionProvider'

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <Home /> },
    { path: 'earnings', element: <Earnings /> },
    { path: 'score', element: <Score /> },
    { path: 'vendors', element: <Vendors /> },
    { path: 'company-info', element: <CompanyInfo /> },
  ]}
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChatSessionProvider>
      <RouterProvider router={router} />
    </ChatSessionProvider>
  </React.StrictMode>
)
