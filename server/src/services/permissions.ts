import type { NextFunction, Request, Response } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail } from '../utils/response.js'

export const MODULES = [
  'vehicles',
  'drivers',
  'masters',
  'assets',
  'licenses',
  'accessories',
  'consumables',
  'components',
  'people',
  'reports',
  'settings',
  'maintenance',
] as const

export type ModuleKey = (typeof MODULES)[number]

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'checkout', 'verify'] as const
export type ActionKey = (typeof ACTIONS)[number]

/** Actions that apply per module (checkout only for inventory-like modules). */
export const MODULE_ACTIONS: Record<ModuleKey, ActionKey[]> = {
  vehicles: ['view', 'create', 'edit', 'delete', 'checkout', 'verify'],
  drivers: ['view', 'create', 'edit', 'delete'],
  masters: ['view', 'create', 'edit', 'delete'],
  assets: ['view', 'create', 'edit', 'delete', 'checkout'],
  licenses: ['view', 'create', 'edit', 'delete', 'checkout'],
  accessories: ['view', 'create', 'edit', 'delete', 'checkout'],
  consumables: ['view', 'create', 'edit', 'delete', 'checkout'],
  components: ['view', 'create', 'edit', 'delete', 'checkout'],
  people: ['view', 'create', 'edit', 'delete'],
  reports: ['view'],
  settings: ['view', 'edit'],
  maintenance: ['view', 'create', 'edit', 'delete'],
}

/** Fleet modules shown in Mobility sidebar (Vehicles / Drivers / Masters). */
export const MOBILITY_MODULES = ['vehicles', 'drivers', 'masters'] as const

export function mobilityFullPerms(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mod of MOBILITY_MODULES) {
    for (const act of MODULE_ACTIONS[mod]) {
      // Form verify/deregister is Verifiers-only (not App Managers / Fleet Ops by default)
      if (act === 'verify') continue
      out[`${mod}.${act}`] = '1'
    }
  }
  return out
}

export function mobilityViewPerms(): Record<string, string> {
  return {
    'vehicles.view': '1',
    'drivers.view': '1',
    'masters.view': '1',
  }
}

export function permissionCatalog() {
  const keys: { key: string; module: string; action: string; label: string }[] = []
  for (const mod of MODULES) {
    for (const act of MODULE_ACTIONS[mod]) {
      keys.push({
        key: `${mod}.${act}`,
        module: mod,
        action: act,
        label: `${mod} ${act}`,
      })
    }
  }
  keys.push({ key: 'notify.ops', module: 'notify', action: 'ops', label: 'Receive ops email alerts' })
  return keys
}

export function allModulePerms(opts?: { notifyOps?: boolean; includeCheckout?: boolean }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mod of MODULES) {
    for (const act of MODULE_ACTIONS[mod]) {
      if (!opts?.includeCheckout && act === 'checkout') continue
      // Form verification stays on the Verifiers role (admins still bypass via admin flag)
      if (act === 'verify') continue
      out[`${mod}.${act}`] = '1'
    }
  }
  // Always include checkout for inventory + fleet assign/unassign when full access
  if (opts?.includeCheckout !== false) {
    for (const mod of ['vehicles', 'assets', 'licenses', 'accessories', 'consumables', 'components'] as ModuleKey[]) {
      out[`${mod}.checkout`] = '1'
    }
  }
  if (opts?.notifyOps) out['notify.ops'] = '1'
  return out
}

export function viewerPerms(): Record<string, string> {
  const out: Record<string, string> = { ...mobilityViewPerms() }
  for (const mod of ['assets', 'licenses', 'accessories', 'consumables', 'components', 'people', 'reports', 'maintenance'] as ModuleKey[]) {
    out[`${mod}.view`] = '1'
  }
  return out
}

export function appManagerPerms(): Record<string, string> {
  // Vehicles, Drivers, Masters only — no people/reports/settings/admin
  return mobilityFullPerms()
}

export function itAssetManagerPerms(): Record<string, string> {
  // Full module access including settings.edit (print labels, masters, import)
  // Settings / Reports nav stay Admin-only via client isAdmin flag.
  return allModulePerms({ notifyOps: true })
}

