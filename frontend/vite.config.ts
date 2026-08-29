import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Multi-page app: / (landing) + /terminal + /live + /docs + /roadmap.
// Dev: `npm run dev` proxies /api to the FastAPI backend on :8000.
// Prod: `npm run build` → dist/ served by webapp/server.py.
export default defineConfig({
  plugins: [react()],
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
      },
    },
  },
})
