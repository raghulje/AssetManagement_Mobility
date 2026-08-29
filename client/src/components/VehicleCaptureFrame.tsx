import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  mimeType?: string | null
  captureKind?: string | null
  onRemove?: () => void
  busy?: boolean
  formBadge?: boolean
}

const KIND_LABELS: Record<string, string> = {
  vehicle: 'Vehicle',
  odometer: 'Odometer',
  extra_1: 'Extra 1',
  extra_2: 'Extra 2',
  chassis: 'Chassis',
  walkaround_video: 'Walkaround',
}

export const CAPTURE_KIND_ORDER: Record<string, number> = {
  vehicle: 0,
  odometer: 1,
  extra_1: 2,
  extra_2: 3,
  chassis: 4,
  walkaround_video: 5,
}

/** Exact VEHICLE CAPTURE frame from the product mock */
export function VehicleCaptureFrame({
  photoUrl,
  capturedAt,
  latitude,
  longitude,
  address,
  mimeType,
  captureKind,
  onRemove,
  busy,
  formBadge,
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const isVideo = String(mimeType || '').startsWith('video/') || captureKind === 'walkaround_video'
  const kindLabel = captureKind ? (KIND_LABELS[captureKind] || captureKind) : null

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightboxOpen])

  return (
    <>
      <article className={`vc-frame${formBadge ? ' vc-frame--form' : ''}`}>
        <div className="vc-frame__corner vc-frame__corner--tl" aria-hidden />
        <div className="vc-frame__corner vc-frame__corner--tr" aria-hidden />
        <div className="vc-frame__corner vc-frame__corner--bl" aria-hidden />
        <div className="vc-frame__corner vc-frame__corner--br" aria-hidden />

        <header className="vc-frame__header">
          <span className="vc-frame__title">CAPTURE</span>
          {kindLabel ? <span className="vc-frame__form-badge">{kindLabel}</span> : null}
          {formBadge && !kindLabel ? <span className="vc-frame__form-badge">Form</span> : null}
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
          {isVideo ? (
            <video
              src={photoUrl}
              className="vc-frame__photo vc-frame__photo--video"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <button
              type="button"
              className="vc-frame__photo-open"
              onClick={() => setLightboxOpen(true)}
              aria-label="View full screen photo"
            >
              <img
                src={photoUrl}
                alt="Vehicle capture"
                className="vc-frame__photo vc-frame__photo--zoomable"
              />
            </button>
          )}
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

      {lightboxOpen && !isVideo && createPortal(
        <div
          className="vc-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full screen capture photo"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="vc-lightbox__close"
            aria-label="Close full screen view"
            onClick={() => setLightboxOpen(false)}
          >
            <i className="fas fa-times" />
          </button>
          <img
            src={photoUrl}
            alt="Vehicle capture full size"
            className="vc-lightbox__img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

export function captureToFrameProps(c: VehicleCapture) {
  return {
    photoUrl: c.url,
    capturedAt: c.captured_at,
    latitude: c.latitude,
    longitude: c.longitude,
    address: c.address,
    mimeType: c.mime_type,
    captureKind: c.capture_kind,
  }
}
