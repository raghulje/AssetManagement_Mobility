import bcrypt from 'bcryptjs'
import { get, now, run, withTransaction } from './index.js'
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise'

async function connRun(conn: PoolConnection, sql: string, params: any[] = []) {
  const [result] = await conn.execute<ResultSetHeader>(sql, params)
  return result
}

/** Ensure login user exists (idempotent). */
export async function ensureLoginUser() {
  const email = 'raghul.je@refex.co.in'
  const username = 'raghul.je'
  const password = 'RefexAdmin@'
  const hash = bcrypt.hashSync(password, 10)
  const adminPerms = JSON.stringify({ superuser: '1', admin: '1' })
  const ts = now()

  const existing = await get<{ id: number }>(
    'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
    [email, username],
  )

  if (existing?.id) {
    await run(
      `UPDATE users SET password = ?, permissions = ?, activated = 1, first_name = ?, last_name = ?,
       email = ?, username = ?, updated_at = ? WHERE id = ?`,
      [hash, adminPerms, 'Raghul', 'JE', email, username, ts, existing.id],
    )
    console.log(`Updated login user: ${email}`)
    return existing.id
  }

  const result = await run(
    `INSERT INTO users (first_name, last_name, username, email, password, employee_num, activated, permissions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ['Raghul', 'JE', username, email, hash, 'E0001', adminPerms, ts, ts],
  )
  const userId = Number(result.insertId)
  console.log(`Created login user: ${email}`)
  return userId
}

/** Minimal bootstrap — Refex Mobility admin + default status labels */
export async function seed() {
  const existing = await get<{ c: number }>('SELECT COUNT(*) as c FROM users')
  if (Number(existing?.c || 0) === 0) {
    const ts = now()
    const adminPerms = JSON.stringify({ superuser: '1', admin: '1' })

    await withTransaction(async (conn) => {
      await connRun(conn, `INSERT INTO settings (id, site_name, full_multiple_companies_support, default_currency, created_at, updated_at)
        VALUES (1, 'Refex Mobility', 1, 'INR', ?, ?)`, [ts, ts])

      await connRun(conn, `INSERT INTO status_labels (id, name, type, color, default_label, created_at, updated_at) VALUES
        (1, 'In Stock', 'deployable', '#00a65a', 1, ?, ?),
        (2, 'Pending', 'pending', '#f39c12', 0, ?, ?),
        (3, 'Out for Repair', 'pending', '#f39c12', 0, ?, ?),
        (4, 'Broken', 'undeployable', '#dd4b39', 0, ?, ?),
        (5, 'Archived', 'archived', '#777777', 0, ?, ?)`, Array(10).fill(ts))

      await connRun(conn, `INSERT INTO permission_groups (id, name, permissions, created_at, updated_at) VALUES
        (1, 'Superusers', ?, ?, ?)`, [adminPerms, ts, ts])
    })

    console.log('Seeded Refex Mobility bootstrap settings')
  } else {
    console.log('Database already seeded')
    await run(`UPDATE settings SET site_name = 'Refex Mobility', default_currency = 'INR' WHERE id = 1`).catch(() => undefined)
  }

  const userId = await ensureLoginUser()

  try {
    const group = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = 'Superusers' LIMIT 1`)
    if (group?.id) {
      await run(`INSERT IGNORE INTO users_groups (user_id, group_id) VALUES (?, ?)`, [userId, group.id])
    }
  } catch {
    // ignore
  }

  try {
    const { ensureDefaultRoles } = await import('../services/permissions.js')
    await ensureDefaultRoles()
  } catch {
    // roles filled on boot
  }

  console.log('Login: raghul.je@refex.co.in / RefexAdmin@')
}

const isDirect = process.argv[1]?.includes('seed')
if (isDirect) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
