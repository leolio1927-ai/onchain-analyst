import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './layout/Shell'
import { WalletProvider } from './wallet/WalletContext'
import Dashboard from './pages/Dashboard'
import { TokenPage } from './pages/TokenPage'
import { ClusterPage, RugCheckPage, ScannerPage, WhalePage } from './pages/AnalysisPages'
import { AiPage, AlertsPage, DocsPage, FeedbackPage, GatePage, HoldingsPage, PortfolioPage, SettingsPage } from './pages/Pages2'
import './styles/app.css'

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <WalletProvider>
        <Shell
      pages={{
        dashboard: <Dashboard />,
        swap: <TokenPage />,
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
      </WalletProvider>
    </StrictMode>,
  )
}
