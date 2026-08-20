import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { useToast } from '../../components/Toast'
import { VehicleCaptureFrame, captureToFrameProps } from '../../components/VehicleCaptureFrame'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
import { stampGpsOnImage, fetchGpsStaticMapUrl } from '../../lib/stampGpsOnImage'
import { readPrecisePosition, type PrecisePosition } from '../../lib/preciseLocation'
import { assetImageSrc } from '../../api/baseUrl'
import {
  vehiclesApi,
  type Vehicle,
  type VehicleCapture,
  type VehicleMaintenance,
} from '../../api/vehicles'
import { usersApi } from '../../api/client'
import { driversApi } from '../../api/drivers'
import { useAuth } from '../../api/AuthContext'
import VehicleHero from './detail/VehicleHero'
import OverviewTab from './detail/OverviewTab'
import { AppSelect, DateField } from '../../components/formControls'

type Tab = 'overview' | 'captures' | 'attachments' | 'maintenance' | 'history' | 'qr'

type PendingCapture = {
  localId: string
  previewUrl: string
  capturedAt: string
  latitude: number | null
  longitude: number | null
  address: string | null
  uploading?: boolean
  error?: string
}

function formatSqlDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const MAINT_TYPES = ['Repair', 'Service', 'Part Replacement', 'Upgrade', 'Inspection', 'Other']

const MAINT_DETAIL_TYPES = new Set(['Part Replacement', 'Upgrade', 'Other'])

function maintDetailLabel(type: string) {
  if (type === 'Part Replacement') return 'Parts replaced'
  if (type === 'Upgrade') return 'What was upgraded'
  if (type === 'Other') return 'Describe the activity'
  return 'Details'
}

function maintDetailHint(type: string) {
  if (type === 'Part Replacement') return 'List the parts that were replaced (e.g. brake pads, battery module).'
  if (type === 'Upgrade') return 'Describe exactly what was upgraded (e.g. software version, charger, seats).'
  if (type === 'Other') return 'Describe what maintenance was performed.'
  return ''
}

