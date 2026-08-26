import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import AppLayout from '../../layout/AppLayout'
import { AppSelect } from '../../components/formControls'
import { vehiclesApi, type Vehicle, type VehicleFacets } from '../../api/vehicles'
import { formatAppDateTime } from '../../lib/datetime'

const PAGE_SIZE = 25

type Drill = 'none' | 'cities' | 'models' | 'fuel'

type PendingRow = {
  id: number
  vehicle_number: string
  model?: string | null
  location_name?: string | null
  session_id: number
  submitter_name?: string | null
  submitter_email?: string | null
  photo_count: number
  submitted_at?: string | null
}

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN')
}

function PendingVerifyAlert({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PendingRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vehiclesApi
      .pendingVerification(100)
      .then((res) => {
        if (cancelled) return
        setRows((res.rows || []) as PendingRow[])
        setTotal(Number(res.total || res.rows?.length || 0))
      })
      .catch(() => {
        if (cancelled) return
        setRows([])
        setTotal(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    if (!open || !btnRef.current) return
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect()
      const width = Math.min(380, window.innerWidth - 24)
      const right = Math.max(12, window.innerWidth - r.right)
      const top = Math.min(r.bottom + 8, window.innerHeight - 120)
      setPanelStyle({
        position: 'fixed',
        top,
        right,
        width,
        zIndex: 30050,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (loading && total === 0 && rows.length === 0) return null
  if (!loading && total === 0) return null

  const labelCount = total || rows.length
  const noun = labelCount === 1 ? 'vehicle' : 'vehicles'

  return (
    <div className="rm-pending-verify" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="rm-pending-verify__btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rm-pending-verify__count">{fmt(labelCount)}</span>
        <span className="rm-pending-verify__text">
          {noun} registered, need to verify
        </span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
      </button>
      {open
        ? createPortal(
          <div
            ref={panelRef}
            className="rm-pending-verify__panel rm-pending-verify__panel--portal"
            style={panelStyle}
            role="dialog"
            aria-label="Vehicles pending verification"
          >
            <div className="rm-pending-verify__panel-head">
              Pending form registrations · click plate to open Photos
            </div>
            {rows.length === 0 ? (
              <div className="rm-pending-verify__empty">Nothing pending right now.</div>
            ) : (
              <ul className="rm-pending-verify__list">
                {rows.map((r) => (
                  <li key={`${r.id}-${r.session_id}`}>
                    <Link
                      to={`/vehicles/${r.id}?tab=captures`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="rm-pending-verify__plate">{r.vehicle_number}</span>
                      <span className="rm-pending-verify__meta">
                        {[r.model, r.location_name].filter(Boolean).join(' · ') || '—'}
                        {r.photo_count ? ` · ${r.photo_count} photo${r.photo_count === 1 ? '' : 's'}` : ''}
                        {r.submitter_name ? ` · ${r.submitter_name}` : ''}
                        {r.submitted_at ? ` · ${formatAppDateTime(r.submitted_at)}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}

function statusClass(status: string) {
  const s = (status || '').toLowerCase()
  if (s.includes('assign') || s.includes('deploy')) return 'rm-status--assigned'
  if (s.includes('maint')) return 'rm-status--maintenance'
  if (s.includes('inactive') || s.includes('retire') || s.includes('delete')) return 'rm-status--inactive'
  if (s.includes('active') || s.includes('ready') || s.includes('rtd') || s.includes('stock')) return 'rm-status--active'
  return ''
}

function SortHead({
  label,
  col,
  sort,
  order,
  onSort,
}: {
  label: string
  col: string
  sort: string
  order: 'asc' | 'desc'
  onSort: (col: string) => void
}) {
  const active = sort === col
  return (
    <button
      type="button"
      className={`rm-fleet-sort${active ? ' is-active' : ''}`}
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      <i className={`fas fa-sort${active ? (order === 'asc' ? '-up' : '-down') : ''}`} aria-hidden />
    </button>
  )
}

export default function VehiclesList() {
  const [params] = useSearchParams()
  const qParam = params.get('q') || ''
  const [searchInput, setSearchInput] = useState(qParam)
  const [search, setSearch] = useState(qParam)
  const [location, setLocation] = useState('')
  const [cityId, setCityId] = useState('')
  const [model, setModel] = useState('')
  const [modelId, setModelId] = useState('')
  const [category, setCategory] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [verified, setVerified] = useState('')
  const [sort, setSort] = useState('vehicle_number')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Vehicle[]>([])
  const [total, setTotal] = useState(0)
  /** Unfiltered — KPI strip only */
  const [kpiFacets, setKpiFacets] = useState<VehicleFacets | null>(null)
  /** Cascading counts for chips / dropdowns under current filters */
  const [facets, setFacets] = useState<VehicleFacets | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drill, setDrill] = useState<Drill>('none')
  const [pendingRefresh, setPendingRefresh] = useState(0)

  useEffect(() => {
    setSearchInput(qParam)
    setSearch(qParam)
  }, [qParam])

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    const bump = () => setPendingRefresh((k) => k + 1)
    window.addEventListener('focus', bump)
    return () => window.removeEventListener('focus', bump)
  }, [])

  useEffect(() => {
    vehiclesApi.facets().then(setKpiFacets).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    vehiclesApi
      .facets({
        fuel_type: fuelType || undefined,
        city_id: cityId || undefined,
        location: cityId ? undefined : (location || undefined),
        model_id: modelId || undefined,
        model: modelId ? undefined : (model || undefined),
        category: category || undefined,
      })
      .then((f) => { if (!cancelled) setFacets(f) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [fuelType, cityId, location, modelId, model, category])

  useEffect(() => {
    setPage(0)
  }, [search, location, cityId, model, modelId, category, fuelType, verified, sort, order])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    vehiclesApi
      .list({
        search: search || undefined,
        location: cityId ? undefined : (location || undefined),
        city_id: cityId || undefined,
        model: modelId ? undefined : (model || undefined),
        model_id: modelId || undefined,
        category: category || undefined,
        fuel_type: fuelType || undefined,
        verified: verified || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort,
        order,
      })
      .then((data) => {
        if (cancelled) return
        setRows(data.rows || [])
        setTotal(data.total || 0)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load vehicles')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [search, location, cityId, model, modelId, category, fuelType, verified, sort, order, page])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleSort = (col: string) => {
    if (sort === col) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(col)
      setOrder(col === 'verification_status' ? 'desc' : 'asc')
    }
  }

  const fleetTotal = useMemo(() => {
    if (!kpiFacets) return null
    return kpiFacets.fuel_types.reduce((s, f) => s + Number(f.c || 0), 0)
  }, [kpiFacets])

  const evCount = useMemo(
    () => kpiFacets?.fuel_types.find((f) => f.value === 'EV')?.c ?? null,
    [kpiFacets],
  )

  const cityCount = kpiFacets?.locations.length ?? null
  const modelCount = kpiFacets?.models.length ?? null
  const evShare = fleetTotal && evCount != null && fleetTotal > 0
    ? `${((evCount / fleetTotal) * 100).toFixed(1)}% of total fleet`
    : 'Electric vehicles in fleet'

  const hasActiveFilter = Boolean(cityId || location || modelId || model || category || fuelType || verified)

  const clearFilters = () => {
    setCityId('')
    setLocation('')
    setModelId('')
    setModel('')
    setCategory('')
    setFuelType('')
    setVerified('')
    setSort('vehicle_number')
    setOrder('asc')
    setDrill('none')
  }

  const selectCity = (id: number | undefined, name: string) => {
    if (id != null && String(id) === cityId) {
      setCityId('')
      setLocation('')
      return
    }
    if (id != null) {
      setCityId(String(id))
      setLocation('')
    } else {
      setCityId('')
      setLocation(name)
    }
    setDrill('none')
  }

  const selectModel = (id: number | undefined, name: string) => {
    if (id != null && String(id) === modelId) {
      setModelId('')
      setModel('')
      return
    }
    if (id != null) {
      setModelId(String(id))
      setModel('')
    } else {
      setModelId('')
      setModel(name)
    }
    // Next step in cascade: pick a city within fuel + model
    setDrill('cities')
  }

  const selectFuel = (value: string) => {
    setFuelType((prev) => {
      const next = prev === value ? '' : value
      if (next) {
        // Cascade: fuel → models available for that fuel
        setDrill('models')
      }
      return next
    })
  }

  const activateEvFleet = () => {
    if (fuelType === 'EV' && drill === 'models') {
      setDrill('none')
      return
    }
    setFuelType('EV')
    setDrill('models')
  }

  const chipFacets = facets || kpiFacets

  const activeCityLabel =
    (chipFacets?.locations || []).find((o) => String(o.id) === cityId || o.value === location)?.value
    || (kpiFacets?.locations || []).find((o) => String(o.id) === cityId || o.value === location)?.value
  const activeModelLabel =
    (chipFacets?.models || []).find((o) => String(o.id) === modelId || o.value === model)?.value
    || (kpiFacets?.models || []).find((o) => String(o.id) === modelId || o.value === model)?.value

  const filterSummary = [
    fuelType ? `${fuelType} fleet` : null,
    activeModelLabel ? `model ${activeModelLabel}` : null,
    activeCityLabel ? `in ${activeCityLabel}` : null,
    verified === '1' ? 'Verified' : verified === '0' ? 'Not Verified' : null,
  ].filter(Boolean).join(' · ')

  return (
    <AppLayout
      title="Vehicles"
      subtitle="Manage and monitor your Refex Mobility fleet"
      headerAside={<PendingVerifyAlert refreshKey={pendingRefresh} />}
    >
      <div className="rm-page">
        <div className="rm-kpi-row">
          <button
            type="button"
            className={`rm-kpi${!hasActiveFilter && drill === 'none' ? ' is-active' : ''}`}
            onClick={clearFilters}
          >
            <span className="rm-kpi__label">Vehicles</span>
            <span className="rm-kpi__value">{fmt(fleetTotal)}</span>
            <span className="rm-kpi__hint">Full fleet inventory</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-car" /></span>
          </button>

          <button
            type="button"
            className={`rm-kpi rm-kpi--green${fuelType === 'EV' || drill === 'fuel' ? ' is-active' : ''}`}
            onClick={activateEvFleet}
          >
            <span className="rm-kpi__label">EV fleet</span>
            <span className="rm-kpi__value">{fmt(evCount)}</span>
            <span className="rm-kpi__hint">{evShare}</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-bolt" /></span>
          </button>

          <button
            type="button"
            className={`rm-kpi rm-kpi--orange${drill === 'cities' || cityId || location ? ' is-active' : ''}`}
            onClick={() => setDrill((d) => (d === 'cities' ? 'none' : 'cities'))}
          >
            <span className="rm-kpi__label">Cities</span>
            <span className="rm-kpi__value">{fmt(cityCount)}</span>
            <span className="rm-kpi__hint">
              {fuelType || modelId || model
                ? `${fmt(chipFacets?.locations?.length)} with current filters`
                : 'Active operating locations'}
            </span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-map-marker-alt" /></span>
          </button>

          <button
            type="button"
            className={`rm-kpi rm-kpi--slate${drill === 'models' || modelId || model ? ' is-active' : ''}`}
            onClick={() => setDrill((d) => (d === 'models' ? 'none' : 'models'))}
          >
            <span className="rm-kpi__label">Models</span>
            <span className="rm-kpi__value">{fmt(modelCount)}</span>
            <span className="rm-kpi__hint">
              {fuelType || cityId || location
                ? `${fmt(chipFacets?.models?.length)} with current filters`
                : 'Platforms in operation'}
            </span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-car-side" /></span>
          </button>
        </div>

        {drill === 'cities' ? (
          <div className="rm-chip-row" style={{ paddingTop: 0 }}>
            {(chipFacets?.locations || []).length === 0 ? (
              <span className="text-muted" style={{ fontSize: 13 }}>No cities match the current filters</span>
            ) : (chipFacets?.locations || []).map((o) => {
              const active = (o.id != null && String(o.id) === cityId) || (!cityId && o.value === location)
              return (
                <button
                  key={o.id ?? o.value}
                  type="button"
                  className={`rm-chip${active ? ' is-active' : ''}`}
                  onClick={() => selectCity(o.id, o.value)}
                >
                  {o.value}
                  <b>{o.c}</b>
                </button>
              )
            })}
          </div>
        ) : null}

        {drill === 'models' ? (
          <div className="rm-chip-row" style={{ paddingTop: 0 }}>
            {(chipFacets?.models || []).length === 0 ? (
              <span className="text-muted" style={{ fontSize: 13 }}>
                {fuelType ? `No models with ${fuelType} vehicles` : 'No models match the current filters'}
              </span>
            ) : (chipFacets?.models || []).map((o) => {
              const active = (o.id != null && String(o.id) === modelId) || (!modelId && o.value === model)
              return (
                <button
                  key={o.id ?? o.value}
                  type="button"
                  className={`rm-chip${active ? ' is-active' : ''}`}
                  onClick={() => selectModel(o.id, o.value)}
                >
                  {o.value}
                  <b>{o.c}</b>
                </button>
              )
            })}
          </div>
        ) : null}

        {drill === 'fuel' ? (
          <div className="rm-chip-row" style={{ paddingTop: 0 }}>
            {(chipFacets?.fuel_types || []).map((o) => (
              <button
                key={o.value}
                type="button"
                className={`rm-chip${fuelType === o.value ? ' is-active' : ''}`}
                onClick={() => selectFuel(o.value)}
              >
                {o.value}
                <b>{o.c}</b>
              </button>
            ))}
            {(chipFacets?.categories || []).map((o) => (
              <button
                key={`cat-${o.value}`}
                type="button"
                className={`rm-chip${category === o.value ? ' is-active' : ''}`}
                onClick={() => setCategory((prev) => (prev === o.value ? '' : o.value))}
              >
                {o.value}
                <b>{o.c}</b>
              </button>
            ))}
          </div>
        ) : null}

        {hasActiveFilter ? (
          <div className="rm-active-filters">
            <span>Filtered</span>
            {fuelType ? <span className="rm-pill">Fuel · {fuelType}</span> : null}
            {activeModelLabel ? <span className="rm-pill">Model · {activeModelLabel}</span> : null}
            {activeCityLabel ? <span className="rm-pill">City · {activeCityLabel}</span> : null}
            {category ? <span className="rm-pill">Category · {category}</span> : null}
            {verified === '1' ? <span className="rm-pill">Verified</span> : null}
            {verified === '0' ? <span className="rm-pill">Not Verified</span> : null}
            <button type="button" className="btn btn-default btn-xs" onClick={clearFilters}>Reset</button>
            <em style={{ fontStyle: 'normal', marginLeft: 'auto' }}>
              {fmt(total)} matches{filterSummary ? ` · ${filterSummary}` : ''}
            </em>
          </div>
        ) : null}

        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>
              Fleet{' '}
              <span>
                {fmt(total)} vehicles
                {filterSummary ? ` · ${filterSummary}` : ''}
              </span>
            </h2>
            <div className="rm-page-actions">
              <Link className="btn btn-primary btn-sm" to="/vehicles/create">
                <i className="fas fa-plus" /> Add vehicle
              </Link>
            </div>
          </div>

          <div className="rm-filters">
            <input
              className="form-control"
              placeholder="Search plate, model, city…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <AppSelect
              value={cityId || location}
              searchable
              placeholder="All cities"
              options={[
                { value: '', label: 'All cities' },
                ...(chipFacets?.locations || []).map((o) => ({
                  value: o.id != null ? String(o.id) : o.value,
                  label: `${o.value} (${o.c})`,
                })),
              ]}
              onChange={(val) => {
                const hit = (chipFacets?.locations || []).find((o) => String(o.id) === val || o.value === val)
                if (hit?.id != null) {
                  setCityId(String(hit.id))
                  setLocation('')
                } else {
                  setCityId('')
                  setLocation(val)
                }
              }}
            />
            <AppSelect
              value={modelId || model}
              searchable
              placeholder="All models"
              options={[
                { value: '', label: 'All models' },
                ...(chipFacets?.models || []).map((o) => ({
                  value: o.id != null ? String(o.id) : o.value,
                  label: `${o.value} (${o.c})`,
                })),
              ]}
              onChange={(val) => {
                const hit = (chipFacets?.models || []).find((o) => String(o.id) === val || o.value === val)
                if (hit?.id != null) {
                  setModelId(String(hit.id))
                  setModel('')
                } else {
                  setModelId('')
                  setModel(val)
                }
              }}
            />
            <AppSelect
              value={category}
              onChange={setCategory}
              searchable={false}
              placeholder="All categories"
              options={[
                { value: '', label: 'All categories' },
                ...(chipFacets?.categories || []).map((o) => ({ value: o.value, label: `${o.value} (${o.c})` })),
              ]}
            />
            <AppSelect
              value={fuelType}
              onChange={(v) => {
                setFuelType(v)
                if (v) setDrill('models')
              }}
              searchable={false}
              placeholder="All fuel types"
              options={[
                { value: '', label: 'All fuel types' },
                ...((kpiFacets || chipFacets)?.fuel_types || []).map((o) => ({
                  value: o.value,
                  label: `${o.value} (${o.c})`,
                })),
              ]}
            />
            <AppSelect
              value={verified}
              onChange={setVerified}
              searchable={false}
              placeholder="All verification"
              options={[
                { value: '', label: 'All verification' },
                { value: '1', label: 'Verified' },
                { value: '0', label: 'Not Verified' },
              ]}
            />
          </div>

          {error ? <div className="callout callout-danger" style={{ margin: 16 }}>{error}</div> : null}

          <div className="rm-fleet-head">
            <span />
            <SortHead label="Vehicle" col="vehicle_number" sort={sort} order={order} onSort={toggleSort} />
            <SortHead label="Location" col="location_name" sort={sort} order={order} onSort={toggleSort} />
            <SortHead label="Status" col="status" sort={sort} order={order} onSort={toggleSort} />
            <span>Assigned</span>
            <SortHead label="Verification" col="verification_status" sort={sort} order={order} onSort={toggleSort} />
            <span>Actions</span>
          </div>

          <div className="rm-fleet-list">
            {loading ? (
              <div className="rm-empty">Loading fleet…</div>
            ) : rows.length === 0 ? (
              <div className="rm-empty">
                No vehicles found
                {filterSummary ? ` for ${filterSummary}` : ''}. Try Reset or pick another model/city.
              </div>
            ) : rows.map((v) => (
              <div key={v.id} className="rm-fleet-row">
                <Link to={`/vehicles/${v.id}`} className="rm-fleet-thumb" aria-hidden tabIndex={-1}>
                  <i className={v.fuel_type === 'EV' ? 'fas fa-bolt' : 'fas fa-car'} />
                </Link>
                <Link to={`/vehicles/${v.id}`} className="rm-fleet-identity">
                  <div className="rm-fleet-plate">{v.vehicle_number}</div>
                  <div className="rm-fleet-sub">{v.model}{v.fuel_type ? ` · ${v.fuel_type}` : ''}</div>
                </Link>
                <div className="rm-fleet-meta">
                  <i className="fas fa-map-marker-alt" style={{ opacity: 0.55, fontSize: 11 }} />
                  {v.location_name || '—'}
                </div>
                <div>
                  <span className={`rm-status ${statusClass(v.status)}`}>{v.status || '—'}</span>
                </div>
                <div className="rm-fleet-meta">{v.assigned_name || 'Unassigned'}</div>
                <div>
                  <span className={`rm-verify-badge ${v.form_verified ? 'rm-verify-badge--ok' : 'rm-verify-badge--no'}`}>
                    {v.verification_status || (v.form_verified ? 'Verified' : 'Not Verified')}
                  </span>
                </div>
                <div className="rm-fleet-actions" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to={`/vehicles/${v.id}?tab=captures&capture=1`}
                    className="icon-btn icon-btn-solid icon-btn-photo"
                    title="Open camera"
                    aria-label={`Open camera for ${v.vehicle_number}`}
                  >
                    <i className="fas fa-camera" aria-hidden />
                  </Link>
                  <Link
                    to={`/vehicles/${v.id}`}
                    className="icon-btn icon-btn-solid icon-btn-view"
                    title="View"
                    aria-label={`View ${v.vehicle_number}`}
                  >
                    <i className="fas fa-eye" aria-hidden />
                  </Link>
                  <Link
                    to={`/vehicles/${v.id}/edit`}
                    className="icon-btn icon-btn-solid icon-btn-edit"
                    title="Edit"
                    aria-label={`Edit ${v.vehicle_number}`}
                  >
                    <i className="fas fa-pencil-alt" aria-hidden />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="rm-pager">
            <button type="button" className="btn btn-default btn-sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>Page {page + 1} / {pageCount}</span>
            <button type="button" className="btn btn-default btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
