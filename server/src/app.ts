import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import path from 'node:path'
import { authRequired } from './middleware/auth.js'
import { fail } from './utils/response.js'
import authRouter from './routes/auth.js'
import hardwareRouter from './routes/hardware.js'
import licensesRouter from './routes/licenses.js'
import { accessoriesRouter, consumablesRouter, componentsRouter, kitsRouter } from './routes/inventory.js'
import { usersRouter, mastersRouter } from './routes/users.js'
import { employeesRouter } from './routes/employees.js'
import {
  reportsRouter, maintenancesRouter, dashboardRouter,
  settingsRouter, accountRouter, requestsRouter,
} from './routes/reports.js'
import importsRouter from './routes/imports.js'
import filesRouter from './routes/files.js'
import labelsRouter from './routes/labels.js'
import publicAssetsRouter from './routes/publicAssets.js'
import agentRouter from './routes/agent.js'
import { storageRoot } from './services/uploads.js'

export function createApp() {
  const app = express()

  app.use(cors({
    origin(origin, cb) {
      // Allow same-origin tools / mobile browsers with no Origin, localhost, and private LAN
      if (!origin) return cb(null, true)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true)
      if (/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
        return cb(null, true)
      }
      const allowed = String(process.env.CLIENT_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allowed.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '20mb' }))
  app.use(morgan('dev'))

  // Public static files (images, barcodes)
  app.use('/storage', express.static(path.join(storageRoot, 'public'), {
    fallthrough: true,
  }))
  app.use('/storage', express.static(storageRoot))

  app.get('/api/v1/status', (_req, res) => {
    res.json({
      status: 'ok',
      product: 'Refex Asset Management',
      version: '1.1.0',
      features: ['imports', 'labels', 'uploads', 'signatures', 'reports', 'public-qr', 'agent-sync', 'agent-remote-scan'],
    })
  })

  app.use('/api/v1', authRouter)
  // Public QR scan + device agent (no session cookie)
  app.use('/api/v1/public', publicAssetsRouter)
  app.use('/api/v1/agent', agentRouter)

  const api = express.Router()
  api.use(authRequired)

  api.use('/hardware', hardwareRouter)
  api.use('/licenses', licensesRouter)
  api.use('/accessories', accessoriesRouter)
  api.use('/consumables', consumablesRouter)
  api.use('/components', componentsRouter)
  api.use('/kits', kitsRouter)
  api.use('/users', usersRouter)
  api.use('/employees', employeesRouter)
  api.use(mastersRouter)
  api.use('/reports', reportsRouter)
  api.use('/maintenances', maintenancesRouter)
  api.use('/dashboard', dashboardRouter)
  api.use('/settings', settingsRouter)
  api.use('/account', accountRouter)
  api.use('/requests', requestsRouter)
  api.post('/notifications/eol/run', async (_req, res) => {
    const { runEolAlertDigest } = await import('./services/eolAlerts.js')
    const { okMessage, fail: failRes } = await import('./utils/response.js')
    try {
      const result = await runEolAlertDigest()
      return okMessage(res, result.sent ? 'EOL digest sent' : (result.skippedReason || 'Skipped'), result)
    } catch (e) {
      return failRes(res, e instanceof Error ? e.message : 'EOL digest failed', 500)
    }
  })
  api.use('/imports', importsRouter)
  api.use('/labels', labelsRouter)
  api.use(filesRouter)

  app.use('/api/v1', api)

  app.use((_req, res) => fail(res, 'Not found', 404))
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    return fail(res, err.message || 'Server error', 500)
  })

  return app
}
