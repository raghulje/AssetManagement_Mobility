import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
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
  photos?: string
}

const MAX_PHOTOS = 20

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
  const employeeListId = useId()
  const heldGpsRef = useRef<PrecisePosition | null>(null)
  const searchTimer = useRef<number | null>(null)
  const empSearchTimer = useRef<number | null>(null)
  const photosRef = useRef<LocalPhoto[]>([])

  const [vehicleQuery, setVehicleQuery] = useState('')
  const [vehicleHits, setVehicleHits] = useState<VehicleHit[]>([])
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [vehicleBusy, setVehicleBusy] = useState(false)
  const [selected, setSelected] = useState<VehicleHit | null>(null)

  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeHits, setEmployeeHits] = useState<EmployeeHit[]>([])
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [employeeBusy, setEmployeeBusy] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeHit | null>(null)

  const [photos, setPhotos] = useState<LocalPhoto[]>([])

  const [captureGps, setCaptureGps] = useState<PrecisePosition | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [stamping, setStamping] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<{ vehicle_number: string; photo_count: number } | null>(null)

  const populatedEmail = String(selectedEmployee?.email || '').trim()
  const populatedPhones = combinePhones(selectedEmployee?.mobile, selectedEmployee?.work_mobile)
  const populatedName = String(selectedEmployee?.name || '').trim()

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

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

  const searchEmployees = useCallback((q: string) => {
    if (empSearchTimer.current) window.clearTimeout(empSearchTimer.current)
    const term = q.trim()
    if (term.length < 1) {
      setEmployeeHits([])
      setEmployeeBusy(false)
      return
    }
    setEmployeeBusy(true)
    empSearchTimer.current = window.setTimeout(() => {
      fetch(`/api/v1/public/employees/search?q=${encodeURIComponent(term)}`)
        .then(async (r) => {
          const data = await r.json()
          if (!r.ok) throw new Error((data.messages || []).join(', ') || 'Search failed')
          setEmployeeHits(Array.isArray(data.rows) ? data.rows : [])
        })
        .catch(() => setEmployeeHits([]))
        .finally(() => setEmployeeBusy(false))
    }, 220)
  }, [])

  useEffect(() => () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (empSearchTimer.current) window.clearTimeout(empSearchTimer.current)
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl))
  }, [])

  /** One tap: GPS loader → automatically open in-app GPS camera */
  async function startGpsCamera() {
    if (selected?.form_registered) return
    if (photos.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos`)
      return
    }
    setError('')

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

  async function stampAndAdd(file: File, pos: PrecisePosition | null) {
    if (photosRef.current.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos`)
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
      setPhotos((prev) => [...prev, {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: stamped,
        previewUrl,
        latitude,
        longitude,
        address,
      }].slice(0, MAX_PHOTOS))
      setFieldErrors((fe) => ({ ...fe, photos: undefined }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stamp GPS photo')
    } finally {
      setStamping(false)
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const hit = prev.find((p) => p.id === id)
      if (hit) URL.revokeObjectURL(hit.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!selected?.id) next.vehicle = 'Select a vehicle number from the list'
    else if (selected.form_registered) next.vehicle = 'This vehicle is already registered'
    if (!selectedEmployee?.id) next.employee = 'Select an employee ID from the list'
    if (!populatedEmail) next.email = 'Selected employee has no email in HRMS'
    if (populatedPhones.length < 1) next.phone = 'Selected employee has no mobile / work mobile in HRMS'
    if (photos.length < 1) next.photos = 'Take at least one photo'
    return next
  }

  const canSubmit = useMemo(() => {
    if (submitting || selected?.form_registered || gpsBusy || stamping) return false
    return Boolean(
      selected?.id
      && selectedEmployee?.id
      && populatedEmail
      && populatedPhones.length >= 1
      && photos.length >= 1,
    )
  }, [selected, selectedEmployee, populatedEmail, populatedPhones.length, photos.length, submitting, gpsBusy, stamping])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      setError(errs.vehicle || errs.employee || errs.email || errs.phone || errs.photos || 'Please fix the highlighted fields')
      return
    }
    if (!selected || !selectedEmployee) return

    setSubmitting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_id', String(selected.id))
      fd.append('employee_id', String(selectedEmployee.id))
      fd.append('captured_at', formatSqlDate(heldGpsRef.current?.capturedAt || new Date()))
      const lat = photos.find((p) => p.latitude != null)?.latitude ?? heldGpsRef.current?.latitude
      const lng = photos.find((p) => p.longitude != null)?.longitude ?? heldGpsRef.current?.longitude
      const address = photos.find((p) => p.address)?.address || null
      if (lat != null && lng != null) {
        fd.append('latitude', String(lat))
        fd.append('longitude', String(lng))
      }
      if (address) fd.append('address', address)
      for (const p of photos) fd.append('photos', p.file, p.file.name || 'photo.jpg')

      const r = await fetch('/api/v1/public/capture-form', { method: 'POST', body: fd })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error((data.messages || []).join(', ') || 'Submit failed')
      }
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setPhotos([])
      setDone({
        vehicle_number: String(data.payload?.vehicle_number || selected.vehicle_number),
        photo_count: Number(data.payload?.photo_count || photos.length),
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
    setEmployeeQuery('')
    setEmployeeHits([])
    setError('')
    setFieldErrors({})
    setWebcamOpen(false)
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
              {done.photo_count} photo{done.photo_count === 1 ? '' : 's'} added to{' '}
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
              All fields marked <span className="pcf-req">*</span> are mandatory. Pick vehicle + employee ID — email and phones auto-fill from HRMS.
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
            <div className="pcf-vehicle">
              <input
                id="pcf-employee"
                className={`pcf-input${fieldErrors.employee ? ' is-invalid' : ''}`}
                role="combobox"
                aria-expanded={employeeOpen}
                aria-controls={employeeListId}
                aria-autocomplete="list"
                placeholder="Search employee ID…"
                value={selectedEmployee ? selectedEmployee.employee_code : employeeQuery}
                onChange={(e) => {
                  setSelectedEmployee(null)
                  setEmployeeQuery(e.target.value)
                  setEmployeeOpen(true)
                  setFieldErrors((fe) => ({ ...fe, employee: undefined, email: undefined, phone: undefined }))
                  searchEmployees(e.target.value)
                }}
                onFocus={() => {
                  setEmployeeOpen(true)
                  if (!selectedEmployee && employeeQuery.trim()) searchEmployees(employeeQuery)
                }}
                onBlur={() => {
                  window.setTimeout(() => setEmployeeOpen(false), 180)
                }}
                autoComplete="off"
                required
              />
              {employeeBusy ? <span className="pcf-hint">Searching…</span> : null}
              {fieldErrors.employee ? <span className="pcf-field-error">{fieldErrors.employee}</span> : null}
              {employeeOpen && !selectedEmployee && (employeeHits.length > 0 || employeeQuery.trim()) ? (
                <ul id={employeeListId} className="pcf-menu" role="listbox">
                  {employeeHits.length === 0 ? (
                    <li className="pcf-menu__empty">{employeeBusy ? 'Searching…' : 'No active employees match'}</li>
                  ) : employeeHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedEmployee(hit)
                          setEmployeeQuery(hit.employee_code)
                          setEmployeeOpen(false)
                          setError('')
                          setFieldErrors((fe) => ({ ...fe, employee: undefined, email: undefined, phone: undefined }))
                        }}
                      >
                        <strong>{hit.employee_code}</strong>
                        <span>{[hit.name, hit.email].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

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

            <div className="pcf-photos-head">
              <ReqLabel>Photos</ReqLabel>
              <span className="pcf-hint">{photos.length}/{MAX_PHOTOS}</span>
            </div>

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

            <div className="pcf-photo-actions">
              <button
                type="button"
                className="pcf-btn pcf-btn--primary"
                disabled={Boolean(selected?.form_registered) || gpsBusy || photos.length >= MAX_PHOTOS}
                onClick={() => { void startGpsCamera() }}
              >
                {gpsBusy ? 'Getting GPS…' : photos.length > 0 ? 'Open camera again' : 'Take photo'}
              </button>
            </div>

            <VehicleWebcamCapture
              open={webcamOpen}
              vehicleLabel={selected?.vehicle_number}
              initialPos={captureGps}
              confirmShot
              onClose={() => setWebcamOpen(false)}
              onCapture={(file, position) => {
                if (position) {
                  heldGpsRef.current = position
                  setCaptureGps(position)
                }
                // Keep camera open for + more shots; stamp in background
                void stampAndAdd(file, position || heldGpsRef.current)
              }}
            />
            {fieldErrors.photos ? <span className="pcf-field-error">{fieldErrors.photos}</span> : null}

            {photos.length > 0 ? (
              <ul className="pcf-thumbs pcf-thumbs--gallery">
                {photos.map((p, i) => (
                  <li key={p.id}>
                    <img src={p.previewUrl} alt={`Photo ${i + 1}`} />
                    <span className="pcf-thumb-num">{i + 1}</span>
                    <button type="button" aria-label="Remove photo" onClick={() => removePhoto(p.id)}>×</button>
                  </li>
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <li className="pcf-thumb-add">
                    <button
                      type="button"
                      disabled={gpsBusy || Boolean(selected?.form_registered)}
                      onClick={() => { void startGpsCamera() }}
                      aria-label="Add more photos"
                    >
                      <span>+</span>
                      <em>Add more</em>
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="pcf-hint pcf-hint--block">
                Tap Take photo once — GPS loads, then the camera opens. After a shot: ✕ discard, + keep &amp; add more, ✓ finish.
              </p>
            )}

            <button
              type="submit"
              className="pcf-btn pcf-btn--primary pcf-btn--block"
              disabled={!canSubmit}
            >
              {submitting ? 'Submitting…' : 'Submit photos'}
            </button>
          </form>
        )}
      </main>

      <footer className="pcf-foot">Refex Mobility · Fleet photo intake</footer>
    </div>
  )
}
