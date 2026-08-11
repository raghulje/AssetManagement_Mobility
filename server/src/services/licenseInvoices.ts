import { all, get, run, now } from '../db/index.js'
import {
  buildInvoicePeriods,
  expectedInvoiceCount,
  type InvoicePeriodSlot,
} from './licenseSubscription.js'

export type LicenseInvoiceRow = {
  id: number
  license_id: number
  period_index: number
  period_start: string
  period_end: string
  invoice_at: string | null
  amount: number | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  file_id?: number | null
  file_name?: string | null
}

function hasInvoiceData(row: {
  invoice_at?: string | null
  amount?: number | string | null
  notes?: string | null
  file_id?: number | null
}) {
  if (row.invoice_at) return true
  if (row.amount != null && row.amount !== '') return true
  if (row.notes && String(row.notes).trim()) return true
  if (row.file_id) return true
  return false
}

export async function listLicenseInvoices(licenseId: number): Promise<LicenseInvoiceRow[]> {
  const rows = await all<LicenseInvoiceRow>(`
    SELECT li.id, li.license_id, li.period_index, li.period_start, li.period_end,
      li.invoice_at, li.amount, li.notes, li.created_at, li.updated_at,
      (
        SELECT u.id FROM uploads u
        WHERE u.uploadable_type = 'license_invoice' AND u.uploadable_id = li.id
          AND u.deleted_at IS NULL
        ORDER BY u.id DESC LIMIT 1
      ) as file_id,
      (
        SELECT u.original_filename FROM uploads u
        WHERE u.uploadable_type = 'license_invoice' AND u.uploadable_id = li.id
          AND u.deleted_at IS NULL
        ORDER BY u.id DESC LIMIT 1
      ) as file_name
    FROM license_invoices li
    WHERE li.license_id = ? AND li.deleted_at IS NULL
    ORDER BY li.period_index ASC, li.id ASC
  `, [licenseId])
  return rows.map((r) => ({
    ...r,
    period_start: String(r.period_start).slice(0, 10),
    period_end: String(r.period_end).slice(0, 10),
    invoice_at: r.invoice_at ? String(r.invoice_at).slice(0, 19).replace('T', ' ') : null,
    amount: r.amount != null ? Number(r.amount) : null,
    file_id: r.file_id != null ? Number(r.file_id) : null,
  }))
}

export async function invoiceStats(licenseId: number): Promise<{ expected: number; recorded: number }> {
  const lic = await get<{
    subscription_period: string | null
    subscription_cycles: number | null
  }>(`
    SELECT subscription_period, subscription_cycles FROM licenses
    WHERE id = ? AND deleted_at IS NULL
  `, [licenseId])
  if (!lic) return { expected: 0, recorded: 0 }

  const expected = expectedInvoiceCount(lic.subscription_period, lic.subscription_cycles)
  const rows = await listLicenseInvoices(licenseId)
  const recorded = rows.filter((r) => hasInvoiceData(r)).length
  return { expected: Math.max(expected, rows.length), recorded }
}

