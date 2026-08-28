import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import AppLayout from '../../layout/AppLayout'
import { useToast } from '../../components/Toast'
import { CompanyEntityFields } from '../../components/CompanyEntityFields'
import { AppSelect, DateField } from '../../components/formControls'
import { mastersApi, type SelectOption } from '../../api/client'
import { vehiclesApi, type Vehicle } from '../../api/vehicles'
import { vehicleMastersApi } from '../../api/vehicleMasters'

const CATEGORIES = ['EV Vehicles', 'CNG/ Petrol vehicles']
const STATUSES = [
  'available', 'assigned', 'maintenance', 'retired', 'inactive',
  'draft', 'received', 'under_inspection', 'in_use', 'charging', 'accident', 'disposed',
]
const VEHICLE_TYPES = [
  'Passenger Car', 'SUV', 'Sedan', 'Hatchback', 'Commercial Vehicle',
  'Van', 'Truck', 'Two Wheeler', 'Three Wheeler', 'Other',
]
const CHARGING_OPTIONS = ['AC', 'DC', 'Fast Charging', 'Slow Charging', 'Portable Charging']
const CONNECTORS = ['CCS2', 'Type 2', 'CHAdeMO', 'GB/T', 'Other']
const PROCUREMENT = ['Purchased', 'Leased', 'Rented', 'Subscription', 'Company Owned', 'Employee Owned']
const POLICY_TYPES = ['Comprehensive', 'Third Party', 'Own Damage', 'Commercial', 'Other']
const ASSIGNMENT_KINDS = ['Employee', 'Driver', 'Fleet', 'Pool', 'Department', 'Location', 'Business Unit', 'Temporary Assignment']

type FormTab =
  | 'basic'
  | 'identity'
  | 'ev'
  | 'legal'
  | 'ownership'
  | 'location'
  | 'purchase'
  | 'financial'
  | 'insurance'
  | 'warranty'

type Opt = {
  id: number
  name: string
  make?: string | null
  default_fuel_type?: string
  default_category?: string | null
}

function d(v: string | number | null | undefined) {
  if (v == null) return ''
  return String(v).slice(0, 10)
}

function emptyForm() {
  return {
    vehicle_number: '',
    fleet_id: '',
    name: '',
    model_id: '',
    city_id: '',
    category: 'EV Vehicles',
    vehicle_type: 'Passenger Car',
    vehicle_sub_type: '',
    make: '',
    variant: '',
    model_year: '',
    color: '',
    seats: '',
    description: '',
    fuel_type: 'EV',
    status: 'available',
    notes: '',
    vin: '',
    chassis_number: '',
    engine_number: '',
    motor_number: '',
    battery_serial_number: '',
    vehicle_id_number: '',
    key_id: '',
    rfid_tag: '',
    barcode: '',
    registration_date: '',
    registration_state: '',
    registration_rto: '',
    registration_expiry: '',
    vehicle_class: '',
    puc_number: '',
    puc_issue_date: '',
    puc_expiry_date: '',
    fitness_number: '',
    fitness_expiry_date: '',
    permit_number: '',
    permit_expiry_date: '',
    powertrain_type: 'Electric',
    battery_type: '',
    battery_capacity: '',
    battery_unit: 'kWh',
    usable_battery_capacity: '',
    charging_types: '' as string,
    ac_charging_capacity: '',
    dc_fast_charging_capacity: '',
    charging_connector_type: 'CCS2',
    charging_port_count: '',
    range_value: '',
    range_unit: 'km',
    battery_warranty_start: '',
    battery_warranty_end: '',
    battery_warranty_km: '',
    battery_health_pct: '',
    battery_cycle_count: '',
    state_of_charge_pct: '',
    last_charging_at: '',
    last_charging_location: '',
    charging_station_id: '',
    telematics_device_id: '',
    company_id: '',
    legal_entity_id: '',
    business_unit: '',
    team_name: '',
    cost_center: '',
    sub_location: '',
    fleet_name: '',
    vehicle_pool: '',
    assignment_kind: '',
    driver_name: '',
    driver_phone: '',
    assignment_status: '',
    assignment_location: '',
    location_type: '',
    latitude: '',
    longitude: '',
    address: '',
    parking_location: '',
    geofence_name: '',
    purchase_date: '',
    purchase_cost: '',
    order_number: '',
    supplier_name: '',
    procurement_type: 'Purchased',
    invoice_number: '',
    invoice_date: '',
    vendor_name: '',
    dealer_name: '',
    tax_amount: '',
    total_cost: '',
    currency: 'INR',
    funding_type: '',
    financing_company: '',
    loan_number: '',
    loan_start_date: '',
    loan_end_date: '',
    asset_cost: '',
    capitalized_cost: '',
    current_book_value: '',
    depreciation_method: '',
    depreciation_rate: '',
    depreciation_start_date: '',
    useful_life_months: '',
    residual_value: '',
    gl_account: '',
    profit_center: '',
    asset_class: '',
    insurance_provider: '',
    insurance_policy_number: '',
    insurance_policy_type: 'Comprehensive',
    insurance_start_date: '',
    insurance_expiry_date: '',
    insurance_idv: '',
    insurance_premium: '',
    insured_name: '',
    insurance_status: '',
    insurance_renewal_reminder: '',
    warranty_months: '',
    warranty_provider: '',
    warranty_start_date: '',
    warranty_end_date: '',
    warranty_km: '',
    current_odometer_km: '',
    warranty_status: '',
    has_battery_warranty: false,
    has_motor_warranty: false,
    motor_warranty_end: '',
    vehicle_eol_date: '',
  }
}

