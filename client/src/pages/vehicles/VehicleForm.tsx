import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { vehiclesApi, type Vehicle } from '../../api/vehicles'
import { vehicleMastersApi } from '../../api/vehicleMasters'

const CATEGORIES = ['EV Vehicles', 'CNG/ Petrol vehicles']
const STATUSES = ['available', 'assigned', 'maintenance', 'retired', 'inactive']

type Opt = {
  id: number
  name: string
  default_fuel_type?: string
  default_category?: string | null
}

export default function VehicleForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cities, setCities] = useState<Opt[]>([])
  const [models, setModels] = useState<Opt[]>([])
  const [form, setForm] = useState({
    vehicle_number: '',
    name: '',
    model_id: '',
    city_id: '',
    category: 'EV Vehicles',
    fuel_type: 'EV',
    status: 'available',
    notes: '',
    purchase_date: '',
    purchase_cost: '',
    order_number: '',
    supplier_name: '',
    warranty_months: '',
    vehicle_eol_date: '',
  })

  useEffect(() => {
    Promise.all([
      vehicleMastersApi.citySelect(),
      vehicleMastersApi.modelSelect(),
    ]).then(([c, m]) => {
      setCities((c.rows || []).map((r) => ({ id: r.id, name: r.name || r.text })))
      setModels((m.rows || []).map((r) => ({
        id: r.id,
        name: r.name || r.text,
        default_fuel_type: r.default_fuel_type,
        default_category: r.default_category,
      })))
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load masters'))
      .finally(() => {
        if (!isEdit) setLoading(false)
      })
  }, [isEdit, toast])

  useEffect(() => {
    if (!id) return
    vehiclesApi.get(id).then((v: Vehicle) => {
      setForm({
        vehicle_number: v.vehicle_number || '',
        name: v.name || '',
        model_id: v.model_id != null ? String(v.model_id) : '',
        city_id: v.city_id != null ? String(v.city_id) : '',
        category: v.category || 'EV Vehicles',
        fuel_type: v.fuel_type || 'EV',
        status: v.status === 'active' ? 'available' : (v.status || 'available'),
        notes: v.notes || '',
        purchase_date: (v.purchase_date || '').toString().slice(0, 10),
        purchase_cost: v.purchase_cost != null ? String(v.purchase_cost) : '',
        order_number: v.order_number || '',
        supplier_name: v.supplier_name || '',
        warranty_months: v.warranty_months != null ? String(v.warranty_months) : '',
        vehicle_eol_date: (v.vehicle_eol_date || '').toString().slice(0, 10),
      })
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [id, toast])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'model_id') {
        const m = models.find((x) => String(x.id) === value)
        if (m?.default_fuel_type) next.fuel_type = m.default_fuel_type
        if (m?.default_category) next.category = m.default_category
      }
      if (key === 'category') {
        next.fuel_type = value.toLowerCase().includes('cng') || value.toLowerCase().includes('petrol')
          ? 'CNG_PETROL'
          : next.fuel_type || 'EV'
      }
      return next
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.city_id || !form.model_id) {
      toast.error('Select a city and model from masters')
      return
    }
    setSaving(true)
    try {
      const body = {
        vehicle_number: form.vehicle_number.trim().toUpperCase(),
        name: form.name.trim() || null,
        city_id: Number(form.city_id),
        model_id: Number(form.model_id),
        category: form.category,
        fuel_type: form.fuel_type,
        status: form.status,
        notes: form.notes.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
        order_number: form.order_number.trim() || null,
        supplier_name: form.supplier_name.trim() || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        vehicle_eol_date: form.vehicle_eol_date || null,
      }
      if (isEdit && id) {
        const res = await vehiclesApi.update(id, body)
        toast.success('Vehicle updated')
        navigate(`/vehicles/${(res as { payload?: Vehicle }).payload?.id || id}`)
      } else {
        const res = await vehiclesApi.create(body)
        toast.success('Vehicle created')
        navigate(`/vehicles/${(res as { payload?: Vehicle }).payload?.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <AppLayout title="Vehicle"><p>Loading…</p></AppLayout>
  }

  return (
    <AppLayout title={isEdit ? 'Edit vehicle' : 'Add vehicle'} subtitle="Refex Mobility fleet">
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to={isEdit && id ? `/vehicles/${id}` : '/vehicles'} className="btn btn-default btn-sm">
          <i className="fas fa-arrow-left" /> Back
        </Link>
        <Link to="/masters" className="btn btn-default btn-sm">
          Manage cities / models
        </Link>
      </div>
      <Box title="Vehicle details">
        <form onSubmit={onSubmit} className="vehicle-form-grid">
          <label>Vehicle number / plate *
            <input className="form-control" required value={form.vehicle_number} onChange={(e) => set('vehicle_number', e.target.value)} />
          </label>
          <label>Display name
            <input className="form-control" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label>Model * <span className="text-muted">(from masters)</span>
            <select className="form-control" required value={form.model_id} onChange={(e) => set('model_id', e.target.value)}>
              <option value="">Select model…</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label>City * <span className="text-muted">(from masters)</span>
            <select className="form-control" required value={form.city_id} onChange={(e) => set('city_id', e.target.value)}>
              <option value="">Select city…</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Category *
            <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Fuel type
            <select className="form-control" value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
              <option value="EV">EV</option>
              <option value="CNG_PETROL">CNG / Petrol</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Status
            <select className="form-control" value={form.status} onChange={(e) => set('status', e.target.value)} disabled={form.status === 'assigned'}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Purchase date
            <input type="date" className="form-control" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </label>
          <label>Purchase cost (INR)
            <input type="number" step="0.01" className="form-control" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} />
          </label>
          <label>PO / order number
            <input className="form-control" value={form.order_number} onChange={(e) => set('order_number', e.target.value)} />
          </label>
          <label>Supplier
            <input className="form-control" value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} />
          </label>
          <label>Warranty (months)
            <input type="number" className="form-control" value={form.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} />
          </label>
          <label>EOL date
            <input type="date" className="form-control" value={form.vehicle_eol_date} onChange={(e) => set('vehicle_eol_date', e.target.value)} />
          </label>
          <label className="vehicle-form-span">Notes
            <textarea className="form-control" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          <div className="vehicle-form-span" style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create vehicle')}
            </button>
            <Link to={isEdit && id ? `/vehicles/${id}` : '/vehicles'} className="btn btn-default">Cancel</Link>
          </div>
        </form>
      </Box>
    </AppLayout>
  )
}