export default function VehicleDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const navigate = useNavigate()
  const toast = useToast()
  const { can, isAdmin } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  const assignRef = useRef<HTMLElement | null>(null)

  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [captures, setCaptures] = useState<VehicleCapture[]>([])
  const [pending, setPending] = useState<PendingCapture[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([])
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [users, setUsers] = useState<Array<{ id: number; text?: string; name?: string }>>([])
  const [drivers, setDrivers] = useState<Array<{ id: number; text: string; name?: string; phone?: string | null }>>([])
  const [assignTargetType, setAssignTargetType] = useState<'driver' | 'user'>('driver')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachKind, setAttachKind] = useState('invoice')
  const [assignUserId, setAssignUserId] = useState('')
  const [assignDriverId, setAssignDriverId] = useState('')
  const [assignReason, setAssignReason] = useState('')
  const [unassignReason, setUnassignReason] = useState('')
  const [maintForm, setMaintForm] = useState({
    maintenance_type: 'Repair',
    title: '',
    start_date: '',
    completion_date: '',
    cost: '',
    odometer_km: '',
    vendor_name: '',
    parts_replaced: '',
    note: '',
    is_warranty: false,
    set_status: false,
  })

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const v = await vehiclesApi.get(id)
      setVehicle(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vehicle')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!id || !vehicle) return
    if (tab === 'captures' || tab === 'overview') {
      vehiclesApi.captures(id).then((r) => setCaptures(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'attachments') {
      vehiclesApi.listFiles(id).then((r) => setFiles(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'maintenance') {
      vehiclesApi.maintenances(id).then((r) => setMaintenances(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'history') {
      vehiclesApi.history(id).then((r) => setHistory(r.rows || [])).catch(() => undefined)
    }
  }, [id, tab, vehicle])

  useEffect(() => {
    driversApi.select().then((r) => {
      setDrivers((r.rows || []).map((d) => ({
        id: d.id,
        text: d.text,
        name: d.name,
        phone: d.phone,
      })))
    }).catch(() => undefined)
    usersApi.list({ limit: 200 }).then((r) => {
      setUsers((r.rows || []).map((u: Record<string, unknown>) => ({
        id: Number(u.id),
        text: String(u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || u.email || u.id),
      })))
    }).catch(() => undefined)
  }, [])

  async function ensureSession() {
    if (sessionId || !id) return sessionId
    const res = await vehiclesApi.startSession(id)
    const next = Number(res.payload?.id)
    setSessionId(next)
    return next
  }

  async function processFile(file: File, knownPos?: PrecisePosition | null) {
    if (!id) return
    const capturedAtDate = knownPos?.capturedAt || new Date()
    const capturedAt = formatSqlDate(capturedAtDate)
    const previewUrl = URL.createObjectURL(file)
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setPending((p) => [{ localId, previewUrl, capturedAt, latitude: null, longitude: null, address: null, uploading: true }, ...p])
    setBusy(true)
    try {
      const pos = knownPos ?? await readPrecisePosition({ targetAccuracyM: 25, timeoutMs: 18000 })
      let address: string | null = null
      let localityHeader: string | null = null
      const latitude = pos?.latitude ?? null
      const longitude = pos?.longitude ?? null
      const accuracyM = pos?.accuracyM ?? null
      let mapImageUrl: string | null = null
      if (latitude != null && longitude != null) {
        try {
          const geo = await vehiclesApi.reverseGeocode(latitude, longitude)
          address = (typeof geo.address === 'string' ? geo.address : null)
            || (typeof geo.formatted_address === 'string' ? geo.formatted_address : null)
            || null
          localityHeader = typeof geo.locality_header === 'string' ? geo.locality_header : null
        } catch {
          address = `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`
        }
        mapImageUrl = await fetchGpsStaticMapUrl(latitude, longitude, 400)
      }

      const stamped = await stampGpsOnImage(file, {
        capturedAt: capturedAtDate,
        latitude,
        longitude,
        address,
        localityHeader,
        accuracyM,
        vehicleNumber: vehicle?.vehicle_number,
        label: 'GPS Map Camera',
        mapImageUrl,
      })
      if (mapImageUrl) URL.revokeObjectURL(mapImageUrl)
      const stampedPreview = URL.createObjectURL(stamped)
      URL.revokeObjectURL(previewUrl)

      setPending((list) => list.map((item) => (
        item.localId === localId
          ? { ...item, previewUrl: stampedPreview, latitude, longitude, address }
          : item
      )))

      const sid = await ensureSession()
      const uploaded = await vehiclesApi.uploadCapture(id, stamped, {
        captured_at: capturedAt, latitude, longitude, address, session_id: sid,
        filename: stamped.name || `vehicle-${id}-${Date.now()}.jpg`,
      })
      URL.revokeObjectURL(stampedPreview)
      setPending((list) => list.filter((item) => item.localId !== localId))
      setCaptures((list) => [uploaded.payload, ...list])
      setVehicle((v) => (v ? { ...v, captures_count: (v.captures_count || 0) + 1 } : v))
      if (latitude == null) {
        toast.error('Photo saved, but location was missing. Allow Location and capture again.')
      } else {
        toast.success(accuracyM != null ? `GPS photo saved (±${Math.round(accuracyM)} m)` : 'GPS photo saved')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setPending((list) => list.map((item) => (item.localId === localId ? { ...item, uploading: false, error: msg } : item)))
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  async function onAssign() {
    if (!id) return
    const targetId = assignTargetType === 'driver' ? assignDriverId : assignUserId
    if (!targetId) return toast.error(assignTargetType === 'driver' ? 'Select a driver' : 'Select a user')
    setBusy(true)
    try {
      const res = await vehiclesApi.checkout(id, {
        assigned_type: assignTargetType,
        assigned_to: Number(targetId),
        assignment_kind: assignTargetType === 'driver' ? 'Driver' : 'Employee',
        reason: assignReason || 'Assigned',
      })
      setVehicle(res.payload)
      setAssignReason('')
      toast.success('Vehicle assigned')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  async function onUnassign() {
    if (!id) return
    if (!unassignReason.trim()) return toast.error('Reason required')
    setBusy(true)
    try {
      const res = await vehiclesApi.checkin(id, { reason: unassignReason.trim() })
      setVehicle(res.payload)
      setUnassignReason('')
      toast.success('Vehicle unassigned')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unassign failed')
    } finally {
      setBusy(false)
    }
  }

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !id) return
    setBusy(true)
    try {
      await vehiclesApi.uploadFile(id, file, attachKind)
      const r = await vehiclesApi.listFiles(id)
      setFiles(r.rows || [])
      toast.success('Attachment uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function onAddMaint(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !maintForm.title.trim()) return toast.error('Title required')
    if (MAINT_DETAIL_TYPES.has(maintForm.maintenance_type) && !maintForm.parts_replaced.trim()) {
      return toast.error(`${maintDetailLabel(maintForm.maintenance_type)} is required for ${maintForm.maintenance_type}`)
    }
    setBusy(true)
    try {
      await vehiclesApi.addMaintenance(id, {
        ...maintForm,
        cost: maintForm.cost ? Number(maintForm.cost) : null,
        odometer_km: maintForm.odometer_km ? Number(maintForm.odometer_km) : null,
        set_status: maintForm.set_status ? 'maintenance' : undefined,
      })
      const r = await vehiclesApi.maintenances(id)
      setMaintenances(r.rows || [])
      await load()
      setMaintForm((f) => ({ ...f, title: '', parts_replaced: '', note: '', cost: '', odometer_km: '' }))
      toast.success('Maintenance logged')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function refreshQr() {
    if (!id) return
    setBusy(true)
    try {
      const qr = await vehiclesApi.ensureQr(id)
      setVehicle((v) => (v ? {
        ...v,
        qr_token: String(qr.qr_token || v.qr_token),
        qr_url: String(qr.public_url || v.qr_url),
        qr_image_url: String(qr.image_url || v.qr_image_url),
      } : v))
      toast.success('QR ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'QR failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeVehicle() {
    if (!id || !window.confirm('Delete this vehicle?')) return
    await vehiclesApi.remove(id)
    toast.success('Deleted')
    navigate('/vehicles')
  }

  if (loading) {
    return (
      <AppLayout title="Vehicle" hideHeader>
        <div className="vad-page">
          <div className="vad-skel-title vad-skeleton" />
          <div className="vad-skel-line vad-skeleton" style={{ width: '40%' }} />
          <div className="vad-hero vad-skeleton vad-skel-hero" />
          <div className="vad-overview" style={{ marginTop: 8 }}>
            <div className="vad-card vad-skeleton" style={{ height: 220 }} />
            <div className="vad-card vad-skeleton" style={{ height: 220 }} />
            <div className="vad-card vad-skeleton" style={{ height: 220 }} />
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !vehicle) {
    return (
      <AppLayout title="Vehicle" hideHeader>
        <div className="vad-page">
          <div className="vad-error">
            <h2>Unable to load vehicle details</h2>
            <p>{error || 'This vehicle could not be found.'}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => void load()}>Retry</button>
              <Link to="/vehicles" className="btn btn-default">Back to fleet</Link>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  const canEdit = isAdmin || can('assets.edit') || can('assets.create') || can('assets.view')
  const canDelete = isAdmin || can('assets.delete') || can('assets.edit')
  const v = vehicle

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'captures', label: 'Photos', count: v.captures_count || captures.length || 0 },
    { id: 'attachments', label: 'Documents', count: files.length || undefined },
    { id: 'maintenance', label: 'Maintenance', count: v.maintenances_count || maintenances.length || 0 },
    { id: 'history', label: 'Activity' },
    { id: 'qr', label: 'QR / Tags' },
  ]

  const heroImage =
    assetImageSrc(v.primary_image_path)
    || captures[0]?.url
    || null

  const needsMaintDetail = MAINT_DETAIL_TYPES.has(maintForm.maintenance_type)

  function focusAssignment() {
    setTab('overview')
    requestAnimationFrame(() => {
      assignRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function onQuick(action: 'service' | 'inspection' | 'map' | 'rc' | 'activity') {
    if (action === 'service' || action === 'inspection') {
      setMaintForm((f) => ({
        ...f,
        maintenance_type: action === 'inspection' ? 'Inspection' : 'Service',
        title: action === 'inspection' ? 'Inspection' : 'Scheduled service',
      }))
      setTab('maintenance')
      return
    }
    if (action === 'activity') {
      setTab('history')
      return
    }
    if (action === 'map') {
      if (v.latitude != null && v.longitude != null) {
        window.open(`https://www.google.com/maps?q=${v.latitude},${v.longitude}`, '_blank', 'noopener,noreferrer')
      } else {
        toast.error('No coordinates on this vehicle')
      }
      return
    }
    if (action === 'rc') {
      setTab('attachments')
      toast.success('Open Documents to download RC if uploaded')
    }
  }

  return (
    <AppLayout title={v.vehicle_number} hideHeader>
      <div className="vad-page">
        <VehicleHero
          vehicle={v}
          imageUrl={heroImage}
          canEdit={canEdit}
          canDelete={canDelete}
          onTransfer={focusAssignment}
          onDelete={() => void removeVehicle()}
        />

        <div className="vad-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'is-active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count != null ? <span>({t.count})</span> : null}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <OverviewTab
            vehicle={v}
            assignRef={assignRef}
            drivers={drivers}
            users={users}
            assignTargetType={assignTargetType}
            setAssignTargetType={setAssignTargetType}
            assignDriverId={assignDriverId}
            setAssignDriverId={setAssignDriverId}
            assignUserId={assignUserId}
            setAssignUserId={setAssignUserId}
            assignReason={assignReason}
            setAssignReason={setAssignReason}
            unassignReason={unassignReason}
            setUnassignReason={setUnassignReason}
            busy={busy}
            onAssign={() => void onAssign()}
            onUnassign={() => void onUnassign()}
            onQuick={onQuick}
          />
        ) : null}

        {tab === 'captures' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar">
              <h3>Photo captures</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setWebcamOpen(true)}>
                  Webcam
                </button>
                <button type="button" className="btn btn-default btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                  Phone / file
                </button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void processFile(f)
            }} />
            <VehicleWebcamCapture
              open={webcamOpen}
              vehicleLabel={v.vehicle_number}
              onClose={() => setWebcamOpen(false)}
              onCapture={(file, position) => { void processFile(file, position) }}
            />
            {captures.length === 0 && pending.length === 0 ? (
              <div className="vad-empty">
                <strong>No photos yet</strong>
                Capture a GPS-stamped inspection photo to start the gallery.
              </div>
            ) : (
              <div className="vad-gallery">
                <button type="button" className="vc-add-card" disabled={busy} onClick={() => setWebcamOpen(true)}>
                  <i className="fas fa-video" /><span>Open webcam</span>
                </button>
                {pending.map((p) => (
                  <div key={p.localId} className="vc-pending-wrap">
                    <VehicleCaptureFrame photoUrl={p.previewUrl} capturedAt={p.capturedAt} latitude={p.latitude} longitude={p.longitude} address={p.address} />
                    {p.uploading ? <div className="vc-pending-badge">Saving...</div> : null}
                    {p.error ? <div className="vc-pending-badge vc-pending-badge--error">{p.error}</div> : null}
                  </div>
                ))}
                {captures.map((c) => (
                  <VehicleCaptureFrame
                    key={c.id}
                    {...captureToFrameProps(c)}
                    busy={busy}
                    onRemove={async () => {
                      if (!window.confirm('Delete capture?')) return
                      await vehiclesApi.deleteCapture(id!, c.id)
                      setCaptures((list) => list.filter((x) => x.id !== c.id))
                      setVehicle((v) => (v ? { ...v, captures_count: Math.max(0, (v.captures_count || 1) - 1) } : v))
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'attachments' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar">
              <h3>Documents</h3>
              <div className="vehicle-attach-bar" style={{ margin: 0 }}>
                <AppSelect
                  value={attachKind}
                  onChange={setAttachKind}
                  searchable={false}
                  className="vehicle-attach-kind"
                  options={[
                    { value: 'invoice', label: 'Invoice' },
                    { value: 'po', label: 'Purchase Order' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => attachRef.current?.click()}>
                  Upload
                </button>
                <input ref={attachRef} type="file" className="sr-only" onChange={onAttach} />
              </div>
            </div>
            {files.length === 0 ? (
              <div className="vad-empty">
                <strong>No documents yet</strong>
                Upload invoice, PO, RC, or other vehicle documents.
              </div>
            ) : (
              <table className="vad-doc-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={String(f.id)}>
                      <td>
                        <a href={String(f.url)} target="_blank" rel="noreferrer">
                          {String(f.original_filename || f.filename)}
                        </a>
                      </td>
                      <td>{String(f.kind)}</td>
                      <td>{String(f.created_at || '-')}</td>
                      <td><span className="vad-badge-soft">Uploaded</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={async () => {
                            await vehiclesApi.deleteFile(String(f.id))
                            setFiles((list) => list.filter((x) => x.id !== f.id))
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === 'maintenance' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="vad-panel">
              <div className="vad-panel__bar"><h3>Log repair / service</h3></div>
              <form className="vehicle-form-grid" onSubmit={onAddMaint}>
                <label>Type
                  <AppSelect
                    value={maintForm.maintenance_type}
                    onChange={(v) => setMaintForm({
                      ...maintForm,
                      maintenance_type: v,
                      parts_replaced: MAINT_DETAIL_TYPES.has(v) ? maintForm.parts_replaced : '',
                    })}
                    searchable={false}
                    options={MAINT_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                </label>
                <label>Title *
                  <input className="form-control" required value={maintForm.title} onChange={(e) => setMaintForm({ ...maintForm, title: e.target.value })} />
                </label>
                <label>Start date
                  <DateField value={maintForm.start_date} onChange={(v) => setMaintForm({ ...maintForm, start_date: v })} />
                </label>
                <label>Completion
                  <DateField value={maintForm.completion_date} onChange={(v) => setMaintForm({ ...maintForm, completion_date: v })} />
                </label>
                <label>Cost
                  <input type="number" className="form-control" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} />
                </label>
                <label>Odometer (km)
                  <input type="number" className="form-control" value={maintForm.odometer_km} onChange={(e) => setMaintForm({ ...maintForm, odometer_km: e.target.value })} />
                </label>
                <label>Vendor
                  <input className="form-control" value={maintForm.vendor_name} onChange={(e) => setMaintForm({ ...maintForm, vendor_name: e.target.value })} />
                </label>
                {needsMaintDetail ? (
                  <label className="vehicle-form-span">
                    {maintDetailLabel(maintForm.maintenance_type)} *
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      value={maintForm.parts_replaced}
                      onChange={(e) => setMaintForm({ ...maintForm, parts_replaced: e.target.value })}
                      placeholder={maintDetailHint(maintForm.maintenance_type)}
                    />
                  </label>
                ) : null}
                <label className="vehicle-form-span">Notes
                  <textarea className="form-control" rows={2} value={maintForm.note} onChange={(e) => setMaintForm({ ...maintForm, note: e.target.value })} />
                </label>
                <label><input type="checkbox" checked={maintForm.is_warranty} onChange={(e) => setMaintForm({ ...maintForm, is_warranty: e.target.checked })} /> Warranty work</label>
                <label><input type="checkbox" checked={maintForm.set_status} onChange={(e) => setMaintForm({ ...maintForm, set_status: e.target.checked })} /> Mark vehicle status = maintenance</label>
                <div className="vehicle-form-span"><button className="btn btn-primary" disabled={busy}>Save log</button></div>
              </form>
            </div>

            <div className="vad-panel">
              <div className="vad-panel__bar"><h3>Service history</h3></div>
              {maintenances.length === 0 ? (
                <div className="vad-empty">
                  <strong>No maintenance records yet</strong>
                  <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setMaintForm((f) => ({ ...f, maintenance_type: 'Service', title: 'Scheduled service' }))}>
                    Schedule service
                  </button>
                </div>
              ) : (
                <ul className="vad-timeline">
                  {maintenances.map((m) => (
                    <li key={m.id}>
                      <span className="vad-timeline__dot" />
                      <div className="vad-timeline__body">
                        <strong>{m.title}</strong>
                        <span>
                          {m.maintenance_type}
                          {m.vendor_name ? ` · ${m.vendor_name}` : ''}
                          {m.parts_replaced ? ` · ${m.parts_replaced}` : ''}
                        </span>
                      </div>
                      <div className="vad-timeline__time">
                        <div>{m.start_date || m.created_at || '-'}</div>
                        <div>{m.cost != null ? `\u20B9${Number(m.cost).toLocaleString('en-IN')}` : ''}</div>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          style={{ marginTop: 4 }}
                          onClick={async () => {
                            await vehiclesApi.deleteMaintenance(id!, m.id)
                            setMaintenances((list) => list.filter((x) => x.id !== m.id))
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar"><h3>Activity</h3></div>
            {history.length === 0 ? (
              <div className="vad-empty">
                <strong>No activity yet</strong>
                Assignments, uploads, and maintenance will appear here.
              </div>
            ) : (
              <ul className="vad-timeline">
                {history.map((h) => (
                  <li key={String(h.id)}>
                    <span className="vad-timeline__dot" />
                    <div className="vad-timeline__body">
                      <strong>{String(h.action_type || 'Activity')}</strong>
                      <span>{String(h.actor_name || 'System')}{h.note ? ` · ${String(h.note)}` : ''}</span>
                    </div>
                    <div className="vad-timeline__time">{String(h.action_date || h.created_at || '')}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'qr' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar">
              <h3>QR / Tags</h3>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void refreshQr()}>
                Generate / refresh
              </button>
            </div>
            {v.qr_image_url ? (
              <div className="rm-qr">
                <img src={v.qr_image_url} alt="Vehicle QR" />
                <div className="rm-qr__plate">{v.vehicle_number}</div>
                <div className="rm-qr__model">
                  Asset ID {v.id}
                  {v.fleet_id ? ` · Fleet ${v.fleet_id}` : ''}
                </div>
                <div className="rm-page-actions" style={{ justifyContent: 'center' }}>
                  <a className="btn btn-default btn-sm" href={v.qr_image_url} download={`${v.vehicle_number}-qr.png`}>
                    Download QR
                  </a>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(String(v.id)).then(
                        () => toast.success('Asset ID copied'),
                        () => toast.error('Copy failed'),
                      )
                    }}
                  >
                    Copy Asset ID
                  </button>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={() => window.print()}
                  >
                    Print QR
                  </button>
                  <a
                    className="btn btn-default btn-sm"
                    href={v.qr_token ? `/vehicle/${v.qr_token}` : (v.qr_url || '#')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open public page
                  </a>
                </div>
              </div>
            ) : (
              <div className="vad-empty">
                <strong>No QR yet</strong>
                Generate a vehicle identity label for scanning.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AppLayout>
  )
}
