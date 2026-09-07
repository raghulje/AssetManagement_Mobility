import { useEffect } from 'react'
import { useAuth } from '../api/AuthContext'

/**
 * /logout — clear Mobility session and send user to RefexOne.com
 * (same pattern as P2P /logout; usable from RefexOne shell or deep links)
 */
export default function LogoutPage() {
  const { logout } = useAuth()

  useEffect(() => {
    logout()
    // logout navigates away to RefexOne
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Signing out…</h1>
      <p style={{ color: '#64748b', margin: 0 }}>Redirecting to RefexOne</p>
    </div>
  )
}
