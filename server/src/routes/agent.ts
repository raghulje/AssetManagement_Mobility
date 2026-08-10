import { Router } from 'express'
import { get, run, now } from '../db/index.js'
import { fail, okItem, okMessage } from '../utils/response.js'
import { ensureAssetQr } from '../services/assetQr.js'
import { transformAsset } from '../services/transformers.js'
import { logAction } from '../services/actionLog.js'
import {
  authenticateAgent,
  claimPendingCommands,
  completeClaimedScans,
  completeCommand,
  findAssetForAgent,
  logAgentSync,
  newAgentCredentials,
  readAgentAuth,
} from '../services/agentControl.js'

const router = Router()
const AGENT_VERSION_DEFAULT = '2026.1'

function sharedKeyAuthorized(req: { headers: Record<string, unknown> }) {
  const expected = process.env.AGENT_API_KEY || ''
  if (!expected) return true
  const key = String(req.headers['x-agent-key'] || req.headers['authorization'] || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  return key === expected
}

function truthy(v: unknown) {
  if (v === true || v === 1) return true
  const s = String(v || '').toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || req.socket?.remoteAddress || null
}

async function ensureAgentModel(manufacturerName: string, modelName: string) {
  const mfgName = manufacturerName || 'Unknown'
  const modName = modelName || 'Agent Device'
  let mfg = await get<{ id: number }>(`SELECT id FROM manufacturers WHERE name = ? LIMIT 1`, [mfgName])
  if (!mfg) {
    const ts = now()
    const info = await run(
      `INSERT INTO manufacturers (name, created_at, updated_at) VALUES (?, ?, ?)`,
      [mfgName, ts, ts],
    )
    mfg = { id: Number(info.insertId) }
  }
  let model = await get<{ id: number }>(`
    SELECT id FROM models WHERE name = ? AND manufacturer_id = ? AND deleted_at IS NULL LIMIT 1
  `, [modName, mfg.id])
  if (!model) {
    const cat = await get<{ id: number }>(`SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY id LIMIT 1`)
    const ts = now()
    const info = await run(`
      INSERT INTO models (name, model_number, category_id, manufacturer_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [modName, null, cat?.id || null, mfg.id, ts, ts])
    model = { id: Number(info.insertId) }
  }
  return model.id
}

/**
 * Register (or re-bind) an installed agent. Returns uuid + token once — store on disk.
 * Auth: shared AGENT_API_KEY when configured.
 */
router.post('/register', async (req, res) => {
  if (!sharedKeyAuthorized(req)) return fail(res, 'Unauthorized agent', 401)

  const b = req.body || {}
  const serial = String(b.Serial_Number || b.serial_number || b.serial || '').trim()
  const hostname = String(b.Computer_Name || b.Host_Name || b.hostname || '').trim()
  const assetTag = String(b.asset_tag || b.Asset_Tag || '').trim()
  const platform = String(b.platform || '').trim() || null
  const agentVersion = String(b.agent_version || b.version || AGENT_VERSION_DEFAULT).trim()

  if (!serial && !hostname && !assetTag) {
    return fail(res, 'serial, hostname, or asset_tag is required')
  }

  const { asset, matchedBy } = await findAssetForAgent({ serial, hostname, assetTag })
  const creds = newAgentCredentials()
  const ts = now()
  const ip = clientIp(req)

  // Re-register same host/serial: rotate token on existing row when possible
  let existing = serial
    ? await get<{ id: number }>(`SELECT id FROM agents WHERE serial_number = ? ORDER BY id DESC LIMIT 1`, [serial])
    : undefined
  if (!existing && hostname) {
    existing = await get(`SELECT id FROM agents WHERE hostname = ? ORDER BY id DESC LIMIT 1`, [hostname])
  }

  if (existing) {
    await run(`
      UPDATE agents SET
        agent_uuid = ?, token_hash = ?, asset_id = COALESCE(?, asset_id),
        hostname = COALESCE(?, hostname), serial_number = COALESCE(?, serial_number),
        platform = COALESCE(?, platform), agent_version = ?,
        last_heartbeat_at = ?, last_ip = ?, updated_at = ?
      WHERE id = ?
    `, [
      creds.agent_uuid, creds.token_hash, asset?.id || null,
      hostname || null, serial || null, platform, agentVersion,
      ts, ip, ts, existing.id,
    ])
  } else {
    await run(`
      INSERT INTO agents (
        agent_uuid, token_hash, asset_id, hostname, serial_number, platform,
        agent_version, last_heartbeat_at, last_ip, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      creds.agent_uuid, creds.token_hash, asset?.id || null, hostname || null, serial || null,
      platform, agentVersion, ts, ip, ts, ts,
    ])
  }

  const agent = await get(`SELECT id, agent_uuid, asset_id, hostname, serial_number FROM agents WHERE agent_uuid = ?`, [creds.agent_uuid])

  return okMessage(res, 'Agent registered', {
    agent_uuid: creds.agent_uuid,
    agent_token: creds.agent_token,
    agent_id: agent?.id,
    asset_id: asset?.id || null,
    matched_by: matchedBy || null,
    poll_interval_ms: Number(process.env.AGENT_POLL_INTERVAL_MS || 30000),
  })
})

