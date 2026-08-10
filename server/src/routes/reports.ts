import { Router } from 'express'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'
import { transformAsset } from '../services/transformers.js'
import { recordUpload, storageRoot } from '../services/uploads.js'

export const reportsRouter = Router()

reportsRouter.get('/activity', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const action = String(req.query.action_type || '')
  const itemType = String(req.query.item_type || '')
  const from = String(req.query.from || '')
  const to = String(req.query.to || '')
  const params: unknown[] = []
  let where = 'WHERE al.deleted_at IS NULL'
  if (action) { where += ' AND al.action_type = ?'; params.push(action) }
  if (itemType) { where += ' AND al.item_type = ?'; params.push(itemType) }
  if (from) { where += ' AND DATE(al.action_date) >= ?'; params.push(from) }
  if (to) { where += ' AND DATE(al.action_date) <= ?'; params.push(to) }

  const rows = await all(`
    SELECT al.*, u.username as admin,
      CASE
        WHEN al.item_type = 'asset' THEN (SELECT CONCAT(asset_tag, ' ', COALESCE(name,'')) FROM assets WHERE id = al.item_id)
        WHEN al.item_type = 'license' THEN (SELECT name FROM licenses WHERE id = al.item_id)
        WHEN al.item_type = 'user' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = al.item_id)
        ELSE CONCAT(COALESCE(al.item_type,''), '#', COALESCE(al.item_id,''))
      END as item_name,
      CASE
        WHEN al.target_type = 'user' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = al.target_id)
        WHEN al.target_type = 'employee' THEN (
          SELECT TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) FROM employees WHERE id = al.target_id
        )
        WHEN al.target_type = 'location' THEN (SELECT name FROM locations WHERE id = al.target_id)
        ELSE NULL
      END as target_name
    FROM action_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.action_date DESC, al.id DESC
    ${limitSql(limit, 0)}
  `, params)
  return okList(res, rows)
})

reportsRouter.get('/hub', async (_req, res) => {
  const count = async (sql: string) => Number((await get<{ c: number }>(sql))?.c || 0)
  const { countEolDue } = await import('../services/eolAlerts.js')
  return okItem(res, {
    audit_due: await count(`SELECT COUNT(*) as c FROM assets WHERE deleted_at IS NULL AND next_audit_date IS NOT NULL AND DATE(next_audit_date) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`),
    checkin_due: await count(`SELECT COUNT(*) as c FROM assets WHERE deleted_at IS NULL AND expected_checkin IS NOT NULL AND assigned_to IS NOT NULL`),
    eol_due: await countEolDue(),
    pending_acceptance: await count(`SELECT COUNT(*) as c FROM checkout_acceptances WHERE accepted_at IS NULL AND declined_at IS NULL AND deleted_at IS NULL`),
    licenses_exhausted: await count(`
      SELECT COUNT(*) as c FROM licenses l
      WHERE l.deleted_at IS NULL AND (
        SELECT COUNT(*) FROM license_seats WHERE license_id=l.id AND (assigned_to IS NOT NULL OR asset_id IS NOT NULL)
      ) >= l.seats
    `),
  })
})


reportsRouter.get('/audit', async (_req, res) => {
  const ids = await all<{ id: number }>(`
    SELECT id FROM assets WHERE deleted_at IS NULL AND next_audit_date IS NOT NULL
    ORDER BY next_audit_date ASC
  `)
  const rows = (await Promise.all(ids.map((r) => transformAsset(r.id)))).filter(Boolean)
  return okList(res, rows)
})

reportsRouter.get('/depreciation', async (_req, res) => {
  const rows = await all(`
    SELECT a.id, a.asset_tag, a.name, a.purchase_cost, a.purchase_date,
      d.months as depreciation_months,
      ROUND(a.purchase_cost * GREATEST(0, 1 - (DATEDIFF(CURDATE(), a.purchase_date) / (d.months * 30.44))), 2) as book_value
    FROM assets a
    LEFT JOIN models m ON m.id = a.model_id
    LEFT JOIN depreciations d ON d.id = m.depreciation_id
    WHERE a.deleted_at IS NULL AND a.purchase_cost IS NOT NULL
  `)
  return okList(res, rows)
})

