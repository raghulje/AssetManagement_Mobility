import { Router } from 'express'
import { get } from '../db/index.js'
import { fail, okItem } from '../utils/response.js'
import { ensureVehicleQr } from '../services/vehicleQr.js'

const router = Router()

router.get('/vehicles/:token', async (req, res) => {
  const token = String(req.params.token || '').trim()
  if (!token) return fail(res, 'Token required', 400)

  let row = await get<Record<string, unknown>>(`
    SELECT id, vehicle_number, name, model, location_name, category, fuel_type, status,
           qr_token, qr_url, qr_image_path
    FROM vehicles
    WHERE qr_token = ? AND deleted_at IS NULL
    LIMIT 1
  `, [token])

  if (!row) return fail(res, 'Vehicle not found', 404)

  try {
    await ensureVehicleQr(Number(row.id))
    row = await get<Record<string, unknown>>(`
      SELECT id, vehicle_number, name, model, location_name, category, fuel_type, status,
             qr_token, qr_url, qr_image_path
      FROM vehicles WHERE id = ?
    `, [row.id]) || row
  } catch { /* ignore */ }

  return okItem(res, {
    id: Number(row.id),
    vehicle_number: row.vehicle_number,
    name: row.name,
    model: row.model,
    location_name: row.location_name,
    category: row.category,
    fuel_type: row.fuel_type,
    status: row.status,
    qr_token: row.qr_token,
    qr_url: row.qr_url,
    qr_image_url: row.qr_token ? `/storage/vehicles/qr/${row.qr_token}.png` : null,
  })
})

export default router
