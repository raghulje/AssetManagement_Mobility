import { createWorker } from 'tesseract.js'
import { PDFParse } from 'pdf-parse'
import { all } from '../db/index.js'

export type PoExtractedFields = {
  order_number: string | null
  purchase_date: string | null
  purchase_cost: number | null
  warranty_months: number | null
  supplier_name: string | null
  supplier_id: number | null
  create_suggested: boolean
  confidence: 'high' | 'medium' | 'low'
  method: 'pdf-text' | 'ocr' | 'pdf-ocr'
  raw_preview: string
  warnings: string[]
}

function normalizeWs(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeName(s: string) {
  return normalizeWs(s).toLowerCase().replace(/[.,]/g, '')
}

/** Parse DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD → YYYY-MM-DD */
function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    let d = Number(m[1])
    let mo = Number(m[2])
    let y = Number(m[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    // Prefer DMY (India); if first > 12 it's definitely day
    if (d > 12 && mo <= 12) {
      /* d/m/y */
    } else if (mo > 12 && d <= 12) {
      ;[d, mo] = [mo, d]
    }
    // else assume DMY
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return null
}

function parseMoney(raw: string): number | null {
  let s = raw.replace(/₹|rs\.?|inr/gi, '').trim()
  // Indian format 1,23,456.78 or 123,456.78
  s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

export function parsePoText(text: string): Omit<PoExtractedFields, 'supplier_id' | 'create_suggested' | 'method' | 'raw_preview' | 'warnings'> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const blob = text.replace(/\r/g, '\n')

  let order_number: string | null = null
  const poPatterns = [
    /(?:purchase\s*order\s*(?:no\.?|number|#)|p\.?\s*o\.?\s*(?:no\.?|number|#)|po\s*(?:no\.?|number|#)|po\s*#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/_.]{2,40})/i,
    /\bPO[\s\-#:]*([A-Z0-9][A-Z0-9\-\/_.]{3,40})\b/i,
  ]
  for (const re of poPatterns) {
    const m = blob.match(re)
    if (m?.[1]) {
      order_number = m[1].trim().replace(/[.,;]+$/, '')
      break
    }
  }

  let purchase_date: string | null = null
  const dateLabel = blob.match(
    /(?:purchase\s*date|po\s*date|order\s*date|dated|date)\s*[:.\-]?\s*(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}|\d{4}-\d{2}-\d{2})/i,
  )
  if (dateLabel?.[1]) purchase_date = toIsoDate(dateLabel[1])
  if (!purchase_date) {
    const any = blob.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)
    if (any?.[1]) purchase_date = toIsoDate(any[1])
  }

  let purchase_cost: number | null = null
  const costPatterns = [
    /(?:grand\s*total|net\s*amount|total\s*amount|amount\s*payable|invoice\s*total|total)\s*[:.\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9,.]+)/i,
    /(?:₹|rs\.?|inr)\s*([0-9,.]+)/i,
  ]
  for (const re of costPatterns) {
    const m = blob.match(re)
    if (m?.[1]) {
      const n = parseMoney(m[1])
      if (n != null) {
        purchase_cost = n
        break
      }
    }
  }
  // Prefer larger “total-like” amounts if multiple ₹ matches and we got a tiny number
  if (purchase_cost != null && purchase_cost < 100) {
    const all = [...blob.matchAll(/(?:₹|rs\.?|inr)\s*([0-9,.]+)/gi)]
      .map((m) => parseMoney(m[1]))
      .filter((n): n is number => n != null && n >= 100)
    if (all.length) purchase_cost = Math.max(...all)
  }

  let warranty_months: number | null = null
  const wYear = blob.match(/warranty[^.\n]{0,40}?(\d+)\s*(?:years?|yrs?)/i)
  const wMonth = blob.match(/warranty[^.\n]{0,40}?(\d+)\s*(?:months?|mos?)/i)
  if (wMonth?.[1]) warranty_months = Number(wMonth[1])
  else if (wYear?.[1]) warranty_months = Number(wYear[1]) * 12

  let supplier_name: string | null = null
  const supplierLabel = [
    /(?:supplier|vendor|seller|sold\s*by|bill\s*from|from)\s*[:.\-]\s*([^\n]{3,80})/i,
    /(?:supplier|vendor)\s+name\s*[:.\-]?\s*([^\n]{3,80})/i,
  ]
  for (const re of supplierLabel) {
    const m = blob.match(re)
    if (m?.[1]) {
      supplier_name = normalizeWs(m[1].replace(/[,;].*$/, '')).slice(0, 120)
      if (/^(the|date|no|number|address)$/i.test(supplier_name)) continue
      break
    }
  }
  // Heuristic: first substantial line that isn't a PO header
  if (!supplier_name) {
    for (const line of lines.slice(0, 12)) {
      if (/purchase\s*order|tax\s*invoice|gstin|invoice/i.test(line)) continue
      if (/^\d+$/.test(line)) continue
      if (line.length >= 4 && line.length <= 80 && /[a-zA-Z]{3}/.test(line)) {
        supplier_name = line
        break
      }
    }
  }

  const hits = [order_number, purchase_date, purchase_cost, supplier_name].filter(Boolean).length
  const confidence: 'high' | 'medium' | 'low' =
    hits >= 3 ? 'high' : hits >= 2 ? 'medium' : 'low'

  return {
    order_number,
    purchase_date,
    purchase_cost,
    warranty_months,
    supplier_name,
    confidence,
  }
}

async function ocrImageBuffer(buf: Buffer): Promise<string> {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(buf)
    return data.text || ''
  } finally {
    await worker.terminate()
  }
}

async function extractTextFromPdf(buf: Buffer): Promise<{ text: string; method: 'pdf-text' | 'pdf-ocr'; warnings: string[] }> {
  const warnings: string[] = []
  const parser = new PDFParse({ data: buf })
  try {
    const textResult = await parser.getText()
    const text = String(textResult?.text || '').trim()
    if (text.replace(/\s+/g, ' ').length >= 40) {
      return { text, method: 'pdf-text', warnings }
    }
    warnings.push('Little text in PDF — running OCR on first page')
    try {
      const shot = await parser.getScreenshot({ first: 1, last: 1, scale: 2 })
      const page = shot?.pages?.[0]
      if (!page?.data?.length) {
        warnings.push('Could not render PDF page for OCR — try uploading a PNG/JPG of the PO')
        return { text, method: 'pdf-text', warnings }
      }
      const imgBuf = Buffer.from(page.data)
      const ocrText = await ocrImageBuffer(imgBuf)
      return { text: ocrText || text, method: 'pdf-ocr', warnings }
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : 'PDF OCR failed')
      return { text, method: 'pdf-text', warnings }
    }
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

export async function matchSupplier(name: string | null): Promise<{
  supplier_id: number | null
  supplier_name: string | null
  create_suggested: boolean
}> {
  if (!name) return { supplier_id: null, supplier_name: null, create_suggested: false }
  const cleaned = normalizeWs(name).slice(0, 191)
  const norm = normalizeName(cleaned)
  const rows = await all<{ id: number; name: string }>(`
    SELECT id, name FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC LIMIT 500
  `)
  let best: { id: number; name: string; score: number } | null = null
  for (const r of rows) {
    const rn = normalizeName(r.name)
    if (!rn) continue
    if (rn === norm) {
      return { supplier_id: r.id, supplier_name: r.name, create_suggested: false }
    }
    if (rn.includes(norm) || norm.includes(rn)) {
      const score = Math.min(rn.length, norm.length) / Math.max(rn.length, norm.length)
      if (!best || score > best.score) best = { id: r.id, name: r.name, score }
    }
  }
  if (best && best.score >= 0.5) {
    return { supplier_id: best.id, supplier_name: best.name, create_suggested: false }
  }
  return { supplier_id: null, supplier_name: cleaned, create_suggested: true }
}

export async function extractPoFromFile(opts: {
  buffer: Buffer
  mime?: string | null
  filename?: string | null
}): Promise<PoExtractedFields> {
  const mime = String(opts.mime || '').toLowerCase()
  const name = String(opts.filename || '').toLowerCase()
  const isPdf = mime.includes('pdf') || name.endsWith('.pdf')
  const isImage = mime.startsWith('image/')
    || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name)

  const warnings: string[] = []
  let text = ''
  let method: PoExtractedFields['method'] = 'ocr'

  if (isPdf) {
    const r = await extractTextFromPdf(opts.buffer)
    text = r.text
    method = r.method
    warnings.push(...r.warnings)
  } else if (isImage) {
    text = await ocrImageBuffer(opts.buffer)
    method = 'ocr'
  } else {
    // Try PDF then OCR as last resort
    try {
      const r = await extractTextFromPdf(opts.buffer)
      text = r.text
      method = r.method
      warnings.push(...r.warnings)
    } catch {
      text = await ocrImageBuffer(opts.buffer)
      method = 'ocr'
    }
  }

  if (!text.trim()) {
    return {
      order_number: null,
      purchase_date: null,
      purchase_cost: null,
      warranty_months: null,
      supplier_name: null,
      supplier_id: null,
      create_suggested: false,
      confidence: 'low',
      method,
      raw_preview: '',
      warnings: [...warnings, 'No text could be extracted from this file'],
    }
  }

  const parsed = parsePoText(text)
  const match = await matchSupplier(parsed.supplier_name)

  return {
    ...parsed,
    supplier_id: match.supplier_id,
    supplier_name: match.supplier_name || parsed.supplier_name,
    create_suggested: match.create_suggested,
    method,
    raw_preview: text.slice(0, 1200),
    warnings,
  }
}
