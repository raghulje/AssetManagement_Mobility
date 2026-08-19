/**
 * Import fleet from Vehicle_List.xlsx into `vehicles`.
 * Usage: npx tsx scripts/import-vehicles.ts [path-to-xlsx]
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import XLSX from 'xlsx'
import { all, now, run } from '../src/db/index.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

function fuelFromCategory(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('cng') || c.includes('petrol')) return 'CNG_PETROL'
  if (c.includes('ev')) return 'EV'
  return 'OTHER'
}

function cleanCategory(category: string): string {
  return category.replace(/^#\s*/, '').trim()
}

async function main() {
  const xlsxPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(root, 'Vehicle_List.xlsx')

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`File not found: ${xlsxPath}`)
  }

  const wb = XLSX.readFile(xlsxPath)
  const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: '',
  })

  const ts = now()
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const vehicleNumber = String(row['Vehicle Number'] ?? row.vehicle_number ?? '').trim().toUpperCase()
    const model = String(row.Model ?? row.model ?? '').trim()
    const locationName = String(row.Location ?? row.location ?? '').trim()
    const rawCategory = String(row.Category ?? row.category ?? '').trim()

    if (!vehicleNumber || !model || !locationName) {
      skipped++
      continue
    }

    const category = cleanCategory(rawCategory) || 'EV Vehicles'
    const fuelType = fuelFromCategory(category)

    const existing = await all<{ id: number }>(
      'SELECT id FROM vehicles WHERE vehicle_number = ? LIMIT 1',
      [vehicleNumber],
    )

    if (existing[0]) {
      await run(
        `UPDATE vehicles
         SET model = ?, location_name = ?, category = ?, fuel_type = ?, updated_at = ?
         WHERE id = ?`,
        [model, locationName, category, fuelType, ts, existing[0].id],
      )
      updated++
    } else {
      await run(
        `INSERT INTO vehicles
          (vehicle_number, model, location_name, category, fuel_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [vehicleNumber, model, locationName, category, fuelType, ts, ts],
      )
      inserted++
    }
  }

  const [{ c }] = await all<{ c: number }>('SELECT COUNT(*) as c FROM vehicles WHERE deleted_at IS NULL')
  console.log(`Import done from ${path.basename(xlsxPath)}`)
  console.log(`  inserted=${inserted} updated=${updated} skipped=${skipped}`)
  console.log(`  total vehicles in DB=${c}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
