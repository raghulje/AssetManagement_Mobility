/**
 * Demo catalog for Licenses / Accessories / Consumables / Components.
 *
 *   cd server && npx tsx scripts/seed-inventory-demo.ts
 *
 * Idempotent by name: skips rows that already exist (active) for the demo company.
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { all, get, run, now } from '../src/db/index.js'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const ts = now()

async function ensureCompany() {
  const prefer = await get<{ id: number; name: string }>(`
    SELECT id, name FROM companies
    WHERE deleted_at IS NULL AND (name = 'Refex' OR name LIKE 'Refex %')
    ORDER BY CASE WHEN name = 'Refex' THEN 0 ELSE 1 END, id
    LIMIT 1
  `)
  if (prefer) return prefer
  const any = await get<{ id: number; name: string }>(`
    SELECT id, name FROM companies WHERE deleted_at IS NULL ORDER BY id LIMIT 1
  `)
  if (!any) throw new Error('No company found — create a company first')
  return any
}

async function ensureLocation() {
  const prefer = await get<{ id: number }>(`
    SELECT id FROM locations
    WHERE deleted_at IS NULL AND (
      name LIKE '%Nungambakkam%' OR name LIKE '%Chennai HQ%' OR name LIKE '%Chennai%'
    )
    ORDER BY id LIMIT 1
  `)
  if (prefer) return prefer.id
  const any = await get<{ id: number }>(`SELECT id FROM locations WHERE deleted_at IS NULL ORDER BY id LIMIT 1`)
  return any?.id || null
}

async function ensureManufacturer(name: string) {
  const existing = await get<{ id: number }>(`
    SELECT id FROM manufacturers WHERE name = ? AND deleted_at IS NULL LIMIT 1
  `, [name])
  if (existing) return existing.id
  const info = await run(`
    INSERT INTO manufacturers (name, created_at, updated_at) VALUES (?, ?, ?)
  `, [name, ts, ts])
  return Number(info.insertId)
}

async function ensureCategory(name: string, categoryType: string) {
  const existing = await get<{ id: number }>(`
    SELECT id FROM categories
    WHERE name = ? AND category_type = ? AND deleted_at IS NULL
    LIMIT 1
  `, [name, categoryType])
  if (existing) return existing.id
  // Some schemas use `type` instead of category_type — try common column
  try {
    const info = await run(`
      INSERT INTO categories (name, category_type, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `, [name, categoryType, ts, ts])
    return Number(info.insertId)
  } catch {
    const info = await run(`
      INSERT INTO categories (name, type, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `, [name, categoryType, ts, ts])
    return Number(info.insertId)
  }
}

async function existsByName(table: string, name: string, companyId: number) {
  const row = await get<{ id: number }>(`
    SELECT id FROM ${table}
    WHERE deleted_at IS NULL AND name = ? AND company_id = ?
    LIMIT 1
  `, [name, companyId])
  return Boolean(row)
}

async function insertLicense(opts: {
  name: string
  seats: number
  companyId: number
  manufacturerId: number | null
  categoryId: number | null
  serial?: string
  cost?: number
  purchaseDate?: string
  expirationDate?: string
  notes?: string
}) {
  if (await existsByName('licenses', opts.name, opts.companyId)) return { skipped: true as const }
  const info = await run(`
    INSERT INTO licenses (
      name, serial, seats, company_id, manufacturer_id, category_id,
      expiration_date, purchase_cost, purchase_date, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.name, opts.serial || null, opts.seats, opts.companyId, opts.manufacturerId,
    opts.categoryId, opts.expirationDate || null, opts.cost ?? null, opts.purchaseDate || null,
    opts.notes || 'Demo license catalog', ts, ts,
  ])
  const id = Number(info.insertId)
  const BATCH = 100
  for (let offset = 0; offset < opts.seats; offset += BATCH) {
    const n = Math.min(BATCH, opts.seats - offset)
    const placeholders = Array(n).fill('(?, ?, ?)').join(', ')
    const vals: unknown[] = []
    for (let i = 0; i < n; i++) vals.push(id, ts, ts)
    await run(`INSERT INTO license_seats (license_id, created_at, updated_at) VALUES ${placeholders}`, vals)
  }
  return { skipped: false as const, id }
}

async function insertQty(
  table: 'accessories' | 'consumables' | 'components',
  opts: {
    name: string
    companyId: number
    categoryId: number | null
    locationId: number | null
    model?: string
    qty: number
    minAmt?: number
    cost?: number
    notes?: string
  },
) {
  if (await existsByName(table, opts.name, opts.companyId)) return { skipped: true as const }
  const info = await run(`
    INSERT INTO ${table} (
      name, category_id, company_id, location_id, model_number, qty, min_amt, purchase_cost, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.name, opts.categoryId, opts.companyId, opts.locationId, opts.model || null,
    opts.qty, opts.minAmt ?? 2, opts.cost ?? null, opts.notes || 'Demo inventory catalog', ts, ts,
  ])
  return { skipped: false as const, id: Number(info.insertId) }
}

const company = await ensureCompany()
const locationId = await ensureLocation()

const mfg = {
  microsoft: await ensureManufacturer('Microsoft'),
  adobe: await ensureManufacturer('Adobe'),
  jetbrains: await ensureManufacturer('JetBrains'),
  zoom: await ensureManufacturer('Zoom'),
  slack: await ensureManufacturer('Slack'),
  antivirus: await ensureManufacturer('CrowdStrike'),
  logitech: await ensureManufacturer('Logitech'),
  dell: await ensureManufacturer('Dell'),
  hp: await ensureManufacturer('HP'),
  apple: await ensureManufacturer('Apple'),
  kingston: await ensureManufacturer('Kingston'),
  samsung: await ensureManufacturer('Samsung'),
  anker: await ensureManufacturer('Anker'),
  cisco: await ensureManufacturer('Cisco'),
}

const cat = {
  software: await ensureCategory('Software', 'license'),
  productivity: await ensureCategory('Productivity Suite', 'license'),
  security: await ensureCategory('Security Software', 'license'),
  design: await ensureCategory('Design / Creative', 'license'),
  hub: await ensureCategory('Hub / Dock', 'accessory'),
  mouse: await ensureCategory('Mouse / Keyboard', 'accessory'),
  headset: await ensureCategory('Headset / Audio', 'accessory'),
  cable: await ensureCategory('Cable / Adapter', 'accessory'),
  bag: await ensureCategory('Bag / Sleeve', 'accessory'),
  toner: await ensureCategory('Toner / Ink', 'consumable'),
  battery: await ensureCategory('Battery', 'consumable'),
  cleaning: await ensureCategory('Cleaning Kit', 'consumable'),
  paper: await ensureCategory('Paper / Media', 'consumable'),
  ram: await ensureCategory('RAM', 'component'),
  storage: await ensureCategory('Storage', 'component'),
  network: await ensureCategory('Network Card', 'component'),
  gpu: await ensureCategory('Graphics', 'component'),
}

console.log(`Seeding inventory demo for company #${company.id} (${company.name}), location=${locationId ?? 'none'}`)

const summary = {
  licenses: { created: 0, skipped: 0 },
  accessories: { created: 0, skipped: 0 },
  consumables: { created: 0, skipped: 0 },
  components: { created: 0, skipped: 0 },
}

const licenses = [
  { name: 'Microsoft 365 E3', seats: 250, manufacturerId: mfg.microsoft, categoryId: cat.productivity, serial: 'M365-E3-DEMO-001', cost: 2100000, purchaseDate: '2025-04-01', expirationDate: '2026-03-31', notes: 'Enterprise productivity suite — email, Office, Teams' },
  { name: 'Microsoft 365 Business Basic', seats: 80, manufacturerId: mfg.microsoft, categoryId: cat.productivity, serial: 'M365-BB-DEMO-002', cost: 320000, purchaseDate: '2025-06-15', expirationDate: '2026-06-14', notes: 'Web apps + Teams for contractors' },
  { name: 'Microsoft Windows 11 Pro Upgrade', seats: 120, manufacturerId: mfg.microsoft, categoryId: cat.software, serial: 'WIN11-PRO-DEMO', cost: 540000, purchaseDate: '2025-01-10', expirationDate: '2028-01-09', notes: 'OEM upgrade pack for fleet refresh' },
  { name: 'Microsoft Visio Plan 2', seats: 25, manufacturerId: mfg.microsoft, categoryId: cat.software, cost: 95000, purchaseDate: '2025-08-01', expirationDate: '2026-07-31' },
  { name: 'Microsoft Project Plan 3', seats: 15, manufacturerId: mfg.microsoft, categoryId: cat.software, cost: 110000, purchaseDate: '2025-08-01', expirationDate: '2026-07-31' },
  { name: 'Adobe Creative Cloud All Apps', seats: 40, manufacturerId: mfg.adobe, categoryId: cat.design, serial: 'ADOBE-CC-DEMO', cost: 980000, purchaseDate: '2025-05-01', expirationDate: '2026-04-30', notes: 'Design / marketing team' },
  { name: 'Adobe Acrobat Pro DC', seats: 60, manufacturerId: mfg.adobe, categoryId: cat.software, cost: 180000, purchaseDate: '2025-05-01', expirationDate: '2026-04-30' },
  { name: 'JetBrains All Products Pack', seats: 30, manufacturerId: mfg.jetbrains, categoryId: cat.software, serial: 'JB-ALL-DEMO', cost: 420000, purchaseDate: '2025-03-01', expirationDate: '2026-02-28', notes: 'Engineering IDE licenses' },
  { name: 'JetBrains IntelliJ IDEA Ultimate', seats: 20, manufacturerId: mfg.jetbrains, categoryId: cat.software, cost: 180000, purchaseDate: '2025-03-01', expirationDate: '2026-02-28' },
  { name: 'Zoom Workplace Business', seats: 100, manufacturerId: mfg.zoom, categoryId: cat.productivity, cost: 210000, purchaseDate: '2025-07-01', expirationDate: '2026-06-30' },
  { name: 'Slack Business+', seats: 150, manufacturerId: mfg.slack, categoryId: cat.productivity, cost: 360000, purchaseDate: '2025-02-01', expirationDate: '2026-01-31' },
  { name: 'CrowdStrike Falcon Endpoint', seats: 400, manufacturerId: mfg.antivirus, categoryId: cat.security, serial: 'CS-FALCON-DEMO', cost: 1500000, purchaseDate: '2025-01-15', expirationDate: '2026-01-14', notes: 'EDR for laptops & servers' },
  { name: 'Microsoft Defender for Endpoint P2', seats: 300, manufacturerId: mfg.microsoft, categoryId: cat.security, cost: 450000, purchaseDate: '2025-01-15', expirationDate: '2026-01-14' },
  { name: 'Autodesk AutoCAD LT', seats: 10, manufacturerId: await ensureManufacturer('Autodesk'), categoryId: cat.design, cost: 220000, purchaseDate: '2025-09-01', expirationDate: '2026-08-31' },
  { name: 'Tableau Creator', seats: 8, manufacturerId: await ensureManufacturer('Salesforce'), categoryId: cat.software, cost: 560000, purchaseDate: '2025-04-20', expirationDate: '2026-04-19', notes: 'BI / analytics' },
]

for (const row of licenses) {
  const r = await insertLicense({ ...row, companyId: company.id })
  if (r.skipped) summary.licenses.skipped++
  else summary.licenses.created++
}

const accessories = [
  { name: 'Logitech MX Master 3S Mouse', categoryId: cat.mouse, model: 'MX-MASTER-3S', qty: 45, minAmt: 5, cost: 8500, notes: 'Ergonomic wireless mouse' },
  { name: 'Logitech MX Keys S Keyboard', categoryId: cat.mouse, model: 'MX-KEYS-S', qty: 40, minAmt: 5, cost: 9200 },
  { name: 'Logitech Zone Wired Headset', categoryId: cat.headset, model: 'ZONE-WIRED', qty: 60, minAmt: 8, cost: 6500 },
  { name: 'Jabra Evolve2 65 Headset', categoryId: cat.headset, model: 'EVOLVE2-65', qty: 35, minAmt: 5, cost: 18500 },
  { name: 'Dell WD19S USB-C Dock', categoryId: cat.hub, model: 'WD19S', qty: 50, minAmt: 6, cost: 22000, notes: 'Laptop docking station' },
  { name: 'Lenovo ThinkPad USB-C Dock Gen 2', categoryId: cat.hub, model: '40AS', qty: 30, minAmt: 4, cost: 19500 },
  { name: 'Anker 7-in-1 USB-C Hub', categoryId: cat.hub, model: 'A8346', qty: 70, minAmt: 10, cost: 4500 },
  { name: 'HDMI 2.0 Cable 2m', categoryId: cat.cable, model: 'HDMI-2M', qty: 120, minAmt: 20, cost: 450 },
  { name: 'USB-C to HDMI Adapter', categoryId: cat.cable, model: 'UC-HDMI', qty: 80, minAmt: 15, cost: 1200 },
  { name: 'USB-C Charging Cable 1m', categoryId: cat.cable, model: 'USBC-1M', qty: 150, minAmt: 25, cost: 350 },
  { name: 'Laptop Sleeve 14"', categoryId: cat.bag, model: 'SLEEVE-14', qty: 55, minAmt: 8, cost: 900 },
  { name: 'Laptop Backpack 15"', categoryId: cat.bag, model: 'BP-15', qty: 40, minAmt: 5, cost: 2800 },
  { name: 'Apple Magic Mouse', categoryId: cat.mouse, model: 'MAGIC-MOUSE', qty: 15, minAmt: 2, cost: 9500 },
  { name: 'Cisco Webex Desk Camera', categoryId: cat.headset, model: 'DESK-CAM', qty: 25, minAmt: 3, cost: 12000 },
  { name: 'Monitor Stand / Arm Dual', categoryId: cat.hub, model: 'ARM-DUAL', qty: 20, minAmt: 3, cost: 7500 },
]

for (const row of accessories) {
  const r = await insertQty('accessories', { ...row, companyId: company.id, locationId })
  if (r.skipped) summary.accessories.skipped++
  else summary.accessories.created++
}

const consumables = [
  { name: 'HP 26A Black Toner', categoryId: cat.toner, model: 'CF226A', qty: 24, minAmt: 4, cost: 6200, notes: 'LaserJet Pro M402/MFP M426' },
  { name: 'HP 410A Cyan Toner', categoryId: cat.toner, model: 'CF410A', qty: 12, minAmt: 2, cost: 7800 },
  { name: 'HP 410A Magenta Toner', categoryId: cat.toner, model: 'CF413A', qty: 12, minAmt: 2, cost: 7800 },
  { name: 'HP 410A Yellow Toner', categoryId: cat.toner, model: 'CF412A', qty: 12, minAmt: 2, cost: 7800 },
  { name: 'Canon 057 Black Toner', categoryId: cat.toner, model: '057', qty: 10, minAmt: 2, cost: 5400 },
  { name: 'Epson 664 Ink Bottle Black', categoryId: cat.toner, model: 'T6641', qty: 30, minAmt: 5, cost: 650 },
  { name: 'AA Alkaline Batteries (pack of 8)', categoryId: cat.battery, model: 'AA-8PK', qty: 60, minAmt: 10, cost: 280 },
  { name: 'AAA Alkaline Batteries (pack of 8)', categoryId: cat.battery, model: 'AAA-8PK', qty: 40, minAmt: 8, cost: 260 },
  { name: 'Laptop CMOS CR2032 Battery', categoryId: cat.battery, model: 'CR2032', qty: 50, minAmt: 10, cost: 40 },
  { name: 'UPS Replacement Battery 12V 7Ah', categoryId: cat.battery, model: '12V7AH', qty: 16, minAmt: 2, cost: 1800 },
  { name: 'Screen Cleaning Wipe Kit', categoryId: cat.cleaning, model: 'SCR-KIT', qty: 40, minAmt: 6, cost: 350 },
  { name: 'Compressed Air Duster (can)', categoryId: cat.cleaning, model: 'AIR-CAN', qty: 35, minAmt: 5, cost: 420 },
  { name: 'A4 Copier Paper (ream 500)', categoryId: cat.paper, model: 'A4-500', qty: 80, minAmt: 15, cost: 320 },
  { name: 'A3 Copier Paper (ream 500)', categoryId: cat.paper, model: 'A3-500', qty: 20, minAmt: 4, cost: 680 },
  { name: 'Label Sheet A4 (pack 100)', categoryId: cat.paper, model: 'LBL-A4', qty: 25, minAmt: 5, cost: 900, notes: 'Asset label printing stock' },
]

for (const row of consumables) {
  const r = await insertQty('consumables', { ...row, companyId: company.id, locationId })
  if (r.skipped) summary.consumables.skipped++
  else summary.consumables.created++
}

const components = [
  { name: '16GB DDR4-3200 SODIMM', categoryId: cat.ram, model: 'KVR32S22S8/16', qty: 40, minAmt: 6, cost: 3200, notes: 'Laptop RAM upgrade' },
  { name: '32GB DDR4-3200 SODIMM', categoryId: cat.ram, model: 'KVR32S22D8/32', qty: 20, minAmt: 3, cost: 6200 },
  { name: '8GB DDR4-2666 DIMM', categoryId: cat.ram, model: 'KVR26N19S8/8', qty: 25, minAmt: 4, cost: 1800, notes: 'Desktop RAM' },
  { name: '512GB NVMe SSD M.2', categoryId: cat.storage, model: 'MZ-V8V512', qty: 35, minAmt: 5, cost: 4500 },
  { name: '1TB NVMe SSD M.2', categoryId: cat.storage, model: 'MZ-V8V1T0', qty: 30, minAmt: 4, cost: 7800 },
  { name: '2TB NVMe SSD M.2', categoryId: cat.storage, model: 'MZ-V8V2T0', qty: 12, minAmt: 2, cost: 14500 },
  { name: '1TB SATA SSD 2.5"', categoryId: cat.storage, model: 'MZ-76E1T0', qty: 18, minAmt: 3, cost: 6200 },
  { name: 'Intel AX210 Wi-Fi 6E Card', categoryId: cat.network, model: 'AX210', qty: 22, minAmt: 3, cost: 2800 },
  { name: 'Intel I225-V 2.5G Ethernet NIC', categoryId: cat.network, model: 'I225-V', qty: 15, minAmt: 2, cost: 3200 },
  { name: 'USB-C Gigabit Ethernet Adapter', categoryId: cat.network, model: 'UC-ETH', qty: 40, minAmt: 6, cost: 1500 },
  { name: 'NVIDIA T1000 8GB (workstation)', categoryId: cat.gpu, model: 'T1000-8G', qty: 6, minAmt: 1, cost: 42000, notes: 'CAD / design workstations' },
  { name: 'M.2 NVMe to USB Enclosure', categoryId: cat.storage, model: 'NVME-ENC', qty: 20, minAmt: 3, cost: 2200 },
  { name: 'SATA Data Cable (pack of 5)', categoryId: cat.network, model: 'SATA-5PK', qty: 30, minAmt: 5, cost: 250 },
  { name: 'Laptop Thermal Paste Tube', categoryId: cat.gpu, model: 'TP-4G', qty: 25, minAmt: 5, cost: 180 },
  { name: 'M.2 Heatsink Kit', categoryId: cat.storage, model: 'M2-HS', qty: 28, minAmt: 4, cost: 350 },
]

for (const row of components) {
  const r = await insertQty('components', { ...row, companyId: company.id, locationId })
  if (r.skipped) summary.components.skipped++
  else summary.components.created++
}

const counts = {
  licenses: await get<{ c: number }>(`SELECT COUNT(*) as c FROM licenses WHERE deleted_at IS NULL AND company_id = ?`, [company.id]),
  accessories: await get<{ c: number }>(`SELECT COUNT(*) as c FROM accessories WHERE deleted_at IS NULL AND company_id = ?`, [company.id]),
  consumables: await get<{ c: number }>(`SELECT COUNT(*) as c FROM consumables WHERE deleted_at IS NULL AND company_id = ?`, [company.id]),
  components: await get<{ c: number }>(`SELECT COUNT(*) as c FROM components WHERE deleted_at IS NULL AND company_id = ?`, [company.id]),
}

console.log(JSON.stringify({
  company,
  locationId,
  summary,
  activeTotalsForCompany: {
    licenses: Number(counts.licenses?.c || 0),
    accessories: Number(counts.accessories?.c || 0),
    consumables: Number(counts.consumables?.c || 0),
    components: Number(counts.components?.c || 0),
  },
  tip: 'Open Licenses / Accessories / Consumables / Components in the UI (filter by company if needed).',
}, null, 2))
