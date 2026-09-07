/** RefexOne portal (native shell / My Apps host). */
export const DEFAULT_REFEXONE_URL = 'https://refexone.com'

export function getRefexOneUrl(): string {
  const fromEnv = String(import.meta.env.VITE_REFEXONE_URL || '').trim()
  return (fromEnv || DEFAULT_REFEXONE_URL).replace(/\/$/, '')
}

/**
 * Full-page navigate back to RefexOne after logout.
 * Matches P2P: when Mobility is opened from the RefexOne app shell
 * ("RefexOne Application" + Refresh header), logout returns to the portal.
 */
export function goToRefexOne(): void {
  window.location.replace(getRefexOneUrl())
}
