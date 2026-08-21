import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { vehiclePublicScanUrl, vehicleQrDataUrl } from '../../lib/vehicleQrClient'

type PublicVehicle = {
  vehicle_number: string
  name?: string | null
  model: string
  location_name: string
  category: string
  fuel_type: string
  status: string
  qr_token?: string | null
  qr_url?: string | null
  qr_image_url?: string | null
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

  if (error) {
    return <div className="suite-page" style={{ padding: 40, textAlign: 'center' }}>{error}</div>
  }
  if (!row) {
    return <div className="suite-page" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>
  }

  return (
    <div className="suite-page" style={{ maxWidth: 480, margin: '40px auto', padding: 20 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img src="/mobility_logo.png" alt="Refex Mobility" style={{ height: 40 }} />
        <h2 style={{ margin: '12px 0 4px' }}>Refex Mobility</h2>
        <p style={{ color: '#64748b' }}>Fleet vehicle</p>
      </div>
      {qrDataUrl ? (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img src={qrDataUrl} alt="QR" style={{ width: 160, height: 160 }} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, wordBreak: 'break-all' }}>
            {vehiclePublicScanUrl(String(token || row.qr_token || ''), row.qr_url)}
          </div>
        </div>
      ) : null}
      <table className="table">
        <tbody>
          <tr><th>Plate</th><td>{row.vehicle_number}</td></tr>
          <tr><th>Model</th><td>{row.model}</td></tr>
          <tr><th>City</th><td>{row.location_name}</td></tr>
          <tr><th>Category</th><td>{row.category}</td></tr>
          <tr><th>Fuel</th><td>{row.fuel_type}</td></tr>
          <tr><th>Status</th><td>{row.status}</td></tr>
        </tbody>
      </table>
    </div>
  )
}
