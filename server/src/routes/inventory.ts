import { Router } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, nest, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'
import { actorLabel, notifyWorkflow, resolveAssigneeEmail } from '../services/notify.js'

type QtyConfig = {
  table: 'accessories' | 'consumables' | 'components'
  idCol: string
  checkoutTable: string
  checkoutTarget: 'user' | 'asset' | 'either'
  itemType: string
}

function remainingSql(cfg: QtyConfig) {
  return `COALESCE((SELECT SUM(assigned_qty) FROM ${cfg.checkoutTable} WHERE ${cfg.idCol} = t.id), 0)`
}

async function transform(cfg: QtyConfig, id: number) {
  const row = await get<Record<string, unknown>>(`
    SELECT t.*, cat.name as category_name, co.name as company_name, co.code as company_code,
      le.code as legal_entity_code, loc.name as location_name,
      ${remainingSql(cfg)} as checked_out
    FROM ${cfg.table} t
    LEFT JOIN categories cat ON cat.id = t.category_id
    LEFT JOIN companies co ON co.id = t.company_id
    LEFT JOIN legal_entities le ON le.id = t.legal_entity_id
    LEFT JOIN locations loc ON loc.id = t.location_id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `, [id])
  if (!row) return null
  const assigned = Number(row.checked_out) || 0
  const remaining = Number(row.qty) - assigned
  return {
    id: row.id,
    name: row.name,
    category: nest(row.category_id as number, row.category_name as string),
    company: nest(row.company_id as number, row.company_name as string, { code: row.company_code || null }),
    legal_entity: nest(row.legal_entity_id as number, (row.legal_entity_code as string) || null, {
      code: row.legal_entity_code || null,
    }),
    location: nest(row.location_id as number, row.location_name as string),
    model_number: row.model_number,
    qty: row.qty,
    assigned,
    remaining,
    available: remaining,
    min_amt: row.min_amt,
    purchase_cost: row.purchase_cost,
    notes: row.notes,
    available_actions: { checkout: remaining > 0, update: true, delete: true },
  }
}

