import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './layout/Shell'
import Dashboard from './pages/Dashboard'
import { ClusterPage, RugCheckPage, ScannerPage, WhalePage } from './pages/AnalysisPages'
import { AiPage, AlertsPage, DocsPage, FeedbackPage, GatePage, HoldingsPage, PortfolioPage, SettingsPage } from './pages/Pages2'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell
      pages={{
        dashboard: <Dashboard />,
        scanner: <ScannerPage />,
        rugcheck: <RugCheckPage />,
        whale: <WhalePage />,
        cluster: <ClusterPage />,
        ai: <AiPage />,
        portfolio: <PortfolioPage />,
        alerts: <AlertsPage />,
        holdings: <HoldingsPage />,
        gate: <GatePage />,
        settings: <SettingsPage />,
        docs: <DocsPage />,
        feedback: <FeedbackPage />,
      }}
    />
  </StrictMode>,
)
