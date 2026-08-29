import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { ensureVehicleQr } from '../services/vehicleQr.js'
import { makeCaptureFormUploader, storageRoot } from '../services/uploads.js'
import { logAction } from '../services/actionLog.js'
import { notifyWorkflow } from '../services/notify.js'

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
const SUBMIT_MAX = 500

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

let captureKindColumnReady = false

async function ensureCaptureKindColumn() {
  if (captureKindColumnReady) return
  const cols = await all<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehicle_captures'
      AND COLUMN_NAME = 'capture_kind'
  `).catch(() => [])
  if (!cols.length) {
    await run(`
      ALTER TABLE vehicle_captures
      ADD COLUMN capture_kind VARCHAR(32) NOT NULL DEFAULT 'vehicle'
      COMMENT 'vehicle | odometer | extra_1 | extra_2 | chassis | walkaround_video'
      AFTER address
    `)
  }
  captureKindColumnReady = true
}

function flattenUploadedFiles(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined,
): Express.Multer.File[] {
  if (!files) return []
  if (Array.isArray(files)) return files
  return Object.values(files).flat()
}

function unlinkAll(files: Express.Multer.File[]) {
  for (const f of files) fs.unlink(f.path, () => undefined)
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
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

/** Example Employee ID shown on the public capture form. */
const EMPLOYEE_ID_FORMAT_SAMPLE = 'RGML011182'

/**
 * Sample Employee ID format for the public capture form placeholder.
 * GET /api/v1/public/employees/id-format-hint
 */
router.get('/employees/id-format-hint', async (_req, res) => {
  const sample = EMPLOYEE_ID_FORMAT_SAMPLE
  return okItem(res, {
    sample,
    placeholder: `e.g. ${sample}`,
    hint: `Enter your HRMS Employee ID exactly as shown in payroll (example: ${sample}).`,
  })
})

/**
 * Exact active employee lookup by employee code (typed ID on public form).
 * GET /api/v1/public/employees/lookup?code=
 */
router.get('/employees/lookup', async (req, res) => {
  const code = String(req.query.code || req.query.employee_code || '').trim()
  if (code.length < 1) return fail(res, 'Employee ID is required')

  const row = await get<Record<string, unknown>>(`
    SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile,
           department_name, designation, employment_status, employment_status_description
    FROM employees
    WHERE deleted_at IS NULL
      AND UPPER(TRIM(employee_code)) = UPPER(?)
    LIMIT 1
  `, [code]).catch(() => null)

  if (!row) return fail(res, 'Employee ID not found', 404)

  const isActive = String(row.employment_status_description || '') === 'Active'
    || String(row.employment_status || '') === '1'
  if (!isActive) return fail(res, 'Only active employees can use this form', 400)

  const empCode = String(row.employee_code || '')
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
  return okItem(res, {
    id: Number(row.id),
    employee_code: empCode,
    name: name || empCode,
    email: row.email ? String(row.email).trim() : null,
    mobile: row.mobile ? String(row.mobile).trim() : null,
    work_mobile: row.work_mobile ? String(row.work_mobile).trim() : null,
    department_name: row.department_name ? String(row.department_name) : null,
    designation: row.designation ? String(row.designation) : null,
    text: [empCode, name].filter(Boolean).join(' — '),
  })
})

/**
 * Active employees for public capture form (legacy typeahead; prefer /lookup).
 * GET /api/v1/public/employees/search?q=
 */
router.get('/employees/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 1) return okList(res, [])
  const like = `%${q.replace(/[%_]/g, '')}%`
  const rows = await all<Record<string, unknown>>(`
    SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile,
           department_name, designation
    FROM employees
    WHERE deleted_at IS NULL
      AND (employment_status_description = 'Active' OR employment_status = '1')
      AND (
        employee_code LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
        OR email LIKE ?
        OR CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) LIKE ?
      )
    ORDER BY
      CASE WHEN employee_code LIKE ? THEN 0 ELSE 1 END,
      employee_code ASC
    LIMIT 40
  `, [like, like, like, like, like, `${q.replace(/[%_]/g, '')}%`]).catch(() => [])

  return okList(res, rows.map((r) => {
    const code = String(r.employee_code || '')
    const name = `${r.first_name || ''} ${r.last_name || ''}`.trim()
    return {
      id: Number(r.id),
      employee_code: code,
      name: name || code,
      email: r.email ? String(r.email).trim() : null,
      mobile: r.mobile ? String(r.mobile).trim() : null,
      work_mobile: r.work_mobile ? String(r.work_mobile).trim() : null,
      department_name: r.department_name ? String(r.department_name) : null,
      designation: r.designation ? String(r.designation) : null,
      text: [code, name].filter(Boolean).join(' — '),
    }
  }))
})

/**
 * Public multi-photo capture submit (no auth).
 * POST /api/v1/public/capture-form
 * multipart: vehicle_id, employee_id, photos[], odometer_photo[],
 *           chassis_photos[], walkaround_video
 */
router.post('/capture-form', (req, res) => {
  const ip = clientIp(req as { ip?: string; headers: Record<string, unknown> })
  if (!allowSubmit(ip)) {
    return fail(res, 'Too many submissions from this network. Try again later.', 429)
  }

  const upload = makeCaptureFormUploader('public/vehicles')
  upload(req, res, async (err) => {
    if (err) return fail(res, err.message || 'Upload failed')

    const allFiles = flattenUploadedFiles(req.files as Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] })
    const byField = (req.files && !Array.isArray(req.files))
      ? req.files as { [fieldname: string]: Express.Multer.File[] }
      : { photos: (req.files as Express.Multer.File[] | undefined) || [] }

    try {
      await ensureSubmitterColumns()
      await ensureCaptureKindColumn()

      const body = req.body || {}
      const vehicleId = Number(body.vehicle_id)
      const employeeIdRaw = Number(body.employee_id)
      const employeeCodeRaw = String(body.employee_code || body.employee_id_code || '').trim()
      const vehiclePhotos = byField.photos || []
      const odometerPhoto = byField.odometer_photo || []
      const chassisPhotos = byField.chassis_photos || []
      // const walkaroundVideo = byField.walkaround_video || [] // walkaround video disabled

      if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
        unlinkAll(allFiles)
        return fail(res, 'Select a vehicle number')
      }

      let employee = null as null | {
        id: number
        employee_code: string
        first_name: string | null
        last_name: string | null
        email: string | null
        mobile: string | null
        work_mobile: string | null
        employment_status: string | null
        employment_status_description: string | null
      }

      if (Number.isFinite(employeeIdRaw) && employeeIdRaw > 0) {
        employee = (await get(`
          SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile,
                 employment_status, employment_status_description
          FROM employees
          WHERE id = ? AND deleted_at IS NULL
        `, [employeeIdRaw])) ?? null
      } else if (employeeCodeRaw) {
        employee = (await get(`
          SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile,
                 employment_status, employment_status_description
          FROM employees
          WHERE deleted_at IS NULL AND UPPER(TRIM(employee_code)) = UPPER(?)
          LIMIT 1
        `, [employeeCodeRaw])) ?? null
      } else {
        unlinkAll(allFiles)
        return fail(res, 'Enter your employee ID')
      }

      if (!employee) {
        unlinkAll(allFiles)
        return fail(res, 'Employee not found', 404)
      }
      const isActive = String(employee.employment_status_description || '') === 'Active'
        || String(employee.employment_status || '') === '1'
      if (!isActive) {
        unlinkAll(allFiles)
        return fail(res, 'Only active employees can submit this form')
      }

      const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
        || String(employee.employee_code)
      const email = String(employee.email || '').trim().toLowerCase()
      const mobile = String(employee.mobile || '').trim()
      const workMobile = String(employee.work_mobile || '').trim()
      const phoneParts = [mobile, workMobile].filter(Boolean)
      const phone = phoneParts.join(' / ')

      if (!email || !isEmail(email)) {
        unlinkAll(allFiles)
        return fail(res, 'This employee has no valid email in HRMS')
      }
      if (!phone) {
        unlinkAll(allFiles)
        return fail(res, 'This employee has no mobile / work mobile in HRMS')
      }
      if (vehiclePhotos.length < 4) {
        unlinkAll(allFiles)
        return fail(res, 'At least 4 vehicle photos are required')
      }
      if (odometerPhoto.length !== 1) {
        unlinkAll(allFiles)
        return fail(res, 'Odometer photo is required')
      }
      if (chassisPhotos.length !== 3) {
        unlinkAll(allFiles)
        return fail(res, 'Exactly 3 chassis photos are required')
      }
      // Walkaround video disabled — no longer required on public form
      // if (walkaroundVideo.length !== 1) {
      //   unlinkAll(allFiles)
      //   return fail(res, 'Walkaround video is required')
      // }
      if (vehiclePhotos.length > 20) {
        unlinkAll(allFiles)
        return fail(res, 'Maximum 20 vehicle photos per submission')
      }

      const vehicle = await get<{ id: number; vehicle_number: string }>(`
        SELECT id, vehicle_number FROM vehicles WHERE id = ? AND deleted_at IS NULL
      `, [vehicleId])
      if (!vehicle) {
        unlinkAll(allFiles)
        return fail(res, 'Vehicle not found', 404)
      }

      const already = await get<{ id: number }>(`
        SELECT id FROM vehicle_capture_sessions
        WHERE vehicle_id = ? AND source = 'public_form'
        LIMIT 1
      `, [vehicleId]).catch(() => null)
      if (already) {
        unlinkAll(allFiles)
        return fail(res, 'This vehicle is already registered via the capture form', 409)
      }

      const lat = body.latitude !== undefined && body.latitude !== '' ? Number(body.latitude) : null
      const lng = body.longitude !== undefined && body.longitude !== '' ? Number(body.longitude) : null
      const address = String(body.address || '').trim() || null
      if (lat != null && !Number.isFinite(lat)) {
        unlinkAll(allFiles)
        return fail(res, 'Invalid latitude')
      }
      if (lng != null && !Number.isFinite(lng)) {
        unlinkAll(allFiles)
        return fail(res, 'Invalid longitude')
      }

      const ts = now()
      const notes = `Public form · ${employee.employee_code} · ${name} · ${email} · ${phone}`
      const session = await run(`
        INSERT INTO vehicle_capture_sessions
          (vehicle_id, captured_by, notes, submitter_name, submitter_email, submitter_phone, source, created_at, updated_at)
        VALUES (?, NULL, ?, ?, ?, ?, 'public_form', ?, ?)
      `, [vehicleId, notes, name, email, phone, ts, ts])
      const sessionId = Number(session.insertId)

      const captureIds: number[] = []
      const capturedAt = String(body.captured_at || '').trim() || ts

      async function saveCapture(file: Express.Multer.File, kind: string) {
        const rel = path.relative(storageRoot, file.path).replace(/\\/g, '/')
        const result = await run(`
          INSERT INTO vehicle_captures
            (vehicle_id, session_id, captured_by, storage_path, original_name, mime_type, file_size,
             captured_at, latitude, longitude, address, capture_kind, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vehicleId, sessionId, rel, file.originalname, file.mimetype,
          file.size, capturedAt, lat, lng, address, kind, ts, ts,
        ])
        captureIds.push(Number(result.insertId))
      }

      for (const file of vehiclePhotos) await saveCapture(file, 'vehicle')
      for (const file of odometerPhoto) await saveCapture(file, 'odometer')
      for (const file of chassisPhotos) await saveCapture(file, 'chassis')
      // for (const file of walkaroundVideo) await saveCapture(file, 'walkaround_video')

      await logAction({
        actionType: 'registered',
        itemType: 'vehicle',
        itemId: vehicleId,
        note: 'Public form registration submitted',
        meta: {
          session_id: sessionId,
          capture_ids: captureIds,
          employee_id: employee.id,
          employee_code: employee.employee_code,
          submitter_name: name,
          submitter_email: email,
          photo_count: captureIds.length,
        },
      })

      notifyWorkflow({
        category: 'form_registration',
        event: 'vehicle.form_registration',
        subject: `Form registration · ${vehicle.vehicle_number}`,
        title: 'New form registration to verify',
        intro: 'A first-time public capture form was submitted. Review the photos and mark the registration as verified when checks are complete.',
        fields: [
          { label: 'Vehicle', value: vehicle.vehicle_number },
          { label: 'Employee ID', value: String(employee.employee_code) },
          { label: 'Name', value: name },
          { label: 'Email', value: email },
          { label: 'Phone', value: phone },
          { label: 'Files', value: String(captureIds.length) },
        ],
        ctaPath: `/vehicles/${vehicleId}?tab=captures`,
        ctaLabel: 'Open photos to verify',
        itemType: 'vehicle',
        itemId: vehicleId,
      })

      return okMessage(res, `Submitted ${captureIds.length} file(s) for ${vehicle.vehicle_number}`, {
        session_id: sessionId,
        vehicle_id: vehicleId,
        vehicle_number: vehicle.vehicle_number,
        photo_count: captureIds.length,
        capture_ids: captureIds,
      }, 201)
    } catch (e) {
      unlinkAll(allFiles)
      console.error('[public/capture-form]', e)
      return fail(res, 'Could not save capture submission')
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
