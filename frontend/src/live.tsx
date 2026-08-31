/* Memecoin Live SPA entry — repo DNA: a multi-page vite entry served by
   webapp/server.py (/live and /live/{chain} both serve live.html). Path
   parsing is explicit — no router dependency. Per-page document titles. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChainLive } from './pages/ChainLive'
import { LiveBoard } from './pages/LiveBoard'
import './styles/live.css'

const parts = window.location.pathname.split('/').filter(Boolean)
const chain = parts[0] === 'live' && parts[1] ? decodeURIComponent(parts[1]) : null

document.title = chain
  ? `${chain.toUpperCase()} · Memecoin Live — VILMEI`
  : 'Memecoin Live — VILMEI'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {chain ? <ChainLive chain={chain} /> : <LiveBoard />}
  </StrictMode>,
)
