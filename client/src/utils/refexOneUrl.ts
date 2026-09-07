/** RefexOne portal (native shell / My Apps host). */
export const DEFAULT_REFEXONE_URL = 'https://refexone.com'

export function getRefexOneUrl(): string {
  const fromEnv = String(import.meta.env.VITE_REFEXONE_URL || '').trim()
  return (fromEnv || DEFAULT_REFEXONE_URL).replace(/\/$/, '')
}

/**
 * Full-page navigate back to RefexOne after logout.
 * Clears nothing — caller must clear the session first when leaving the app.
 */
export function goToRefexOne(): void {
  window.location.replace(getRefexOneUrl())
}

/**
 * Return to the RefexOne portal without wiping the Mobility session
 * (back arrow). User can reopen the app and stay signed in.
 */
export function returnToRefexOne(): void {
  window.location.assign(getRefexOneUrl())
}
