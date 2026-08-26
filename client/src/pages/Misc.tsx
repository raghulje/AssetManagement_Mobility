import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import AppLayout from '../layout/AppLayout'
import { Box, Field } from '../components/ui'
import { siteName } from '../data/mockData'
import { useAuth } from '../api/AuthContext'
import { api, hardwareApi } from '../api/client'
import InteractiveLoginPage from '../components/login/InteractiveLoginPage'
import { useToast } from '../components/Toast'
import { AppSelect } from '../components/formControls'

export { ImportPage } from './ImportPage'

/** Only allow in-app relative paths (email deep links after login). */
function safeAppNext(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw
  try { value = decodeURIComponent(raw) } catch { /* keep raw */ }
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.startsWith('/login') || value.startsWith('/forgot') || value.startsWith('/reset')) return null
  return value
}


export function AccountAssets() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const uid = user?.id
    if (!uid) {
      setLoading(false)
      return
    }
    api<{ rows: Record<string, unknown>[] }>(`/users/${uid}/assets`)
      .then((r) => setRows(r.rows || []))
      .catch(() => {
        // Fallback: assets assigned to current user via list filter is not available; show empty
        hardwareApi.list({ limit: 50 }).then((res) => {
          const mine = (res.rows || []).filter((a) => {
            const at = a.assigned_to as { id?: number; type?: string } | null
            return at && Number(at.id) === Number(uid) && at.type === 'user'
          })
          setRows(mine)
        }).catch(() => setRows([]))
      })
      .finally(() => setLoading(false))
  }, [user])

  return (
    <AppLayout title="My Assigned Assets">
      <Box title="Assets assigned to you">
        <table className="table table-striped">
          <thead><tr><th>Asset Tag</th><th>Name</th><th>Model</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="text-muted">No assets assigned</td></tr>
            ) : rows.map((a) => (
              <tr key={String(a.id)}>
                <td><Link to={`/hardware/${a.id}`}>{String(a.asset_tag)}</Link></td>
                <td>{String(a.name || '')}</td>
                <td>{typeof a.model === 'object' && a.model ? String((a.model as { name?: string }).name || '') : String(a.model || '')}</td>
                <td>{typeof a.status === 'object' && a.status ? String((a.status as { name?: string }).name || '') : String(a.status || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </AppLayout>
  )
}

export function AccountRequested() {
  return (
    <AppLayout title="My Requested Assets">
      <Box title="Requests"><p className="text-muted">You have no pending asset requests.</p></Box>
    </AppLayout>
  )
}

export function AccountAccept() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [msg, setMsg] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeId, setActiveId] = useState<number | null>(null)

  const load = () => api<{ rows: Record<string, unknown>[] }>('/account/accept').then((r) => setRows(r.rows)).catch(() => undefined)
  useEffect(() => { load() }, [])

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.beginPath()
    const rect = c.getBoundingClientRect()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    const move = (ev: MouseEvent) => {
      ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top)
      ctx.stroke()
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const accept = async (id: number) => {
    const signature = canvasRef.current?.toDataURL('image/png')
    await api(`/account/accept/${id}`, {
      method: 'POST',
      json: { asset_acceptance: 'accepted', signature_output: signature },
    })
    setMsg('Accepted')
    setActiveId(null)
    load()
  }

  const decline = async (id: number) => {
    await api(`/account/accept/${id}/decline`, { method: 'POST', json: { note: 'Declined by user' } })
    setMsg('Declined')
    load()
  }

  return (
    <AppLayout title="Accept Assets">
      {msg && <div className="callout callout-info"><p>{msg}</p></div>}
      <Box title="Pending Acceptance">
        <table className="table table-striped">
          <thead><tr><th>Asset</th><th>EULA / Signature</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="text-muted">No pending acceptances</td></tr>}
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.asset_tag)} {String(r.asset_name || '')}</td>
                <td>
                  <button type="button" className="btn btn-xs btn-default" onClick={() => setActiveId(Number(r.id))}>Sign &amp; Accept</button>
                </td>
                <td>
                  <button type="button" className="btn btn-success btn-sm" onClick={() => accept(Number(r.id))}>Accept</button>{' '}
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => decline(Number(r.id))}>Decline</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      {activeId && (
        <Box title="Signature" type="primary">
          <p>Draw your signature, then click Accept.</p>
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            style={{ border: '1px solid #ccc', background: '#fff', cursor: 'crosshair' }}
            onMouseDown={startDraw}
          />
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-theme" onClick={() => accept(activeId)}>Accept with Signature</button>
            <button type="button" className="btn btn-default" onClick={() => {
              const c = canvasRef.current
              if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
            }}
            >Clear</button>
          </div>
        </Box>
      )}
    </AppLayout>
  )
}


