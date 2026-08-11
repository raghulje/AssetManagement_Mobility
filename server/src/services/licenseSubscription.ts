export type SubscriptionPeriod = 'none' | 'monthly' | 'annual' | 'custom'

function parseStart(startDate: string | null | undefined): Date | null {
  const start = String(startDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const d = new Date(`${start}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Advance a date by one billing cycle. */
export function advanceByOneCycle(
  from: Date,
  period: string | null | undefined,
  customValue?: number | null,
  customUnit?: string | null,
): Date | null {
  const p = String(period || 'none')
  const d = new Date(from.getTime())
  if (p === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1)
  } else if (p === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
  } else if (p === 'custom') {
    const n = Number(customValue)
    if (!Number.isFinite(n) || n < 1) return null
    const unit = String(customUnit || 'months')
    if (unit === 'days') d.setUTCDate(d.getUTCDate() + n)
    else d.setUTCMonth(d.getUTCMonth() + n)
  } else {
    return null
  }
  return d
}

/** Compute subscription end date (YYYY-MM-DD) from purchase/start + period × cycles. */
export function computeSubscriptionEnd(opts: {
  startDate: string | null | undefined
  period: string | null | undefined
  customValue?: number | null
  customUnit?: string | null
  cycles?: number | null
}): string | null {
  const start = parseStart(opts.startDate)
  if (!start) return null
  const period = String(opts.period || 'none')
  if (period === 'none') return null

  const cycles = Math.max(1, Number(opts.cycles) || 1)
  let d = start
  for (let i = 0; i < cycles; i++) {
    const next = advanceByOneCycle(d, period, opts.customValue, opts.customUnit)
    if (!next) return null
    d = next
  }
  return isoDate(d)
}

export type InvoicePeriodSlot = {
  period_index: number
  period_start: string
  period_end: string
}

/** Build N invoice period slots from start + billing period. */
export function buildInvoicePeriods(opts: {
  startDate: string | null | undefined
  period: string | null | undefined
  customValue?: number | null
  customUnit?: string | null
  cycles?: number | null
}): InvoicePeriodSlot[] {
  const start = parseStart(opts.startDate)
  const period = String(opts.period || 'none')
  const cycles = Math.max(0, Number(opts.cycles) || 0)
  if (!start || period === 'none' || cycles < 1) return []

  const slots: InvoicePeriodSlot[] = []
  let cursor = start
  for (let i = 1; i <= cycles; i++) {
    const end = advanceByOneCycle(cursor, period, opts.customValue, opts.customUnit)
    if (!end) break
    slots.push({
      period_index: i,
      period_start: isoDate(cursor),
      period_end: isoDate(end),
    })
    cursor = end
  }
  return slots
}

export function expectedInvoiceCount(
  period: string | null | undefined,
  cycles?: number | null,
): number {
  if (String(period || 'none') === 'none') return 0
  return Math.max(1, Number(cycles) || 1)
}

export function subscriptionLabel(opts: {
  period?: string | null
  customValue?: number | null
  customUnit?: string | null
  isRecurring?: boolean | number | null
  cycles?: number | null
}): string {
  const period = String(opts.period || 'none')
  const cycles = Math.max(1, Number(opts.cycles) || 1)
  let base = 'One-time / none'
  if (period === 'monthly') base = cycles > 1 ? `Monthly × ${cycles}` : 'Monthly'
  else if (period === 'annual') base = cycles > 1 ? `Annual × ${cycles}` : 'Annual'
  else if (period === 'custom') {
    const n = Number(opts.customValue) || 0
    const unit = String(opts.customUnit || 'months')
    base = cycles > 1 ? `Custom (${n} ${unit}) × ${cycles}` : `Custom (${n} ${unit})`
  }
  if (opts.isRecurring) base += ' · recurring'
  return base
}
