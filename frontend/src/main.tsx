import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import Home from './pages/Home'
import Earnings from './pages/Earnings'
import Score from './pages/Score'
import Vendors from './pages/Vendors'
import Sectors from './pages/Sectors'
import CompanyInfo from './pages/CompanyInfo'

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <Home /> },
    { path: 'earnings', element: <Earnings /> },
    { path: 'score', element: <Score /> },
    { path: 'vendors', element: <Vendors /> },
    { path: 'company-info', element: <CompanyInfo /> },
    { path: 'sectors', element: <Sectors /> },
  ]}
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
