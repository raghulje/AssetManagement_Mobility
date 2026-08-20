import { Router } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'

export const vehicleMastersRouter = Router()

function cleanName(v: unknown) {
  return String(v || '').trim()
}

/** ---------- Cities ---------- */
vehicleMastersRouter.get('/cities', async (req, res) => {
  const activeOnly = String(req.query.active || '') === '1'
  const rows = await all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM vehicles v WHERE v.city_id = c.id AND v.deleted_at IS NULL) AS vehicles_count
    FROM vehicle_cities c
    WHERE c.deleted_at IS NULL
      ${activeOnly ? 'AND c.is_active = 1' : ''}
    ORDER BY c.name
  `)
  return okList(res, rows)
})

vehicleMastersRouter.get('/cities/selectlist', async (_req, res) => {
  const rows = await all<{ id: number; name: string }>(`
    SELECT id, name FROM vehicle_cities
    WHERE deleted_at IS NULL AND is_active = 1
    ORDER BY name
  `)
  return okList(res, rows.map((r) => ({ id: r.id, text: r.name, name: r.name })))
})

vehicleMastersRouter.post('/cities', async (req, res) => {
  const name = cleanName(req.body?.name)
  if (!name) return fail(res, 'City name is required')
  const exists = await get(`SELECT id FROM vehicle_cities WHERE name = ? AND deleted_at IS NULL`, [name])
  if (exists) return fail(res, 'City already exists', 409)
  const ts = now()
  const result = await run(`
    INSERT INTO vehicle_cities (name, code, state, is_active, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    name,
    cleanName(req.body?.code) || null,
    cleanName(req.body?.state) || null,
    req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1,
    cleanName(req.body?.notes) || null,
    ts, ts,
  ])
  const row = await get(`SELECT * FROM vehicle_cities WHERE id = ?`, [result.insertId])
  return okMessage(res, 'City created', row, 201)
})

vehicleMastersRouter.put('/cities/:id', async (req, res) => {
  const existing = await get<Record<string, unknown>>(`SELECT * FROM vehicle_cities WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!existing) return fail(res, 'City not found', 404)
  const name = cleanName(req.body?.name ?? existing.name)
  if (!name) return fail(res, 'City name is required')
  const clash = await get(`SELECT id FROM vehicle_cities WHERE name = ? AND id <> ? AND deleted_at IS NULL`, [name, req.params.id])
  if (clash) return fail(res, 'City already exists', 409)

  await run(`
    UPDATE vehicle_cities SET
      name = ?, code = ?, state = ?, is_active = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `, [
    name,
    req.body?.code !== undefined ? (cleanName(req.body.code) || null) : existing.code,
    req.body?.state !== undefined ? (cleanName(req.body.state) || null) : existing.state,
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
    req.body?.notes !== undefined ? (cleanName(req.body.notes) || null) : existing.notes,
    now(),
    req.params.id,
  ])

  // Keep denormalized vehicle.location_name in sync when city renamed
  if (name !== existing.name) {
    await run(`UPDATE vehicles SET location_name = ?, updated_at = ? WHERE city_id = ? AND deleted_at IS NULL`, [
      name, now(), req.params.id,
    ])
  }

  const row = await get(`SELECT * FROM vehicle_cities WHERE id = ?`, [req.params.id])
  return okMessage(res, 'City updated', row)
})

vehicleMastersRouter.delete('/cities/:id', async (req, res) => {
  const existing = await get(`SELECT id FROM vehicle_cities WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!existing) return fail(res, 'City not found', 404)
  const linked = await get<{ c: number }>(`SELECT COUNT(*) as c FROM vehicles WHERE city_id = ? AND deleted_at IS NULL`, [req.params.id])
  if (Number(linked?.c || 0) > 0) {
    return fail(res, `Cannot delete: ${linked?.c} vehicle(s) are mapped to this city. Remap them first.`, 409)
  }
  await run(`UPDATE vehicle_cities SET deleted_at = ?, updated_at = ?, is_active = 0 WHERE id = ?`, [now(), now(), req.params.id])
  return okMessage(res, 'City deleted')
})

