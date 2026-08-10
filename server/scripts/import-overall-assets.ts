/**
 * Import OverAll Asset Lists 1.xlsx into ITAM:
 * - soft-delete mock assets (+ related links)
 * - upsert manufacturers / models / suppliers (vendors)
 * - match companies to HRMS company masters
 * - match assignees to HRMS employees
 * - create assets and assign where matched
 *
 * Usage: npx tsx scripts/import-overall-assets.ts
 */
import XLSX from 'xlsx'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const FILE = 'c:/Users/Raghul JE/Downloads/react/OverAll Asset Lists 1.xlsx'

type NormRow = Record<string, string> & { _sheet: string }

const HEADER_ALIASES: Record<string, string[]> = {
  asset_tag: ['asset number', 'assetnumber', 'assetnumber_*', 'asset no', 'asset tag'],
  status: ['asset status', 'assetstatus', 'assetstatus_*', 'allocate status', 'status'],
  assigned_to: ['allocate to', 'employee name', 'username', 'user name', 'assigned to'],
  designation: ['desgination', 'designation'],
  processor: ['processor', 'apr_1'],
  ram: ['ram size', 'ram', 'apr_2'],
  storage: ['hard disk size', 'hdd', 'ssd', 'storage', 'apr_3'],
  os: ['operating system', 'os', 'apr_4'],
  make: ['make', 'brand', 'manufacturer', 'apr_16'],
  model: ['model', 'apr_17'],
  serial: ['serial number', 'serial', 'apr_18'],
  vendor: ['vendor', 'supplier', 'apr_19'],
  company: ['company', 'apr_20'],
  invoice_number: ['invoice number', 'invoice no', 'apr_22', 'order number'],
  invoice_date: ['invoice date', 'purchse order date', 'purchase order date', 'apr_23'],
  cost: ['asset cost', 'cost', 'purchase cost', 'apr_31'],
}

const SHEET_COMPANY_HINT: Record<string, string> = {
  'ril': 'refex industries',
  'rgml': 'refex green mobility',
  'refexholding - stpl': 'stpl horticulture',
  'sil _ rril': 'refex renewables',
  'venwind (rgel)': 'venwind refex',
  '3imed': '3i medical technologies',
  'spa': 'sparzana',
  'spectrum energy pvt ltd': 'spectrum renewable',
  'sspv2 (sherisha solar)': 'sherisha solar spv two',
  'refex air': 'refex airports retail',
  'aj': 'aj office',
  'refex life (anam chemicals)': 'refex life sciences',
  'o3mpl  refexeveels': 'refex ev fleet',
  'rca': 'refex capital advisors',
  'seipl': 'scorch solar',
  'soy - sar': 'sourashakthi',
  'pan': 'refex industries',
  'cura': 'refex industries',
  'mode pro': 'refex holding',
  'site desktop': 'refex industries',
  'capex printer': 'refex industries',
}

const COMPANY_ALIASES: Record<string, string> = {
  ril: 'refex industries',
  rgml: 'refex green mobility',
  stpl: 'stpl horticulture',
  'refex holding': 'refex holding',
  'refex holding pvt ltd': 'refex holding',
  rril: 'refex renewables',
  sil: 'refex renewables',
  'ven wind': 'venwind refex',
  venwind: 'venwind refex',
  rgel: 'refex green energy',
  '3i medtech': '3i medical technologies',
  '3i medtech.': '3i medical technologies',
  '3imed': '3i medical technologies',
  'refex ev fleet': 'refex ev fleet',
  'o3 mobility': 'refex ev fleet',
  o3mpl: 'refex ev fleet',
  sparzana: 'sparzana',
  spa: 'sparzana',
  spectrum: 'spectrum renewable',
  'sherisha solar': 'sherisha solar',
  sspv2: 'sherisha solar',
  'refex air': 'refex airports',
  'refex life': 'refex life sciences',
  'aj office': 'aj office',
  aj: 'aj office',
}

