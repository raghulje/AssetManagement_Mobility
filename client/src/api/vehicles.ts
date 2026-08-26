import { api, type ApiList } from './client'
import { getApiBase } from './baseUrl'

/** Core + Refex Mobility vehicle asset profile fields */
export type Vehicle = {
  id: number
  asset_id?: number
  vehicle_number: string
  fleet_id?: string | null
  name?: string | null
  model: string
  model_id?: number | null
  make?: string | null
  variant?: string | null
  model_year?: number | null
  color?: string | null
  primary_image_path?: string | null
  seats?: number | null
  location_name: string
  city_id?: number | null
  category: string
  vehicle_type?: string | null
  vehicle_sub_type?: string | null
  fuel_type: string
  status: string
  notes?: string | null
  description?: string | null
  assigned_to?: number | null
  assigned_type?: string | null
  assigned_name?: string | null
  assignment_kind?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  assignment_status?: string | null
  assignment_location?: string | null
  expected_checkin?: string | null
  last_checkout?: string | null
  last_checkin?: string | null
  checkout_counter?: number
  checkin_counter?: number
  purchase_date?: string | null
  purchase_cost?: number | null
  order_number?: string | null
  supplier_name?: string | null
  warranty_months?: number | null
  vehicle_eol_date?: string | null
  qr_token?: string | null
  qr_url?: string | null
  qr_image_url?: string | null
  barcode?: string | null
  vin?: string | null
  chassis_number?: string | null
  engine_number?: string | null
  motor_number?: string | null
  battery_serial_number?: string | null
  vehicle_id_number?: string | null
  key_id?: string | null
  rfid_tag?: string | null
  registration_date?: string | null
  registration_state?: string | null
  registration_rto?: string | null
  registration_expiry?: string | null
  vehicle_class?: string | null
  puc_number?: string | null
  puc_issue_date?: string | null
  puc_expiry_date?: string | null
  fitness_number?: string | null
  fitness_expiry_date?: string | null
  permit_number?: string | null
  permit_expiry_date?: string | null
  powertrain_type?: string | null
  battery_type?: string | null
  battery_capacity?: number | null
  battery_unit?: string | null
  usable_battery_capacity?: number | null
  charging_types?: string | null
  charging_types_list?: string[]
  ac_charging_capacity?: number | null
  dc_fast_charging_capacity?: number | null
  charging_connector_type?: string | null
  charging_port_count?: number | null
  range_value?: number | null
  range_unit?: string | null
  battery_warranty_start?: string | null
  battery_warranty_end?: string | null
  battery_warranty_km?: number | null
  battery_health_pct?: number | null
  battery_cycle_count?: number | null
  state_of_charge_pct?: number | null
  last_charging_at?: string | null
  last_charging_location?: string | null
  charging_station_id?: string | null
  telematics_device_id?: string | null
  company_id?: number | null
  legal_entity_id?: number | null
  company_name?: string | null
  legal_entity_name?: string | null
  business_unit?: string | null
  department_id?: number | null
  team_name?: string | null
  cost_center?: string | null
  sub_location?: string | null
  fleet_name?: string | null
  vehicle_pool?: string | null
  vehicle_owner_id?: number | null
  fleet_manager_id?: number | null
  current_custodian_id?: number | null
  location_type?: string | null
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  last_location_updated?: string | null
  gps_accuracy_m?: number | null
  geofence_name?: string | null
  parking_location?: string | null
  procurement_type?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  vendor_name?: string | null
  dealer_name?: string | null
  tax_amount?: number | null
  total_cost?: number | null
  currency?: string | null
  funding_type?: string | null
  financing_company?: string | null
  loan_number?: string | null
  loan_start_date?: string | null
  loan_end_date?: string | null
  asset_cost?: number | null
  capitalized_cost?: number | null
  current_book_value?: number | null
  depreciation_method?: string | null
  depreciation_rate?: number | null
  depreciation_start_date?: string | null
  useful_life_months?: number | null
  residual_value?: number | null
  gl_account?: string | null
  profit_center?: string | null
  asset_class?: string | null
  insurance_provider?: string | null
  insurance_policy_number?: string | null
  insurance_policy_type?: string | null
  insurance_start_date?: string | null
  insurance_expiry_date?: string | null
  insurance_idv?: number | null
  insurance_premium?: number | null
  insured_name?: string | null
  insurance_status?: string | null
  insurance_renewal_reminder?: string | null
  warranty_provider?: string | null
  warranty_start_date?: string | null
  warranty_end_date?: string | null
  warranty_km?: number | null
  current_odometer_km?: number | null
  warranty_status?: string | null
  has_battery_warranty?: boolean | number | null
  has_motor_warranty?: boolean | number | null
  motor_warranty_end?: string | null
  captures_count: number
  maintenances_count?: number
  last_captured_at?: string | null
  /** Public form registration verified */
  form_verified?: boolean
  verification_status?: 'Verified' | 'Not Verified' | string
  created_at?: string
  updated_at?: string
}

export type VehicleCapture = {
  id: number
  vehicle_id: number
  session_id?: number | null
  captured_by?: number | null
  captured_by_name?: string | null
  submitter_name?: string | null
  submitter_email?: string | null
  submitter_phone?: string | null
  source?: string | null
  verified_at?: string | null
  verified_by?: number | null
  verified_by_name?: string | null
  verified_summary?: string | null
  verification_log?: Array<{
    verified_at?: string
    verified_by?: number
    verified_by_name?: string
    summary?: string
  }>
  storage_path: string
  url: string
  original_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  captured_at: string
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  created_at?: string
}

