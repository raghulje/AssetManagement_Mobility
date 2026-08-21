import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { vehicleQrDataUrl } from '../../lib/vehicleQrClient'
import './public-vehicle.css'

type PublicVehicle = {
  id?: number
  vehicle_number?: string | null
  name?: string | null
  model?: string | null
  make?: string | null
  variant?: string | null
  location_name?: string | null
  category?: string | null
  fuel_type?: string | null
  status?: string | null
  fleet_id?: string | null
  vin?: string | null
  color?: string | null
  assigned_name?: string | null
  assigned_type?: string | null
  qr_token?: string | null
  qr_url?: string | null
}

function hasValue(v: unknown): boolean {
  if (v == null) return false
  const s = String(v).trim()
  return s !== '' && s !== '—' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined'
}

function statusClass(status: string) {
  const s = status.toLowerCase()
  if (s.includes('assign') || s.includes('deploy')) return 'pv-status--assigned'
  if (s.includes('maint')) return 'pv-status--maintenance'
  if (s.includes('inactive') || s.includes('retire')) return 'pv-status--inactive'
  return 'pv-status--active'
}

export default function PublicVehicle() {
  const { token } = useParams()
  const [row, setRow] = useState<PublicVehicle | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/v1/public/vehicles/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error((data.messages || []).join(', ') || 'Not found')
        setRow(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
  }, [token])

  useEffect(() => {
    let cancelled = false
    async function render() {
      if (!token && !row?.qr_url) {
        setQrDataUrl(null)
        return
      }
      try {
        const dataUrl = await vehicleQrDataUrl(
          String(row?.qr_url || token || ''),
          { storedUrl: row?.qr_url, width: 320 },
        )
        if (!cancelled) setQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setQrDataUrl(null)
      }
    }
    void render()
    return () => { cancelled = true }
  }, [token, row?.qr_url])

  const modelLine = useMemo(() => {
    if (!row) return ''
    return [row.make, row.model, row.variant].filter(hasValue).join(' ')
  }, [row])

  const fields = useMemo(() => {
    if (!row) return [] as Array<{ label: string; value: string }>
    const list: Array<{ label: string; value: string }> = []
    const push = (label: string, value: unknown) => {
      if (!hasValue(value)) return
      list.push({ label, value: String(value).trim() })
    }
    push('Display name', row.name)
    push('Model', modelLine || row.model)
    push('City', row.location_name)
    push('Category', row.category)
    push('Fuel', row.fuel_type)
    push('Color', row.color)
    push('VIN', row.vin)
    push('Fleet ID', row.fleet_id)
    if (hasValue(row.assigned_name)) {
      const kind = hasValue(row.assigned_type) ? String(row.assigned_type) : 'assignee'
      push('Assigned to', `${row.assigned_name} (${kind})`)
    }
    return list
  }, [row, modelLine])

  if (error) {
    return (
      <div className="pv-page">
        <div className="pv-bg" aria-hidden />
        <div className="pv-shell">
          <div className="pv-state pv-state--error">
            <img src="/mobility_logo.png" alt="Refex Mobility" className="pv-logo" />
            <h1>Vehicle not found</h1>
            <p>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!row) {
    return (
      <div className="pv-page">
        <div className="pv-bg" aria-hidden />
        <div className="pv-shell">
          <div className="pv-state">
            <img src="/mobility_logo.png" alt="Refex Mobility" className="pv-logo" />
            <p>Loading vehicle…</p>
          </div>
        </div>
      </div>
    )
  }

  const plate = hasValue(row.vehicle_number) ? String(row.vehicle_number) : 'Vehicle'
  const status = hasValue(row.status) ? String(row.status) : ''

  return (
    <div className="pv-page">
      <div className="pv-bg" aria-hidden>
        <div className="pv-orb pv-orb--a" />
        <div className="pv-orb pv-orb--b" />
      </div>

      <div className="pv-shell">
        <header className="pv-brand">
          <img src="/mobility_logo.png" alt="Refex Mobility" className="pv-logo" />
          <p className="pv-brand__tag">Fleet vehicle identity</p>
        </header>

        <section className="pv-hero" aria-label="Vehicle">
          <div className="pv-hero__top">
            <p className="pv-kicker">Registration</p>
            <h1 className="pv-plate">{plate}</h1>
            {modelLine ? <p className="pv-model">{modelLine}</p> : null}
            {status ? (
              <span className={`pv-status ${statusClass(status)}`}>{status}</span>
            ) : null}
          </div>

          {qrDataUrl ? (
            <div className="pv-qr" aria-hidden={false}>
              <img src={qrDataUrl} alt="" />
              <span>Scan QR for this vehicle</span>
            </div>
          ) : null}
        </section>

        {fields.length > 0 ? (
          <section className="pv-specs" aria-label="Vehicle details">
            <h2>Details</h2>
            <dl>
              {fields.map((f) => (
                <div key={f.label} className="pv-spec">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <footer className="pv-foot">
          Refex Mobility · Scan-verified vehicle record
        </footer>
      </div>
    </div>
  )
}