export function AccountProfile() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [firstName, setFirstName] = useState(String(user?.first_name || ''))
  const [lastName, setLastName] = useState(String(user?.last_name || ''))
  const [email, setEmail] = useState(String(user?.email || ''))
  const [phone, setPhone] = useState(String((user as { phone?: string } | null)?.phone || ''))
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setFirstName(String(user?.first_name || ''))
    setLastName(String(user?.last_name || ''))
    setEmail(String(user?.email || ''))
    setPhone(String((user as { phone?: string } | null)?.phone || ''))
  }, [user])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await api('/account/profile', {
        method: 'PUT',
        json: { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() || null, phone: phone.trim() || null },
      })
      await refreshUser()
      setOkMsg('Profile saved')
      toast.success('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppLayout title="Edit Profile">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {okMsg ? <div className="callout callout-success"><p>{okMsg}</p></div> : null}
      <Box title="Profile" type="primary">
        <form className="form-horizontal" onSubmit={(e) => { void submit(e) }}>
          <Field label="First Name"><input className="form-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></Field>
          <Field label="Last Name"><input className="form-control" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
          <Field label="Email"><input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Phone"><input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </form>
      </Box>
    </AppLayout>
  )
}

export function AccountPassword() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const nextAfter = safeAppNext(params.get('next'))
  const { user, refreshUser, logout } = useAuth()
  const forced = Boolean(user?.must_change_password)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await api('/account/password', {
        method: 'PUT',
        json: forced
          ? { password, password_confirmation: confirm }
          : { current_password: current, password, password_confirmation: confirm },
      })
      setCurrent('')
      setPassword('')
      setConfirm('')
      await refreshUser()
      if (forced) {
        toast.success('Password set — opening your record')
        navigate(nextAfter || '/', { replace: true })
        return
      }
      setOkMsg('Password updated')
      toast.success('Password updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppLayout title={forced ? 'Set New Password' : 'Change Password'}>
      {forced ? (
        <div className="callout callout-warning">
          <p>
            You signed in with a temporary password. Choose a new password to continue.
            You will not be able to use the app until this is done.
          </p>
        </div>
      ) : null}
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {okMsg ? <div className="callout callout-success"><p>{okMsg}</p></div> : null}
      <Box title={forced ? 'Create your password' : 'Password'} type="primary">
        <form className="form-horizontal" onSubmit={(e) => { void submit(e) }}>
          {!forced ? (
            <Field label="Current Password">
              <input type="password" className="form-control" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </Field>
          ) : null}
          <Field label="New Password">
            <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" minLength={8} />
          </Field>
          <button type="submit" className="btn btn-theme" disabled={busy}>
            {busy ? 'Saving…' : forced ? 'Set password & continue' : 'Update Password'}
          </button>
          {forced ? (
            <button
              type="button"
              className="btn btn-default"
              style={{ marginLeft: 8 }}
              onClick={() => logout()}
            >
              Sign out
            </button>
          ) : null}
        </form>
      </Box>
    </AppLayout>
  )
}

