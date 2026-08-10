import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import AppLayout from '../../layout/AppLayout'
import { AppSelect, Box, DataTable, DateField, Field, PageForm } from '../../components/ui'
import { ModuleInsights } from '../../components/ModuleInsights'
import { DetailLayout, DetailPanel } from '../../components/DetailLayout'
import { MasterSelect, masterPayloadId } from '../../components/MasterSelect'
import {
  dashboardApi,
  hardwareApi,
  licensesApi,
  mastersApi,
  usersApi,
  type SelectOption,
} from '../../api/client'
import { formatINR } from '../../utils/money'
import { useToast } from '../../components/Toast'

function nestId(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'object' && v && 'id' in v) return String((v as { id: number }).id ?? '')
  return String(v)
}

function nestName(v: unknown): string {
  if (v && typeof v === 'object' && 'name' in v) return String((v as { name?: string }).name || '—')
  return v != null && v !== '' ? String(v) : '—'
}

function dateVal(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && v && 'date' in v) return String((v as { date: string }).date || '')
  return String(v).slice(0, 10)
}

type FormState = {
  name: string
  product_key: string
  seats: string
  manufacturer_id: string
  company_id: string
  category_id: string
  expiration_date: string
  purchase_date: string
  purchase_cost: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  product_key: '',
  seats: '1',
  manufacturer_id: '',
  company_id: '',
  category_id: '',
  expiration_date: '',
  purchase_date: '',
  purchase_cost: '',
  notes: '',
}