/** Insert missing period slots; update empty slot dates; hard-delete empty slots above cycles. */
export async function syncLicenseInvoiceSlots(
  licenseId: number,
  opts: {
    startDate: string | null | undefined
    period: string | null | undefined
    customValue?: number | null
    customUnit?: string | null
    cycles?: number | null
  },
): Promise<InvoicePeriodSlot[]> {
  const slots = buildInvoicePeriods(opts)
  const ts = now()
  const existing = await all<{
    id: number
    period_index: number
    period_start: string
    period_end: string
    invoice_at: string | null
    amount: number | null
    notes: string | null
    deleted_at: string | null
    file_id: number | null
  }>(`
    SELECT li.*,
      (
        SELECT u.id FROM uploads u
        WHERE u.uploadable_type = 'license_invoice' AND u.uploadable_id = li.id
          AND u.deleted_at IS NULL
        ORDER BY u.id DESC LIMIT 1
      ) as file_id
    FROM license_invoices li
    WHERE li.license_id = ?
  `, [licenseId])

  const byIndex = new Map(existing.map((r) => [Number(r.period_index), r]))

  for (const slot of slots) {
    const ex = byIndex.get(slot.period_index)
    if (!ex) {
      await run(`
        INSERT INTO license_invoices (
          license_id, period_index, period_start, period_end, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [licenseId, slot.period_index, slot.period_start, slot.period_end, ts, ts])
      continue
    }
    if (ex.deleted_at) {
      // Revive soft-deleted empty slot, or keep data slots revived with new dates only if empty
      if (!hasInvoiceData(ex)) {
        await run(`
          UPDATE license_invoices
          SET period_start = ?, period_end = ?, deleted_at = NULL, updated_at = ?
          WHERE id = ?
        `, [slot.period_start, slot.period_end, ts, ex.id])
      } else {
        await run(`
          UPDATE license_invoices SET deleted_at = NULL, updated_at = ? WHERE id = ?
        `, [ts, ex.id])
      }
      continue
    }
    if (!hasInvoiceData(ex)) {
      await run(`
        UPDATE license_invoices
        SET period_start = ?, period_end = ?, updated_at = ?
        WHERE id = ?
      `, [slot.period_start, slot.period_end, ts, ex.id])
    }
  }

  const maxCycle = slots.length
  for (const ex of existing) {
    if (ex.deleted_at) continue
    if (Number(ex.period_index) <= maxCycle) continue
    if (hasInvoiceData(ex)) continue
    await run(`DELETE FROM license_invoices WHERE id = ?`, [ex.id])
  }

  return slots
}

/** Append one extra invoice period after the latest. */
export async function appendInvoicePeriod(
  licenseId: number,
  userId?: number | null,
): Promise<LicenseInvoiceRow | null> {
  const lic = await get<{
    purchase_date: string | null
    subscription_period: string | null
    subscription_custom_value: number | null
    subscription_custom_unit: string | null
    subscription_cycles: number | null
  }>(`SELECT * FROM licenses WHERE id = ? AND deleted_at IS NULL`, [licenseId])
  if (!lic) return null

  const last = await get<{ period_index: number; period_end: string }>(`
    SELECT period_index, period_end FROM license_invoices
    WHERE license_id = ? AND deleted_at IS NULL
    ORDER BY period_index DESC LIMIT 1
  `, [licenseId])

  const period = String(lic.subscription_period || 'none')
  if (period === 'none') {
    // Ad-hoc: 1-month window from today or last end
    const start = last?.period_end
      ? String(last.period_end).slice(0, 10)
      : (lic.purchase_date ? String(lic.purchase_date).slice(0, 10) : new Date().toISOString().slice(0, 10))
    const startD = new Date(`${start}T12:00:00Z`)
    const endD = new Date(startD.getTime())
    endD.setUTCMonth(endD.getUTCMonth() + 1)
    const idx = (last ? Number(last.period_index) : 0) + 1
    const ts = now()
    const info = await run(`
      INSERT INTO license_invoices (
        license_id, period_index, period_start, period_end, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [licenseId, idx, start, endD.toISOString().slice(0, 10), userId || null, ts, ts])
    const rows = await listLicenseInvoices(licenseId)
    return rows.find((r) => r.id === Number(info.insertId)) || null
  }

  const start = last?.period_end
    ? String(last.period_end).slice(0, 10)
    : (lic.purchase_date ? String(lic.purchase_date).slice(0, 10) : null)
  if (!start) return null

  const built = buildInvoicePeriods({
    startDate: start,
    period,
    customValue: lic.subscription_custom_value,
    customUnit: lic.subscription_custom_unit,
    cycles: 1,
  })
  if (!built.length) return null
  const slot = built[0]
  const idx = (last ? Number(last.period_index) : 0) + 1
  const ts = now()
  const info = await run(`
    INSERT INTO license_invoices (
      license_id, period_index, period_start, period_end, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [licenseId, idx, slot.period_start, slot.period_end, userId || null, ts, ts])

  // Bump cycles if we're extending past current
  const cycles = Math.max(1, Number(lic.subscription_cycles) || 1)
  if (idx > cycles) {
    await run(`UPDATE licenses SET subscription_cycles = ?, updated_at = ? WHERE id = ?`, [idx, ts, licenseId])
  }

  const rows = await listLicenseInvoices(licenseId)
  return rows.find((r) => r.id === Number(info.insertId)) || null
}
