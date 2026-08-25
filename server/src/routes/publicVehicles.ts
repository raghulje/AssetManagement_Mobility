import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { ensureVehicleQr } from '../services/vehicleQr.js'
import { makeMultiUploader, storageRoot } from '../services/uploads.js'
import { logAction } from '../services/actionLog.js'

const router = Router()

const PUBLIC_SELECT = `
  id, vehicle_number, name, model, make, variant, location_name, category, fuel_type, status,
  fleet_id, vin, color, assigned_type,
  CASE
    WHEN assigned_type = 'user' THEN (
      SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))
      FROM users u WHERE u.id = assigned_to)
    WHEN assigned_type = 'employee' THEN (
      SELECT TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')))
      FROM employees e WHERE e.id = assigned_to)
    WHEN assigned_type = 'driver' THEN (
      SELECT TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,'')))
      FROM vehicle_drivers d WHERE d.id = assigned_to)
    ELSE NULL
  END AS assigned_name,
  qr_token, qr_url, qr_image_path
`

/** Simple in-memory rate limit for public form submits (per IP). */
const submitHits = new Map<string, number[]>()
const SUBMIT_WINDOW_MS = 60 * 60 * 1000
const SUBMIT_MAX = 20

function clientIp(req: { ip?: string; headers: Record<string, unknown> }) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || req.ip || 'unknown'
}

function allowSubmit(ip: string) {
  const nowMs = Date.now()
  const prev = (submitHits.get(ip) || []).filter((t) => nowMs - t < SUBMIT_WINDOW_MS)
  if (prev.length >= SUBMIT_MAX) {
    submitHits.set(ip, prev)
    return false
  }
  prev.push(nowMs)
  submitHits.set(ip, prev)
  return true
}

let submitterColumnsReady = false

