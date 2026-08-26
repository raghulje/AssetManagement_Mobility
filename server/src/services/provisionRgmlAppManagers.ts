import bcrypt from 'bcryptjs'
import { all, get, run, now } from '../db/index.js'
import { ensureDefaultRoles, getUserGroupIds, setUserGroups } from './permissions.js'

export const RGML_COMPANY = 'Refex Green Mobility Limited'
export const DEFAULT_APP_MANAGER_PASSWORD = 'Welcome@2026'
export const APP_MANAGERS_ROLE = 'App Managers'

export type ProvisionResult = {
  company: string
  role: string
  candidates: number
  created: number
  updated: number
  skipped: number
  errors: { employee_code: string; reason: string }[]
  created_users: { id: number; email: string; employee_num: string }[]
}

type EmpRow = {
  id: number
  employee_code: string
  first_name: string
  last_name: string
  email: string | null
  mobile: string | null
  work_mobile: string | null
  designation: string | null
  refex_company_name: string | null
}

function sanitizeUsername(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 90)
  return s || `user${Date.now()}`
}

async function uniqueUsername(preferred: string): Promise<string> {
  let base = sanitizeUsername(preferred)
  let candidate = base
  let n = 0
  while (true) {
    const exists = await get<{ id: number }>(
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [candidate],
    )
    if (!exists) return candidate
    n += 1
    candidate = `${base}.${n}`.slice(0, 100)
  }
}

async function resolveCompanyId(companyName: string): Promise<number | null> {
  const exact = await get<{ id: number }>(
    `SELECT id FROM companies WHERE deleted_at IS NULL AND name = ? LIMIT 1`,
    [companyName],
  )
  if (exact) return Number(exact.id)
  const like = await get<{ id: number }>(
    `SELECT id FROM companies WHERE deleted_at IS NULL AND name LIKE ? LIMIT 1`,
    [`%${companyName}%`],
  )
  return like ? Number(like.id) : null
}

async function ensureAppManagersGroup(userId: number, roleId: number) {
  const current = await getUserGroupIds(userId)
  if (current.includes(roleId)) {
    // Re-sync perms in case role was updated
    await setUserGroups(userId, current)
    return false
  }
  await setUserGroups(userId, [...current, roleId])
  return true
}

/**
 * Create / update App Users for active employees of Refex Green Mobility Limited
 * with the App Managers role and default password (first login must change).
 */
export async function provisionRgmlAppManagers(opts?: {
  company?: string
  password?: string
}): Promise<ProvisionResult> {
  await ensureDefaultRoles()

  const company = String(opts?.company || RGML_COMPANY).trim()
  const plainPassword = String(opts?.password || DEFAULT_APP_MANAGER_PASSWORD)
  const passwordHash = bcrypt.hashSync(plainPassword, 10)

  const role = await get<{ id: number }>(
    `SELECT id FROM permission_groups WHERE name = ? LIMIT 1`,
    [APP_MANAGERS_ROLE],
  )
  if (!role) throw new Error(`Role "${APP_MANAGERS_ROLE}" not found — run role seed / migrations first`)

  const companyId = await resolveCompanyId(company)
  const ts = now()

  const employees = await all<EmpRow>(`
    SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile, designation, refex_company_name
    FROM employees
    WHERE deleted_at IS NULL
      AND (
        refex_company_name = ?
        OR TRIM(refex_company_name) = ?
        OR refex_company_name LIKE ?
      )
      AND (employment_status_description = 'Active' OR employment_status = '1')
    ORDER BY employee_code ASC
  `, [company, company, `%${company}%`])

  const result: ProvisionResult = {
    company,
    role: APP_MANAGERS_ROLE,
    candidates: employees.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    created_users: [],
  }

  for (const emp of employees) {
    const code = String(emp.employee_code || '').trim()
    const email = String(emp.email || '').trim().toLowerCase()
    if (!email) {
      result.skipped += 1
      result.errors.push({ employee_code: code || String(emp.id), reason: 'Missing email' })
      continue
    }
    if (!code) {
      result.skipped += 1
      result.errors.push({ employee_code: String(emp.id), reason: 'Missing employee code' })
      continue
    }

    const first = String(emp.first_name || '').trim() || 'User'
    const last = String(emp.last_name || '').trim() || code
    const phone = String(emp.mobile || emp.work_mobile || '').trim() || null
    const jobtitle = String(emp.designation || '').trim() || null

    try {
      // Match existing by employee_num, then email
      let existing = await get<{ id: number; email: string | null; employee_num: string | null }>(`
        SELECT id, email, employee_num FROM users
        WHERE deleted_at IS NULL AND employee_num = ?
        LIMIT 1
      `, [code])
      if (!existing) {
        existing = await get<{ id: number; email: string | null; employee_num: string | null }>(`
          SELECT id, email, employee_num FROM users
          WHERE deleted_at IS NULL AND LOWER(email) = ?
          LIMIT 1
        `, [email])
      }

      if (existing) {
        await run(`
          UPDATE users SET
            first_name = ?,
            last_name = ?,
            email = ?,
            employee_num = COALESCE(employee_num, ?),
            phone = COALESCE(?, phone),
            jobtitle = COALESCE(?, jobtitle),
            company_id = COALESCE(company_id, ?),
            activated = 1,
            updated_at = ?
          WHERE id = ?
        `, [
          first, last, email, code, phone, jobtitle, companyId, ts, existing.id,
        ])
        const roleAdded = await ensureAppManagersGroup(Number(existing.id), Number(role.id))
        if (roleAdded) result.updated += 1
        else result.updated += 1 // still count profile refresh
        continue
      }

      const username = await uniqueUsername(code)
      const info = await run(`
        INSERT INTO users (
          first_name, last_name, username, email, password, employee_num,
          company_id, jobtitle, phone, activated, must_change_password, permissions, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, '{}', ?, ?, ?)
      `, [
        first,
        last,
        username,
        email,
        passwordHash,
        code,
        companyId,
        jobtitle,
        phone,
        `Provisioned from HRMS (${company})`,
        ts,
        ts,
      ])
      const userId = Number(info.insertId)
      await setUserGroups(userId, [Number(role.id)])
      result.created += 1
      result.created_users.push({ id: userId, email, employee_num: code })
    } catch (e) {
      result.errors.push({
        employee_code: code,
        reason: e instanceof Error ? e.message : 'Provision failed',
      })
      result.skipped += 1
    }
  }

  return result
}
