import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js'
import { get, all } from '../db/index.js'
import { ensureAssetQr, markLabelPrinted } from './assetQr.js'
import { storageRoot, recordUpload } from './uploads.js'
import { now } from '../db/index.js'

type AssetLabel = {
  id: number
  asset_tag: string
  name: string | null
  serial: string | null
  model_name?: string | null
  model_number?: string | null
  company_name?: string | null
  location_name?: string | null
  status_name?: string | null
}

async function loadAssets(idsOrTags: (string | number)[]) {
  if (!idsOrTags.length) return []
  const tags = idsOrTags.map(String)
  const placeholders = tags.map(() => '?').join(',')
  const rows = await all<AssetLabel>(`
    SELECT a.id, a.asset_tag, a.name, a.serial,
      m.name as model_name, m.model_number,
      c.name as company_name, l.name as location_name, s.name as status_name
    FROM assets a
    LEFT JOIN models m ON m.id = a.model_id
    LEFT JOIN companies c ON c.id = a.company_id
    LEFT JOIN locations l ON l.id = COALESCE(a.location_id, a.rtd_location_id)
    LEFT JOIN status_labels s ON s.id = a.status_id
    WHERE a.deleted_at IS NULL AND (a.asset_tag IN (${placeholders}) OR CAST(a.id AS CHAR) IN (${placeholders}))
  `, [...tags, ...tags])
  const map = new Map<number, AssetLabel>()
  for (const r of rows) map.set(Number(r.id), r)
  return [...map.values()]
}

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 2,
    height: 12,
    includetext: false,
  })
}

/** Generate multi-label PDF; QR encodes permanent public asset URL (no assignee on label). */
export async function generateLabelsPdf(
  assetTagsOrIds: (string | number)[],
  opts?: { userId?: number; persist?: boolean },
) {
  const assets = await loadAssets(assetTagsOrIds)
  if (!assets.length) throw new Error('No assets found for labels')

  const doc = new PDFDocument({ size: [288, 144], margin: 12 }) // 4" x 2" label
  const chunks: Buffer[] = []
  doc.on('data', (c) => chunks.push(c))

  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  const qrMeta: Array<{ asset_tag: string; public_url: string; qr_token: string }> = []

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]
    if (i > 0) doc.addPage({ size: [288, 144], margin: 12 })

    const qr = await ensureAssetQr(a.id, { refreshImage: true })
    qrMeta.push({ asset_tag: a.asset_tag, public_url: qr.public_url, qr_token: qr.qr_token })

    doc.fontSize(9).fillColor('#333').text('Refex IT Asset', { align: 'left' })
    doc.moveDown(0.2)
    doc.fontSize(14).fillColor('#000').font('Helvetica-Bold').text(a.asset_tag)
    doc.font('Helvetica').fontSize(9).fillColor('#444')
    // Stable identity fields only — never print assigned user (reassignable)
    if (a.name) doc.text(String(a.name))
    if (a.model_name) doc.text(`${a.model_name}${a.model_number ? ` (${a.model_number})` : ''}`)
    if (a.serial) doc.text(`S/N: ${a.serial}`)
    if (a.company_name) doc.text(`Co: ${a.company_name}`)
    if (a.location_name) doc.text(`Loc: ${a.location_name}`)

    try {
      const bar = await barcodePng(a.asset_tag)
      doc.image(bar, 12, 100, { width: 150, height: 28 })
    } catch { /* ignore barcode errors */ }

    try {
      const pngPath = path.join(storageRoot, qr.qr_image_path)
      if (fs.existsSync(pngPath)) {
        doc.image(pngPath, 200, 58, { width: 64, height: 64 })
      }
    } catch { /* ignore */ }

    await markLabelPrinted(a.id)
  }

  doc.end()
  const pdf = await done

  if (opts?.persist !== false && assets.length === 1) {
    const a = assets[0]
    const dir = path.join(storageRoot, 'private_uploads/assets')
    fs.mkdirSync(dir, { recursive: true })
    const filename = `label-${a.asset_tag}-${Date.now()}.pdf`
    const diskPath = path.join(dir, filename)
    fs.writeFileSync(diskPath, pdf)
    await recordUpload({
      type: 'asset',
      id: a.id,
      filename,
      original: `Print-Label-${a.asset_tag}.pdf`,
      mime: 'application/pdf',
      diskPath,
      kind: 'label',
      userId: opts?.userId,
    }).catch(() => undefined)
  }

  return {
    pdf_base64: pdf.toString('base64'),
    count: assets.length,
    assets: assets.map((a) => a.asset_tag),
    qr: qrMeta,
    generated_at: now(),
  }
}

export async function generateSingleLabel(assetId: number, opts?: { userId?: number }) {
  const a = await get<{ asset_tag: string }>(`SELECT asset_tag FROM assets WHERE id=? AND deleted_at IS NULL`, [assetId])
  if (!a) throw new Error('Asset not found')
  return generateLabelsPdf([a.asset_tag], opts)
}
