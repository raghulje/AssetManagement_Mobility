import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { all, get, run, now, paginate, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { makeUploader, storageRoot } from '../services/uploads.js'
import { logAction } from '../services/actionLog.js'
import { ensureVehicleQr } from '../services/vehicleQr.js'
import { listEolDueVehicles } from '../services/vehicleEolAlerts.js'
import {
  pickVehicleProfile,
  mapVehicleProfile,
  UNIQUE_KEYS,
  VEHICLE_PROFILE_KEYS,
} from '../services/vehicleProfile.js'
import { requirePerm } from '../services/permissions.js'
import { actorLabel, notifyWorkflow } from '../services/notify.js'

const router = Router()

const STATUSES = new Set([
  'available', 'assigned', 'maintenance', 'retired', 'inactive', 'active',
  'draft', 'ordered', 'received', 'under_inspection', 'in_use', 'charging',
  'accident', 'temporarily_unavailable', 'decommissioned', 'disposed', 'lost', 'stolen',
])

async function assertUniqueProfile(
  profile: Record<string, unknown>,
  excludeId?: number | string,
) {
  for (const key of UNIQUE_KEYS) {
    const val = profile[key]
    if (val == null || val === '') continue
    const sql = excludeId
      ? `SELECT id, vehicle_number FROM vehicles WHERE ${key} = ? AND id <> ? AND deleted_at IS NULL LIMIT 1`
      : `SELECT id, vehicle_number FROM vehicles WHERE ${key} = ? AND deleted_at IS NULL LIMIT 1`
    const params = excludeId ? [val, excludeId] : [val]
    const clash = await get<{ id: number; vehicle_number: string }>(sql, params)
    if (clash) {
      throw new Error(`${key.replace(/_/g, ' ')} already used by ${clash.vehicle_number}`)
    }
  }
}

async function loadVehicle(id: number | string) {
  return get<Record<string, unknown>>(`
    SELECT v.*,
      (SELECT COUNT(*) FROM vehicle_captures c
        WHERE c.vehicle_id = v.id AND c.deleted_at IS NULL) AS captures_count,
      (SELECT MAX(c.captured_at) FROM vehicle_captures c
        WHERE c.vehicle_id = v.id AND c.deleted_at IS NULL) AS last_captured_at,
      (SELECT COUNT(*) FROM vehicle_maintenances m
        WHERE m.vehicle_id = v.id AND m.deleted_at IS NULL) AS maintenances_count,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM vehicle_capture_sessions s
          WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NOT NULL
        ) THEN 1 ELSE 0
      END AS form_verified,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM vehicle_capture_sessions s
          WHERE s.vehicle_id = v.id AND s.source = 'public_form'
        ) THEN 1 ELSE 0
      END AS form_registered,
      CASE
        WHEN v.assigned_type = 'user' THEN (
          SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))
          FROM users u WHERE u.id = v.assigned_to)
        WHEN v.assigned_type = 'employee' THEN (
          SELECT TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''),
            ' (', COALESCE(e.employee_code,''), ')'))
          FROM employees e WHERE e.id = v.assigned_to)
        WHEN v.assigned_type = 'driver' THEN (
          SELECT TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,''),
            CASE WHEN d.driver_code IS NOT NULL AND d.driver_code <> '' THEN CONCAT(' (', d.driver_code, ')') ELSE '' END))
          FROM vehicle_drivers d WHERE d.id = v.assigned_to)
        ELSE NULL
      END AS assigned_name,
      (SELECT name FROM companies c WHERE c.id = v.company_id) AS company_name,
      (SELECT name FROM legal_entities le WHERE le.id = v.legal_entity_id) AS legal_entity_name
    FROM vehicles v
    WHERE v.id = ? AND v.deleted_at IS NULL
  `, [id])
}

function mapVehicle(row: Record<string, unknown>) {
  const assignedTo = row.assigned_to != null ? Number(row.assigned_to) : null
  const profile = mapVehicleProfile(row)
  return {
    id: Number(row.id),
    asset_id: Number(row.id),
    vehicle_number: row.vehicle_number,
    name: row.name || null,
    model: row.model,
    model_id: row.model_id != null ? Number(row.model_id) : null,
    location_name: row.location_name,
    city_id: row.city_id != null ? Number(row.city_id) : null,
    category: row.category,
    fuel_type: row.fuel_type,
    status: row.status,
    notes: row.notes || null,
    assigned_to: assignedTo,
    assigned_type: row.assigned_type || null,
    assigned_name: row.assigned_name || null,
    expected_checkin: row.expected_checkin || null,
    last_checkout: row.last_checkout || null,
    last_checkin: row.last_checkin || null,
    checkout_counter: Number(row.checkout_counter || 0),
    checkin_counter: Number(row.checkin_counter || 0),
    purchase_date: row.purchase_date || null,
    purchase_cost: row.purchase_cost != null ? Number(row.purchase_cost) : null,
    order_number: row.order_number || null,
    supplier_name: row.supplier_name || null,
    warranty_months: row.warranty_months != null ? Number(row.warranty_months) : null,
    vehicle_eol_date: row.vehicle_eol_date || null,
    qr_token: row.qr_token || null,
    qr_url: row.qr_url || null,
    qr_image_url: row.qr_token ? `/storage/vehicles/qr/${row.qr_token}.png` : null,
    captures_count: Number(row.captures_count || 0),
    maintenances_count: Number(row.maintenances_count || 0),
    last_captured_at: row.last_captured_at || null,
    form_verified: Boolean(Number(row.form_verified || 0)),
    form_registered: Boolean(Number(row.form_registered || 0)),
    verification_status: Number(row.form_verified || 0)
      ? 'Verified'
      : Number(row.form_registered || 0)
        ? 'Pending review'
        : 'Capture pending',
    company_name: row.company_name || null,
    legal_entity_name: row.legal_entity_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...profile,
  }
}

async function resolveCity(b: Record<string, unknown>, fallbackName?: string | null) {
  const cityId = b.city_id != null && b.city_id !== '' ? Number(b.city_id) : null
  if (cityId) {
    const city = await get<{ id: number; name: string }>(
      `SELECT id, name FROM vehicle_cities WHERE id = ? AND deleted_at IS NULL`,
      [cityId],
    )
    if (!city) throw new Error('City not found')
    return { city_id: city.id, location_name: city.name }
  }
  const name = String(b.location_name || fallbackName || '').trim()
  if (!name) throw new Error('city_id or location_name is required')
  let city = await get<{ id: number; name: string }>(
    `SELECT id, name FROM vehicle_cities WHERE name = ? AND deleted_at IS NULL`,
    [name],
  )
  if (!city) {
    const ts = now()
    const ins = await run(
      `INSERT INTO vehicle_cities (name, is_active, created_at, updated_at) VALUES (?, 1, ?, ?)`,
      [name, ts, ts],
    )
    city = { id: Number(ins.insertId), name }
  }
  return { city_id: city.id, location_name: city.name }
}

async function resolveModel(b: Record<string, unknown>, fallbackName?: string | null) {
  const modelId = b.model_id != null && b.model_id !== '' ? Number(b.model_id) : null
  if (modelId) {
    const model = await get<{ id: number; name: string; default_fuel_type: string; default_category: string | null }>(
      `SELECT id, name, default_fuel_type, default_category FROM vehicle_models WHERE id = ? AND deleted_at IS NULL`,
      [modelId],
    )
    if (!model) throw new Error('Model not found')
    return model
  }
  const name = String(b.model || fallbackName || '').trim()
  if (!name) throw new Error('model_id or model is required')
  let model = await get<{ id: number; name: string; default_fuel_type: string; default_category: string | null }>(
    `SELECT id, name, default_fuel_type, default_category FROM vehicle_models WHERE name = ? AND deleted_at IS NULL`,
    [name],
  )
  if (!model) {
    const ts = now()
    const fuel = String(b.fuel_type || fuelFromCategory(String(b.category || 'EV Vehicles'))).trim() || 'EV'
    const ins = await run(
      `INSERT INTO vehicle_models (name, default_fuel_type, default_category, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [name, fuel, String(b.category || '').trim() || null, ts, ts],
    )
    model = {
      id: Number(ins.insertId),
      name,
      default_fuel_type: fuel,
      default_category: String(b.category || '').trim() || null,
    }
  }
  return model
}

function mapCapture(row: Record<string, unknown>) {
  const storagePath = String(row.storage_path || '')
  const url = storagePath.startsWith('public/')
    ? `/storage/${storagePath.replace(/^public\//, '')}`
    : `/storage/${storagePath}`

  let verificationLog: unknown[] = []
  const rawLog = row.verification_log
  if (typeof rawLog === 'string' && rawLog.trim()) {
    try { verificationLog = JSON.parse(rawLog) as unknown[] } catch { verificationLog = [] }
  } else if (Array.isArray(rawLog)) {
    verificationLog = rawLog
  }

  return {
    id: Number(row.id),
    vehicle_id: Number(row.vehicle_id),
    session_id: row.session_id != null ? Number(row.session_id) : null,
    captured_by: row.captured_by != null ? Number(row.captured_by) : null,
    captured_by_name: row.captured_by_name || row.submitter_name || null,
    submitter_name: row.submitter_name || null,
    submitter_email: row.submitter_email || null,
    submitter_phone: row.submitter_phone || null,
    source: row.source || null,
    verified_at: row.verified_at || null,
    verified_by: row.verified_by != null ? Number(row.verified_by) : null,
    verified_by_name: row.verified_by_name || null,
    verified_summary: row.verified_summary || null,
    verification_log: verificationLog,
    storage_path: storagePath,
    url,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: row.file_size != null ? Number(row.file_size) : null,
    captured_at: row.captured_at,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    address: row.address || null,
    capture_kind: row.capture_kind || 'vehicle',
    created_at: row.created_at,
  }
}

function fuelFromCategory(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('cng') || c.includes('petrol')) return 'CNG_PETROL'
  if (c.includes('ev')) return 'EV'
  return 'OTHER'
}

router.get('/facets', async (req, res) => {
  const search = String(req.query.search || req.query.q || '').trim()
  const fuelType = String(req.query.fuel_type || '').trim()
  const cityId = String(req.query.city_id || '').trim()
  const location = String(req.query.location || '').trim()
  const modelId = String(req.query.model_id || '').trim()
  const model = String(req.query.model || '').trim()
  const category = String(req.query.category || '').trim()
  const status = String(req.query.status || '').trim()
  const verified = String(req.query.verified || req.query.verification_status || '').trim().toLowerCase()
  const registered = String(req.query.registered || req.query.form_registered || '').trim().toLowerCase()

  /** Shared vehicle predicates for cascading facet counts (exclude the dimension being grouped). */
  function vehiclePred(exclude: 'fuel' | 'city' | 'model' | 'category' | 'status' | null = null) {
    const parts: string[] = ['v.deleted_at IS NULL']
    const p: unknown[] = []
    if (search) {
      parts.push('(v.vehicle_number LIKE ? OR v.model LIKE ? OR v.location_name LIKE ? OR v.name LIKE ? OR v.order_number LIKE ?)')
      const like = `%${search}%`
      p.push(like, like, like, like, like)
    }
    if (exclude !== 'fuel' && fuelType) { parts.push('v.fuel_type = ?'); p.push(fuelType) }
    if (exclude !== 'city') {
      if (cityId) { parts.push('v.city_id = ?'); p.push(Number(cityId)) }
      else if (location) { parts.push('v.location_name = ?'); p.push(location) }
    }
    if (exclude !== 'model') {
      if (modelId) { parts.push('v.model_id = ?'); p.push(Number(modelId)) }
      else if (model) { parts.push('v.model = ?'); p.push(model) }
    }
    if (exclude !== 'category' && category) { parts.push('v.category = ?'); p.push(category) }
    if (exclude !== 'status' && status) { parts.push('v.status = ?'); p.push(status) }
    if (registered === '1' || registered === 'true' || registered === 'yes' || registered === 'submitted') {
      parts.push(`EXISTS (
        SELECT 1 FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form'
      )`)
    }
    if (registered === '0' || registered === 'false' || registered === 'no' || registered === 'pending') {
      parts.push(`NOT EXISTS (
        SELECT 1 FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form'
      )`)
    }
    if (verified === '1' || verified === 'true' || verified === 'verified' || verified === 'yes') {
      parts.push(`EXISTS (
        SELECT 1 FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NOT NULL
      )`)
    }
    if (verified === '0' || verified === 'false' || verified === 'not_verified' || verified === 'no' || verified === 'unverified' || verified === 'pending_review') {
      parts.push(`EXISTS (
        SELECT 1 FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NULL
      )`)
      parts.push(`NOT EXISTS (
        SELECT 1 FROM vehicle_capture_sessions s
        WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NOT NULL
      )`)
    }
    return { sql: parts.join(' AND '), params: p }
  }

  const locPred = vehiclePred('city')
  const modelPred = vehiclePred('model')
  const catPred = vehiclePred('category')
  const fuelPred = vehiclePred('fuel')
  const statusPred = vehiclePred('status')
  const allPred = vehiclePred(null)

  const [locations, models, categories, fuelTypes, statuses, captureStats] = await Promise.all([
    all<{ value: string; c: number; id: number }>(`
      SELECT c.name AS value, c.id, COUNT(v.id) AS c
      FROM vehicle_cities c
      LEFT JOIN vehicles v ON v.city_id = c.id AND (${locPred.sql})
      WHERE c.deleted_at IS NULL AND c.is_active = 1
      GROUP BY c.id, c.name
      HAVING COUNT(v.id) > 0
      ORDER BY c.name`, locPred.params),
    all<{ value: string; c: number; id: number }>(`
      SELECT m.name AS value, m.id, COUNT(v.id) AS c
      FROM vehicle_models m
      LEFT JOIN vehicles v ON v.model_id = m.id AND (${modelPred.sql})
      WHERE m.deleted_at IS NULL AND m.is_active = 1
      GROUP BY m.id, m.name
      HAVING COUNT(v.id) > 0
      ORDER BY m.name`, modelPred.params),
    all<{ value: string; c: number }>(`
      SELECT v.category AS value, COUNT(*) AS c
      FROM vehicles v
      WHERE ${catPred.sql} AND v.category IS NOT NULL AND v.category <> ''
      GROUP BY v.category
      ORDER BY v.category`, catPred.params),
    all<{ value: string; c: number }>(`
      SELECT v.fuel_type AS value, COUNT(*) AS c
      FROM vehicles v
      WHERE ${fuelPred.sql} AND v.fuel_type IS NOT NULL AND v.fuel_type <> ''
      GROUP BY v.fuel_type
      ORDER BY v.fuel_type`, fuelPred.params),
    all<{ value: string; c: number }>(`
      SELECT v.status AS value, COUNT(*) AS c
      FROM vehicles v
      WHERE ${statusPred.sql} AND v.status IS NOT NULL AND v.status <> ''
      GROUP BY v.status
      ORDER BY v.status`, statusPred.params),
    get<{ fleet: number; photos_submitted: number; pending_review: number }>(`
      SELECT
        (SELECT COUNT(*) FROM vehicles v WHERE ${allPred.sql}) AS fleet,
        (SELECT COUNT(DISTINCT v.id) FROM vehicles v
          INNER JOIN vehicle_capture_sessions s ON s.vehicle_id = v.id AND s.source = 'public_form'
          WHERE ${allPred.sql}) AS photos_submitted,
        (SELECT COUNT(DISTINCT v.id) FROM vehicles v
          INNER JOIN vehicle_capture_sessions s ON s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NULL
          WHERE ${allPred.sql}
            AND NOT EXISTS (
              SELECT 1 FROM vehicle_capture_sessions s2
              WHERE s2.vehicle_id = v.id AND s2.source = 'public_form' AND s2.verified_at IS NOT NULL
            )) AS pending_review
    `, [...allPred.params, ...allPred.params, ...allPred.params]).catch(() => ({ fleet: 0, photos_submitted: 0, pending_review: 0 })),
  ])

  const fleet = Number(captureStats?.fleet || 0)
  const photosSubmitted = Number(captureStats?.photos_submitted || 0)
  const pendingReview = Number(captureStats?.pending_review || 0)
  const capturePending = Math.max(0, fleet - photosSubmitted)

  return okItem(res, {
    locations,
    models,
    categories,
    fuel_types: fuelTypes,
    statuses,
    capture_stats: {
      photos_submitted: photosSubmitted,
      capture_pending: capturePending,
      pending_review: pendingReview,
      fleet,
    },
  })
})

router.get('/eol/due', async (req, res) => {
  const rows = await listEolDueVehicles(String(req.query.search || req.query.q || ''))
  return okList(res, rows)
})

/**
 * Public form registrations awaiting photo verification.
 * Must stay before /:id. Verifiers role only.
 */
router.get('/pending-verification', requirePerm('vehicles.verify'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  try {
    const rows = await all<{
      id: number
      vehicle_number: string
      model: string | null
      location_name: string | null
      session_id: number
      submitter_name: string | null
      submitter_email: string | null
      photo_count: number
      submitted_at: string | null
    }>(`
      SELECT
        v.id,
        v.vehicle_number,
        v.model,
        v.location_name,
        s.id AS session_id,
        s.submitter_name,
        s.submitter_email,
        s.created_at AS submitted_at,
        COALESCE(pc.photo_count, 0) AS photo_count
      FROM vehicle_capture_sessions s
      INNER JOIN vehicles v ON v.id = s.vehicle_id AND v.deleted_at IS NULL
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS photo_count
        FROM vehicle_captures
        WHERE deleted_at IS NULL
        GROUP BY session_id
      ) pc ON pc.session_id = s.id
      WHERE s.source = 'public_form'
        AND s.verified_at IS NULL
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${limit}
    `)
    const totalRow = await get<{ c: number }>(`
      SELECT COUNT(*) AS c
      FROM vehicle_capture_sessions s
      INNER JOIN vehicles v ON v.id = s.vehicle_id AND v.deleted_at IS NULL
      WHERE s.source = 'public_form'
        AND s.verified_at IS NULL
    `)
    return okList(res, rows.map((r) => ({
      id: Number(r.id),
      vehicle_number: r.vehicle_number,
      model: r.model || null,
      location_name: r.location_name || null,
      session_id: Number(r.session_id),
      submitter_name: r.submitter_name || null,
      submitter_email: r.submitter_email || null,
      photo_count: Number(r.photo_count || 0),
      submitted_at: r.submitted_at || null,
    })), Number(totalRow?.c || rows.length))
  } catch (e) {
    // Columns may be missing before migrations
    console.warn('[vehicles/pending-verification]', e)
    return okList(res, [], 0)
  }
})

router.get('/selectlist', async (_req, res) => {
  const rows = await all<{ id: number; vehicle_number: string; model: string }>(`
    SELECT id, vehicle_number, model FROM vehicles WHERE deleted_at IS NULL ORDER BY vehicle_number LIMIT 5000
  `)
  return okList(res, rows.map((r) => ({
    id: r.id,
    text: `${r.vehicle_number} — ${r.model}`,
  })))
})

router.get('/', async (req, res) => {
  const search = String(req.query.search || req.query.q || '').trim()
  const location = String(req.query.location || '').trim()
  const cityId = String(req.query.city_id || '').trim()
  const model = String(req.query.model || '').trim()
  const modelId = String(req.query.model_id || '').trim()
  const category = String(req.query.category || '').trim()
  const fuelType = String(req.query.fuel_type || '').trim()
  const status = String(req.query.status || '').trim()
  const assigned = String(req.query.assigned || '').trim()
  const verified = String(req.query.verified || req.query.verification_status || '').trim().toLowerCase()
  const registered = String(req.query.registered || req.query.form_registered || '').trim().toLowerCase()
  const sort = String(req.query.sort || 'vehicle_number')
  const order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const isExport = ['1', 'true', 'yes'].includes(String(req.query.export || '').trim().toLowerCase())
  const maxLimit = isExport ? 10_000 : 200
  const defaultLimit = isExport ? 5000 : 25
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const allowedSort = new Set([
    'id', 'vehicle_number', 'model', 'location_name', 'category', 'fuel_type', 'status', 'created_at', 'purchase_date',
    'verification_status', 'form_verified', 'form_registered',
  ])
  const sortCol = allowedSort.has(sort) ? sort : 'vehicle_number'

  const where: string[] = ['v.deleted_at IS NULL']
  const params: unknown[] = []

  if (search) {
    where.push('(v.vehicle_number LIKE ? OR v.model LIKE ? OR v.location_name LIKE ? OR v.name LIKE ? OR v.order_number LIKE ?)')
    const like = `%${search}%`
    params.push(like, like, like, like, like)
  }
  if (cityId) { where.push('v.city_id = ?'); params.push(Number(cityId)) }
  else if (location) { where.push('v.location_name = ?'); params.push(location) }
  if (modelId) { where.push('v.model_id = ?'); params.push(Number(modelId)) }
  else if (model) { where.push('v.model = ?'); params.push(model) }
  if (category) { where.push('v.category = ?'); params.push(category) }
  if (fuelType) { where.push('v.fuel_type = ?'); params.push(fuelType) }
  if (status) { where.push('v.status = ?'); params.push(status) }
  if (assigned === '1' || assigned === 'yes') where.push('v.assigned_to IS NOT NULL')
  if (assigned === '0' || assigned === 'no') where.push('v.assigned_to IS NULL')
  if (registered === '1' || registered === 'true' || registered === 'yes' || registered === 'submitted') {
    where.push(`EXISTS (
      SELECT 1 FROM vehicle_capture_sessions s
      WHERE s.vehicle_id = v.id AND s.source = 'public_form'
    )`)
  }
  if (registered === '0' || registered === 'false' || registered === 'no' || registered === 'pending') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM vehicle_capture_sessions s
      WHERE s.vehicle_id = v.id AND s.source = 'public_form'
    )`)
  }
  if (verified === '1' || verified === 'true' || verified === 'verified' || verified === 'yes') {
    where.push(`EXISTS (
      SELECT 1 FROM vehicle_capture_sessions s
      WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NOT NULL
    )`)
  }
  if (verified === '0' || verified === 'false' || verified === 'not_verified' || verified === 'no' || verified === 'unverified' || verified === 'pending_review') {
    // Submitted via form but not yet verified
    where.push(`EXISTS (
      SELECT 1 FROM vehicle_capture_sessions s
      WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NULL
    )`)
    where.push(`NOT EXISTS (
      SELECT 1 FROM vehicle_capture_sessions s
      WHERE s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NOT NULL
    )`)
  }

  const orderBy = (sortCol === 'verification_status' || sortCol === 'form_verified')
    ? `form_verified ${order}, form_registered ${order}, v.vehicle_number ASC`
    : sortCol === 'form_registered'
      ? `form_registered ${order}, v.vehicle_number ASC`
      : `v.${sortCol} ${order}`

  /** Pre-aggregated joins — avoids N correlated subqueries per row (was timing out on large fleets). */
  const listFromSql = `
    FROM vehicles v
    LEFT JOIN (
      SELECT vehicle_id, COUNT(*) AS captures_count, MAX(captured_at) AS last_captured_at
      FROM vehicle_captures WHERE deleted_at IS NULL GROUP BY vehicle_id
    ) cap ON cap.vehicle_id = v.id
    LEFT JOIN (
      SELECT vehicle_id, COUNT(*) AS maintenances_count
      FROM vehicle_maintenances WHERE deleted_at IS NULL GROUP BY vehicle_id
    ) maint ON maint.vehicle_id = v.id
    LEFT JOIN (
      SELECT DISTINCT vehicle_id FROM vehicle_capture_sessions
      WHERE source = 'public_form' AND verified_at IS NOT NULL
    ) fv ON fv.vehicle_id = v.id
    LEFT JOIN (
      SELECT DISTINCT vehicle_id FROM vehicle_capture_sessions
      WHERE source = 'public_form'
    ) fr ON fr.vehicle_id = v.id
    LEFT JOIN users u ON v.assigned_type = 'user' AND u.id = v.assigned_to
    LEFT JOIN employees e ON v.assigned_type = 'employee' AND e.id = v.assigned_to
    LEFT JOIN vehicle_drivers d ON v.assigned_type = 'driver' AND d.id = v.assigned_to
  `

  const listSelectSql = `
    SELECT v.*,
      COALESCE(cap.captures_count, 0) AS captures_count,
      cap.last_captured_at,
      COALESCE(maint.maintenances_count, 0) AS maintenances_count,
      IF(fv.vehicle_id IS NOT NULL, 1, 0) AS form_verified,
      IF(fr.vehicle_id IS NOT NULL, 1, 0) AS form_registered,
      CASE
        WHEN v.assigned_type = 'user' THEN TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))
        WHEN v.assigned_type = 'employee' THEN TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')))
        WHEN v.assigned_type = 'driver' THEN TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,''),
          CASE WHEN d.driver_code IS NOT NULL AND d.driver_code <> '' THEN CONCAT(' (', d.driver_code, ')') ELSE '' END))
        ELSE NULL
      END AS assigned_name
    ${listFromSql}
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
  `

  const countRow = await get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM vehicles v WHERE ${where.join(' AND ')}`,
    params,
  )
  const total = Number(countRow?.c || 0)
  const rows = await all(`${listSelectSql} ${limitSql(limit, offset)}`, params)
  return okList(res, rows.map((r) => mapVehicle(r as Record<string, unknown>)), total)
})

