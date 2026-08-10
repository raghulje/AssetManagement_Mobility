import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { get, run, now } from '../db/index.js'
import { storageRoot, publicUrl } from './uploads.js'

const QR_DIR = path.join(storageRoot, 'public/assets/qr')

function clientBase() {
  // Prefer PUBLIC_APP_URL / FRONTEND_URL (mapped domain in production). CLIENT_ORIGIN may be a list.
  const fromEnv = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const firstOrigin = String(process.env.CLIENT_ORIGIN || 'http://localhost:3001')
    .split(',')[0]
    .trim()
  return firstOrigin.replace(/\/$/, '')
}

export function publicAssetPageUrl(token: string) {
  return `${clientBase()}/asset/${encodeURIComponent(token)}`
}

function qrDiskPath(token: string) {
  return path.join(QR_DIR, `${token}.png`)
}

function qrPublicPath(token: string) {
  return publicUrl(`public/assets/qr/${token}.png`)
}

async function ensureDir() {
  await fs.promises.mkdir(QR_DIR, { recursive: true })
}

/**
 * Ensure an asset has a permanent QR token + PNG.
 * Never rotates the token (reassign / upgrade keep the same QR).
 * Regenerates the PNG file only if missing on disk (same URL payload).
 */
export async function ensureAssetQr(assetId: number, opts?: { refreshImage?: boolean }) {
  const asset = await get<{
    id: number
    asset_tag: string
    qr_token: string | null
    qr_url: string | null
    qr_image_path: string | null
  }>(`
    SELECT id, asset_tag, qr_token, qr_url, qr_image_path
    FROM assets WHERE id = ? AND deleted_at IS NULL
  `, [assetId])

  if (!asset) throw new Error('Asset not found')

  let token = asset.qr_token ? String(asset.qr_token) : ''
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '')
    const pageUrl = publicAssetPageUrl(token)
    const rel = `public/assets/qr/${token}.png`
    await run(`
      UPDATE assets SET qr_token = ?, qr_url = ?, qr_image_path = ?, updated_at = ?
      WHERE id = ?
    `, [token, pageUrl, rel, now(), assetId])
  }

  const pageUrl = publicAssetPageUrl(token)
  const disk = qrDiskPath(token)
  const urlSidecar = `${disk}.url`
  await ensureDir()

  let previousUrl = ''
  try {
    if (fs.existsSync(urlSidecar)) previousUrl = fs.readFileSync(urlSidecar, 'utf8').trim()
  } catch { /* ignore */ }

  const needsWrite = !fs.existsSync(disk)
    || opts?.refreshImage
    || previousUrl !== pageUrl

  if (needsWrite) {
    // Token stays permanent; image/URL base may change (e.g. LAN IP for phone scans)
    await QRCode.toFile(disk, pageUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
    fs.writeFileSync(urlSidecar, pageUrl, 'utf8')
  }

  // Keep qr_url pointing at the public page (scan target), not the PNG
  if (asset.qr_url !== pageUrl || !asset.qr_image_path) {
    await run(`
      UPDATE assets SET qr_url = ?, qr_image_path = COALESCE(qr_image_path, ?), updated_at = ?
      WHERE id = ?
    `, [pageUrl, `public/assets/qr/${token}.png`, now(), assetId])
  }

  return {
    asset_id: assetId,
    asset_tag: asset.asset_tag,
    qr_token: token,
    public_url: pageUrl,
    qr_image_url: qrPublicPath(token),
    qr_image_path: `public/assets/qr/${token}.png`,
    created_png: needsWrite,
  }
}

export async function markLabelPrinted(assetId: number) {
  await run(`
    UPDATE assets SET
      label_printed_at = ?,
      label_print_count = COALESCE(label_print_count, 0) + 1,
      updated_at = ?
    WHERE id = ?
  `, [now(), now(), assetId])
}
