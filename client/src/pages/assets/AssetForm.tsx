import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AppLayout from '../../layout/AppLayout'
import { DateField, Field, FileInput, PageForm } from '../../components/ui'
import { MasterSelect, masterPayloadId } from '../../components/MasterSelect'
import AssetAttachments, {
  uploadAssetFile,
  type PendingAttachment,
} from '../../components/AssetAttachments'
import { hardwareApi, mastersApi, type SelectOption } from '../../api/client'
import { assetImageSrc, getApiBase } from '../../api/baseUrl'
import { employeesApi } from '../../api/employees'
import { useToast } from '../../components/Toast'

type FormState = {
  company_id: string
  department_id: string
  asset_tag: string
  serial: string
  model_id: string
  status_id: string
  rtd_location_id: string
  supplier_id: string
  purchase_date: string
  purchase_cost: string
  order_number: string
  warranty_months: string
  asset_eol_date: string
  notes: string
  assign_employee_id: string
}

const empty: FormState = {
  company_id: '',
  department_id: '',
  asset_tag: '',
  serial: '',
  model_id: '',
  status_id: '',
  rtd_location_id: '',
  supplier_id: '',
  purchase_date: '',
  purchase_cost: '',
  order_number: '',
  warranty_months: '12',
  asset_eol_date: '',
  notes: '',
  assign_employee_id: '',
}

function nestId(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'object' && v && 'id' in v) return String((v as { id: number }).id ?? '')
  return String(v)
}

function dateVal(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'object' && v && 'date' in v) return String((v as { date: string }).date || '').slice(0, 10)
  return String(v).slice(0, 10)
}

