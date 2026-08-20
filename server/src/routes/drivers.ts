import { Router } from 'express'
import { all, get, run, now, paginate } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'

export const driversRouter = Router()

function clean(v: unknown) {
  const s = String(v ?? '').trim()
  return s || null
}

function mapDriver(row: Record<string, unknown>) {
  const first = String(row.first_name || '')
  const last = String(row.last_name || '')
  const name = `${first} ${last}`.trim()
  return {
    id: Number(row.id),
    driver_code: row.driver_code || null,
    first_name: first,
    last_name: last || null,
    name,
    phone: row.phone || null,
    email: row.email || null,
    license_number: row.license_number || null,
    license_expiry: row.license_expiry || null,
    city_id: row.city_id != null ? Number(row.city_id) : null,
    city_name: row.city_name || null,
    status: row.status || 'active',
    notes: row.notes || null,
    user_id: row.user_id != null ? Number(row.user_id) : null,
    current_vehicle_id: row.current_vehicle_id != null ? Number(row.current_vehicle_id) : null,
    current_vehicle_number: row.current_vehicle_number || null,
    current_vehicle_model: row.current_vehicle_model || null,
    assigned_count: Number(row.assigned_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const DRIVER_SELECT = `
  SELECT d.*,
    (SELECT v.id FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL
      LIMIT 1) AS current_vehicle_id,
    (SELECT v.vehicle_number FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL
      LIMIT 1) AS current_vehicle_number,
    (SELECT v.model FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL
      LIMIT 1) AS current_vehicle_model,
    (SELECT COUNT(*) FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL) AS assigned_count
  FROM vehicle_drivers d
`

driversRouter.get('/', async (req, res) => {
  const search = String(req.query.search || '').trim()
  const status = String(req.query.status || '').trim()
  const holding = String(req.query.holding || '')
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const where = ['d.deleted_at IS NULL']
  const params: unknown[] = []
  if (search) {
    where.push(`(
      d.first_name LIKE ? OR d.last_name LIKE ? OR d.driver_code LIKE ?
      OR d.phone LIKE ? OR d.license_number LIKE ? OR d.email LIKE ?
    )`)
    const q = `%${search}%`
    params.push(q, q, q, q, q, q)
  }
  if (status) { where.push('d.status = ?'); params.push(status) }
  if (holding === '1' || holding === 'yes') {
    where.push(`EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL
    )`)
  }
  if (holding === '0' || holding === 'no') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.assigned_to = d.id AND v.assigned_type = 'driver' AND v.deleted_at IS NULL
    )`)
  }

  const sql = `
    ${DRIVER_SELECT}
    WHERE ${where.join(' AND ')}
    ORDER BY d.first_name ASC, d.last_name ASC, d.id ASC
  `
  const { rows, total } = await paginate(sql, params, limit, offset)
  return okList(res, rows.map((r) => mapDriver(r as Record<string, unknown>)), total)
})

driversRouter.get('/selectlist', async (_req, res) => {
  const rows = await all<{ id: number; first_name: string; last_name: string | null; driver_code: string | null; phone: string | null }>(`
    SELECT id, first_name, last_name, driver_code, phone FROM vehicle_drivers
    WHERE deleted_at IS NULL AND status = 'active'
    ORDER BY first_name, last_name
  `)
  return okList(res, rows.map((r) => {
    const name = `${r.first_name} ${r.last_name || ''}`.trim()
    const text = r.driver_code ? `${name} (${r.driver_code})` : name
    return { id: r.id, text, name, phone: r.phone, driver_code: r.driver_code }
  }))
})

/** Who holds what — current vehicle assignments to drivers */
driversRouter.get('/holding', async (_req, res) => {
  const rows = await all(`
    SELECT
      d.id AS driver_id,
      d.driver_code,
      TRIM(CONCAT(COALESCE(d.first_name,''), ' ', COALESCE(d.last_name,''))) AS driver_name,
      d.phone AS driver_phone,
      d.city_name,
      v.id AS vehicle_id,
      v.vehicle_number,
      v.model,
      v.location_name,
      v.status AS vehicle_status,
      v.last_checkout,
      v.assignment_kind
    FROM vehicles v
    INNER JOIN vehicle_drivers d ON d.id = v.assigned_to AND d.deleted_at IS NULL
    WHERE v.deleted_at IS NULL AND v.assigned_type = 'driver' AND v.assigned_to IS NOT NULL
    ORDER BY d.first_name, v.vehicle_number
  `)
  return okList(res, rows, rows.length)
})

driversRouter.get('/:id', async (req, res) => {
  const row = await get<Record<string, unknown>>(`
    ${DRIVER_SELECT}
    WHERE d.id = ? AND d.deleted_at IS NULL
  `, [req.params.id])
  if (!row) return fail(res, 'Driver not found', 404)
  return okItem(res, mapDriver(row))
})

driversRouter.get('/:id/vehicles', async (req, res) => {
  const driver = await get(`SELECT id FROM vehicle_drivers WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!driver) return fail(res, 'Driver not found', 404)
  const current = await all(`
    SELECT id, vehicle_number, model, location_name, status, last_checkout, fuel_type
    FROM vehicles
    WHERE deleted_at IS NULL AND assigned_type = 'driver' AND assigned_to = ?
    ORDER BY vehicle_number
  `, [req.params.id])
  const history = await all(`
    SELECT va.*, v.vehicle_number, v.model
    FROM vehicle_assignments va
    LEFT JOIN vehicles v ON v.id = va.vehicle_id
    WHERE va.assigned_type = 'driver' AND va.assigned_to = ?
    ORDER BY va.assigned_at DESC
    LIMIT 100
  `, [req.params.id]).catch(() => [])
  return okItem(res, { current, history })
})

driversRouter.post('/', async (req, res) => {
  const b = req.body || {}
  const first = clean(b.first_name)
  if (!first) return fail(res, 'First name is required')
  let code = clean(b.driver_code)
  if (code) {
    const clash = await get(`SELECT id FROM vehicle_drivers WHERE driver_code = ? AND deleted_at IS NULL`, [code])
    if (clash) return fail(res, 'Driver code already exists', 409)
  }
  const ts = now()
  const result = await run(`
    INSERT INTO vehicle_drivers (
      driver_code, first_name, last_name, phone, email, license_number, license_expiry,
      city_id, city_name, status, notes, user_id, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    code,
    first,
    clean(b.last_name),
    clean(b.phone),
    clean(b.email),
    clean(b.license_number),
    b.license_expiry || null,
    b.city_id ? Number(b.city_id) : null,
    clean(b.city_name),
    clean(b.status) || 'active',
    clean(b.notes),
    b.user_id ? Number(b.user_id) : null,
    req.user?.id || null,
    req.user?.id || null,
    ts, ts,
  ])
  const id = Number(result.insertId)
  if (!code) {
    code = `DRV-${id}`
    await run(`UPDATE vehicle_drivers SET driver_code = ? WHERE id = ?`, [code, id])
  }
  await logAction({
    userId: req.user?.id,
    actionType: 'create',
    itemType: 'driver',
    itemId: id,
    note: first,
  })
  const row = await get<Record<string, unknown>>(`${DRIVER_SELECT} WHERE d.id = ?`, [id])
  return okMessage(res, 'Driver created', mapDriver(row!), 201)
})

driversRouter.put('/:id', async (req, res) => {
  const existing = await get<Record<string, unknown>>(
    `SELECT * FROM vehicle_drivers WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id],
  )
  if (!existing) return fail(res, 'Driver not found', 404)
  const b = req.body || {}
  const first = clean(b.first_name ?? existing.first_name)
  if (!first) return fail(res, 'First name is required')
  const code = b.driver_code !== undefined ? clean(b.driver_code) : (existing.driver_code as string | null)
  if (code) {
    const clash = await get(
      `SELECT id FROM vehicle_drivers WHERE driver_code = ? AND id <> ? AND deleted_at IS NULL`,
      [code, req.params.id],
    )
    if (clash) return fail(res, 'Driver code already exists', 409)
  }
  await run(`
    UPDATE vehicle_drivers SET
      driver_code = ?, first_name = ?, last_name = ?, phone = ?, email = ?,
      license_number = ?, license_expiry = ?, city_id = ?, city_name = ?,
      status = ?, notes = ?, user_id = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `, [
    code,
    first,
    b.last_name !== undefined ? clean(b.last_name) : existing.last_name,
    b.phone !== undefined ? clean(b.phone) : existing.phone,
    b.email !== undefined ? clean(b.email) : existing.email,
    b.license_number !== undefined ? clean(b.license_number) : existing.license_number,
    b.license_expiry !== undefined ? (b.license_expiry || null) : existing.license_expiry,
    b.city_id !== undefined ? (b.city_id ? Number(b.city_id) : null) : existing.city_id,
    b.city_name !== undefined ? clean(b.city_name) : existing.city_name,
    b.status !== undefined ? (clean(b.status) || 'active') : existing.status,
    b.notes !== undefined ? clean(b.notes) : existing.notes,
    b.user_id !== undefined ? (b.user_id ? Number(b.user_id) : null) : existing.user_id,
    req.user?.id || null,
    now(),
    req.params.id,
  ])
  await logAction({
    userId: req.user?.id,
    actionType: 'update',
    itemType: 'driver',
    itemId: Number(req.params.id),
  })
  const row = await get<Record<string, unknown>>(`${DRIVER_SELECT} WHERE d.id = ?`, [req.params.id])
  return okMessage(res, 'Driver updated', mapDriver(row!))
})

driversRouter.delete('/:id', async (req, res) => {
  const existing = await get(`SELECT id, first_name FROM vehicle_drivers WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!existing) return fail(res, 'Driver not found', 404)
  const holding = await get(
    `SELECT id FROM vehicles WHERE assigned_to = ? AND assigned_type = 'driver' AND deleted_at IS NULL LIMIT 1`,
    [req.params.id],
  )
  if (holding) return fail(res, 'Unassign vehicles from this driver before deleting', 409)
  await run(`UPDATE vehicle_drivers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
  await logAction({
    userId: req.user?.id,
    actionType: 'delete',
    itemType: 'driver',
    itemId: Number(req.params.id),
    note: String((existing as { first_name?: string }).first_name || ''),
  })
  return okMessage(res, 'Driver deleted')
})
