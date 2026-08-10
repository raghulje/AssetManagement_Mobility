import { all, get, run, now } from '../db/index.js'
import { mailConfigured, sendMail } from './mail.js'

const LEAD_DAYS = 30

export type EolDueRow = {
  id: number
  asset_tag: string
  name: string | null
  purchase_date: string | null
  eol_date: string | null
  warranty_end: string | null
  model_name: string | null
  days_to_eol: number | null
  days_to_warranty: number | null
  eol_due: boolean
  warranty_due: boolean
}

function todaySql() {
  return now().slice(0, 10)
}

export type EolListFilters = {
  companyId?: number | null
  locationId?: number | null
  search?: string
}

/** Assets with EOL and/or warranty ending within lead window (or overdue). */
export async function listEolDueAssets(filters: EolListFilters = {}): Promise<EolDueRow[]> {
  const params: unknown[] = []
  let extra = ''
  if (filters.companyId) {
    extra += ' AND a.company_id = ?'
    params.push(filters.companyId)
  }
  if (filters.locationId) {
    extra += ' AND (a.location_id = ? OR a.rtd_location_id = ?)'
    params.push(filters.locationId, filters.locationId)
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    extra += ' AND (a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial LIKE ?)'
    params.push(q, q, q)
  }

  const rows = await all<Record<string, unknown>>(`
    SELECT
      a.id,
      a.asset_tag,
      a.name,
      a.purchase_date,
      m.name AS model_name,
      COALESCE(a.asset_eol_date, IF(a.purchase_date IS NOT NULL AND m.eol IS NOT NULL AND m.eol > 0,
        DATE_ADD(a.purchase_date, INTERVAL m.eol MONTH), NULL)) AS eol_date,
      IF(a.purchase_date IS NOT NULL AND a.warranty_months IS NOT NULL AND a.warranty_months > 0,
        DATE_ADD(a.purchase_date, INTERVAL a.warranty_months MONTH), NULL) AS warranty_end,
      DATEDIFF(
        COALESCE(a.asset_eol_date, IF(a.purchase_date IS NOT NULL AND m.eol IS NOT NULL AND m.eol > 0,
          DATE_ADD(a.purchase_date, INTERVAL m.eol MONTH), NULL)),
        CURDATE()
      ) AS days_to_eol,
      DATEDIFF(
        IF(a.purchase_date IS NOT NULL AND a.warranty_months IS NOT NULL AND a.warranty_months > 0,
          DATE_ADD(a.purchase_date, INTERVAL a.warranty_months MONTH), NULL),
        CURDATE()
      ) AS days_to_warranty
    FROM assets a
    LEFT JOIN models m ON m.id = a.model_id
    WHERE a.deleted_at IS NULL
      ${extra}
      AND (
        (
          COALESCE(a.asset_eol_date, IF(a.purchase_date IS NOT NULL AND m.eol IS NOT NULL AND m.eol > 0,
            DATE_ADD(a.purchase_date, INTERVAL m.eol MONTH), NULL)) IS NOT NULL
          AND COALESCE(a.asset_eol_date, IF(a.purchase_date IS NOT NULL AND m.eol IS NOT NULL AND m.eol > 0,
            DATE_ADD(a.purchase_date, INTERVAL m.eol MONTH), NULL))
            <= DATE_ADD(CURDATE(), INTERVAL ${LEAD_DAYS} DAY)
        )
        OR (
          a.purchase_date IS NOT NULL AND a.warranty_months IS NOT NULL AND a.warranty_months > 0
          AND DATE_ADD(a.purchase_date, INTERVAL a.warranty_months MONTH)
            <= DATE_ADD(CURDATE(), INTERVAL ${LEAD_DAYS} DAY)
        )
      )
    ORDER BY COALESCE(
      COALESCE(a.asset_eol_date, IF(a.purchase_date IS NOT NULL AND m.eol IS NOT NULL AND m.eol > 0,
        DATE_ADD(a.purchase_date, INTERVAL m.eol MONTH), NULL)),
      IF(a.purchase_date IS NOT NULL AND a.warranty_months IS NOT NULL AND a.warranty_months > 0,
        DATE_ADD(a.purchase_date, INTERVAL a.warranty_months MONTH), NULL)
    ) ASC
  `, params)

  return rows.map((r) => {
    const daysEol = r.days_to_eol == null ? null : Number(r.days_to_eol)
    const daysWar = r.days_to_warranty == null ? null : Number(r.days_to_warranty)
    return {
      id: Number(r.id),
      asset_tag: String(r.asset_tag || ''),
      name: r.name != null ? String(r.name) : null,
      purchase_date: r.purchase_date != null ? String(r.purchase_date).slice(0, 10) : null,
      eol_date: r.eol_date != null ? String(r.eol_date).slice(0, 10) : null,
      warranty_end: r.warranty_end != null ? String(r.warranty_end).slice(0, 10) : null,
      model_name: r.model_name != null ? String(r.model_name) : null,
      days_to_eol: daysEol,
      days_to_warranty: daysWar,
      eol_due: daysEol != null && daysEol <= LEAD_DAYS,
      warranty_due: daysWar != null && daysWar <= LEAD_DAYS,
    }
  })
}

