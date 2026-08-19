import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { vehiclesApi, type Vehicle, type VehicleFacets } from '../../api/vehicles'

const PAGE_SIZE = 25

type Drill = 'none' | 'cities' | 'models' | 'fuel'

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
    <AppLayout title="Vehicles" subtitle="Refex Mobility fleet">
      <div className="veh-kpi-strip">
        <button
          type="button"
          className={`veh-kpi veh-kpi--blue${!hasActiveFilter && drill === 'none' ? ' is-active' : ''}`}
          onClick={clearFilters}
          title="Show all vehicles"
        >
          <div className="veh-kpi-inner">
            <strong>{fleetTotal ?? '—'}</strong>
            <em>Vehicles</em>
          </div>
          <span className="veh-kpi-bg-icon" aria-hidden><i className="fas fa-car" /></span>
        </button>

        <button
          type="button"
          className={`veh-kpi veh-kpi--green${drill === 'cities' || cityId || location ? ' is-active' : ''}`}
          onClick={() => toggleDrill('cities')}
          title="Filter by city"
        >
          <div className="veh-kpi-inner">
            <strong>{cityCount ?? '—'}</strong>
            <em>Cities</em>
          </div>
          <span className="veh-kpi-bg-icon" aria-hidden><i className="fas fa-map-marker-alt" /></span>
        </button>

        <button
          type="button"
          className={`veh-kpi veh-kpi--amber${drill === 'models' || modelId || model ? ' is-active' : ''}`}
          onClick={() => toggleDrill('models')}
          title="Filter by model"
        >
          <div className="veh-kpi-inner">
            <strong>{modelCount ?? '—'}</strong>
            <em>Models</em>
          </div>
          <span className="veh-kpi-bg-icon" aria-hidden><i className="fas fa-car-side" /></span>
        </button>

        <button
          type="button"
          className={`veh-kpi veh-kpi--rose${drill === 'fuel' || fuelType ? ' is-active' : ''}`}
          onClick={() => {
            if (drill !== 'fuel' && !fuelType) {
              setFuelType('EV')
              setDrill('fuel')
              return
            }
            toggleDrill('fuel')
          }}
          title="Filter by fuel type"
        >
          <div className="veh-kpi-inner">
            <strong>{evCount ?? '—'}</strong>
            <em>EV fleet</em>
          </div>
          <span className="veh-kpi-bg-icon" aria-hidden><i className="fas fa-bolt" /></span>
        </button>
      </div>

      {drill === 'cities' ? (
        <div className="veh-drill">
          <div className="veh-drill-head">
            <span>Cities</span>
            <button type="button" className="veh-drill-clear" onClick={() => { setCityId(''); setLocation('') }}>
              Clear city
            </button>
          </div>
          <div className="veh-chip-row">
            {(facets?.locations || []).map((o) => {
              const active = (o.id != null && String(o.id) === cityId) || (!cityId && o.value === location)
              return (
                <button
                  key={o.id ?? o.value}
                  type="button"
                  className={`veh-chip${active ? ' is-active' : ''}`}
                  onClick={() => selectCity(o.id, o.value)}
                >
                  {o.value}
                  <b>{o.c}</b>
                </button>
              )
            })}
            {!facets?.locations?.length ? <span className="veh-drill-empty">No cities yet</span> : null}
          </div>
        </div>
      ) : null}

      {drill === 'models' ? (
        <div className="veh-drill">
          <div className="veh-drill-head">
            <span>Models</span>
            <button type="button" className="veh-drill-clear" onClick={() => { setModelId(''); setModel('') }}>
              Clear model
            </button>
          </div>
          <div className="veh-chip-row">
            {(facets?.models || []).map((o) => {
              const active = (o.id != null && String(o.id) === modelId) || (!modelId && o.value === model)
              return (
                <button
                  key={o.id ?? o.value}
                  type="button"
                  className={`veh-chip veh-chip--amber${active ? ' is-active' : ''}`}
                  onClick={() => selectModel(o.id, o.value)}
                >
                  {o.value}
                  <b>{o.c}</b>
                </button>
              )
            })}
            {!facets?.models?.length ? <span className="veh-drill-empty">No models yet</span> : null}
          </div>
        </div>
      ) : null}

      {drill === 'fuel' ? (
        <div className="veh-drill">
          <div className="veh-drill-head">
            <span>Fuel / category</span>
            <button type="button" className="veh-drill-clear" onClick={() => { setFuelType(''); setCategory('') }}>
              Clear fuel
            </button>
          </div>
          <div className="veh-chip-row">
            {(facets?.fuel_types || []).map((o) => (
              <button
                key={o.value}
                type="button"
                className={`veh-chip veh-chip--rose${fuelType === o.value ? ' is-active' : ''}`}
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
                className={`veh-chip veh-chip--slate${category === o.value ? ' is-active' : ''}`}
                onClick={() => setCategory((prev) => (prev === o.value ? '' : o.value))}
              >
                {o.value}
                <b>{o.c}</b>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasActiveFilter ? (
        <div className="veh-active-filters">
          <span>Filtered:</span>
          {activeCityLabel ? <span className="veh-pill">City: {activeCityLabel}</span> : null}
          {activeModelLabel ? <span className="veh-pill">Model: {activeModelLabel}</span> : null}
          {fuelType ? <span className="veh-pill">Fuel: {fuelType}</span> : null}
          {category ? <span className="veh-pill">Category: {category}</span> : null}
          <button type="button" className="veh-drill-clear" onClick={clearFilters}>Reset</button>
          <em className="veh-match-count">{total} match{total === 1 ? '' : 'es'}</em>
        </div>
      ) : null}

      <Box
        title="Fleet list"
        tools={<Link className="btn btn-primary btn-sm" to="/vehicles/create"><i className="fas fa-plus" /> Add vehicle</Link>}
      >
        <div className="vehicle-filters">
          <input
            className="form-control"
            placeholder="Search plate, model, city…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select className="form-control" value={cityId || location} onChange={(e) => {
            const val = e.target.value
            const hit = (facets?.locations || []).find((o) => String(o.id) === val || o.value === val)
            if (hit?.id != null) {
              setCityId(String(hit.id))
              setLocation('')
            } else {
              setCityId('')
              setLocation(val)
            }
          }}>
            <option value="">All cities</option>
            {(facets?.locations || []).map((o) => (
              <option key={o.id ?? o.value} value={o.id != null ? String(o.id) : o.value}>{o.value} ({o.c})</option>
            ))}
          </select>
          <select className="form-control" value={modelId || model} onChange={(e) => {
            const val = e.target.value
            const hit = (facets?.models || []).find((o) => String(o.id) === val || o.value === val)
            if (hit?.id != null) {
              setModelId(String(hit.id))
              setModel('')
            } else {
              setModelId('')
              setModel(val)
            }
          }}>
            <option value="">All models</option>
            {(facets?.models || []).map((o) => (
              <option key={o.id ?? o.value} value={o.id != null ? String(o.id) : o.value}>{o.value} ({o.c})</option>
            ))}
          </select>
          <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(facets?.categories || []).map((o) => (
              <option key={o.value} value={o.value}>{o.value} ({o.c})</option>
            ))}
          </select>
          <select className="form-control" value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
            <option value="">All fuel types</option>
            {(facets?.fuel_types || []).map((o) => (
              <option key={o.value} value={o.value}>{o.value} ({o.c})</option>
            ))}
          </select>
        </div>

        {error ? <div className="callout callout-danger">{error}</div> : null}

        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead>
              <tr>
                <th>Vehicle number</th>
                <th>Model</th>
                <th>Location</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Photos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}>No vehicles found</td></tr>
              ) : rows.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/vehicles/${v.id}`}><strong>{v.vehicle_number}</strong></Link></td>
                  <td>{v.model}</td>
                  <td>{v.location_name}</td>
                  <td><span className="label label-default">{v.status}</span></td>
                  <td>{v.assigned_name || '—'}</td>
                  <td>{v.captures_count}</td>
                  <td className="text-right">
                    <Link className="btn btn-sm btn-primary" to={`/vehicles/${v.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="vehicle-pager">
          <button type="button" className="btn btn-default btn-sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>Page {page + 1} / {pageCount}</span>
          <button type="button" className="btn btn-default btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </Box>
    </AppLayout>
  )
}
