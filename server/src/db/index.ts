import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

export type Row = Record<string, unknown>

let pool: Pool | null = null

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ITAssetManagement_2026',
      waitForConnections: true,
      connectionLimit: 20,
      namedPlaceholders: false,
      timezone: 'Z',
      dateStrings: true,
      charset: 'utf8mb4',
    })
  }
  return pool
}

export function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export async function all<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  // query() (not execute) so LIMIT/OFFSET placeholders work with mysql2
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params)
  return rows as unknown as T[]
}

export async function get<T = Row>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params)
  return rows[0]
}

export async function run(sql: string, params: any[] = []) {
  const [result] = await getPool().query<ResultSetHeader>(sql, params)
  return {
    insertId: Number(result.insertId),
    affectedRows: result.affectedRows,
    lastInsertRowid: Number(result.insertId),
    changes: result.affectedRows,
  }
}

export async function exec(sql: string) {
  await getPool().query(sql)
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

/** Safe LIMIT/OFFSET clause (integers only — avoids mysql2 prepared-stmt LIMIT issues) */
export function limitSql(limit = 50, offset = 0) {
  const l = Math.min(Math.max(Number(limit) || 50, 0), 500)
  const o = Math.max(Number(offset) || 0, 0)
  return `LIMIT ${l} OFFSET ${o}`
}

export async function paginate(sql: string, params: any[], limit = 50, offset = 0) {
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const total = Number(totalRow?.c || 0)
  const rows = await all(`${sql} ${limitSql(limit, offset)}`, params)
  return { total, rows }
}

/** @deprecated sync API removed — use all/get/run */
export const db = {
  all,
  get,
  run,
  exec,
}