export type VehicleMaintenance = {
  id: number
  vehicle_id: number
  maintenance_type: string
  title: string
  is_warranty: number | boolean
  start_date?: string | null
  completion_date?: string | null
  cost?: number | null
  odometer_km?: number | null
  vendor_name?: string | null
  parts_replaced?: string | null
  note?: string | null
  created_by_name?: string | null
  created_at?: string
}

export type VehicleFacets = {
  locations: Array<{ value: string; c: number; id?: number }>
  models: Array<{ value: string; c: number; id?: number }>
  categories: Array<{ value: string; c: number }>
  fuel_types: Array<{ value: string; c: number }>
  statuses?: Array<{ value: string; c: number }>
}

function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

function authHeaders() {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const t = localStorage.getItem('refex_token')
  if (t) headers.Authorization = `Bearer ${t}`
  return headers
}

export const vehiclesApi = {
  list: (params: Record<string, string | number | undefined | null> = {}) =>
    api<ApiList<Vehicle>>(`/vehicles${qs(params)}`),
  facets: (params: Record<string, string | number | undefined | null> = {}) =>
    api<VehicleFacets>(`/vehicles/facets${qs(params)}`),
  eolDue: (search?: string) => api<ApiList<Record<string, unknown>>>(`/vehicles/eol/due${qs({ search })}`),
  pendingVerification: (limit = 100) =>
    api<ApiList<{
      id: number
      vehicle_number: string
      model?: string | null
      location_name?: string | null
      session_id: number
      submitter_name?: string | null
      submitter_email?: string | null
      photo_count: number
      submitted_at?: string | null
    }>>(`/vehicles/pending-verification${qs({ limit })}`),
  get: (id: number | string) => api<Vehicle>(`/vehicles/${id}`),
  create: (body: Record<string, unknown>) =>
    api<{ payload: Vehicle }>('/vehicles', { method: 'POST', json: body }),
  update: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: Vehicle }>(`/vehicles/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) => api(`/vehicles/${id}`, { method: 'DELETE' }),
  checkout: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: Vehicle }>(`/vehicles/${id}/checkout`, { method: 'POST', json: body }),
  checkin: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: Vehicle }>(`/vehicles/${id}/checkin`, { method: 'POST', json: body }),
  history: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/vehicles/${id}/history`),
  assignments: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/vehicles/${id}/assignments`),
  ensureQr: (id: number | string) => api<Record<string, unknown>>(`/vehicles/${id}/qr`, { method: 'POST' }),
  maintenances: (id: number | string) => api<ApiList<VehicleMaintenance>>(`/vehicles/${id}/maintenances`),
  addMaintenance: (id: number | string, body: Record<string, unknown>) =>
    api(`/vehicles/${id}/maintenances`, { method: 'POST', json: body }),
  updateMaintenance: (id: number | string, mid: number | string, body: Record<string, unknown>) =>
    api(`/vehicles/${id}/maintenances/${mid}`, { method: 'PUT', json: body }),
  deleteMaintenance: (id: number | string, mid: number | string) =>
    api(`/vehicles/${id}/maintenances/${mid}`, { method: 'DELETE' }),
  captures: (id: number | string) => api<ApiList<VehicleCapture>>(`/vehicles/${id}/captures`),
  startSession: (id: number | string) =>
    api<{ status: string; payload: { id: number } }>(`/vehicles/${id}/capture-sessions`, {
      method: 'POST',
      json: {},
    }),
  uploadCapture: async (id: number | string, file: File, meta: Record<string, string | number | null | undefined>) => {
    const fd = new FormData()
    fd.append('file', file)
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined || v === null || v === '') continue
      fd.append(k, String(v))
    }
    const res = await fetch(`${getApiBase()}/vehicles/${id}/captures`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = Array.isArray(data.messages) ? data.messages.join(', ') : (data.messages || data.message || res.statusText)
      throw new Error(String(msg))
    }
    return data as { status: string; messages: string[]; payload: VehicleCapture }
  },
  deleteCapture: (id: number | string, cid: number | string) =>
    api(`/vehicles/${id}/captures/${cid}`, { method: 'DELETE' }),
  verifyCaptureSession: (id: number | string, sessionId: number | string, summary: string) =>
    api<{
      status: string
      messages?: string[]
      payload?: {
        session_id: number
        verified_at: string
        verified_by: number
        verified_by_name: string
        verified_summary: string
        verification_log: VehicleCapture['verification_log']
      }
    }>(`/vehicles/${id}/capture-sessions/${sessionId}/verify`, {
      method: 'POST',
      json: { summary },
    }),
  deregisterFormSession: (id: number | string, sessionId: number | string) =>
    api<{
      status: string
      messages?: string[]
      payload?: { session_id: number; photos_removed: number; files_removed: number }
    }>(`/vehicles/${id}/capture-sessions/${sessionId}/form-registration`, {
      method: 'DELETE',
    }),
  reverseGeocode: (lat: number, lng: number) =>
    api<{
      address?: string | null
      formatted_address?: string | null
      locality_header?: string | null
      [key: string]: unknown
    }>(`/geo/reverse${qs({ lat, lng })}`),
  listFiles: (id: number | string) =>
    api<ApiList<Record<string, unknown>>>(`/files${qs({ item_type: 'vehicle', item_id: id })}`),
  uploadFile: async (id: number | string, file: File, kind: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('item_type', 'vehicle')
    fd.append('item_id', String(id))
    fd.append('kind', kind)
    const res = await fetch(`${getApiBase()}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(data.message || res.statusText))
    return data
  },
  deleteFile: (fileId: number | string) => api(`/files/${fileId}`, { method: 'DELETE' }),
}