function makeQtyRouter(cfg: QtyConfig) {
  const router = Router()

  router.get('/', async (req, res) => {
    const q = String(req.query.search || '').trim()
    let sql = `SELECT id FROM ${cfg.table} WHERE deleted_at IS NULL`
    const params: unknown[] = []
    if (q) {
      sql += ' AND name LIKE ?'
      params.push(`%${q}%`)
    }
    if (req.query.company_id) {
      sql += ' AND company_id = ?'
      params.push(Number(req.query.company_id))
    }
    if (req.query.location_id) {
      sql += ' AND location_id = ?'
      params.push(Number(req.query.location_id))
    }
    sql += ' ORDER BY id DESC'
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    const offset = Number(req.query.offset) || 0
    const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
    const total = Number(totalRow?.c || 0)
    const ids = await all<{ id: number }>(`${sql} ${limitSql(limit, offset)}`, params)
    const rows = (await Promise.all(ids.map((r) => transform(cfg, r.id)))).filter(Boolean)
    return okList(res, rows, total)
  })

  router.get('/:id', async (req, res) => {
    const item = await transform(cfg, Number(req.params.id))
    if (!item) return fail(res, 'Not found', 404)
    return okItem(res, item)
  })

  router.post('/', async (req, res) => {
    const b = req.body || {}
    if (!b.name) return fail(res, 'name required')
    const ts = now()
    const info = await run(`
      INSERT INTO ${cfg.table} (name, category_id, company_id, legal_entity_id, location_id, model_number, qty, min_amt, purchase_cost, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      b.name, b.category_id || null, b.company_id || null, b.legal_entity_id || null, b.location_id || null,
      b.model_number || null, b.qty || 1, b.min_amt || 0, b.purchase_cost || null, b.notes || null, ts, ts,
    ])
    const id = Number(info.insertId)
    await logAction({ userId: req.user?.id, actionType: 'create', itemType: cfg.itemType, itemId: id })
    const created = await transform(cfg, id)
    notifyWorkflow({
      category: 'inventory',
      event: `${cfg.itemType}.created`,
      subject: `${cfg.itemType} added: ${b.name}`,
      title: `${cfg.itemType.charAt(0).toUpperCase()}${cfg.itemType.slice(1)} added`,
      intro: `A new ${cfg.itemType} was added to the catalog.`,
      fields: [
        { label: 'Name', value: String(b.name) },
        { label: 'Qty', value: String(b.qty ?? 1) },
        { label: 'Created by', value: actorLabel(req.user) },
      ],
      ctaPath: `/${cfg.table}/${id}`,
      itemType: cfg.itemType,
      itemId: id,
    })
    return okMessage(res, 'Created', created, 201)
  })

  router.put('/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!(await transform(cfg, id))) return fail(res, 'Not found', 404)
    const b = req.body || {}
    const fields = ['name', 'category_id', 'company_id', 'legal_entity_id', 'location_id', 'model_number', 'qty', 'min_amt', 'purchase_cost', 'notes'] as const
    const sets: string[] = []
    const vals: unknown[] = []
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`)
        vals.push(b[f])
      }
    }
    if (!sets.length) return fail(res, 'No fields')
    vals.push(now(), id)
    await run(`UPDATE ${cfg.table} SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
    await logAction({ userId: req.user?.id, actionType: 'update', itemType: cfg.itemType, itemId: id })
    return okMessage(res, 'Updated', await transform(cfg, id))
  })

  router.delete('/:id', async (req, res) => {
    await run(`UPDATE ${cfg.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
    await logAction({ userId: req.user?.id, actionType: 'delete', itemType: cfg.itemType, itemId: Number(req.params.id) })
    return okMessage(res, 'Deleted')
  })

  router.post('/:id/checkout', async (req, res) => {
    const id = Number(req.params.id)
    const item = await transform(cfg, id)
    if (!item) return fail(res, 'Not found', 404)
    const qty = Number(req.body?.assigned_qty || req.body?.qty || 1)
    if (qty > item.remaining) return fail(res, 'Insufficient quantity')

    const ts = now()
    if (cfg.table === 'accessories') {
      const assignedTo = Number(req.body?.assigned_to || req.body?.assigned_user)
      if (!assignedTo) return fail(res, 'assigned_to required')
      await run(`
        INSERT INTO accessories_checkout (accessory_id, assigned_to, assigned_type, assigned_qty, note, created_by, created_at)
        VALUES (?, ?, 'user', ?, ?, ?, ?)
      `, [id, assignedTo, qty, req.body?.note || null, req.user?.id || null, ts])
      await logAction({ userId: req.user?.id, actionType: 'checkout', itemType: 'accessory', itemId: id, targetType: 'user', targetId: assignedTo })
      const email = await resolveAssigneeEmail('user', assignedTo)
      notifyWorkflow({
        category: 'custody',
        event: 'accessory.assigned',
        subject: `Accessory assigned: ${item.name}`,
        title: 'Accessory assigned',
        intro: 'An accessory was checked out to a user.',
        fields: [
          { label: 'Accessory', value: String(item.name) },
          { label: 'Qty', value: String(qty) },
          { label: 'User id', value: String(assignedTo) },
          { label: 'Assigned by', value: actorLabel(req.user) },
        ],
        ctaPath: `/accessories/${id}`,
        itemType: 'accessory',
        itemId: id,
        assigneeEmail: email,
      })
    } else if (cfg.table === 'consumables') {
      const assignedTo = Number(req.body?.assigned_to || req.body?.assigned_user)
      if (!assignedTo) return fail(res, 'assigned_to required')
      await run(`
        INSERT INTO consumables_users (consumable_id, assigned_to, assigned_qty, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, assignedTo, qty, req.body?.note || null, req.user?.id || null, ts])
      await logAction({ userId: req.user?.id, actionType: 'checkout', itemType: 'consumable', itemId: id, targetType: 'user', targetId: assignedTo })
      const email = await resolveAssigneeEmail('user', assignedTo)
      notifyWorkflow({
        category: 'custody',
        event: 'consumable.issued',
        subject: `Consumable issued: ${item.name}`,
        title: 'Consumable issued',
        intro: 'A consumable was issued to a user.',
        fields: [
          { label: 'Consumable', value: String(item.name) },
          { label: 'Qty', value: String(qty) },
          { label: 'User id', value: String(assignedTo) },
          { label: 'Issued by', value: actorLabel(req.user) },
        ],
        ctaPath: `/consumables/${id}`,
        itemType: 'consumable',
        itemId: id,
        assigneeEmail: email,
      })
    } else {
      const assetId = Number(req.body?.assigned_to || req.body?.asset_id)
      if (!assetId) return fail(res, 'asset_id required')
      await run(`
        INSERT INTO components_assets (component_id, asset_id, assigned_qty, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, assetId, qty, req.body?.note || null, req.user?.id || null, ts])
      await logAction({ userId: req.user?.id, actionType: 'checkout', itemType: 'component', itemId: id, targetType: 'asset', targetId: assetId })
      notifyWorkflow({
        category: 'custody',
        event: 'component.assigned',
        subject: `Component assigned: ${item.name}`,
        title: 'Component assigned to asset',
        intro: 'A component was installed / assigned to an asset.',
        fields: [
          { label: 'Component', value: String(item.name) },
          { label: 'Qty', value: String(qty) },
          { label: 'Asset id', value: String(assetId) },
          { label: 'Assigned by', value: actorLabel(req.user) },
        ],
        ctaPath: `/components/${id}`,
        itemType: 'component',
        itemId: id,
      })
    }
    return okMessage(res, 'Checked out', await transform(cfg, id))
  })

  router.post('/:id/checkin', async (req, res) => {
    const id = Number(req.params.id)
    const checkoutId = req.body?.checkout_id
    if (cfg.table === 'accessories') {
      if (checkoutId) await run(`DELETE FROM accessories_checkout WHERE id = ? AND accessory_id = ?`, [checkoutId, id])
      else await run(`DELETE FROM accessories_checkout WHERE accessory_id = ? AND id = (SELECT id FROM (SELECT id FROM accessories_checkout WHERE accessory_id = ? LIMIT 1) AS _t)`, [id, id])
    } else if (cfg.table === 'consumables') {
      return fail(res, 'Consumables cannot be checked in (consumed)')
    } else {
      if (checkoutId) await run(`DELETE FROM components_assets WHERE id = ? AND component_id = ?`, [checkoutId, id])
      else await run(`DELETE FROM components_assets WHERE component_id = ? LIMIT 1`, [id])
    }
    await logAction({ userId: req.user?.id, actionType: 'checkin', itemType: cfg.itemType, itemId: id })
    return okMessage(res, 'Checked in', await transform(cfg, id))
  })

  return router
}

