import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type SchemaMigrateResult = {
  applied: string[]
  skipped: string[]
  table_count: number
}

export type SchemaMigrationStatus = {
  pending: string[]
  applied: string[]
  total_files: number
}

async function openMigrationConnection() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'ITAssetManagement_2026'

  const root = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
    charset: 'utf8mb4',
  })

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await root.changeUser({ database })

  await root.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      version VARCHAR(191) NOT NULL,
      applied_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_schema_migrations_version (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => undefined)

  return { root, database }
}

function migrationSqlFiles() {
  const dir = path.join(__dirname, '../db/mysql')
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
}

/** List applied vs pending numbered migrations (read-only). */
export async function getSchemaMigrationStatus(): Promise<SchemaMigrationStatus> {
  const { root } = await openMigrationConnection()
  try {
    const files = migrationSqlFiles()
    const pending: string[] = []
    const applied: string[] = []

    for (const file of files) {
      const versionName = file.replace(/\.sql$/, '')
      if (/^\d{3}_/.test(file) && !file.startsWith('001')) {
        const [rows] = await root.query<mysql.RowDataPacket[]>(
          `SELECT id FROM schema_migrations WHERE version = ? LIMIT 1`,
          [versionName],
        ).catch(() => [[] as mysql.RowDataPacket[]])
        if (rows.length) applied.push(versionName)
        else pending.push(versionName)
      }
    }

    return { pending, applied, total_files: files.length }
  } finally {
    await root.end()
  }
}

/** Apply pending SQL files under db/mysql (same logic as CLI migrate). */
export async function runPendingSchemaMigrations(): Promise<SchemaMigrateResult> {
  const { root } = await openMigrationConnection()

  try {
    const files = migrationSqlFiles()
    const applied: string[] = []
    const skipped: string[] = []

    for (const file of files) {
      const versionName = file.replace(/\.sql$/, '')

      if (/^\d{3}_/.test(file) && !file.startsWith('001')) {
        const [rows] = await root.query<mysql.RowDataPacket[]>(
          `SELECT id FROM schema_migrations WHERE version = ? LIMIT 1`,
          [versionName],
        ).catch(() => [[] as mysql.RowDataPacket[]])
        if (rows.length) {
          skipped.push(versionName)
          continue
        }
      }

      let sql = fs.readFileSync(path.join(__dirname, '../db/mysql', file), 'utf8')
        .replace(/CREATE DATABASE[\s\S]*?;/i, '')
        .replace(/USE\s+`?[\w]+`?\s*;/gi, '')
      try {
        await root.query(sql)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const dup =
          /Duplicate column name/i.test(msg)
          || /Duplicate key name/i.test(msg)
          || (typeof (e as { errno?: number }).errno === 'number'
            && ((e as { errno: number }).errno === 1060 || (e as { errno: number }).errno === 1061))
        if (!dup) throw e
        console.warn(`[schemaMigrate] ${versionName}: treating as applied (${msg})`)
      }
      await root.query(
        `INSERT IGNORE INTO schema_migrations (version) VALUES (?)`,
        [versionName],
      ).catch(() => undefined)
      applied.push(versionName)
    }

    const database = process.env.DB_NAME || 'ITAssetManagement_2026'
    const [tables] = await root.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [database],
    )

    return { applied, skipped, table_count: tables.length }
  } finally {
    await root.end()
  }
}