router.post('/', async (req, res) => {
  const b = req.body || {}
  const vehicleNumber = String(b.vehicle_number || '').trim().toUpperCase()
  if (!vehicleNumber) return fail(res, 'vehicle_number (registration number) is required')

  let city: { city_id: number; location_name: string }
  let modelRow: { id: number; name: string; default_fuel_type: string; default_category: string | null }
  try {
    city = await resolveCity(b)
    modelRow = await resolveModel(b)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Invalid city/model')
  }

  const exists = await get(`SELECT id FROM vehicles WHERE vehicle_number = ? AND deleted_at IS NULL`, [vehicleNumber])
  if (exists) return fail(res, 'Registration number already exists', 409)

  const category = String(b.category || modelRow.default_category || 'EV Vehicles').trim()
  const fuelType = String(b.fuel_type || modelRow.default_fuel_type || fuelFromCategory(category)).trim()
  let status = String(b.status || 'available').trim()
  if (!STATUSES.has(status)) status = 'available'
  if (status === 'active') status = 'available'
  const ts = now()

  const profile = pickVehicleProfile(b)
  if (!profile.make && modelRow.name) {
    // leave make null; form can set from model master make later
  }
  if (!profile.fleet_id) {
    profile.fleet_id = `FLT-${vehicleNumber.replace(/\s+/g, '')}`
  }
  if (!profile.barcode) {
    profile.barcode = `BC-${vehicleNumber.replace(/\s+/g, '')}`
  }
  if (!profile.powertrain_type && fuelType === 'EV') profile.powertrain_type = 'Electric'
  if (!profile.vehicle_type) profile.vehicle_type = 'Passenger Car'

  try {
    await assertUniqueProfile(profile)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Unique constraint failed', 409)
  }

  const profileCols = [...VEHICLE_PROFILE_KEYS]
  const profileVals = profileCols.map((k) => profile[k] ?? null)

  const result = await run(`
    INSERT INTO vehicles (
      vehicle_number, name, model, model_id, location_name, city_id, category, fuel_type, status, notes,
      purchase_date, purchase_cost, order_number, supplier_name, warranty_months, vehicle_eol_date,
      ${profileCols.join(', ')},
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${profileCols.map(() => '?').join(', ')}, ?, ?, ?, ?)
  `, [
    vehicleNumber, b.name || null, modelRow.name, modelRow.id, city.location_name, city.city_id,
    category, fuelType, status, b.notes || null,
    b.purchase_date || null, b.purchase_cost ?? null, b.order_number || null, b.supplier_name || null,
    b.warranty_months ?? null, b.vehicle_eol_date || null,
    ...profileVals,
    req.user?.id || null, req.user?.id || null, ts, ts,
  ])

  const id = Number(result.insertId)
  // Ensure unique fleet/barcode if clash on auto values
  await run(
    `UPDATE vehicles SET fleet_id = COALESCE(fleet_id, ?), barcode = COALESCE(barcode, ?) WHERE id = ?`,
    [`FLT-${id}`, `BC-${id}`, id],
  ).catch(() => undefined)

  await ensureVehicleQr(id).catch(() => undefined)
  await logAction({
    userId: req.user?.id,
    actionType: 'create',
    itemType: 'vehicle',
    itemId: id,
    note: vehicleNumber,
  })
  return okMessage(res, 'Vehicle created', mapVehicle((await loadVehicle(id))!), 201)
})

