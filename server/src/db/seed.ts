import bcrypt from 'bcryptjs'
import { get, now, withTransaction } from './index.js'
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise'

async function connRun(conn: PoolConnection, sql: string, params: any[] = []) {
  const [result] = await conn.execute<ResultSetHeader>(sql, params)
  return result
}

/** Minimal bootstrap only — no SNIPE / Acme / Jane Doe demo inventory */
export async function seed() {
  const existing = await get<{ c: number }>('SELECT COUNT(*) as c FROM users')
  if (Number(existing?.c || 0) > 0) {
    console.log('Database already seeded')
    return
  }

  const ts = now()
  const hash = bcrypt.hashSync('Welcome@2026', 10)
  const adminPerms = JSON.stringify({ superuser: '1', admin: '1' })

  await withTransaction(async (conn) => {
    await connRun(conn, `INSERT INTO settings (id, site_name, full_multiple_companies_support, default_currency, created_at, updated_at)
      VALUES (1, 'Refex', 1, 'INR', ?, ?)`, [ts, ts])

    await connRun(conn, `INSERT INTO status_labels (id, name, type, color, default_label, created_at, updated_at) VALUES
      (1, 'In Stock', 'deployable', '#00a65a', 1, ?, ?),
      (2, 'Pending', 'pending', '#f39c12', 0, ?, ?),
      (3, 'Out for Repair', 'pending', '#f39c12', 0, ?, ?),
      (4, 'Broken', 'undeployable', '#dd4b39', 0, ?, ?),
      (5, 'Archived', 'archived', '#777777', 0, ?, ?)`, Array(10).fill(ts))

    await connRun(conn, `INSERT INTO users (id, first_name, last_name, username, email, password, employee_num, company_id, location_id, department_id, activated, permissions, created_at, updated_at) VALUES
      (1, 'Admin', 'User', 'admin', 'admin@refex.com', ?, 'E0001', NULL, NULL, NULL, 1, ?, ?, ?)`, [
      hash, adminPerms, ts, ts,
    ])

    await connRun(conn, `INSERT INTO permission_groups (id, name, permissions, created_at, updated_at) VALUES
      (1, 'Superusers', ?, ?, ?)`, [adminPerms, ts, ts])
    await connRun(conn, `INSERT INTO users_groups (user_id, group_id) VALUES (1, 1)`)
  })

  try {
    const { ensureDefaultRoles } = await import('../services/permissions.js')
    await ensureDefaultRoles()
  } catch {
    // roles filled on boot
  }

  console.log('Seeded Refex bootstrap (admin only, no demo inventory)')
  console.log('Login: admin@refex.com / Welcome@2026')
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
