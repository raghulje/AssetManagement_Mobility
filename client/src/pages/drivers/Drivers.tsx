import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import AppLayout from '../../layout/AppLayout'
import { useToast } from '../../components/Toast'
import { AppSelect, DateField } from '../../components/formControls'
import { driversApi, type Driver } from '../../api/drivers'
import { vehicleMastersApi } from '../../api/vehicleMasters'
import { downloadCsv } from '../../utils/csv'
import { useAuth } from '../../api/AuthContext'

type View = 'list' | 'holding'

export function DriversPage() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'list'
  const toast = useToast()
  const { can } = useAuth()
  const canDelete = can('drivers.delete')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [holding, setHolding] = useState('')
  const [rows, setRows] = useState<Driver[]>([])
  const [holdingRows, setHoldingRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cities, setCities] = useState<Array<{ id: number; name: string }>>([])
  const [form, setForm] = useState({
    id: '',
    driver_code: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    license_number: '',
    license_expiry: '',
    city_id: '',
    city_name: '',
    status: 'active',
    notes: '',
  })

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 280)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    vehicleMastersApi.citySelect().then((r) => {
      setCities((r.rows || []).map((c) => ({ id: c.id, name: c.name || c.text })))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (view === 'holding') {
      driversApi.holding()
        .then((r) => { if (!cancelled) setHoldingRows(r.rows || []) })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      driversApi.list({ search: q || undefined, status: status || undefined, holding: holding || undefined, limit: 100 })
        .then((r) => {
          if (cancelled) return
          setRows(r.rows || [])
          setTotal(r.total || 0)
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [view, q, status, holding, toast])

  const cityOptions = useMemo(
    () => [{ value: '', label: 'Select city…' }, ...cities.map((c) => ({ value: String(c.id), label: c.name }))],
    [cities],
  )
  const statusOptions = useMemo(
    () => [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'suspended', label: 'Suspended' },
    ],
    [],
  )

  function openCreate() {
    setForm({
      id: '', driver_code: '', first_name: '', last_name: '', phone: '', email: '',
      license_number: '', license_expiry: '', city_id: '', city_name: '', status: 'active', notes: '',
    })
    setModalOpen(true)
  }

  function openEdit(d: Driver) {
    setForm({
      id: String(d.id),
      driver_code: d.driver_code || '',
      first_name: d.first_name || '',
      last_name: d.last_name || '',
      phone: d.phone || '',
      email: d.email || '',
      license_number: d.license_number || '',
      license_expiry: (d.license_expiry || '').toString().slice(0, 10),
      city_id: d.city_id != null ? String(d.city_id) : '',
      city_name: d.city_name || '',
      status: d.status || 'active',
      notes: d.notes || '',
    })
    setModalOpen(true)
  }

  async function deleteDriver(d: { id: number | string; name?: string; first_name?: string }) {
    const label = d.name || d.first_name || 'this driver'
    if (!window.confirm(`Delete driver ${label}?\n\nThis cannot be undone from the list. Unassign any vehicles first.`)) return
    setBusy(true)
    try {
      await driversApi.remove(d.id)
      toast.success('Driver deleted')
      setModalOpen(false)
      setRows((list) => list.filter((row) => Number(row.id) !== Number(d.id)))
      setTotal((n) => Math.max(0, n - 1))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim()) return toast.error('First name required')
    setBusy(true)
    try {
      const city = cities.find((c) => String(c.id) === form.city_id)
      const body = {
        driver_code: form.driver_code.trim() || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        license_number: form.license_number.trim() || null,
        license_expiry: form.license_expiry || null,
        city_id: form.city_id ? Number(form.city_id) : null,
        city_name: city?.name || form.city_name || null,
        status: form.status,
        notes: form.notes.trim() || null,
      }
      if (form.id) {
        await driversApi.update(form.id, body)
        toast.success('Driver updated')
      } else {
        await driversApi.create(body)
        toast.success('Driver created')
      }
      setModalOpen(false)
      const r = await driversApi.list({ search: q || undefined, status: status || undefined, holding: holding || undefined, limit: 100 })
      setRows(r.rows || [])
      setTotal(r.total || 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function exportHolding() {
    downloadCsv(
      'driver-holding.csv',
      ['Driver', 'Code', 'Phone', 'City', 'Vehicle', 'Model', 'Location', 'Assigned since'],
      holdingRows.map((r) => [
        String(r.driver_name || ''),
        String(r.driver_code || ''),
        String(r.driver_phone || ''),
        String(r.city_name || ''),
        String(r.vehicle_number || ''),
        String(r.model || ''),
        String(r.location_name || ''),
        String(r.last_checkout || ''),
      ]),
    )
  }

  return (
    <AppLayout title="Drivers" subtitle="Fleet drivers — assign vehicles and track who holds what">
      <div className="rm-page">
        <div className="rm-master-tabs">
          <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setParams({})}>All drivers</button>
          <button type="button" className={view === 'holding' ? 'is-active' : ''} onClick={() => setParams({ view: 'holding' })}>Who holds what</button>
        </div>

        {view === 'list' ? (
          <div className="rm-panel">
            <div className="rm-panel__bar">
              <h2>Drivers <span>{total}</span></h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                <i className="fas fa-plus" /> Add driver
              </button>
            </div>
            <div className="rm-filters rm-filters--stack">
              <input className="form-control" placeholder="Search name, code, phone, license…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <AppSelect
                value={status}
                onChange={setStatus}
                searchable={false}
                placeholder="All statuses"
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
              />
              <AppSelect
                value={holding}
                onChange={setHolding}
                searchable={false}
                placeholder="Any holding"
                options={[
                  { value: '', label: 'Any holding' },
                  { value: '1', label: 'Currently assigned a vehicle' },
                  { value: '0', label: 'No vehicle assigned' },
                ]}
              />
            </div>
            {loading ? <div className="rm-empty">Loading…</div> : (
              <>
              <div className="table-responsive data-table-desktop">
                <table className="table table-hover" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Code</th>
                      <th>Phone</th>
                      <th>License</th>
                      <th>City</th>
                      <th>Status</th>
                      <th>Current vehicle</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(d)}>
                        <td>
                          <strong>{d.name}</strong>
                        </td>
                        <td>{d.driver_code || '—'}</td>
                        <td>{d.phone || '—'}</td>
                        <td>{d.license_number || '—'}</td>
                        <td>{d.city_name || '—'}</td>
                        <td><span className={`rm-status ${d.status === 'active' ? 'rm-status--active' : 'rm-status--inactive'}`}>{d.status}</span></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {d.current_vehicle_id ? (
                            <Link to={`/vehicles/${d.current_vehicle_id}`}>{d.current_vehicle_number} · {d.current_vehicle_model}</Link>
                          ) : '—'}
                        </td>
                        <td className="text-right" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-xs btn-default" onClick={() => openEdit(d)}>Edit</button>{' '}
                          <Link className="btn btn-xs btn-default" to={`/drivers/${d.id}`}>History</Link>
                          {canDelete ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="btn btn-xs btn-danger"
                                disabled={busy}
                                onClick={() => { void deleteDriver(d) }}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? <tr><td colSpan={8}>No drivers yet</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className="data-table-mobile" aria-label="Drivers">
                {!rows.length ? <p className="text-muted data-card-empty">No drivers yet</p> : null}
                {rows.map((d) => (
                  <article key={d.id} className="data-card" onClick={() => openEdit(d)} style={{ cursor: 'pointer' }}>
                    <div className="data-card-title">
                      {d.name}
                      <span className={`rm-status ${d.status === 'active' ? 'rm-status--active' : 'rm-status--inactive'}`} style={{ marginLeft: 8, fontSize: 11 }}>
                        {d.status}
                      </span>
                    </div>
                    <dl className="data-card-fields">
                      <div className="data-card-field"><dt>Code</dt><dd>{d.driver_code || '—'}</dd></div>
                      <div className="data-card-field"><dt>Phone</dt><dd>{d.phone || '—'}</dd></div>
                      <div className="data-card-field"><dt>License</dt><dd>{d.license_number || '—'}</dd></div>
                      <div className="data-card-field"><dt>City</dt><dd>{d.city_name || '—'}</dd></div>
                      <div className="data-card-field">
                        <dt>Vehicle</dt>
                        <dd onClick={(e) => e.stopPropagation()}>
                          {d.current_vehicle_id ? (
                            <Link to={`/vehicles/${d.current_vehicle_id}`}>{d.current_vehicle_number} · {d.current_vehicle_model}</Link>
                          ) : '—'}
                        </dd>
                      </div>
                    </dl>
                    <div className="data-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-sm btn-default" onClick={() => openEdit(d)}>Edit</button>
                      <Link className="btn btn-sm btn-default" to={`/drivers/${d.id}`}>History</Link>
                      {canDelete ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => { void deleteDriver(d) }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              </>
            )}
          </div>
        ) : (
          <div className="rm-panel">
            <div className="rm-panel__bar">
              <h2>Who holds what</h2>
              <button type="button" className="btn btn-default btn-sm" onClick={exportHolding}>Export CSV</button>
            </div>
            {loading ? <div className="rm-empty">Loading…</div> : (
              <>
              <div className="table-responsive data-table-desktop">
                <table className="table table-hover" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Phone</th>
                      <th>Vehicle</th>
                      <th>Model</th>
                      <th>City</th>
                      <th>Assigned since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingRows.map((r, i) => (
                      <tr key={`${r.driver_id}-${r.vehicle_id}-${i}`}>
                        <td>
                          <Link to={`/drivers/${r.driver_id}`}><strong>{String(r.driver_name)}</strong></Link>
                          {r.driver_code ? <div className="rm-fleet-sub">{String(r.driver_code)}</div> : null}
                        </td>
                        <td>{String(r.driver_phone || '—')}</td>
                        <td><Link to={`/vehicles/${r.vehicle_id}`}>{String(r.vehicle_number)}</Link></td>
                        <td>{String(r.model || '—')}</td>
                        <td>{String(r.city_name || r.location_name || '—')}</td>
                        <td>{String(r.last_checkout || '—')}</td>
                      </tr>
                    ))}
                    {!holdingRows.length ? <tr><td colSpan={6}>No active driver assignments</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className="data-table-mobile" aria-label="Who holds what">
                {!holdingRows.length ? <p className="text-muted data-card-empty">No active driver assignments</p> : null}
                {holdingRows.map((r, i) => (
                  <article key={`${r.driver_id}-${r.vehicle_id}-${i}`} className="data-card">
                    <div className="data-card-title">
                      <Link to={`/drivers/${r.driver_id}`}>{String(r.driver_name)}</Link>
                      {r.driver_code ? <div className="rm-fleet-sub">{String(r.driver_code)}</div> : null}
                    </div>
                    <dl className="data-card-fields">
                      <div className="data-card-field"><dt>Phone</dt><dd>{String(r.driver_phone || '—')}</dd></div>
                      <div className="data-card-field"><dt>Vehicle</dt><dd><Link to={`/vehicles/${r.vehicle_id}`}>{String(r.vehicle_number)}</Link></dd></div>
                      <div className="data-card-field"><dt>Model</dt><dd>{String(r.model || '—')}</dd></div>
                      <div className="data-card-field"><dt>City</dt><dd>{String(r.city_name || r.location_name || '—')}</dd></div>
                      <div className="data-card-field"><dt>Assigned since</dt><dd>{String(r.last_checkout || '—')}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              </>
            )}
          </div>
        )}
      </div>

      {modalOpen ? createPortal(
        <div className="rm-modal-overlay" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="rm-modal rm-modal--wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal__head">
              <h3>{form.id ? 'Edit driver' : 'Add driver'}</h3>
              <button type="button" className="rm-modal__close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={save} className="rm-form-grid" style={{ padding: 4 }}>
              <label className="rm-field">First name *
                <input className="form-control" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </label>
              <label className="rm-field">Last name
                <input className="form-control" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </label>
              <label className="rm-field">Driver code
                <input className="form-control" value={form.driver_code} onChange={(e) => setForm({ ...form, driver_code: e.target.value })} placeholder="Auto if blank" />
              </label>
              <label className="rm-field">Phone
                <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="rm-field">Email
                <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="rm-field">License number
                <input className="form-control" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
              </label>
              <label className="rm-field">License expiry
                <DateField value={form.license_expiry} onChange={(v) => setForm({ ...form, license_expiry: v })} />
              </label>
              <label className="rm-field">City
                <AppSelect
                  value={form.city_id}
                  onChange={(v) => setForm({ ...form, city_id: v })}
                  options={cityOptions}
                  placeholder="Select city…"
                  searchable
                />
              </label>
              <label className="rm-field">Status
                <AppSelect
                  value={form.status}
                  onChange={(v) => setForm({ ...form, status: v })}
                  options={statusOptions}
                  placeholder="Select status…"
                  searchable={false}
                />
              </label>
              <label className="rm-field rm-field--full">Notes
                <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="rm-field--full" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4 }}>
                {form.id ? <Link className="btn btn-default" to={`/drivers/${form.id}`} style={{ marginRight: 'auto' }}>Assignment history</Link> : null}
                {form.id && canDelete ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => { void deleteDriver({ id: form.id, name: `${form.first_name} ${form.last_name}`.trim() }) }}
                  >
                    Delete
                  </button>
                ) : null}
                <button type="button" className="btn btn-default" onClick={() => setModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{form.id ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </AppLayout>
  )
}

export function DriverDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const canDelete = can('drivers.delete')
  const [driver, setDriver] = useState<Driver | null>(null)
  const [current, setCurrent] = useState<Record<string, unknown>[]>([])
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([driversApi.get(id), driversApi.vehicles(id)])
      .then(([d, v]) => {
        setDriver(d)
        setCurrent(v.current || [])
        setHistory(v.history || [])
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [id, toast])

  if (loading) return <AppLayout title="Driver"><p>Loading…</p></AppLayout>
  if (!driver) return <AppLayout title="Driver"><p>Not found</p></AppLayout>

  return (
    <AppLayout title={driver.name} subtitle={driver.driver_code || 'Fleet driver'}>
      <div className="rm-page">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/drivers" className="btn btn-default btn-sm">← Drivers</Link>
          {canDelete ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (!window.confirm(`Delete driver ${driver.name}?`)) return
                try {
                  await driversApi.remove(driver.id)
                  toast.success('Deleted')
                  navigate('/drivers')
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Delete failed')
                }
              }}
            >
              Delete
            </button>
          ) : null}
        </div>

        <div className="rm-panel" style={{ padding: 16 }}>
          <dl className="rm-detail-grid">
            <div><dt>Code</dt><dd>{driver.driver_code || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{driver.phone || '—'}</dd></div>
            <div><dt>Email</dt><dd>{driver.email || '—'}</dd></div>
            <div><dt>License</dt><dd>{driver.license_number || '—'}{driver.license_expiry ? ` · exp ${driver.license_expiry}` : ''}</dd></div>
            <div><dt>City</dt><dd>{driver.city_name || '—'}</dd></div>
            <div><dt>Status</dt><dd><span className={`rm-status ${driver.status === 'active' ? 'rm-status--active' : ''}`}>{driver.status}</span></dd></div>
          </dl>
        </div>

        <div className="rm-panel">
          <div className="rm-panel__bar"><h2>Currently holding</h2></div>
          <div className="table-responsive">
            <table className="table table-hover" style={{ marginBottom: 0 }}>
              <thead><tr><th>Vehicle</th><th>Model</th><th>City</th><th>Status</th><th>Since</th></tr></thead>
              <tbody>
                {current.map((v) => (
                  <tr key={String(v.id)}>
                    <td><Link to={`/vehicles/${v.id}`}>{String(v.vehicle_number)}</Link></td>
                    <td>{String(v.model || '—')}</td>
                    <td>{String(v.location_name || '—')}</td>
                    <td>{String(v.status || '—')}</td>
                    <td>{String(v.last_checkout || '—')}</td>
                  </tr>
                ))}
                {!current.length ? <tr><td colSpan={5}>No vehicle assigned</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rm-panel">
          <div className="rm-panel__bar"><h2>Assignment history</h2></div>
          <div className="table-responsive">
            <table className="table table-hover" style={{ marginBottom: 0 }}>
              <thead><tr><th>Vehicle</th><th>Assigned</th><th>Returned</th><th>Note</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={String(h.id)}>
                    <td>{h.vehicle_id ? <Link to={`/vehicles/${h.vehicle_id}`}>{String(h.vehicle_number || h.vehicle_id)}</Link> : '—'}</td>
                    <td>{String(h.assigned_at || '—')}</td>
                    <td>{String(h.unassigned_at || 'Open')}</td>
                    <td>{String(h.assign_note || h.unassign_note || '—')}</td>
                  </tr>
                ))}
                {!history.length ? <tr><td colSpan={4}>No history yet</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
