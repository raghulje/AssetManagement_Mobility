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
  nextTag: (params: {
    company_id?: string | number
    legal_entity_id?: string | number
    category_id?: string | number
  }) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v))
    })
    return api<{ asset_tag: string; prefix: string; sequence: number }>(`/hardware/next-tag?${q}`)
  },
  create: (body: unknown) => api('/hardware', { method: 'POST', json: body }),
  update: (id: number | string, body: unknown) => api(`/hardware/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) => api(`/hardware/${id}`, { method: 'DELETE' }),
  checkout: (id: number | string, body: unknown) => api(`/hardware/${id}/checkout`, { method: 'POST', json: body }),
  checkin: (id: number | string, body: unknown) => api(`/hardware/${id}/checkin`, { method: 'POST', json: body }),
  replace: (id: number | string, body: { new_asset_id: number; reason: string }) =>
    api(`/hardware/${id}/replace`, { method: 'POST', json: body }),
  // Audit feature — UI routes commented out; keep API helper for later
  audit: (id: number | string, body: unknown) => api(`/hardware/${id}/audit`, { method: 'POST', json: body }),
  history: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/hardware/${id}/history`),
  maintenances: (id: number | string) =>
    api<ApiList<Record<string, unknown>>>(`/maintenances?asset_id=${encodeURIComponent(String(id))}`),
  agentStatus: (id: number | string) => api<Record<string, unknown>>(`/hardware/${id}/agent`),
  agentScan: (id: number | string, body: { command?: 'scan' | 'rerun' } = {}) =>
    api(`/hardware/${id}/agent/scan`, { method: 'POST', json: body }),
  agentSnapshots: (id: number | string, limit = 20) =>
    api<ApiList<Record<string, unknown>>>(`/hardware/${id}/agent/snapshots?limit=${limit}`),
  agentSyncLogs: (params: { limit?: number; search?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    if (params.search) q.set('search', params.search)
    return api<ApiList<Record<string, unknown>>>(`/hardware/agent-sync-logs?${q}`)
  },
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
  activity: (qs = '') => api<ApiList<Record<string, unknown>>>(`/reports/activity${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
  activityFiltered: (qs: string) => api<ApiList<Record<string, unknown>>>(`/reports/activity?${qs}`),
  fleetAudit: (qs: string) => api<ApiList<Record<string, unknown>>>(`/reports/fleet-audit?${qs}`),
}

export type SelectOption = { id: number; text: string; code?: string | null; company_id?: number }

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

export const groupsApi = {
  catalog: () => api<{ modules: string[]; module_actions: Record<string, string[]>; keys: Array<{ key: string; module: string; action: string; label: string }> }>('/groups/catalog'),
  list: () => api<ApiList<Record<string, unknown>>>('/groups'),
  get: (id: number | string) => api<Record<string, unknown>>(`/groups/${id}`),
  create: (body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/groups', { method: 'POST', json: body }),
  update: (id: number | string, body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/groups/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/groups/${id}`, { method: 'DELETE' }),
  setMembers: (id: number | string, user_ids: number[]) =>
    api(`/groups/${id}/members`, { method: 'PUT', json: { user_ids } }),
  setUserRoles: (userId: number | string, group_ids: number[]) =>
    api(`/groups/users/${userId}/roles`, { method: 'PUT', json: { group_ids } }),
}

export const mastersApi = {
  companies: (search?: string) =>
    api<{ results: SelectOption[] }>(`/companies/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  legalEntities: (companyId?: string | number, search?: string) => {
    const q = new URLSearchParams()
    if (companyId != null && companyId !== '') q.set('company_id', String(companyId))
    if (search) q.set('search', search)
    const s = q.toString()
    return api<{ results: SelectOption[] }>(`/legal-entities/selectlist${s ? `?${s}` : ''}`)
  },
  departments: (search?: string) =>
    api<{ results: SelectOption[] }>(`/departments/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  locations: (search?: string) =>
    api<{ results: SelectOption[] }>(`/locations/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  models: (search?: string, categoryId?: string | number) => {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (categoryId != null && categoryId !== '') q.set('category_id', String(categoryId))
    const s = q.toString()
    return api<{ results: SelectOption[] }>(`/models/selectlist${s ? `?${s}` : ''}`)
  },
  statuslabels: () => api<{ results: SelectOption[] }>('/statuslabels/selectlist'),
  suppliers: (search?: string) =>
    api<{ results: SelectOption[] }>(`/suppliers/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  categories: (search?: string, categoryType?: string) => {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (categoryType) q.set('category_type', categoryType)
    const s = q.toString()
    return api<{ results: SelectOption[] }>(`/categories/selectlist${s ? `?${s}` : ''}`)
  },
  /** Hardware asset types: Laptop, Desktop, Tablet, Mobile, … */
  assetTypes: (search?: string) => mastersApi.categories(search, 'asset'),
  manufacturers: (search?: string) =>
    api<{ results: SelectOption[] }>(`/manufacturers/selectlist${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  listCompanies: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/companies?${q}`)
  },
  createCompany: (body: { name: string; code?: string | null; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: { id: number; name: string; code?: string | null } }>('/companies', {
      method: 'POST',
      json: body,
    }),
  updateCompany: (id: number | string, body: { name?: string; code?: string | null; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/companies/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeCompany: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/companies/${id}`, { method: 'DELETE' }),

  listLegalEntities: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return api<ApiList<Record<string, unknown>>>(`/legal-entities?${q}`)
  },
  createLegalEntity: (body: { company_id: number; code: string; name?: string | null; notes?: string | null }) =>
    api<{ status: string; messages: string[]; payload: { id: number } }>('/legal-entities', {
      method: 'POST',
      json: body,
    }),
  updateLegalEntity: (id: number | string, body: Record<string, unknown>) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/legal-entities/${id}`, {
      method: 'PUT',
      json: body,
    }),
  removeLegalEntity: (id: number | string) =>
    api<{ status: string; messages: string[] }>(`/legal-entities/${id}`, { method: 'DELETE' }),

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
  invoices: (id: number | string) => api<ApiList<Record<string, unknown>>>(`/licenses/${id}/invoices`),
  addInvoicePeriod: (id: number | string) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/licenses/${id}/invoices`, {
      method: 'POST',
      json: {},
    }),
  updateInvoice: (invoiceId: number | string, body: unknown) =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`/licenses/invoices/${invoiceId}`, {
      method: 'PUT',
      json: body,
    }),
  removeInvoice: (invoiceId: number | string) =>
    api<{ status: string; messages: string[] }>(`/licenses/invoices/${invoiceId}`, { method: 'DELETE' }),
  uploadInvoiceFile: async (invoiceId: number | string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const t = localStorage.getItem('refex_token')
    const res = await fetch(`${getApiBase()}/license_invoices/${invoiceId}/files?kind=invoice`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error((data.messages || []).join(', ') || 'Upload failed')
    return data
  },
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
