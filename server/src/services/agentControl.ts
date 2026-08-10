import crypto from 'node:crypto'
import { all, get, run, now } from '../db/index.js'

export type AgentRow = {
  id: number
  agent_uuid: string
  token_hash: string
  asset_id: number | null
  hostname: string | null
  serial_number: string | null
  platform: string | null
  agent_version: string | null
  last_heartbeat_at: string | null
  last_inventory_at: string | null
}

export type AgentCommandRow = {
  id: number
  agent_id: number
  asset_id: number | null
  command: string
  status: string
  payload: unknown
  created_at: string | null
}

const ONLINE_MS = 5 * 60 * 1000
const STALE_MS = 24 * 60 * 60 * 1000

export function hashAgentToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function newAgentCredentials() {
  const agent_uuid = crypto.randomUUID()
  const agent_token = crypto.randomBytes(32).toString('hex')
  return { agent_uuid, agent_token, token_hash: hashAgentToken(agent_token) }
}

export function agentPresence(lastHeartbeat: string | null | undefined, lastInventory?: string | null) {
  const ts = lastHeartbeat || lastInventory || null
  if (!ts) return { presence: 'never' as const, label: 'No agent', online: false }
  const age = Date.now() - new Date(ts).getTime()
  if (Number.isNaN(age)) return { presence: 'never' as const, label: 'No agent', online: false }
  if (age <= ONLINE_MS) return { presence: 'online' as const, label: 'Online', online: true }
  if (age <= STALE_MS) return { presence: 'idle' as const, label: 'Idle', online: false }
  return { presence: 'stale' as const, label: 'Stale', online: false }
}

