import crypto from 'node:crypto'
import { all, get, run, now } from '../db/index.js'
import { extractInstalledSoftware } from './agentSoftware.js'

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

/** Parse timestamps written by db.now() (UTC wall clock without timezone). */
function parseDbUtc(ts: string) {
  const s = String(ts).trim()
  if (!s) return NaN
  // Already ISO with offset / Z
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).getTime()
  // MySQL DATETIME / db.now(): treat as UTC
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  return new Date(`${normalized}Z`).getTime()
}

export function agentPresence(lastHeartbeat: string | null | undefined, lastInventory?: string | null) {
  const ts = lastHeartbeat || lastInventory || null
  if (!ts) return { presence: 'never' as const, label: 'No agent', online: false }
  const age = Date.now() - parseDbUtc(String(ts))
  if (Number.isNaN(age)) return { presence: 'never' as const, label: 'No agent', online: false }
  if (age <= ONLINE_MS) return { presence: 'online' as const, label: 'Online', online: true }
  if (age <= STALE_MS) return { presence: 'idle' as const, label: 'Idle', online: false }
  return { presence: 'stale' as const, label: 'Stale', online: false }
}

/** Reject OEM placeholder serials so we fall through to hostname / tag match. */
export function isUsableSerial(serial: string) {
  const t = serial.trim().toLowerCase()
  if (!t || t.length < 3) return false
  if (/^(none|n\/a|na|null|unknown|default string|system serial number|0+)$/i.test(t)) return false
  if (t.includes('to be filled') || t.includes('o.e.m') || t.includes('oem')) return false
  return true
}

export async function findAssetForAgent(opts: {
  serial?: string
  hostname?: string
  assetTag?: string
}) {
  const serialRaw = (opts.serial || '').trim()
  const serial = isUsableSerial(serialRaw) ? serialRaw : ''
  const hostname = (opts.hostname || '').trim()
  const assetTag = (opts.assetTag || '').trim()

  let asset: { id: number; asset_tag: string; serial: string | null } | undefined
  let matchedBy = ''

  // 1) Serial (case-insensitive) — preferred, never creates a duplicate when found
  if (serial) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND serial IS NOT NULL AND LOWER(TRIM(serial)) = LOWER(?)
      ORDER BY id DESC LIMIT 1
    `, [serial])
    if (asset) matchedBy = 'serial'
  }
  // 2) Explicit asset tag
  if (!asset && assetTag) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND LOWER(TRIM(asset_tag)) = LOWER(?)
      LIMIT 1
    `, [assetTag])
    if (asset) matchedBy = 'asset_tag'
  }
  // 3) Hostname ↔ agent_hostname / asset_tag / name
  if (!asset && hostname) {
    asset = await get(`
      SELECT id, asset_tag, serial FROM assets
      WHERE deleted_at IS NULL AND (
        LOWER(TRIM(COALESCE(agent_hostname,''))) = LOWER(?)
        OR LOWER(TRIM(asset_tag)) = LOWER(?)
        OR LOWER(TRIM(COALESCE(name,''))) = LOWER(?)
      )
      ORDER BY last_agent_sync_at DESC, id DESC LIMIT 1
    `, [hostname, hostname, hostname])
    if (asset) matchedBy = 'hostname'
  }
  // 4) Sanitized hostname as asset_tag (how create path names new assets)
  if (!asset && hostname) {
    const tagGuess = hostname.toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').slice(0, 80)
    if (tagGuess) {
      asset = await get(`
        SELECT id, asset_tag, serial FROM assets
        WHERE deleted_at IS NULL AND LOWER(TRIM(asset_tag)) = LOWER(?)
        LIMIT 1
      `, [tagGuess])
      if (asset) matchedBy = 'hostname_tag'
    }
  }

  return { asset, matchedBy, usableSerial: serial }
}