export const accessoriesRouter = makeQtyRouter({
  table: 'accessories', idCol: 'accessory_id', checkoutTable: 'accessories_checkout', checkoutTarget: 'user', itemType: 'accessory',
})
export const consumablesRouter = makeQtyRouter({
  table: 'consumables', idCol: 'consumable_id', checkoutTable: 'consumables_users', checkoutTarget: 'user', itemType: 'consumable',
})
export const componentsRouter = makeQtyRouter({
  table: 'components', idCol: 'component_id', checkoutTable: 'components_assets', checkoutTarget: 'asset', itemType: 'component',
})

export const kitsRouter = Router()

kitsRouter.get('/', async (_req, res) => {
  const rows = await all(`
    SELECT k.*,
      (SELECT COUNT(*) FROM kits_models WHERE kit_id = k.id) as models,
      (SELECT COUNT(*) FROM kits_licenses WHERE kit_id = k.id) as licenses,
      (SELECT COUNT(*) FROM kits_accessories WHERE kit_id = k.id) as accessories,
      (SELECT COUNT(*) FROM kits_consumables WHERE kit_id = k.id) as consumables
    FROM kits k ORDER BY k.id
  `)
  return okList(res, rows)
})

kitsRouter.get('/:id', async (req, res) => {
  const kit = await get(`SELECT * FROM kits WHERE id = ?`, [req.params.id])
  if (!kit) return fail(res, 'Kit not found', 404)
  const models = await all(`SELECT * FROM kits_models WHERE kit_id = ?`, [req.params.id])
  const licenses = await all(`SELECT * FROM kits_licenses WHERE kit_id = ?`, [req.params.id])
  const accessories = await all(`SELECT * FROM kits_accessories WHERE kit_id = ?`, [req.params.id])
  const consumables = await all(`SELECT * FROM kits_consumables WHERE kit_id = ?`, [req.params.id])
  return okItem(res, { ...kit as object, models, licenses, accessories, consumables })
})

kitsRouter.post('/', async (req, res) => {
  const name = req.body?.name
  if (!name) return fail(res, 'name required')
  const ts = now()
  const info = await run(`INSERT INTO kits (name, created_at, updated_at) VALUES (?, ?, ?)`, [name, ts, ts])
  return okMessage(res, 'Kit created', { id: info.insertId, name }, 201)
})

kitsRouter.post('/:id/checkout', async (req, res) => {
  const userId = Number(req.body?.assigned_to || req.body?.assigned_user)
  if (!userId) return fail(res, 'assigned_to required')
  await logAction({ userId: req.user?.id, actionType: 'checkout', itemType: 'kit', itemId: Number(req.params.id), targetType: 'user', targetId: userId, note: 'Predefined kit checkout' })
  return okMessage(res, 'Kit checkout recorded (allocate assets/licenses manually or via inventory)')
})