export function parsePerms(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

export function isTruthyPerm(v: unknown): boolean {
  return v === '1' || v === 1 || v === true || v === 'true'
}

export function hasPermission(perms: Record<string, unknown> | null | undefined, permission: string): boolean {
  const p = perms || {}
  if (isTruthyPerm(p.superuser)) return true
  // Form verify/deregister: Verifiers role only (Admin does not auto-bypass)
  if (permission === 'vehicles.verify') {
    return isTruthyPerm(p[permission])
  }
  if (isTruthyPerm(p.admin)) return true
  if (isTruthyPerm(p[permission])) return true
  return false
}

export function mergePermissions(...sets: Record<string, unknown>[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const set of sets) {
    for (const [k, v] of Object.entries(set || {})) {
      if (isTruthyPerm(v)) out[k] = '1'
    }
  }
  return out
}

export async function getUserGroupIds(userId: number): Promise<number[]> {
  const rows = await all<{ group_id: number }>(
    `SELECT group_id FROM users_groups WHERE user_id = ?`,
    [userId],
  )
  return rows.map((r) => Number(r.group_id))
}

export async function syncUserPermissions(userId: number, extra?: Record<string, unknown>) {
  const groups = await all<{ permissions: unknown }>(`
    SELECT g.permissions
    FROM permission_groups g
    INNER JOIN users_groups ug ON ug.group_id = g.id
    WHERE ug.user_id = ?
  `, [userId])
  const merged = mergePermissions(
    ...groups.map((g) => parsePerms(g.permissions)),
    extra || {},
  )
  await run(`UPDATE users SET permissions = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(merged),
    now(),
    userId,
  ])
  return merged
}

export async function setUserGroups(userId: number, groupIds: number[]) {
  await run(`DELETE FROM users_groups WHERE user_id = ?`, [userId])
  const unique = [...new Set(groupIds.map(Number).filter((n) => n > 0))]
  for (const gid of unique) {
    await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [userId, gid])
  }
  // Preserve superuser/admin flags if already on user
  const row = await get<{ permissions: unknown }>(`SELECT permissions FROM users WHERE id = ?`, [userId])
  const existing = parsePerms(row?.permissions)
  const extras: Record<string, string> = {}
  if (isTruthyPerm(existing.superuser)) extras.superuser = '1'
  if (isTruthyPerm(existing.admin)) extras.admin = '1'
  return syncUserPermissions(userId, extras)
}

async function grantMissingPermsToRole(
  roleName: string,
  grant: Record<string, string>,
  ts: string,
) {
  const row = await get<{ id: number; permissions: unknown }>(
    `SELECT id, permissions FROM permission_groups WHERE name = ? LIMIT 1`,
    [roleName],
  )
  if (!row) return
  const p = parsePerms(row.permissions)
  let changed = false
  for (const [k, v] of Object.entries(grant)) {
    if (!isTruthyPerm(p[k])) {
      p[k] = v
      changed = true
    }
  }
  if (!changed) return
  await run(`UPDATE permission_groups SET permissions = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(mergePermissions(p)),
    ts,
    row.id,
  ])
  const members = await all<{ user_id: number }>(
    `SELECT user_id FROM users_groups WHERE group_id = ?`,
    [row.id],
  )
  for (const m of members) {
    await syncUserPermissions(Number(m.user_id))
  }
}

