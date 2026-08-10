import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { transformUser, transformAsset } from '../services/transformers.js'
import { logAction } from '../services/actionLog.js'
import { makeCrudRouter, selectlist } from '../utils/crud.js'
import { nest } from '../utils/response.js'

export const usersRouter = Router()

usersRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `SELECT id FROM users WHERE deleted_at IS NULL`
  const params: unknown[] = []
  if (req.query.deleted === 'true' || req.query.status === 'deleted') {
    sql = `SELECT id FROM users WHERE deleted_at IS NOT NULL`
  }
  if (req.query.activated === '1') sql += ' AND activated = 1'
  if (req.query.activated === '0') sql += ' AND activated = 0'
  if (req.query.superadmins === 'true') sql += ` AND permissions LIKE '%superuser%'`
  if (req.query.admins === 'true') sql += ` AND (permissions LIKE '%"admin"%' OR permissions LIKE '%superuser%')`
  if (q) {
    sql += ` AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)`
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  sql += ' ORDER BY id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const includeDeleted = req.query.deleted === 'true' || req.query.status === 'deleted'
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const total = Number(totalRow?.c || 0)
  const ids = await all<{ id: number }>(`${sql} ${limitSql(limit, offset)}`, params)
  const rows = (await Promise.all(ids.map((r) => transformUser(r.id, { includeDeleted })))).filter(Boolean)
  return okList(res, rows, total)
})

usersRouter.get('/selectlist', selectlist('users', `CONCAT(first_name, ' ', last_name)`))

usersRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const user = await transformUser(id) || await transformUser(id, { includeDeleted: true })
  if (!user) return fail(res, 'User not found', 404)
  return okItem(res, user)
})

usersRouter.get('/:id/assets', async (req, res) => {
  const ids = await all<{ id: number }>(`
    SELECT id FROM assets WHERE assigned_type = 'user' AND assigned_to = ? AND deleted_at IS NULL
  `, [req.params.id])
  const rows = (await Promise.all(ids.map((r) => transformAsset(r.id)))).filter(Boolean)
  return okList(res, rows)
})

usersRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.username || !b.first_name || !b.last_name) return fail(res, 'username, first_name, last_name required')
  const exists = await get(`SELECT id FROM users WHERE username = ?`, [b.username])
  if (exists) return fail(res, 'Username already taken')
  const password = bcrypt.hashSync(b.password || 'password', 10)
  const perms: Record<string, string> = {}
  if (b.superuser || b.is_superuser) perms.superuser = '1'
  if (b.admin || b.is_admin) perms.admin = '1'
  const ts = now()
  const info = await run(`
    INSERT INTO users (first_name, last_name, username, email, password, employee_num, company_id, location_id, department_id, jobtitle, phone, activated, permissions, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.first_name, b.last_name, b.username, b.email || null, password, b.employee_num || null,
    b.company_id || null, b.location_id || null, b.department_id || null, b.jobtitle || null, b.phone || null,
    b.activated === false || b.activated === 0 ? 0 : 1, JSON.stringify(perms), b.notes || null, ts, ts,
  ])
  const id = Number(info.insertId)
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'user', itemId: id })
  return okMessage(res, 'User created', await transformUser(id), 201)
})

usersRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await transformUser(id))) return fail(res, 'User not found', 404)
  const b = req.body || {}
  const fields = ['first_name', 'last_name', 'email', 'employee_num', 'company_id', 'location_id', 'department_id', 'jobtitle', 'phone', 'notes'] as const
  const sets: string[] = []
  const vals: unknown[] = []
  for (const f of fields) {
    if (b[f] !== undefined) {
      sets.push(`${f} = ?`)
      vals.push(b[f])
    }
  }
  if (b.activated !== undefined) {
    sets.push('activated = ?')
    vals.push(b.activated ? 1 : 0)
  }
  if (b.password) {
    sets.push('password = ?')
    vals.push(bcrypt.hashSync(b.password, 10))
  }
  if (b.superuser !== undefined || b.admin !== undefined || b.is_superuser !== undefined || b.is_admin !== undefined) {
    const perms: Record<string, string> = {}
    if (b.superuser || b.is_superuser) perms.superuser = '1'
    if (b.admin || b.is_admin) perms.admin = '1'
    sets.push('permissions = ?')
    vals.push(JSON.stringify(perms))
  }
  if (!sets.length) return fail(res, 'No fields')
  vals.push(now(), id)
  await run(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'user', itemId: id })
  return okMessage(res, 'User updated', await transformUser(id))
})

usersRouter.delete('/:id', async (req, res) => {
  await run(`UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'user', itemId: Number(req.params.id) })
  return okMessage(res, 'User deleted')
})

export const mastersRouter = Router()

mastersRouter.use('/companies', makeCrudRouter({
  table: 'companies', resource: 'company', searchable: ['name'], allowedFields: ['name', 'notes'],
  mapRow: (r) => ({ id: r.id, name: r.name, notes: r.notes }),
}))