router.get('/:id', async (req, res) => {
  const row = await loadVehicle(req.params.id)
  if (!row) return fail(res, 'Vehicle not found', 404)
  return okItem(res, mapVehicle(row))
})

router.put('/:id', async (req, res) => {
  const existing = await loadVehicle(req.params.id)
  if (!existing) return fail(res, 'Vehicle not found', 404)
  const b = req.body || {}
  const vehicleNumber = String(b.vehicle_number ?? existing.vehicle_number).trim().toUpperCase()
  if (vehicleNumber !== existing.vehicle_number) {
    const clash = await get(`SELECT id FROM vehicles WHERE vehicle_number = ? AND id <> ? AND deleted_at IS NULL`, [
      vehicleNumber, req.params.id,
    ])
    if (clash) return fail(res, 'Registration number already exists', 409)
  }

  let city: { city_id: number; location_name: string }
  let modelRow: { id: number; name: string; default_fuel_type: string; default_category: string | null }
  try {
    city = await resolveCity(
      { city_id: b.city_id ?? existing.city_id, location_name: b.location_name },
      String(existing.location_name || ''),
    )
    modelRow = await resolveModel(
      { model_id: b.model_id ?? existing.model_id, model: b.model, fuel_type: b.fuel_type, category: b.category },
      String(existing.model || ''),
    )
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Invalid city/model')
  }

  let status = String(b.status ?? existing.status).trim()
  if (status === 'active') status = 'available'
  if (!STATUSES.has(status)) status = String(existing.status)

  const category = String(b.category ?? existing.category ?? modelRow.default_category ?? 'EV Vehicles').trim()
  const fuelType = String(b.fuel_type ?? existing.fuel_type ?? modelRow.default_fuel_type).trim()
  const ts = now()

  const profile = pickVehicleProfile(b, existing as Record<string, unknown>)
  try {
    await assertUniqueProfile(profile, req.params.id)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Unique constraint failed', 409)
  }

  const profileSet = VEHICLE_PROFILE_KEYS.map((k) => `${k} = ?`).join(', ')
  const profileVals = VEHICLE_PROFILE_KEYS.map((k) => profile[k] ?? null)

  await run(`
    UPDATE vehicles SET
      vehicle_number = ?, name = ?, model = ?, model_id = ?, location_name = ?, city_id = ?,
      category = ?, fuel_type = ?, status = ?, notes = ?, purchase_date = ?, purchase_cost = ?,
      order_number = ?, supplier_name = ?, warranty_months = ?, vehicle_eol_date = ?,
      ${profileSet},
      updated_by = ?, updated_at = ?
    WHERE id = ?
  `, [
    vehicleNumber,
    b.name !== undefined ? (b.name || null) : existing.name,
    modelRow.name,
    modelRow.id,
    city.location_name,
    city.city_id,
    category,
    fuelType,
    status,
    b.notes !== undefined ? (b.notes || null) : existing.notes,
    b.purchase_date !== undefined ? (b.purchase_date || null) : existing.purchase_date,
    b.purchase_cost !== undefined ? (b.purchase_cost ?? null) : existing.purchase_cost,
    b.order_number !== undefined ? (b.order_number || null) : existing.order_number,
    b.supplier_name !== undefined ? (b.supplier_name || null) : existing.supplier_name,
    b.warranty_months !== undefined ? (b.warranty_months ?? null) : existing.warranty_months,
    b.vehicle_eol_date !== undefined ? (b.vehicle_eol_date || null) : existing.vehicle_eol_date,
    ...profileVals,
    req.user?.id || null,
    ts,
    req.params.id,
  ])

  await logAction({
    userId: req.user?.id,
    actionType: 'update',
    itemType: 'vehicle',
    itemId: Number(req.params.id),
  })
  return okMessage(res, 'Vehicle updated', mapVehicle((await loadVehicle(req.params.id))!))
})