export async function ensureDefaultRoles() {
  const ts = now()
  const defaults: { name: string; permissions: Record<string, string> }[] = [
    { name: 'Superusers', permissions: { superuser: '1', admin: '1', ...allModulePerms({ notifyOps: true }) } },
    { name: 'Admin', permissions: { admin: '1', ...allModulePerms({ notifyOps: true }) } },
    { name: 'Fleet Ops', permissions: itAssetManagerPerms() },
    { name: 'Viewer', permissions: viewerPerms() },
    { name: 'App Managers', permissions: appManagerPerms() },
    { name: 'Verifiers', permissions: { 'vehicles.view': '1', 'vehicles.verify': '1' } },
  ]

  // Soft rename legacy IT Asset Manager → Fleet Ops (Mobility)
  const legacyItam = await get<{ id: number }>(
    `SELECT id FROM permission_groups WHERE name = 'IT Asset Manager' LIMIT 1`,
  )
  const fleetOpsExisting = await get<{ id: number }>(
    `SELECT id FROM permission_groups WHERE name = 'Fleet Ops' LIMIT 1`,
  )
  if (legacyItam && !fleetOpsExisting) {
    await run(`UPDATE permission_groups SET name = 'Fleet Ops', updated_at = ? WHERE id = ?`, [
      ts,
      legacyItam.id,
    ])
  }

  for (const d of defaults) {
    const existing = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = ?`, [d.name])
    // Only seed missing roles — never overwrite admin customizations from Settings → Roles
    if (!existing) {
      await run(
        `INSERT INTO permission_groups (name, permissions, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        [d.name, JSON.stringify(d.permissions), ts, ts],
      )
    }
  }

  // Soft migrate built-in roles that predate Mobility module keys
  await grantMissingPermsToRole('Superusers', { ...mobilityFullPerms(), 'vehicles.checkout': '1' }, ts)
  await grantMissingPermsToRole('Admin', { ...mobilityFullPerms(), 'vehicles.checkout': '1' }, ts)
  await grantMissingPermsToRole('Fleet Ops', { ...mobilityFullPerms(), 'settings.view': '1', 'settings.edit': '1', 'vehicles.checkout': '1' }, ts)
  await grantMissingPermsToRole('IT Asset Manager', { ...mobilityFullPerms(), 'settings.view': '1', 'settings.edit': '1', 'vehicles.checkout': '1' }, ts)
  await grantMissingPermsToRole('Viewer', mobilityViewPerms(), ts)
  await grantMissingPermsToRole('App Managers', { ...mobilityFullPerms(), 'vehicles.checkout': '1' }, ts)
  await grantMissingPermsToRole('Verifiers', { 'vehicles.view': '1', 'vehicles.verify': '1' }, ts)

  // Any role that can edit vehicles should be able to assign/unassign
  const editRoles = await all<{ id: number; permissions: unknown }>(`
    SELECT id, permissions FROM permission_groups
  `)
  for (const role of editRoles) {
    const p = parsePerms(role.permissions)
    if (isTruthyPerm(p['vehicles.edit']) && !isTruthyPerm(p['vehicles.checkout'])) {
      p['vehicles.checkout'] = '1'
      await run(`UPDATE permission_groups SET permissions = ?, updated_at = ? WHERE id = ?`, [
        JSON.stringify(mergePermissions(p)),
        ts,
        role.id,
      ])
      const members = await all<{ user_id: number }>(
        `SELECT user_id FROM users_groups WHERE group_id = ?`,
        [role.id],
      )
      for (const m of members) {
        await syncUserPermissions(Number(m.user_id))
      }
    }
  }

  const su = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = 'Superusers' LIMIT 1`)
  const adminGroup = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = 'Admin' LIMIT 1`)

  // Ensure primary admin user is in Superusers
  const admin = await get<{ id: number }>(
    `SELECT id FROM users WHERE email = 'admin@refex.com' AND deleted_at IS NULL LIMIT 1`,
  )
  if (admin && su) {
    const link = await get(`SELECT user_id FROM users_groups WHERE user_id = ? AND group_id = ?`, [admin.id, su.id])
    if (!link) {
      await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [admin.id, su.id])
    }
    await syncUserPermissions(admin.id, { superuser: '1', admin: '1' })
  }

  // Soft migration: activated users with empty permissions → Admin (keeps existing demos working)
  if (adminGroup) {
    const emptyUsers = await all<{ id: number; permissions: unknown }>(`
      SELECT id, permissions FROM users
      WHERE deleted_at IS NULL AND activated = 1
    `)
    for (const u of emptyUsers) {
      const p = parsePerms(u.permissions)
      if (Object.keys(p).length === 0) {
        const link = await get(`SELECT user_id FROM users_groups WHERE user_id = ? AND group_id = ?`, [u.id, adminGroup.id])
        if (!link) {
          await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [u.id, adminGroup.id])
        }
        await syncUserPermissions(u.id)
      } else if (isTruthyPerm(p.superuser) && su) {
        const link = await get(`SELECT user_id FROM users_groups WHERE user_id = ? AND group_id = ?`, [u.id, su.id])
        if (!link) {
          await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [u.id, su.id])
        }
        await syncUserPermissions(u.id, { superuser: '1', admin: '1' })
      }
    }
  }
}