reportsRouter.get('/licenses', async (_req, res) => {
  const rows = (await all<Record<string, unknown>>(`
    SELECT l.id, l.name, l.seats,
      (SELECT COUNT(*) FROM license_seats WHERE license_id = l.id AND (assigned_to IS NOT NULL OR asset_id IS NOT NULL)) as used,
      l.expiration_date, l.purchase_cost
    FROM licenses l WHERE l.deleted_at IS NULL
  `)).map((r) => ({
    ...r,
    remaining: Number(r.seats) - Number(r.used),
    used_percent: Math.round((Number(r.used) / Number(r.seats)) * 100),
  }))
  return okList(res, rows)
})

reportsRouter.get('/maintenances', async (_req, res) => {
  const rows = await all(`
    SELECT m.*, a.asset_tag, s.name as supplier_name
    FROM maintenances m
    LEFT JOIN assets a ON a.id = m.asset_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.start_date DESC
  `)
  return okList(res, rows)
})

reportsRouter.get('/unaccepted', async (_req, res) => {
  const rows = await all(`
    SELECT ca.*, a.asset_tag, a.name as asset_name,
      CONCAT(u.first_name, ' ', u.last_name) as user_name
    FROM checkout_acceptances ca
    JOIN assets a ON a.id = ca.checkoutable_id AND ca.checkoutable_type = 'asset'
    JOIN users u ON u.id = ca.assigned_to
    WHERE ca.accepted_at IS NULL AND ca.declined_at IS NULL AND ca.deleted_at IS NULL
  `)
  return okList(res, rows)
})

reportsRouter.get('/accessories', async (_req, res) => {
  const rows = (await all<Record<string, unknown>>(`
    SELECT a.id, a.name, a.qty,
      COALESCE((SELECT SUM(assigned_qty) FROM accessories_checkout WHERE accessory_id = a.id), 0) as checked_out,
      a.min_amt
    FROM accessories a WHERE a.deleted_at IS NULL
  `)).map((r) => ({
    ...r,
    remaining: Number(r.qty) - Number(r.checked_out),
  }))
  return okList(res, rows)
})

