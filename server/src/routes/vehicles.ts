import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { all, get, run, now, paginate } from '../db/index.js'
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
  return {
    id: Number(row.id),
    vehicle_id: Number(row.vehicle_id),
    session_id: row.session_id != null ? Number(row.session_id) : null,
    captured_by: row.captured_by != null ? Number(row.captured_by) : null,
    captured_by_name: row.captured_by_name || null,
    storage_path: storagePath,
    url,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: row.file_size != null ? Number(row.file_size) : null,
    captured_at: row.captured_at,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    address: row.address || null,
    created_at: row.created_at,
  }
}

function fuelFromCategory(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('cng') || c.includes('petrol')) return 'CNG_PETROL'
  if (c.includes('ev')) return 'EV'
  return 'OTHER'
}

router.get('/facets', async (_req, res) => {
  const [locations, models, categories, fuelTypes, statuses] = await Promise.all([
    all<{ value: string; c: number; id: number }>(`
      SELECT c.name AS value, c.id, COUNT(v.id) AS c
      FROM vehicle_cities c
      LEFT JOIN vehicles v ON v.city_id = c.id AND v.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY c.name`),
    all<{ value: string; c: number; id: number }>(`
      SELECT m.name AS value, m.id, COUNT(v.id) AS c
      FROM vehicle_models m
      LEFT JOIN vehicles v ON v.model_id = m.id AND v.deleted_at IS NULL
      WHERE m.deleted_at IS NULL AND m.is_active = 1
      GROUP BY m.id, m.name
      ORDER BY m.name`),
    all<{ value: string; c: number }>(`SELECT category AS value, COUNT(*) AS c FROM vehicles WHERE deleted_at IS NULL GROUP BY category ORDER BY category`),
    all<{ value: string; c: number }>(`SELECT fuel_type AS value, COUNT(*) AS c FROM vehicles WHERE deleted_at IS NULL GROUP BY fuel_type ORDER BY fuel_type`),
    all<{ value: string; c: number }>(`SELECT status AS value, COUNT(*) AS c FROM vehicles WHERE deleted_at IS NULL GROUP BY status ORDER BY status`),
  ])
  return okItem(res, { locations, models, categories, fuel_types: fuelTypes, statuses })
})

router.get('/eol/due', async (req, res) => {
  const rows = await listEolDueVehicles(String(req.query.search || req.query.q || ''))
  return okList(res, rows)
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
  const sort = String(req.query.sort || 'vehicle_number')
  const order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const allowedSort = new Set([
    'id', 'vehicle_number', 'model', 'location_name', 'category', 'fuel_type', 'status', 'created_at', 'purchase_date',
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

  const sql = `
    SELECT v.*,
      (SELECT COUNT(*) FROM vehicle_captures c WHERE c.vehicle_id = v.id AND c.deleted_at IS NULL) AS captures_count,
      (SELECT MAX(c.captured_at) FROM vehicle_captures c WHERE c.vehicle_id = v.id AND c.deleted_at IS NULL) AS last_captured_at,
      (SELECT COUNT(*) FROM vehicle_maintenances m WHERE m.vehicle_id = v.id AND m.deleted_at IS NULL) AS maintenances_count,
      CASE
        WHEN v.assigned_type = 'user' THEN (
          SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) FROM users u WHERE u.id = v.assigned_to)
        WHEN v.assigned_type = 'employee' THEN (
          SELECT TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) FROM employees e WHERE e.id = v.assigned_to)
        WHEN v.assigned_type = 'driver' THEN (
          SELECT TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,''),
            CASE WHEN d.driver_code IS NOT NULL AND d.driver_code <> '' THEN CONCAT(' (', d.driver_code, ')') ELSE '' END))
          FROM vehicle_drivers d WHERE d.id = v.assigned_to)
        ELSE NULL
      END AS assigned_name
    FROM vehicles v
    WHERE ${where.join(' AND ')}
    ORDER BY v.${sortCol} ${order}
  `
  const { rows, total } = await paginate(sql, params, limit, offset)
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
    actionType: 'checkout',
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
    actionType: 'checkin',
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
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS assigned_by_name
    FROM vehicle_assignments va
    LEFT JOIN users u ON u.id = va.assigned_by
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
    ORDER BY al.action_date DESC, al.id DESC
    LIMIT 200
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
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS captured_by_name
    FROM vehicle_captures c
    LEFT JOIN users u ON u.id = c.captured_by
    WHERE c.vehicle_id = ? AND c.deleted_at IS NULL
    ORDER BY c.captured_at DESC, c.id DESC
  `, [req.params.id])
  return okList(res, rows.map(mapCapture))
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