function clean(s: string) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normKey(s: string) {
  return clean(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(private|pvt|ltd|limited|llp|inc|co|company|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normHeader(h: string) {
  return clean(h).toLowerCase().replace(/[*_]+$/g, '').replace(/\s+/g, ' ')
}

function mapHeader(h: string): string | null {
  const n = normHeader(h)
  if (!n || n.startsWith('__empty') || ['s.no', 'siteid', 'sit', 'f', 'ramesh', 'rames', ' '].includes(n)) return null
  if (/^[0-9a-z]{5}-/.test(n)) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => n === a || n === a.replace(/\s/g, ''))) return field
  }
  return null
}

function detectHeaderRow(matrix: unknown[][]) {
  for (let i = 0; i < Math.min(8, matrix.length); i++) {
    const row = (matrix[i] || []).map((c) => normHeader(String(c ?? '')))
    const hits = row.filter((c) =>
      c.includes('asset') || c.includes('serial') || c.includes('model') || c.includes('make') || c.includes('allocate') || c.includes('processor'),
    ).length
    if (hits >= 3) return i
  }
  return 0
}

function parseSheet(wb: XLSX.WorkBook, name: string): NormRow[] {
  const ws = wb.Sheets[name]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })
  const headerRowIdx = detectHeaderRow(matrix)
  const headerCells = (matrix[headerRowIdx] || []).map((c) => String(c ?? ''))
  let fields = headerCells.map(mapHeader)
  if (fields.filter(Boolean).length < 4) {
    const guess = [
      null, 'asset_tag', 'status', 'assigned_to', 'designation',
      'processor', 'ram', 'storage', 'os', 'make', 'model', 'serial', 'vendor', 'company',
      'invoice_number', 'invoice_date', 'cost',
    ]
    fields = headerCells.map((_, i) => (guess[i] as string | null) || null)
  }

  const rows: NormRow[] = []
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] || []
    const obj: NormRow = { _sheet: name }
    let any = false
    cells.forEach((cell, i) => {
      const field = fields[i]
      if (!field) return
      const val = clean(String(cell ?? ''))
      if (!val) return
      if (/^asset\s*number/i.test(val) || /^assetstatus/i.test(val)) return
      obj[field] = val
      any = true
    })
    if (!any) continue
    if (!obj.asset_tag && !obj.serial && !obj.model) continue
    if (/^total$/i.test(obj.asset_tag || '')) continue
    rows.push(obj)
  }
  return rows
}

