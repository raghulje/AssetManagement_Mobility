import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppLayout from '../../layout/AppLayout'
import { useToast } from '../../components/Toast'
import { CAPTURE_KIND_ORDER } from '../../components/VehicleCaptureFrame'
import FormRegistrationCaptures, { countFormRegistrationPhotos } from '../../components/FormRegistrationCaptures'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
import { stampGpsOnImage, fetchGpsStaticMapUrl } from '../../lib/stampGpsOnImage'
import { readGpsFromImageFile } from '../../lib/imageGps'
import {
  preferNativePhoneCamera,
  queryLocationPermission,
  requestLocationAccess,
  resolveCapturePosition,
  type PrecisePosition,
} from '../../lib/preciseLocation'
import { vehiclePublicScanUrl, vehicleQrDataUrl } from '../../lib/vehicleQrClient'
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
import { formatAppDateTime } from '../../lib/datetime'

type Tab = 'overview' | 'captures' | 'attachments' | 'maintenance' | 'assignments' | 'form-logs' | 'history' | 'qr'

type PendingCapture = {
  localId: string
  previewUrl: string
  capturedAt: string
  latitude: number | null
  longitude: number | null
  address: string | null
  uploading?: boolean
  statusText?: string
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

function formatVehicleAction(action: string) {
  const key = String(action || '').toLowerCase()
  if (key === 'checkout' || key === 'assigned') return 'Assigned'
  if (key === 'checkin' || key === 'unassigned') return 'Unassigned'
  if (key === 'create') return 'Created'
  if (key === 'update') return 'Updated'
  if (key === 'delete') return 'Deleted'
  if (key === 'maintenance') return 'Maintenance logged'
  if (key === 'uploaded') return 'File uploaded'
  if (key === 'registered') return 'Form registered'
  if (key === 'verified') return 'Form verified'
  if (key === 'deverified') return 'Form deverified'
  if (key === 'deregistered') return 'Form deregistered'
  if (key === 'label_printed') return 'QR printed'
  if (!key) return 'Activity'
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseLogMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function formLogDetail(row: Record<string, unknown>) {
  const meta = parseLogMeta(row.log_meta)
  const action = String(row.action_type || '').toLowerCase()
  const bits: string[] = []
  if (meta.employee_code) bits.push(`Employee ${String(meta.employee_code)}`)
  if (meta.submitter_name) bits.push(String(meta.submitter_name))
  if (meta.submitter_email) bits.push(String(meta.submitter_email))
  if (meta.photo_count != null) bits.push(`${meta.photo_count} photo(s)`)
  if (meta.photos_removed != null) bits.push(`${meta.photos_removed} photo(s) removed`)
  if (meta.session_id != null) bits.push(`Session #${meta.session_id}`)
  if (action === 'uploaded' && !bits.length) bits.push('Public capture form')
  const note = row.note ? String(row.note) : ''
  if (note && action !== 'registered') bits.push(note)
  else if (note && action === 'registered' && !bits.length) bits.push(note)
  return bits.join(' · ')
}

export default function VehicleDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: Tab = (
    rawTab === 'captures'
    || rawTab === 'attachments'
    || rawTab === 'maintenance'
    || rawTab === 'assignments'
    || rawTab === 'form-logs'
    || rawTab === 'history'
    || rawTab === 'qr'
  ) ? rawTab : 'overview'
  const autoCapture = params.get('capture') === '1'
  const focusVerify = params.get('focus') === 'verify'
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const heldGpsRef = useRef<PrecisePosition | null>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  const assignRef = useRef<HTMLElement | null>(null)
  const photosPanelRef = useRef<HTMLDivElement | null>(null)
  const formRegRef = useRef<HTMLElement | null>(null)
  const autoCaptureStarted = useRef(false)
  const focusVerifyDone = useRef(false)

  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [captures, setCaptures] = useState<VehicleCapture[]>([])
  const [pending, setPending] = useState<PendingCapture[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [verifySessionId, setVerifySessionId] = useState<number | null>(null)
  const [verifySummary, setVerifySummary] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [deregisterBusy, setDeregisterBusy] = useState(false)
  const [captureGps, setCaptureGps] = useState<PrecisePosition | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [nativeCamArmed, setNativeCamArmed] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrBusy, setQrBusy] = useState(false)
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([])
  const [viewingMaint, setViewingMaint] = useState<VehicleMaintenance | null>(null)
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [formLogs, setFormLogs] = useState<Record<string, unknown>[]>([])
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([])
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
    let cancelled = false
    async function renderQr() {
      const token = vehicle?.qr_token ? String(vehicle.qr_token) : ''
      const url = vehicle?.qr_url ? String(vehicle.qr_url) : ''
      if (!token && !url) {
        setQrDataUrl(null)
        return
      }
      setQrBusy(true)
      try {
        const dataUrl = await vehicleQrDataUrl(url || token, { storedUrl: url })
        if (!cancelled) setQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setQrDataUrl(null)
      } finally {
        if (!cancelled) setQrBusy(false)
      }
    }
    void renderQr()
    return () => { cancelled = true }
  }, [vehicle?.qr_token, vehicle?.qr_url])

  useEffect(() => {
    if (!id || !vehicle) return
    if (tab === 'captures' || tab === 'overview') {
      vehiclesApi.captures(id).then((r) => setCaptures(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'captures' || tab === 'overview' || tab === 'form-logs') {
      vehiclesApi.formRegistrationLogs(id).then((r) => setFormLogs(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'attachments') {
      vehiclesApi.listFiles(id).then((r) => setFiles(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'maintenance') {
      vehiclesApi.maintenances(id).then((r) => setMaintenances(r.rows || [])).catch(() => undefined)
    }
    if (tab === 'assignments') {
      vehiclesApi.assignments(id).then((r) => setAssignments(r.rows || [])).catch(() => undefined)
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
    setPending((p) => [{
      localId,
      previewUrl,
      capturedAt,
      latitude: knownPos?.latitude ?? null,
      longitude: knownPos?.longitude ?? null,
      address: null,
      uploading: true,
      statusText: knownPos ? 'Stamping GPS…' : 'Getting GPS…',
    }, ...p])
    try {
      // Device GPS (held / live) → fresh read → EXIF from phone camera (after native tick)
      let pos = await resolveCapturePosition(knownPos ?? heldGpsRef.current, {
        targetAccuracyM: 80,
        timeoutMs: 12000,
        maximumAgeMs: 60_000,
      })
      if (!pos) {
        setPending((list) => list.map((item) => (
          item.localId === localId ? { ...item, statusText: 'Reading photo GPS…' } : item
        )))
        pos = await readGpsFromImageFile(file)
      }

      let address: string | null = null
      let localityHeader: string | null = null
      const latitude = pos?.latitude ?? null
      const longitude = pos?.longitude ?? null
      const accuracyM = pos?.accuracyM ?? null
      let mapImageUrl: string | null = null

      if (pos) heldGpsRef.current = pos

      setPending((list) => list.map((item) => (
        item.localId === localId
          ? {
              ...item,
              latitude,
              longitude,
              statusText: latitude != null ? 'Resolving address…' : 'Saving photo…',
              address: latitude == null ? 'Location unavailable' : null,
            }
          : item
      )))

      if (latitude != null && longitude != null) {
        try {
          const geo = await Promise.race([
            vehiclesApi.reverseGeocode(latitude, longitude),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('Geocode timeout')), 8000)
            }),
          ])
          address = (typeof geo.address === 'string' ? geo.address : null)
            || (typeof geo.formatted_address === 'string' ? geo.formatted_address : null)
            || null
          localityHeader = typeof geo.locality_header === 'string' ? geo.locality_header : null
        } catch {
          address = `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`
        }
        mapImageUrl = await Promise.race([
          fetchGpsStaticMapUrl(latitude, longitude, 400),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 6000) }),
        ])
      }

      setPending((list) => list.map((item) => (
        item.localId === localId
          ? { ...item, address: address || (latitude == null ? 'Location unavailable' : item.address), statusText: 'Stamping photo…' }
          : item
      )))

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
          ? { ...item, previewUrl: stampedPreview, latitude, longitude, address: address || (latitude == null ? 'Location unavailable' : null), statusText: 'Uploading…' }
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
        toast.error('Photo saved, but GPS was missing. Allow Location (HTTPS) and capture again.')
      } else {
        const via = pos?.source === 'exif' ? ' from photo' : ''
        toast.success(accuracyM != null ? `GPS photo saved${via} (±${Math.round(accuracyM)} m)` : `GPS photo saved${via}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setPending((list) => list.map((item) => (
        item.localId === localId
          ? { ...item, uploading: false, statusText: undefined, error: msg }
          : item
      )))
      toast.error(msg)
    }
  }

  function gpsIsFresh(pos: PrecisePosition | null | undefined, maxAgeMs = 90_000) {
    if (!pos || !Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude)) return false
    const t = pos.capturedAt instanceof Date
      ? pos.capturedAt.getTime()
      : Date.parse(String(pos.capturedAt))
    return Number.isFinite(t) && Date.now() - t <= maxAgeMs
  }

  function launchNativeCamera() {
    const el = fileRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        void el.showPicker()
        return
      }
    } catch {
      /* fall through to click() */
    }
    el.click()
  }

  async function startCapture() {
    setNativeCamArmed(false)
    const useNative = preferNativePhoneCamera()
    const warm = gpsIsFresh(captureGps)
      ? captureGps
      : gpsIsFresh(heldGpsRef.current)
        ? heldGpsRef.current
        : null

    // GPS already locked → open camera in this same tap (true one-click)
    if (useNative && warm) {
      heldGpsRef.current = warm
      setCaptureGps(warm)
      launchNativeCamera()
      return
    }

    setGpsBusy(true)
    try {
      const loc = await requestLocationAccess()
      if (loc.position) {
        heldGpsRef.current = loc.position
        setCaptureGps(loc.position)
      } else {
        heldGpsRef.current = null
        setCaptureGps(null)
        toast.error(loc.message)
      }

      if (useNative) {
        // Auto-open after GPS. Keep a soft fallback if the browser blocks the picker.
        setNativeCamArmed(true)
        setGpsBusy(false)
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(() => resolve(), 80))
        })
        launchNativeCamera()
        return
      }
      setWebcamOpen(true)
    } finally {
      setGpsBusy(false)
    }
  }

  // Warm GPS on Photos tab so the next Take photo can open the camera in one gesture
  useEffect(() => {
    if (tab !== 'captures') return
    if (gpsIsFresh(heldGpsRef.current) || gpsIsFresh(captureGps)) return
    let cancelled = false
    void queryLocationPermission().then((perm) => {
      if (cancelled || perm !== 'granted') return
      return requestLocationAccess().then((loc) => {
        if (cancelled || !loc.position) return
        heldGpsRef.current = loc.position
        setCaptureGps(loc.position)
      })
    })
    return () => { cancelled = true }
  }, [tab])

  // Fleet list camera icon → open Photos tab and start capture immediately
  useEffect(() => {
    if (!autoCapture || loading || !vehicle || autoCaptureStarted.current) return
    autoCaptureStarted.current = true
    const next = new URLSearchParams(params)
    next.delete('capture')
    if (next.get('tab') !== 'captures') next.set('tab', 'captures')
    setParams(next, { replace: true })
    void startCapture()
  }, [autoCapture, loading, vehicle])

  useEffect(() => {
    autoCaptureStarted.current = false
    focusVerifyDone.current = false
  }, [id])

  // Pending-verify badge → Photos tab: scroll to Photo captures / form registration and highlight
  useEffect(() => {
    if (!focusVerify || loading || !vehicle || tab !== 'captures' || focusVerifyDone.current) return

    const finish = (target: HTMLElement) => {
      if (focusVerifyDone.current) return
      focusVerifyDone.current = true
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.remove('vad-card--highlight')
      void target.offsetWidth
      target.classList.add('vad-card--highlight')
      window.setTimeout(() => target.classList.remove('vad-card--highlight'), 2800)
      const next = new URLSearchParams(params)
      next.delete('focus')
      setParams(next, { replace: true })
    }

    let attempts = 0
    const tick = window.setInterval(() => {
      attempts += 1
      const target = formRegRef.current || photosPanelRef.current
      if (target) {
        window.clearInterval(tick)
        finish(target)
        return
      }
      if (attempts >= 20) window.clearInterval(tick)
    }, 100)

    return () => window.clearInterval(tick)
  }, [focusVerify, loading, vehicle, tab, captures.length, params, setParams])

  function openNativeCameraNow() {
    setNativeCamArmed(false)
    launchNativeCamera()
  }

  async function onNativeCameraFile(file: File) {
    // After native tick, page is foreground again — refresh GPS if needed, then EXIF
    let pos = heldGpsRef.current
    if (!pos) {
      pos = await resolveCapturePosition(null, { targetAccuracyM: 100, timeoutMs: 10000, maximumAgeMs: 120_000 })
    }
    if (!pos) pos = await readGpsFromImageFile(file)
    if (pos) {
      heldGpsRef.current = pos
      setCaptureGps(pos)
    }
    await processFile(file, pos)
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
      setAssignUserId('')
      setAssignDriverId('')
      toast.success('Vehicle assigned')
      void vehiclesApi.assignments(id).then((r) => setAssignments(r.rows || [])).catch(() => undefined)
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
      void vehiclesApi.assignments(id).then((r) => setAssignments(r.rows || [])).catch(() => undefined)
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
    setQrBusy(true)
    try {
      const qr = await vehiclesApi.ensureQr(id)
      const token = String(qr.qr_token || '')
      const publicUrl = String(qr.public_url || '')
      setVehicle((v) => (v ? {
        ...v,
        qr_token: token || v.qr_token,
        qr_url: publicUrl || v.qr_url,
        qr_image_url: String(qr.image_url || v.qr_image_url),
      } : v))
      if (token || publicUrl) {
        const dataUrl = await vehicleQrDataUrl(publicUrl || token, { storedUrl: publicUrl })
        setQrDataUrl(dataUrl)
      }
      toast.success('QR ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'QR failed')
    } finally {
      setBusy(false)
      setQrBusy(false)
    }
  }

  function printVehicleQr() {
    const plate = vehicle?.vehicle_number || 'Vehicle'
    const src = qrDataUrl
    if (!src) {
      toast.error('Generate the QR first')
      return
    }
    const esc = (s: string) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const meta = [
      vehicle?.id != null ? `Asset ID ${vehicle.id}` : '',
      vehicle?.fleet_id ? `Fleet ${vehicle.fleet_id}` : '',
    ].filter(Boolean).join(' · ')
    // Blob URL avoids about:blank — window.open(..., 'noopener') cannot document.write
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<title>${esc(plate)} — QR label</title>
<style>
  @page { margin: 12mm; size: auto; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #0b1f44;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #fff;
  }
  .label {
    width: 320px;
    text-align: center;
    padding: 20px 16px;
    border: 2px solid #0b1f44;
    border-radius: 12px;
  }
  .brand { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 10px; }
  img { width: 240px; height: 240px; display: block; margin: 0 auto 12px; }
  .plate { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .meta { margin-top: 6px; font-size: 12px; color: #64748b; }
</style>
</head><body>
  <div class="label">
    <div class="brand">Refex Mobility</div>
    <img src="${src}" alt="QR" />
    <div class="plate">${esc(plate)}</div>
    ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  </script>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank', 'width=520,height=720')
    if (!w) {
      URL.revokeObjectURL(url)
      toast.error('Pop-up blocked — allow pop-ups to print QR')
      return
    }
    // Revoke after the print window has loaded the blob
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
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

  const canEdit = can('vehicles.edit') || can('vehicles.create')
  const canVerify = can('vehicles.verify')
  const canDelete = can('vehicles.delete') || can('vehicles.edit')
  const v = vehicle

  function sortCapturesByKind<T extends { capture_kind?: string | null; id: number }>(list: T[]) {
    return [...list].sort((a, b) => {
      const ao = CAPTURE_KIND_ORDER[a.capture_kind || 'vehicle'] ?? 99
      const bo = CAPTURE_KIND_ORDER[b.capture_kind || 'vehicle'] ?? 99
      if (ao !== bo) return ao - bo
      return a.id - b.id
    })
  }

  const formRegistrations = (() => {
    const map = new Map<string, {
      key: string
      sessionId: number | null
      vehicleNumber: string
      name: string | null
      email: string | null
      phone: string | null
      verifiedAt: string | null
      verifiedByName: string | null
      verifiedSummary: string | null
      verificationLog: NonNullable<VehicleCapture['verification_log']>
      photos: typeof captures
    }>()
    for (const c of captures) {
      if (String(c.source || '') !== 'public_form') continue
      const key = c.session_id != null ? `s-${c.session_id}` : `c-${c.id}`
      const existing = map.get(key)
      if (existing) existing.photos.push(c)
      else {
        map.set(key, {
          key,
          sessionId: c.session_id ?? null,
          vehicleNumber: v.vehicle_number,
          name: c.submitter_name || c.captured_by_name || null,
          email: c.submitter_email || null,
          phone: c.submitter_phone || null,
          verifiedAt: c.verified_at || null,
          verifiedByName: c.verified_by_name || null,
          verifiedSummary: c.verified_summary || null,
          verificationLog: Array.isArray(c.verification_log) ? c.verification_log : [],
          photos: [c],
        })
      }
    }
    return Array.from(map.values()).map((reg) => ({
      ...reg,
      photos: sortCapturesByKind(reg.photos),
    }))
  })()

  async function submitVerify() {
    if (!id || verifySessionId == null) return
    const summary = verifySummary.trim()
    if (!summary) {
      toast.error('Enter a short verification summary')
      return
    }
    setVerifyBusy(true)
    try {
      const res = await vehiclesApi.verifyCaptureSession(id, verifySessionId, summary)
      const payload = res.payload
      setCaptures((list) => list.map((c) => {
        if (c.session_id !== verifySessionId) return c
        return {
          ...c,
          verified_at: payload?.verified_at || c.verified_at,
          verified_by: payload?.verified_by ?? c.verified_by,
          verified_by_name: payload?.verified_by_name || c.verified_by_name,
          verified_summary: payload?.verified_summary || summary,
          verification_log: payload?.verification_log || c.verification_log,
        }
      }))
      setVerifySessionId(null)
      setVerifySummary('')
      toast.success('Registration verified')
      vehiclesApi.formRegistrationLogs(id).then((r) => setFormLogs(r.rows || [])).catch(() => undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verify failed')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function deregisterForm(sessionId: number, photoCount: number) {
    if (!id) return
    if (!window.confirm(
      `Deregister this form submission?\n\nThis removes ${photoCount} photo(s) and clears the registration so the vehicle can be submitted again via /capture.`,
    )) return
    setDeregisterBusy(true)
    try {
      const res = await vehiclesApi.deregisterFormSession(id, sessionId)
      const removed = Number(res.payload?.photos_removed ?? photoCount)
      setCaptures((list) => list.filter((c) => c.session_id !== sessionId))
      setVehicle((cur) => (cur
        ? { ...cur, captures_count: Math.max(0, (cur.captures_count || 0) - removed) }
        : cur))
      toast.success(Array.isArray(res.messages) ? res.messages.join(' ') : 'Form registration removed')
      vehiclesApi.formRegistrationLogs(id).then((r) => setFormLogs(r.rows || [])).catch(() => undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deregister failed')
    } finally {
      setDeregisterBusy(false)
    }
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'captures', label: 'Photos', count: v.captures_count || captures.length || 0 },
    { id: 'attachments', label: 'Documents', count: files.length || undefined },
    { id: 'maintenance', label: 'Maintenance', count: v.maintenances_count || maintenances.length || 0 },
    { id: 'assignments', label: 'Assignments', count: assignments.length || undefined },
    { id: 'form-logs', label: 'Registration logs', count: formLogs.length || undefined },
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
    window.setTimeout(() => {
      const el = assignRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('vad-card--highlight')
      // reflow so the highlight animation can replay
      void el.offsetWidth
      el.classList.add('vad-card--highlight')
      window.setTimeout(() => el.classList.remove('vad-card--highlight'), 2400)
    }, 60)
  }

  function openCaptureFromHero() {
    autoCaptureStarted.current = false
    const next = new URLSearchParams(params)
    next.set('tab', 'captures')
    next.set('capture', '1')
    setParams(next)
  }

  function onQuick(action: 'service' | 'inspection' | 'rc' | 'activity') {
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
      setTab('assignments')
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
          onCapture={openCaptureFromHero}
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
          <div className="vad-panel" ref={photosPanelRef}>
            <div className="vad-panel__bar">
              <h3>Photo captures</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={gpsBusy}
                  onClick={() => void startCapture()}
                >
                  <i className="fas fa-camera" /> {gpsBusy ? 'Getting GPS…' : 'Take photo'}
                </button>
              </div>
            </div>
            {gpsBusy ? (
              <div className="vc-native-arm vc-native-arm--busy" role="status">
                <div className="vc-gps-pulse" aria-hidden />
                <div>
                  <strong>Getting GPS…</strong>
                  <p>Locking your location. Camera opens automatically when ready.</p>
                </div>
              </div>
            ) : null}
            {nativeCamArmed && !gpsBusy ? (
              <div className="vc-native-arm" role="status">
                <div>
                  <strong>Opening camera…</strong>
                  <p>
                    {captureGps
                      ? `Location locked (±${Math.round(captureGps.accuracyM)} m). If the camera did not open, tap below — then shoot and confirm.`
                      : 'Location unavailable — we will try GPS from the photo. If the camera did not open, tap below.'}
                  </p>
                </div>
                <div className="vc-native-arm__actions">
                  <button type="button" className="btn btn-primary" onClick={openNativeCameraNow}>
                    <i className="fas fa-camera" /> Open camera
                  </button>
                  <button type="button" className="btn btn-default" onClick={() => setNativeCamArmed(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                setNativeCamArmed(false)
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onNativeCameraFile(f)
              }}
            />
            <VehicleWebcamCapture
              open={webcamOpen}
              vehicleLabel={v.vehicle_number}
              initialPos={captureGps}
              onClose={() => setWebcamOpen(false)}
              onCapture={(file, position) => { void processFile(file, position) }}
            />
            <>
                {formRegistrations.map((reg, idx) => (
                  <section
                    key={reg.key}
                    ref={idx === 0 ? formRegRef : undefined}
                    className={`vc-form-reg${reg.verifiedAt ? ' vc-form-reg--verified' : ''}`}
                  >
                    <div className="vc-form-reg__head">
                      <span className="vc-form-reg__badge">Form registration</span>
                      {reg.verifiedAt ? (
                        <span className="vc-form-reg__badge vc-form-reg__badge--verified">
                          <i className="fas fa-check-circle" aria-hidden /> Verified
                        </span>
                      ) : (
                        <span className="vc-form-reg__badge vc-form-reg__badge--pending">Pending review</span>
                      )}
                      <h4>Public capture submission</h4>
                      {canVerify && reg.sessionId != null ? (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-theme btn-sm"
                            disabled={verifyBusy || deregisterBusy}
                            onClick={() => {
                              setVerifySessionId(reg.sessionId)
                              setVerifySummary(reg.verifiedSummary || '')
                            }}
                          >
                            <i className="fas fa-check" /> {reg.verifiedAt ? 'Re-verify' : 'Verify'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={verifyBusy || deregisterBusy}
                            onClick={() => { void deregisterForm(reg.sessionId!, reg.photos.length) }}
                            title="Remove form photos and allow re-registration"
                          >
                            <i className="fas fa-undo" /> {deregisterBusy ? 'Removing…' : 'Deregister'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <dl className="vc-form-reg__meta">
                      <div><dt>Vehicle number</dt><dd>{reg.vehicleNumber}</dd></div>
                      <div><dt>Full name</dt><dd>{reg.name || '—'}</dd></div>
                      <div><dt>Email</dt><dd>{reg.email || '—'}</dd></div>
                      <div><dt>Phone number</dt><dd>{reg.phone || '—'}</dd></div>
                      <div><dt>Files</dt><dd>{countFormRegistrationPhotos(reg.photos)} photo(s)</dd></div>
                      {reg.verifiedAt ? (
                        <>
                          <div><dt>Verified at</dt><dd>{formatAppDateTime(reg.verifiedAt)}</dd></div>
                          <div><dt>Verified by</dt><dd>{reg.verifiedByName || '—'}</dd></div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <dt>Summary</dt>
                            <dd>{reg.verifiedSummary || '—'}</dd>
                          </div>
                        </>
                      ) : null}
                    </dl>
                    {reg.verificationLog.length > 0 || formLogs.length > 0 ? (
                      <p className="pcf-hint" style={{ margin: '0 0 12px' }}>
                        Full register / verify / deregister history is on the{' '}
                        <button type="button" className="btn-link" style={{ padding: 0, border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('form-logs')}>
                          Registration logs
                        </button>
                        {' '}tab.
                      </p>
                    ) : null}
                  </section>
                ))}

                {verifySessionId != null ? createPortal(
                  <div className="vc-verify-modal" role="dialog" aria-modal="true" aria-labelledby="vc-verify-title">
                    <div className="vc-verify-modal__card">
                      <h3 id="vc-verify-title">Verify form registration</h3>
                      <p>Confirm you have reviewed the photos. Add a short summary for the audit log.</p>
                      <label className="vc-verify-modal__label" htmlFor="vc-verify-summary">Summary</label>
                      <textarea
                        id="vc-verify-summary"
                        className="form-control"
                        rows={4}
                        value={verifySummary}
                        onChange={(e) => setVerifySummary(e.target.value)}
                        placeholder="e.g. Photos match vehicle, plates clear, GPS looks correct"
                        maxLength={2000}
                        autoFocus
                      />
                      <div className="vc-verify-modal__actions">
                        <button
                          type="button"
                          className="btn btn-default"
                          disabled={verifyBusy}
                          onClick={() => { setVerifySessionId(null); setVerifySummary('') }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-theme"
                          disabled={verifyBusy || !verifySummary.trim()}
                          onClick={() => { void submitVerify() }}
                        >
                          {verifyBusy ? 'Saving…' : 'Confirm verified'}
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body,
                ) : null}

                <FormRegistrationCaptures
                  photos={captures}
                  pending={pending.map((p) => ({
                    localId: p.localId,
                    previewUrl: p.previewUrl,
                    capturedAt: p.capturedAt,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    address: p.address,
                    uploading: p.uploading,
                    statusText: p.statusText,
                    error: p.error,
                    onDismiss: () => setPending((list) => list.filter((x) => x.localId !== p.localId)),
                  }))}
                  busy={busy}
                  onRemove={async (captureId) => {
                    if (!window.confirm('Delete capture?')) return
                    await vehiclesApi.deleteCapture(id!, captureId)
                    setCaptures((list) => list.filter((x) => x.id !== captureId))
                    setVehicle((cur) => (cur ? { ...cur, captures_count: Math.max(0, (cur.captures_count || 1) - 1) } : cur))
                  }}
                />
              </>
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
              <>
              <div className="table-responsive data-table-desktop">
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
              </div>
              <div className="data-table-mobile" aria-label="Documents">
                {files.map((f) => (
                  <article key={String(f.id)} className="data-card">
                    <div className="data-card-title">
                      <a href={String(f.url)} target="_blank" rel="noreferrer">
                        {String(f.original_filename || f.filename)}
                      </a>
                    </div>
                    <dl className="data-card-fields">
                      <div className="data-card-field"><dt>Type</dt><dd>{String(f.kind)}</dd></div>
                      <div className="data-card-field"><dt>Uploaded</dt><dd>{String(f.created_at || '-')}</dd></div>
                      <div className="data-card-field"><dt>Status</dt><dd><span className="vad-badge-soft">Uploaded</span></dd></div>
                    </dl>
                    <div className="data-card-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          await vehiclesApi.deleteFile(String(f.id))
                          setFiles((list) => list.filter((x) => x.id !== f.id))
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              </>
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
                        <div className="vad-timeline__actions">
                          <button
                            type="button"
                            className="btn btn-xs btn-default"
                            onClick={() => setViewingMaint(m)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-danger"
                            onClick={async () => {
                              if (!window.confirm('Delete this maintenance record?')) return
                              await vehiclesApi.deleteMaintenance(id!, m.id)
                              setMaintenances((list) => list.filter((x) => x.id !== m.id))
                              if (viewingMaint?.id === m.id) setViewingMaint(null)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {viewingMaint ? createPortal(
          <div className="rm-modal-overlay" role="presentation" onClick={() => setViewingMaint(null)}>
            <div
              className="rm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="maint-view-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rm-modal__head">
                <h3 id="maint-view-title">{viewingMaint.title || 'Service record'}</h3>
                <button type="button" className="rm-modal__close" onClick={() => setViewingMaint(null)} aria-label="Close">×</button>
              </div>
              <div className="vad-maint-detail">
                <div className="vad-maint-detail__row">
                  <span>Type</span>
                  <strong>{viewingMaint.maintenance_type || '—'}</strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Start date</span>
                  <strong>{viewingMaint.start_date || '—'}</strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Completion</span>
                  <strong>{viewingMaint.completion_date || '—'}</strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Cost</span>
                  <strong>
                    {viewingMaint.cost != null
                      ? `\u20B9${Number(viewingMaint.cost).toLocaleString('en-IN')}`
                      : '—'}
                  </strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Odometer</span>
                  <strong>
                    {viewingMaint.odometer_km != null
                      ? `${Number(viewingMaint.odometer_km).toLocaleString('en-IN')} km`
                      : '—'}
                  </strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Vendor</span>
                  <strong>{viewingMaint.vendor_name || '—'}</strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Warranty</span>
                  <strong>{viewingMaint.is_warranty ? 'Yes' : 'No'}</strong>
                </div>
                {viewingMaint.parts_replaced ? (
                  <div className="vad-maint-detail__block">
                    <span>Parts / details</span>
                    <p>{viewingMaint.parts_replaced}</p>
                  </div>
                ) : null}
                {viewingMaint.note ? (
                  <div className="vad-maint-detail__block">
                    <span>Notes</span>
                    <p>{viewingMaint.note}</p>
                  </div>
                ) : null}
                <div className="vad-maint-detail__row">
                  <span>Logged by</span>
                  <strong>{viewingMaint.created_by_name || '—'}</strong>
                </div>
                <div className="vad-maint-detail__row">
                  <span>Logged at</span>
                  <strong>{viewingMaint.created_at || '—'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn btn-default" onClick={() => setViewingMaint(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    if (!id || !window.confirm('Delete this maintenance record?')) return
                    await vehiclesApi.deleteMaintenance(id, viewingMaint.id)
                    setMaintenances((list) => list.filter((x) => x.id !== viewingMaint.id))
                    setViewingMaint(null)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        {tab === 'assignments' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar">
              <h3>Assign / unassign history</h3>
              <button type="button" className="btn btn-default btn-sm" onClick={focusAssignment}>
                Current assignment
              </button>
            </div>
            {assignments.length === 0 ? (
              <div className="vad-empty">
                <strong>No assignment records yet</strong>
                Assign or unassign this vehicle from Overview — entries appear here only.
              </div>
            ) : (
              <ul className="vad-timeline">
                {assignments.map((a) => {
                  const assignee = String(a.assignee_name || a.driver_name || '—')
                  const kind = String(a.assignment_kind || a.assigned_type || 'Assignee')
                  const open = !a.unassigned_at
                  return (
                    <li key={String(a.id)}>
                      <span className={`vad-timeline__dot${open ? '' : ' vad-timeline__dot--muted'}`} />
                      <div className="vad-timeline__body">
                        <strong>{open ? 'Assigned' : 'Unassigned'}</strong>
                        <span>
                          {assignee}
                          {kind ? ` · ${kind}` : ''}
                          {a.assign_note ? ` · ${String(a.assign_note)}` : ''}
                          {!open && a.unassign_note ? ` · Unassign: ${String(a.unassign_note)}` : ''}
                        </span>
                        <span className="vad-timeline__meta">
                          Assigned {String(a.assigned_at || '—')}
                          {a.assigned_by_name ? ` by ${String(a.assigned_by_name)}` : ''}
                          {!open ? (
                            <>
                              {' · '}Unassigned {String(a.unassigned_at)}
                              {a.unassigned_by_name ? ` by ${String(a.unassigned_by_name)}` : ''}
                            </>
                          ) : (
                            ' · Currently assigned'
                          )}
                        </span>
                      </div>
                      <div className="vad-timeline__time">
                        <span className={`vad-assign-pill${open ? ' vad-assign-pill--open' : ''}`}>
                          {open ? 'Active' : 'Closed'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'form-logs' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar">
              <h3>Registration logs</h3>
            </div>
            <p className="vad-panel__hint" style={{ margin: '0 0 12px', color: 'var(--muted, #64748b)', fontSize: '0.9rem' }}>
              Register, verify, and deregister events for this vehicle&apos;s public capture form.
            </p>
            {formLogs.length === 0 ? (
              <div className="vad-empty">
                <strong>No registration activity yet</strong>
                Submissions from <code>/capture</code> and verify / deregister actions appear here.
              </div>
            ) : (
              <ul className="vad-timeline">
                {formLogs.map((h) => {
                  const action = String(h.action_type || '').toLowerCase()
                  const detail = formLogDetail(h)
                  const when = String(h.action_date || h.created_at || '')
                  return (
                    <li key={String(h.id)}>
                      <span className={`vad-timeline__dot${action === 'deregistered' || action === 'deverified' ? ' vad-timeline__dot--muted' : ''}`} />
                      <div className="vad-timeline__body">
                        <strong>{formatVehicleAction(action === 'uploaded' ? 'registered' : action)}</strong>
                        <span>
                          {String(h.actor_name || 'Public / System')}
                          {detail ? ` · ${detail}` : ''}
                        </span>
                      </div>
                      <div className="vad-timeline__time">{when ? formatAppDateTime(when) : '—'}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="vad-panel">
            <div className="vad-panel__bar"><h3>Activity</h3></div>
            {history.length === 0 ? (
              <div className="vad-empty">
                <strong>No other activity yet</strong>
                Uploads, maintenance, and QR events appear here. Assign / unassign is under the Assignments tab.
              </div>
            ) : (
              <ul className="vad-timeline">
                {history.map((h) => (
                  <li key={String(h.id)}>
                    <span className="vad-timeline__dot" />
                    <div className="vad-timeline__body">
                      <strong>{formatVehicleAction(String(h.action_type || 'Activity'))}</strong>
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
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || qrBusy} onClick={() => void refreshQr()}>
                {busy || qrBusy ? 'Working…' : 'Generate / refresh'}
              </button>
            </div>
            {(v.qr_token || v.qr_url || qrDataUrl) ? (
              <div className="rm-qr" id="vehicle-qr-print">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Vehicle QR" />
                ) : (
                  <div className="rm-qr__skeleton" aria-busy="true">
                    {qrBusy ? 'Building QR…' : 'QR unavailable — tap Generate / refresh'}
                  </div>
                )}
                <div className="rm-qr__plate">{v.vehicle_number}</div>
                <div className="rm-qr__model">
                  Asset ID {v.id}
                  {v.fleet_id ? ` · Fleet ${v.fleet_id}` : ''}
                </div>
                <div className="rm-qr__hint no-print">
                  Scan opens {v.qr_token ? vehiclePublicScanUrl(String(v.qr_token), v.qr_url) : (v.qr_url || 'public vehicle page')}
                </div>
                <div className="rm-page-actions no-print" style={{ justifyContent: 'center' }}>
                  <a
                    className="btn btn-default btn-sm"
                    href={qrDataUrl || '#'}
                    download={`${v.vehicle_number || 'vehicle'}-qr.png`}
                    onClick={(e) => {
                      if (!qrDataUrl) {
                        e.preventDefault()
                        toast.error('Generate the QR first')
                      }
                    }}
                  >
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
                    onClick={printVehicleQr}
                    disabled={!qrDataUrl}
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
