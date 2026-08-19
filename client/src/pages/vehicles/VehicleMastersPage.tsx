import { useEffect, useState, type FormEvent } from 'react'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  vehicleMastersApi,
  type VehicleCity,
  type VehicleModelMaster,
} from '../../api/vehicleMasters'

type Tab = 'cities' | 'models'

export default function VehicleMastersPage() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('cities')
  const [cities, setCities] = useState<VehicleCity[]>([])
  const [models, setModels] = useState<VehicleModelMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [cityForm, setCityForm] = useState({ id: '', name: '', code: '', state: '', notes: '' })
  const [modelForm, setModelForm] = useState({
    id: '', name: '', make: '', default_fuel_type: 'EV', default_category: 'EV Vehicles', notes: '',
  })

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
      setCityForm({ id: '', name: '', code: '', state: '', notes: '' })
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
      setModelForm({ id: '', name: '', make: '', default_fuel_type: 'EV', default_category: 'EV Vehicles', notes: '' })
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppLayout title="Masters" subtitle="Cities and vehicle models">
      <ul className="nav nav-tabs vehicle-tabs">
        <li className={tab === 'cities' ? 'active' : ''}>
          <button type="button" onClick={() => setTab('cities')}>Cities</button>
        </li>
        <li className={tab === 'models' ? 'active' : ''}>
          <button type="button" onClick={() => setTab('models')}>Models</button>
        </li>
      </ul>

      {tab === 'cities' ? (
        <div className="row">
          <div className="col-md-4">
            <Box title={cityForm.id ? 'Edit city' : 'Add city'}>
              <form onSubmit={saveCity} className="vehicle-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Name *
                  <input className="form-control" required value={cityForm.name} onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })} />
                </label>
                <label>Code
                  <input className="form-control" value={cityForm.code} onChange={(e) => setCityForm({ ...cityForm, code: e.target.value })} placeholder="BLR, CHN…" />
                </label>
                <label>State
                  <input className="form-control" value={cityForm.state} onChange={(e) => setCityForm({ ...cityForm, state: e.target.value })} />
                </label>
                <label>Notes
                  <textarea className="form-control" rows={2} value={cityForm.notes} onChange={(e) => setCityForm({ ...cityForm, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy}>{cityForm.id ? 'Update' : 'Add city'}</button>
                  {cityForm.id ? (
                    <button type="button" className="btn btn-default" onClick={() => setCityForm({ id: '', name: '', code: '', state: '', notes: '' })}>Cancel</button>
                  ) : null}
                </div>
              </form>
            </Box>
          </div>
          <div className="col-md-8">
            <Box title="Cities">
              {loading ? <p>Loading…</p> : (
                <table className="table table-striped">
                  <thead><tr><th>Name</th><th>Code</th><th>State</th><th>Vehicles</th><th /></tr></thead>
                  <tbody>
                    {cities.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.code || '—'}</td>
                        <td>{c.state || '—'}</td>
                        <td>{c.vehicles_count ?? 0}</td>
                        <td className="text-right">
                          <button type="button" className="btn btn-xs btn-default" onClick={() => setCityForm({
                            id: String(c.id),
                            name: c.name,
                            code: c.code || '',
                            state: c.state || '',
                            notes: c.notes || '',
                          })}>Edit</button>{' '}
                          <button type="button" className="btn btn-xs btn-danger" onClick={async () => {
                            if (!window.confirm(`Delete city ${c.name}?`)) return
                            try {
                              await vehicleMastersApi.deleteCity(c.id)
                              toast.success('Deleted')
                              await reload()
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Delete failed')
                            }
                          }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Box>
          </div>
        </div>
      ) : (
        <div className="row">
          <div className="col-md-4">
            <Box title={modelForm.id ? 'Edit model' : 'Add model'}>
              <form onSubmit={saveModel} className="vehicle-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Name *
                  <input className="form-control" required value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} />
                </label>
                <label>Make / OEM
                  <input className="form-control" value={modelForm.make} onChange={(e) => setModelForm({ ...modelForm, make: e.target.value })} placeholder="Tata, Citroën, MG…" />
                </label>
                <label>Default fuel
                  <select className="form-control" value={modelForm.default_fuel_type} onChange={(e) => setModelForm({ ...modelForm, default_fuel_type: e.target.value })}>
                    <option value="EV">EV</option>
                    <option value="CNG_PETROL">CNG / Petrol</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label>Default category
                  <select className="form-control" value={modelForm.default_category} onChange={(e) => setModelForm({ ...modelForm, default_category: e.target.value })}>
                    <option value="EV Vehicles">EV Vehicles</option>
                    <option value="CNG/ Petrol vehicles">CNG/ Petrol vehicles</option>
                  </select>
                </label>
                <label>Notes
                  <textarea className="form-control" rows={2} value={modelForm.notes} onChange={(e) => setModelForm({ ...modelForm, notes: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy}>{modelForm.id ? 'Update' : 'Add model'}</button>
                  {modelForm.id ? (
                    <button type="button" className="btn btn-default" onClick={() => setModelForm({
                      id: '', name: '', make: '', default_fuel_type: 'EV', default_category: 'EV Vehicles', notes: '',
                    })}>Cancel</button>
                  ) : null}
                </div>
              </form>
            </Box>
          </div>
          <div className="col-md-8">
            <Box title="Models">
              {loading ? <p>Loading…</p> : (
                <table className="table table-striped">
                  <thead><tr><th>Name</th><th>Make</th><th>Fuel</th><th>Vehicles</th><th /></tr></thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong></td>
                        <td>{m.make || '—'}</td>
                        <td>{m.default_fuel_type || '—'}</td>
                        <td>{m.vehicles_count ?? 0}</td>
                        <td className="text-right">
                          <button type="button" className="btn btn-xs btn-default" onClick={() => setModelForm({
                            id: String(m.id),
                            name: m.name,
                            make: m.make || '',
                            default_fuel_type: m.default_fuel_type || 'EV',
                            default_category: m.default_category || 'EV Vehicles',
                            notes: m.notes || '',
                          })}>Edit</button>{' '}
                          <button type="button" className="btn btn-xs btn-danger" onClick={async () => {
                            if (!window.confirm(`Delete model ${m.name}?`)) return
                            try {
                              await vehicleMastersApi.deleteModel(m.id)
                              toast.success('Deleted')
                              await reload()
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Delete failed')
                            }
                          }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Box>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