export function AccountApi() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    api<{ rows: Record<string, unknown>[] }>('/personal-access-tokens')
      .then((r) => setRows(r.rows || []))
      .catch((e: Error) => { setError(e.message); setRows([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    setBusy(true)
    setError('')
    setNewToken('')
    try {
      const res = await api<{ payload?: { token?: string }; token?: string }>('/personal-access-tokens', {
        method: 'POST',
        json: { name: name.trim() || 'API Token' },
      })
      setNewToken(String(res.payload?.token || res.token || ''))
      setName('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this token?')) return
    await api(`/personal-access-tokens/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <AppLayout title="API Keys">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {newToken ? (
        <div className="callout callout-success">
          <p>Copy this token now — it will not be shown again.</p>
          <code style={{ wordBreak: 'break-all' }}>{newToken}</code>
        </div>
      ) : null}
      <Box
        title="Personal Access Tokens"
        tools={(
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              className="form-control input-sm"
              style={{ width: 160, display: 'inline-block' }}
              placeholder="Token name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { void create() }}>
              {busy ? 'Creating…' : 'Create Token'}
            </button>
          </span>
        )}
      >
        <table className="table table-striped">
          <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Expires</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="text-muted">{loading ? 'Loading…' : 'No API tokens yet'}</td></tr>
            ) : rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.name || '')}</td>
                <td>{String(r.created_at || '—')}</td>
                <td>{String(r.last_used_at || '—')}</td>
                <td>{String(r.expires_at || '—')}</td>
                <td>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => { void revoke(Number(r.id)) }}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </AppLayout>
  )
}

export function AdminHub() {
  const links = [
    { to: '/settings', label: 'General Settings', icon: 'fas fa-cog' },
    { to: '/settings/roles', label: 'Roles & permissions', icon: 'fas fa-user-shield-alt' },
    { to: '/settings/notifications', label: 'Fleet notifications', icon: 'fas fa-envelope' },
    { to: '/masters', label: 'Cities & Models', icon: 'fas fa-database' },
    { to: '/audit', label: 'Audit', icon: 'fas fa-clipboard-list' },
    { to: '/drivers', label: 'Drivers', icon: 'fas fa-id-card' },
  ]
  return (
    <AppLayout title="Admin">
      <div className="row">
        {links.map((l) => (
          <div key={l.to} className="col-md-4" style={{ marginBottom: 15 }}>
            <Link to={l.to}>
              <div className="box box-default" style={{ padding: 20, textAlign: 'center' }}>
                <i className={l.icon} style={{ fontSize: 36, color: '#3c8dbc', marginBottom: 10 }} />
                <h4>{l.label}</h4>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}

export function RequestableItems() {
  return (
    <AppLayout title="Requestable Items">
      <Box title="Available to Request">
        <p className="text-muted">No requestable items configured.</p>
      </Box>
    </AppLayout>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeAppNext(params.get('next'))
  const { login } = useAuth()

  return (
    <InteractiveLoginPage
      onSubmit={async ({ email, password }) => {
        const u = await login(email, password)
        if (u?.must_change_password) {
          const dest = next
            ? `/account/password?next=${encodeURIComponent(next)}`
            : '/account/password'
          navigate(dest, { replace: true })
          return
        }
        navigate(next || '/', { replace: true })
      }}
    />
  )
}

export function SettingsGeneral() {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('settings.edit')
  const [site, setSite] = useState(siteName)
  const [currency, setCurrency] = useState('INR')
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')
  const [alertEmail, setAlertEmail] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [qrBusy, setQrBusy] = useState(false)
  const [schemaMigrateBusy, setSchemaMigrateBusy] = useState(false)
  const [provisionBusy, setProvisionBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saml, setSaml] = useState<{
    enabled?: boolean
    idp_configured?: boolean
    portal_fields?: Record<string, string>
    metadata_url?: string
  } | null>(null)

  useEffect(() => {
    api<Record<string, unknown>>('/settings')
      .then((s) => {
        setSite(String(s.site_name || siteName))
        setCurrency(String(s.default_currency || 'INR'))
        setDateFormat(String(s.date_display_format || 'YYYY-MM-DD'))
        setAlertEmail(String(s.alert_email || ''))
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
    api<{
      enabled?: boolean
      idp_configured?: boolean
      portal_fields?: Record<string, string>
      metadata_url?: string
    }>('/settings/saml')
      .then((s) => setSaml(s))
      .catch(() => setSaml(null))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await api('/settings', {
        method: 'PUT',
        json: {
          site_name: site.trim() || siteName,
          default_currency: currency.trim() || 'INR',
          date_display_format: dateFormat,
          alert_email: alertEmail.trim() || null,
        },
      })
      setOkMsg('Settings saved')
      toast.success('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <AppLayout title="General Settings"><p className="text-muted">Loading…</p></AppLayout>
  }

  return (
    <AppLayout title="General Settings" subtitle="Refex Mobility branding, SSO, and fleet tools">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {okMsg ? <div className="callout callout-success"><p>{okMsg}</p></div> : null}
      <form className="form-horizontal rm-page" onSubmit={(e) => { void submit(e) }}>
        <Box title="Application">
          <Field label="Site Name"><input className="form-control" value={site} onChange={(e) => setSite(e.target.value)} /></Field>
          <Field label="Default Currency"><input className="form-control" value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
          <Field label="Date Format">
            <AppSelect
              value={dateFormat}
              onChange={setDateFormat}
              searchable={false}
              options={[
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
              ]}
            />
          </Field>
          <Field label="Fallback alert email">
            <input className="form-control" type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} />
            <span className="help-block">
              Used when no role recipients are set. Full fleet alert rules live under{' '}
              <Link to="/settings/notifications">Settings → Notifications</Link>.
            </span>
          </Field>
          <div style={{ paddingLeft: 15, marginBottom: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={busy || !canEdit}>
              {busy ? 'Saving…' : 'Save Settings'}
            </button>
            {' '}
            <Link to="/masters" className="btn btn-default">Cities &amp; Models</Link>
            {' '}
            <Link to="/settings/roles" className="btn btn-default">Roles</Link>
          </div>
        </Box>
      </form>

      <Box title="Public photo capture form" type="primary">
        <p className="help-block" style={{ marginTop: 0 }}>
          Share this link like a Google Form. Field users pick a vehicle, enter name / email / phone,
          add multiple photos, and submit — photos are appended to that vehicle&apos;s Photos tab.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: 1, minWidth: 200, wordBreak: 'break-all', fontSize: 12 }}>
            {`${window.location.origin}/capture`}
          </code>
          <button
            type="button"
            className="btn btn-default btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/capture`)
              toast.success('Capture link copied')
            }}
          >
            Copy link
          </button>
          <a className="btn btn-theme btn-sm" href="/capture" target="_blank" rel="noreferrer">
            Open form
          </a>
        </div>
      </Box>

      <Box title="SAML / Refex Mobility SSO" type="primary">
        <p className="help-block" style={{ marginTop: 0 }}>
          Paste these into the RefexOne portal SAML app for <strong>Refex Mobility</strong>.
          Production uses <code>PUBLIC_APP_URL=https://mobility.refexone.com</code> (no port). Then set{' '}
          <code>SAML_ENABLED=true</code> and IdP SSO URL + certificate in <code>server/.env</code>.
        </p>
        {saml?.portal_fields ? (
          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            {Object.entries(saml.portal_fields).map(([label, value]) => (
              <div key={label}>
                <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{value}</code>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(value)
                      toast.success('Copied')
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">Loading SAML SP config…</p>
        )}
        <p className="help-block mb-0">
          Status: {saml?.enabled ? 'SSO enabled' : 'SSO disabled'} ·{' '}
          {saml?.idp_configured ? 'IdP configured' : 'IdP not configured yet'}
          {saml?.metadata_url ? (
            <> · <a href={saml.metadata_url} target="_blank" rel="noreferrer">SP metadata XML</a></>
          ) : null}
        </p>
      </Box>

      <Box title="Database migrations" type="primary">
        <p className="help-block" style={{ marginTop: 0 }}>
          Applies pending SQL from <code>server/src/db/mysql</code> (vehicles, captures, masters, etc.).
          Safe to re-run — already-applied versions are skipped. Run this on production after deploy
          before other one-time tools below.
        </p>
        <button
          type="button"
          className="btn btn-theme"
          disabled={schemaMigrateBusy || !canEdit}
          onClick={() => {
            if (!window.confirm(
              'Run pending database migrations on this server?\n\nThis updates the MySQL schema (new columns/tables).',
            )) return
            setSchemaMigrateBusy(true)
            setError('')
            setOkMsg('')
            api<{
              messages?: string[]
              payload?: { applied?: string[]; skipped?: string[]; table_count?: number }
            }>('/settings/run-migrations', { method: 'POST' })
              .then((res) => {
                const msg = Array.isArray(res.messages) ? res.messages.join(' ') : 'Migrations complete'
                setOkMsg(msg)
                toast.success(msg)
              })
              .catch((err: Error) => {
                setError(err.message)
                toast.error(err.message)
              })
              .finally(() => setSchemaMigrateBusy(false))
          }}
        >
          {schemaMigrateBusy ? 'Migrating…' : 'Run pending DB migrations'}
        </button>
      </Box>

      <Box title="Provision RGML App Managers" type="primary">
        <p className="help-block" style={{ marginTop: 0 }}>
          Finds active HRMS employees under <strong>Refex Green Mobility Limited</strong>, creates App Users
          with the <strong>App Managers</strong> role, and sets temporary password{' '}
          <code>Welcome@2026</code>. Existing matches (by employee ID or email) get the role updated;
          new users must set a new password on first login.
        </p>
        <p className="help-block">
          Run <strong>DB migrations</strong> first (adds <code>must_change_password</code>), and sync
          employees from HRMS if the directory is empty. Safe to re-run — skips duplicates.
        </p>
        <button
          type="button"
          className="btn btn-theme"
          disabled={provisionBusy || !canEdit}
          onClick={() => {
            if (!window.confirm(
              'Create / update App Managers for active Refex Green Mobility Limited employees?\n\nDefault password: Welcome@2026\nFirst login will force a password change.',
            )) return
            setProvisionBusy(true)
            setError('')
            setOkMsg('')
            api<{
              messages?: string[]
              payload?: {
                created?: number
                updated?: number
                skipped?: number
                candidates?: number
                errors?: { employee_code: string; reason: string }[]
              }
            }>('/settings/provision-rgml-app-managers', { method: 'POST' })
              .then((res) => {
                const msg = Array.isArray(res.messages) ? res.messages.join(' ') : 'Provisioning complete'
                const errs = res.payload?.errors?.length
                  ? ` (${res.payload.errors.length} issue(s) — check audit / response)`
                  : ''
                setOkMsg(msg + errs)
                toast.success(msg)
              })
              .catch((err: Error) => {
                setError(err.message)
                toast.error(err.message)
              })
              .finally(() => setProvisionBusy(false))
          }}
        >
          {provisionBusy ? 'Provisioning…' : 'Provision RGML → App Managers'}
        </button>
      </Box>

      <Box title="Vehicle QR codes" type="warning">
        <p className="help-block" style={{ marginTop: 0 }}>
          Clears every vehicle&apos;s QR token, public URL, and stored QR images. Use after changing the public
          domain (e.g. to <code>https://mobility.refexone.com</code>) so Print QR mints fresh codes for{' '}
          <code>/vehicle/…</code> pages.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={qrBusy || !canEdit}
          onClick={() => {
            if (!window.confirm(
              'Reset ALL vehicle QR codes?\n\nExisting printed QR labels will stop matching until you open each vehicle → QR / Tags again.',
            )) return
            setQrBusy(true)
            setError('')
            setOkMsg('')
            api<{ messages?: string[]; payload?: { cleared?: number; files_removed?: number } }>(
              '/settings/reset-vehicle-qr',
              { method: 'POST' },
            )
              .then((res) => {
                const msg = Array.isArray(res.messages) ? res.messages.join(' ') : 'Vehicle QR reset complete'
                setOkMsg(msg)
                toast.success(msg)
              })
              .catch((err: Error) => {
                setError(err.message)
                toast.error(err.message)
              })
              .finally(() => setQrBusy(false))
          }}
        >
          {qrBusy ? 'Resetting…' : 'Reset all vehicle QR codes'}
        </button>
      </Box>
    </AppLayout>
  )
}