mastersRouter.use('/locations', makeCrudRouter({
  table: 'locations', resource: 'location', searchable: ['name'],
  allowedFields: ['name', 'parent_id', 'company_id', 'address', 'city', 'state', 'country', 'zip', 'notes'],
  mapRow: async (row) => {
    const countRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM assets WHERE location_id = ? AND deleted_at IS NULL`, [row.id])
    return {
      id: row.id,
      name: row.name,
      parent: nest(row.parent_id as number, null),
      company: nest(row.company_id as number, null),
      address: row.address,
      notes: row.notes,
      assets_count: Number(countRow?.c || 0),
    }
  },
}))

mastersRouter.use('/departments', makeCrudRouter({
  table: 'departments', resource: 'department', searchable: ['name'],
  allowedFields: ['name', 'company_id', 'location_id', 'notes'],
  mapRow: async (row) => {
    const company = row.company_id
      ? await get<{ name: string }>(`SELECT name FROM companies WHERE id = ?`, [row.company_id])
      : null
    return {
      id: row.id,
      name: row.name,
      company: nest(row.company_id as number, company?.name || null),
      company_id: row.company_id,
      location_id: row.location_id,
      notes: row.notes,
    }
  },
}))

mastersRouter.use('/manufacturers', makeCrudRouter({
  table: 'manufacturers', resource: 'manufacturer', searchable: ['name'],
  allowedFields: ['name', 'url', 'support_email', 'support_phone', 'notes'],
}))

mastersRouter.use('/suppliers', makeCrudRouter({
  table: 'suppliers', resource: 'supplier', searchable: ['name'],
  allowedFields: ['name', 'url', 'address', 'contact', 'email', 'phone', 'notes'],
}))

mastersRouter.use('/categories', makeCrudRouter({
  table: 'categories', resource: 'category', searchable: ['name'],
  allowedFields: ['name', 'category_type', 'require_acceptance', 'checkin_email', 'eula_text', 'use_default_eula'],
  mapRow: (r) => ({
    id: r.id,
    name: r.name,
    category_type: r.category_type,
    type: r.category_type,
    require_acceptance: Boolean(r.require_acceptance),
  }),
}))

mastersRouter.use('/statuslabels', makeCrudRouter({
  table: 'status_labels', resource: 'statuslabel', searchable: ['name'],
  allowedFields: ['name', 'type', 'color', 'show_in_nav', 'default_label', 'notes'],
}))

mastersRouter.use('/depreciations', makeCrudRouter({
  table: 'depreciations', resource: 'depreciation', searchable: ['name'], softDelete: false,
  allowedFields: ['name', 'months', 'depreciation_min'],
}))

mastersRouter.use('/models', (() => {
  const r = Router()
  r.get('/selectlist', async (req, res) => {
    const q = String(req.query.search || '').trim()
    let sql = `SELECT id, name as text FROM models WHERE deleted_at IS NULL`
    const params: unknown[] = []
    if (q) {
      sql += ' AND (name LIKE ? OR model_number LIKE ?)'
      params.push(`%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY name ASC LIMIT 500'
    const results = await all(sql, params)
    return res.json({ results, pagination: { more: false } })
  })
  r.get('/', async (req, res) => {
    const q = String(req.query.search || '').trim()
    let sql = `
      SELECT m.*, c.name as category_name, mf.name as manufacturer_name,
        (SELECT COUNT(*) FROM assets WHERE model_id = m.id AND deleted_at IS NULL) as assets_count
      FROM models m
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN manufacturers mf ON mf.id = m.manufacturer_id
      WHERE m.deleted_at IS NULL
    `
    const params: unknown[] = []
    if (q) {
      sql += ' AND (m.name LIKE ? OR m.model_number LIKE ?)'
      params.push(`%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY m.id DESC'
    const rows = (await all<Record<string, unknown>>(sql, params)).map((row) => ({
      id: row.id,
      name: row.name,
      model_number: row.model_number,
      category: nest(row.category_id as number, row.category_name as string),
      manufacturer: nest(row.manufacturer_id as number, row.manufacturer_name as string),
      assets_count: row.assets_count,
    }))
    return okList(res, rows)
  })
  r.get('/:id', async (req, res) => {
    const row = await get(`SELECT * FROM models WHERE id = ? AND deleted_at IS NULL`, [req.params.id])
    if (!row) return fail(res, 'Model not found', 404)
    return okItem(res, row)
  })
  r.post('/', async (req, res) => {
    const b = req.body || {}
    if (!b.name) return fail(res, 'name required')
    const ts = now()
    const info = await run(`
      INSERT INTO models (name, model_number, category_id, manufacturer_id, depreciation_id, eol, notes, requestable, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [b.name, b.model_number || null, b.category_id || null, b.manufacturer_id || null, b.depreciation_id || null, b.eol || null, b.notes || null, b.requestable ? 1 : 0, ts, ts])
    return okMessage(res, 'Model created', { id: info.insertId }, 201)
  })
  r.put('/:id', async (req, res) => {
    const b = req.body || {}
    const fields = ['name', 'model_number', 'category_id', 'manufacturer_id', 'depreciation_id', 'eol', 'notes'] as const
    const sets: string[] = []
    const vals: unknown[] = []
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`)
        vals.push(b[f])
      }
    }
    if (!sets.length) return fail(res, 'No fields')
    vals.push(now(), req.params.id)
    await run(`UPDATE models SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
    return okMessage(res, 'Model updated')
  })
  r.delete('/:id', async (req, res) => {
    await run(`UPDATE models SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
    return okMessage(res, 'Model deleted')
  })
  return r
})())

mastersRouter.use('/fields', makeCrudRouter({
  table: 'custom_fields', resource: 'field', searchable: ['name'], softDelete: false,
  allowedFields: ['name', 'db_column', 'format', 'element', 'field_values', 'show_in_email'],
}))

mastersRouter.use('/fieldsets', makeCrudRouter({
  table: 'custom_fieldsets', resource: 'fieldset', searchable: ['name'], softDelete: false,
  allowedFields: ['name'],
}))
