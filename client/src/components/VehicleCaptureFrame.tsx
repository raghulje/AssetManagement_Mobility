import type { VehicleCapture } from '../api/vehicles'

function formatTimestamp(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function formatLat(lat: number | null | undefined) {
  if (lat == null || Number.isNaN(lat)) return '—'
  return `${Math.abs(lat).toFixed(7)}° ${lat >= 0 ? 'N' : 'S'}`
}

function formatLng(lng: number | null | undefined) {
  if (lng == null || Number.isNaN(lng)) return '—'
  return `${Math.abs(lng).toFixed(7)}° ${lng >= 0 ? 'E' : 'W'}`
}

type Props = {
  photoUrl: string
  capturedAt: string
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  onRemove?: () => void
  busy?: boolean
}

/** Exact VEHICLE CAPTURE frame from the product mock */
export function VehicleCaptureFrame({
  photoUrl,
  capturedAt,
  latitude,
  longitude,
  address,
  onRemove,
  busy,
}: Props) {
  return (
    <article className="vc-frame">
      <div className="vc-frame__corner vc-frame__corner--tl" aria-hidden />
      <div className="vc-frame__corner vc-frame__corner--tr" aria-hidden />
      <div className="vc-frame__corner vc-frame__corner--bl" aria-hidden />
      <div className="vc-frame__corner vc-frame__corner--br" aria-hidden />

      <header className="vc-frame__header">
        <span className="vc-frame__title">CAPTURE</span>
        {onRemove ? (
          <button
            type="button"
            className="vc-frame__remove"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remove capture"
          >
            <i className="fas fa-times" />
          </button>
        ) : null}
      </header>

      <div className="vc-frame__photo-wrap">
        <img src={photoUrl} alt="Vehicle capture" className="vc-frame__photo" />
      </div>

      <dl className="vc-frame__meta">
        <div className="vc-frame__row">
          <dt><i className="far fa-clock" aria-hidden /><span>Timestamp</span></dt>
          <dd>{formatTimestamp(capturedAt)}</dd>
        </div>
        <div className="vc-frame__row">
          <dt><i className="fas fa-map-marker-alt" aria-hidden /><span>Latitude</span></dt>
          <dd>{formatLat(latitude)}</dd>
        </div>
        <div className="vc-frame__row">
          <dt><i className="fas fa-map-marker-alt" aria-hidden /><span>Longitude</span></dt>
          <dd>{formatLng(longitude)}</dd>
        </div>
        <div className="vc-frame__row vc-frame__row--address">
          <dt><i className="fas fa-city" aria-hidden /><span>Address</span></dt>
          <dd>{address || '—'}</dd>
        </div>
      </dl>
    </article>
  )
}

export function captureToFrameProps(c: VehicleCapture) {
  return {
    photoUrl: c.url,
    capturedAt: c.captured_at,
    latitude: c.latitude,
    longitude: c.longitude,
    address: c.address,
  }
}
