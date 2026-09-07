import { useAuth } from '../api/AuthContext'
import { returnToRefexOne } from '../utils/refexOneUrl'

/**
 * RefexOne host chrome (mobile / tablet only).
 * Matches the portal shell: RefexOne / Application + Refresh leave-app.
 * Desktop web hides this via CSS + AppLayout gate.
 */
export default function RefexOneHostBar() {
  const { logout } = useAuth()

  return (
    <div className="refex-host-bar" role="banner">
      <button
        type="button"
        className="refex-host-bar__back"
        aria-label="Back to RefexOne"
        title="Back to RefexOne"
        onClick={() => returnToRefexOne()}
      >
        <i className="fas fa-chevron-left" aria-hidden="true" />
      </button>
      <div className="refex-host-bar__brand">
        <span className="refex-host-bar__title">RefexOne</span>
        <span className="refex-host-bar__subtitle">Application</span>
      </div>
      <button
        type="button"
        className="refex-host-bar__refresh"
        aria-label="Leave app and return to RefexOne"
        title="Leave app"
        onClick={() => logout()}
      >
        <i className="fas fa-sync-alt" aria-hidden="true" />
        <span>Refresh</span>
      </button>
    </div>
  )
}