function titleCaseVendor(s: string) {
  const t = clean(s)
  if (!t) return t
  // keep all-caps acronyms short
  if (t.length <= 4) return t.toUpperCase()
  return t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function normalizeMake(make: string) {
  const m = clean(make)
  if (!m) return 'Unknown'
  const k = m.toLowerCase()
  if (k.includes('lenovo')) return 'Lenovo'
  if (k === 'hp' || k.startsWith('hp ') || k.includes('hewlett')) return 'HP'
  if (k.includes('dell')) return 'Dell'
  if (k.includes('apple') || k.includes('macbook') || k.includes('iphone') || k.includes('ipad')) return 'Apple'
  if (k.includes('microsoft') || k.includes('surface')) return 'Microsoft'
  if (k.includes('redmi') || k.includes('xiaomi')) return 'Xiaomi'
  if (k.includes('samsung')) return 'Samsung'
  if (k.includes('acer')) return 'Acer'
  if (k.includes('asus')) return 'ASUS'
  if (k.includes('brother')) return 'Brother'
  if (k.includes('canon')) return 'Canon'
  if (k.includes('epson')) return 'Epson'
  if (k.includes('hp') && k.includes('printer')) return 'HP'
  return m.replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeVendor(v: string) {
  const raw = clean(v)
  if (!raw) return ''
  const k = normKey(raw)
  if (k.includes('touch') && k.includes('line')) return 'Touchline Technologies Private Limited'
  if (k.includes('zytech')) return 'Zytech Infra Solution'
  if (k.includes('dev system')) return 'Dev System'
  if (k.includes('amazon')) return 'Amazon'
  if (k.includes('ss system')) return 'SS System & Services'
  if (k.includes('techberg')) return 'TechBerg Enterprise Solutions Pvt Ltd'
  if (k.includes('online tek') || k === 'ots') return 'Online Tek Support'
  return titleCaseVendor(raw)
}

function inferCategory(row: NormRow): 'Laptop' | 'Desktop' | 'Monitor' | 'Mobile' | 'Printer' | 'Tablet' | 'Other' {
  const blob = `${row.status || ''} ${row.model || ''} ${row.make || ''} ${row.asset_tag || ''}`.toLowerCase()
  if (/printer|toner|laserjet|deskjet/.test(blob)) return 'Printer'
  if (/ipad|tablet/.test(blob)) return 'Tablet'
  if (/iphone|mobile|redmi|android phone|smartphone/.test(blob)) return 'Mobile'
  if (/monitor|ultrasharp|display/.test(blob)) return 'Monitor'
  if (/optiplex|thinkcentre|desktop|desktop/.test(blob) || /\bdt\b/.test(blob)) return 'Desktop'
  if (/macbook|laptop|thinkbook|thinkpad|ideapad|latitude|inspiron|pavilion|surface/.test(blob) || /\blap\b/.test(blob)) return 'Laptop'
  return 'Laptop'
}

function parseDate(v: string): string | null {
  const s = clean(v)
  if (!s) return null
  // Excel serial already converted by sheet_to_json sometimes as locale string
  const d = new Date(s)
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
    return d.toISOString().slice(0, 10)
  }
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const dd = Number(m[1])
    const mm = Number(m[2])
    let yy = Number(m[3])
    if (yy < 100) yy += 2000
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }
  return null
}