function numOrNull(v: string) {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function Field({
  label, children, required, hint, wide, full,
}: { label: string; children: ReactNode; required?: boolean; hint?: string; wide?: boolean; full?: boolean }) {
  const cls = ['rm-field', wide ? 'rm-field--wide' : '', full ? 'rm-field--full' : ''].filter(Boolean).join(' ')
  return (
    <label className={cls}>
      <span>{label}{required ? ' *' : ''}</span>
      {children}
      {hint ? <em className="rm-field-hint">{hint}</em> : null}
    </label>
  )
}

export default function VehicleForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<FormTab>('basic')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cities, setCities] = useState<Opt[]>([])
  const [models, setModels] = useState<Opt[]>([])
  const [companies, setCompanies] = useState<SelectOption[]>([])
  const [assetId, setAssetId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    Promise.all([
      vehicleMastersApi.citySelect(),
      vehicleMastersApi.modelSelect(),
      mastersApi.companies().catch(() => ({ results: [] as SelectOption[] })),
    ]).then(([c, m, co]) => {
      setCities((c.rows || []).map((r) => ({ id: r.id, name: r.name || r.text })))
      setModels((m.rows || []).map((r) => ({
        id: r.id,
        name: r.name || r.text,
        make: (r as { make?: string }).make,
        default_fuel_type: r.default_fuel_type,
        default_category: r.default_category,
      })))
      setCompanies(co.results || [])
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load masters'))
      .finally(() => { if (!isEdit) setLoading(false) })
  }, [isEdit, toast])

  useEffect(() => {
    if (!id) return
    vehiclesApi.get(id).then((v: Vehicle) => {
      setAssetId(v.id)
      const charging = v.charging_types || (v.charging_types_list || []).join(',')
      setForm({
        ...emptyForm(),
        vehicle_number: v.vehicle_number || '',
        fleet_id: v.fleet_id || '',
        name: v.name || '',
        model_id: v.model_id != null ? String(v.model_id) : '',
        city_id: v.city_id != null ? String(v.city_id) : '',
        category: v.category || 'EV Vehicles',
        vehicle_type: v.vehicle_type || 'Passenger Car',
        vehicle_sub_type: v.vehicle_sub_type || '',
        make: v.make || '',
        variant: v.variant || '',
        model_year: v.model_year != null ? String(v.model_year) : '',
        color: v.color || '',
        seats: v.seats != null ? String(v.seats) : '',
        description: v.description || '',
        fuel_type: v.fuel_type || 'EV',
        status: v.status === 'active' ? 'available' : (v.status || 'available'),
        notes: v.notes || '',
        vin: v.vin || '',
        chassis_number: v.chassis_number || '',
        engine_number: v.engine_number || '',
        motor_number: v.motor_number || '',
        battery_serial_number: v.battery_serial_number || '',
        vehicle_id_number: v.vehicle_id_number || '',
        key_id: v.key_id || '',
        rfid_tag: v.rfid_tag || '',
        barcode: v.barcode || '',
        registration_date: d(v.registration_date),
        registration_state: v.registration_state || '',
        registration_rto: v.registration_rto || '',
        registration_expiry: d(v.registration_expiry),
        vehicle_class: v.vehicle_class || '',
        puc_number: v.puc_number || '',
        puc_issue_date: d(v.puc_issue_date),
        puc_expiry_date: d(v.puc_expiry_date),
        fitness_number: v.fitness_number || '',
        fitness_expiry_date: d(v.fitness_expiry_date),
        permit_number: v.permit_number || '',
        permit_expiry_date: d(v.permit_expiry_date),
        powertrain_type: v.powertrain_type || (v.fuel_type === 'EV' ? 'Electric' : ''),
        battery_type: v.battery_type || '',
        battery_capacity: v.battery_capacity != null ? String(v.battery_capacity) : '',
        battery_unit: v.battery_unit || 'kWh',
        usable_battery_capacity: v.usable_battery_capacity != null ? String(v.usable_battery_capacity) : '',
        charging_types: charging,
        ac_charging_capacity: v.ac_charging_capacity != null ? String(v.ac_charging_capacity) : '',
        dc_fast_charging_capacity: v.dc_fast_charging_capacity != null ? String(v.dc_fast_charging_capacity) : '',
        charging_connector_type: v.charging_connector_type || 'CCS2',
        charging_port_count: v.charging_port_count != null ? String(v.charging_port_count) : '',
        range_value: v.range_value != null ? String(v.range_value) : '',
        range_unit: v.range_unit || 'km',
        battery_warranty_start: d(v.battery_warranty_start),
        battery_warranty_end: d(v.battery_warranty_end),
        battery_warranty_km: v.battery_warranty_km != null ? String(v.battery_warranty_km) : '',
        battery_health_pct: v.battery_health_pct != null ? String(v.battery_health_pct) : '',
        battery_cycle_count: v.battery_cycle_count != null ? String(v.battery_cycle_count) : '',
        state_of_charge_pct: v.state_of_charge_pct != null ? String(v.state_of_charge_pct) : '',
        last_charging_at: v.last_charging_at ? String(v.last_charging_at).slice(0, 16) : '',
        last_charging_location: v.last_charging_location || '',
        charging_station_id: v.charging_station_id || '',
        telematics_device_id: v.telematics_device_id || '',
        company_id: v.company_id != null ? String(v.company_id) : '',
        legal_entity_id: v.legal_entity_id != null ? String(v.legal_entity_id) : '',
        business_unit: v.business_unit || '',
        team_name: v.team_name || '',
        cost_center: v.cost_center || '',
        sub_location: v.sub_location || '',
        fleet_name: v.fleet_name || '',
        vehicle_pool: v.vehicle_pool || '',
        assignment_kind: v.assignment_kind || '',
        driver_name: v.driver_name || '',
        driver_phone: v.driver_phone || '',
        assignment_status: v.assignment_status || '',
        assignment_location: v.assignment_location || '',
        location_type: v.location_type || '',
        latitude: v.latitude != null ? String(v.latitude) : '',
        longitude: v.longitude != null ? String(v.longitude) : '',
        address: v.address || '',
        parking_location: v.parking_location || '',
        geofence_name: v.geofence_name || '',
        purchase_date: d(v.purchase_date),
        purchase_cost: v.purchase_cost != null ? String(v.purchase_cost) : '',
        order_number: v.order_number || '',
        supplier_name: v.supplier_name || '',
        procurement_type: v.procurement_type || 'Purchased',
        invoice_number: v.invoice_number || '',
        invoice_date: d(v.invoice_date),
        vendor_name: v.vendor_name || '',
        dealer_name: v.dealer_name || '',
        tax_amount: v.tax_amount != null ? String(v.tax_amount) : '',
        total_cost: v.total_cost != null ? String(v.total_cost) : '',
        currency: v.currency || 'INR',
        funding_type: v.funding_type || '',
        financing_company: v.financing_company || '',
        loan_number: v.loan_number || '',
        loan_start_date: d(v.loan_start_date),
        loan_end_date: d(v.loan_end_date),
        asset_cost: v.asset_cost != null ? String(v.asset_cost) : '',
        capitalized_cost: v.capitalized_cost != null ? String(v.capitalized_cost) : '',
        current_book_value: v.current_book_value != null ? String(v.current_book_value) : '',
        depreciation_method: v.depreciation_method || '',
        depreciation_rate: v.depreciation_rate != null ? String(v.depreciation_rate) : '',
        depreciation_start_date: d(v.depreciation_start_date),
        useful_life_months: v.useful_life_months != null ? String(v.useful_life_months) : '',
        residual_value: v.residual_value != null ? String(v.residual_value) : '',
        gl_account: v.gl_account || '',
        profit_center: v.profit_center || '',
        asset_class: v.asset_class || '',
        insurance_provider: v.insurance_provider || '',
        insurance_policy_number: v.insurance_policy_number || '',
        insurance_policy_type: v.insurance_policy_type || 'Comprehensive',
        insurance_start_date: d(v.insurance_start_date),
        insurance_expiry_date: d(v.insurance_expiry_date),
        insurance_idv: v.insurance_idv != null ? String(v.insurance_idv) : '',
        insurance_premium: v.insurance_premium != null ? String(v.insurance_premium) : '',
        insured_name: v.insured_name || '',
        insurance_status: v.insurance_status || '',
        insurance_renewal_reminder: d(v.insurance_renewal_reminder),
        warranty_months: v.warranty_months != null ? String(v.warranty_months) : '',
        warranty_provider: v.warranty_provider || '',
        warranty_start_date: d(v.warranty_start_date),
        warranty_end_date: d(v.warranty_end_date),
        warranty_km: v.warranty_km != null ? String(v.warranty_km) : '',
        current_odometer_km: v.current_odometer_km != null ? String(v.current_odometer_km) : '',
        warranty_status: v.warranty_status || '',
        has_battery_warranty: Boolean(v.has_battery_warranty),
        has_motor_warranty: Boolean(v.has_motor_warranty),
        motor_warranty_end: d(v.motor_warranty_end),
        vehicle_eol_date: d(v.vehicle_eol_date),
      })
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [id, toast])

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'model_id') {
        const m = models.find((x) => String(x.id) === value)
        if (m?.default_fuel_type) next.fuel_type = m.default_fuel_type
        if (m?.default_category) next.category = m.default_category
        if (m?.make) next.make = m.make
        if (m?.default_fuel_type === 'EV') next.powertrain_type = 'Electric'
      }
      if (key === 'category') {
        const cat = String(value)
        next.fuel_type = cat.toLowerCase().includes('cng') || cat.toLowerCase().includes('petrol')
          ? 'CNG_PETROL'
          : next.fuel_type || 'EV'
      }
      if (key === 'fuel_type' && value === 'EV' && !next.powertrain_type) next.powertrain_type = 'Electric'
      return next
    })
  }

  function toggleCharging(opt: string) {
    const setVals = new Set(form.charging_types.split(',').map((s) => s.trim()).filter(Boolean))
    if (setVals.has(opt)) setVals.delete(opt)
    else setVals.add(opt)
    set('charging_types', [...setVals].join(','))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.city_id || !form.model_id) {
      toast.error('Select a city and model from masters')
      setTab('basic')
      return
    }
    if (!form.vehicle_number.trim()) {
      toast.error('Registration number is required')
      setTab('basic')
      return
    }
    if (!form.make.trim() || !form.model_year.trim()) {
      toast.error('Make and model year are required')
      setTab('basic')
      return
    }
    if (!form.chassis_number.trim()) {
      toast.error('Chassis number is required')
      setTab('identity')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        vehicle_number: form.vehicle_number.trim().toUpperCase(),
        fleet_id: form.fleet_id.trim() || null,
        name: form.name.trim() || null,
        city_id: Number(form.city_id),
        model_id: Number(form.model_id),
        category: form.category,
        vehicle_type: form.vehicle_type || null,
        vehicle_sub_type: form.vehicle_sub_type.trim() || null,
        make: form.make.trim(),
        variant: form.variant.trim() || null,
        model_year: numOrNull(form.model_year),
        color: form.color.trim() || null,
        seats: numOrNull(form.seats),
        description: form.description.trim() || null,
        fuel_type: form.fuel_type,
        status: form.status,
        notes: form.notes.trim() || null,
        vin: form.vin.trim() || null,
        chassis_number: form.chassis_number.trim() || null,
        engine_number: form.engine_number.trim() || null,
        motor_number: form.motor_number.trim() || null,
        battery_serial_number: form.battery_serial_number.trim() || null,
        vehicle_id_number: form.vehicle_id_number.trim() || null,
        key_id: form.key_id.trim() || null,
        rfid_tag: form.rfid_tag.trim() || null,
        barcode: form.barcode.trim() || null,
        registration_date: form.registration_date || null,
        registration_state: form.registration_state.trim() || null,
        registration_rto: form.registration_rto.trim() || null,
        registration_expiry: form.registration_expiry || null,
        vehicle_class: form.vehicle_class.trim() || null,
        puc_number: form.puc_number.trim() || null,
        puc_issue_date: form.puc_issue_date || null,
        puc_expiry_date: form.puc_expiry_date || null,
        fitness_number: form.fitness_number.trim() || null,
        fitness_expiry_date: form.fitness_expiry_date || null,
        permit_number: form.permit_number.trim() || null,
        permit_expiry_date: form.permit_expiry_date || null,
        powertrain_type: form.powertrain_type.trim() || null,
        battery_type: form.battery_type.trim() || null,
        battery_capacity: numOrNull(form.battery_capacity),
        battery_unit: form.battery_unit || 'kWh',
        usable_battery_capacity: numOrNull(form.usable_battery_capacity),
        charging_types: form.charging_types || null,
        ac_charging_capacity: numOrNull(form.ac_charging_capacity),
        dc_fast_charging_capacity: numOrNull(form.dc_fast_charging_capacity),
        charging_connector_type: form.charging_connector_type || null,
        charging_port_count: numOrNull(form.charging_port_count),
        range_value: numOrNull(form.range_value),
        range_unit: form.range_unit || 'km',
        battery_warranty_start: form.battery_warranty_start || null,
        battery_warranty_end: form.battery_warranty_end || null,
        battery_warranty_km: numOrNull(form.battery_warranty_km),
        battery_health_pct: numOrNull(form.battery_health_pct),
        battery_cycle_count: numOrNull(form.battery_cycle_count),
        state_of_charge_pct: numOrNull(form.state_of_charge_pct),
        last_charging_at: form.last_charging_at ? form.last_charging_at.replace('T', ' ') + ':00' : null,
        last_charging_location: form.last_charging_location.trim() || null,
        charging_station_id: form.charging_station_id.trim() || null,
        telematics_device_id: form.telematics_device_id.trim() || null,
        company_id: numOrNull(form.company_id),
        legal_entity_id: numOrNull(form.legal_entity_id),
        business_unit: form.business_unit.trim() || null,
        team_name: form.team_name.trim() || null,
        cost_center: form.cost_center.trim() || null,
        sub_location: form.sub_location.trim() || null,
        fleet_name: form.fleet_name.trim() || null,
        vehicle_pool: form.vehicle_pool.trim() || null,
        assignment_kind: form.assignment_kind || null,
        driver_name: form.driver_name.trim() || null,
        driver_phone: form.driver_phone.trim() || null,
        assignment_status: form.assignment_status.trim() || null,
        assignment_location: form.assignment_location.trim() || null,
        location_type: form.location_type.trim() || null,
        latitude: numOrNull(form.latitude),
        longitude: numOrNull(form.longitude),
        address: form.address.trim() || null,
        parking_location: form.parking_location.trim() || null,
        geofence_name: form.geofence_name.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_cost: numOrNull(form.purchase_cost),
        order_number: form.order_number.trim() || null,
        supplier_name: form.supplier_name.trim() || null,
        procurement_type: form.procurement_type || null,
        invoice_number: form.invoice_number.trim() || null,
        invoice_date: form.invoice_date || null,
        vendor_name: form.vendor_name.trim() || null,
        dealer_name: form.dealer_name.trim() || null,
        tax_amount: numOrNull(form.tax_amount),
        total_cost: numOrNull(form.total_cost),
        currency: form.currency || 'INR',
        funding_type: form.funding_type.trim() || null,
        financing_company: form.financing_company.trim() || null,
        loan_number: form.loan_number.trim() || null,
        loan_start_date: form.loan_start_date || null,
        loan_end_date: form.loan_end_date || null,
        asset_cost: numOrNull(form.asset_cost),
        capitalized_cost: numOrNull(form.capitalized_cost),
        current_book_value: numOrNull(form.current_book_value),
        depreciation_method: form.depreciation_method.trim() || null,
        depreciation_rate: numOrNull(form.depreciation_rate),
        depreciation_start_date: form.depreciation_start_date || null,
        useful_life_months: numOrNull(form.useful_life_months),
        residual_value: numOrNull(form.residual_value),
        gl_account: form.gl_account.trim() || null,
        profit_center: form.profit_center.trim() || null,
        asset_class: form.asset_class.trim() || null,
        insurance_provider: form.insurance_provider.trim() || null,
        insurance_policy_number: form.insurance_policy_number.trim() || null,
        insurance_policy_type: form.insurance_policy_type || null,
        insurance_start_date: form.insurance_start_date || null,
        insurance_expiry_date: form.insurance_expiry_date || null,
        insurance_idv: numOrNull(form.insurance_idv),
        insurance_premium: numOrNull(form.insurance_premium),
        insured_name: form.insured_name.trim() || null,
        insurance_status: form.insurance_status.trim() || null,
        insurance_renewal_reminder: form.insurance_renewal_reminder || null,
        warranty_months: numOrNull(form.warranty_months),
        warranty_provider: form.warranty_provider.trim() || null,
        warranty_start_date: form.warranty_start_date || null,
        warranty_end_date: form.warranty_end_date || null,
        warranty_km: numOrNull(form.warranty_km),
        current_odometer_km: numOrNull(form.current_odometer_km),
        warranty_status: form.warranty_status.trim() || null,
        has_battery_warranty: form.has_battery_warranty,
        has_motor_warranty: form.has_motor_warranty,
        motor_warranty_end: form.motor_warranty_end || null,
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

  const tabs: Array<{ id: FormTab; label: string }> = [
    { id: 'basic', label: 'Basic' },
    { id: 'identity', label: 'Identification' },
    { id: 'ev', label: 'EV details' },
    { id: 'legal', label: 'Registration' },
    // Ownership + Location tabs hidden for now
    // { id: 'ownership', label: 'Ownership' },
    // { id: 'location', label: 'Location' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'financial', label: 'Financial' },
    { id: 'insurance', label: 'Insurance' },
    { id: 'warranty', label: 'Warranty' },
  ]

  const isEv = form.fuel_type === 'EV'

  return (
    <AppLayout title={isEdit ? 'Edit vehicle' : 'Add vehicle'} subtitle="Refex Mobility vehicle asset">
      <div className="rm-page">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <Link to={isEdit && id ? `/vehicles/${id}` : '/vehicles'} className="btn btn-default btn-sm">
            <i className="fas fa-arrow-left" /> Back
          </Link>
          <Link to="/masters" className="btn btn-default btn-sm">Cities / models</Link>
          {assetId ? <span className="rm-pill">Asset ID · {assetId}</span> : null}
        </div>

        <form onSubmit={onSubmit}>
          <div className="rm-tabs" style={{ marginBottom: 12 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rm-panel">
            <div className="rm-panel__bar">
              <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
              <button className="btn btn-primary btn-sm" disabled={saving} type="submit">
                {saving ? 'Saving…' : (isEdit ? 'Save vehicle' : 'Create vehicle')}
              </button>
            </div>

            <div className="rm-form-grid">
              {tab === 'basic' ? (
                <>
                  <Field label="Registration number (plate)" required>
                    <input className="form-control" required value={form.vehicle_number} onChange={(e) => set('vehicle_number', e.target.value)} />
                  </Field>
                  <Field label="Vehicle / Fleet ID" hint="Unique fleet identifier">
                    <input className="form-control" value={form.fleet_id} onChange={(e) => set('fleet_id', e.target.value)} placeholder="Auto if blank" />
                  </Field>
                  <Field label="Display name">
                    <input className="form-control" value={form.name} onChange={(e) => set('name', e.target.value)} />
                  </Field>
                  <Field label="Asset status" required>
                    <AppSelect
                      value={form.status}
                      onChange={(v) => set('status', v)}
                      disabled={form.status === 'assigned'}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                      searchable={false}
                    />
                  </Field>
                  <Field label="Asset category" required>
                    <AppSelect
                      value={form.category}
                      onChange={(v) => set('category', v)}
                      options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                      searchable={false}
                    />
                  </Field>
                  <Field label="Vehicle type" required>
                    <AppSelect
                      value={form.vehicle_type}
                      onChange={(v) => set('vehicle_type', v)}
                      options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
                    />
                  </Field>
                  {/* Hidden for now
                  <Field label="Vehicle sub-type">
                    <input className="form-control" value={form.vehicle_sub_type} onChange={(e) => set('vehicle_sub_type', e.target.value)} />
                  </Field>
                  */}
                  <Field label="Make / manufacturer" required>
                    <input className="form-control" required value={form.make} onChange={(e) => set('make', e.target.value)} />
                  </Field>
                  <Field label="Model" required hint="From masters">
                    <AppSelect
                      required
                      value={form.model_id}
                      onChange={(v) => set('model_id', v)}
                      placeholder="Select model…"
                      options={[
                        { value: '', label: 'Select model…' },
                        ...models.map((m) => ({ value: String(m.id), label: m.name })),
                      ]}
                      searchable
                    />
                  </Field>
                  <Field label="Variant">
                    <input className="form-control" value={form.variant} onChange={(e) => set('variant', e.target.value)} />
                  </Field>
                  <Field label="Model year" required>
                    <input type="number" className="form-control" required value={form.model_year} onChange={(e) => set('model_year', e.target.value)} min={1990} max={2100} />
                  </Field>
                  <Field label="Vehicle color">
                    <input className="form-control" value={form.color} onChange={(e) => set('color', e.target.value)} />
                  </Field>
                  <Field label="Number of seats">
                    <input type="number" className="form-control" value={form.seats} onChange={(e) => set('seats', e.target.value)} min={1} max={60} />
                  </Field>
                  <Field label="City / location" required>
                    <AppSelect
                      required
                      value={form.city_id}
                      onChange={(v) => set('city_id', v)}
                      placeholder="Select city…"
                      options={[
                        { value: '', label: 'Select city…' },
                        ...cities.map((c) => ({ value: String(c.id), label: c.name })),
                      ]}
                      searchable
                    />
                  </Field>
                  <Field label="Fuel type">
                    <AppSelect
                      value={form.fuel_type}
                      onChange={(v) => set('fuel_type', v)}
                      searchable={false}
                      options={[
                        { value: 'EV', label: 'EV' },
                        { value: 'CNG_PETROL', label: 'CNG / Petrol' },
                        { value: 'OTHER', label: 'Other' },
                      ]}
                    />
                  </Field>
                  <Field label="Vehicle description" full>
                    <textarea className="form-control" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
                  </Field>
                  <Field label="Notes" full>
                    <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                  </Field>
                  <p className="help-block">
                    Vehicle images are captured on the vehicle detail Photos tab (GPS-stamped). Primary image can be set later from captures.
                  </p>
                </>
              ) : null}

              {tab === 'identity' ? (
                <>
                  <Field label="VIN / Chassis number">
                    <input className="form-control" value={form.vin} onChange={(e) => set('vin', e.target.value)} />
                  </Field>
                  <Field label="Chassis number" required>
                    <input className="form-control" required value={form.chassis_number} onChange={(e) => set('chassis_number', e.target.value)} />
                  </Field>
                  <Field label="Engine number">
                    <input className="form-control" value={form.engine_number} onChange={(e) => set('engine_number', e.target.value)} />
                  </Field>
                  <Field label="Motor number">
                    <input className="form-control" value={form.motor_number} onChange={(e) => set('motor_number', e.target.value)} />
                  </Field>
                  <Field label="Battery serial number">
                    <input className="form-control" value={form.battery_serial_number} onChange={(e) => set('battery_serial_number', e.target.value)} />
                  </Field>
                  <Field label="Vehicle identification number">
                    <input className="form-control" value={form.vehicle_id_number} onChange={(e) => set('vehicle_id_number', e.target.value)} />
                  </Field>
                  {/* Hidden for now
                  <Field label="Key ID / key number">
                    <input className="form-control" value={form.key_id} onChange={(e) => set('key_id', e.target.value)} />
                  </Field>
                  */}
                  <Field label="RFID / Tag ID">
                    <input className="form-control" value={form.rfid_tag} onChange={(e) => set('rfid_tag', e.target.value)} />
                  </Field>
                  <Field label="Barcode" hint="Auto-generated if blank">
                    <input className="form-control" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
                  </Field>
                  <Field label="Registration date">
                    <DateField value={form.registration_date} onChange={(v) => set('registration_date', v)} />
                  </Field>
                  <p className="help-block">
                    QR is auto-generated on create. Unique: Fleet ID, VIN, Chassis, Battery serial, RFID, Barcode, Registration number.
                  </p>
                </>
              ) : null}

              {tab === 'ev' ? (
                isEv ? (
                  <>
                    <Field label="Powertrain type">
                      <input className="form-control" value={form.powertrain_type} onChange={(e) => set('powertrain_type', e.target.value)} />
                    </Field>
                    <Field label="Battery type">
                      <input className="form-control" value={form.battery_type} onChange={(e) => set('battery_type', e.target.value)} placeholder="LFP, NMC…" />
                    </Field>
                    <Field label="Battery capacity">
                      <input type="number" step="0.01" className="form-control" value={form.battery_capacity} onChange={(e) => set('battery_capacity', e.target.value)} />
                    </Field>
                    <Field label="Battery unit">
                      <AppSelect
                        value={form.battery_unit}
                        onChange={(v) => set('battery_unit', v)}
                        searchable={false}
                        options={[
                          { value: 'kWh', label: 'kWh' },
                          { value: 'Ah', label: 'Ah' },
                        ]}
                      />
                    </Field>
                    <Field label="Usable battery capacity">
                      <input type="number" step="0.01" className="form-control" value={form.usable_battery_capacity} onChange={(e) => set('usable_battery_capacity', e.target.value)} />
                    </Field>
                    <div className="rm-field rm-field--full">
                      <span>Charging type</span>
                      <div className="rm-chip-row" style={{ padding: '8px 0 0' }}>
                        {CHARGING_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`rm-chip${form.charging_types.split(',').map((s) => s.trim()).includes(opt) ? ' is-active' : ''}`}
                            onClick={() => toggleCharging(opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label="AC charging capacity (kW)">
                      <input type="number" step="0.01" className="form-control" value={form.ac_charging_capacity} onChange={(e) => set('ac_charging_capacity', e.target.value)} />
                    </Field>
                    <Field label="DC fast charging capacity (kW)">
                      <input type="number" step="0.01" className="form-control" value={form.dc_fast_charging_capacity} onChange={(e) => set('dc_fast_charging_capacity', e.target.value)} />
                    </Field>
                    <Field label="Charging connector">
                      <AppSelect
                        value={form.charging_connector_type}
                        onChange={(v) => set('charging_connector_type', v)}
                        searchable={false}
                        options={CONNECTORS.map((c) => ({ value: c, label: c }))}
                      />
                    </Field>
                    <Field label="Charging port count">
                      <input type="number" className="form-control" value={form.charging_port_count} onChange={(e) => set('charging_port_count', e.target.value)} />
                    </Field>
                    <Field label="Range">
                      <input type="number" step="0.01" className="form-control" value={form.range_value} onChange={(e) => set('range_value', e.target.value)} />
                    </Field>
                    <Field label="Range unit">
                      <AppSelect
                        value={form.range_unit}
                        onChange={(v) => set('range_unit', v)}
                        searchable={false}
                        options={[
                          { value: 'km', label: 'km' },
                          { value: 'mi', label: 'mi' },
                        ]}
                      />
                    </Field>
                    <Field label="Battery warranty start">
                      <DateField value={form.battery_warranty_start} onChange={(v) => set('battery_warranty_start', v)} />
                    </Field>
                    <Field label="Battery warranty end">
                      <DateField value={form.battery_warranty_end} onChange={(v) => set('battery_warranty_end', v)} />
                    </Field>
                    <Field label="Battery warranty KM">
                      <input type="number" className="form-control" value={form.battery_warranty_km} onChange={(e) => set('battery_warranty_km', e.target.value)} />
                    </Field>
                    <Field label="Battery health %">
                      <input type="number" step="0.01" className="form-control" value={form.battery_health_pct} onChange={(e) => set('battery_health_pct', e.target.value)} />
                    </Field>
                    <Field label="Battery cycle count">
                      <input type="number" className="form-control" value={form.battery_cycle_count} onChange={(e) => set('battery_cycle_count', e.target.value)} />
                    </Field>
                    <Field label="State of charge %">
                      <input type="number" step="0.01" className="form-control" value={form.state_of_charge_pct} onChange={(e) => set('state_of_charge_pct', e.target.value)} />
                    </Field>
                    {/* Hidden for now
                    <Field label="Last charging date/time">
                      <input type="datetime-local" className="form-control" value={form.last_charging_at} onChange={(e) => set('last_charging_at', e.target.value)} />
                    </Field>
                    <Field label="Last charging location">
                      <input className="form-control" value={form.last_charging_location} onChange={(e) => set('last_charging_location', e.target.value)} />
                    </Field>
                    <Field label="Charging station ID">
                      <input className="form-control" value={form.charging_station_id} onChange={(e) => set('charging_station_id', e.target.value)} />
                    </Field>
                    <Field label="Telematics device ID">
                      <input className="form-control" value={form.telematics_device_id} onChange={(e) => set('telematics_device_id', e.target.value)} />
                    </Field>
                    */}
                  </>
                ) : (
                  <p className="help-block">Switch fuel type to EV to edit EV-specific fields.</p>
                )
              ) : null}

              {tab === 'legal' ? (
                <>
                  <Field label="Registration state">
                    <input className="form-control" value={form.registration_state} onChange={(e) => set('registration_state', e.target.value)} />
                  </Field>
                  <Field label="Registration RTO">
                    <input className="form-control" value={form.registration_rto} onChange={(e) => set('registration_rto', e.target.value)} />
                  </Field>
                  <Field label="Registration expiry">
                    <DateField value={form.registration_expiry} onChange={(v) => set('registration_expiry', v)} />
                  </Field>
                  <Field label="Vehicle class">
                    <input className="form-control" value={form.vehicle_class} onChange={(e) => set('vehicle_class', e.target.value)} />
                  </Field>
                  {!isEv ? (
                    <>
                      <Field label="PUC number">
                        <input className="form-control" value={form.puc_number} onChange={(e) => set('puc_number', e.target.value)} />
                      </Field>
                      <Field label="PUC issue date">
                        <DateField value={form.puc_issue_date} onChange={(v) => set('puc_issue_date', v)} />
                      </Field>
                      <Field label="PUC expiry">
                        <DateField value={form.puc_expiry_date} onChange={(v) => set('puc_expiry_date', v)} />
                      </Field>
                    </>
                  ) : (
                    <p className="help-block">PUC fields are hidden for EV (optional if your ops still track them — switch fuel type if needed).</p>
                  )}
                  <Field label="Fitness certificate number">
                    <input className="form-control" value={form.fitness_number} onChange={(e) => set('fitness_number', e.target.value)} />
                  </Field>
                  <Field label="Fitness expiry">
                    <DateField value={form.fitness_expiry_date} onChange={(v) => set('fitness_expiry_date', v)} />
                  </Field>
                  <Field label="Permit number">
                    <input className="form-control" value={form.permit_number} onChange={(e) => set('permit_number', e.target.value)} />
                  </Field>
                  <Field label="Permit expiry">
                    <DateField value={form.permit_expiry_date} onChange={(v) => set('permit_expiry_date', v)} />
                  </Field>
                </>
              ) : null}

              {/* Ownership tab UI hidden — tab removed from nav above */}
              {false && tab === 'ownership' ? (
                <>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <CompanyEntityFields
                      companyId={form.company_id}
                      legalEntityId={form.legal_entity_id}
                      companies={companies}
                      onCompaniesChange={setCompanies}
                      onCompanyChange={(v) => set('company_id', v)}
                      onLegalEntityChange={(v) => set('legal_entity_id', v)}
                    />
                  </div>
                  <Field label="Business unit">
                    <input className="form-control" value={form.business_unit} onChange={(e) => set('business_unit', e.target.value)} placeholder="Fleet Operations" />
                  </Field>
                  <Field label="Team">
                    <input className="form-control" value={form.team_name} onChange={(e) => set('team_name', e.target.value)} />
                  </Field>
                  <Field label="Cost center">
                    <input className="form-control" value={form.cost_center} onChange={(e) => set('cost_center', e.target.value)} />
                  </Field>
                  <Field label="Fleet name">
                    <input className="form-control" value={form.fleet_name} onChange={(e) => set('fleet_name', e.target.value)} />
                  </Field>
                  <Field label="Vehicle pool">
                    <input className="form-control" value={form.vehicle_pool} onChange={(e) => set('vehicle_pool', e.target.value)} />
                  </Field>
                  <Field label="Sub-location">
                    <input className="form-control" value={form.sub_location} onChange={(e) => set('sub_location', e.target.value)} />
                  </Field>
                  <Field label="Assignment type">
                    <AppSelect
                      value={form.assignment_kind}
                      onChange={(v) => set('assignment_kind', v)}
                      placeholder="—"
                      options={[
                        { value: '', label: '—' },
                        ...ASSIGNMENT_KINDS.map((a) => ({ value: a, label: a })),
                      ]}
                    />
                  </Field>
                  <Field label="Driver name">
                    <input className="form-control" value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} />
                  </Field>
                  <Field label="Driver phone">
                    <input className="form-control" value={form.driver_phone} onChange={(e) => set('driver_phone', e.target.value)} />
                  </Field>
                  <Field label="Assignment status">
                    <input className="form-control" value={form.assignment_status} onChange={(e) => set('assignment_status', e.target.value)} />
                  </Field>
                  <Field label="Assignment location">
                    <input className="form-control" value={form.assignment_location} onChange={(e) => set('assignment_location', e.target.value)} />
                  </Field>
                  <p className="help-block">
                    Live assign/unassign (with history) is managed on the vehicle detail page.
                  </p>
                </>
              ) : null}

              {/* Location tab UI hidden — tab removed from nav above */}
              {false && tab === 'location' ? (
                <>
                  <Field label="Location type">
                    <input className="form-control" value={form.location_type} onChange={(e) => set('location_type', e.target.value)} placeholder="Hub / Yard / Customer site" />
                  </Field>
                  <Field label="Parking location">
                    <input className="form-control" value={form.parking_location} onChange={(e) => set('parking_location', e.target.value)} />
                  </Field>
                  <Field label="Geofence">
                    <input className="form-control" value={form.geofence_name} onChange={(e) => set('geofence_name', e.target.value)} />
                  </Field>
                  <Field label="Latitude">
                    <input type="number" step="0.0000001" className="form-control" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />
                  </Field>
                  <Field label="Longitude">
                    <input type="number" step="0.0000001" className="form-control" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />
                  </Field>
                  <Field label="Address" full>
                    <textarea className="form-control" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'purchase' ? (
                <>
                  <Field label="Procurement type">
                    <AppSelect
                      value={form.procurement_type}
                      onChange={(v) => set('procurement_type', v)}
                      options={PROCUREMENT.map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                  <Field label="Purchase date">
                    <DateField value={form.purchase_date} onChange={(v) => set('purchase_date', v)} />
                  </Field>
                  <Field label="PO / order number">
                    <input className="form-control" value={form.order_number} onChange={(e) => set('order_number', e.target.value)} />
                  </Field>
                  <Field label="Invoice number">
                    <input className="form-control" value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} />
                  </Field>
                  <Field label="Invoice date">
                    <DateField value={form.invoice_date} onChange={(v) => set('invoice_date', v)} />
                  </Field>
                  <Field label="Supplier">
                    <input className="form-control" value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} />
                  </Field>
                  <Field label="Vendor">
                    <input className="form-control" value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} />
                  </Field>
                  <Field label="Dealer">
                    <input className="form-control" value={form.dealer_name} onChange={(e) => set('dealer_name', e.target.value)} />
                  </Field>
                  <Field label="Purchase price">
                    <input type="number" step="0.01" className="form-control" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} />
                  </Field>
                  <Field label="Tax amount">
                    <input type="number" step="0.01" className="form-control" value={form.tax_amount} onChange={(e) => set('tax_amount', e.target.value)} />
                  </Field>
                  <Field label="Total cost">
                    <input type="number" step="0.01" className="form-control" value={form.total_cost} onChange={(e) => set('total_cost', e.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <input className="form-control" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
                  </Field>
                  <Field label="Funding type">
                    <input className="form-control" value={form.funding_type} onChange={(e) => set('funding_type', e.target.value)} />
                  </Field>
                  <Field label="Financing company">
                    <input className="form-control" value={form.financing_company} onChange={(e) => set('financing_company', e.target.value)} />
                  </Field>
                  <Field label="Loan number">
                    <input className="form-control" value={form.loan_number} onChange={(e) => set('loan_number', e.target.value)} />
                  </Field>
                  <Field label="Loan start">
                    <DateField value={form.loan_start_date} onChange={(v) => set('loan_start_date', v)} />
                  </Field>
                  <Field label="Loan end">
                    <DateField value={form.loan_end_date} onChange={(v) => set('loan_end_date', v)} />
                  </Field>
                </>
              ) : null}

              {tab === 'financial' ? (
                <>
                  <Field label="Asset cost">
                    <input type="number" step="0.01" className="form-control" value={form.asset_cost} onChange={(e) => set('asset_cost', e.target.value)} />
                  </Field>
                  <Field label="Capitalized cost">
                    <input type="number" step="0.01" className="form-control" value={form.capitalized_cost} onChange={(e) => set('capitalized_cost', e.target.value)} />
                  </Field>
                  <Field label="Current book value">
                    <input type="number" step="0.01" className="form-control" value={form.current_book_value} onChange={(e) => set('current_book_value', e.target.value)} />
                  </Field>
                  <Field label="Depreciation method">
                    <input className="form-control" value={form.depreciation_method} onChange={(e) => set('depreciation_method', e.target.value)} />
                  </Field>
                  <Field label="Depreciation rate %">
                    <input type="number" step="0.0001" className="form-control" value={form.depreciation_rate} onChange={(e) => set('depreciation_rate', e.target.value)} />
                  </Field>
                  <Field label="Depreciation start">
                    <DateField value={form.depreciation_start_date} onChange={(v) => set('depreciation_start_date', v)} />
                  </Field>
                  <Field label="Useful life (months)">
                    <input type="number" className="form-control" value={form.useful_life_months} onChange={(e) => set('useful_life_months', e.target.value)} />
                  </Field>
                  <Field label="Residual value">
                    <input type="number" step="0.01" className="form-control" value={form.residual_value} onChange={(e) => set('residual_value', e.target.value)} />
                  </Field>
                  <Field label="GL account">
                    <input className="form-control" value={form.gl_account} onChange={(e) => set('gl_account', e.target.value)} />
                  </Field>
                  <Field label="Profit center">
                    <input className="form-control" value={form.profit_center} onChange={(e) => set('profit_center', e.target.value)} />
                  </Field>
                  <Field label="Asset class">
                    <input className="form-control" value={form.asset_class} onChange={(e) => set('asset_class', e.target.value)} />
                  </Field>
                  <Field label="Cost center">
                    <input className="form-control" value={form.cost_center} onChange={(e) => set('cost_center', e.target.value)} />
                  </Field>
                </>
              ) : null}

              {tab === 'insurance' ? (
                <>
                  <Field label="Insurance provider">
                    <input className="form-control" value={form.insurance_provider} onChange={(e) => set('insurance_provider', e.target.value)} />
                  </Field>
                  <Field label="Policy number">
                    <input className="form-control" value={form.insurance_policy_number} onChange={(e) => set('insurance_policy_number', e.target.value)} />
                  </Field>
                  <Field label="Policy type">
                    <AppSelect
                      value={form.insurance_policy_type}
                      onChange={(v) => set('insurance_policy_type', v)}
                      searchable={false}
                      options={POLICY_TYPES.map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                  <Field label="Policy start">
                    <DateField value={form.insurance_start_date} onChange={(v) => set('insurance_start_date', v)} />
                  </Field>
                  <Field label="Policy expiry">
                    <DateField value={form.insurance_expiry_date} onChange={(v) => set('insurance_expiry_date', v)} />
                  </Field>
                  <Field label="IDV value">
                    <input type="number" step="0.01" className="form-control" value={form.insurance_idv} onChange={(e) => set('insurance_idv', e.target.value)} />
                  </Field>
                  <Field label="Premium amount">
                    <input type="number" step="0.01" className="form-control" value={form.insurance_premium} onChange={(e) => set('insurance_premium', e.target.value)} />
                  </Field>
                  <Field label="Insured name">
                    <input className="form-control" value={form.insured_name} onChange={(e) => set('insured_name', e.target.value)} />
                  </Field>
                  <Field label="Insurance status">
                    <input className="form-control" value={form.insurance_status} onChange={(e) => set('insurance_status', e.target.value)} />
                  </Field>
                  <Field label="Renewal reminder">
                    <DateField value={form.insurance_renewal_reminder} onChange={(v) => set('insurance_renewal_reminder', v)} />
                  </Field>
                </>
              ) : null}

              {tab === 'warranty' ? (
                <>
                  <Field label="Warranty provider">
                    <input className="form-control" value={form.warranty_provider} onChange={(e) => set('warranty_provider', e.target.value)} />
                  </Field>
                  <Field label="Warranty months (legacy)">
                    <input type="number" className="form-control" value={form.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} />
                  </Field>
                  <Field label="Warranty start">
                    <DateField value={form.warranty_start_date} onChange={(v) => set('warranty_start_date', v)} />
                  </Field>
                  <Field label="Warranty end">
                    <DateField value={form.warranty_end_date} onChange={(v) => set('warranty_end_date', v)} />
                  </Field>
                  <Field label="Warranty KM">
                    <input type="number" className="form-control" value={form.warranty_km} onChange={(e) => set('warranty_km', e.target.value)} />
                  </Field>
                  <Field label="Current odometer (KM)">
                    <input type="number" className="form-control" value={form.current_odometer_km} onChange={(e) => set('current_odometer_km', e.target.value)} />
                  </Field>
                  <Field label="Warranty status">
                    <input className="form-control" value={form.warranty_status} onChange={(e) => set('warranty_status', e.target.value)} />
                  </Field>
                  <Field label="EOL date">
                    <DateField value={form.vehicle_eol_date} onChange={(v) => set('vehicle_eol_date', v)} />
                  </Field>
                  <label className="rm-field">
                    <span><input type="checkbox" checked={form.has_battery_warranty} onChange={(e) => set('has_battery_warranty', e.target.checked)} /> Battery warranty</span>
                  </label>
                  <label className="rm-field">
                    <span><input type="checkbox" checked={form.has_motor_warranty} onChange={(e) => set('has_motor_warranty', e.target.checked)} /> Motor warranty</span>
                  </label>
                  <Field label="Motor warranty end">
                    <DateField value={form.motor_warranty_end} onChange={(v) => set('motor_warranty_end', v)} />
                  </Field>
                </>
              ) : null}
            </div>

            <div className="rm-pager" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-default btn-sm" onClick={() => {
                const idx = tabs.findIndex((t) => t.id === tab)
                if (idx > 0) setTab(tabs[idx - 1].id)
              }} disabled={tab === 'basic'}>
                Previous
              </button>
              <button className="btn btn-primary btn-sm" disabled={saving} type="submit">
                {saving ? 'Saving…' : (isEdit ? 'Save vehicle' : 'Create vehicle')}
              </button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => {
                const idx = tabs.findIndex((t) => t.id === tab)
                if (idx < tabs.length - 1) setTab(tabs[idx + 1].id)
              }} disabled={tab === 'warranty'}>
                Next
              </button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
