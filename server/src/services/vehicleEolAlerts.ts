import { all, get, run, now } from '../db/index.js'
import { mailConfigured, sendMail } from './mail.js'
import { brandedEmail } from './notify.js'
import { isEmailCategoryEnabled, resolveEolRecipients } from './notificationConfig.js'

const LEAD_DAYS = 30
const PRIOR_THRESHOLDS = [
  { days: 30, kind: '30d', label: '1 month' },
  { days: 7, kind: '7d', label: '1 week' },
  { days: 1, kind: '1d', label: '1 day' },
] as const

export type VehicleEolDueRow = {
  id: number
  vehicle_number: string
  model: string
  location_name: string
  purchase_date: string | null
  eol_date: string | null
  warranty_end: string | null
  days_to_eol: number | null
  days_to_warranty: number | null
  eol_due: boolean
  warranty_due: boolean
}

function appBase() {
  return (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3073').replace(/\/$/, '')
}

export async function listEolDueVehicles(search = ''): Promise<VehicleEolDueRow[]> {
  const params: unknown[] = []
  let extra = ''
  if (search.trim()) {
    const q = `%${search.trim()}%`
    extra += ' AND (v.vehicle_number LIKE ? OR v.model LIKE ? OR v.location_name LIKE ?)'
    params.push(q, q, q)
  }

  const rows = await all<Record<string, unknown>>(`
    SELECT
      v.id,
      v.vehicle_number,
      v.model,
      v.location_name,
      v.purchase_date,
      v.vehicle_eol_date AS eol_date,
      IF(v.purchase_date IS NOT NULL AND v.warranty_months IS NOT NULL AND v.warranty_months > 0,
        DATE_ADD(v.purchase_date, INTERVAL v.warranty_months MONTH), NULL) AS warranty_end,
      DATEDIFF(v.vehicle_eol_date, CURDATE()) AS days_to_eol,
      DATEDIFF(
        IF(v.purchase_date IS NOT NULL AND v.warranty_months IS NOT NULL AND v.warranty_months > 0,
          DATE_ADD(v.purchase_date, INTERVAL v.warranty_months MONTH), NULL),
        CURDATE()
      ) AS days_to_warranty
    FROM vehicles v
    WHERE v.deleted_at IS NULL
      AND (
        (v.vehicle_eol_date IS NOT NULL AND DATEDIFF(v.vehicle_eol_date, CURDATE()) <= ${LEAD_DAYS})
        OR (
          v.purchase_date IS NOT NULL AND v.warranty_months IS NOT NULL AND v.warranty_months > 0
          AND DATEDIFF(DATE_ADD(v.purchase_date, INTERVAL v.warranty_months MONTH), CURDATE()) <= ${LEAD_DAYS}
        )
      )
      ${extra}
    ORDER BY COALESCE(days_to_eol, days_to_warranty) ASC
  `, params)

  return rows.map((r) => {
    const daysToEol = r.days_to_eol == null ? null : Number(r.days_to_eol)
    const daysToWarranty = r.days_to_warranty == null ? null : Number(r.days_to_warranty)
    return {
      id: Number(r.id),
      vehicle_number: String(r.vehicle_number),
      model: String(r.model),
      location_name: String(r.location_name),
      purchase_date: r.purchase_date ? String(r.purchase_date) : null,
      eol_date: r.eol_date ? String(r.eol_date) : null,
      warranty_end: r.warranty_end ? String(r.warranty_end) : null,
      days_to_eol: daysToEol,
      days_to_warranty: daysToWarranty,
      eol_due: daysToEol != null && daysToEol <= LEAD_DAYS,
      warranty_due: daysToWarranty != null && daysToWarranty <= LEAD_DAYS,
    }
  })
}

async function alreadySent(kind: string, vehicleId: number) {
  const row = await get<{ id: number }>(`
    SELECT id FROM notification_log
    WHERE kind = ? AND item_type = 'vehicle' AND item_id = ?
    LIMIT 1
  `, [kind, vehicleId])
  return Boolean(row)
}

export async function runVehicleEolAlertDigest() {
  if (!mailConfigured()) return { sent: false, skippedReason: 'SMTP not configured' }
  if (!(await isEmailCategoryEnabled('eol_warranty'))) {
    return { sent: false, skippedReason: 'Vehicle EOL emails disabled' }
  }

  const due = await listEolDueVehicles()
  const recipients = await resolveEolRecipients()
  if (!recipients.length) return { sent: false, skippedReason: 'No recipients' }

  let sentCount = 0
  for (const row of due) {
    for (const t of PRIOR_THRESHOLDS) {
      const hitEol = row.days_to_eol != null && row.days_to_eol <= t.days && row.days_to_eol >= 0
      const hitW = row.days_to_warranty != null && row.days_to_warranty <= t.days && row.days_to_warranty >= 0
      if (!hitEol && !hitW) continue
      const kind = `vehicle_eol_${t.kind}`
      if (await alreadySent(kind, row.id)) continue

      const subject = `Vehicle ${t.label} reminder: ${row.vehicle_number}`
      const mail = brandedEmail({
        title: `Vehicle lifecycle reminder (${t.label})`,
        intro: 'A fleet vehicle is approaching end-of-life or warranty expiry.',
        fields: [
          { label: 'Vehicle', value: row.vehicle_number },
          { label: 'Model', value: row.model },
          { label: 'Location', value: row.location_name },
          { label: 'EOL date', value: row.eol_date || '—' },
          { label: 'Warranty end', value: row.warranty_end || '—' },
        ],
        ctaUrl: `${appBase()}/vehicles/${row.id}`,
        ctaLabel: 'Open vehicle',
      })
      await sendMail({
        to: recipients.join(', '),
        subject,
        text: mail.text,
        html: mail.html,
      })
      await run(`
        INSERT INTO notification_log (kind, item_type, item_id, notified_on, created_at)
        VALUES (?, 'vehicle', ?, CURDATE(), ?)
      `, [kind, row.id, now()])
      sentCount++
    }
  }

  return { sent: sentCount > 0, sentCount }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startVehicleEolAlertScheduler() {
  const minutes = Number(process.env.EOL_ALERT_INTERVAL_MINUTES ?? 1440)
  if (!minutes || minutes <= 0) return
  const ms = minutes * 60 * 1000
  console.log(`Vehicle EOL prior-alert scheduler enabled every ${minutes} minute(s)`)
  const tick = () => {
    runVehicleEolAlertDigest().catch((e) => console.warn('Vehicle EOL digest failed:', e))
  }
  tick()
  timer = setInterval(tick, ms)
  if (timer.unref) timer.unref()
}
