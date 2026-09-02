import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Multi-page app: / (landing) + /terminal + /live + /docs + /roadmap.
// Dev: `npm run dev` proxies /api to the FastAPI backend on :8000.
// Prod: `npm run build` → dist/ served by webapp/server.py.
// Tests: vitest in jsdom WITHOUT the canvas package — components must guard
// their own 2d contexts (2026-08-30 root fix).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    // full-page renders (landing/docs) boot preloader timers + staggered
    // fetch stubs; 5s flaked under parallel builds — 20s keeps the law, drops
    // the load-sensitivity (PROMPT-W+).
    testTimeout: 20000,
    // full-page renders are heavy; on a loaded box parallel workers cause
    // timing-window races — 2 workers keep runs deterministic
    maxWorkers: 2,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      // live-stream WebSocket (/ws/snap) must reach the backend in dev too
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        terminal: 'terminal.html',
        live: 'live.html',
        docs: 'docs.html',
        roadmap: 'roadmap.html',
        ledger: 'ledger.html',
      },
      output: {
        // V5-G4 (AMBIL, decision recorded in docs/TECH-DECISIONS.md):
        // Vite 8 = Rolldown, where output.manualChunks is replaced by
        // advancedChunks. One stable framework group so react/jsx-runtime
        // lands in a single long-cached chunk instead of per-route twins.
        // dial3d (lazy route chunk, 130.10 kB gzip ≤ 150 budget) is
        // deliberately NOT split further — the raw >500 kB warning is a
        // known-warning, not a budget miss.
        advancedChunks: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
