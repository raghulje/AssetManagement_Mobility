/**
 * ITAgent_2026 — cross-platform desktop agent (Windows / macOS / Linux)
 * One-shot: npm run sync
 * Service loop (register + heartbeat + remote scan): npm run watch
 */
import si from 'systeminformation'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const apiBase = (process.env.REFEX_API_URL || 'https://asset.refexone.com/api/v1').replace(/\/$/, '')
const agentKey = process.env.REFEX_AGENT_KEY || ''
const assetTag = process.env.REFEX_ASSET_TAG || ''
const agentVersion = '2026.1'
const pollMs = Number(process.env.REFEX_AGENT_POLL_MS || 30000)
const fullSyncMs = Number(process.env.REFEX_AGENT_INTERVAL_MS || 3600000)
const stateDir = process.env.REFEX_AGENT_STATE_DIR
  || path.join(process.env.PROGRAMDATA || process.env.HOME || '.', 'ITAgent_2026')
const stateFile = path.join(stateDir, 'agent.json')

async function collect() {
  const [system, bios, cpu, mem, osInfo] = await Promise.all([
    si.system(),
    si.bios(),
    si.cpu(),
    si.mem(),
    si.osInfo(),
  ])

  let software = ''
  try {
    const apps = await si.versions()
    software = JSON.stringify(apps).slice(0, 4000)
  } catch {
    software = ''
  }

  return {
    Computer_Name: os.hostname(),
    Host_Name: os.hostname(),
    Serial_Number: system.serial || bios.serial || '',
    OS_Name: `${osInfo.distro || osInfo.platform} ${osInfo.release || ''}`.trim(),
    OS_Version: osInfo.release || osInfo.kernel || '',
    OS_Manufacturer: osInfo.platform,
    System_Manufacturer: system.manufacturer || '',
    System_Model: system.model || '',
    Processor: cpu.brand || '',
    Domain: osInfo.domain || '',
    BIOS_Version: bios.version || '',
    Total_Physical_RAM: String(mem.total || ''),
    Virtual_RAM_Available: String(mem.available || ''),
    Installed_Software: software,
    platform: process.platform,
    Created_By: 'ITAgent_2026',
    agent_version: agentVersion,
    create_if_missing: true,
    ...(assetTag ? { asset_tag: assetTag } : {}),
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return null
  }
}

function saveState(state) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
}

function headers(state) {
  const h = { 'Content-Type': 'application/json' }
  if (agentKey) h['X-Agent-Key'] = agentKey
  if (state?.agent_uuid && state?.agent_token) {
    h['X-Agent-Id'] = state.agent_uuid
    h['X-Agent-Token'] = state.agent_token
  }
  return h
}

async function post(pathname, body, state) {
  const res = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: headers(state),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.messages?.[0] || res.statusText
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

async function register() {
  const inv = await collect()
  const data = await post('/agent/register', {
    Computer_Name: inv.Computer_Name,
    Serial_Number: inv.Serial_Number,
    platform: process.platform,
    agent_version: agentVersion,
    ...(assetTag ? { asset_tag: assetTag } : {}),
  }, null)
  const p = data.payload || {}
  if (!p.agent_uuid || !p.agent_token) throw new Error('Register missing credentials')
  const state = {
    agent_uuid: p.agent_uuid,
    agent_token: p.agent_token,
    asset_id: p.asset_id,
    registered_at: new Date().toISOString(),
    api_base: apiBase,
  }
  saveState(state)
  console.log('Registered', state.agent_uuid)
  return state
}

async function ensureRegistered() {
  let state = loadState()
  if (!state?.agent_uuid || !state?.agent_token) state = await register()
  return state
}

async function syncOnce(state, commandId = null) {
  const payload = await collect()
  if (commandId) payload.command_id = commandId
  const data = await post('/agent/sync', payload, state)
  console.log('Sync OK', JSON.stringify({
    matched: data.payload?.matched,
    matched_by: data.payload?.matched_by,
    asset_id: data.payload?.asset?.id,
  }))
  return data
}

async function heartbeat(state) {
  return post('/agent/heartbeat', {
    hostname: os.hostname(),
    platform: process.platform,
    agent_version: agentVersion,
  }, state)
}

async function ackFailed(state, commandId, error) {
  try {
    await post(`/agent/commands/${commandId}/ack`, { ok: false, error: String(error) }, state)
  } catch {
    /* ignore */
  }
}

const loop = process.argv.includes('--loop') || process.argv.includes('watch')

if (!loop) {
  // One-shot: sync only (legacy). Optional register if REFEX_AGENT_REGISTER=1
  let state = loadState()
  if (process.env.REFEX_AGENT_REGISTER === '1' || !state) {
    try { state = await ensureRegistered() } catch (e) {
      console.warn('Register skipped/failed:', e.message)
      state = null
    }
  }
  await syncOnce(state)
  process.exit(process.exitCode || 0)
}

console.log(`ITAgent_2026 service → ${apiBase} (poll ${pollMs}ms)`)
console.log('State:', stateFile)

let state = await ensureRegistered()
try { await syncOnce(state) } catch (e) { console.error('Initial sync failed', e.message) }

let lastFull = Date.now()

async function tick() {
  try {
    const hb = await heartbeat(state)
    const cmds = hb.payload?.commands || []
    for (const cmd of cmds) {
      console.log(new Date().toISOString(), `Command #${cmd.id}: ${cmd.command}`)
      if (cmd.command === 'scan' || cmd.command === 'rerun') {
        try {
          await syncOnce(state, cmd.id)
        } catch (e) {
          await ackFailed(state, cmd.id, e.message)
          console.error('Command failed', e.message)
        }
      }
    }
    if (Date.now() - lastFull >= fullSyncMs) {
      await syncOnce(state)
      lastFull = Date.now()
    }
  } catch (e) {
    console.error(new Date().toISOString(), 'Loop error', e.message)
    if (e.status === 401) {
      try { state = await register() } catch (re) { console.error('Re-register failed', re.message) }
    }
  }
}

await tick()
setInterval(() => { void tick() }, pollMs)
