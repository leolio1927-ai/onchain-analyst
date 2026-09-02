/* Sidebar matrix — the single source of truth for terminal navigation.
   A pill is a claim: 'LIVE' means the page is wired today, SOON means it
   is not. Shell.test.tsx pins the claim against the wired routes. */
export interface NavItem {
  id: string
  icon: string
  label: string
  pill?: 'NEW' | 'LIVE' | number
  soon?: boolean
}

export const NAV: NavItem[] = [
  { id: 'dashboard', icon: '▦', label: 'Dashboard' },
  { id: 'swap', icon: '⇅', label: 'VILMEI SWAP', pill: 'NEW' },
  { id: 'scanner', icon: '⌕', label: 'Token Scanner' },
  { id: 'rugcheck', icon: '⛨', label: 'Rug Check', pill: 'LIVE' },
  { id: 'whale', icon: '◍', label: 'Whale Tracker', pill: 'LIVE' },
  { id: 'cluster', icon: '❋', label: 'Cluster Analysis', soon: true },
  { id: 'ai', icon: '✦', label: 'AI Analyst', pill: 'LIVE' },
  { id: 'portfolio', icon: '▤', label: 'Portfolio Watch', pill: 'LIVE' },
  { id: 'alerts', icon: '◆', label: 'Alerts', soon: true },
  { id: 'holdings', icon: '▣', label: 'Holdings Check', pill: 'LIVE' },
  { id: 'gate', icon: '⚿', label: 'Token Gate', soon: true },
  { id: 'settings', icon: '⚙', label: 'Settings', soon: true },
  { id: 'docs', icon: '❐', label: 'Documentation', soon: true },
  { id: 'feedback', icon: '✎', label: 'Feedback', soon: true },
]
