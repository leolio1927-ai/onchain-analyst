/* Docs full-page entry — 4th vite page served by webapp/server.py at /docs. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DocsPage } from './pages/DocsPage'

document.title = 'Docs — Terminal Alpha'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DocsPage />
  </StrictMode>,
)
