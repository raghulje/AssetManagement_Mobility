/** Compute subscription end date (YYYY-MM-DD) from purchase/start + period. */
export function computeSubscriptionEnd(opts: {
  startDate: string | null | undefined
  period: string | null | undefined
  customValue?: number | null
  customUnit?: string | null
}): string | null {
  const start = String(opts.startDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const period = String(opts.period || 'none')
  if (period === 'none') return null

  const d = new Date(`${start}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null

  if (period === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1)
  } else if (period === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
  } else if (period === 'custom') {
    const n = Number(opts.customValue)
    if (!Number.isFinite(n) || n < 1) return null
    const unit = String(opts.customUnit || 'months')
    if (unit === 'days') d.setUTCDate(d.getUTCDate() + n)
    else d.setUTCMonth(d.getUTCMonth() + n)
  } else {
    return null
  }

  return d.toISOString().slice(0, 10)
}

export function subscriptionLabel(opts: {
  period?: string | null
  customValue?: number | null
  customUnit?: string | null
  isRecurring?: boolean | number | null
}): string {
  const period = String(opts.period || 'none')
  let base = 'One-time / none'
  if (period === 'monthly') base = 'Monthly'
  else if (period === 'annual') base = 'Annual'
  else if (period === 'custom') {
    const n = Number(opts.customValue) || 0
    const unit = String(opts.customUnit || 'months')
    base = `Custom (${n} ${unit})`
  }
  if (opts.isRecurring) base += ' · recurring'
  return base
}