export async function findAssetForAgent(opts: {
  serial?: string
  hostname?: string
  assetTag?: string
}) {
  const serial = (opts.serial || '').trim()
  const hostname = (opts.hostname || '').trim()
  const assetTag = (opts.assetTag || '').trim()

  let asset: { id: number; asset_tag: string; serial: string | null } | undefined
  let matchedBy = ''

  if (serial) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND serial = ?
      ORDER BY id DESC LIMIT 1
    `, [serial])
    if (asset) matchedBy = 'serial'
  }
  if (!asset && assetTag) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND asset_tag = ?
      LIMIT 1
    `, [assetTag])
    if (asset) matchedBy = 'asset_tag'
  }
  if (!asset && hostname) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND (agent_hostname = ? OR name = ? OR asset_tag = ?)
      ORDER BY last_agent_sync_at DESC LIMIT 1
    `, [hostname, hostname, hostname])
    if (asset) matchedBy = 'hostname'
  }

  return { asset, matchedBy }
}

export async function getAgentByUuid(uuid: string) {
  return get<AgentRow>(`SELECT * FROM agents WHERE agent_uuid = ? LIMIT 1`, [uuid])
}

export async function authenticateAgent(uuid: string, token: string) {
  if (!uuid || !token) return null
  const row = await getAgentByUuid(uuid)
  if (!row) return null
  if (row.token_hash !== hashAgentToken(token)) return null
  return row
}

export function readAgentAuth(req: { headers: Record<string, unknown>; body?: Record<string, unknown> }) {
  const h = req.headers || {}
  const b = req.body || {}
  const uuid = String(h['x-agent-id'] || h['x-agent-uuid'] || b.agent_uuid || b.agent_id || '').trim()
  const token = String(h['x-agent-token'] || b.agent_token || '').trim()
  return { uuid, token }
}

export async function claimPendingCommands(agentId: number, limit = 5) {
  const pending = await all<AgentCommandRow>(`
    SELECT id, agent_id, asset_id, command, status, payload, created_at
    FROM agent_commands
    WHERE agent_id = ? AND status = 'pending'
    ORDER BY id ASC
    LIMIT ${Math.min(limit, 20)}
  `, [agentId])

  if (!pending.length) return []

  const ts = now()
  const ids = pending.map((c) => c.id)
  await run(`
    UPDATE agent_commands
    SET status = 'claimed', claimed_at = ?
    WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'pending'
  `, [ts, ...ids])

  return pending.map((c) => ({
    id: c.id,
    command: c.command,
    asset_id: c.asset_id,
    payload: typeof c.payload === 'string' ? (() => { try { return JSON.parse(c.payload as string) } catch { return c.payload } })() : c.payload,
    created_at: c.created_at,
  }))
}

export async function completeCommand(
  commandId: number,
  agentId: number,
  result: unknown = null,
  errorMessage: string | null = null,
) {
  const ts = now()
  const status = errorMessage ? 'failed' : 'done'
  await run(`
    UPDATE agent_commands
    SET status = ?, result = ?, error_message = ?, completed_at = ?
    WHERE id = ? AND agent_id = ? AND status IN ('pending', 'claimed')
  `, [status, result ? JSON.stringify(result) : null, errorMessage, ts, commandId, agentId])
}

export async function completeClaimedScans(agentId: number, result: unknown = null) {
  const ts = now()
  await run(`
    UPDATE agent_commands
    SET status = 'done', result = ?, completed_at = ?
    WHERE agent_id = ? AND status = 'claimed' AND command IN ('scan', 'rerun')
  `, [result ? JSON.stringify(result) : null, ts, agentId])
}

export async function enqueueScanCommand(opts: {
  assetId: number
  requestedBy?: number | null
  command?: 'scan' | 'rerun'
}) {
  const agent = await get<AgentRow>(`
    SELECT * FROM agents WHERE asset_id = ? ORDER BY last_heartbeat_at DESC, id DESC LIMIT 1
  `, [opts.assetId])
  if (!agent) {
    return { ok: false as const, error: 'No agent registered for this asset. Install ITAgent_2026 on the device first.' }
  }

  const existing = await get<{ id: number; status: string }>(`
    SELECT id, status FROM agent_commands
    WHERE agent_id = ? AND command IN ('scan', 'rerun') AND status IN ('pending', 'claimed')
    ORDER BY id DESC LIMIT 1
  `, [agent.id])
  if (existing) {
    return {
      ok: true as const,
      queued: false,
      command_id: existing.id,
      status: existing.status,
      agent_id: agent.id,
      agent_uuid: agent.agent_uuid,
      message: existing.status === 'claimed' ? 'Scan already in progress' : 'Scan already queued',
    }
  }

  const ts = now()
  const command = opts.command || 'scan'
  const info = await run(`
    INSERT INTO agent_commands (agent_id, asset_id, command, status, requested_by, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `, [agent.id, opts.assetId, command, opts.requestedBy || null, ts])

  return {
    ok: true as const,
    queued: true,
    command_id: Number(info.insertId),
    status: 'pending',
    agent_id: agent.id,
    agent_uuid: agent.agent_uuid,
    message: 'Scan requested — agent will run on next poll',
  }
}

export async function getAssetAgentStatus(assetId: number) {
  const agent = await get<AgentRow & { last_ip: string | null }>(`
    SELECT * FROM agents WHERE asset_id = ? ORDER BY last_heartbeat_at DESC, id DESC LIMIT 1
  `, [assetId])

  const asset = await get<{ last_agent_sync_at: string | null; agent_hostname: string | null }>(`
    SELECT last_agent_sync_at, agent_hostname FROM assets WHERE id = ? AND deleted_at IS NULL
  `, [assetId])

  const pending = agent
    ? await get<{ c: number }>(`
        SELECT COUNT(*) as c FROM agent_commands
        WHERE agent_id = ? AND status IN ('pending', 'claimed')
      `, [agent.id])
    : null

  const recent = agent
    ? await all(`
        SELECT id, command, status, error_message, created_at, claimed_at, completed_at
        FROM agent_commands WHERE agent_id = ?
        ORDER BY id DESC LIMIT 10
      `, [agent.id])
    : []

  const presence = agentPresence(agent?.last_heartbeat_at, agent?.last_inventory_at || asset?.last_agent_sync_at)

  return {
    registered: Boolean(agent),
    presence: presence.presence,
    presence_label: presence.label,
    online: presence.online,
    agent: agent
      ? {
          id: agent.id,
          agent_uuid: agent.agent_uuid,
          hostname: agent.hostname,
          serial_number: agent.serial_number,
          platform: agent.platform,
          agent_version: agent.agent_version,
          last_heartbeat_at: agent.last_heartbeat_at,
          last_inventory_at: agent.last_inventory_at,
          last_ip: agent.last_ip,
        }
      : null,
    last_agent_sync_at: asset?.last_agent_sync_at || null,
    agent_hostname: asset?.agent_hostname || null,
    pending_commands: Number(pending?.c || 0),
    recent_commands: recent,
  }
}
