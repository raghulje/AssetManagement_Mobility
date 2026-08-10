import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import AppLayout from '../layout/AppLayout'
import { Box, Field } from '../components/ui'
import { siteName } from '../data/mockData'
import { useAuth } from '../api/AuthContext'
import { api, hardwareApi } from '../api/client'
import InteractiveLoginPage from '../components/login/InteractiveLoginPage'
import { useToast } from '../components/Toast'

export { ImportPage } from './ImportPage'


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
        json: { current_password: current, password },
      })
      setCurrent('')
      setPassword('')
      setConfirm('')
      setOkMsg('Password updated')
      toast.success('Password updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppLayout title="Change Password">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {okMsg ? <div className="callout callout-success"><p>{okMsg}</p></div> : null}
      <Box title="Password" type="primary">
        <form className="form-horizontal" onSubmit={(e) => { void submit(e) }}>
          <Field label="Current Password"><input type="password" className="form-control" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
          <Field label="New Password"><input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <Field label="Confirm"><input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
          <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
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
    { to: '/settings/notifications', label: 'Notifications / emails', icon: 'fas fa-envelope' },
    { to: '/companies', label: 'Companies', icon: 'fas fa-building' },
    { to: '/fields', label: 'Custom Fields', icon: 'fas fa-list' },
    { to: '/statuslabels', label: 'Status Labels', icon: 'fas fa-flag' },
    { to: '/import', label: 'Import', icon: 'fas fa-file-import' },
    { to: '/reports', label: 'Reports', icon: 'fas fa-chart-bar' },
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
  const { login } = useAuth()

  return (
    <InteractiveLoginPage
      onSubmit={async ({ email, password }) => {
        await login(email, password)
        navigate('/')
      }}
    />
  )
}

export function SettingsGeneral() {
  const toast = useToast()
  const [site, setSite] = useState(siteName)
  const [currency, setCurrency] = useState('INR')
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')
  const [fmcs, setFmcs] = useState(true)
  const [alertEmail, setAlertEmail] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [digestBusy, setDigestBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Record<string, unknown>>('/settings')
      .then((s) => {
        setSite(String(s.site_name || siteName))
        setCurrency(String(s.default_currency || 'INR'))
        setDateFormat(String(s.date_display_format || 'YYYY-MM-DD'))
        setFmcs(Boolean(s.full_multiple_companies_support))
        setAlertEmail(String(s.alert_email || ''))
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
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
          full_multiple_companies_support: fmcs,
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
    <AppLayout title="General Settings">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      {okMsg ? <div className="callout callout-success"><p>{okMsg}</p></div> : null}
      <Box title="Settings" type="primary">
        <form className="form-horizontal" onSubmit={(e) => { void submit(e) }}>
          <Field label="Site Name"><input className="form-control" value={site} onChange={(e) => setSite(e.target.value)} /></Field>
          <Field label="Default Currency"><input className="form-control" value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
          <Field label="Date Format">
            <select className="form-control" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </Field>
          <Field label="Alert Email">
            <input className="form-control" type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} />
            <span className="help-block">
              Fallback ops email. For recipients, categories, and IT Asset Manager mapping see{' '}
              <a href="/settings/notifications">Settings → Notifications</a>.
            </span>
          </Field>
          <Field label="Full Multiple Companies Support">
            <label className="checkbox"><input type="checkbox" checked={fmcs} onChange={(e) => setFmcs(e.target.checked)} /> Enable FMCS</label>
          </Field>
          <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>{' '}
          <button
            type="button"
            className="btn btn-default"
            disabled={digestBusy || !alertEmail.trim()}
            onClick={() => {
              setDigestBusy(true)
              setError('')
              setOkMsg('')
              api<{ messages?: string[]; payload?: { skippedReason?: string; sent?: boolean } }>('/notifications/eol/run', { method: 'POST' })
                .then((res) => {
                  const payload = res.payload
                  setOkMsg(
                    payload?.sent
                      ? (Array.isArray(res.messages) ? res.messages.join(' ') : 'EOL digest sent')
                      : (payload?.skippedReason || (Array.isArray(res.messages) ? res.messages.join(' ') : 'Skipped')),
                  )
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setDigestBusy(false))
            }}
          >
            {digestBusy ? 'Sending…' : 'Send EOL digest now'}
          </button>
        </form>
      </Box>
    </AppLayout>
  )
}