reportsRouter.get('/custom', async (req, res) => {
  const q = req.query
  const wanted = new Set(
    String(q.fields || 'asset_tag,name,serial,model,status,assigned_to,location,company,purchase_cost,purchase_date,notes')
      .split(',').map((f) => f.trim()).filter(Boolean),
  )

  const selectParts: string[] = ['a.id']
  if (wanted.has('asset_tag') || wanted.has('id')) selectParts.push('a.asset_tag')
  if (wanted.has('asset_name') || wanted.has('name')) selectParts.push('a.name as asset_name')
  if (wanted.has('serial')) selectParts.push('a.serial')
  if (wanted.has('model')) selectParts.push('m.name as model')
  if (wanted.has('model_number')) selectParts.push('m.model_number')
  if (wanted.has('category')) selectParts.push('cat.name as category')
  if (wanted.has('manufacturer')) selectParts.push('mf.name as manufacturer')
  if (wanted.has('status')) selectParts.push('s.name as status')
  if (wanted.has('company')) selectParts.push('co.name as company')
  if (wanted.has('supplier')) selectParts.push('sup.name as supplier')
  if (wanted.has('location')) selectParts.push('loc.name as location')
  if (wanted.has('rtd_location')) selectParts.push('rtd.name as rtd_location')
  if (wanted.has('purchase_date')) selectParts.push('a.purchase_date')
  if (wanted.has('purchase_cost')) selectParts.push('a.purchase_cost')
  if (wanted.has('order') || wanted.has('order_number')) selectParts.push('a.order_number')
  if (wanted.has('notes')) selectParts.push('a.notes')
  if (wanted.has('warranty')) selectParts.push('a.warranty_months')
  if (wanted.has('expected_checkin')) selectParts.push('a.expected_checkin')
  if (wanted.has('last_audit_date')) selectParts.push('a.last_audit_date')
  if (wanted.has('next_audit_date')) selectParts.push('a.next_audit_date')
  if (wanted.has('checkout_date')) selectParts.push('a.last_checkout as checkout_date')
  if (wanted.has('checkin_date')) selectParts.push('a.last_checkin as checkin_date')
  if (wanted.has('created_at')) selectParts.push('a.created_at')
  if (wanted.has('updated_at')) selectParts.push('a.updated_at')
  if (wanted.has('assigned_to') || wanted.has('username') || wanted.has('email') || wanted.has('employee_num')) {
    selectParts.push(`CASE
      WHEN a.assigned_type='user' THEN (SELECT CONCAT(first_name,' ',last_name) FROM users WHERE id=a.assigned_to)
      WHEN a.assigned_type='employee' THEN (SELECT CONCAT(first_name,' ',last_name,' (',employee_code,')') FROM employees WHERE id=a.assigned_to)
      WHEN a.assigned_type='location' THEN (SELECT name FROM locations WHERE id=a.assigned_to)
      WHEN a.assigned_type='asset' THEN (SELECT asset_tag FROM assets WHERE id=a.assigned_to)
      ELSE NULL END as assigned_to`)
    selectParts.push(`CASE WHEN a.assigned_type='user' THEN (SELECT username FROM users WHERE id=a.assigned_to) END as username`)
    selectParts.push(`CASE WHEN a.assigned_type='user' THEN (SELECT email FROM users WHERE id=a.assigned_to) END as email`)
    selectParts.push(`CASE WHEN a.assigned_type='user' THEN (SELECT employee_num FROM users WHERE id=a.assigned_to) END as employee_num`)
  }

  const where: string[] = []
  const params: unknown[] = []
  const deletedMode = String(q.deleted_assets || 'exclude')
  if (deletedMode === 'only_deleted') where.push('a.deleted_at IS NOT NULL')
  else if (deletedMode !== 'include_deleted') where.push('a.deleted_at IS NULL')

  if (q.exclude_archived === '1' || q.exclude_archived === 'true') {
    where.push(`(s.type IS NULL OR s.type <> 'archived')`)
  }
  if (q.assignment_status === 'assigned') where.push('a.assigned_to IS NOT NULL')
  if (q.assignment_status === 'unassigned') where.push('a.assigned_to IS NULL')

  const addIn = (col: string, raw: unknown) => {
    const vals = Array.isArray(raw) ? raw : raw ? String(raw).split(',') : []
    const ids = vals.map(Number).filter((n) => n > 0)
    if (ids.length) {
      where.push(`${col} IN (${ids.map(() => '?').join(',')})`)
      params.push(...ids)
    }
  }
  addIn('a.location_id', q.by_location_id)
  addIn('a.rtd_location_id', q.by_rtd_location_id)
  addIn('a.company_id', q.by_company_id)
  addIn('a.model_id', q.by_model_id)
  addIn('a.status_id', q.by_status_id)
  addIn('a.supplier_id', q.by_supplier_id)
  addIn('m.category_id', q.by_category_id)
  addIn('m.manufacturer_id', q.by_manufacturer_id)

  if (q.by_order_number) {
    where.push('a.order_number = ?')
    params.push(q.by_order_number)
  }

  const addDateRange = (col: string, fromKey: string, toKey: string) => {
    if (q[fromKey]) { where.push(`DATE(${col}) >= ?`); params.push(q[fromKey]) }
    if (q[toKey]) { where.push(`DATE(${col}) <= ?`); params.push(q[toKey]) }
  }
  addDateRange('a.purchase_date', 'purchase_from', 'purchase_to')
  addDateRange('a.created_at', 'created_from', 'created_to')
  addDateRange('a.last_checkout', 'checkout_from', 'checkout_to')
  addDateRange('a.last_checkin', 'checkin_from', 'checkin_to')
  addDateRange('a.expected_checkin', 'expected_checkin_from', 'expected_checkin_to')
  addDateRange('a.next_audit_date', 'next_audit_from', 'next_audit_to')
  addDateRange('a.last_audit_date', 'last_audit_from', 'last_audit_to')

  const sql = `
    SELECT ${selectParts.join(', ')}
    FROM assets a
    LEFT JOIN models m ON m.id = a.model_id
    LEFT JOIN categories cat ON cat.id = m.category_id
    LEFT JOIN manufacturers mf ON mf.id = m.manufacturer_id
    LEFT JOIN status_labels s ON s.id = a.status_id
    LEFT JOIN companies co ON co.id = a.company_id
    LEFT JOIN suppliers sup ON sup.id = a.supplier_id
    LEFT JOIN locations loc ON loc.id = a.location_id
    LEFT JOIN locations rtd ON rtd.id = a.rtd_location_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.id DESC
    ${limitSql(Number(q.limit) || 500, Number(q.offset) || 0)}
  `
  const rows = await all(sql, params)
  return okList(res, rows)
})

