import dotenv from 'dotenv'
import { createApp } from './app.js'
import { seed } from './db/seed.js'
import { startHrmsAutoSync } from './services/employeeHrmsSync.js'
import { startEolAlertScheduler } from './services/eolAlerts.js'

dotenv.config()

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || '0.0.0.0'
const serveClient = process.env.SERVE_CLIENT === 'true'
const publicApp = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')

await seed()
try {
  const { ensureDefaultRoles } = await import('./services/permissions.js')
  await ensureDefaultRoles()
  console.log('Roles & permissions ready')
} catch (e) {
  console.warn('ensureDefaultRoles failed:', e instanceof Error ? e.message : e)
}

const app = createApp()

app.listen(port, host, () => {
  console.log(`Refex API listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  if (serveClient) {
    console.log(`LAN UI: open http://<Wi‑Fi-IP>:${port}  (SERVE_CLIENT=true — single process like Biogas_MIS_Vizag)`)
    if (publicApp) console.log(`Public: ${publicApp}`)
  } else {
    console.log(`LAN:    set PUBLIC_APP_URL / open UI via your Wi‑Fi IP (e.g. http://10.x.x.x:5173)`)
    console.log(`        Or set SERVE_CLIENT=true + build client/out for single-port LAN (recommended)`)
  }
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST /api/v1/login  { "email": "raghul.je@refex.co.in", "password": "Welcome@2026" }`)
  startHrmsAutoSync()
  startEolAlertScheduler()
})
