import { Router } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { transformLicense } from '../services/transformers.js'
import { logAction } from '../services/actionLog.js'
import { actorLabel, notifyWorkflow, resolveAssigneeEmail } from '../services/notify.js'

const router = Router()

router.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `SELECT id FROM licenses WHERE deleted_at IS NULL`
  const params: unknown[] = []
  if (q) {
    sql += ' AND (name LIKE ? OR serial LIKE ?)'
    params.push(`%${q}%`, `%${q}%`)
  }
  if (req.query.company_id) {
    sql += ' AND company_id = ?'
    params.push(Number(req.query.company_id))
  }
  sql += ' ORDER BY id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const total = Number(totalRow?.c || 0)
  const ids = await all<{ id: number }>(`${sql} ${limitSql(limit, offset)}`, params)
  const rows = (await Promise.all(ids.map((r) => transformLicense(r.id)))).filter(Boolean)
  return okList(res, rows, total)
})

router.get('/:id', async (req, res) => {
  const lic = await transformLicense(Number(req.params.id))
  if (!lic) return fail(res, 'License not found', 404)
  return okItem(res, lic)
})

router.get('/:id/seats', async (req, res) => {
  const rows = await all(`
    SELECT ls.*,
      CASE WHEN ls.assigned_to IS NOT NULL THEN (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = ls.assigned_to) END as user_name,
      CASE WHEN ls.asset_id IS NOT NULL THEN (SELECT asset_tag FROM assets WHERE id = ls.asset_id) END as asset_tag
    FROM license_seats ls WHERE ls.license_id = ? ORDER BY ls.id ASC
  `, [req.params.id])
  return okList(res, rows)
})

router.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.name) return fail(res, 'name required')
  const seats = Number(b.seats) || 1
  const ts = now()
  const info = await run(`
    INSERT INTO licenses (name, serial, seats, company_id, manufacturer_id, category_id, expiration_date, purchase_cost, purchase_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.name, b.product_key || b.serial || null, seats, b.company_id || null, b.manufacturer_id || null,
    b.category_id || null, b.expiration_date || null, b.purchase_cost || null, b.purchase_date || null,
    b.notes || null, ts, ts,
  ])
  const id = Number(info.insertId)
  const BATCH = 200
  for (let offset = 0; offset < seats; offset += BATCH) {
    const n = Math.min(BATCH, seats - offset)
    const placeholders = Array(n).fill('(?, ?, ?)').join(', ')
    const vals: unknown[] = []
    for (let i = 0; i < n; i++) vals.push(id, ts, ts)
    await run(`INSERT INTO license_seats (license_id, created_at, updated_at) VALUES ${placeholders}`, vals)
  }
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'license', itemId: id })
  notifyWorkflow({
    category: 'inventory',
    event: 'license.created',
    subject: `License added: ${b.name}`,
    title: 'License added',
    intro: 'A new software license was added to the catalog.',
    fields: [
      { label: 'License', value: String(b.name) },
      { label: 'Seats', value: String(seats) },
      { label: 'Created by', value: actorLabel(req.user) },
    ],
    ctaPath: `/licenses/${id}`,
    itemType: 'license',
    itemId: id,
  })
  return okMessage(res, 'License created', await transformLicense(id), 201)
})

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await transformLicense(id))) return fail(res, 'License not found', 404)
  const b = req.body || {}
  const map: Record<string, unknown> = {}
  for (const f of ['name', 'company_id', 'manufacturer_id', 'category_id', 'expiration_date', 'purchase_cost', 'purchase_date', 'notes'] as const) {
    if (b[f] !== undefined) map[f] = b[f]
  }
  if (b.product_key !== undefined || b.serial !== undefined) map.serial = b.product_key ?? b.serial
  const keys = Object.keys(map)
  if (keys.length) {
    await run(`UPDATE licenses SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
      ...keys.map((k) => map[k]), now(), id,
    ])
  }
  if (b.seats !== undefined) {
    const currentRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM license_seats WHERE license_id = ?`, [id])
    const current = Number(currentRow?.c || 0)
    const target = Number(b.seats)
    const ts = now()
    if (target > current) {
      const add = target - current
      const BATCH = 200
      for (let offset = 0; offset < add; offset += BATCH) {
        const n = Math.min(BATCH, add - offset)
        const placeholders = Array(n).fill('(?, ?, ?)').join(', ')
        const vals: unknown[] = []
        for (let i = 0; i < n; i++) vals.push(id, ts, ts)
        await run(`INSERT INTO license_seats (license_id, created_at, updated_at) VALUES ${placeholders}`, vals)
      }
    } else if (target < current) {
      const free = await all<{ id: number }>(`
        SELECT id FROM license_seats
        WHERE license_id = ? AND assigned_to IS NULL AND asset_id IS NULL
        ORDER BY id DESC LIMIT ${current - target}
      `, [id])
      if (free.length) {
        await run(`DELETE FROM license_seats WHERE id IN (${free.map(() => '?').join(',')})`, free.map((r) => r.id))
      }
    }
    await run(`UPDATE licenses SET seats = ?, updated_at = ? WHERE id = ?`, [target, ts, id])
  }
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'license', itemId: id })
  return okMessage(res, 'License updated', await transformLicense(id))
})

router.delete('/:id', async (req, res) => {
  await run(`UPDATE licenses SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'license', itemId: Number(req.params.id) })
  return okMessage(res, 'License deleted')
})

