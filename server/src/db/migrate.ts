import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'ITAssetManagement_2026'

  console.log(`Connecting to MySQL ${host}:${port} as ${user}…`)

  const root = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
    charset: 'utf8mb4',
  })

  await root.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await root.changeUser({ database })

  const dir = path.join(__dirname, 'mysql')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    const applied = await root.query<mysql.RowDataPacket[]>(
      `SELECT id FROM schema_migrations WHERE version = ? OR version = ? LIMIT 1`,
      [version, file.includes('001') ? '001_initial_schema' : file.includes('002') ? '002_uploads_imports' : version],
    ).then(([rows]) => rows.length > 0).catch(() => false)

    // Always re-run 001 with IF NOT EXISTS; for 002+ skip if this exact version recorded
    if (/^\d{3}_/.test(file) && !file.startsWith('001')) {
      const versionName = file.replace(/\.sql$/, '')
      const [rows] = await root.query<mysql.RowDataPacket[]>(
        `SELECT id FROM schema_migrations WHERE version = ? LIMIT 1`,
        [versionName],
      ).catch(() => [[] as mysql.RowDataPacket[]])
      if (rows.length) {
        console.log(`Skipping ${file} (already applied)`)
        continue
      }
    }

    console.log(`Applying ${file}…`)
    let sql = fs.readFileSync(path.join(dir, file), 'utf8')
      .replace(/CREATE DATABASE[\s\S]*?;/i, '')
      .replace(/USE\s+`?[\w]+`?\s*;/gi, '')
    await root.query(sql)
    void applied
  }

  const [tables] = await root.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME as name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [database],
  )
  console.log(`\nDatabase ${database} ready — ${tables.length} tables`)
  await root.end()
  console.log('Migration complete.')
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err.message)
  if (err.code) console.error('Code:', err.code)
  process.exit(1)
})
