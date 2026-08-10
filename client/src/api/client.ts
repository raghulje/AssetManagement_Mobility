import { getApiBase } from './baseUrl'

export type ApiList<T> = { total: number; rows: T[] }

function token() {
  return localStorage.getItem('refex_token')
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem('refex_token', t)
  else localStorage.removeItem('refex_token')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = Array.isArray(data.messages) ? data.messages.join(', ') : (data.messages || data.message || res.statusText)
    throw new Error(String(msg))
  }
  return data as T
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: Record<string, unknown> }>('/login', { method: 'POST', json: { email, password } }),
  me: () => api('/user'),
  forgotPassword: (email: string) =>
    api<{ messages?: string[] }>('/password/forgot', { method: 'POST', json: { email } }),
  validateResetToken: (token: string) =>
    api(`/password/reset/${encodeURIComponent(token)}`),
  resetPassword: (token: string, password: string, password_confirmation: string) =>
    api<{ messages?: string[] }>('/password/reset', {
      method: 'POST',
      json: { token, password, password_confirmation },
    }),
}

export const hardwareApi = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/hardware?${q}`)
  },
  facets: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<{ statuses: string[]; assignees: string[] }>(`/hardware/facets?${q}`)
  },
  get: (id: number | string) => api<Record<string, unknown>>(`/hardware/${id}`),
  create: (body: unknown) => api('/hardware', { method: 'POST', json: body }),
  update: (id: number | string, body: unknown) => api(`/hardware/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) => api(`/hardware/${id}`, { method: 'DELETE' }),
  checkout: (id: number | string, body: unknown) => api(`/hardware/${id}/checkout`, { method: 'POST', json: body }),
  checkin: (id: number | string, body: unknown) => api(`/hardware/${id}/checkin`, { method: 'POST', json: body }),
  replace: (id: number | string, body: { new_asset_id: number; reason: string }) =>
    api(`/hardware/${id}/replace`, { method: 'POST', json: body }),
  audit: (id: number | string, body: unknown) => api(`/hardware/${id}/audit`, { method: 'POST', json: body }),
  history: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/hardware/${id}/history`),
  agentStatus: (id: number | string) => api<Record<string, unknown>>(`/hardware/${id}/agent`),
  agentScan: (id: number | string, body: { command?: 'scan' | 'rerun' } = {}) =>
    api(`/hardware/${id}/agent/scan`, { method: 'POST', json: body }),
  agentSnapshots: (id: number | string, limit = 20) =>
    api<ApiList<Record<string, unknown>>>(`/hardware/${id}/agent/snapshots?limit=${limit}`),
}

export const dashboardApi = {
  counts: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v))
    })
    const qs = q.toString()
    return api<Record<string, number>>(`/dashboard${qs ? `?${qs}` : ''}`)
  },
}

export const reportsApi = {
  activity: () => api<ApiList<Record<string, unknown>>>('/reports/activity'),
}

export type SelectOption = { id: number; text: string }

export const usersApi = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/users?${q}`)
  },
  get: (id: number | string) => api<Record<string, unknown>>(`/users/${id}`),
  create: (body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/users', { method: 'POST', json: body }),
  update: (id: number | string, body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/users/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/users/${id}`, { method: 'DELETE' }),
  assets: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/users/${id}/assets`),
}

