/* Roadmap full-page entry — 5th vite page served by webapp/server.py at /roadmap. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RoadmapPage } from './pages/RoadmapPage'

document.title = 'Roadmap — Terminal Alpha'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoadmapPage />
  </StrictMode>,
)
