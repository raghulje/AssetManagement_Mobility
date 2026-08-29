import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
// import VehicleVideoCapture from '../../components/VehicleVideoCapture' // walkaround video disabled
import { stampGpsOnImage, fetchGpsStaticMapUrl } from '../../lib/stampGpsOnImage'
import {
  requestLocationAccess,
  type PrecisePosition,
} from '../../lib/preciseLocation'
import './public-capture-form.css'

type VehicleHit = {
  id: number
  vehicle_number: string
  model?: string | null
  location_name?: string | null
  text: string
  form_registered?: boolean
}

type EmployeeHit = {
  id: number
  employee_code: string
  name: string
  email?: string | null
  mobile?: string | null
  work_mobile?: string | null
  text: string
}

type PhotoBucket = 'vehicle' | 'odometer' | 'chassis'

type LocalPhoto = {
  id: string
  file: File
  previewUrl: string
  latitude?: number | null
  longitude?: number | null
  address?: string | null
}

type FieldErrors = {
  vehicle?: string
  employee?: string
  email?: string
  phone?: string
  vehiclePhotos?: string
  odometer?: string
  chassis?: string
  // video?: string // walkaround video disabled
}

const MAX_VEHICLE_PHOTOS = 20
const MIN_VEHICLE_PHOTOS = 4
const CHASSIS_REQUIRED = 3

const PHOTO_BUCKETS: Record<PhotoBucket, {
  label: string
  hint: string
  min: number
  max: number
  field: string
  errorKey: keyof FieldErrors
}> = {
  vehicle: {
    label: 'Vehicle photos',
    hint: `Take at least ${MIN_VEHICLE_PHOTOS} GPS-stamped photos of the vehicle (different angles).`,
    min: MIN_VEHICLE_PHOTOS,
    max: MAX_VEHICLE_PHOTOS,
    field: 'photos',
    errorKey: 'vehiclePhotos',
  },
  odometer: {
    label: 'Odometer reading',
    hint: 'Capture one clear photo of the odometer / mileage display.',
    min: 1,
    max: 1,
    field: 'odometer_photo',
    errorKey: 'odometer',
  },
  chassis: {
    label: 'Capture chassis',
    hint: 'Take exactly 3 clear photos of the engine chassis.',
    min: CHASSIS_REQUIRED,
    max: CHASSIS_REQUIRED,
    field: 'chassis_photos',
    errorKey: 'chassis',
  },
}

function emptyBuckets(): Record<PhotoBucket, LocalPhoto[]> {
  return { vehicle: [], odometer: [], chassis: [] }
}

const CAPTURE_SECTION_ORDER: PhotoBucket[] = [
  'vehicle',
  'odometer',
  'chassis',
]
// Walkaround video section disabled — unreliable on mobile browsers.
// const CAPTURE_SECTION_ORDER: Array<PhotoBucket | 'video'> = ['vehicle', 'odometer', 'video', 'chassis']

function formatSqlDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function gpsIsFresh(pos: PrecisePosition | null | undefined, maxAgeMs = 120_000) {
  if (!pos || !Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude)) return false
  const t = pos.capturedAt instanceof Date
    ? pos.capturedAt.getTime()
    : Date.parse(String(pos.capturedAt))
  return Number.isFinite(t) && Date.now() - t <= maxAgeMs
}

function ReqLabel({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    <label className="pcf-label" htmlFor={htmlFor}>
      {children} <span className="pcf-req" aria-hidden>*</span>
    </label>
  )
}

function combinePhones(mobile?: string | null, workMobile?: string | null) {
  return [mobile, workMobile].map((p) => String(p || '').trim()).filter(Boolean)
}

async function publicReverseGeocode(lat: number, lng: number) {
  try {
    const r = await fetch(`/api/v1/public/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`)
    if (!r.ok) return null
    return await r.json() as {
      address?: string | null
      formatted_address?: string | null
      locality_header?: string | null
    }
  } catch {
    return null
  }
}

