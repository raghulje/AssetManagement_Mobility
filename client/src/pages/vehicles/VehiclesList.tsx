import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { AppSelect } from '../../components/formControls'
import { vehiclesApi, type Vehicle, type VehicleFacets } from '../../api/vehicles'

const PAGE_SIZE = 25

type Drill = 'none' | 'cities' | 'models' | 'fuel'

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN')
}

function statusClass(status: string) {
  const s = (status || '').toLowerCase()
  if (s.includes('assign') || s.includes('deploy')) return 'rm-status--assigned'
  if (s.includes('maint')) return 'rm-status--maintenance'
  if (s.includes('inactive') || s.includes('retire') || s.includes('delete')) return 'rm-status--inactive'
  if (s.includes('active') || s.includes('ready') || s.includes('rtd') || s.includes('stock')) return 'rm-status--active'
  return ''
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
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Vehicle[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<VehicleFacets | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drill, setDrill] = useState<Drill>('none')

  useEffect(() => {
    setSearchInput(qParam)
    setSearch(qParam)
  }, [qParam])

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    vehiclesApi.facets().then(setFacets).catch(() => undefined)
  }, [])

  useEffect(() => {
    setPage(0)
  }, [search, location, cityId, model, modelId, category, fuelType])

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
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort: 'vehicle_number',
        order: 'asc',
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
  }, [search, location, cityId, model, modelId, category, fuelType, page])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fleetTotal = useMemo(() => {
    if (!facets) return null
    return facets.fuel_types.reduce((s, f) => s + Number(f.c || 0), 0)
  }, [facets])

  const evCount = useMemo(
    () => facets?.fuel_types.find((f) => f.value === 'EV')?.c ?? null,
    [facets],
  )

  const cityCount = facets?.locations.length ?? null
  const modelCount = facets?.models.length ?? null
  const evShare = fleetTotal && evCount != null && fleetTotal > 0
    ? `${((evCount / fleetTotal) * 100).toFixed(1)}% of total fleet`
    : 'Electric vehicles in fleet'

  const hasActiveFilter = Boolean(cityId || location || modelId || model || category || fuelType)

  const clearFilters = () => {
    setCityId('')
    setLocation('')
    setModelId('')
    setModel('')
    setCategory('')
    setFuelType('')
    setDrill('none')
  }

  const toggleDrill = (next: Drill) => {
    setDrill((d) => (d === next ? 'none' : next))
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
  }

  const selectFuel = (value: string) => {
    setFuelType((prev) => (prev === value ? '' : value))
  }

  const activeCityLabel =
    (facets?.locations || []).find((o) => String(o.id) === cityId || o.value === location)?.value
  const activeModelLabel =
    (facets?.models || []).find((o) => String(o.id) === modelId || o.value === model)?.value

  return (
    <AppLayout title="Vehicles" subtitle="Manage and monitor your Refex Mobility fleet">
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
            className={`rm-kpi rm-kpi--green${drill === 'fuel' || fuelType ? ' is-active' : ''}`}
            onClick={() => {
              if (drill !== 'fuel' && !fuelType) {
                setFuelType('EV')
                setDrill('fuel')
                return
              }
              toggleDrill('fuel')
            }}
          >
            <span className="rm-kpi__label">EV fleet</span>
            <span className="rm-kpi__value">{fmt(evCount)}</span>
            <span className="rm-kpi__hint">{evShare}</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-bolt" /></span>
          </button>

          <button
            type="button"
            className={`rm-kpi rm-kpi--orange${drill === 'cities' || cityId || location ? ' is-active' : ''}`}
            onClick={() => toggleDrill('cities')}
          >
            <span className="rm-kpi__label">Cities</span>
            <span className="rm-kpi__value">{fmt(cityCount)}</span>
            <span className="rm-kpi__hint">Active operating locations</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-map-marker-alt" /></span>
          </button>

          <button
            type="button"
            className={`rm-kpi rm-kpi--slate${drill === 'models' || modelId || model ? ' is-active' : ''}`}
            onClick={() => toggleDrill('models')}
          >
            <span className="rm-kpi__label">Models</span>
            <span className="rm-kpi__value">{fmt(modelCount)}</span>
            <span className="rm-kpi__hint">Platforms in operation</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-car-side" /></span>
          </button>
        </div>

        {drill === 'cities' ? (
          <div className="rm-chip-row" style={{ paddingTop: 0 }}>
            {(facets?.locations || []).map((o) => {
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
            {(facets?.models || []).map((o) => {
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
            {(facets?.fuel_types || []).map((o) => (
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
            {(facets?.categories || []).map((o) => (
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
            {activeCityLabel ? <span className="rm-pill">City · {activeCityLabel}</span> : null}
            {activeModelLabel ? <span className="rm-pill">Model · {activeModelLabel}</span> : null}
            {fuelType ? <span className="rm-pill">Fuel · {fuelType}</span> : null}
            {category ? <span className="rm-pill">Category · {category}</span> : null}
            <button type="button" className="btn btn-default btn-xs" onClick={clearFilters}>Reset</button>
            <em style={{ fontStyle: 'normal', marginLeft: 'auto' }}>{fmt(total)} matches</em>
          </div>
        ) : null}

        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>Fleet <span>{fmt(total)} vehicles</span></h2>
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
                ...(facets?.locations || []).map((o) => ({
                  value: o.id != null ? String(o.id) : o.value,
                  label: `${o.value} (${o.c})`,
                })),
              ]}
              onChange={(val) => {
                const hit = (facets?.locations || []).find((o) => String(o.id) === val || o.value === val)
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
                ...(facets?.models || []).map((o) => ({
                  value: o.id != null ? String(o.id) : o.value,
                  label: `${o.value} (${o.c})`,
                })),
              ]}
              onChange={(val) => {
                const hit = (facets?.models || []).find((o) => String(o.id) === val || o.value === val)
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
                ...(facets?.categories || []).map((o) => ({ value: o.value, label: `${o.value} (${o.c})` })),
              ]}
            />
            <AppSelect
              value={fuelType}
              onChange={setFuelType}
              searchable={false}
              placeholder="All fuel types"
              options={[
                { value: '', label: 'All fuel types' },
                ...(facets?.fuel_types || []).map((o) => ({ value: o.value, label: `${o.value} (${o.c})` })),
              ]}
            />
          </div>

          {error ? <div className="callout callout-danger" style={{ margin: 16 }}>{error}</div> : null}

          <div className="rm-fleet-head">
            <span />
            <span>Vehicle</span>
            <span>Location</span>
            <span>Status</span>
            <span>Assigned</span>
            <span>Photos</span>
            <span />
          </div>

          <div className="rm-fleet-list">
            {loading ? (
              <div className="rm-empty">Loading fleet…</div>
            ) : rows.length === 0 ? (
              <div className="rm-empty">No vehicles found</div>
            ) : rows.map((v) => (
              <Link key={v.id} to={`/vehicles/${v.id}`} className="rm-fleet-row">
                <div className="rm-fleet-thumb" aria-hidden>
                  <i className={v.fuel_type === 'EV' ? 'fas fa-bolt' : 'fas fa-car'} />
                </div>
                <div>
                  <div className="rm-fleet-plate">{v.vehicle_number}</div>
                  <div className="rm-fleet-sub">{v.model}{v.fuel_type ? ` · ${v.fuel_type}` : ''}</div>
                </div>
                <div className="rm-fleet-meta">
                  <i className="fas fa-map-marker-alt" style={{ opacity: 0.55, fontSize: 11 }} />
                  {v.location_name || '—'}
                </div>
                <div>
                  <span className={`rm-status ${statusClass(v.status)}`}>{v.status || '—'}</span>
                </div>
                <div className="rm-fleet-meta">{v.assigned_name || 'Unassigned'}</div>
                <div className="rm-fleet-meta">{v.captures_count ?? 0}</div>
                <div className="rm-fleet-open">Open →</div>
              </Link>
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