router.delete('/:id', async (req, res) => {
  const existing = await loadVehicle(req.params.id)
  if (!existing) return fail(res, 'Vehicle not found', 404)
  await run(`UPDATE vehicles SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
  await logAction({
    userId: req.user?.id,
    actionType: 'delete',
    itemType: 'vehicle',
    itemId: Number(req.params.id),
    note: String(existing.vehicle_number),
  })
  return okMessage(res, 'Vehicle deleted')
})

router.post('/:id/checkout', async (req, res) => {
  const id = Number(req.params.id)
  const vehicle = await loadVehicle(id)
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  if (vehicle.assigned_to) return fail(res, 'Vehicle is already assigned. Unassign first.', 409)

  const b = req.body || {}
  const assignedType = String(b.assigned_type || b.checkout_to_type || 'driver')
  const assignedTo = Number(b.assigned_to || b.assigned_user || b.assigned_employee || b.assigned_driver)
  const reason = String(b.reason || b.note || '').trim()
  if (!assignedTo) return fail(res, 'Assign target is required')
  if (!['user', 'employee', 'driver'].includes(assignedType)) {
    return fail(res, 'assigned_type must be driver, user, or employee')
  }

  let driverName: string | null = b.driver_name || null
  let driverPhone: string | null = b.driver_phone || null

  if (assignedType === 'user') {
    const u = await get(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`, [assignedTo])
    if (!u) return fail(res, 'User not found', 404)
  } else if (assignedType === 'employee') {
    const e = await get(`SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL`, [assignedTo]).catch(() => null)
    if (!e) return fail(res, 'Employee not found', 404)
  } else {
    const d = await get<{ id: number; first_name: string; last_name: string | null; phone: string | null; status: string }>(
      `SELECT id, first_name, last_name, phone, status FROM vehicle_drivers WHERE id = ? AND deleted_at IS NULL`,
      [assignedTo],
    )
    if (!d) return fail(res, 'Driver not found', 404)
    if (d.status !== 'active') return fail(res, 'Driver is not active', 409)
    if (!driverName) driverName = `${d.first_name} ${d.last_name || ''}`.trim()
    if (!driverPhone) driverPhone = d.phone
  }

  const ts = now()
  const kind = b.assignment_kind || (assignedType === 'driver' ? 'Driver' : 'Employee')
  await run(`
    UPDATE vehicles SET
      assigned_to = ?, assigned_type = ?, status = 'assigned',
      assignment_kind = ?, driver_name = ?, driver_phone = ?,
      assignment_status = ?, assignment_location = ?,
      expected_checkin = ?, last_checkout = ?,
      checkout_counter = checkout_counter + 1, updated_at = ?, updated_by = ?
    WHERE id = ?
  `, [
    assignedTo,
    assignedType,
    kind,
    driverName,
    driverPhone,
    b.assignment_status || 'Active',
    b.assignment_location || null,
    b.expected_checkin || null,
    ts,
    ts,
    req.user?.id || null,
    id,
  ])

  await run(`
    INSERT INTO vehicle_assignments (
      vehicle_id, assigned_to, assigned_type, assignment_kind, driver_name, driver_phone,
      employee_code, assignment_status, assignment_location, assigned_at, expected_return_at,
      assigned_by, assign_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, assignedTo, assignedType, kind,
    driverName, driverPhone, b.employee_code || null,
    b.assignment_status || 'Active', b.assignment_location || null,
    ts, b.expected_checkin || null, req.user?.id || null, reason || null, ts, ts,
  ]).catch(() => undefined)

  await logAction({
    userId: req.user?.id,
    actionType: 'assigned',
    itemType: 'vehicle',
    itemId: id,
    targetType: assignedType,
    targetId: assignedTo,
    note: reason || null,
  })
  return okMessage(res, 'Vehicle assigned', mapVehicle((await loadVehicle(id))!))
})

router.post('/:id/checkin', async (req, res) => {
  const id = Number(req.params.id)
  const vehicle = await loadVehicle(id)
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  if (!vehicle.assigned_to) return fail(res, 'Vehicle is not assigned')

  const reason = String(req.body?.reason || req.body?.note || '').trim()
  if (!reason) return fail(res, 'Reason is required to unassign')

  const prevTarget = Number(vehicle.assigned_to)
  const prevType = String(vehicle.assigned_type)
  const ts = now()
  await run(`
    UPDATE vehicles SET
      assigned_to = NULL, assigned_type = NULL, status = 'available',
      assignment_kind = NULL, driver_name = NULL, driver_phone = NULL,
      assignment_status = NULL, assignment_location = NULL,
      expected_checkin = NULL, last_checkin = ?,
      checkin_counter = checkin_counter + 1, updated_at = ?, updated_by = ?
    WHERE id = ?
  `, [ts, ts, req.user?.id || null, id])

  await run(`
    UPDATE vehicle_assignments
    SET unassigned_at = ?, unassigned_by = ?, unassign_note = ?, updated_at = ?
    WHERE vehicle_id = ? AND unassigned_at IS NULL
  `, [ts, req.user?.id || null, reason, ts, id]).catch(() => undefined)

  await logAction({
    userId: req.user?.id,
    actionType: 'unassigned',
    itemType: 'vehicle',
    itemId: id,
    targetType: prevType,
    targetId: prevTarget,
    note: reason,
  })
  return okMessage(res, 'Vehicle unassigned', mapVehicle((await loadVehicle(id))!))
})

router.get('/:id/assignments', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const rows = await all(`
    SELECT va.*,
      TRIM(CONCAT(COALESCE(ab.first_name,''),' ',COALESCE(ab.last_name,''))) AS assigned_by_name,
      TRIM(CONCAT(COALESCE(ub.first_name,''),' ',COALESCE(ub.last_name,''))) AS unassigned_by_name,
      CASE
        WHEN va.assigned_type = 'user' THEN (
          SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))
          FROM users u WHERE u.id = va.assigned_to)
        WHEN va.assigned_type = 'employee' THEN (
          SELECT TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')))
          FROM employees e WHERE e.id = va.assigned_to)
        WHEN va.assigned_type = 'driver' THEN (
          SELECT TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,'')))
          FROM vehicle_drivers d WHERE d.id = va.assigned_to)
        ELSE NULL
      END AS assignee_name
    FROM vehicle_assignments va
    LEFT JOIN users ab ON ab.id = va.assigned_by
    LEFT JOIN users ub ON ub.id = va.unassigned_by
    WHERE va.vehicle_id = ?
    ORDER BY va.assigned_at DESC, va.id DESC
    LIMIT 200
  `, [req.params.id]).catch(() => [])
  return okList(res, rows || [], (rows || []).length)
})

router.get('/:id/history', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const rows = await all(`
    SELECT al.*,
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS actor_name
    FROM action_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.item_type = 'vehicle' AND al.item_id = ?
      AND COALESCE(al.action_type, '') NOT IN ('checkout', 'checkin', 'assigned', 'unassigned',
        'registered', 'verified', 'deregistered', 'deverified')
      AND NOT (
        COALESCE(al.action_type, '') = 'uploaded'
        AND COALESCE(al.note, '') LIKE '%public capture form%'
      )
    ORDER BY al.action_date DESC, al.id DESC
    LIMIT 200
  `, [req.params.id])
  return okList(res, rows)
})

/** Form registration lifecycle: register, verify, deverify, deregister. */
router.get('/:id/form-registration-logs', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const rows = await all(`
    SELECT al.*,
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS actor_name
    FROM action_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.item_type = 'vehicle' AND al.item_id = ?
      AND (
        COALESCE(al.action_type, '') IN ('registered', 'verified', 'deregistered', 'deverified')
        OR (
          COALESCE(al.action_type, '') = 'uploaded'
          AND COALESCE(al.note, '') LIKE '%public capture form%'
        )
      )
    ORDER BY al.action_date DESC, al.id DESC
    LIMIT 300
  `, [req.params.id])
  return okList(res, rows)
})

router.post('/:id/qr', async (req, res) => {
  try {
    const qr = await ensureVehicleQr(Number(req.params.id), { refreshImage: true })
    await run(`
      UPDATE vehicles SET label_print_count = label_print_count + 1, label_printed_at = ?, updated_at = ?
      WHERE id = ?
    `, [now(), now(), req.params.id])
    await logAction({
      userId: req.user?.id,
      actionType: 'label_printed',
      itemType: 'vehicle',
      itemId: Number(req.params.id),
    })
    return okItem(res, qr)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'QR failed', 404)
  }
})

/** Stream QR PNG via API (works when /storage is not exposed on the public reverse proxy). */
router.get('/:id/qr.png', async (req, res) => {
  try {
    const qr = await ensureVehicleQr(Number(req.params.id))
    const disk = path.join(storageRoot, 'public/vehicles/qr', `${qr.qr_token}.png`)
    if (!fs.existsSync(disk)) return fail(res, 'QR image missing', 404)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.sendFile(disk)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'QR failed', 404)
  }
})

router.get('/:id/maintenances', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const rows = await all(`
    SELECT m.*,
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS created_by_name
    FROM vehicle_maintenances m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.vehicle_id = ? AND m.deleted_at IS NULL
    ORDER BY COALESCE(m.start_date, m.created_at) DESC, m.id DESC
  `, [req.params.id])
  return okList(res, rows)
})

router.post('/:id/maintenances', async (req, res) => {
  const vehicle = await get(`SELECT id, vehicle_number FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const b = req.body || {}
  const title = String(b.title || '').trim()
  if (!title) return fail(res, 'title is required')
  const maintenanceType = String(b.maintenance_type || 'Repair').trim()
  const detail = String(b.parts_replaced || '').trim()
  if (['Part Replacement', 'Upgrade', 'Other'].includes(maintenanceType) && !detail) {
    const label = maintenanceType === 'Part Replacement'
      ? 'parts_replaced'
      : maintenanceType === 'Upgrade'
        ? 'upgrade details (parts_replaced)'
        : 'activity description (parts_replaced)'
    return fail(res, `${label} is required for ${maintenanceType}`)
  }
  const ts = now()
  const result = await run(`
    INSERT INTO vehicle_maintenances (
      vehicle_id, maintenance_type, title, is_warranty, start_date, completion_date,
      cost, odometer_km, vendor_name, parts_replaced, note, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.params.id, maintenanceType, title, b.is_warranty ? 1 : 0,
    b.start_date || null, b.completion_date || null,
    b.cost ?? null, b.odometer_km ?? null, b.vendor_name || null,
    b.parts_replaced || null, b.note || null, req.user?.id || null, ts, ts,
  ])

  if (String(b.set_status || '') === 'maintenance') {
    await run(`UPDATE vehicles SET status = 'maintenance', updated_at = ? WHERE id = ?`, [ts, req.params.id])
  }

  await logAction({
    userId: req.user?.id,
    actionType: 'maintenance',
    itemType: 'vehicle',
    itemId: Number(req.params.id),
    note: `${maintenanceType}: ${title}`,
    meta: { maintenance_id: result.insertId },
  })
  const row = await get(`SELECT * FROM vehicle_maintenances WHERE id = ?`, [result.insertId])
  return okMessage(res, 'Maintenance logged', row, 201)
})

router.put('/:id/maintenances/:mid', async (req, res) => {
  const row = await get<Record<string, unknown>>(`
    SELECT * FROM vehicle_maintenances WHERE id = ? AND vehicle_id = ? AND deleted_at IS NULL
  `, [req.params.mid, req.params.id])
  if (!row) return fail(res, 'Maintenance not found', 404)
  const b = req.body || {}
  await run(`
    UPDATE vehicle_maintenances SET
      maintenance_type = ?, title = ?, is_warranty = ?, start_date = ?, completion_date = ?,
      cost = ?, odometer_km = ?, vendor_name = ?, parts_replaced = ?, note = ?, updated_at = ?
    WHERE id = ?
  `, [
    b.maintenance_type ?? row.maintenance_type,
    b.title ?? row.title,
    b.is_warranty != null ? (b.is_warranty ? 1 : 0) : row.is_warranty,
    b.start_date !== undefined ? (b.start_date || null) : row.start_date,
    b.completion_date !== undefined ? (b.completion_date || null) : row.completion_date,
    b.cost !== undefined ? (b.cost ?? null) : row.cost,
    b.odometer_km !== undefined ? (b.odometer_km ?? null) : row.odometer_km,
    b.vendor_name !== undefined ? (b.vendor_name || null) : row.vendor_name,
    b.parts_replaced !== undefined ? (b.parts_replaced || null) : row.parts_replaced,
    b.note !== undefined ? (b.note || null) : row.note,
    now(),
    req.params.mid,
  ])
  if (b.completion_date && String(b.restore_status || '') === 'available') {
    await run(`UPDATE vehicles SET status = 'available', updated_at = ? WHERE id = ? AND status = 'maintenance'`, [
      now(), req.params.id,
    ])
  }
  const updated = await get(`SELECT * FROM vehicle_maintenances WHERE id = ?`, [req.params.mid])
  return okMessage(res, 'Maintenance updated', updated)
})

router.delete('/:id/maintenances/:mid', async (req, res) => {
  const row = await get(`SELECT id FROM vehicle_maintenances WHERE id = ? AND vehicle_id = ? AND deleted_at IS NULL`, [
    req.params.mid, req.params.id,
  ])
  if (!row) return fail(res, 'Maintenance not found', 404)
  await run(`UPDATE vehicle_maintenances SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.mid])
  return okMessage(res, 'Maintenance deleted')
})