/** ---------- Models ---------- */
vehicleMastersRouter.get('/models', async (req, res) => {
  const activeOnly = String(req.query.active || '') === '1'
  const rows = await all(`
    SELECT m.*,
      (SELECT COUNT(*) FROM vehicles v WHERE v.model_id = m.id AND v.deleted_at IS NULL) AS vehicles_count
    FROM vehicle_models m
    WHERE m.deleted_at IS NULL
      ${activeOnly ? 'AND m.is_active = 1' : ''}
    ORDER BY m.name
  `)
  return okList(res, rows)
})

vehicleMastersRouter.get('/models/selectlist', async (_req, res) => {
  const rows = await all<{ id: number; name: string; make: string | null; default_fuel_type: string; default_category: string | null }>(`
    SELECT id, name, make, default_fuel_type, default_category FROM vehicle_models
    WHERE deleted_at IS NULL AND is_active = 1
    ORDER BY name
  `)
  return okList(res, rows.map((r) => ({
    id: r.id,
    text: r.name,
    name: r.name,
    make: r.make,
    default_fuel_type: r.default_fuel_type,
    default_category: r.default_category,
  })))
})

vehicleMastersRouter.post('/models', async (req, res) => {
  const name = cleanName(req.body?.name)
  if (!name) return fail(res, 'Model name is required')
  const exists = await get(`SELECT id FROM vehicle_models WHERE name = ? AND deleted_at IS NULL`, [name])
  if (exists) return fail(res, 'Model already exists', 409)
  const ts = now()
  const fuel = cleanName(req.body?.default_fuel_type) || 'EV'
  const result = await run(`
    INSERT INTO vehicle_models (name, make, default_fuel_type, default_category, is_active, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    name,
    cleanName(req.body?.make) || null,
    fuel,
    cleanName(req.body?.default_category) || null,
    req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1,
    cleanName(req.body?.notes) || null,
    ts, ts,
  ])
  const row = await get(`SELECT * FROM vehicle_models WHERE id = ?`, [result.insertId])
  return okMessage(res, 'Model created', row, 201)
})

vehicleMastersRouter.put('/models/:id', async (req, res) => {
  const existing = await get<Record<string, unknown>>(`SELECT * FROM vehicle_models WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!existing) return fail(res, 'Model not found', 404)
  const name = cleanName(req.body?.name ?? existing.name)
  if (!name) return fail(res, 'Model name is required')
  const clash = await get(`SELECT id FROM vehicle_models WHERE name = ? AND id <> ? AND deleted_at IS NULL`, [name, req.params.id])
  if (clash) return fail(res, 'Model already exists', 409)

  await run(`
    UPDATE vehicle_models SET
      name = ?, make = ?, default_fuel_type = ?, default_category = ?, is_active = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `, [
    name,
    req.body?.make !== undefined ? (cleanName(req.body.make) || null) : existing.make,
    req.body?.default_fuel_type !== undefined ? (cleanName(req.body.default_fuel_type) || 'EV') : existing.default_fuel_type,
    req.body?.default_category !== undefined ? (cleanName(req.body.default_category) || null) : existing.default_category,
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
    req.body?.notes !== undefined ? (cleanName(req.body.notes) || null) : existing.notes,
    now(),
    req.params.id,
  ])

  if (name !== existing.name) {
    await run(`UPDATE vehicles SET model = ?, updated_at = ? WHERE model_id = ? AND deleted_at IS NULL`, [
      name, now(), req.params.id,
    ])
  }

  const row = await get(`SELECT * FROM vehicle_models WHERE id = ?`, [req.params.id])
  return okMessage(res, 'Model updated', row)
})

vehicleMastersRouter.delete('/models/:id', async (req, res) => {
  const existing = await get(`SELECT id FROM vehicle_models WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
  if (!existing) return fail(res, 'Model not found', 404)
  const linked = await get<{ c: number }>(`SELECT COUNT(*) as c FROM vehicles WHERE model_id = ? AND deleted_at IS NULL`, [req.params.id])
  if (Number(linked?.c || 0) > 0) {
    return fail(res, `Cannot delete: ${linked?.c} vehicle(s) are mapped to this model. Remap them first.`, 409)
  }
  await run(`UPDATE vehicle_models SET deleted_at = ?, updated_at = ?, is_active = 0 WHERE id = ?`, [now(), now(), req.params.id])
  return okMessage(res, 'Model deleted')
})

export default vehicleMastersRouter
