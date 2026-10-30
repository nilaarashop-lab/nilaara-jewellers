import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.jsx'

// Cookieless page-view counts, served from this site. History mode makes the
// single-page app report each route change instead of only the first load.
inject({ mode: 'history' })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
