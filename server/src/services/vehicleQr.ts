import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { get, run, now } from '../db/index.js'
import { storageRoot } from './uploads.js'
import { clientBase } from './assetQr.js'

const QR_DIR = path.join(storageRoot, 'public/vehicles/qr')

export function publicVehiclePageUrl(token: string) {
  return `${clientBase()}/vehicle/${encodeURIComponent(token)}`
}

function qrDiskPath(token: string) {
  return path.join(QR_DIR, `${token}.png`)
}

export async function ensureVehicleQr(vehicleId: number, opts?: { refreshImage?: boolean }) {
  const vehicle = await get<{
    id: number
    vehicle_number: string
    qr_token: string | null
    qr_url: string | null
    qr_image_path: string | null
  }>(`
    SELECT id, vehicle_number, qr_token, qr_url, qr_image_path
    FROM vehicles WHERE id = ? AND deleted_at IS NULL
  `, [vehicleId])

  if (!vehicle) throw new Error('Vehicle not found')

  let token = vehicle.qr_token ? String(vehicle.qr_token) : ''
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '')
    const pageUrl = publicVehiclePageUrl(token)
    const rel = `public/vehicles/qr/${token}.png`
    await run(`
      UPDATE vehicles SET qr_token = ?, qr_url = ?, qr_image_path = ?, updated_at = ?
      WHERE id = ?
    `, [token, pageUrl, rel, now(), vehicleId])
  }

  const pageUrl = publicVehiclePageUrl(token)
  const disk = qrDiskPath(token)
  const urlSidecar = `${disk}.url`
  await fs.promises.mkdir(QR_DIR, { recursive: true })

  let previousUrl = ''
  try {
    if (fs.existsSync(urlSidecar)) previousUrl = fs.readFileSync(urlSidecar, 'utf8').trim()
  } catch { /* ignore */ }

  const needsWrite = !fs.existsSync(disk) || opts?.refreshImage || previousUrl !== pageUrl
  if (needsWrite) {
    await QRCode.toFile(disk, pageUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#0B1F44', light: '#FFFFFF' },
    })
    fs.writeFileSync(urlSidecar, pageUrl, 'utf8')
  }

  if (vehicle.qr_url !== pageUrl || !vehicle.qr_image_path) {
    await run(`
      UPDATE vehicles SET qr_url = ?, qr_image_path = COALESCE(qr_image_path, ?), updated_at = ?
      WHERE id = ?
    `, [pageUrl, `public/vehicles/qr/${token}.png`, now(), vehicleId])
  }

  return {
    vehicle_id: vehicleId,
    vehicle_number: vehicle.vehicle_number,
    qr_token: token,
    public_url: pageUrl,
    image_url: `/storage/vehicles/qr/${token}.png`,
  }
}