export async function countEolDue(filters: EolListFilters = {}): Promise<number> {
  const rows = await listEolDueAssets(filters)
  return rows.length
}

async function alreadyNotified(kind: string, itemId: number, day: string) {
  const row = await get<{ id: number }>(`
    SELECT id FROM notification_log
    WHERE kind = ? AND item_type = 'asset' AND item_id = ? AND notified_on = ?
    LIMIT 1
  `, [kind, itemId, day])
  return Boolean(row)
}

async function markNotified(kind: string, itemId: number, day: string) {
  await run(`
    INSERT IGNORE INTO notification_log (kind, item_type, item_id, notified_on, created_at)
    VALUES (?, 'asset', ?, ?, ?)
  `, [kind, itemId, day, now()])
}

function daysLabel(d: number | null) {
  if (d == null) return '—'
  if (d < 0) return `${Math.abs(d)} day(s) overdue`
  if (d === 0) return 'today'
  return `in ${d} day(s)`
}

export type EolDigestResult = {
  sent: boolean
  skippedReason?: string
  eolCount: number
  warrantyCount: number
  emailedTo?: string
}

/** Build digests for assets not yet notified today; email settings.alert_email. */
export async function runEolAlertDigest(): Promise<EolDigestResult> {
  const settings = await get<{ alert_email?: string | null; site_name?: string }>(`
    SELECT alert_email, site_name FROM settings WHERE id = 1
  `)
  const to = String(settings?.alert_email || '').trim()
  if (!to) {
    return { sent: false, skippedReason: 'No alert_email configured in Settings', eolCount: 0, warrantyCount: 0 }
  }
  if (!mailConfigured()) {
    return { sent: false, skippedReason: 'SMTP is not configured', eolCount: 0, warrantyCount: 0 }
  }

  const day = todaySql()
  const due = await listEolDueAssets()
  const eolItems: EolDueRow[] = []
  const warrantyItems: EolDueRow[] = []

  for (const row of due) {
    if (row.eol_due && row.eol_date && !(await alreadyNotified('asset_eol', row.id, day))) {
      eolItems.push(row)
    }
    if (row.warranty_due && row.warranty_end && !(await alreadyNotified('asset_warranty', row.id, day))) {
      warrantyItems.push(row)
    }
  }

  if (!eolItems.length && !warrantyItems.length) {
    return { sent: false, skippedReason: 'No new EOL/warranty alerts for today', eolCount: 0, warrantyCount: 0 }
  }

  const site = settings?.site_name || 'Refex IT Asset Management'
  const lines: string[] = [
    `${site} — Asset date alerts`,
    '',
    `Window: overdue or within ${LEAD_DAYS} days.`,
    '',
  ]

  if (eolItems.length) {
    lines.push(`End of life (${eolItems.length})`)
    for (const a of eolItems) {
      lines.push(`  • ${a.asset_tag}${a.name ? ` — ${a.name}` : ''} | EOL ${a.eol_date} (${daysLabel(a.days_to_eol)})`)
    }
    lines.push('')
  }
  if (warrantyItems.length) {
    lines.push(`Warranty ending (${warrantyItems.length})`)
    for (const a of warrantyItems) {
      lines.push(`  • ${a.asset_tag}${a.name ? ` — ${a.name}` : ''} | Warranty ${a.warranty_end} (${daysLabel(a.days_to_warranty)})`)
    }
    lines.push('')
  }

  const htmlParts: string[] = [
    `<h2 style="font-family:sans-serif;color:#0f172a">${site} — Asset date alerts</h2>`,
    `<p style="font-family:sans-serif;color:#64748b">Overdue or within ${LEAD_DAYS} days.</p>`,
  ]
  if (eolItems.length) {
    htmlParts.push(`<h3 style="font-family:sans-serif;color:#0b6e66">End of life (${eolItems.length})</h3><ul>`)
    for (const a of eolItems) {
      htmlParts.push(
        `<li style="font-family:sans-serif"><strong>${a.asset_tag}</strong>${a.name ? ` — ${a.name}` : ''} · EOL <strong>${a.eol_date}</strong> (${daysLabel(a.days_to_eol)})</li>`,
      )
    }
    htmlParts.push('</ul>')
  }
  if (warrantyItems.length) {
    htmlParts.push(`<h3 style="font-family:sans-serif;color:#d97706">Warranty ending (${warrantyItems.length})</h3><ul>`)
    for (const a of warrantyItems) {
      htmlParts.push(
        `<li style="font-family:sans-serif"><strong>${a.asset_tag}</strong>${a.name ? ` — ${a.name}` : ''} · Warranty <strong>${a.warranty_end}</strong> (${daysLabel(a.days_to_warranty)})</li>`,
      )
    }
    htmlParts.push('</ul>')
  }

  await sendMail({
    to,
    subject: `[${site}] ${eolItems.length + warrantyItems.length} asset date alert(s)`,
    text: lines.join('\n'),
    html: htmlParts.join('\n'),
  })

  for (const a of eolItems) await markNotified('asset_eol', a.id, day)
  for (const a of warrantyItems) await markNotified('asset_warranty', a.id, day)

  return {
    sent: true,
    eolCount: eolItems.length,
    warrantyCount: warrantyItems.length,
    emailedTo: to,
  }
}

