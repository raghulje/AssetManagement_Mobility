import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { VehicleCaptureFrame, captureToFrameProps } from '../../components/VehicleCaptureFrame'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
import { stampGpsOnImage, fetchGpsStaticMapUrl } from '../../lib/stampGpsOnImage'
import { readPrecisePosition, type PrecisePosition } from '../../lib/preciseLocation'
import {
  vehiclesApi,
  type Vehicle,
  type VehicleCapture,
  type VehicleMaintenance,
} from '../../api/vehicles'
import { usersApi } from '../../api/client'

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

export default function VehicleDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)

  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [captures, setCaptures] = useState<VehicleCapture[]>([])
  const [pending, setPending] = useState<PendingCapture[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([])
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [users, setUsers] = useState<Array<{ id: number; text?: string; name?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachKind, setAttachKind] = useState('invoice')
  const [assignUserId, setAssignUserId] = useState('')
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
    if (tab === 'captures') {
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
          address = geo.address || geo.formatted_address || null
          localityHeader = geo.locality_header || null
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
    if (!id || !assignUserId) return toast.error('Select a user')
    setBusy(true)
    try {
      const res = await vehiclesApi.checkout(id, {
        assigned_type: 'user',
        assigned_to: Number(assignUserId),
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

  if (loading) return <AppLayout title="Vehicle"><p>Loading…</p></AppLayout>
  if (error || !vehicle) {
    return (
      <AppLayout title="Vehicle">
        <div className="callout callout-danger">{error || 'Not found'}</div>
        <Link to="/vehicles" className="btn btn-default">Back</Link>
      </AppLayout>
    )
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'captures', label: `Photos (${vehicle.captures_count || 0})` },
    { id: 'attachments', label: 'Attachments' },
    { id: 'maintenance', label: `Maintenance (${vehicle.maintenances_count || 0})` },
    { id: 'history', label: 'Activity log' },
    { id: 'qr', label: 'QR label' },
  ]

  return (
    <AppLayout title={vehicle.vehicle_number} subtitle={`${vehicle.model} · ${vehicle.location_name}`}>
      <div className="vehicle-detail-bar">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/vehicles" className="btn btn-default btn-sm"><i className="fas fa-arrow-left" /> Fleet</Link>
          <Link to={`/vehicles/${vehicle.id}/edit`} className="btn btn-default btn-sm"><i className="fas fa-edit" /> Edit</Link>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => void removeVehicle()}>Delete</button>
        </div>
        <div className="vehicle-detail-meta">
          <span className={`label ${vehicle.fuel_type === 'EV' ? 'label-success' : 'label-warning'}`}>{vehicle.fuel_type}</span>
          <span className="label label-default">{vehicle.status}</span>
          {vehicle.assigned_name ? <span>Assigned: {vehicle.assigned_name}</span> : <span>Unassigned</span>}
        </div>
      </div>

      <ul className="nav nav-tabs vehicle-tabs">
        {tabs.map((t) => (
          <li key={t.id} className={tab === t.id ? 'active' : ''}>
            <button type="button" onClick={() => setTab(t.id)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {tab === 'overview' ? (
        <div className="row">
          <div className="col-md-7">
            <Box title="Vehicle profile">
              <table className="table table-condensed">
                <tbody>
                  <tr><th>Plate</th><td>{vehicle.vehicle_number}</td></tr>
                  <tr><th>Model</th><td>{vehicle.model}</td></tr>
                  <tr><th>City</th><td>{vehicle.location_name}</td></tr>
                  <tr><th>Category</th><td>{vehicle.category}</td></tr>
                  <tr><th>Purchase date</th><td>{vehicle.purchase_date || '—'}</td></tr>
                  <tr><th>PO / order</th><td>{vehicle.order_number || '—'}</td></tr>
                  <tr><th>Supplier</th><td>{vehicle.supplier_name || '—'}</td></tr>
                  <tr><th>Cost</th><td>{vehicle.purchase_cost != null ? `₹${vehicle.purchase_cost}` : '—'}</td></tr>
                  <tr><th>Warranty</th><td>{vehicle.warranty_months != null ? `${vehicle.warranty_months} months` : '—'}</td></tr>
                  <tr><th>EOL date</th><td>{vehicle.vehicle_eol_date || '—'}</td></tr>
                  <tr><th>Notes</th><td>{vehicle.notes || '—'}</td></tr>
                </tbody>
              </table>
            </Box>
          </div>
          <div className="col-md-5">
            <Box title="Assign / unassign">
              {vehicle.assigned_to ? (
                <>
                  <p>Currently with <strong>{vehicle.assigned_name}</strong></p>
                  <textarea className="form-control" rows={2} placeholder="Reason to unassign" value={unassignReason} onChange={(e) => setUnassignReason(e.target.value)} />
                  <button type="button" className="btn btn-warning" style={{ marginTop: 8 }} disabled={busy} onClick={() => void onUnassign()}>
                    Unassign
                  </button>
                </>
              ) : (
                <>
                  <select className="form-control" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                    <option value="">Select user…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.text || u.name || u.id}</option>)}
                  </select>
                  <textarea className="form-control" rows={2} style={{ marginTop: 8 }} placeholder="Reason" value={assignReason} onChange={(e) => setAssignReason(e.target.value)} />
                  <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void onAssign()}>
                    Assign vehicle
                  </button>
                </>
              )}
            </Box>
          </div>
        </div>
      ) : null}

      {tab === 'captures' ? (
        <Box title="Photo captures" tools={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setWebcamOpen(true)}>
              <i className="fas fa-video" /> Webcam
            </button>
            <button type="button" className="btn btn-default btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <i className="fas fa-camera" /> Phone / file
            </button>
          </div>
        )}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void processFile(f)
          }} />
          <VehicleWebcamCapture
            open={webcamOpen}
            vehicleLabel={vehicle.vehicle_number}
            onClose={() => setWebcamOpen(false)}
            onCapture={(file, position) => { void processFile(file, position) }}
          />
          <div className="vc-grid">
            <button type="button" className="vc-add-card" disabled={busy} onClick={() => setWebcamOpen(true)}>
              <i className="fas fa-video" /><span>Open webcam</span>
            </button>
            {pending.map((p) => (
              <div key={p.localId} className="vc-pending-wrap">
                <VehicleCaptureFrame photoUrl={p.previewUrl} capturedAt={p.capturedAt} latitude={p.latitude} longitude={p.longitude} address={p.address} />
                {p.uploading ? <div className="vc-pending-badge">Saving…</div> : null}
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
        </Box>
      ) : null}

      {tab === 'attachments' ? (
        <Box title="Invoice / PO / documents">
          <div className="vehicle-attach-bar">
            <select className="form-control" value={attachKind} onChange={(e) => setAttachKind(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="invoice">Invoice</option>
              <option value="po">Purchase Order</option>
              <option value="other">Other</option>
            </select>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => attachRef.current?.click()}>
              Upload
            </button>
            <input ref={attachRef} type="file" className="sr-only" onChange={onAttach} />
          </div>
          <table className="table table-striped">
            <thead><tr><th>Kind</th><th>File</th><th>Date</th><th /></tr></thead>
            <tbody>
              {files.length === 0 ? <tr><td colSpan={4}>No attachments yet</td></tr> : null}
              {files.map((f) => (
                <tr key={String(f.id)}>
                  <td>{String(f.kind)}</td>
                  <td><a href={String(f.url)} target="_blank" rel="noreferrer">{String(f.original_filename || f.filename)}</a></td>
                  <td>{String(f.created_at || '')}</td>
                  <td>
                    <button type="button" className="btn btn-xs btn-danger" onClick={async () => {
                      await vehiclesApi.deleteFile(String(f.id))
                      setFiles((list) => list.filter((x) => x.id !== f.id))
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      ) : null}

      {tab === 'maintenance' ? (
        <>
          <Box title="Log repair / part replacement">
            <form className="vehicle-form-grid" onSubmit={onAddMaint}>
              <label>Type
                <select className="form-control" value={maintForm.maintenance_type} onChange={(e) => setMaintForm({ ...maintForm, maintenance_type: e.target.value })}>
                  {MAINT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label>Title *
                <input className="form-control" required value={maintForm.title} onChange={(e) => setMaintForm({ ...maintForm, title: e.target.value })} />
              </label>
              <label>Start date
                <input type="date" className="form-control" value={maintForm.start_date} onChange={(e) => setMaintForm({ ...maintForm, start_date: e.target.value })} />
              </label>
              <label>Completion
                <input type="date" className="form-control" value={maintForm.completion_date} onChange={(e) => setMaintForm({ ...maintForm, completion_date: e.target.value })} />
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
              <label>Parts replaced
                <input className="form-control" value={maintForm.parts_replaced} onChange={(e) => setMaintForm({ ...maintForm, parts_replaced: e.target.value })} />
              </label>
              <label className="vehicle-form-span">Notes
                <textarea className="form-control" rows={2} value={maintForm.note} onChange={(e) => setMaintForm({ ...maintForm, note: e.target.value })} />
              </label>
              <label><input type="checkbox" checked={maintForm.is_warranty} onChange={(e) => setMaintForm({ ...maintForm, is_warranty: e.target.checked })} /> Warranty work</label>
              <label><input type="checkbox" checked={maintForm.set_status} onChange={(e) => setMaintForm({ ...maintForm, set_status: e.target.checked })} /> Mark vehicle status = maintenance</label>
              <div className="vehicle-form-span"><button className="btn btn-primary" disabled={busy}>Save log</button></div>
            </form>
          </Box>
          <Box title="Maintenance history">
            <table className="table table-striped">
              <thead><tr><th>Type</th><th>Title</th><th>Dates</th><th>Parts</th><th>Cost</th><th /></tr></thead>
              <tbody>
                {maintenances.length === 0 ? <tr><td colSpan={6}>No maintenance logs</td></tr> : null}
                {maintenances.map((m) => (
                  <tr key={m.id}>
                    <td>{m.maintenance_type}</td>
                    <td>{m.title}</td>
                    <td>{m.start_date || '—'} → {m.completion_date || 'open'}</td>
                    <td>{m.parts_replaced || '—'}</td>
                    <td>{m.cost != null ? `₹${m.cost}` : '—'}</td>
                    <td>
                      <button type="button" className="btn btn-xs btn-danger" onClick={async () => {
                        await vehiclesApi.deleteMaintenance(id!, m.id)
                        setMaintenances((list) => list.filter((x) => x.id !== m.id))
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </>
      ) : null}

      {tab === 'history' ? (
        <Box title="Complete activity log">
          <table className="table table-striped">
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan={4}>No activity yet</td></tr> : null}
              {history.map((h) => (
                <tr key={String(h.id)}>
                  <td>{String(h.action_date || h.created_at || '')}</td>
                  <td>{String(h.action_type)}</td>
                  <td>{String(h.actor_name || '—')}</td>
                  <td>{String(h.note || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      ) : null}

      {tab === 'qr' ? (
        <Box title="QR code" tools={<button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void refreshQr()}>Generate / refresh</button>}>
          {vehicle.qr_image_url ? (
            <div className="vehicle-qr-panel">
              <img src={vehicle.qr_image_url} alt="Vehicle QR" style={{ width: 220, height: 220, background: '#fff', border: '1px solid #cbd5e1' }} />
              <div>
                <p><strong>Public page</strong></p>
                <a href={vehicle.qr_url || `/vehicle/${vehicle.qr_token}`} target="_blank" rel="noreferrer">
                  {vehicle.qr_url || `/vehicle/${vehicle.qr_token}`}
                </a>
                <p className="help-block">Scan to open the public vehicle card (no login).</p>
              </div>
            </div>
          ) : (
            <p>No QR yet. Click generate.</p>
          )}
        </Box>
      ) : null}
    </AppLayout>
  )
}
