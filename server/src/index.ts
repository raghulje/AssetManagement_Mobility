import dotenv from 'dotenv'
import { createApp } from './app.js'
import { seed } from './db/seed.js'
import { startHrmsAutoSync } from './services/employeeHrmsSync.js'
import { startVehicleEolAlertScheduler } from './services/vehicleEolAlerts.js'

dotenv.config()

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || '0.0.0.0'
const serveClient = process.env.SERVE_CLIENT === 'true'
const publicApp = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')

function formatDbBootError(err: unknown): string {
  const e = err as { code?: string; message?: string; errors?: Array<{ code?: string; address?: string; port?: number }> }
  const code = e?.code || e?.errors?.[0]?.code
  const host = process.env.DB_HOST || 'localhost'
  const portDb = process.env.DB_PORT || '3306'
  const name = process.env.DB_NAME || 'ITAssetManagement_2026'
  if (code === 'ECONNREFUSED') {
    return [
      `MySQL is not reachable at ${host}:${portDb} (ECONNREFUSED).`,
      'Start the MySQL Windows service (or run mysqld), then retry.',
      `Expected database from server/.env: ${name}`,
      'Tip: MySQL Installer / mysql_configurator can create the service if it is missing.',
    ].join('\n')
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `Database "${name}" does not exist. Create it, then run: npm run migrate`
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return `MySQL rejected credentials for DB_USER=${process.env.DB_USER || 'root'}. Check server/.env`
  }
  return e?.message || String(err)
}

try {
  await seed()
} catch (err) {
  console.error('\nFailed to start Refex Mobility API — database bootstrap failed:\n')
  console.error(formatDbBootError(err))
  console.error('')
  process.exit(1)
}

try {
  const { ensureDefaultRoles } = await import('./services/permissions.js')
  await ensureDefaultRoles()
  console.log('Roles & permissions ready')
} catch (e) {
  console.warn('ensureDefaultRoles failed:', e instanceof Error ? e.message : e)
}
try {
  const { ensureDefaultVerifiers } = await import('./services/provisionVerifiers.js')
  await ensureDefaultVerifiers()
  console.log('Default Verifiers mapped')
} catch (e) {
  console.warn('ensureDefaultVerifiers failed:', e instanceof Error ? e.message : e)
}

const app = createApp()

app.listen(port, host, () => {
  console.log(`Refex Mobility API listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  if (serveClient) {
    console.log(`Mode:   SERVE_CLIENT=true (API + client/out on one port)`)
    if (publicApp) console.log(`Public: ${publicApp}`)
    else console.log(`Public: set PUBLIC_APP_URL / FRONTEND_URL in server/.env to your mapped domain`)
  } else {
    console.log(`Dev:    Vite on :5173 + API on :${port} (set SERVE_CLIENT=true for single-port deploy)`)
  }
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST http://localhost:${port}/api/v1/login`)
  startHrmsAutoSync()
  startVehicleEolAlertScheduler()
})
