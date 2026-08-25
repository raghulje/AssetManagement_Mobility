import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import VehicleWebcamCapture from '../../components/VehicleWebcamCapture'
import { stampGpsOnImage, fetchGpsStaticMapUrl } from '../../lib/stampGpsOnImage'
import {
  preferNativePhoneCamera,
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
  name?: string
  email?: string
  phone?: string
  photos?: string
}

const MAX_PHOTOS = 20

function formatSqlDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function isValidPhone(v: string) {
  const digits = v.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  return /^[6-9]\d{9}$/.test(local)
}

function isValidName(v: string) {
  return /^[A-Za-z][A-Za-z .'-]{1,100}$/.test(v.trim())
}

function ReqLabel({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    <label className="pcf-label" htmlFor={htmlFor}>
      {children} <span className="pcf-req" aria-hidden>*</span>
    </label>
  )
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
  const fileRef = useRef<HTMLInputElement>(null)
  const heldGpsRef = useRef<PrecisePosition | null>(null)
  const searchTimer = useRef<number | null>(null)

  const [vehicleQuery, setVehicleQuery] = useState('')
  const [vehicleHits, setVehicleHits] = useState<VehicleHit[]>([])
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [vehicleBusy, setVehicleBusy] = useState(false)
  const [selected, setSelected] = useState<VehicleHit | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [photos, setPhotos] = useState<LocalPhoto[]>([])

  const [captureGps, setCaptureGps] = useState<PrecisePosition | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [nativeCamArmed, setNativeCamArmed] = useState(false)
  const [stamping, setStamping] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<{ vehicle_number: string; photo_count: number } | null>(null)

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

  useEffect(() => () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function launchNativeCamera() {
    const el = fileRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        void el.showPicker()
        return
      }
    } catch { /* fall through */ }
    el.click()
  }

  async function startGpsCamera() {
    if (selected?.form_registered) return
    if (photos.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos`)
      return
    }
    setNativeCamArmed(false)
    setError('')
    const useNative = preferNativePhoneCamera()

    setGpsBusy(true)
    try {
      const loc = await requestLocationAccess()
      if (loc.position) {
        heldGpsRef.current = loc.position
        setCaptureGps(loc.position)
      } else {
        heldGpsRef.current = null
        setCaptureGps(null)
        setError(loc.message || 'Could not get GPS. Allow Location and try again.')
      }

      if (useNative) {
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

  async function stampAndAdd(file: File, pos: PrecisePosition | null) {
    if (photos.length >= MAX_PHOTOS) {
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
      setPhotos((prev) => [{
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: stamped,
        previewUrl,
        latitude,
        longitude,
        address,
      }, ...prev].slice(0, MAX_PHOTOS))
      setFieldErrors((fe) => ({ ...fe, photos: undefined }))
      setNativeCamArmed(false)
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
    if (!name.trim()) next.name = 'Full name is required'
    else if (!isValidName(name)) next.name = 'Enter a valid name (letters only)'
    if (!email.trim()) next.email = 'Email is required'
    else if (!isValidEmail(email)) next.email = 'Enter a valid email address'
    if (!phone.trim()) next.phone = 'Phone number is required'
    else if (!isValidPhone(phone)) next.phone = 'Enter a valid 10-digit mobile number'
    if (photos.length < 1) next.photos = 'Take at least one photo'
    return next
  }

  const canSubmit = useMemo(() => {
    if (submitting || selected?.form_registered || gpsBusy || stamping) return false
    return Boolean(
      selected?.id
      && isValidName(name)
      && isValidEmail(email)
      && isValidPhone(phone)
      && photos.length >= 1,
    )
  }, [selected, name, email, phone, photos.length, submitting, gpsBusy, stamping])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      setError(errs.vehicle || errs.name || errs.email || errs.phone || errs.photos || 'Please fix the highlighted fields')
      return
    }
    if (!selected) return

    setSubmitting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_id', String(selected.id))
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
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
    setName('')
    setEmail('')
    setPhone('')
    setError('')
    setFieldErrors({})
    setNativeCamArmed(false)
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
              All fields marked <span className="pcf-req">*</span> are mandatory. Use the GPS camera — photos are stamped with location.
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

            <ReqLabel htmlFor="pcf-name">Full name</ReqLabel>
            <input
              id="pcf-name"
              className={`pcf-input${fieldErrors.name ? ' is-invalid' : ''}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setFieldErrors((fe) => ({ ...fe, name: undefined }))
              }}
              placeholder="Your name"
              required
              autoComplete="name"
            />
            {fieldErrors.name ? <span className="pcf-field-error">{fieldErrors.name}</span> : null}

            <ReqLabel htmlFor="pcf-email">Email</ReqLabel>
            <input
              id="pcf-email"
              type="email"
              className={`pcf-input${fieldErrors.email ? ' is-invalid' : ''}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldErrors((fe) => ({ ...fe, email: undefined }))
              }}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
            {fieldErrors.email ? <span className="pcf-field-error">{fieldErrors.email}</span> : null}

            <ReqLabel htmlFor="pcf-phone">Phone number</ReqLabel>
            <input
              id="pcf-phone"
              type="tel"
              className={`pcf-input${fieldErrors.phone ? ' is-invalid' : ''}`}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setFieldErrors((fe) => ({ ...fe, phone: undefined }))
              }}
              placeholder="10-digit mobile"
              required
              autoComplete="tel"
              inputMode="numeric"
              maxLength={13}
            />
            {fieldErrors.phone ? <span className="pcf-field-error">{fieldErrors.phone}</span> : null}

            <div className="pcf-photos-head">
              <ReqLabel>Photos</ReqLabel>
              <span className="pcf-hint">{photos.length}/{MAX_PHOTOS}</span>
            </div>

            {gpsBusy ? (
              <div className="pcf-gps-busy" role="status">
                <div className="pcf-gps-spin" aria-hidden />
                <div>
                  <strong>Getting GPS…</strong>
                  <p>Locking location, then opening the GPS camera.</p>
                </div>
              </div>
            ) : null}

            {nativeCamArmed && !gpsBusy ? (
              <div className="pcf-gps-busy" role="status">
                <div>
                  <strong>Opening GPS camera…</strong>
                  <p>
                    {captureGps
                      ? `Location locked (±${Math.round(captureGps.accuracyM)} m). If the camera did not open, tap below.`
                      : 'Location unavailable — try again outdoors. If the camera did not open, tap below.'}
                  </p>
                </div>
                <div className="pcf-photo-actions">
                  <button type="button" className="pcf-btn pcf-btn--primary" onClick={launchNativeCamera}>
                    Open camera
                  </button>
                  <button type="button" className="pcf-btn" onClick={() => setNativeCamArmed(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="pcf-photo-actions">
              <button
                type="button"
                className="pcf-btn pcf-btn--primary"
                disabled={Boolean(selected?.form_registered) || gpsBusy || stamping || photos.length >= MAX_PHOTOS}
                onClick={() => { void startGpsCamera() }}
              >
                {gpsBusy ? 'Getting GPS…' : stamping ? 'Stamping GPS…' : 'Take photo'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="pcf-sr"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void stampAndAdd(f, heldGpsRef.current || captureGps)
              }}
            />
            <VehicleWebcamCapture
              open={webcamOpen}
              vehicleLabel={selected?.vehicle_number}
              initialPos={captureGps}
              onClose={() => setWebcamOpen(false)}
              onCapture={(file, position) => {
                setWebcamOpen(false)
                if (position) {
                  heldGpsRef.current = position
                  setCaptureGps(position)
                }
                void stampAndAdd(file, position || heldGpsRef.current)
              }}
            />
            {fieldErrors.photos ? <span className="pcf-field-error">{fieldErrors.photos}</span> : null}

            {photos.length > 0 ? (
              <ul className="pcf-thumbs">
                {photos.map((p) => (
                  <li key={p.id}>
                    <img src={p.previewUrl} alt="" />
                    <button type="button" aria-label="Remove photo" onClick={() => removePhoto(p.id)}>×</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pcf-hint pcf-hint--block">
                Tap Take photo — we lock GPS, open the camera, and stamp the shot like GPS Map Camera.
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
