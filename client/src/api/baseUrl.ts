/**
 * API base — Biogas_MIS_Vizag / SERVE_CLIENT pattern:
 * - Dev: relative /api/v1 (Vite proxies to the API)
 * - Prod: same window.location.origin so LAN QR scans (phone → http://10.x.x.x:3001)
 *   never hit a baked-in localhost from client/.env
 *
 * VITE_API_URL is only used when it points at a *non-localhost* host (split deploy).
 */
function isLoopbackUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
}

export function getApiBase(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')

  if (import.meta.env.DEV) {
    return '/api/v1'
  }

  if (typeof window !== 'undefined') {
    const originBase = `${window.location.origin}/api/v1`
    // Ignore localhost VITE_API_URL when the page itself is opened via LAN IP / hostname
    if (envUrl && !isLoopbackUrl(envUrl)) return envUrl
    if (envUrl && isLoopbackUrl(window.location.origin)) return envUrl
    return originBase
  }

  return envUrl || 'http://localhost:3001/api/v1'
}

export function getStorageBase(): string {
  if (import.meta.env.DEV) {
    return ''
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return getApiBase().replace(/\/api\/v1\/?$/, '')
}

/** Absolute URL for an asset image path or API `image_url`. */
export function assetImageSrc(imageOrUrl: string | null | undefined): string | null {
  if (!imageOrUrl) return null
  const raw = String(imageOrUrl)
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw
  if (raw.startsWith('/storage/')) return `${getStorageBase()}${raw}`
  const rel = raw.replace(/^public\//, '').replace(/\\/g, '/')
  return `${getStorageBase()}/storage/${rel}`
}
