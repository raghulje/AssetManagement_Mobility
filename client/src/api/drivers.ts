import { api, type ApiList } from './client'

export type Driver = {
  id: number
  driver_code?: string | null
  first_name: string
  last_name?: string | null
  name: string
  phone?: string | null
  email?: string | null
  license_number?: string | null
  license_expiry?: string | null
  city_id?: number | null
  city_name?: string | null
  status: string
  notes?: string | null
  user_id?: number | null
  current_vehicle_id?: number | null
  current_vehicle_number?: string | null
  current_vehicle_model?: string | null
  assigned_count?: number
  created_at?: string
  updated_at?: string
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

export const driversApi = {
  list: (params: Record<string, string | number | undefined | null> = {}) =>
    api<ApiList<Driver>>(`/drivers${qs(params)}`),
  select: () => api<ApiList<{ id: number; text: string; name: string; phone?: string | null; driver_code?: string | null }>>('/drivers/selectlist'),
  holding: () => api<ApiList<Record<string, unknown>>>('/drivers/holding'),
  get: (id: number | string) => api<Driver>(`/drivers/${id}`),
  vehicles: (id: number | string) =>
    api<{ current: Record<string, unknown>[]; history: Record<string, unknown>[] }>(`/drivers/${id}/vehicles`),
  create: (body: Record<string, unknown>) =>
    api<{ payload: Driver }>('/drivers', { method: 'POST', json: body }),
  update: (id: number | string, body: Record<string, unknown>) =>
    api<{ payload: Driver }>(`/drivers/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) => api(`/drivers/${id}`, { method: 'DELETE' }),
}
