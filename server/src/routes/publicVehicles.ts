import { Router } from 'express'
import { get } from '../db/index.js'
import { fail, okItem } from '../utils/response.js'
import { ensureVehicleQr } from '../services/vehicleQr.js'

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