router.get('/:id/captures', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const rows = await all<Record<string, unknown>>(`
    SELECT c.*,
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS captured_by_name,
      s.submitter_name, s.submitter_email, s.submitter_phone, s.source,
      s.verified_at, s.verified_by, s.verified_summary, s.verification_log,
      TRIM(CONCAT(COALESCE(vu.first_name,''),' ',COALESCE(vu.last_name,''))) AS verified_by_name
    FROM vehicle_captures c
    LEFT JOIN users u ON u.id = c.captured_by
    LEFT JOIN vehicle_capture_sessions s ON s.id = c.session_id
    LEFT JOIN users vu ON vu.id = s.verified_by
    WHERE c.vehicle_id = ? AND c.deleted_at IS NULL
    ORDER BY c.captured_at DESC, c.id DESC
  `, [req.params.id]).catch(async () => {
    // Fallback before public-form / verification columns exist
    return all<Record<string, unknown>>(`
      SELECT c.*,
        TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS captured_by_name
      FROM vehicle_captures c
      LEFT JOIN users u ON u.id = c.captured_by
      WHERE c.vehicle_id = ? AND c.deleted_at IS NULL
      ORDER BY c.captured_at DESC, c.id DESC
    `, [req.params.id])
  })
  return okList(res, rows.map(mapCapture))
})

