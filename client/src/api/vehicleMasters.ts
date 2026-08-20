import { api, type ApiList } from './client'

export type VehicleCity = {
  id: number
  name: string
  code?: string | null
  state?: string | null
  is_active?: number | boolean
  notes?: string | null
  vehicles_count?: number
}

export type VehicleModelMaster = {
  id: number
  name: string
  make?: string | null
  default_fuel_type?: string
  default_category?: string | null
  is_active?: number | boolean
  notes?: string | null
  vehicles_count?: number
}

export const vehicleMastersApi = {
  cities: (active = false) =>
    api<ApiList<VehicleCity>>(`/vehicle-masters/cities${active ? '?active=1' : ''}`),
  citySelect: () => api<ApiList<{ id: number; text: string; name: string }>>('/vehicle-masters/cities/selectlist'),
  createCity: (body: Record<string, unknown>) =>
    api<{ payload: VehicleCity }>('/vehicle-masters/cities', { method: 'POST', json: body }),
  updateCity: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: VehicleCity }>(`/vehicle-masters/cities/${id}`, { method: 'PUT', json: body }),
  deleteCity: (id: number | string) =>
    api(`/vehicle-masters/cities/${id}`, { method: 'DELETE' }),

  models: (active = false) =>
    api<ApiList<VehicleModelMaster>>(`/vehicle-masters/models${active ? '?active=1' : ''}`),
  modelSelect: () => api<ApiList<{
    id: number
    text: string
    name: string
    make?: string | null
    default_fuel_type?: string
    default_category?: string | null
  }>>('/vehicle-masters/models/selectlist'),
  createModel: (body: Record<string, unknown>) =>
    api<{ payload: VehicleModelMaster }>('/vehicle-masters/models', { method: 'POST', json: body }),
  updateModel: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: VehicleModelMaster }>(`/vehicle-masters/models/${id}`, { method: 'PUT', json: body }),
  deleteModel: (id: number | string) =>
    api(`/vehicle-masters/models/${id}`, { method: 'DELETE' }),
}