reportsRouter.get('/custom/export', async (_req, res) => {
  const rows = await all(`
    SELECT a.asset_tag, a.name, a.serial, m.name as model, s.name as status, a.purchase_cost, a.purchase_date,
      loc.name as location, co.name as company
    FROM assets a
    LEFT JOIN models m ON m.id=a.model_id
    LEFT JOIN status_labels s ON s.id=a.status_id
    LEFT JOIN locations loc ON loc.id=a.location_id
    LEFT JOIN companies co ON co.id=a.company_id
    WHERE a.deleted_at IS NULL
    ORDER BY a.id
  `)
  const headers = rows.length ? Object.keys(rows[0] as object) : ['asset_tag']
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => {
      const v = String((r as Record<string, unknown>)[h] ?? '')
      return `"${v.replace(/"/g, '""')}"`
    }).join(','))
  }
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="custom-asset-report.csv"')
  return res.send(lines.join('\n'))
})


export const maintenancesRouter = Router()

maintenancesRouter.get('/', async (_req, res) => {
  const rows = await all(`
    SELECT m.*, a.asset_tag, a.name as asset_name, s.name as supplier_name
    FROM maintenances m
    LEFT JOIN assets a ON a.id = m.asset_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.id DESC
  `)
  return okList(res, rows)
})

maintenancesRouter.get('/:id', async (req, res) => {
  const row = await get(`
    SELECT m.*, a.asset_tag, a.name as asset_name, s.name as supplier_name
    FROM maintenances m
    LEFT JOIN assets a ON a.id = m.asset_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    WHERE m.id = ? AND m.deleted_at IS NULL
  `, [req.params.id])
  if (!row) return fail(res, 'Maintenance not found', 404)
  return okItem(res, row)
})

maintenancesRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.asset_id || !b.title) return fail(res, 'asset_id and title required')
  const ts = now()
  const info = await run(`
    INSERT INTO maintenances (asset_id, supplier_id, asset_maintenance_type, title, start_date, completion_date, note, cost, is_warranty, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.asset_id, b.supplier_id || null, b.asset_maintenance_type || 'Maintenance', b.title,
    b.start_date || ts.slice(0, 10), b.completion_date || null, b.note || null, b.cost || 0,
    b.is_warranty ? 1 : 0, req.user?.id || null, ts, ts,
  ])
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'maintenance', itemId: Number(info.insertId) })
  return okMessage(res, 'Maintenance created', { id: info.insertId }, 201)
})

maintenancesRouter.put('/:id', async (req, res) => {
  const b = req.body || {}
  const fields = ['title', 'supplier_id', 'asset_maintenance_type', 'start_date', 'completion_date', 'note', 'cost', 'is_warranty'] as const
  const sets: string[] = []
  const vals: unknown[] = []
  for (const f of fields) {
    if (b[f] !== undefined) {
      sets.push(`${f} = ?`)
      vals.push(f === 'is_warranty' ? (b[f] ? 1 : 0) : b[f])
    }
  }
  if (!sets.length) return fail(res, 'No fields')
  vals.push(now(), req.params.id)
  await run(`UPDATE maintenances SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
  return okMessage(res, 'Maintenance updated')
})

maintenancesRouter.post('/:id/complete', async (req, res) => {
  await run(`UPDATE maintenances SET completion_date = ?, updated_at = ? WHERE id = ?`, [
    req.body?.completion_date || now().slice(0, 10), now(), req.params.id,
  ])
  return okMessage(res, 'Maintenance completed')
})

