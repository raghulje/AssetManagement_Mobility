import { all, get, run, now } from '../db/index.js'

export type MastersSyncSummary = {
  companies: { created: number; existing: number; total: number }
  locations: { created: number; existing: number; total: number }
  departments: { created: number; existing: number; total: number }
}

function cleanName(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || null
}

async function findOrCreateNamed(
  table: 'companies' | 'locations' | 'departments',
  name: string,
  extra: Record<string, unknown> = {},
): Promise<'created' | 'existing'> {
  const live = await get<{ id: number }>(
    `SELECT id FROM ${table} WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
    [name],
  )
  if (live) return 'existing'

  const ts = now()
  const cols = ['name', ...Object.keys(extra), 'created_at', 'updated_at']
  const vals = [name, ...Object.values(extra), ts, ts]
  try {
    await run(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals,
    )
    return 'created'
  } catch {
    // race / unique collision
    return 'existing'
  }
}

/**
 * Build companies / locations / departments masters from distinct HRMS employee fields.
 * Safe to re-run (find-or-create by name).
 */
export async function syncMastersFromEmployees(): Promise<MastersSyncSummary> {
  const companyRows = await all<{ name: string }>(`
    SELECT DISTINCT refex_company_name AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND refex_company_name IS NOT NULL
      AND TRIM(refex_company_name) <> ''
  `)
  const locationRows = await all<{ name: string }>(`
    SELECT DISTINCT refex_location AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND refex_location IS NOT NULL
      AND TRIM(refex_location) <> ''
  `)
  const departmentRows = await all<{ name: string }>(`
    SELECT DISTINCT department_name AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND department_name IS NOT NULL
      AND TRIM(department_name) <> ''
  `)

  const summary: MastersSyncSummary = {
    companies: { created: 0, existing: 0, total: 0 },
    locations: { created: 0, existing: 0, total: 0 },
    departments: { created: 0, existing: 0, total: 0 },
  }

  const companies = new Set<string>()
  for (const row of companyRows) {
    const name = cleanName(row.name)
    if (!name || companies.has(name)) continue
    companies.add(name)
    const result = await findOrCreateNamed('companies', name, {
      notes: 'Synced from HRMS (refex_company_name)',
    })
    summary.companies[result] += 1
  }
  summary.companies.total = companies.size

  const locations = new Set<string>()
  for (const row of locationRows) {
    const name = cleanName(row.name)
    if (!name || locations.has(name)) continue
    locations.add(name)
    // Locations are shared across companies — leave company_id null
    const result = await findOrCreateNamed('locations', name, {
      notes: 'Synced from HRMS (refex_location)',
    })
    summary.locations[result] += 1
  }
  summary.locations.total = locations.size

  const departments = new Set<string>()
  for (const row of departmentRows) {
    const name = cleanName(row.name)
    if (!name || departments.has(name)) continue
    departments.add(name)
    const result = await findOrCreateNamed('departments', name, {
      notes: 'Synced from HRMS (department_name)',
    })
    summary.departments[result] += 1
  }
  summary.departments.total = departments.size

  return summary
}
