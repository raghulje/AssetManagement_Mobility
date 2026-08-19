import { api, type ApiList } from './client'
import { getApiBase } from './baseUrl'

export type Vehicle = {
  id: number
  vehicle_number: string
  name?: string | null
  model: string
  model_id?: number | null
  location_name: string
  city_id?: number | null
  category: string
  fuel_type: string
  status: string
  notes?: string | null
  assigned_to?: number | null
  assigned_type?: string | null
  assigned_name?: string | null
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
  captures_count: number
  maintenances_count?: number
  last_captured_at?: string | null
  created_at?: string
  updated_at?: string
}

export type VehicleCapture = {
  id: number
  vehicle_id: number
  session_id?: number | null
  captured_by?: number | null
  captured_by_name?: string | null
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
  facets: () => api<VehicleFacets>('/vehicles/facets'),
  eolDue: (search?: string) => api<ApiList<Record<string, unknown>>>(`/vehicles/eol/due${qs({ search })}`),
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
  ensureQr: (id: number | string) => api<Record<string, unknown>>(`/vehicles/${id}/qr`, { method: 'POST' }),
  maintenances: (id: number | string) => api<ApiList<VehicleMaintenance>>(`/vehicles/${id}/maintenances`),
  addMaintenance: (id: number | string, body: Record<string, unknown>) =>
    api(`/vehicles/${id}/maintenances`, { method: 'POST', json: body }),
  updateMaintenance: (id: number | string, mid: number | string, body: Record<string, unknown>) =>
    api(`/vehicles/${id}/maintenances/${mid}`, { method: 'PUT', json: body }),
  deleteMaintenance: (id: number | string, mid: number | string) =>
    api(`/vehicles/${id}/maintenances/${mid}`, { method: 'DELETE' }),
  captures: (id: number | string) => api<ApiList<VehicleCapture>>(`/vehicles/${id}/captures`),
  startSession: (id: number | string, notes?: string) =>
    api<{ status: string; payload: { id: number } }>(`/vehicles/${id}/capture-sessions`, {
      method: 'POST',
      json: { notes },
    }),
  uploadCapture: async (
    id: number | string,
    file: Blob,
    meta: {
      captured_at: string
      latitude?: number | null
      longitude?: number | null
      address?: string | null
      session_id?: number | null
      filename?: string
    },
  ) => {
    const fd = new FormData()
    fd.append('file', file, meta.filename || `capture-${Date.now()}.jpg`)
    fd.append('captured_at', meta.captured_at)
    if (meta.latitude != null) fd.append('latitude', String(meta.latitude))
    if (meta.longitude != null) fd.append('longitude', String(meta.longitude))
    if (meta.address) fd.append('address', meta.address)
    if (meta.session_id != null) fd.append('session_id', String(meta.session_id))
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
  deleteCapture: (vehicleId: number | string, captureId: number | string) =>
    api(`/vehicles/${vehicleId}/captures/${captureId}`, { method: 'DELETE' }),
  reverseGeocode: (lat: number, lng: number) =>
    api<{
      lat: number
      lng: number
      address: string
      formatted_address?: string
      locality_header?: string | null
      place_name?: string | null
      location_type?: string | null
      place_id?: string | null
      provider?: string
    }>(`/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`),
  listFiles: (id: number | string) =>
    api<ApiList<Record<string, unknown>>>(`/vehicles/${id}/files`),
  uploadFile: async (id: number | string, file: File, kind: string) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${getApiBase()}/vehicles/${id}/files?kind=${encodeURIComponent(kind)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data.messages || []).join(', ') || 'Upload failed')
    return data
  },
  deleteFile: (fileId: number | string) => api(`/files/${fileId}`, { method: 'DELETE' }),
}