maintenancesRouter.delete('/:id', async (req, res) => {
  await run(`UPDATE maintenances SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
  return okMessage(res, 'Maintenance deleted')
})

export const dashboardRouter = Router()

dashboardRouter.get('/', async (req, res) => {
  const companyId = req.query.company_id ? Number(req.query.company_id) : null
  const locationId = req.query.location_id ? Number(req.query.location_id) : null
  const search = String(req.query.search || req.query.q || '').trim()

  const count = async (sql: string, params: unknown[] = []) => {
    const row = await get<{ c: number }>(sql, params)
    return Number(row?.c || 0)
  }

  const assetClauses = ['a.deleted_at IS NULL']
  const assetParams: unknown[] = []
  if (companyId) {
    assetClauses.push('a.company_id = ?')
    assetParams.push(companyId)
  }
  if (locationId) {
    assetClauses.push('(a.location_id = ? OR a.rtd_location_id = ?)')
    assetParams.push(locationId, locationId)
  }
  if (search) {
    assetClauses.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial LIKE ? OR CAST(a.id AS CHAR) = ?)')
    assetParams.push(`%${search}%`, `%${search}%`, `%${search}%`, search)
  }
  const assetWhere = assetClauses.join(' AND ')

  const invClauses = ['deleted_at IS NULL']
  const invParams: unknown[] = []
  if (companyId) {
    invClauses.push('company_id = ?')
    invParams.push(companyId)
  }
  const invWhere = invClauses.join(' AND ')

  const { countEolDue } = await import('../services/eolAlerts.js')

  const accessoryAssigned = companyId
    ? await count(`
        SELECT COALESCE(SUM(ac.assigned_qty),0) as c
        FROM accessories_checkout ac
        JOIN accessories a ON a.id = ac.accessory_id
        WHERE a.deleted_at IS NULL AND a.company_id = ?
      `, [companyId])
    : await count(`SELECT COALESCE(SUM(assigned_qty),0) as c FROM accessories_checkout`)
  const consumableAssigned = companyId
    ? await count(`
        SELECT COALESCE(SUM(cu.assigned_qty),0) as c
        FROM consumables_users cu
        JOIN consumables c ON c.id = cu.consumable_id
        WHERE c.deleted_at IS NULL AND c.company_id = ?
      `, [companyId])
    : await count(`SELECT COALESCE(SUM(assigned_qty),0) as c FROM consumables_users`)
  const componentAssigned = companyId
    ? await count(`
        SELECT COALESCE(SUM(ca.assigned_qty),0) as c
        FROM components_assets ca
        JOIN components c ON c.id = ca.component_id
        WHERE c.deleted_at IS NULL AND c.company_id = ?
      `, [companyId])
    : await count(`SELECT COALESCE(SUM(assigned_qty),0) as c FROM components_assets`)

  const accessoryQty = await count(`SELECT COALESCE(SUM(qty),0) as c FROM accessories WHERE ${invWhere}`, invParams)
  const consumableQty = await count(`SELECT COALESCE(SUM(qty),0) as c FROM consumables WHERE ${invWhere}`, invParams)
  const componentQty = await count(`SELECT COALESCE(SUM(qty),0) as c FROM components WHERE ${invWhere}`, invParams)

  const licenseSeats = await count(
    `SELECT COALESCE(SUM(seats),0) as c FROM licenses WHERE ${invWhere}`,
    invParams,
  )
  const licenseAssigned = companyId
    ? await count(`
        SELECT COUNT(*) as c FROM license_seats ls
        JOIN licenses l ON l.id = ls.license_id
        WHERE l.deleted_at IS NULL AND l.company_id = ?
          AND (ls.assigned_to IS NOT NULL OR ls.asset_id IS NOT NULL)
      `, [companyId])
    : await count(`
        SELECT COUNT(*) as c FROM license_seats
        WHERE (assigned_to IS NOT NULL OR asset_id IS NOT NULL)
      `)

  return okItem(res, {
    assets: await count(`SELECT COUNT(*) as c FROM assets a WHERE ${assetWhere}`, assetParams),
    licenses: await count(`SELECT COUNT(*) as c FROM licenses WHERE ${invWhere}`, invParams),
    accessories: await count(`SELECT COUNT(*) as c FROM accessories WHERE ${invWhere}`, invParams),
    consumables: await count(`SELECT COUNT(*) as c FROM consumables WHERE ${invWhere}`, invParams),
    components: await count(`SELECT COUNT(*) as c FROM components WHERE ${invWhere}`, invParams),
    users: await count(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`),
    employees: await count(`SELECT COUNT(*) as c FROM employees WHERE deleted_at IS NULL`),
    deployed: await count(
      `SELECT COUNT(*) as c FROM assets a WHERE ${assetWhere} AND a.assigned_to IS NOT NULL`,
      assetParams,
    ),
    rtd: await count(
      `SELECT COUNT(*) as c FROM assets a
       JOIN status_labels s ON s.id = a.status_id
       WHERE ${assetWhere} AND a.assigned_to IS NULL AND s.type = 'deployable'`,
      assetParams,
    ),
    pending: await count(
      `SELECT COUNT(*) as c FROM assets a
       JOIN status_labels s ON s.id = a.status_id
       WHERE ${assetWhere} AND s.type = 'pending'`,
      assetParams,
    ),
    audit_due: await count(
      `SELECT COUNT(*) as c FROM assets a
       WHERE ${assetWhere}
         AND a.next_audit_date IS NOT NULL
         AND DATE(a.next_audit_date) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
      assetParams,
    ),
    eol_due: await countEolDue({ companyId, locationId, search: search || undefined }),
    accessories_assigned: accessoryAssigned,
    accessories_available: Math.max(0, accessoryQty - accessoryAssigned),
    consumables_assigned: consumableAssigned,
    consumables_available: Math.max(0, consumableQty - consumableAssigned),
    components_assigned: componentAssigned,
    components_available: Math.max(0, componentQty - componentAssigned),
    licenses_seats: licenseSeats,
    licenses_assigned: licenseAssigned,
    licenses_available: Math.max(0, licenseSeats - licenseAssigned),
  })
})

export const settingsRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  const row = await get(`SELECT * FROM settings WHERE id = 1`)
  return okItem(res, row)
})

settingsRouter.put('/', async (req, res) => {
  const b = req.body || {}
  await run(`
    UPDATE settings SET
      site_name = COALESCE(?, site_name),
      full_multiple_companies_support = COALESCE(?, full_multiple_companies_support),
      default_currency = COALESCE(?, default_currency),
      date_display_format = COALESCE(?, date_display_format),
      alert_email = COALESCE(?, alert_email),
      updated_at = ?
    WHERE id = 1
  `, [
    b.site_name ?? null,
    b.full_multiple_companies_support !== undefined ? (b.full_multiple_companies_support ? 1 : 0) : null,
    b.default_currency ?? null,
    b.date_display_format ?? null,
    b.alert_email ?? null,
    now(),
  ])
  return okMessage(res, 'Settings updated', await get(`SELECT * FROM settings WHERE id = 1`))
})

export const accountRouter = Router()

accountRouter.get('/assets', async (req, res) => {
  const ids = await all<{ id: number }>(`
    SELECT id FROM assets WHERE assigned_type = 'user' AND assigned_to = ? AND deleted_at IS NULL
  `, [req.user!.id])
  const rows = (await Promise.all(ids.map((r) => transformAsset(r.id)))).filter(Boolean)
  return okList(res, rows)
})

accountRouter.get('/requested', async (req, res) => {
  const rows = await all(`
    SELECT * FROM checkout_requests WHERE user_id = ? AND deleted_at IS NULL
  `, [req.user!.id])
  return okList(res, rows)
})

accountRouter.get('/accept', async (req, res) => {
  const rows = await all(`
    SELECT ca.*, a.asset_tag, a.name as asset_name
    FROM checkout_acceptances ca
    JOIN assets a ON a.id = ca.checkoutable_id
    WHERE ca.assigned_to = ? AND ca.accepted_at IS NULL AND ca.declined_at IS NULL AND ca.deleted_at IS NULL
  `, [req.user!.id])
  return okList(res, rows)
})

accountRouter.post('/accept/:id', async (req, res) => {
  const decision = String(req.body?.asset_acceptance || req.body?.decision || 'accepted')
  const note = req.body?.note || null
  const row = await get<Record<string, unknown>>(`
    SELECT * FROM checkout_acceptances WHERE id = ? AND assigned_to = ? AND deleted_at IS NULL
  `, [req.params.id, req.user!.id])
  if (!row) return fail(res, 'Acceptance not found', 404)

  const ts = now()
  if (decision === 'declined') {
    await run(`UPDATE checkout_acceptances SET declined_at = ?, note = ?, updated_at = ? WHERE id = ?`, [ts, note, ts, req.params.id])
    await logAction({ userId: req.user!.id, actionType: 'declined', itemType: row.checkoutable_type as string, itemId: Number(row.checkoutable_id), note })
    return okMessage(res, 'Asset declined')
  }

  let signatureFilename: string | null = null
  if (req.body?.signature_output || req.body?.signature) {
    const b64 = String(req.body.signature_output || req.body.signature).replace(/^data:image\/\w+;base64,/, '')
    const buf = Buffer.from(b64, 'base64')
    const filename = `siglog-${req.params.id}-${Date.now()}.png`
    const rel = path.join('private_uploads', 'signatures', filename).replace(/\\/g, '/')
    const abs = path.join(storageRoot, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, buf)
    signatureFilename = filename
    await recordUpload({
      type: 'acceptance',
      id: Number(req.params.id),
      filename,
      original: filename,
      mime: 'image/png',
      diskPath: rel,
      size: buf.length,
      kind: 'signature',
      userId: req.user!.id,
    })
  }

  await run(`
    UPDATE checkout_acceptances SET accepted_at = ?, signature_filename = COALESCE(?, signature_filename), note = ?, updated_at = ?
    WHERE id = ?
  `, [ts, signatureFilename, note, ts, req.params.id])
  await logAction({
    userId: req.user!.id,
    actionType: 'accepted',
    itemType: row.checkoutable_type as string,
    itemId: Number(row.checkoutable_id),
    note: note || 'EULA accepted',
  })
  return okMessage(res, 'Asset accepted', { signature: signatureFilename })
})

accountRouter.post('/accept/:id/decline', async (req, res) => {
  req.body = { ...(req.body || {}), asset_acceptance: 'declined' }
  // reuse logic
  const ts = now()
  await run(`UPDATE checkout_acceptances SET declined_at = ?, note = ?, updated_at = ? WHERE id = ? AND assigned_to = ?`, [
    ts, req.body?.note || null, ts, req.params.id, req.user!.id,
  ])
  await logAction({ userId: req.user!.id, actionType: 'declined', itemType: 'asset', note: req.body?.note || null })
  return okMessage(res, 'Asset declined')
})


accountRouter.put('/profile', async (req, res) => {
  const b = req.body || {}
  await run(`
    UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
      email = COALESCE(?, email), phone = COALESCE(?, phone), updated_at = ?
    WHERE id = ?
  `, [b.first_name ?? null, b.last_name ?? null, b.email ?? null, b.phone ?? null, now(), req.user!.id])
  return okMessage(res, 'Profile updated')
})

accountRouter.put('/password', async (req, res) => {
  const { current_password, password } = req.body || {}
  if (!password) return fail(res, 'password required')
  const user = await get<{ password: string }>(`SELECT password FROM users WHERE id = ?`, [req.user!.id])
  if (!user) return fail(res, 'User not found', 404)
  if (current_password && !bcrypt.compareSync(current_password, user.password)) {
    return fail(res, 'Current password incorrect')
  }
  await run(`UPDATE users SET password = ?, updated_at = ? WHERE id = ?`, [
    bcrypt.hashSync(password, 10), now(), req.user!.id,
  ])
  return okMessage(res, 'Password updated')
})

export const requestsRouter = Router()

requestsRouter.get('/', async (_req, res) => {
  const rows = await all(`
    SELECT cr.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.username
    FROM checkout_requests cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.deleted_at IS NULL
    ORDER BY cr.id DESC
  `)
  return okList(res, rows)
})

requestsRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.requestable_id) return fail(res, 'requestable_id required')
  const ts = now()
  const info = await run(`
    INSERT INTO checkout_requests (user_id, requestable_id, requestable_type, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [req.user!.id, b.requestable_id, b.requestable_type || 'asset', b.quantity || 1, ts, ts])
  return okMessage(res, 'Request submitted', { id: info.insertId }, 201)
})

requestsRouter.get('/requestable', async (_req, res) => {
  const ids = await all<{ id: number }>(`
    SELECT id FROM assets WHERE deleted_at IS NULL AND requestable = 1 AND assigned_to IS NULL
  `)
  const more = await all<{ id: number }>(`
    SELECT a.id FROM assets a
    JOIN status_labels s ON s.id = a.status_id
    WHERE a.deleted_at IS NULL AND a.assigned_to IS NULL AND s.type = 'deployable'
  `)
  const allIds = [...new Set([...ids, ...more].map((r) => r.id))]
  const rows = (await Promise.all(allIds.map((id) => transformAsset(id)))).filter(Boolean)
  return okList(res, rows)
})
