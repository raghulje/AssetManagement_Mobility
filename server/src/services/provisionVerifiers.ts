import bcrypt from 'bcryptjs'
import { get, run, now } from '../db/index.js'
import { ensureDefaultRoles, getUserGroupIds, setUserGroups } from './permissions.js'
import { DEFAULT_APP_MANAGER_PASSWORD } from './provisionRgmlAppManagers.js'

export const VERIFIERS_ROLE = 'Verifiers'

/** Default verifier App Users (mapped on boot / Settings provision). */
export const DEFAULT_VERIFIER_EMAILS = [
  'akash.c@refex.co.in',
  'rohan.garg@refex.co.in',
  'meet.g@refex.co.in',
  'sasi.a@refex.co.in',
  'pasupathinath.r@refex.co.in',
  'anirudh.arun@refex.co.in',
] as const

export type ProvisionVerifiersResult = {
  role: string
  candidates: number
  created: number
  updated: number
  skipped: number
  errors: { email: string; reason: string }[]
  mapped: { id: number; email: string; created: boolean }[]
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

async function resolveCompanyId(companyName: string | null | undefined): Promise<number | null> {
  const name = String(companyName || '').trim()
  if (!name) return null
  const exact = await get<{ id: number }>(
    `SELECT id FROM companies WHERE deleted_at IS NULL AND name = ? LIMIT 1`,
    [name],
  )
  if (exact) return Number(exact.id)
  const like = await get<{ id: number }>(
    `SELECT id FROM companies WHERE deleted_at IS NULL AND name LIKE ? LIMIT 1`,
    [`%${name}%`],
  )
  return like ? Number(like.id) : null
}

async function ensureVerifiersGroup(userId: number, roleId: number) {
  const current = await getUserGroupIds(userId)
  if (current.includes(roleId)) {
    await setUserGroups(userId, current)
    return false
  }
  await setUserGroups(userId, [...current, roleId])
  return true
}

function nameFromEmail(email: string): { first: string; last: string; usernameHint: string } {
  const local = email.split('@')[0] || 'user'
  const parts = local.split(/[._-]+/).filter(Boolean)
  const first = (parts[0] || 'User').replace(/^\w/, (c) => c.toUpperCase())
  const last = parts.length > 1
    ? parts.slice(1).map((p) => p.replace(/^\w/, (c) => c.toUpperCase())).join(' ')
    : 'Verifier'
  return { first, last, usernameHint: local }
}

/**
 * Ensure App Users for the given emails exist, are activated, and belong to Verifiers
 * (keeps any other roles such as App Managers).
 */
export async function provisionVerifiers(opts?: {
  emails?: string[]
  password?: string
}): Promise<ProvisionVerifiersResult> {
  await ensureDefaultRoles()

  const emails = (opts?.emails?.length ? opts.emails : [...DEFAULT_VERIFIER_EMAILS])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter((e) => e.includes('@'))

  const role = await get<{ id: number }>(
    `SELECT id FROM permission_groups WHERE name = ? LIMIT 1`,
    [VERIFIERS_ROLE],
  )
  if (!role) throw new Error(`Role "${VERIFIERS_ROLE}" not found — restart server to seed roles`)

  const plainPassword = String(opts?.password || DEFAULT_APP_MANAGER_PASSWORD)
  const passwordHash = bcrypt.hashSync(plainPassword, 10)
  const ts = now()
  const roleId = Number(role.id)

  const result: ProvisionVerifiersResult = {
    role: VERIFIERS_ROLE,
    candidates: emails.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    mapped: [],
  }

  for (const email of emails) {
    try {
      const emp = await get<EmpRow>(`
        SELECT id, employee_code, first_name, last_name, email, mobile, work_mobile, designation, refex_company_name
        FROM employees
        WHERE deleted_at IS NULL AND LOWER(TRIM(email)) = ?
        ORDER BY id DESC
        LIMIT 1
      `, [email])

      let existing = await get<{ id: number }>(`
        SELECT id FROM users WHERE deleted_at IS NULL AND LOWER(email) = ? LIMIT 1
      `, [email])

      if (!existing && emp?.employee_code) {
        existing = await get<{ id: number }>(`
          SELECT id FROM users WHERE deleted_at IS NULL AND employee_num = ? LIMIT 1
        `, [String(emp.employee_code).trim()])
      }

      if (existing) {
        const first = String(emp?.first_name || '').trim() || nameFromEmail(email).first
        const last = String(emp?.last_name || '').trim() || nameFromEmail(email).last
        const code = emp?.employee_code ? String(emp.employee_code).trim() : null
        const phone = String(emp?.mobile || emp?.work_mobile || '').trim() || null
        const jobtitle = String(emp?.designation || '').trim() || null
        const companyId = await resolveCompanyId(emp?.refex_company_name)

        await run(`
          UPDATE users SET
            first_name = COALESCE(NULLIF(?, ''), first_name),
            last_name = COALESCE(NULLIF(?, ''), last_name),
            email = ?,
            employee_num = COALESCE(employee_num, ?),
            phone = COALESCE(?, phone),
            jobtitle = COALESCE(?, jobtitle),
            company_id = COALESCE(company_id, ?),
            activated = 1,
            updated_at = ?
          WHERE id = ?
        `, [first, last, email, code, phone, jobtitle, companyId, ts, existing.id])

        await ensureVerifiersGroup(Number(existing.id), roleId)
        result.updated += 1
        result.mapped.push({ id: Number(existing.id), email, created: false })
        continue
      }

      const fromEmail = nameFromEmail(email)
      const first = String(emp?.first_name || '').trim() || fromEmail.first
      const last = String(emp?.last_name || '').trim() || fromEmail.last
      const code = emp?.employee_code ? String(emp.employee_code).trim() : null
      const phone = String(emp?.mobile || emp?.work_mobile || '').trim() || null
      const jobtitle = String(emp?.designation || '').trim() || null
      const companyId = await resolveCompanyId(emp?.refex_company_name)
      const username = await uniqueUsername(code || fromEmail.usernameHint)

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
        'Provisioned as Verifier (form registration)',
        ts,
        ts,
      ])
      const userId = Number(info.insertId)
      await setUserGroups(userId, [roleId])
      result.created += 1
      result.mapped.push({ id: userId, email, created: true })
    } catch (e) {
      result.skipped += 1
      result.errors.push({
        email,
        reason: e instanceof Error ? e.message : 'Provision failed',
      })
    }
  }

  return result
}

/** Idempotent boot hook — map default verifier emails without failing startup. */
export async function ensureDefaultVerifiers(): Promise<void> {
  try {
    await provisionVerifiers()
  } catch (e) {
    console.warn('[verifiers] ensureDefaultVerifiers failed:', e instanceof Error ? e.message : e)
  }
}
