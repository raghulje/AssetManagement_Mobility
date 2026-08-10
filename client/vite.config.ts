import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 — reachable on LAN Wi‑Fi
    port: 5173,
    strictPort: true,
    open: false,
  },
})