export default function PublicCaptureForm() {
  const vehicleListId = useId()
  const heldGpsRef = useRef<PrecisePosition | null>(null)
  const searchTimer = useRef<number | null>(null)
  const empLookupTimer = useRef<number | null>(null)
  const photosRef = useRef<Record<PhotoBucket, LocalPhoto[]>>(emptyBuckets())

  const [vehicleQuery, setVehicleQuery] = useState('')
  const [vehicleHits, setVehicleHits] = useState<VehicleHit[]>([])
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [vehicleBusy, setVehicleBusy] = useState(false)
  const [selected, setSelected] = useState<VehicleHit | null>(null)

  const [employeeCode, setEmployeeCode] = useState('')
  const [employeeIdPlaceholder, setEmployeeIdPlaceholder] = useState('e.g. RGML011182')
  const [employeeIdHint, setEmployeeIdHint] = useState('Enter your HRMS Employee ID exactly as shown in payroll (example: RGML011182).')
  const [employeeBusy, setEmployeeBusy] = useState(false)
  const [employeeLookupError, setEmployeeLookupError] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeHit | null>(null)

  const [photoBuckets, setPhotoBuckets] = useState<Record<PhotoBucket, LocalPhoto[]>>(emptyBuckets)
  const [activeBucket, setActiveBucket] = useState<PhotoBucket | null>(null)
  // const [walkaroundVideo, setWalkaroundVideo] = useState<{ file: File; previewUrl: string } | null>(null)

  const [captureGps, setCaptureGps] = useState<PrecisePosition | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [webcamOpen, setWebcamOpen] = useState(false)
  // const [videoOpen, setVideoOpen] = useState(false)
  const [stamping, setStamping] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<{ vehicle_number: string; photo_count: number } | null>(null)

  const populatedEmail = String(selectedEmployee?.email || '').trim()
  const populatedPhones = combinePhones(selectedEmployee?.mobile, selectedEmployee?.work_mobile)
  const populatedName = String(selectedEmployee?.name || '').trim()

  useEffect(() => {
    photosRef.current = photoBuckets
  }, [photoBuckets])

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/public/employees/id-format-hint')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const item = data?.item || data?.data || data
        if (item?.placeholder) setEmployeeIdPlaceholder(String(item.placeholder))
        if (item?.hint) setEmployeeIdHint(String(item.hint))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const searchVehicles = useCallback((q: string) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    const term = q.trim()
    if (term.length < 1) {
      setVehicleHits([])
      setVehicleBusy(false)
      return
    }
    setVehicleBusy(true)
    searchTimer.current = window.setTimeout(() => {
      fetch(`/api/v1/public/vehicles/search?q=${encodeURIComponent(term)}`)
        .then(async (r) => {
          const data = await r.json()
          if (!r.ok) throw new Error((data.messages || []).join(', ') || 'Search failed')
          setVehicleHits(Array.isArray(data.rows) ? data.rows : [])
        })
        .catch(() => setVehicleHits([]))
        .finally(() => setVehicleBusy(false))
    }, 220)
  }, [])

  const lookupEmployee = useCallback((raw: string) => {
    if (empLookupTimer.current) window.clearTimeout(empLookupTimer.current)
    const code = raw.trim()
    if (code.length < 1) {
      setSelectedEmployee(null)
      setEmployeeLookupError('')
      setEmployeeBusy(false)
      return
    }
    setEmployeeBusy(true)
    setEmployeeLookupError('')
    empLookupTimer.current = window.setTimeout(() => {
      fetch(`/api/v1/public/employees/lookup?code=${encodeURIComponent(code)}`)
        .then(async (r) => {
          const data = await r.json().catch(() => ({}))
          if (!r.ok) {
            setSelectedEmployee(null)
            setEmployeeLookupError((data.messages || []).join(', ') || 'Employee ID not found')
            return
          }
          const hit = (data.payload || data) as EmployeeHit
          if (!hit?.id) {
            setSelectedEmployee(null)
            setEmployeeLookupError('Employee ID not found')
            return
          }
          setSelectedEmployee(hit)
          setEmployeeLookupError('')
          setFieldErrors((fe) => ({ ...fe, employee: undefined, email: undefined, phone: undefined }))
        })
        .catch(() => {
          setSelectedEmployee(null)
          setEmployeeLookupError('Could not look up employee ID')
        })
        .finally(() => setEmployeeBusy(false))
    }, 350)
  }, [])

  useEffect(() => () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (empLookupTimer.current) window.clearTimeout(empLookupTimer.current)
    Object.values(photosRef.current).flat().forEach((p) => URL.revokeObjectURL(p.previewUrl))
  }, [])

  async function startGpsCamera(bucket: PhotoBucket) {
    if (selected?.form_registered) return
    const cfg = PHOTO_BUCKETS[bucket]
    const current = photosRef.current[bucket]
    if (current.length >= cfg.max) {
      setError(`Maximum ${cfg.max} photo${cfg.max === 1 ? '' : 's'} for ${cfg.label.toLowerCase()}`)
      return
    }
    setError('')
    setActiveBucket(bucket)

    const warm = gpsIsFresh(captureGps)
      ? captureGps
      : gpsIsFresh(heldGpsRef.current)
        ? heldGpsRef.current
        : null

    if (warm) {
      heldGpsRef.current = warm
      setCaptureGps(warm)
      setWebcamOpen(true)
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
        setError(loc.message || 'GPS not ready yet — camera will keep trying.')
      }
      setWebcamOpen(true)
    } finally {
      setGpsBusy(false)
    }
  }

  async function stampAndAdd(bucket: PhotoBucket, file: File, pos: PrecisePosition | null) {
    const cfg = PHOTO_BUCKETS[bucket]
    if (photosRef.current[bucket].length >= cfg.max) {
      setError(`Maximum ${cfg.max} photo${cfg.max === 1 ? '' : 's'} for ${cfg.label.toLowerCase()}`)
      return
    }
    setStamping(true)
    setError('')
    try {
      let address: string | null = null
      let localityHeader: string | null = null
      let mapImageUrl: string | null = null
      const latitude = pos?.latitude ?? null
      const longitude = pos?.longitude ?? null

      if (latitude != null && longitude != null) {
        const geo = await Promise.race([
          publicReverseGeocode(latitude, longitude),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 8000) }),
        ])
        if (geo) {
          address = (typeof geo.address === 'string' ? geo.address : null)
            || (typeof geo.formatted_address === 'string' ? geo.formatted_address : null)
          localityHeader = typeof geo.locality_header === 'string' ? geo.locality_header : null
        }
        mapImageUrl = await Promise.race([
          fetchGpsStaticMapUrl(latitude, longitude, 400, { publicAccess: true }),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 6000) }),
        ])
      }

      const stamped = await stampGpsOnImage(file, {
        capturedAt: pos?.capturedAt || new Date(),
        latitude,
        longitude,
        address,
        localityHeader,
        accuracyM: pos?.accuracyM ?? null,
        vehicleNumber: selected?.vehicle_number || null,
        label: 'GPS Map Camera',
        mapImageUrl,
      })
      if (mapImageUrl) URL.revokeObjectURL(mapImageUrl)

      const previewUrl = URL.createObjectURL(stamped)
      setPhotoBuckets((prev) => ({
        ...prev,
        [bucket]: [...prev[bucket], {
          id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file: stamped,
          previewUrl,
          latitude,
          longitude,
          address,
        }].slice(0, cfg.max),
      }))
      setFieldErrors((fe) => ({ ...fe, [cfg.errorKey]: undefined }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stamp GPS photo')
    } finally {
      setStamping(false)
    }
  }

  function removePhoto(bucket: PhotoBucket, id: string) {
    setPhotoBuckets((prev) => {
      const hit = prev[bucket].find((p) => p.id === id)
      if (hit) URL.revokeObjectURL(hit.previewUrl)
      return { ...prev, [bucket]: prev[bucket].filter((p) => p.id !== id) }
    })
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!selected?.id) next.vehicle = 'Select a vehicle number from the list'
    else if (selected.form_registered) next.vehicle = 'This vehicle is already registered'
    if (!selectedEmployee?.id) {
      next.employee = employeeCode.trim()
        ? (employeeLookupError || 'Enter a valid active employee ID')
        : 'Enter your employee ID'
    }
    if (!populatedEmail) next.email = 'Selected employee has no email in HRMS'
    if (populatedPhones.length < 1) next.phone = 'Selected employee has no mobile / work mobile in HRMS'
    if (photoBuckets.vehicle.length < PHOTO_BUCKETS.vehicle.min) {
      next.vehiclePhotos = `Take at least ${MIN_VEHICLE_PHOTOS} vehicle photos`
    }
    if (photoBuckets.odometer.length < PHOTO_BUCKETS.odometer.min) next.odometer = 'Odometer photo is required'
    if (photoBuckets.chassis.length < PHOTO_BUCKETS.chassis.min) next.chassis = `Take exactly ${CHASSIS_REQUIRED} chassis photos`
    // if (!walkaroundVideo) next.video = 'Record the 30 second walkaround video'
    return next
  }

  const totalFiles = useMemo(
    () => Object.values(photoBuckets).reduce((n, arr) => n + arr.length, 0),
    [photoBuckets],
  )

  const canSubmit = useMemo(() => {
    if (submitting || selected?.form_registered || gpsBusy || stamping) return false
    return Boolean(
      selected?.id
      && selectedEmployee?.id
      && populatedEmail
      && populatedPhones.length >= 1
      && photoBuckets.vehicle.length >= PHOTO_BUCKETS.vehicle.min
      && photoBuckets.odometer.length >= PHOTO_BUCKETS.odometer.min
      && photoBuckets.chassis.length >= PHOTO_BUCKETS.chassis.min,
    )
  }, [selected, selectedEmployee, populatedEmail, populatedPhones.length, photoBuckets, submitting, gpsBusy, stamping])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      setError(
        errs.vehicle || errs.employee || errs.email || errs.phone
        || errs.vehiclePhotos || errs.odometer || errs.chassis
        || 'Please fix the highlighted fields',
      )
      return
    }
    if (!selected || !selectedEmployee) return

    setSubmitting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_id', String(selected.id))
      fd.append('employee_id', String(selectedEmployee.id))
      fd.append('employee_code', selectedEmployee.employee_code || employeeCode.trim())
      fd.append('captured_at', formatSqlDate(heldGpsRef.current?.capturedAt || new Date()))
      const lat = Object.values(photoBuckets).flat().find((p) => p.latitude != null)?.latitude ?? heldGpsRef.current?.latitude
      const lng = Object.values(photoBuckets).flat().find((p) => p.longitude != null)?.longitude ?? heldGpsRef.current?.longitude
      const address = Object.values(photoBuckets).flat().find((p) => p.address)?.address || null
      if (lat != null && lng != null) {
        fd.append('latitude', String(lat))
        fd.append('longitude', String(lng))
      }
      if (address) fd.append('address', address)
      for (const p of photoBuckets.vehicle) fd.append('photos', p.file, p.file.name || 'photo.jpg')
      for (const p of photoBuckets.odometer) fd.append('odometer_photo', p.file, p.file.name || 'odometer.jpg')
      for (const p of photoBuckets.chassis) fd.append('chassis_photos', p.file, p.file.name || 'chassis.jpg')
      /* walkaround video disabled
      if (walkaroundVideo) {
        const ext = walkaroundVideo.file.type.includes('mp4') ? '.mp4' : '.webm'
        fd.append(
          'walkaround_video',
          walkaroundVideo.file,
          walkaroundVideo.file.name || `walkaround${ext}`,
        )
      }
      */

      const r = await fetch('/api/v1/public/capture-form', { method: 'POST', body: fd })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error((data.messages || []).join(', ') || 'Submit failed')
      }
      Object.values(photoBuckets).flat().forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setPhotoBuckets(emptyBuckets())
      setDone({
        vehicle_number: String(data.payload?.vehicle_number || selected.vehicle_number),
        photo_count: Number(data.payload?.photo_count || totalFiles),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setDone(null)
    setSelected(null)
    setVehicleQuery('')
    setVehicleHits([])
    setSelectedEmployee(null)
    setEmployeeCode('')
    setEmployeeLookupError('')
    setError('')
    setFieldErrors({})
    setWebcamOpen(false)
    setPhotoBuckets(emptyBuckets())
  }

  return (
    <div className="pcf-page">
      <div className="pcf-bg" aria-hidden />
      <header className="pcf-top">
        <img src="/mobility_logo.png" alt="Refex Mobility" className="pcf-logo" />
        <div>
          <strong>Vehicle photo capture</strong>
          <p>Share this form with field teams — photos go straight onto the vehicle record.</p>
        </div>
      </header>

      <main className="pcf-card">
        {done ? (
          <div className="pcf-success" role="status">
            <div className="pcf-success__icon" aria-hidden>✓</div>
            <h1>Submitted</h1>
            <p>
              {done.photo_count} file{done.photo_count === 1 ? '' : 's'} added to{' '}
              <strong>{done.vehicle_number}</strong>.
            </p>
            <button type="button" className="pcf-btn pcf-btn--primary" onClick={resetForm}>
              Capture another vehicle
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => { void onSubmit(e) }} noValidate>
            <h1>Capture vehicle photos</h1>
            <p className="pcf-lead">
              All fields marked <span className="pcf-req">*</span> are mandatory.
            </p>

            {error ? <div className="pcf-error" role="alert">{error}</div> : null}
            {selected?.form_registered ? (
              <div className="pcf-warn" role="alert">
                This vehicle is already registered. Another form entry cannot be submitted.
              </div>
            ) : null}

            <ReqLabel htmlFor="pcf-vehicle">Vehicle number</ReqLabel>
            <div className="pcf-vehicle">
              <input
                id="pcf-vehicle"
                className={`pcf-input${fieldErrors.vehicle || selected?.form_registered ? ' is-invalid' : ''}`}
                role="combobox"
                aria-expanded={vehicleOpen}
                aria-controls={vehicleListId}
                aria-autocomplete="list"
                placeholder="Search registration / plate…"
                value={selected ? selected.vehicle_number : vehicleQuery}
                onChange={(e) => {
                  setSelected(null)
                  setVehicleQuery(e.target.value)
                  setVehicleOpen(true)
                  setFieldErrors((fe) => ({ ...fe, vehicle: undefined }))
                  searchVehicles(e.target.value)
                }}
                onFocus={() => {
                  setVehicleOpen(true)
                  if (!selected && vehicleQuery.trim()) searchVehicles(vehicleQuery)
                }}
                onBlur={() => {
                  window.setTimeout(() => setVehicleOpen(false), 180)
                }}
                autoComplete="off"
                required
              />
              {vehicleBusy ? <span className="pcf-hint">Searching…</span> : null}
              {fieldErrors.vehicle ? <span className="pcf-field-error">{fieldErrors.vehicle}</span> : null}
              {vehicleOpen && !selected && (vehicleHits.length > 0 || vehicleQuery.trim()) ? (
                <ul id={vehicleListId} className="pcf-menu" role="listbox">
                  {vehicleHits.length === 0 ? (
                    <li className="pcf-menu__empty">{vehicleBusy ? 'Searching…' : 'No vehicles match'}</li>
                  ) : vehicleHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        role="option"
                        className={hit.form_registered ? 'is-registered' : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelected(hit)
                          setVehicleQuery(hit.vehicle_number)
                          setVehicleOpen(false)
                          setError('')
                          setFieldErrors((fe) => ({
                            ...fe,
                            vehicle: hit.form_registered ? 'This vehicle is already registered' : undefined,
                          }))
                        }}
                      >
                        <strong>
                          {hit.vehicle_number}
                          {hit.form_registered ? <em className="pcf-badge-mini">Registered</em> : null}
                        </strong>
                        <span>{[hit.model, hit.location_name].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <ReqLabel htmlFor="pcf-employee">Employee ID</ReqLabel>
            <p className="pcf-hint pcf-hint--block">{employeeIdHint}</p>
            <input
              id="pcf-employee"
              className={`pcf-input${fieldErrors.employee || employeeLookupError ? ' is-invalid' : ''}`}
              placeholder={employeeIdPlaceholder}
              value={employeeCode}
              onChange={(e) => {
                const v = e.target.value
                setEmployeeCode(v)
                setSelectedEmployee(null)
                setEmployeeLookupError('')
                setFieldErrors((fe) => ({ ...fe, employee: undefined, email: undefined, phone: undefined }))
                lookupEmployee(v)
              }}
              onBlur={() => {
                if (employeeCode.trim()) lookupEmployee(employeeCode)
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
            {employeeBusy ? <span className="pcf-hint">Looking up…</span> : null}
            {!employeeBusy && selectedEmployee ? (
              <span className="pcf-hint pcf-hint--ok">Matched active employee — contact details filled below.</span>
            ) : null}
            {fieldErrors.employee ? <span className="pcf-field-error">{fieldErrors.employee}</span> : null}
            {!fieldErrors.employee && employeeLookupError ? (
              <span className="pcf-field-error">{employeeLookupError}</span>
            ) : null}

            <ReqLabel htmlFor="pcf-name">Full name</ReqLabel>
            <input
              id="pcf-name"
              className="pcf-input pcf-input--readonly"
              value={populatedName}
              readOnly
              placeholder="Auto-filled from employee ID"
              tabIndex={-1}
            />

            <ReqLabel htmlFor="pcf-email">Email</ReqLabel>
            <input
              id="pcf-email"
              type="email"
              className={`pcf-input pcf-input--readonly${fieldErrors.email ? ' is-invalid' : ''}`}
              value={populatedEmail}
              readOnly
              placeholder="Auto-filled from HRMS"
              tabIndex={-1}
            />
            {fieldErrors.email ? <span className="pcf-field-error">{fieldErrors.email}</span> : null}

            <ReqLabel htmlFor="pcf-mobile">Mobile</ReqLabel>
            <input
              id="pcf-mobile"
              type="tel"
              className={`pcf-input pcf-input--readonly${fieldErrors.phone && !selectedEmployee?.mobile ? ' is-invalid' : ''}`}
              value={String(selectedEmployee?.mobile || '').trim()}
              readOnly
              placeholder="Auto-filled from HRMS"
              tabIndex={-1}
            />

            <ReqLabel htmlFor="pcf-work-mobile">Work mobile</ReqLabel>
            <input
              id="pcf-work-mobile"
              type="tel"
              className="pcf-input pcf-input--readonly"
              value={String(selectedEmployee?.work_mobile || '').trim()}
              readOnly
              placeholder="Auto-filled from HRMS (if available)"
              tabIndex={-1}
            />
            {fieldErrors.phone ? <span className="pcf-field-error">{fieldErrors.phone}</span> : null}
            {selectedEmployee && populatedPhones.length > 1 ? (
              <span className="pcf-hint">Both Mobile and Work mobile will be saved with this submission.</span>
            ) : null}

            <div className="pcf-checklist" aria-label="Required captures">
              <strong>Required captures</strong>
              <ul>
                <li className={photoBuckets.vehicle.length >= MIN_VEHICLE_PHOTOS ? 'is-done' : ''}>
                  {MIN_VEHICLE_PHOTOS}+ vehicle photos
                </li>
                <li className={photoBuckets.odometer.length >= 1 ? 'is-done' : ''}>Odometer photo</li>
                <li className={photoBuckets.chassis.length >= 3 ? 'is-done' : ''}>3 chassis photos</li>
              </ul>
            </div>

            {CAPTURE_SECTION_ORDER.map((section) => {
              /* walkaround video section disabled
              if (section === 'video') {
                return (
                  <section key="video" className="pcf-capture-section pcf-capture-section--video">
                    ...
                  </section>
                )
              }
              */

              const bucket = section
              const cfg = PHOTO_BUCKETS[bucket]
              const items = photoBuckets[bucket]
              const err = fieldErrors[cfg.errorKey]
              return (
                <section key={bucket} className="pcf-capture-section">
                  <div className="pcf-photos-head">
                    <ReqLabel>{cfg.label}</ReqLabel>
                    <span className="pcf-hint">{items.length}/{cfg.max}{cfg.min > 0 ? ` · min ${cfg.min}` : ''}</span>
                  </div>
                  <p className="pcf-hint pcf-hint--block">{cfg.hint}</p>
                  <div className="pcf-photo-actions">
                    <button
                      type="button"
                      className="pcf-btn pcf-btn--primary"
                      disabled={Boolean(selected?.form_registered) || gpsBusy || items.length >= cfg.max}
                      onClick={() => { void startGpsCamera(bucket) }}
                    >
                      {gpsBusy && activeBucket === bucket ? 'Getting GPS…' : items.length > 0 ? 'Open camera again' : 'Take photo'}
                    </button>
                  </div>
                  {err ? <span className="pcf-field-error">{err}</span> : null}
                  {items.length > 0 ? (
                    <ul className="pcf-thumbs pcf-thumbs--gallery">
                      {items.map((p, i) => (
                        <li key={p.id}>
                          <img src={p.previewUrl} alt={`${cfg.label} ${i + 1}`} />
                          <span className="pcf-thumb-num">{i + 1}</span>
                          <button type="button" aria-label="Remove photo" onClick={() => removePhoto(bucket, p.id)}>×</button>
                        </li>
                      ))}
                      {items.length < cfg.max ? (
                        <li className="pcf-thumb-add">
                          <button
                            type="button"
                            disabled={gpsBusy || Boolean(selected?.form_registered)}
                            onClick={() => { void startGpsCamera(bucket) }}
                            aria-label={`Add more ${cfg.label.toLowerCase()}`}
                          >
                            <span>+</span>
                            <em>Add more</em>
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </section>
              )
            })}

            {gpsBusy ? (
              <div className="pcf-gps-overlay" role="status">
                <div className="pcf-gps-spin pcf-gps-spin--lg" aria-hidden />
                <strong>Getting GPS…</strong>
                <p>Locking your location. Camera opens automatically.</p>
              </div>
            ) : null}

            {stamping ? (
              <div className="pcf-hint pcf-hint--block">Stamping GPS on photo…</div>
            ) : null}

            <VehicleWebcamCapture
              open={webcamOpen}
              vehicleLabel={selected?.vehicle_number}
              initialPos={captureGps}
              confirmShot
              onClose={() => {
                setWebcamOpen(false)
                setActiveBucket(null)
              }}
              onCapture={(file, position) => {
                if (!activeBucket) return
                if (position) {
                  heldGpsRef.current = position
                  setCaptureGps(position)
                }
                void stampAndAdd(activeBucket, file, position || heldGpsRef.current)
              }}
            />

            {/* walkaround video disabled
            <VehicleVideoCapture
              open={videoOpen}
              vehicleLabel={selected?.vehicle_number}
              onClose={() => setVideoOpen(false)}
              onCapture={async (file) => { ... }}
            />
            */}

            <button
              type="submit"
              className="pcf-btn pcf-btn--primary pcf-btn--block"
              disabled={!canSubmit}
            >
              {submitting ? 'Submitting…' : 'Submit capture'}
            </button>
          </form>
        )}
      </main>

      <footer className="pcf-foot">Refex Mobility · Fleet photo intake</footer>
    </div>
  )
}