/** Mark a public form registration session as verified (photos reviewed). */
router.post('/:id/capture-sessions/:sessionId/verify', requirePerm('vehicles.verify'), async (req, res) => {
  const vehicleId = Number(req.params.id)
  const sessionId = Number(req.params.sessionId)
  const summary = String(req.body?.summary || req.body?.verified_summary || '').trim()
  if (!Number.isFinite(vehicleId) || !Number.isFinite(sessionId)) return fail(res, 'Invalid ids')
  if (!summary) return fail(res, 'Verification summary is required')
  if (summary.length > 2000) return fail(res, 'Summary is too long (max 2000 characters)')

  // Soft-add columns if migration not applied yet
  try {
    const cols = await all<{ COLUMN_NAME: string }>(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions'
        AND COLUMN_NAME IN ('verified_at','verified_by','verified_summary','verification_log')
    `)
    const have = new Set(cols.map((c) => c.COLUMN_NAME))
    const alters: string[] = []
    if (!have.has('verified_at')) alters.push('ADD COLUMN `verified_at` DATETIME NULL')
    if (!have.has('verified_by')) alters.push('ADD COLUMN `verified_by` INT UNSIGNED NULL')
    if (!have.has('verified_summary')) alters.push('ADD COLUMN `verified_summary` TEXT NULL')
    if (!have.has('verification_log')) alters.push('ADD COLUMN `verification_log` JSON NULL')
    if (alters.length) await run(`ALTER TABLE vehicle_capture_sessions ${alters.join(', ')}`)
  } catch {
    // non-fatal
  }

  const row = await get<Record<string, unknown>>(`
    SELECT * FROM vehicle_capture_sessions WHERE id = ? AND vehicle_id = ?
  `, [sessionId, vehicleId])
  if (!row) return fail(res, 'Capture session not found', 404)
  if (String(row.source || '') !== 'public_form') {
    return fail(res, 'Only public form registrations can be verified this way')
  }

  const verifier = await get<{ id: number; first_name: string; last_name: string; username: string; email: string | null }>(`
    SELECT id, first_name, last_name, username, email FROM users WHERE id = ? AND deleted_at IS NULL
  `, [req.user!.id])
  const byName = verifier
    ? (`${verifier.first_name || ''} ${verifier.last_name || ''}`.trim() || verifier.username)
    : 'User'
  const wasVerified = Boolean(row.verified_at)

  const ts = now()
  let prevLog: unknown[] = []
  const rawLog = row.verification_log
  if (typeof rawLog === 'string' && rawLog.trim()) {
    try { prevLog = JSON.parse(rawLog) as unknown[] } catch { prevLog = [] }
  } else if (Array.isArray(rawLog)) {
    prevLog = rawLog
  }

  const entry = {
    action: 'verified',
    verified_at: ts,
    verified_by: req.user!.id,
    verified_by_name: byName,
    summary,
  }
  const nextLog = [...prevLog, entry]

  await run(`
    UPDATE vehicle_capture_sessions
    SET verified_at = ?, verified_by = ?, verified_summary = ?, verification_log = ?, updated_at = ?
    WHERE id = ?
  `, [ts, req.user!.id, summary, JSON.stringify(nextLog), ts, sessionId])

  await logAction({
    userId: req.user!.id,
    actionType: 'verified',
    itemType: 'vehicle',
    itemId: vehicleId,
    note: summary,
    meta: {
      session_id: sessionId,
      verified_at: ts,
      verified_by: req.user!.id,
      verified_by_name: byName,
      summary,
      reverify: wasVerified,
    },
  })

  const vehicle = await get<{ vehicle_number: string; model: string | null }>(`
    SELECT vehicle_number, model FROM vehicles WHERE id = ? AND deleted_at IS NULL
  `, [vehicleId])
  const plate = vehicle?.vehicle_number || `#${vehicleId}`
  const photoCountRow = await get<{ c: number }>(`
    SELECT COUNT(*) AS c FROM vehicle_captures
    WHERE vehicle_id = ? AND session_id = ? AND deleted_at IS NULL
  `, [vehicleId, sessionId])
  const photoCount = Number(photoCountRow?.c || 0)
  const verifierEmail = String(verifier?.email || '').trim()
  const eventLabel = wasVerified ? 're-verified' : 'verified'
  notifyWorkflow({
    category: 'form_registration',
    event: wasVerified ? 'vehicle.form_reverified' : 'vehicle.form_verified',
    subject: `Form ${eventLabel} · ${plate}`,
    title: wasVerified ? 'Form registration re-verified' : 'Form registration verified',
    intro: wasVerified
      ? 'A previously verified public capture form was re-verified. Comments from the verifier are included below.'
      : 'A public capture form registration was verified after photo review.',
    fields: [
      { label: 'Vehicle', value: plate },
      ...(vehicle?.model ? [{ label: 'Model', value: String(vehicle.model) }] : []),
      { label: 'Name', value: String(row.submitter_name || '—') },
      { label: 'Email', value: String(row.submitter_email || '—') },
      { label: 'Phone', value: String(row.submitter_phone || '—') },
      { label: 'Photos', value: String(photoCount) },
      { label: 'Action', value: wasVerified ? 'Re-verify' : 'Verify' },
      { label: 'Verified by', value: byName },
      { label: 'Comments', value: summary },
      { label: 'When', value: ts },
    ],
    ctaPath: `/vehicles/${vehicleId}?tab=captures&focus=verify`,
    ctaLabel: 'Open vehicle photos',
    itemType: 'vehicle',
    itemId: vehicleId,
    ...(wasVerified && verifierEmail.includes('@')
      ? {
          assigneeEmail: verifierEmail,
          assigneeOnlyExtraNote:
            'You re-verified this form registration. Your comments are included below for your records.',
        }
      : {}),
  })

  return okMessage(res, wasVerified ? 'Registration re-verified' : 'Registration verified', {
    session_id: sessionId,
    verified_at: ts,
    verified_by: req.user!.id,
    verified_by_name: byName,
    verified_summary: summary,
    verification_log: nextLog,
  })
})

/** Clear verification so the form registration is pending again (photos kept). */
router.post('/:id/capture-sessions/:sessionId/deverify', requirePerm('vehicles.verify'), async (req, res) => {
  const vehicleId = Number(req.params.id)
  const sessionId = Number(req.params.sessionId)
  const summary = String(req.body?.summary || req.body?.note || '').trim()
  if (!Number.isFinite(vehicleId) || !Number.isFinite(sessionId)) return fail(res, 'Invalid ids')
  if (summary.length > 2000) return fail(res, 'Note is too long (max 2000 characters)')

  const row = await get<Record<string, unknown>>(`
    SELECT * FROM vehicle_capture_sessions WHERE id = ? AND vehicle_id = ?
  `, [sessionId, vehicleId])
  if (!row) return fail(res, 'Capture session not found', 404)
  if (String(row.source || '') !== 'public_form') {
    return fail(res, 'Only public form registrations can be deverified')
  }
  if (!row.verified_at) return fail(res, 'Registration is not verified')

  const actor = await get<{ id: number; first_name: string; last_name: string; username: string }>(`
    SELECT id, first_name, last_name, username FROM users WHERE id = ? AND deleted_at IS NULL
  `, [req.user!.id])
  const byName = actor
    ? (`${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.username)
    : 'User'

  const ts = now()
  let prevLog: unknown[] = []
  const rawLog = row.verification_log
  if (typeof rawLog === 'string' && rawLog.trim()) {
    try { prevLog = JSON.parse(rawLog) as unknown[] } catch { prevLog = [] }
  } else if (Array.isArray(rawLog)) {
    prevLog = rawLog
  }

  const note = summary || 'Verification cleared'
  const entry = {
    action: 'deverified',
    verified_at: ts,
    verified_by: req.user!.id,
    verified_by_name: byName,
    summary: note,
  }
  const nextLog = [...prevLog, entry]

  await run(`
    UPDATE vehicle_capture_sessions
    SET verified_at = NULL, verified_by = NULL, verified_summary = NULL,
        verification_log = ?, updated_at = ?
    WHERE id = ?
  `, [JSON.stringify(nextLog), ts, sessionId])

  await logAction({
    userId: req.user!.id,
    actionType: 'deverified',
    itemType: 'vehicle',
    itemId: vehicleId,
    note,
    meta: {
      session_id: sessionId,
      deverified_at: ts,
      deverified_by: req.user!.id,
      deverified_by_name: byName,
      summary: note,
      previous_verified_at: row.verified_at || null,
      previous_verified_by: row.verified_by ?? null,
      previous_summary: row.verified_summary || null,
    },
  })

  return okMessage(res, 'Verification cleared — registration is pending review again', {
    session_id: sessionId,
    verified_at: null,
    verified_by: null,
    verified_by_name: null,
    verified_summary: null,
    verification_log: nextLog,
  })
})

/**
 * Remove a public form registration: soft-delete photos, delete files, delete session
 * so the vehicle can be registered again via /capture.
 */
router.delete('/:id/capture-sessions/:sessionId/form-registration', requirePerm('vehicles.verify'), async (req, res) => {
  const vehicleId = Number(req.params.id)
  const sessionId = Number(req.params.sessionId)
  if (!Number.isFinite(vehicleId) || !Number.isFinite(sessionId)) return fail(res, 'Invalid ids')

  const session = await get<Record<string, unknown>>(`
    SELECT * FROM vehicle_capture_sessions WHERE id = ? AND vehicle_id = ?
  `, [sessionId, vehicleId])
  if (!session) return fail(res, 'Form registration not found', 404)
  if (String(session.source || '') !== 'public_form') {
    return fail(res, 'Only public form registrations can be deregistered')
  }

  const captures = await all<{ id: number; storage_path: string }>(`
    SELECT id, storage_path FROM vehicle_captures
    WHERE vehicle_id = ? AND session_id = ? AND deleted_at IS NULL
  `, [vehicleId, sessionId])

  const ts = now()
  let filesRemoved = 0
  for (const c of captures) {
    await run(`UPDATE vehicle_captures SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, c.id])
    const rel = String(c.storage_path || '').replace(/\\/g, '/')
    const candidates = [
      path.join(storageRoot, rel),
      path.join(storageRoot, rel.replace(/^public\//, '')),
    ]
    for (const p of candidates) {
      try {
        if (p.startsWith(storageRoot) && fs.existsSync(p)) {
          fs.unlinkSync(p)
          filesRemoved += 1
          break
        }
      } catch {
        // non-fatal
      }
    }
  }

  // Clear FK refs then remove session so /capture allows a new registration
  await run(`UPDATE vehicle_captures SET session_id = NULL WHERE session_id = ?`, [sessionId])
  await run(`DELETE FROM vehicle_capture_sessions WHERE id = ?`, [sessionId])

  await logAction({
    userId: req.user?.id,
    actionType: 'deregistered',
    itemType: 'vehicle',
    itemId: vehicleId,
    note: 'Public form registration removed',
    meta: {
      session_id: sessionId,
      photos_removed: captures.length,
      files_removed: filesRemoved,
      submitter_name: session.submitter_name || null,
      submitter_email: session.submitter_email || null,
    },
  })

  const vehicle = await get<{ vehicle_number: string; model: string | null }>(`
    SELECT vehicle_number, model FROM vehicles WHERE id = ? AND deleted_at IS NULL
  `, [vehicleId])
  const plate = vehicle?.vehicle_number || `#${vehicleId}`
  const actor = await get<{ first_name: string; last_name: string; username: string; email: string | null }>(`
    SELECT first_name, last_name, username, email FROM users WHERE id = ? AND deleted_at IS NULL
  `, [req.user!.id])
  notifyWorkflow({
    category: 'form_registration',
    event: 'vehicle.form_deregistered',
    subject: `Form deregistered · ${plate}`,
    title: 'Form registration removed',
    intro: 'A public capture form registration was deregistered. Photos were cleared so the vehicle can be submitted again via /capture.',
    fields: [
      { label: 'Vehicle', value: plate },
      ...(vehicle?.model ? [{ label: 'Model', value: String(vehicle.model) }] : []),
      { label: 'Name', value: String(session.submitter_name || '—') },
      { label: 'Email', value: String(session.submitter_email || '—') },
      { label: 'Phone', value: String(session.submitter_phone || '—') },
      { label: 'Photos removed', value: String(captures.length) },
      { label: 'Action', value: 'Deregister' },
      { label: 'By', value: actorLabel(actor) },
      { label: 'When', value: ts },
    ],
    ctaPath: `/vehicles/${vehicleId}?tab=captures`,
    ctaLabel: 'Open vehicle',
    itemType: 'vehicle',
    itemId: vehicleId,
  })

  return okMessage(res, `Form registration removed — ${captures.length} photo(s) cleared. Vehicle can be registered again.`, {
    session_id: sessionId,
    photos_removed: captures.length,
    files_removed: filesRemoved,
  })
})

router.post('/:id/capture-sessions', async (req, res) => {
  const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!vehicle) return fail(res, 'Vehicle not found', 404)
  const ts = now()
  const result = await run(
    `INSERT INTO vehicle_capture_sessions (vehicle_id, captured_by, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, req.user?.id || null, String(req.body?.notes || '').trim() || null, ts, ts],
  )
  return okMessage(res, 'Capture session started', { id: Number(result.insertId) }, 201)
})

router.post('/:id/captures', (req, res) => {
  const upload = makeUploader('public/vehicles', 'file')
  upload(req, res, async (err) => {
    if (err) return fail(res, err.message)
    if (!req.file) return fail(res, 'Photo file required')
    const vehicle = await get(`SELECT id FROM vehicles WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
    if (!vehicle) {
      fs.unlink(req.file.path, () => undefined)
      return fail(res, 'Vehicle not found', 404)
    }
    const body = req.body || {}
    const capturedAt = String(body.captured_at || '').trim() || now()
    const lat = body.latitude !== undefined && body.latitude !== '' ? Number(body.latitude) : null
    const lng = body.longitude !== undefined && body.longitude !== '' ? Number(body.longitude) : null
    const address = String(body.address || '').trim() || null
    const sessionId = body.session_id ? Number(body.session_id) : null
    if (lat != null && !Number.isFinite(lat)) return fail(res, 'Invalid latitude')
    if (lng != null && !Number.isFinite(lng)) return fail(res, 'Invalid longitude')

    const rel = path.relative(storageRoot, req.file.path).replace(/\\/g, '/')
    const ts = now()
    const result = await run(`
      INSERT INTO vehicle_captures
        (vehicle_id, session_id, captured_by, storage_path, original_name, mime_type, file_size,
         captured_at, latitude, longitude, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.id, sessionId, req.user?.id || null, rel, req.file.originalname, req.file.mimetype,
      req.file.size, capturedAt, lat, lng, address, ts, ts,
    ])
    await logAction({
      userId: req.user?.id,
      actionType: 'uploaded',
      itemType: 'vehicle',
      itemId: Number(req.params.id),
      note: 'vehicle capture',
      meta: { capture_id: result.insertId },
    })
    const row = await get<Record<string, unknown>>(`
      SELECT c.*, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS captured_by_name
      FROM vehicle_captures c LEFT JOIN users u ON u.id = c.captured_by WHERE c.id = ?
    `, [result.insertId])
    return okMessage(res, 'Photo captured', mapCapture(row || {}), 201)
  })
})

router.delete('/:id/captures/:captureId', async (req, res) => {
  const row = await get(`SELECT id FROM vehicle_captures WHERE id = ? AND vehicle_id = ? AND deleted_at IS NULL`, [
    req.params.captureId, req.params.id,
  ])
  if (!row) return fail(res, 'Capture not found', 404)
  await run(`UPDATE vehicle_captures SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.captureId])
  return okMessage(res, 'Capture deleted')
})

export default router