/**
 * Lightweight heartbeat — updates liveness and returns claimed commands (scan/rerun).
 */
router.post('/heartbeat', async (req, res) => {
  const { uuid, token } = readAgentAuth(req)
  const agent = await authenticateAgent(uuid, token)
  if (!agent) {
    // allow shared key + uuid for recovery? No — require token
    if (!sharedKeyAuthorized(req)) return fail(res, 'Unauthorized agent', 401)
    return fail(res, 'Invalid agent credentials', 401)
  }

  const b = req.body || {}
  const ts = now()
  const ip = clientIp(req)
  const hostname = String(b.hostname || b.Computer_Name || '').trim() || null
  const platform = String(b.platform || '').trim() || null
  const agentVersion = String(b.agent_version || '').trim() || null

  await run(`
    UPDATE agents SET
      last_heartbeat_at = ?,
      last_ip = ?,
      hostname = COALESCE(?, hostname),
      platform = COALESCE(?, platform),
      agent_version = COALESCE(?, agent_version),
      updated_at = ?
    WHERE id = ?
  `, [ts, ip, hostname, platform, agentVersion, ts, agent.id])

  const commands = await claimPendingCommands(agent.id)

  return okMessage(res, 'Heartbeat ok', {
    agent_id: agent.id,
    asset_id: agent.asset_id,
    server_time: ts,
    commands,
  })
})

/**
 * Ack a command (done/failed) without a full inventory sync.
 */
router.post('/commands/:id/ack', async (req, res) => {
  const { uuid, token } = readAgentAuth(req)
  const agent = await authenticateAgent(uuid, token)
  if (!agent) return fail(res, 'Unauthorized agent', 401)

  const commandId = Number(req.params.id)
  if (!commandId) return fail(res, 'Invalid command id')

  const b = req.body || {}
  const ok = b.ok !== false && !b.error
  await completeCommand(
    commandId,
    agent.id,
    b.result ?? null,
    ok ? null : String(b.error || b.error_message || 'Command failed'),
  )

  return okMessage(res, ok ? 'Command completed' : 'Command failed', { command_id: commandId })
})

/**
 * Inventory sync — HSAgent-compatible payload.
 * Match existing asset (serial → tag → hostname) and UPDATE; only CREATE when none match.
 * Every attempt is written to agent_sync_logs + action_logs.
 */