router.post('/:id/checkout', async (req, res) => {
  const id = Number(req.params.id)
  const seat = await get<{ id: number }>(`
    SELECT id FROM license_seats WHERE license_id = ? AND assigned_to IS NULL AND asset_id IS NULL LIMIT 1
  `, [id])
  if (!seat) return fail(res, 'No free licenses available')
  const b = req.body || {}
  const assignedTo = b.assigned_to || b.assigned_user || null
  const assetId = b.asset_id || null
  if (!assignedTo && !assetId) return fail(res, 'User or asset required')
  await run(`UPDATE license_seats SET assigned_to = ?, asset_id = ?, notes = ?, updated_at = ? WHERE id = ?`, [
    assignedTo, assetId, b.note || null, now(), seat.id,
  ])
  await logAction({
    userId: req.user?.id, actionType: 'checkout', itemType: 'license', itemId: id,
    targetType: assignedTo ? 'user' : 'asset', targetId: Number(assignedTo || assetId), note: b.note || null,
  })
  const lic = await transformLicense(id)
  const assigneeEmail = assignedTo ? await resolveAssigneeEmail('user', Number(assignedTo)) : null
  notifyWorkflow({
    category: 'custody',
    event: 'license.assigned',
    subject: `License assigned: ${lic?.name || id}`,
    title: 'License assigned',
    intro: 'A software license seat was assigned.',
    fields: [
      { label: 'License', value: String(lic?.name || id) },
      { label: 'Target', value: assignedTo ? `User #${assignedTo}` : `Asset #${assetId}` },
      { label: 'Assigned by', value: actorLabel(req.user) },
    ],
    ctaPath: `/licenses/${id}`,
    itemType: 'license',
    itemId: id,
    assigneeEmail,
    assigneeOnlyExtraNote: 'A software license has been assigned to you.',
  })
  return okMessage(res, 'License assigned', lic)
})

router.post('/:id/checkin', async (req, res) => {
  const id = Number(req.params.id)
  const seatId = req.body?.seat_id
  let seat: { id: number } | undefined
  if (seatId) {
    seat = await get<{ id: number }>(`SELECT id FROM license_seats WHERE id = ? AND license_id = ?`, [seatId, id])
  } else {
    seat = await get<{ id: number }>(`
      SELECT id FROM license_seats WHERE license_id = ? AND (assigned_to IS NOT NULL OR asset_id IS NOT NULL) LIMIT 1
    `, [id])
  }
  if (!seat) return fail(res, 'No assigned license found')
  const seatRow = await get<{ assigned_to: number | null }>(`SELECT assigned_to FROM license_seats WHERE id = ?`, [seat.id])
  const prevUser = seatRow?.assigned_to ? Number(seatRow.assigned_to) : null
  await run(`UPDATE license_seats SET assigned_to = NULL, asset_id = NULL, notes = NULL, updated_at = ? WHERE id = ?`, [now(), seat.id])
  await logAction({ userId: req.user?.id, actionType: 'checkin', itemType: 'license', itemId: id })
  const lic = await transformLicense(id)
  const assigneeEmail = prevUser ? await resolveAssigneeEmail('user', prevUser) : null
  notifyWorkflow({
    category: 'custody',
    event: 'license.unassigned',
    subject: `License unassigned: ${lic?.name || id}`,
    title: 'License unassigned',
    intro: 'A software license seat was returned.',
    fields: [
      { label: 'License', value: String(lic?.name || id) },
      { label: 'Unassigned by', value: actorLabel(req.user) },
    ],
    ctaPath: `/licenses/${id}`,
    itemType: 'license',
    itemId: id,
    assigneeEmail,
    assigneeOnlyExtraNote: 'A software license previously assigned to you has been unassigned.',
  })
  return okMessage(res, 'License unassigned', lic)
})

export default router