export const mastersApi = {
  companies: (search?: string) =>
    api<{ results: SelectOption[] }>(`/companies/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  departments: (search?: string) =>
    api<{ results: SelectOption[] }>(`/departments/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  locations: (search?: string) =>
    api<{ results: SelectOption[] }>(`/locations/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  models: (search?: string) =>
    api<{ results: SelectOption[] }>(`/models/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  statuslabels: () => api<{ results: SelectOption[] }>('/statuslabels/selectlist'),
  suppliers: (search?: string) =>
    api<{ results: SelectOption[] }>(`/suppliers/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  categories: (search?: string) =>
    api<{ results: SelectOption[] }>(`/categories/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  manufacturers: (search?: string) =>
    api<{ results: SelectOption[] }>(`/manufacturers/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  listCompanies: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/companies?${q}`)
  },
  createCompany: (body: { name: string; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/companies', {
      method: 'POST',
      json: body,
    }),
  updateCompany: (id: number | string, body: { name?: string; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/companies/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeCompany: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/companies/${id}`, { method: 'DELETE' }),

  listDepartments: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/departments?${q}`)
  },
  createDepartment: (body: {
    name: string
    company_id?: number | null
    location_id?: number | null
    notes?: string | null
  }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/departments', {
      method: 'POST',
      json: body,
    }),
  updateDepartment: (id: number | string, body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/departments/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeDepartment: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/departments/${id}`, { method: 'DELETE' }),

  listLocations: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/locations?${q}`)
  },
  createLocation: (body: {
    name: string
    company_id?: number | null
    parent_id?: number | null
    address?: string | null
    notes?: string | null
  }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/locations', {
      method: 'POST',
      json: body,
    }),
  updateLocation: (id: number | string, body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/locations/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeLocation: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/locations/${id}`, { method: 'DELETE' }),

  listSuppliers: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/suppliers?${q}`)
  },
  createSupplier: (body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/suppliers', {
      method: 'POST',
      json: body,
    }),
  updateSupplier: (id: number | string, body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/suppliers/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeSupplier: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/suppliers/${id}`, { method: 'DELETE' }),

  listModels: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/models?${q}`)
  },
  createModel: (body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: { id: number } }>('/models', {
      method: 'POST',
      json: body,
    }),
  updateModel: (id: number | string, body: Record<string, unknown>) =>
    api<{ status: string; messages: string[] }>(`/models/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeModel: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/models/${id}`, { method: 'DELETE' }),
  getModel: (id: number | string) => api<Record<string, unknown>>(`/models/${id}`),
  getSupplier: (id: number | string) => api<Record<string, unknown>>(`/suppliers/${id}`),

  createManufacturer: (body: { name: string; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/manufacturers', {
      method: 'POST',
      json: body,
    }),
  createCategory: (body: { name: string; category_type?: string }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string } }>('/categories', {
      method: 'POST',
      json: body,
    }),
}

function listParams(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
  return q
}

export const licensesApi = {
  list: (params: Record<string, string | number | undefined> = {}) =>
    api<ApiList<Record<string, unknown>>>(`/licenses?${listParams(params)}`),
  get: (id: number | string) => api<Record<string, unknown>>(`/licenses/${id}`),
  seats: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/licenses/${id}/seats`),
  create: (body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/licenses', {
      method: 'POST',
      json: body,
    }),
  update: (id: number | string, body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/licenses/${id}`, {
      method: 'PUT',
      json: body,
    }),
  remove: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/licenses/${id}`, { method: 'DELETE' }),
  checkout: (id: number | string, body: unknown) =>
    api(`/licenses/${id}/checkout`, { method: 'POST', json: body }),
  checkin: (id: number | string, body: unknown) =>
    api(`/licenses/${id}/checkin`, { method: 'POST', json: body }),
}

function makeQtyApi(base: string) {
  return {
    list: (params: Record<string, string | number | undefined> = {}) =>
      api<ApiList<Record<string, unknown>>>(`${base}?${listParams(params)}`),
    get: (id: number | string) => api<Record<string, unknown>>(`${base}/${id}`),
    create: (body: unknown) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(base, {
        method: 'POST',
        json: body,
      }),
    update: (id: number | string, body: unknown) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`${base}/${id}`, {
        method: 'PUT',
        json: body,
      }),
    remove: (id: number | string) =>
      api<{ status: string; messages: string[] }>(`${base}/${id}`, { method: 'DELETE' }),
    checkout: (id: number | string, body: unknown) =>
      api(`${base}/${id}/checkout`, { method: 'POST', json: body }),
    checkin: (id: number | string, body: unknown) =>
      api(`${base}/${id}/checkin`, { method: 'POST', json: body }),
  }
}

export const accessoriesApi = makeQtyApi('/accessories')
export const consumablesApi = makeQtyApi('/consumables')
export const componentsApi = makeQtyApi('/components')

export const kitsApi = {
  list: () => api<ApiList<Record<string, unknown>>>('/kits'),
  get: (id: number | string) => api<Record<string, unknown>>(`/kits/${id}`),
  create: (body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/kits', {
      method: 'POST',
      json: body,
    }),
}