let eolTimer: ReturnType<typeof setInterval> | null = null
let eolRunning = false

/** Daily (or custom interval) EOL/warranty digest. EOL_ALERT_INTERVAL_MINUTES=0 disables. */
export function startEolAlertScheduler() {
  const minutes = Number(process.env.EOL_ALERT_INTERVAL_MINUTES ?? 1440)
  if (!minutes || minutes < 1) {
    console.log('EOL alert scheduler disabled (EOL_ALERT_INTERVAL_MINUTES=0)')
    return
  }

  const ms = minutes * 60_000
  console.log(`EOL alert scheduler enabled every ${minutes} minute(s)`)

  const tick = async () => {
    if (eolRunning) {
      console.warn('EOL alert skipped (previous run still in progress)')
      return
    }
    eolRunning = true
    try {
      const result = await runEolAlertDigest()
      if (result.sent) {
        console.log(
          `EOL digest sent to ${result.emailedTo}: eol=${result.eolCount} warranty=${result.warrantyCount}`,
        )
      } else {
        console.log(`EOL digest skipped: ${result.skippedReason}`)
      }
    } catch (e) {
      console.error('EOL alert scheduler failed:', e instanceof Error ? e.message : e)
    } finally {
      eolRunning = false
    }
  }

  setTimeout(() => { void tick() }, 20_000)
  eolTimer = setInterval(() => { void tick() }, ms)
}

export function stopEolAlertScheduler() {
  if (eolTimer) clearInterval(eolTimer)
  eolTimer = null
}