/** Soft-ensure guest columns exist even if migrate UI has not been run yet. */
async function ensureSubmitterColumns() {
  if (submitterColumnsReady) return
  const cols = await all<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehicle_capture_sessions'
      AND COLUMN_NAME IN ('submitter_name','submitter_email','submitter_phone','source')
  `).catch(() => [])
  const have = new Set(cols.map((c) => String((c as { COLUMN_NAME?: string; column_name?: string }).COLUMN_NAME
    || (c as { column_name?: string }).column_name
    || '')))
  have.delete('')
  const alters: string[] = []
  if (!have.has('submitter_name')) alters.push('ADD COLUMN `submitter_name` VARCHAR(191) NULL')
  if (!have.has('submitter_email')) alters.push('ADD COLUMN `submitter_email` VARCHAR(191) NULL')
  if (!have.has('submitter_phone')) alters.push('ADD COLUMN `submitter_phone` VARCHAR(32) NULL')
  if (!have.has('source')) alters.push("ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'app'")
  if (alters.length) {
    await run(`ALTER TABLE vehicle_capture_sessions ${alters.join(', ')}`)
  }
  submitterColumnsReady = true
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function isPhone(v: string) {
  const digits = v.replace(/\D/g, '')
  // Allow optional country code 91 + 10-digit Indian mobile
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  return /^[6-9]\d{9}$/.test(local)
}

function isName(v: string) {
  return /^[A-Za-z][A-Za-z .'-]{1,100}$/.test(v.trim())
}

/**
 * Searchable vehicle dropdown for the public capture form.
 * GET /api/v1/public/vehicles/search?q=
 */
router.get('/vehicles/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 1) {
    return okList(res, [])
  }
  const like = `%${q.replace(/[%_]/g, '')}%`
  const rows = await all<Record<string, unknown>>(`
    SELECT v.id, v.vehicle_number, v.model, v.location_name, v.category, v.status,
      (
        SELECT s.id FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form'
        LIMIT 1
      ) AS form_session_id
    FROM vehicles v
    WHERE v.deleted_at IS NULL
      AND (
        v.vehicle_number LIKE ?
        OR v.model LIKE ?
        OR v.location_name LIKE ?
        OR COALESCE(v.name,'') LIKE ?
      )
    ORDER BY
      CASE WHEN v.vehicle_number LIKE ? THEN 0 ELSE 1 END,
      v.vehicle_number ASC
    LIMIT 40
  `, [like, like, like, like, `${q.replace(/[%_]/g, '')}%`]).catch(async () => {
    // Fallback before source column exists
    return all<Record<string, unknown>>(`
      SELECT id, vehicle_number, model, location_name, category, status, NULL AS form_session_id
      FROM vehicles
      WHERE deleted_at IS NULL
        AND (
          vehicle_number LIKE ?
          OR model LIKE ?
          OR location_name LIKE ?
          OR COALESCE(name,'') LIKE ?
        )
      ORDER BY vehicle_number ASC
      LIMIT 40
    `, [like, like, like, like])
  })

  return okList(res, rows.map((r) => ({
    id: Number(r.id),
    vehicle_number: String(r.vehicle_number || ''),
    model: r.model ? String(r.model) : null,
    location_name: r.location_name ? String(r.location_name) : null,
    category: r.category ? String(r.category) : null,
    status: r.status ? String(r.status) : null,
    form_registered: r.form_session_id != null,
    text: [
      String(r.vehicle_number || ''),
      r.model ? String(r.model) : '',
      r.location_name ? String(r.location_name) : '',
    ].filter(Boolean).join(' — '),
  })))
})

/**
 * Public multi-photo capture submit (no auth).
 * POST /api/v1/public/capture-form
 * multipart: vehicle_id, name, email, phone, photos[]
 */
router.post('/capture-form', (req, res) => {
  const ip = clientIp(req as { ip?: string; headers: Record<string, unknown> })
  if (!allowSubmit(ip)) {
    return fail(res, 'Too many submissions from this network. Try again later.', 429)
  }

  const upload = makeMultiUploader('public/vehicles', 'photos', 20)
  upload(req, res, async (err) => {
    if (err) return fail(res, err.message || 'Upload failed')

    try {
      await ensureSubmitterColumns()

      const body = req.body || {}
      const vehicleId = Number(body.vehicle_id)
      const name = String(body.name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const phone = String(body.phone || '').trim()
      const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []

      if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Select a vehicle number')
      }
      if (!name || !isName(name)) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Enter a valid full name')
      }
      if (!email || !isEmail(email)) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Enter a valid email address')
      }
      if (!phone || !isPhone(phone)) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Enter a valid 10-digit mobile number')
      }
      if (files.length < 1) {
        return fail(res, 'At least one photo is required')
      }
      if (files.length > 20) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Maximum 20 photos per submission')
      }

      const vehicle = await get<{ id: number; vehicle_number: string }>(`
        SELECT id, vehicle_number FROM vehicles WHERE id = ? AND deleted_at IS NULL
      `, [vehicleId])
      if (!vehicle) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Vehicle not found', 404)
      }

      const already = await get<{ id: number }>(`
        SELECT id FROM vehicle_capture_sessions
        WHERE vehicle_id = ? AND source = 'public_form'
        LIMIT 1
      `, [vehicleId]).catch(() => null)
      if (already) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'This vehicle is already registered via the capture form', 409)
      }

      const lat = body.latitude !== undefined && body.latitude !== '' ? Number(body.latitude) : null
      const lng = body.longitude !== undefined && body.longitude !== '' ? Number(body.longitude) : null
      const address = String(body.address || '').trim() || null
      if (lat != null && !Number.isFinite(lat)) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Invalid latitude')
      }
      if (lng != null && !Number.isFinite(lng)) {
        for (const f of files) fs.unlink(f.path, () => undefined)
        return fail(res, 'Invalid longitude')
      }

      const ts = now()
      const notes = `Public form · ${name} · ${email} · ${phone}`
      const session = await run(`
        INSERT INTO vehicle_capture_sessions
          (vehicle_id, captured_by, notes, submitter_name, submitter_email, submitter_phone, source, created_at, updated_at)
        VALUES (?, NULL, ?, ?, ?, ?, 'public_form', ?, ?)
      `, [vehicleId, notes, name, email, phone, ts, ts])
      const sessionId = Number(session.insertId)

      const captureIds: number[] = []
      for (const file of files) {
        const rel = path.relative(storageRoot, file.path).replace(/\\/g, '/')
        const capturedAt = String(body.captured_at || '').trim() || ts
        const result = await run(`
          INSERT INTO vehicle_captures
            (vehicle_id, session_id, captured_by, storage_path, original_name, mime_type, file_size,
             captured_at, latitude, longitude, address, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vehicleId, sessionId, rel, file.originalname, file.mimetype,
          file.size, capturedAt, lat, lng, address, ts, ts,
        ])
        captureIds.push(Number(result.insertId))
      }

      await logAction({
        actionType: 'uploaded',
        itemType: 'vehicle',
        itemId: vehicleId,
        note: 'public capture form',
        meta: {
          session_id: sessionId,
          capture_ids: captureIds,
          submitter_name: name,
          submitter_email: email,
          photo_count: captureIds.length,
        },
      })

      return okMessage(res, `Submitted ${captureIds.length} photo(s) for ${vehicle.vehicle_number}`, {
        session_id: sessionId,
        vehicle_id: vehicleId,
        vehicle_number: vehicle.vehicle_number,
        photo_count: captureIds.length,
        capture_ids: captureIds,
      }, 201)
    } catch (e) {
      const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []
      for (const f of files) fs.unlink(f.path, () => undefined)
      return fail(res, e instanceof Error ? e.message : 'Submit failed', 500)
    }
  })
})

