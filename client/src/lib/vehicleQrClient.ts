import QRCode from 'qrcode'

/** Absolute public scan URL for a vehicle QR token. */
export function vehiclePublicScanUrl(token: string, storedUrl?: string | null): string {
  const stored = String(storedUrl || '').trim()
  if (/^https?:\/\//i.test(stored)) return stored
  if (typeof window !== 'undefined' && token) {
    return `${window.location.origin}/vehicle/${encodeURIComponent(token)}`
  }
  return stored || ''
}

/** Render QR PNG as a data URL in the browser (works even when /storage is not proxied). */
export async function vehicleQrDataUrl(
  tokenOrUrl: string,
  opts?: { width?: number; storedUrl?: string | null },
): Promise<string> {
  const width = opts?.width ?? 512
  const payload = /^https?:\/\//i.test(tokenOrUrl)
    ? tokenOrUrl
    : vehiclePublicScanUrl(tokenOrUrl, opts?.storedUrl)
  if (!payload) throw new Error('Missing QR payload')
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1F44', light: '#FFFFFF' },
  })
}
