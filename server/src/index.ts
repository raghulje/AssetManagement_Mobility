import dotenv from 'dotenv'
import { createApp } from './app.js'
import { seed } from './db/seed.js'
import { startHrmsAutoSync } from './services/employeeHrmsSync.js'
import { startEolAlertScheduler } from './services/eolAlerts.js'

dotenv.config()

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || '0.0.0.0'

await seed()

const app = createApp()

app.listen(port, host, () => {
  console.log(`Refex API listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  console.log(`LAN:    set PUBLIC_APP_URL / open UI via your Wi‑Fi IP (e.g. http://10.x.x.x:5173)`)
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST /api/v1/login  { "email": "raghul.je@refex.co.in", "password": "Welcome@2026" }`)
  startHrmsAutoSync()
  startEolAlertScheduler()
})