/** Infer module action from HTTP method + path for a resource router. */
export function moduleGate(module: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = `${req.baseUrl}${req.path}` || req.path || ''
    let action: ActionKey = 'view'
    if (req.method === 'GET' || req.method === 'HEAD') {
      action = 'view'
    } else if (req.method === 'DELETE') {
      action = 'delete'
    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      action = 'edit'
    } else if (req.method === 'POST') {
      if (/\/(checkout|checkin|replace|checkinbytag)\b/i.test(path) || /\/(checkout|checkin|replace)\b/i.test(req.path)) {
        action = 'checkout'
      } else if (/\/(verify|deverify)\b/i.test(path) || /\/(verify|deverify)\b/i.test(req.path)) {
        action = 'verify'
      } else if (/\/(complete|audit)\b/i.test(req.path)) {
        action = 'edit'
      } else if (/\/labels\b/i.test(path) || /\/labels\b/i.test(req.baseUrl || '')) {
        // Print label is not "create asset" — allow with view or edit
        action = 'view'
      } else {
        action = 'create'
      }
    }
    // Form deregister is Verifiers-only (not vehicles.delete)
    if (req.method === 'DELETE' && /form-registration\b/i.test(path)) {
      action = 'verify'
    }
    const permission = `${module}.${action}`
    const perms = req.user?.permissions || {}
    if (hasPermission(perms, permission)) return next()
    // Fleet assign/unassign: accept vehicles.edit until roles are re-synced with vehicles.checkout
    if (module === 'vehicles' && action === 'checkout' && hasPermission(perms, 'vehicles.edit')) {
      return next()
    }
    return fail(res, `Forbidden: missing ${permission}`, 403)
  }
}

export function requirePerm(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasPermission(req.user?.permissions, permission)) return next()
    return fail(res, `Forbidden: missing ${permission}`, 403)
  }
}

/** Activated users who belong to a named permission group (e.g. Fleet Ops). */
export async function listRoleRecipientEmails(roleName: string): Promise<string[]> {
  const rows = await all<{ email: string | null }>(`
    SELECT DISTINCT u.email
    FROM users u
    INNER JOIN users_groups ug ON ug.user_id = u.id
    INNER JOIN permission_groups g ON g.id = ug.group_id
    WHERE u.deleted_at IS NULL AND u.activated = 1
      AND u.email IS NOT NULL AND u.email != ''
      AND g.name = ?
  `, [roleName])
  const emails = new Set<string>()
  for (const r of rows) {
    const e = String(r.email || '').trim().toLowerCase()
    if (e && e.includes('@')) emails.add(e)
  }
  return [...emails]
}

export async function listOpsRecipientEmails(): Promise<string[]> {
  const rows = await all<{ email: string | null }>(`
    SELECT DISTINCT u.email
    FROM users u
    WHERE u.deleted_at IS NULL AND u.activated = 1 AND u.email IS NOT NULL AND u.email != ''
      AND (
        u.permissions LIKE '%"notify.ops"%'
        OR u.permissions LIKE '%"superuser"%'
        OR u.permissions LIKE '%"admin"%'
      )
  `)
  const emails = new Set<string>()
  for (const r of rows) {
    const e = String(r.email || '').trim().toLowerCase()
    if (e && e.includes('@')) emails.add(e)
  }
  // Also pull from groups with notify.ops in case user.permissions not yet synced
  const groupUsers = await all<{ email: string | null }>(`
    SELECT DISTINCT u.email
    FROM users u
    INNER JOIN users_groups ug ON ug.user_id = u.id
    INNER JOIN permission_groups g ON g.id = ug.group_id
    WHERE u.deleted_at IS NULL AND u.activated = 1
      AND u.email IS NOT NULL AND u.email != ''
      AND (
        CAST(g.permissions AS CHAR) LIKE '%"notify.ops"%'
        OR CAST(g.permissions AS CHAR) LIKE '%"superuser"%'
        OR CAST(g.permissions AS CHAR) LIKE '%"admin"%'
      )
  `)
  for (const r of groupUsers) {
    const e = String(r.email || '').trim().toLowerCase()
    if (e && e.includes('@')) emails.add(e)
  }
  return [...emails]
}