router.post('/sync', async (req, res) => {
  const ip = clientIp(req)
  const { uuid, token } = readAgentAuth(req)
  let agent = uuid && token ? await authenticateAgent(uuid, token) : null
  if (!agent && !sharedKeyAuthorized(req)) {
    await logAgentSync({
      action: 'failed', status: 'error', message: 'Unauthorized agent',
      clientIp: ip, errorDetail: 'Missing or invalid agent credentials',
    })
    return fail(res, 'Unauthorized agent', 401)
  }

  const b = req.body || {}
  const serialRaw = String(
    b.Serial_Number || b.serial_number || b.serial || b.serialnumber || '',
  ).trim()
  const hostname = String(
    b.Computer_Name || b.Host_Name || b.hostname || b.computerName || '',
  ).trim()
  const assetTag = String(b.asset_tag || b.Asset_Tag || b.assetTag || '').trim()
  const platform = String(b.platform || b.OS_Name || b.osname || b.osName || '').trim() || null
  const createIfMissing = truthy(b.create_if_missing ?? b.createIfMissing ?? true)
  const commandId = b.command_id != null ? Number(b.command_id) : null

  if (!serialRaw && !hostname && !assetTag) {
    await logAgentSync({
      action: 'failed', status: 'error',
      message: 'serial, hostname, or asset_tag is required',
      clientIp: ip,
    })
    return fail(res, 'serial, hostname, or asset_tag is required')
  }

  try {
    let { asset, matchedBy, usableSerial } = await findAssetForAgent({
      serial: serialRaw, hostname, assetTag,
    })
    const serial = usableSerial || (serialRaw || null)

    // Prefer bound asset from registered agent
    if (!asset && agent?.asset_id) {
      asset = await get(`SELECT id, asset_tag, serial FROM assets WHERE id = ? AND deleted_at IS NULL`, [agent.asset_id])
      if (asset) matchedBy = 'agent_binding'
    }

    let created = false
    let action: 'updated' | 'created' | 'unmatched' = 'unmatched'
    const ts = now()
    const manufacturer = String(b.System_Manufacturer || b.systemmanufacturer || b.systemManufacturer || '').trim()
    const systemModel = String(b.System_Model || b.systemmodel || b.systemModel || '').trim()
    const processor = String(b.Processor || b.processor || '').trim()
    const osName = String(b.OS_Name || b.osname || b.osName || '').trim()

    await logAgentSync({
      action: 'attempt',
      message: `Sync received from ${hostname || serialRaw || 'unknown'}`,
      serial: serialRaw || null,
      hostname: hostname || null,
      platform,
      clientIp: ip,
      summary: { create_if_missing: createIfMissing, manufacturer, systemModel },
    })

    if (!asset && createIfMissing) {
      const status = await get<{ id: number }>(`
        SELECT id FROM status_labels WHERE type = 'deployable' ORDER BY default_label DESC, id ASC LIMIT 1
      `)
      if (!status) {
        await logAgentSync({
          action: 'failed', status: 'error',
          message: 'No deployable status label configured',
          serial: serialRaw, hostname, clientIp: ip,
        })
        return fail(res, 'No deployable status label configured', 500)
      }

      const modelId = await ensureAgentModel(manufacturer, systemModel || hostname || 'Agent Device')
      let tag = assetTag
        || (hostname ? hostname.toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').slice(0, 80) : '')
        || (usableSerial ? `AGENT-${usableSerial.slice(0, 40)}` : `AGENT-${Date.now()}`)
      const taken = await get(`SELECT id FROM assets WHERE asset_tag = ?`, [tag])
      if (taken) tag = `${tag}-${String(Date.now()).slice(-4)}`

      const notes = [
        'Created by ITAgent_2026',
        osName ? `OS: ${osName}` : '',
        processor ? `CPU: ${processor}` : '',
        manufacturer ? `OEM: ${manufacturer}` : '',
      ].filter(Boolean).join('\n')

      const info = await run(`
        INSERT INTO assets (
          asset_tag, name, serial, model_id, status_id, notes,
          agent_hostname, last_agent_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tag,
        systemModel || hostname || tag,
        usableSerial || null,
        modelId,
        status.id,
        notes,
        hostname || null,
        ts,
        ts,
        ts,
      ])
      const newId = Number(info.insertId)
      await ensureAssetQr(newId).catch(() => undefined)
      asset = { id: newId, asset_tag: tag, serial: usableSerial || null }
      matchedBy = 'created'
      created = true
      action = 'created'
    }

    const payloadJson = JSON.stringify(b)

    const snap = await run(`
      INSERT INTO asset_agent_snapshots (asset_id, serial_number, hostname, platform, payload, matched_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [asset?.id || null, serialRaw || null, hostname || null, platform, payloadJson, matchedBy || null, ts])

    if (asset && !created) {
      action = 'updated'
      const updates: string[] = [
        'last_agent_sync_at = ?',
        'agent_hostname = ?',
        'updated_at = ?',
      ]
      const params: unknown[] = [ts, hostname || null, ts]
      // Fill serial only when asset has none and we have a usable serial
      if (usableSerial && !asset.serial) {
        updates.push('serial = ?')
        params.push(usableSerial)
      }
      if (systemModel) {
        updates.push('name = COALESCE(NULLIF(name, \'\'), ?)')
        params.push(systemModel)
      }
      params.push(asset.id)
      await run(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    if (agent) {
      await run(`
        UPDATE agents SET
          asset_id = COALESCE(?, asset_id),
          hostname = COALESCE(?, hostname),
          serial_number = COALESCE(?, serial_number),
          platform = COALESCE(?, platform),
          last_heartbeat_at = ?,
          last_inventory_at = ?,
          last_ip = ?,
          updated_at = ?
        WHERE id = ?
      `, [
        asset?.id || null, hostname || null, usableSerial || serialRaw || null, platform,
        ts, ts, ip, ts, agent.id,
      ])

      const syncResult = {
        snapshot_id: snap.insertId,
        asset_id: asset?.id || null,
        matched_by: matchedBy || null,
        action,
      }
      if (commandId) {
        await completeCommand(commandId, agent.id, syncResult)
      } else {
        await completeClaimedScans(agent.id, syncResult)
      }
    }

    const message = created
      ? `Asset created: ${asset?.asset_tag}`
      : asset
        ? `Asset updated: ${asset.asset_tag} (matched by ${matchedBy})`
        : 'Snapshot stored — no matching asset (create_if_missing=false)'

    await logAgentSync({
      action,
      status: 'ok',
      message,
      assetId: asset?.id || null,
      assetTag: asset?.asset_tag || null,
      serial: serialRaw || null,
      hostname: hostname || null,
      matchedBy: matchedBy || null,
      platform,
      clientIp: ip,
      snapshotId: Number(snap.insertId),
      summary: {
        action,
        matched_by: matchedBy || null,
        os: osName || null,
        model: systemModel || null,
        manufacturer: manufacturer || null,
      },
    })

    await logAction({
      actionType: created ? 'agent_create' : asset ? 'agent_update' : 'agent_unmatched',
      itemType: 'asset',
      itemId: asset?.id || null,
      note: message,
      meta: {
        hostname, serial: serialRaw, matched_by: matchedBy, snapshot_id: snap.insertId, client_ip: ip,
      },
    }).catch(() => undefined)

    const detail = asset ? await transformAsset(asset.id) : null
    const nextCommands = agent ? await claimPendingCommands(agent.id) : []

    return okMessage(res, message, {
      snapshot_id: snap.insertId,
      action,
      matched: Boolean(asset),
      created,
      updated: action === 'updated',
      matched_by: matchedBy || null,
      asset: detail || (asset
        ? { id: asset.id, asset_tag: asset.asset_tag, serial: asset.serial || usableSerial || null }
        : null),
      commands: nextCommands,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    await logAgentSync({
      action: 'failed', status: 'error',
      message: 'Sync failed',
      serial: serialRaw, hostname, clientIp: ip,
      errorDetail: errMsg,
    })
    return fail(res, errMsg, 500)
  }
})

router.get('/snapshots', async (req, res) => {
  if (!sharedKeyAuthorized(req)) return fail(res, 'Unauthorized agent', 401)
  const assetId = req.query.asset_id ? Number(req.query.asset_id) : null
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const { all } = await import('../db/index.js')
  const rows = assetId
    ? await all(`
        SELECT id, asset_id, serial_number, hostname, platform, matched_by, created_at
        FROM asset_agent_snapshots WHERE asset_id = ? ORDER BY id DESC LIMIT ${limit}
      `, [assetId])
    : await all(`
        SELECT id, asset_id, serial_number, hostname, platform, matched_by, created_at
        FROM asset_agent_snapshots ORDER BY id DESC LIMIT ${limit}
      `)
  return okItem(res, { rows })
})

export default router
