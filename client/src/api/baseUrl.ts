/** Resolve API base so LAN phones use the same host they opened the UI on. */
export function getApiBase(): string {
  const fallback = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001/api/v1'
  if (typeof window === 'undefined') return fallback.replace(/\/$/, '')

  const host = window.location.hostname
  const port = import.meta.env.VITE_API_PORT || '3001'
  // When opened via LAN IP / hostname, talk to API on the same host
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${port}/api/v1`
  }
  return fallback.replace(/\/$/, '')
}

export function getStorageBase(): string {
  return getApiBase().replace(/\/api\/v1\/?$/, '')
}
