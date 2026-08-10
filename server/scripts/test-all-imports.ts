/**
 * End-to-end smoke test for every CSV import type.
 * Run: npx tsx scripts/test-all-imports.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import {
  IMPORT_FIELDS, autoMap, processImport,
} from '../src/services/importEngine.js'
import { run, get, now } from '../src/db/index.js'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const stamp = Date.now().toString().slice(-8)
const prefix = `TESTIMP-${stamp}`

function csv(type: string): string {
  const fields = IMPORT_FIELDS[type]
  const header = fields.map((f) => f.label).join(',')
  const row = (() => {
    switch (type) {
      case 'asset':
        return `${prefix}-A1,Test Asset,SN-${stamp},Test Import Model,In Stock,Refex,Chennai HQ,Test Supplier,2026-01-15,45000,PO-${stamp},Imported by test,`
      case 'user':
        return `Test,Importer,${prefix}.user,${prefix}@example.com,EMP-${stamp},Refex,Chennai HQ,IT,Engineer,9999999999,1`
      case 'accessory':
        return `${prefix} Mouse,Mouse,25,5,Refex,Chennai HQ,MX-${stamp},1200`
      case 'consumable':
        return `${prefix} Toner,Toner,40,10,Refex,Chennai HQ,TN-${stamp},800`
      case 'component':
        return `${prefix} RAM,RAM,16,2,Refex,Chennai HQ,DDR4-${stamp},COMP-SN-${stamp},3500`
      case 'license':
        return `${prefix} Office,12,KEY-${stamp},Refex,Microsoft,2027-12-31,18000`
      case 'location':
        return `${prefix} Site,Refex,12 Test Road,Chennai,TN,IN,600001`
      case 'manufacturer':
        return `${prefix} OEM,https://example.com/${prefix}`
      case 'supplier':
        return `${prefix} Vendor,https://vendor.example,vendor@example.com,9876543210,Contact Person,Address line,Notes`
      case 'model':
        return `Test Import Model,MDL-${stamp},Laptop,${prefix} OEM,Model notes`
      case 'category':
        return `${prefix} Cat,asset`
      default:
        return fields.map(() => 'x').join(',')
    }
  })()
  return `${header}\n${row}\n`
}

async function ensureImportRow(type: string, filePath: string) {
  const ts = now()
  const info = await run(`
    INSERT INTO imports (name, file_path, import_type, filesize, field_map, header_row, first_row, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, '{}', '[]', '{}', 'pending', ?, ?)
  `, [`${prefix}-${type}.csv`, filePath, type, fs.statSync(filePath).size, ts, ts])
  return Number(info.insertId)
}

async function cleanup() {
  // Best-effort cleanup of test rows
  await run(`DELETE FROM license_seats WHERE license_id IN (SELECT id FROM licenses WHERE name LIKE ?)`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM licenses WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM accessories WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM consumables WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM components WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM assets WHERE asset_tag LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM users WHERE username LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM locations WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM manufacturers WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM suppliers WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM categories WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  await run(`DELETE FROM imports WHERE name LIKE ?`, [`${prefix}%`]).catch(() => undefined)
  // Keep "Test Import Model" if reused — delete only if created by this run's manufacturer link is ok to leave
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refex-import-'))
const results: { type: string; ok: boolean; created: number; updated: number; errors: string[] }[] = []

console.log(`Import smoke test prefix=${prefix}`)
console.log(`Temp dir: ${tmpRoot}\n`)

try {
  for (const type of Object.keys(IMPORT_FIELDS)) {
    const filePath = path.join(tmpRoot, `${type}.csv`)
    const body = csv(type)
    fs.writeFileSync(filePath, body, 'utf8')
    const headers = body.split('\n')[0].split(',')
    const mappings = autoMap(headers, type)
    const missingRequired = (IMPORT_FIELDS[type] || [])
      .filter((f) => f.required && !mappings[f.key])
      .map((f) => f.key)

    if (missingRequired.length) {
      results.push({
        type, ok: false, created: 0, updated: 0,
        errors: [`autoMap missed required: ${missingRequired.join(', ')} | map=${JSON.stringify(mappings)}`],
      })
      continue
    }

    const importId = await ensureImportRow(type, filePath)
    const result = await processImport({
      importId,
      type,
      mappings,
      updateExisting: true,
      filePath,
    })

    // Second pass — should update, not error
    const importId2 = await ensureImportRow(type, filePath)
    const result2 = await processImport({
      importId: importId2,
      type,
      mappings,
      updateExisting: true,
      filePath,
    })

    const errs = [
      ...result.errors.map((e) => `create:${e.message}`),
      ...result2.errors.map((e) => `update:${e.message}`),
    ]
    const ok = result.errors.length === 0
      && result2.errors.length === 0
      && (result.created + result.updated) >= 1
      && result2.updated >= 1

    results.push({
      type,
      ok,
      created: result.created,
      updated: result2.updated,
      errors: errs.slice(0, 5),
    })
  }
} finally {
  await cleanup()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

console.log('Type           OK   +created  ~updated  notes')
console.log('──────────────────────────────────────────────────────────')
for (const r of results) {
  const flag = r.ok ? 'PASS' : 'FAIL'
  const notes = r.errors.length ? r.errors.join(' | ') : ''
  console.log(
    `${r.type.padEnd(14)} ${flag.padEnd(4)} ${String(r.created).padStart(8)}  ${String(r.updated).padStart(8)}  ${notes}`,
  )
}

const failed = results.filter((r) => !r.ok)
const statusRow = await get(`SELECT 1 as ok`)
void statusRow
console.log(`\n${results.length - failed.length}/${results.length} types passed`)
if (failed.length) {
  process.exitCode = 1
  console.error('\nFailed types:', failed.map((f) => f.type).join(', '))
} else {
  console.log('All import modules OK')
}

process.exit(process.exitCode || 0)