export async function logAgentSync(opts: {
  action: 'updated' | 'created' | 'unmatched' | 'failed' | 'attempt'
  status?: 'ok' | 'error'
  message?: string | null
  assetId?: number | null
  assetTag?: string | null
  serial?: string | null
  hostname?: string | null
  matchedBy?: string | null
  platform?: string | null
  clientIp?: string | null
  snapshotId?: number | null
  summary?: Record<string, unknown> | null
  errorDetail?: string | null
}) {
  const ts = now()
  try {
    await run(`
      INSERT INTO agent_sync_logs (
        action, status, message, asset_id, asset_tag, serial_number, hostname,
        matched_by, platform, client_ip, snapshot_id, payload_summary, error_detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      opts.action,
      opts.status || (opts.action === 'failed' ? 'error' : 'ok'),
      opts.message || null,
      opts.assetId ?? null,
      opts.assetTag || null,
      opts.serial || null,
      opts.hostname || null,
      opts.matchedBy || null,
      opts.platform || null,
      opts.clientIp || null,
      opts.snapshotId ?? null,
      opts.summary ? JSON.stringify(opts.summary) : null,
      opts.errorDetail || null,
      ts,
    ])
  } catch (e) {
    console.error('agent_sync_logs insert failed', e)
  }
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
  // Re-queue scans that were claimed but never finished (agent crashed mid-scan).
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000)
  const staleTs = staleBefore.toISOString().slice(0, 19).replace('T', ' ')
  await run(`
    UPDATE agent_commands
    SET status = 'pending', claimed_at = NULL
    WHERE agent_id = ?
      AND status = 'claimed'
      AND command IN ('scan', 'rerun')
      AND (claimed_at IS NULL OR claimed_at < ?)
  `, [agentId, staleTs]).catch(() => undefined)

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
    const pollAgeMs = agent.last_heartbeat_at
      ? Date.now() - parseDbUtc(String(agent.last_heartbeat_at))
      : Number.POSITIVE_INFINITY
    const polling = Boolean(agent.last_heartbeat_at) && pollAgeMs <= 90_000
    return {
      ok: true as const,
      queued: false,
      command_id: existing.id,
      status: existing.status,
      agent_id: agent.id,
      agent_uuid: agent.agent_uuid,
      polling,
      message: existing.status === 'claimed'
        ? 'Scan already in progress'
        : (polling
          ? 'Scan already queued — waiting for next agent poll'
          : 'Scan still queued, but the agent is not polling. On the PC use Install & Start (service), not Sync once only.'),
    }
  }

  const presence = agentPresence(agent.last_heartbeat_at)
  const pollAgeMs = agent.last_heartbeat_at
    ? Date.now() - parseDbUtc(String(agent.last_heartbeat_at))
    : Number.POSITIVE_INFINITY
  const polling = Boolean(agent.last_heartbeat_at) && pollAgeMs <= 90_000

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
    polling,
    message: polling
      ? 'Scan requested — agent will run on next poll (~30s)'
      : 'Scan queued, but the agent is not polling. On the PC run Install & Start (not only Sync once), then wait for Online + a fresh heartbeat.',
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

  const recentSyncs = await all(`
    SELECT id, action, status, message, serial_number, hostname, matched_by, client_ip, created_at
    FROM agent_sync_logs
    WHERE asset_id = ?
    ORDER BY id DESC LIMIT 20
  `, [assetId]).catch(() => [])

  let installed_software: ReturnType<typeof extractInstalledSoftware> = []
  let installed_software_count = 0
  try {
    const latestSnap = await get<{ payload: unknown }>(`
      SELECT payload FROM asset_agent_snapshots
      WHERE asset_id = ?
      ORDER BY id DESC LIMIT 1
    `, [assetId])
    if (latestSnap?.payload) {
      const raw = typeof latestSnap.payload === 'string'
        ? JSON.parse(latestSnap.payload)
        : latestSnap.payload
      installed_software = extractInstalledSoftware(raw)
      installed_software_count = installed_software.length
    }
  } catch {
    /* ignore parse errors */
  }

  const presence = agentPresence(agent?.last_heartbeat_at)
  // Remote scan needs the *service loop* (heartbeat poll). A one-shot Sync only updates inventory.
  const pollAgeMs = agent?.last_heartbeat_at
    ? Date.now() - parseDbUtc(String(agent.last_heartbeat_at))
    : Number.POSITIVE_INFINITY
  const polling = Boolean(agent?.last_heartbeat_at) && pollAgeMs <= 90_000

  return {
    registered: Boolean(agent),
    presence: presence.presence,
    presence_label: presence.label,
    online: presence.online,
    polling,
    poll_interval_ms: Number(process.env.AGENT_POLL_INTERVAL_MS || 30000),
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
    recent_syncs: recentSyncs,
    installed_software_count,
    installed_software: installed_software.slice(0, 800),
  }
}
