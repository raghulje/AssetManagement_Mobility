import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import AppLayout from '../../layout/AppLayout'
import { useToast } from '../../components/Toast'
import {
  vehicleMastersApi,
  type VehicleCity,
  type VehicleModelMaster,
} from '../../api/vehicleMasters'
import { AppSelect } from '../../components/formControls'

type Tab = 'cities' | 'models'

const emptyCity = { id: '', name: '', code: '', state: '', notes: '' }
const emptyModel = {
  id: '', name: '', make: '', default_fuel_type: 'EV', default_category: 'EV Vehicles', notes: '',
}

export default function VehicleMastersPage() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('cities')
  const [cities, setCities] = useState<VehicleCity[]>([])
  const [models, setModels] = useState<VehicleModelMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const [cityForm, setCityForm] = useState(emptyCity)
  const [modelForm, setModelForm] = useState(emptyModel)

  async function reload() {
    setLoading(true)
    try {
      const [c, m] = await Promise.all([
        vehicleMastersApi.cities(),
        vehicleMastersApi.models(),
      ])
      setCities(c.rows || [])
      setModels(m.rows || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load masters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  function openAddCity() {
    setCityForm(emptyCity)
    setModalOpen(true)
  }

  function openEditCity(c: VehicleCity) {
    setCityForm({
      id: String(c.id),
      name: c.name,
      code: c.code || '',
      state: c.state || '',
      notes: c.notes || '',
    })
    setModalOpen(true)
  }

  function openAddModel() {
    setModelForm(emptyModel)
    setModalOpen(true)
  }

  function openEditModel(m: VehicleModelMaster) {
    setModelForm({
      id: String(m.id),
      name: m.name,
      make: m.make || '',
      default_fuel_type: m.default_fuel_type || 'EV',
      default_category: m.default_category || 'EV Vehicles',
      notes: m.notes || '',
    })
    setModalOpen(true)
  }

  async function saveCity(e: FormEvent) {
    e.preventDefault()
    if (!cityForm.name.trim()) return toast.error('City name required')
    setBusy(true)
    try {
      if (cityForm.id) {
        await vehicleMastersApi.updateCity(cityForm.id, cityForm)
        toast.success('City updated')
      } else {
        await vehicleMastersApi.createCity(cityForm)
        toast.success('City added')
      }
      setCityForm(emptyCity)
      setModalOpen(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveModel(e: FormEvent) {
    e.preventDefault()
    if (!modelForm.name.trim()) return toast.error('Model name required')
    setBusy(true)
    try {
      if (modelForm.id) {
        await vehicleMastersApi.updateModel(modelForm.id, modelForm)
        toast.success('Model updated')
      } else {
        await vehicleMastersApi.createModel(modelForm)
        toast.success('Model added')
      }
      setModelForm(emptyModel)
      setModalOpen(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppLayout title="Masters" subtitle="Fleet configuration · cities and vehicle models">
      <div className="rm-page">
        <div className="rm-kpi-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxWidth: 520 }}>
          <button
            type="button"
            className={`rm-kpi${tab === 'cities' ? ' is-active' : ''}`}
            onClick={() => { setTab('cities'); setModalOpen(false) }}
          >
            <span className="rm-kpi__label">Cities</span>
            <span className="rm-kpi__value">{cities.length}</span>
            <span className="rm-kpi__hint">Operating locations</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-map-marker-alt" /></span>
          </button>
          <button
            type="button"
            className={`rm-kpi rm-kpi--slate${tab === 'models' ? ' is-active' : ''}`}
            onClick={() => { setTab('models'); setModalOpen(false) }}
          >
            <span className="rm-kpi__label">Models</span>
            <span className="rm-kpi__value">{models.length}</span>
            <span className="rm-kpi__hint">Vehicle platforms</span>
            <span className="rm-kpi__icon" aria-hidden><i className="fas fa-car-side" /></span>
          </button>
        </div>

        <div className="rm-master-tabs">
          <button type="button" className={tab === 'cities' ? 'is-active' : ''} onClick={() => setTab('cities')}>Cities</button>
          <button type="button" className={tab === 'models' ? 'is-active' : ''} onClick={() => setTab('models')}>Models</button>
        </div>

        <div className="rm-panel">
          <div className="rm-panel__bar">
            <h2>{tab === 'cities' ? 'Cities' : 'Models'}</h2>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => (tab === 'cities' ? openAddCity() : openAddModel())}
            >
              <i className="fas fa-plus" /> {tab === 'cities' ? 'Add city' : 'Add model'}
            </button>
          </div>

          {loading ? (
            <div className="rm-empty">Loading…</div>
          ) : tab === 'cities' ? (
            <>
            <div className="table-responsive data-table-desktop">
              <table className="table table-hover" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Code</th>
                    <th>State</th>
                    <th>Vehicles</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.code || '—'}</td>
                      <td>{c.state || '—'}</td>
                      <td>{c.vehicles_count ?? 0}</td>
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-xs btn-default" onClick={() => openEditCity(c)}>Edit</button>{' '}
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={async () => {
                            if (!window.confirm(`Delete city ${c.name}?`)) return
                            try {
                              await vehicleMastersApi.deleteCity(c.id)
                              toast.success('Deleted')
                              await reload()
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Delete failed')
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!cities.length ? <tr><td colSpan={5}>No cities yet</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="data-table-mobile" aria-label="Cities">
              {!cities.length ? <p className="text-muted data-card-empty">No cities yet</p> : null}
              {cities.map((c) => (
                <article key={c.id} className="data-card">
                  <div className="data-card-title">{c.name}</div>
                  <dl className="data-card-fields">
                    <div className="data-card-field"><dt>Code</dt><dd>{c.code || '—'}</dd></div>
                    <div className="data-card-field"><dt>State</dt><dd>{c.state || '—'}</dd></div>
                    <div className="data-card-field"><dt>Vehicles</dt><dd>{c.vehicles_count ?? 0}</dd></div>
                  </dl>
                  <div className="data-card-actions">
                    <button type="button" className="btn btn-sm btn-default" onClick={() => openEditCity(c)}>Edit</button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Delete city ${c.name}?`)) return
                        try {
                          await vehicleMastersApi.deleteCity(c.id)
                          toast.success('Deleted')
                          await reload()
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Delete failed')
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          ) : (
            <>
            <div className="table-responsive data-table-desktop">
              <table className="table table-hover" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th />
                    <th>Model</th>
                    <th>Make</th>
                    <th>Fuel</th>
                    <th>Fleet</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id}>
                      <td style={{ width: 48 }}>
                        <div className="rm-fleet-thumb" style={{ width: 36, height: 36, fontSize: 14 }}>
                          <i className={m.default_fuel_type === 'EV' ? 'fas fa-bolt' : 'fas fa-car'} />
                        </div>
                      </td>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.make || '—'}</td>
                      <td>
                        <span className={`rm-status ${m.default_fuel_type === 'EV' ? 'rm-status--active' : ''}`}>
                          {m.default_fuel_type || '—'}
                        </span>
                      </td>
                      <td>{m.vehicles_count ?? 0}</td>
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-xs btn-default" onClick={() => openEditModel(m)}>Edit</button>{' '}
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={async () => {
                            if (!window.confirm(`Delete model ${m.name}?`)) return
                            try {
                              await vehicleMastersApi.deleteModel(m.id)
                              toast.success('Deleted')
                              await reload()
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Delete failed')
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!models.length ? <tr><td colSpan={6}>No models yet</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="data-table-mobile" aria-label="Models">
              {!models.length ? <p className="text-muted data-card-empty">No models yet</p> : null}
              {models.map((m) => (
                <article key={m.id} className="data-card">
                  <div className="data-card-top">
                    <div className="rm-fleet-thumb" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>
                      <i className={m.default_fuel_type === 'EV' ? 'fas fa-bolt' : 'fas fa-car'} />
                    </div>
                    <div className="data-card-title">{m.name}</div>
                  </div>
                  <dl className="data-card-fields">
                    <div className="data-card-field"><dt>Make</dt><dd>{m.make || '—'}</dd></div>
                    <div className="data-card-field">
                      <dt>Fuel</dt>
                      <dd>
                        <span className={`rm-status ${m.default_fuel_type === 'EV' ? 'rm-status--active' : ''}`}>
                          {m.default_fuel_type || '—'}
                        </span>
                      </dd>
                    </div>
                    <div className="data-card-field"><dt>Fleet</dt><dd>{m.vehicles_count ?? 0}</dd></div>
                  </dl>
                  <div className="data-card-actions">
                    <button type="button" className="btn btn-sm btn-default" onClick={() => openEditModel(m)}>Edit</button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Delete model ${m.name}?`)) return
                        try {
                          await vehicleMastersApi.deleteModel(m.id)
                          toast.success('Deleted')
                          await reload()
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Delete failed')
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
        </div>
      </div>

      {modalOpen ? createPortal(
        <div className="rm-modal-overlay" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="rm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal__head">
              <h3>
                {tab === 'cities'
                  ? (cityForm.id ? 'Edit city' : 'Add city')
                  : (modelForm.id ? 'Edit model' : 'Add model')}
              </h3>
              <button type="button" className="rm-modal__close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
            </div>

            {tab === 'cities' ? (
              <form onSubmit={saveCity} className="vehicle-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>City name *
                  <input className="form-control" required value={cityForm.name} onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })} />
                </label>
                <label>Code
                  <input className="form-control" value={cityForm.code} onChange={(e) => setCityForm({ ...cityForm, code: e.target.value })} placeholder="BLR, CHN…" />
                </label>
                <label>State
                  <input className="form-control" value={cityForm.state} onChange={(e) => setCityForm({ ...cityForm, state: e.target.value })} />
                </label>
                <label>Notes
                  <textarea className="form-control" rows={3} value={cityForm.notes} onChange={(e) => setCityForm({ ...cityForm, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-default" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy}>{cityForm.id ? 'Save city' : 'Create city'}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveModel} className="vehicle-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Model name *
                  <input className="form-control" required value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} />
                </label>
                <label>Make / OEM
                  <input className="form-control" value={modelForm.make} onChange={(e) => setModelForm({ ...modelForm, make: e.target.value })} placeholder="Tata, Citroën, MG…" />
                </label>
                <label>Default fuel
                  <AppSelect
                    value={modelForm.default_fuel_type}
                    onChange={(v) => setModelForm({ ...modelForm, default_fuel_type: v })}
                    searchable={false}
                    options={[
                      { value: 'EV', label: 'EV' },
                      { value: 'CNG_PETROL', label: 'CNG / Petrol' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                  />
                </label>
                <label>Default category
                  <AppSelect
                    value={modelForm.default_category}
                    onChange={(v) => setModelForm({ ...modelForm, default_category: v })}
                    searchable={false}
                    options={[
                      { value: 'EV Vehicles', label: 'EV Vehicles' },
                      { value: 'CNG/ Petrol vehicles', label: 'CNG/ Petrol vehicles' },
                    ]}
                  />
                </label>
                <label>Notes
                  <textarea className="form-control" rows={3} value={modelForm.notes} onChange={(e) => setModelForm({ ...modelForm, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-default" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy}>{modelForm.id ? 'Save model' : 'Create model'}</button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </AppLayout>
  )
}