router.get('/vehicles/:token', async (req, res) => {
  const token = String(req.params.token || '').trim()
  if (!token) return fail(res, 'Token required', 400)

  let row = await get<Record<string, unknown>>(`
    SELECT ${PUBLIC_SELECT}
    FROM vehicles
    WHERE qr_token = ? AND deleted_at IS NULL
    LIMIT 1
  `, [token]).catch(async () => {
    // Fallback if newer profile columns are missing on older DBs
    return get<Record<string, unknown>>(`
      SELECT id, vehicle_number, name, model, location_name, category, fuel_type, status,
             qr_token, qr_url, qr_image_path
      FROM vehicles
      WHERE qr_token = ? AND deleted_at IS NULL
      LIMIT 1
    `, [token])
  })

  if (!row) return fail(res, 'Vehicle not found', 404)

  try {
    await ensureVehicleQr(Number(row.id))
    const refreshed = await get<Record<string, unknown>>(`
      SELECT ${PUBLIC_SELECT}
      FROM vehicles WHERE id = ?
    `, [row.id]).catch(() => null)
    if (refreshed) row = refreshed
  } catch { /* ignore */ }

  const text = (v: unknown) => {
    const s = v == null ? '' : String(v).trim()
    return s || null
  }

  return okItem(res, {
    id: Number(row.id),
    vehicle_number: text(row.vehicle_number),
    name: text(row.name),
    model: text(row.model),
    make: text(row.make),
    variant: text(row.variant),
    location_name: text(row.location_name),
    category: text(row.category),
    fuel_type: text(row.fuel_type),
    status: text(row.status),
    fleet_id: text(row.fleet_id),
    vin: text(row.vin),
    color: text(row.color),
    assigned_name: text(row.assigned_name),
    assigned_type: text(row.assigned_type),
    qr_token: row.qr_token || null,
    qr_url: row.qr_url || null,
    qr_image_url: row.qr_token ? `/storage/vehicles/qr/${row.qr_token}.png` : null,
  })
})

export default router