export default function AssetForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const isEdit = Boolean(id)
  const fromEmployeeId = params.get('from') === 'employee' ? params.get('employee_id') : null
  const returnQs = useMemo(() => {
    if (!fromEmployeeId) return ''
    return `?from=employee&employee_id=${encodeURIComponent(fromEmployeeId)}`
  }, [fromEmployeeId])
  const assetReturnPath = id
    ? (fromEmployeeId ? `/employees/${fromEmployeeId}` : `/hardware/${id}${returnQs}`)
    : '/hardware'
  const [tab, setTab] = useState<'details' | 'attachments'>('details')
  const [form, setForm] = useState<FormState>(empty)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [empSearch, setEmpSearch] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageMsg, setImageMsg] = useState('')

  const [companies, setCompanies] = useState<SelectOption[]>([])
  const [departments, setDepartments] = useState<SelectOption[]>([])
  const [locations, setLocations] = useState<SelectOption[]>([])
  const [models, setModels] = useState<SelectOption[]>([])
  const [statuses, setStatuses] = useState<SelectOption[]>([])
  const [suppliers, setSuppliers] = useState<SelectOption[]>([])
  const [employees, setEmployees] = useState<SelectOption[]>([])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    Promise.all([
      mastersApi.companies(),
      mastersApi.departments(),
      mastersApi.locations(),
      mastersApi.models(),
      mastersApi.statuslabels(),
      mastersApi.suppliers(),
    ])
      .then(([c, d, l, m, s, sup]) => {
        setCompanies(c.results || [])
        setDepartments(d.results || [])
        setLocations(l.results || [])
        setModels(m.results || [])
        setStatuses(s.results || [])
        setSuppliers(sup.results || [])
        if (!isEdit) {
          setForm((f) => ({
            ...f,
            company_id: f.company_id || (c.results?.[0] ? String(c.results[0].id) : ''),
            department_id: f.department_id || '',
            rtd_location_id: f.rtd_location_id || (l.results?.[0] ? String(l.results[0].id) : ''),
            model_id: f.model_id || (m.results?.[0] ? String(m.results[0].id) : ''),
            status_id: f.status_id || (s.results?.[0] ? String(s.results[0].id) : ''),
          }))
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [isEdit])

  useEffect(() => {
    employeesApi
      .selectlist(empSearch || undefined)
      .then((r) => setEmployees(r.results || []))
      .catch(() => setEmployees([]))
  }, [empSearch])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    hardwareApi
      .get(id)
      .then((a) => {
        setForm({
          company_id: nestId(a.company),
          department_id: nestId(a.department),
          asset_tag: String(a.asset_tag || ''),
          serial: String(a.serial || ''),
          model_id: nestId(a.model),
          status_id: nestId(a.status),
          rtd_location_id: nestId(a.rtd_location) || nestId(a.location),
          supplier_id: nestId(a.supplier),
          purchase_date: dateVal(a.purchase_date),
          purchase_cost: a.purchase_cost != null ? String(a.purchase_cost) : '',
          order_number: String(a.order_number || ''),
          warranty_months: a.warranty_months != null ? String(a.warranty_months) : '12',
          asset_eol_date: dateVal(a.asset_eol_date),
          notes: String(a.notes || ''),
          assign_employee_id: '',
        })
        setImagePath(a.image ? String(a.image) : null)
        setImageUrl(a.image_url ? String(a.image_url) : null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!pendingImage) {
      setPendingImagePreview(null)
      return
    }
    const url = URL.createObjectURL(pendingImage)
    setPendingImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingImage])

  const uploadImage = async (file: File, assetId: string | number = id || '') => {
    if (!assetId) return
    setImageBusy(true)
    setImageMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const t = localStorage.getItem('refex_token')
      const res = await fetch(`${getApiBase()}/hardware/${assetId}/files?kind=image`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data.messages || []).join(', ') || 'Upload failed')
      const a = await hardwareApi.get(assetId)
      setImagePath(a.image ? String(a.image) : null)
      setImageUrl(a.image_url ? String(a.image_url) : (data?.payload?.url ? String(data.payload.url) : null))
      setPendingImage(null)
      setImageMsg('Image uploaded')
      toast.success('Image uploaded')
    } catch (e) {
      setImageMsg(e instanceof Error ? e.message : 'Upload failed')
      toast.error(e instanceof Error ? e.message : 'Upload failed')
      throw e
    } finally {
      setImageBusy(false)
    }
  }

  const onPickImage = (f: File | null) => {
    if (!f) return
    if (isEdit && id) {
      void uploadImage(f)
      return
    }
    setPendingImage(f)
    setImageMsg(`${f.name} queued — will upload when you create the asset`)
  }

  const submit = async () => {
    setError('')
    if (!form.asset_tag || !form.model_id || !form.status_id) {
      setError('Asset tag, model, and status are required')
      setTab('details')
      return
    }
    setBusy(true)
    try {
      const body = {
        asset_tag: form.asset_tag.trim(),
        serial: form.serial || null,
        model_id: Number(form.model_id),
        status_id: Number(form.status_id),
        company_id: form.company_id ? Number(form.company_id) : null,
        department_id: form.department_id ? Number(form.department_id) : null,
        rtd_location_id: form.rtd_location_id ? Number(form.rtd_location_id) : null,
        location_id: form.rtd_location_id ? Number(form.rtd_location_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
        order_number: form.order_number || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        asset_eol_date: form.asset_eol_date || null,
        notes: form.notes || null,
      }

      if (isEdit && id) {
        await hardwareApi.update(id, body)
        toast.success('Asset updated')
        navigate(fromEmployeeId ? `/employees/${fromEmployeeId}` : `/hardware/${id}${returnQs}`)
        return
      }

      const created = await hardwareApi.create(body) as {
        payload?: { id?: number }
        id?: number
      }
      const newId = Number(created.payload?.id || created.id)
      if (newId && form.assign_employee_id) {
        await hardwareApi.checkout(newId, {
          checkout_to_type: 'employee',
          assigned_employee: Number(form.assign_employee_id),
        })
      }
      if (newId && pendingFiles.length) {
        for (const p of pendingFiles) {
          await uploadAssetFile(newId, p.file, p.kind)
        }
      }
      if (newId && pendingImage) {
        try {
          await uploadImage(pendingImage, newId)
        } catch {
          toast.error('Asset created, but image upload failed — use Edit to retry')
        }
      }
      toast.success(form.assign_employee_id ? 'Asset created and assigned' : 'Asset created')
      navigate(newId ? `/hardware/${newId}` : '/hardware')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout title={isEdit ? 'Update Asset' : 'Create Asset'}>
        <p className="text-muted">Loading…</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={isEdit ? 'Update Asset' : 'Create Asset'} subtitle="Company, department & location masters">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}

      <div className="nav-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={tab === 'details' ? 'active' : ''}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'attachments'}
          className={tab === 'attachments' ? 'active' : ''}
          onClick={() => setTab('attachments')}
        >
          Attachments
          {!isEdit && pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ''}
        </button>
      </div>

      {tab === 'details' && (
        <PageForm
          cancelTo={isEdit ? assetReturnPath : '/hardware'}
          onSubmit={() => { void submit() }}
          submitLabel={busy ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          submitDisabled={busy}
        >
          <MasterSelect
            label="Company"
            required
            value={form.company_id}
            options={companies}
            onChange={(v) => set('company_id', v)}
            onOptionsChange={setCompanies}
            allowEmpty={false}
            emptyLabel="Select company…"
            help="HRMS-synced or add a new company here / under Settings → Companies"
            create={async (name) => {
              const res = await mastersApi.createCompany({ name })
              return masterPayloadId(res, name)
            }}
          />

          <MasterSelect
            label="Department"
            value={form.department_id}
            options={departments}
            onChange={(v) => set('department_id', v)}
            onOptionsChange={setDepartments}
            emptyLabel="— Select department —"
            help="From HRMS department names, or add manually"
            create={async (name) => {
              const res = await mastersApi.createDepartment({
                name,
                company_id: form.company_id ? Number(form.company_id) : null,
              })
              return masterPayloadId(res, name)
            }}
          />

          <MasterSelect
            label="Default Location"
            required
            value={form.rtd_location_id}
            options={locations}
            onChange={(v) => set('rtd_location_id', v)}
            onOptionsChange={setLocations}
            allowEmpty={false}
            emptyLabel="Select location…"
            help="HRMS-synced locations (e.g. Refex Tower-Nungambakkam) or add a new one"
            create={async (name) => {
              const res = await mastersApi.createLocation({
                name,
                company_id: form.company_id ? Number(form.company_id) : null,
              })
              return masterPayloadId(res, name)
            }}
          />

          <Field label="Asset Tag" required>
            <input
              className="form-control"
              value={form.asset_tag}
              onChange={(e) => set('asset_tag', e.target.value)}
              required
              disabled={isEdit}
            />
          </Field>

          <Field label="Serial">
            <input className="form-control" value={form.serial} onChange={(e) => set('serial', e.target.value)} />
          </Field>

          <MasterSelect
            label="Model"
            required
            value={form.model_id}
            options={models}
            onChange={(v) => set('model_id', v)}
            onOptionsChange={setModels}
            allowEmpty={false}
            emptyLabel="Select model…"
            help="Add a new asset model here, or manage under Masters → Asset Models"
            create={async (name) => {
              const res = await mastersApi.createModel({ name })
              return masterPayloadId(res, name)
            }}
          />

          <Field label="Status" required>
            <select
              className="form-control"
              value={form.status_id}
              onChange={(e) => set('status_id', e.target.value)}
              required
            >
              <option value="">Select status…</option>
              {statuses.map((o) => (
                <option key={o.id} value={o.id}>{o.text}</option>
              ))}
            </select>
          </Field>

          {!isEdit && (
            <Field label="Assign to Employee (optional)">
              <input
                className="form-control"
                style={{ marginBottom: 8 }}
                placeholder="Search employees…"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
              />
              <select
                className="form-control"
                value={form.assign_employee_id}
                onChange={(e) => set('assign_employee_id', e.target.value)}
              >
                <option value="">— Do not assign yet —</option>
                {employees.map((o) => (
                  <option key={o.id} value={o.id}>{o.text}</option>
                ))}
              </select>
              <p className="help-block">Assigns this asset to the HRMS employee after create</p>
            </Field>
          )}

          <MasterSelect
            label="Supplier / Vendor"
            value={form.supplier_id}
            options={suppliers}
            onChange={(v) => set('supplier_id', v)}
            onOptionsChange={setSuppliers}
            emptyLabel="— Select supplier —"
            help="Add a vendor here, or manage / import under Masters → Suppliers"
            create={async (name) => {
              const res = await mastersApi.createSupplier({ name })
              return masterPayloadId(res, name)
            }}
          />

          <Field label="Purchase Date">
            <DateField
              value={form.purchase_date}
              onChange={(v) => set('purchase_date', v)}
            />
          </Field>

          <Field label="Purchase Cost (INR)">
            <input
              type="number"
              className="form-control"
              value={form.purchase_cost}
              onChange={(e) => set('purchase_cost', e.target.value)}
              placeholder="e.g. 45000"
            />
          </Field>

          <Field label="Order Number">
            <input
              className="form-control"
              value={form.order_number}
              onChange={(e) => set('order_number', e.target.value)}
            />
          </Field>

          <Field label="Warranty (months)">
            <input
              type="number"
              className="form-control"
              value={form.warranty_months}
              onChange={(e) => set('warranty_months', e.target.value)}
            />
          </Field>

          <Field label="EOL Date">
            <DateField
              value={form.asset_eol_date}
              onChange={(v) => set('asset_eol_date', v)}
              placeholder="Optional EOL date"
            />
            <span className="help-block">Optional override. If empty, EOL is purchase date + model EOL months.</span>
          </Field>

          <Field label="Notes">
            <textarea
              className="form-control"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          <Field label="Asset image">
            {(() => {
              const src = assetImageSrc(imageUrl || imagePath) || pendingImagePreview
              return src ? (
                <img
                  src={src}
                  alt=""
                  style={{ display: 'block', maxWidth: '100%', maxHeight: 200, marginBottom: 10 }}
                />
              ) : (
                <p className="help-block" style={{ marginTop: 0 }}>No image yet</p>
              )
            })()}
            <FileInput
              accept="image/*"
              disabled={imageBusy}
              label={isEdit ? 'Upload image' : 'Choose image'}
              onChange={(f) => onPickImage(f)}
            />
            {imageMsg ? <span className="help-block">{imageMsg}</span> : null}
          </Field>
        </PageForm>
      )}

      {tab === 'attachments' && (
        <>
          <AssetAttachments
            assetId={isEdit ? id : null}
            stagingMode={!isEdit}
            pending={pendingFiles}
            onPendingChange={setPendingFiles}
          />
          <div className="box-footer" style={{ marginTop: 8, padding: '12px 0' }}>
            {isEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-theme"
                  disabled={busy}
                  onClick={() => { void submit() }}
                >
                  <i className="fas fa-check" /> {busy ? 'Saving…' : 'Update'}
                </button>
                {' '}
                <button type="button" className="btn btn-default" onClick={() => setTab('details')}>
                  Back to Details
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-theme"
                  disabled={busy}
                  onClick={() => { void submit() }}
                >
                  <i className="fas fa-check" /> {busy ? 'Saving…' : 'Create asset & upload'}
                </button>
                {' '}
                <button type="button" className="btn btn-default" onClick={() => setTab('details')}>
                  Back to Details
                </button>
              </>
            )}
          </div>
        </>
      )}
    </AppLayout>
  )
}
