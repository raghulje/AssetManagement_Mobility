/** Format server UTC wall-clock timestamps (`YYYY-MM-DD HH:mm:ss`) for local display. */
export function formatAppDateTime(value: unknown, fallback = '—'): string {
  if (value == null || value === '') return fallback
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return fallback
    return value.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  const raw = String(value).trim()
  if (!raw) return fallback

  let ms: number
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    ms = new Date(raw).getTime()
  } else {
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
    // db.now() stores UTC without timezone — treat as UTC
    ms = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) ? `${normalized}Z` : raw).getTime()
  }

  if (Number.isNaN(ms)) return raw
  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}