function parseCost(v: string): number | null {
  const s = clean(v).replace(/[₹$,]/g, '').replace(/\s/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isUnassignedName(name: string) {
  const n = name.toLowerCase().trim()
  if (!n) return true
  return /^(unallocat|stock|store|spare|free|available|vacant|na|n\/a|nil|none|-|–|—|it store|warehouse|admin store)/.test(n)
    || n.includes('unallocate')
    || n.includes('in stock')
}

function buildNotes(row: NormRow) {
  const parts: string[] = []
  if (row.processor) parts.push(`CPU: ${row.processor}`)
  if (row.ram) parts.push(`RAM: ${row.ram}`)
  if (row.storage) parts.push(`Storage: ${row.storage}`)
  if (row.os) parts.push(`OS: ${row.os}`)
  if (row.designation) parts.push(`Designation: ${row.designation}`)
  if (row.status && !/^allocate/i.test(row.status)) parts.push(`Sheet status: ${row.status}`)
  parts.push(`Source sheet: ${row._sheet}`)
  return parts.join(' | ')
}

function scoreCompany(candidate: string, targetNorm: string) {
  if (!candidate || !targetNorm) return 0
  if (candidate === targetNorm) return 100
  if (candidate.includes(targetNorm) || targetNorm.includes(candidate)) return 80
  const a = new Set(candidate.split(' ').filter((w) => w.length > 2))
  const b = new Set(targetNorm.split(' ').filter((w) => w.length > 2))
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  if (!a.size || !b.size) return 0
  return Math.round((100 * inter) / Math.max(a.size, b.size))
}

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true, raw: false })
  const allRows = wb.SheetNames.flatMap((n) => parseSheet(wb, n))
  console.log(`Parsed ${allRows.length} asset rows from ${wb.SheetNames.length} sheets`)

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const [companies] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name FROM companies WHERE deleted_at IS NULL',
  )
  const [employees] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, first_name, last_name, email, employee_code,
            LOWER(TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')))) AS full_name
     FROM employees WHERE deleted_at IS NULL`,
  )
  const [locations] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name, company_id FROM locations WHERE deleted_at IS NULL',
  )
  const [statuses] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name, type FROM status_labels WHERE deleted_at IS NULL',
  )
  const [categories] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name FROM categories WHERE deleted_at IS NULL',
  )

  const companyByNorm = new Map<string, { id: number; name: string }>()
  for (const c of companies) companyByNorm.set(normKey(String(c.name)), { id: Number(c.id), name: String(c.name) })

  const empByFull = new Map<string, number[]>()
  for (const e of employees) {
    const full = String(e.full_name || '').replace(/\s+/g, ' ').trim()
    if (!full) continue
    const arr = empByFull.get(full) || []
    arr.push(Number(e.id))
    empByFull.set(full, arr)
    // also first last without middle spacing quirks
    const compact = full.replace(/\s+/g, '')
    const arr2 = empByFull.get(compact) || []
    arr2.push(Number(e.id))
    empByFull.set(compact, arr2)
  }

  function matchCompany(row: NormRow): number | null {
    const raw = row.company || ''
    const sheetHint = SHEET_COMPANY_HINT[normKey(row._sheet)] || ''
    const aliasTarget = COMPANY_ALIASES[normKey(raw)] || normKey(raw) || sheetHint
    const targets = [aliasTarget, sheetHint, normKey(raw)].filter(Boolean)

    let best: { id: number; score: number } | null = null
    for (const [cn, c] of companyByNorm) {
      for (const t of targets) {
        const sc = scoreCompany(cn, t)
        if (!best || sc > best.score) best = { id: c.id, score: sc }
      }
    }
    if (best && best.score >= 55) return best.id
    return null
  }

  function matchEmployee(name: string): number | null {
    if (isUnassignedName(name)) return null
    const full = normKey(name).replace(/\s+/g, ' ')
    const exact = empByFull.get(full) || empByFull.get(full.replace(/\s+/g, ''))
    if (exact?.length === 1) return exact[0]
    if (exact && exact.length > 1) return exact[0] // first match

    // try "lastname firstname" flip
    const parts = full.split(' ').filter(Boolean)
    if (parts.length >= 2) {
      const flipped = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`
      const f = empByFull.get(flipped)
      if (f?.length) return f[0]
    }

    // partial: first + last token
    if (parts.length >= 2) {
      const first = parts[0]
      const last = parts[parts.length - 1]
      const candidates: number[] = []
      for (const [k, ids] of empByFull) {
        if (k.startsWith(first + ' ') && k.endsWith(' ' + last)) candidates.push(...ids)
      }
      const uniq = [...new Set(candidates)]
      if (uniq.length === 1) return uniq[0]
    }
    return null
  }

  // Ensure categories
  const catIds: Record<string, number> = {}
  for (const c of categories) catIds[String(c.name)] = Number(c.id)
  async function ensureCategory(name: string) {
    if (catIds[name]) return catIds[name]
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO categories (name, category_type, created_at, updated_at) VALUES (?, 'asset', ?, ?)`,
      [name, ts, ts],
    )
    catIds[name] = Number(res.insertId)
    console.log(`+ category ${name}`)
    return catIds[name]
  }
  for (const c of ['Laptop', 'Desktop', 'Monitor', 'Mobile', 'Printer', 'Tablet', 'Other']) {
    await ensureCategory(c)
  }

  const statusDeployable = statuses.find((s) => s.name === 'Ready to Deploy')?.id
    || statuses.find((s) => s.type === 'deployable')?.id
    || 1
  const statusAvailable = statuses.find((s) => s.name === 'Available')?.id || statusDeployable
  const statusArchived = statuses.find((s) => s.name === 'Archived')?.id || 5

  // Soft-delete mock suppliers
  await conn.query(
    `UPDATE suppliers SET deleted_at = ?, updated_at = ?
     WHERE deleted_at IS NULL AND name IN ('CDW','Dell Direct')`,
    [ts, ts],
  )

  // Clear asset links then soft-delete all existing assets (mock + test)
  await conn.query('DELETE FROM components_assets')
  await conn.query('UPDATE license_seats SET asset_id = NULL WHERE asset_id IS NOT NULL')
  await conn.query(
    `UPDATE assets SET deleted_at = ?, updated_at = ?, assigned_to = NULL, assigned_type = NULL WHERE deleted_at IS NULL`,
    [ts, ts],
  )
  console.log('Soft-deleted existing assets and cleared related links')

  // Soft-delete seed demo models (keep structure; new models created below)
  await conn.query(
    `UPDATE models SET deleted_at = ?, updated_at = ?
     WHERE deleted_at IS NULL AND name IN (
       'MacBook Pro 14\"','ThinkPad X1 Carbon','UltraSharp U2723QE','iPhone 15','Surface Laptop 5','OptiPlex 7050'
     )`,
    [ts, ts],
  )

  // Manufacturer cache
  const [mans] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name FROM manufacturers WHERE deleted_at IS NULL',
  )
  const manByNorm = new Map<string, number>()
  for (const m of mans) manByNorm.set(normKey(String(m.name)), Number(m.id))

  async function ensureManufacturer(name: string) {
    const key = normKey(name)
    if (manByNorm.has(key)) return manByNorm.get(key)!
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO manufacturers (name, created_at, updated_at) VALUES (?, ?, ?)`,
      [name, ts, ts],
    )
    manByNorm.set(key, Number(res.insertId))
    return Number(res.insertId)
  }

  // Supplier cache
  const [sups] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name FROM suppliers WHERE deleted_at IS NULL',
  )
  const supByNorm = new Map<string, number>()
  for (const s of sups) supByNorm.set(normKey(String(s.name)), Number(s.id))

  async function ensureSupplier(name: string) {
    const n = normalizeVendor(name)
    if (!n) return null
    const key = normKey(n)
    if (supByNorm.has(key)) return supByNorm.get(key)!
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO suppliers (name, created_at, updated_at) VALUES (?, ?, ?)`,
      [n, ts, ts],
    )
    supByNorm.set(key, Number(res.insertId))
    return Number(res.insertId)
  }

  // Model cache: manufacturer_id + name
  const [models] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, name, manufacturer_id FROM models WHERE deleted_at IS NULL',
  )
  const modelKey = (manId: number, name: string) => `${manId}::${normKey(name)}`
  const modelByKey = new Map<string, number>()
  for (const m of models) modelByKey.set(modelKey(Number(m.manufacturer_id || 0), String(m.name)), Number(m.id))

  async function ensureModel(make: string, modelName: string, categoryName: string) {
    const manId = await ensureManufacturer(make)
    const name = clean(modelName) || `${make} Device`
    const key = modelKey(manId, name)
    if (modelByKey.has(key)) return modelByKey.get(key)!
    const catId = await ensureCategory(categoryName)
    const [res] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO models (name, manufacturer_id, category_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [name, manId, catId, ts, ts],
    )
    modelByKey.set(key, Number(res.insertId))
    return Number(res.insertId)
  }

  function pickLocation(companyId: number | null): number | null {
    if (companyId) {
      const loc = locations.find((l) => Number(l.company_id) === companyId)
      if (loc) return Number(loc.id)
    }
    const tower = locations.find((l) => String(l.name).toLowerCase().includes('nungambakkam'))
    return tower ? Number(tower.id) : (locations[0] ? Number(locations[0].id) : null)
  }

  // Deduplicate asset tags
  const tagCount = new Map<string, number>()
  function uniqueTag(row: NormRow): string {
    let base = clean(row.asset_tag)
    if (!base || /^(refex holding|o3mpl|rgml|stpl|ril|spa)$/i.test(base)) {
      base = `${row._sheet.slice(0, 8)}-${(row.serial || 'NOSERIAL').slice(-8)}`.replace(/\s+/g, '')
    }
    base = base.replace(/\s+/g, '-').slice(0, 80)
    const key = base.toLowerCase()
    const n = (tagCount.get(key) || 0) + 1
    tagCount.set(key, n)
    if (n === 1) return base
    return `${base}-${n}`.slice(0, 100)
  }

  const stats = {
    created: 0,
    assigned: 0,
    skipped: 0,
    companyMatched: 0,
    companyUnmatched: 0,
    empMatched: 0,
    empUnmatched: 0,
    suppliersCreated: 0,
    errors: [] as string[],
  }
  const unmatchedCompanies = new Map<string, number>()
  const unmatchedEmployees = new Map<string, number>()

  const supBefore = supByNorm.size

  for (const row of allRows) {
    try {
      const make = normalizeMake(row.make || '')
      const modelName = clean(row.model) || `${make} Device`
      const category = inferCategory(row)
      const modelId = await ensureModel(make, modelName, category === 'Tablet' ? 'Mobile' : category === 'Other' ? 'Laptop' : category)
      const supplierId = row.vendor ? await ensureSupplier(row.vendor) : null
      const companyId = matchCompany(row)
      if (companyId) stats.companyMatched++
      else {
        stats.companyUnmatched++
        const k = row.company || `sheet:${row._sheet}`
        unmatchedCompanies.set(k, (unmatchedCompanies.get(k) || 0) + 1)
      }

      const locId = pickLocation(companyId)
      const tag = uniqueTag(row)
      const serial = clean(row.serial) || null
      const invoice = clean(row.invoice_number) || null
      const purchaseDate = parseDate(row.invoice_date || '')
      const cost = parseCost(row.cost || '')
      const notes = buildNotes(row)

      let statusId = statusDeployable
      const st = (row.status || '').toLowerCase()
      if (/scrap|eol|disposed|archived/.test(st)) statusId = statusArchived
      else if (/in stock|stock|unallocat/.test(st) || isUnassignedName(row.assigned_to || '')) statusId = statusAvailable

      const empId = matchEmployee(row.assigned_to || '')
      if (row.assigned_to && !isUnassignedName(row.assigned_to)) {
        if (empId) stats.empMatched++
        else {
          stats.empUnmatched++
          unmatchedEmployees.set(row.assigned_to, (unmatchedEmployees.get(row.assigned_to) || 0) + 1)
        }
      }

      const [ins] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO assets (
          asset_tag, name, serial, model_id, status_id, company_id, supplier_id,
          location_id, rtd_location_id, purchase_date, purchase_cost, order_number,
          notes, assigned_to, assigned_type, last_checkout, checkout_counter,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tag,
          modelName.slice(0, 191),
          serial,
          modelId,
          statusId,
          companyId,
          supplierId,
          locId,
          locId,
          purchaseDate,
          cost,
          invoice,
          notes,
          empId,
          empId ? 'employee' : null,
          empId ? ts : null,
          empId ? 1 : 0,
          ts,
          ts,
        ],
      )
      stats.created++
      if (empId) stats.assigned++
      void ins
    } catch (e) {
      stats.skipped++
      stats.errors.push(`${row.asset_tag || row.serial}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  stats.suppliersCreated = Math.max(0, supByNorm.size - supBefore)

  const [assetCount] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM assets WHERE deleted_at IS NULL',
  )
  const [supCount] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM suppliers WHERE deleted_at IS NULL',
  )
  const [modelCount] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM models WHERE deleted_at IS NULL',
  )

  console.log(JSON.stringify({
    stats,
    liveAssets: assetCount[0]?.c,
    liveSuppliers: supCount[0]?.c,
    liveModels: modelCount[0]?.c,
    topUnmatchedCompanies: [...unmatchedCompanies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    topUnmatchedEmployees: [...unmatchedEmployees.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    sampleErrors: stats.errors.slice(0, 10),
  }, null, 2))

  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
