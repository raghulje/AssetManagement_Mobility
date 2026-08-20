import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../layout/AppLayout'
import { api, type ApiList, reportsApi } from '../api/client'
import { vehiclesApi } from '../api/vehicles'
import { downloadAuthedCsv, downloadCsv } from '../utils/csv'
import { useToast } from '../components/Toast'
import { DateField, AppSelect } from '../components/formControls'

type AuditTab = 'fleet' | 'activity'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Indian FY: Apr 1 → Mar 31 */
function indianFyRange(ref = new Date()) {
  const y = ref.getFullYear()
  const m = ref.getMonth() // 0-based
  const startYear = m >= 3 ? y : y - 1
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
  }
}

function monthRange(ref = new Date()) {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  return { from: isoDate(from), to: isoDate(to), label: from.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
}

function weekRange(ref = new Date()) {
  const day = ref.getDay() || 7 // Mon=1 … Sun=7
  const monday = new Date(ref)
  monday.setDate(ref.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: isoDate(monday), to: isoDate(sunday), label: `Week ${isoDate(monday)} → ${isoDate(sunday)}` }
}

export default function AuditPage() {
  const toast = useToast()
  const [tab, setTab] = useState<AuditTab>('fleet')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [fuel, setFuel] = useState('')
  const [holding, setHolding] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [periodLabel, setPeriodLabel] = useState('All time')
  const [actionType, setActionType] = useState('')
  const [itemType, setItemType] = useState('vehicle')
  const [fleetRows, setFleetRows] = useState<Record<string, unknown>[]>([])
  const [activityRows, setActivityRows] = useState<Record<string, unknown>[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    vehiclesApi.facets().then((f) => {
      setCities((f.locations || []).map((l) => l.value))
    }).catch(() => undefined)
  }, [])

  const query = useMemo(() => ({
    search: search || undefined,
    city: city || undefined,
    status: status || undefined,
    fuel_type: fuel || undefined,
    holding: holding || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 500,
  }), [search, city, status, fuel, holding, from, to])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (tab === 'fleet') {
      const sp = new URLSearchParams()
      Object.entries(query).forEach(([k, v]) => { if (v != null && v !== '') sp.set(k, String(v)) })
      api<ApiList<Record<string, unknown>>>(`/reports/fleet-audit?${sp}`)
        .then((r) => {
          if (cancelled) return
          setFleetRows(r.rows || [])
          setTotal(r.total || 0)
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Audit load failed'))
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      const sp = new URLSearchParams()
      if (actionType) sp.set('action_type', actionType)
      if (itemType) sp.set('item_type', itemType)
      if (from) sp.set('from', from)
      if (to) sp.set('to', to)
      sp.set('limit', '500')
      reportsApi.activityFiltered(sp.toString())
        .then((r) => {
          if (cancelled) return
          setActivityRows(r.rows || [])
          setTotal(r.total || r.rows?.length || 0)
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Activity load failed'))
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [tab, query, actionType, itemType, from, to, toast])

  function applyPeriod(kind: 'fy' | 'month' | 'week' | 'clear') {
    if (kind === 'clear') {
      setFrom('')
      setTo('')
      setPeriodLabel('All time')
      return
    }
    const range = kind === 'fy' ? indianFyRange() : kind === 'month' ? monthRange() : weekRange()
    setFrom(range.from)
    setTo(range.to)
    setPeriodLabel(range.label)
  }

  async function exportFleet() {
    try {
      const sp = new URLSearchParams()
      Object.entries(query).forEach(([k, v]) => {
        if (k === 'limit') return
        if (v != null && v !== '') sp.set(k, String(v))
      })
      await downloadAuthedCsv(`/reports/fleet-audit/export?${sp}`, `fleet-audit-${isoDate(new Date())}.csv`)
      toast.success('Export downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  async function exportActivity() {
    try {
      const sp = new URLSearchParams()
      if (actionType) sp.set('action_type', actionType)
      if (itemType) sp.set('item_type', itemType)
      if (from) sp.set('from', from)
      if (to) sp.set('to', to)
      await downloadAuthedCsv(`/reports/activity/export?${sp}`, `fleet-activity-${isoDate(new Date())}.csv`)
      toast.success('Export downloaded')
    } catch (e) {
      // fallback client CSV
      downloadCsv(
        `fleet-activity-${isoDate(new Date())}.csv`,
        ['Date', 'Admin', 'Action', 'Item', 'Target', 'Note'],
        activityRows.map((r) => [
          String(r.action_date || ''),
          String(r.admin || ''),
          String(r.action_type || ''),
          String(r.item_name || ''),
          String(r.target_name || ''),
          String(r.note || ''),
        ]),
      )
      toast.success('Exported locally')
    }
  }

  return (
    <AppLayout title="Audit" subtitle="Auditor view — fleet inventory, assignments, activity, export">
      <div className="rm-page">
        <div className="rm-master-tabs">
          <button type="button" className={tab === 'fleet' ? 'is-active' : ''} onClick={() => setTab('fleet')}>Fleet inventory</button>
          <button type="button" className={tab === 'activity' ? 'is-active' : ''} onClick={() => setTab('activity')}>Activity log</button>
        </div>

        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>
              {tab === 'fleet' ? 'Fleet audit' : 'Activity audit'}
              <span>{total} rows · {periodLabel}</span>
            </h2>
            <div className="rm-page-actions">
              <button type="button" className="btn btn-default btn-sm" onClick={() => applyPeriod('week')}>This week</button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => applyPeriod('month')}>This month</button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => applyPeriod('fy')}>This FY</button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => applyPeriod('clear')}>All time</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void (tab === 'fleet' ? exportFleet() : exportActivity())}
              >
                <i className="fas fa-download" /> Export CSV
              </button>
            </div>
          </div>

          <div className="rm-filters" style={{ gridTemplateColumns: tab === 'fleet' ? '1.5fr repeat(4, minmax(0, 1fr)) minmax(240px, 1.2fr)' : '1fr 1fr minmax(240px, 1.2fr)' }}>
            {tab === 'fleet' ? (
              <>
                <input className="form-control" placeholder="Search plate, model, VIN, driver…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <AppSelect
                  value={city}
                  onChange={setCity}
                  searchable
                  placeholder="All cities"
                  options={[
                    { value: '', label: 'All cities' },
                    ...cities.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <AppSelect
                  value={status}
                  onChange={setStatus}
                  searchable={false}
                  placeholder="All statuses"
                  options={[
                    { value: '', label: 'All statuses' },
                    ...['available', 'assigned', 'maintenance', 'retired', 'inactive'].map((s) => ({ value: s, label: s })),
                  ]}
                />
                <AppSelect
                  value={fuel}
                  onChange={setFuel}
                  searchable={false}
                  placeholder="All fuel"
                  options={[
                    { value: '', label: 'All fuel' },
                    { value: 'EV', label: 'EV' },
                    { value: 'CNG_PETROL', label: 'CNG / Petrol' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
                <AppSelect
                  value={holding}
                  onChange={setHolding}
                  searchable={false}
                  placeholder="Assigned / not"
                  options={[
                    { value: '', label: 'Assigned / not' },
                    { value: 'assigned', label: 'Assigned' },
                    { value: 'unassigned', label: 'Unassigned' },
                  ]}
                />
                <div className="rm-date-range">
                  <DateField value={from} onChange={(v) => { setFrom(v); setPeriodLabel('Custom') }} placeholder="From" />
                  <DateField value={to} onChange={(v) => { setTo(v); setPeriodLabel('Custom') }} placeholder="To" />
                </div>
              </>
            ) : (
              <>
                <AppSelect
                  value={itemType}
                  onChange={setItemType}
                  searchable={false}
                  options={[
                    { value: 'vehicle', label: 'Vehicles' },
                    { value: 'driver', label: 'Drivers' },
                    { value: '', label: 'All item types' },
                  ]}
                />
                <AppSelect
                  value={actionType}
                  onChange={setActionType}
                  searchable={false}
                  placeholder="All actions"
                  options={[
                    { value: '', label: 'All actions' },
                    ...['create', 'update', 'delete', 'checkout', 'checkin', 'maintenance', 'uploaded'].map((a) => ({ value: a, label: a })),
                  ]}
                />
                <div className="rm-date-range">
                  <DateField value={from} onChange={(v) => { setFrom(v); setPeriodLabel('Custom') }} placeholder="From" />
                  <DateField value={to} onChange={(v) => { setTo(v); setPeriodLabel('Custom') }} placeholder="To" />
                </div>
              </>
            )}
          </div>

          {loading ? <div className="rm-empty">Loading audit data…</div> : tab === 'fleet' ? (
            <div className="table-responsive">
              <table className="table table-hover" style={{ marginBottom: 0, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Registration</th>
                    <th>Model</th>
                    <th>City</th>
                    <th>Status</th>
                    <th>Holder</th>
                    <th>Insurance exp</th>
                    <th>Reg exp</th>
                    <th>EOL</th>
                    <th>Photos</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fleetRows.map((r) => (
                    <tr key={String(r.id)}>
                      <td><strong>{String(r.vehicle_number)}</strong></td>
                      <td>{[r.make, r.model].filter(Boolean).join(' ') || '—'}</td>
                      <td>{String(r.location_name || '—')}</td>
                      <td><span className="rm-status">{String(r.status || '—')}</span></td>
                      <td>{String(r.holder_name || r.driver_name || '—')}</td>
                      <td>{String(r.insurance_expiry_date || '—')}</td>
                      <td>{String(r.registration_expiry || '—')}</td>
                      <td>{String(r.vehicle_eol_date || '—')}</td>
                      <td>{String(r.photos_count ?? 0)}</td>
                      <td><Link to={`/vehicles/${r.id}`}>Open</Link></td>
                    </tr>
                  ))}
                  {!fleetRows.length ? <tr><td colSpan={10}>No vehicles match filters</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover" style={{ marginBottom: 0, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Item</th>
                    <th>Target</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((r) => (
                    <tr key={String(r.id)}>
                      <td>{String(r.action_date || '')}</td>
                      <td>{String(r.admin || '—')}</td>
                      <td>{String(r.action_type || '')}</td>
                      <td>{String(r.item_name || `${r.item_type}#${r.item_id}`)}</td>
                      <td>{String(r.target_name || '—')}</td>
                      <td>{String(r.note || '—')}</td>
                    </tr>
                  ))}
                  {!activityRows.length ? <tr><td colSpan={6}>No activity in this period</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