export function LicensesList() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<SelectOption[]>([])
  const [dash, setDash] = useState<Record<string, number>>({})

  const load = () => {
    setLoading(true)
    licensesApi
      .list({ search: q || undefined, company_id: companyId || undefined, limit: 200 })
      .then((r) => {
        setRows(r.rows || [])
        setTotal(r.total || 0)
      })
      .catch(() => {
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    mastersApi.companies().then((c) => setCompanies(c.results || [])).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    dashboardApi
      .counts({ company_id: companyId || undefined, search: q || undefined })
      .then((c) => {
        if (!cancelled) setDash(c as Record<string, number>)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [companyId, q])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q, companyId])

  return (
    <AppLayout title="Licenses" subtitle={loading ? 'Loading…' : `${total} licenses`}>
      <ModuleInsights
        title="License insights"
        cards={[
          { label: 'Products', value: dash.licenses ?? total, tone: 'teal' },
          { label: 'Licenses assigned', value: dash.licenses_assigned ?? 0, tone: 'amber' },
          { label: 'Licenses available', value: dash.licenses_available ?? 0, tone: 'default' },
        ]}
      />
      <Box
        title="Licenses"
        tools={<Link to="/licenses/create" className="btn btn-primary btn-sm"><i className="fas fa-plus icon-white" /> Create New</Link>}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', maxWidth: 280 }}>
          <AppSelect
            value={companyId}
            onChange={setCompanyId}
            searchable
            options={[
              { value: '', label: 'All companies' },
              ...companies.map((c) => ({ value: String(c.id), label: c.text })),
            ]}
          />
        </div>
        <DataTable
          search={q}
          onSearch={setQ}
          rows={rows}
          exportName="licenses"
          storageKey="licenses_columns"
          onRefresh={load}
          onBulkDelete={async (ids) => {
            for (const id of ids) await licensesApi.remove(id)
          }}
          columns={[
            { key: 'name', label: 'Name', render: (r) => <Link to={`/licenses/${r.id}`}>{String(r.name)}</Link> },
            { key: 'product_key', label: 'Product Key' },
            { key: 'seats', label: 'Licenses' },
            {
              key: 'assigned',
              label: 'Assigned',
              render: (r) => String(
                r.assigned
                ?? Math.max(0, Number(r.seats) - Number(r.remaining ?? r.free_seats_count ?? 0)),
              ),
            },
            {
              key: 'remaining',
              label: 'Available',
              render: (r) => (
                <span className={Number(r.remaining) === 0 ? 'text-danger' : ''}>{String(r.remaining ?? r.free_seats_count ?? 0)}</span>
              ),
            },
            { key: 'manufacturer', label: 'Manufacturer', exportValue: (r) => nestName(r.manufacturer), render: (r) => nestName(r.manufacturer) },
            { key: 'company', label: 'Company', exportValue: (r) => nestName(r.company), render: (r) => nestName(r.company) },
            {
              key: 'expiration_date',
              label: 'Expiration',
              exportValue: (r) => dateVal(r.expiration_date),
              render: (r) => dateVal(r.expiration_date) || '—',
            },
            {
              key: 'purchase_cost',
              label: 'Cost (INR)',
              exportValue: (r) => String(r.purchase_cost ?? ''),
              render: (r) => formatINR(r.purchase_cost),
            },
            {
              key: 'actions',
              label: 'Actions',
              exportable: false,
              render: (r) => (
                <span className="actions">
                  <Link to={`/licenses/${r.id}/checkout`} className="btn btn-sm btn-info" title="Assign"><i className="fas fa-user-plus" /></Link>
                  <Link to={`/licenses/${r.id}/edit`} className="btn btn-sm btn-warning"><i className="fas fa-pencil-alt" /></Link>
                </span>
              ),
            },
          ]}
        />
      </Box>
    </AppLayout>
  )
}

export function LicenseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [lic, setLic] = useState<Record<string, unknown> | null>(null)
  const [seats, setSeats] = useState<Record<string, unknown>[]>([])
  const [tab, setTab] = useState('details')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    if (!id) return
    licensesApi.get(id).then(setLic).catch(() => setLic(null))
    licensesApi.seats(id).then((r) => setSeats(r.rows || [])).catch(() => setSeats([]))
  }

  useEffect(load, [id])

  const remove = async () => {
    if (!id || !confirm('Delete this license?')) return
    setBusy(true)
    try {
      await licensesApi.remove(id)
      toast.success('License deleted')
      navigate('/licenses')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const unassign = async (seatId: number) => {
    if (!id) return
    setBusy(true)
    setMsg('')
    try {
      await licensesApi.checkin(id, { seat_id: seatId })
      setMsg('License unassigned')
      toast.success('License unassigned')
      load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Unassign failed')
    } finally {
      setBusy(false)
    }
  }

  if (!lic) {
    return (
      <AppLayout title="License">
        <Box title="License"><p className="text-muted">Loading…</p></Box>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={String(lic.name)}>
      {msg ? <div className="callout callout-success"><p>{msg}</p></div> : null}
      <DetailLayout
        title={String(lic.name)}
        backTo="/licenses"
        status={`${String(lic.remaining ?? lic.free_seats_count ?? 0)} available`}
        meta={[
          { label: 'Licenses', value: String(lic.seats) },
          { label: 'Manufacturer', value: nestName(lic.manufacturer) },
          { label: 'Expires', value: dateVal(lic.expiration_date) || '—' },
        ]}
        actions={(
          <>
            <Link to={`/licenses/${lic.id}/checkout`} className="btn btn-info btn-sm"><i className="fas fa-user-plus" /> Assign</Link>
            <Link to={`/licenses/${lic.id}/edit`} className="btn btn-warning btn-sm"><i className="fas fa-pencil-alt" /> Edit</Link>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => { void remove() }}>
              <i className="fas fa-trash" /> Delete
            </button>
          </>
        )}
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'seats', label: 'Licenses' },
          { id: 'history', label: 'History' },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        fields={tab === 'details' ? [
          { label: 'Name', value: String(lic.name) },
          { label: 'Product Key', value: String(lic.product_key || '—') },
          { label: 'Licenses', value: String(lic.seats) },
          { label: 'Available', value: String(lic.remaining ?? lic.free_seats_count ?? 0) },
          { label: 'Manufacturer', value: nestName(lic.manufacturer) },
          { label: 'Company', value: nestName(lic.company) },
          { label: 'Expiration', value: dateVal(lic.expiration_date) || '—' },
          { label: 'Purchase Cost', value: formatINR(lic.purchase_cost) },
          { label: 'Notes', value: String(lic.notes || '—'), full: true },
        ] : undefined}
      >
        {tab === 'seats' && (
          <DetailPanel title="Licenses">
            <table className="table table-striped">
              <thead><tr><th>#</th><th>Assigned To</th><th>Asset</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {seats.length === 0 ? (
                  <tr><td colSpan={5} className="text-muted">No licenses recorded</td></tr>
                ) : seats.map((s, i) => {
                  const assigned = s.assigned_to || s.asset_id
                  return (
                    <tr key={String(s.id)}>
                      <td>{i + 1}</td>
                      <td>{s.user_name ? String(s.user_name) : <span className="text-muted">Unassigned</span>}</td>
                      <td>{s.asset_tag ? String(s.asset_tag) : '—'}</td>
                      <td>{String(s.notes || '—')}</td>
                      <td>
                        {assigned
                          ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => { void unassign(Number(s.id)) }}>Unassign</button>
                          : <Link to={`/licenses/${lic.id}/checkout`} className="btn btn-sm btn-info">Assign</Link>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DetailPanel>
        )}
        {tab === 'history' && (
          <DetailPanel title="History">
            <p className="text-muted mb-0">License assignment history appears under Reports → Activity.</p>
          </DetailPanel>
        )}
      </DetailLayout>
    </AppLayout>
  )
}

export function LicenseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = Boolean(id)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  const [companies, setCompanies] = useState<SelectOption[]>([])
  const [manufacturers, setManufacturers] = useState<SelectOption[]>([])
  const [categories, setCategories] = useState<SelectOption[]>([])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    Promise.all([mastersApi.companies(), mastersApi.manufacturers(), mastersApi.categories()])
      .then(([c, m, cat]) => {
        setCompanies(c.results || [])
        setManufacturers(m.results || [])
        setCategories(cat.results || [])
        if (!isEdit) {
          setForm((f) => ({
            ...f,
            company_id: f.company_id || (c.results?.[0] ? String(c.results[0].id) : ''),
          }))
        }
      })
      .catch(() => undefined)
  }, [isEdit])

  useEffect(() => {
    if (!isEdit || !id) return
    licensesApi
      .get(id)
      .then((lic) => {
        setForm({
          name: String(lic.name || ''),
          product_key: String(lic.product_key || ''),
          seats: String(lic.seats ?? 1),
          manufacturer_id: nestId(lic.manufacturer),
          company_id: nestId(lic.company),
          category_id: nestId(lic.category),
          expiration_date: dateVal(lic.expiration_date),
          purchase_date: dateVal(lic.purchase_date),
          purchase_cost: lic.purchase_cost != null ? String(lic.purchase_cost) : '',
          notes: String(lic.notes || ''),
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const submit = async () => {
    setBusy(true)
    setError('')
    const body = {
      name: form.name.trim(),
      product_key: form.product_key || null,
      seats: Number(form.seats) || 1,
      manufacturer_id: form.manufacturer_id ? Number(form.manufacturer_id) : null,
      company_id: form.company_id ? Number(form.company_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      expiration_date: form.expiration_date || null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      notes: form.notes || null,
    }
    try {
      if (isEdit && id) {
        await licensesApi.update(id, body)
        toast.success('License updated')
        navigate(`/licenses/${id}`)
      } else {
        const res = await licensesApi.create(body)
        const newId = res.payload?.id
        toast.success('License created')
        navigate(newId != null ? `/licenses/${newId}` : '/licenses')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout title="License">
        <Box title="License"><p className="text-muted">Loading…</p></Box>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={isEdit ? 'Update License' : 'Create License'}>
      {error ? <p className="text-danger">{error}</p> : null}
      <PageForm
        cancelTo={isEdit ? `/licenses/${id}` : '/licenses'}
        onSubmit={() => { void submit() }}
        submitLabel={busy ? 'Saving…' : isEdit ? 'Update' : 'Create'}
        submitDisabled={busy}
      >
        <Field label="Software Name" required>
          <input className="form-control" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="Product Key">
          <input className="form-control" value={form.product_key} onChange={(e) => set('product_key', e.target.value)} />
        </Field>
        <Field label="Licenses" required>
          <input type="number" min={1} className="form-control" value={form.seats} onChange={(e) => set('seats', e.target.value)} required />
        </Field>

        <MasterSelect
          label="Manufacturer"
          value={form.manufacturer_id}
          options={manufacturers}
          onChange={(v) => set('manufacturer_id', v)}
          onOptionsChange={setManufacturers}
          emptyLabel="— Select manufacturer —"
          create={async (name) => {
            const res = await mastersApi.createManufacturer({ name })
            return masterPayloadId(res, name)
          }}
        />

        <MasterSelect
          label="Company"
          required
          value={form.company_id}
          options={companies}
          onChange={(v) => set('company_id', v)}
          onOptionsChange={setCompanies}
          allowEmpty={false}
          emptyLabel="Select company…"
          create={async (name) => {
            const res = await mastersApi.createCompany({ name })
            return masterPayloadId(res, name)
          }}
        />

        <MasterSelect
          label="Category"
          value={form.category_id}
          options={categories}
          onChange={(v) => set('category_id', v)}
          onOptionsChange={setCategories}
          emptyLabel="— Select category —"
          create={async (name) => {
            const res = await mastersApi.createCategory({ name, category_type: 'license' })
            return masterPayloadId(res, name)
          }}
        />

        <Field label="Expiration Date">
          <DateField value={form.expiration_date} onChange={(v) => set('expiration_date', v)} />
        </Field>
        <Field label="Purchase Date">
          <DateField value={form.purchase_date} onChange={(v) => set('purchase_date', v)} />
        </Field>
        <Field label="Purchase Cost (INR)">
          <input type="number" className="form-control" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} placeholder="e.g. 125000" />
        </Field>
        <Field label="Notes">
          <textarea className="form-control" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </PageForm>
    </AppLayout>
  )
}

export function LicenseCheckout() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [lic, setLic] = useState<Record<string, unknown> | null>(null)
  const [target, setTarget] = useState<'user' | 'asset'>('user')
  const [userId, setUserId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [note, setNote] = useState('')
  const [users, setUsers] = useState<SelectOption[]>([])
  const [assets, setAssets] = useState<SelectOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    licensesApi.get(id).then(setLic).catch(() => setLic(null))
    usersApi.list({ limit: 200 }).then((r) => {
      setUsers((r.rows || []).map((u) => ({
        id: Number(u.id),
        text: String(u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()),
      })))
    }).catch(() => undefined)
    hardwareApi.list({ limit: 200 }).then((r) => {
      setAssets((r.rows || []).map((a) => ({
        id: Number(a.id),
        text: `${a.asset_tag || ''} ${a.name || ''}`.trim(),
      })))
    }).catch(() => undefined)
  }, [id])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!id) return
    setBusy(true)
    setError('')
    try {
      await licensesApi.checkout(id, {
        assigned_user: target === 'user' && userId ? Number(userId) : null,
        asset_id: target === 'asset' && assetId ? Number(assetId) : null,
        note: note || null,
      })
      toast.success('License assigned')
      navigate(`/licenses/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  if (!lic) {
    return (
      <AppLayout title="Assign License">
        <Box title="Assign"><p className="text-muted">Loading…</p></Box>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Assign License" subtitle={String(lic.name)}>
      <Box title="Assign" type="primary">
        {error ? <p className="text-danger">{error}</p> : null}
        <form className="form-horizontal" onSubmit={(e) => { void submit(e) }}>
          <Field label="Assign to">
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              {(['user', 'asset'] as const).map((t) => (
                <label key={t} className="radio">
                  <input type="radio" checked={target === t} onChange={() => setTarget(t)} /> {t === 'user' ? 'App User' : 'Asset'}
                </label>
              ))}
            </div>
            {target === 'user' ? (
              <select className="form-control" value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">Select user…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.text}</option>)}
              </select>
            ) : (
              <select className="form-control" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="">Select asset…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.text}</option>)}
              </select>
            )}
          </Field>
          <Field label="Notes"><textarea className="form-control" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button type="submit" className="btn btn-theme" disabled={busy}>{busy ? 'Assigning…' : 'Assign'}</button>{' '}
          <Link to={`/licenses/${lic.id}`} className="btn btn-default">Cancel</Link>
        </form>
      </Box>
    </AppLayout>
  )
}
