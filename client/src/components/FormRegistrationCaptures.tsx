import { useMemo, useState } from 'react'
import type { VehicleCapture } from '../api/vehicles'
import { VehicleCaptureFrame, captureToFrameProps } from './VehicleCaptureFrame'

export const CAPTURE_KIND_TABS = [
  { key: 'vehicle', label: 'Vehicle photos' },
  { key: 'odometer', label: 'Odometer images' },
  { key: 'chassis', label: 'Chassis Images' },
] as const

export type CaptureKindTabKey = (typeof CAPTURE_KIND_TABS)[number]['key']

export function tabForCapture(c: VehicleCapture): CaptureKindTabKey | null {
  const kind = c.capture_kind || 'vehicle'
  if (kind === 'odometer' || kind === 'chassis') return kind
  if (kind === 'vehicle' || kind === 'extra_1' || kind === 'extra_2') return 'vehicle'
  if (kind === 'walkaround_video' || String(c.mime_type || '').startsWith('video/')) return null
  return 'vehicle'
}

type PendingItem = {
  localId: string
  previewUrl: string
  capturedAt: string
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  uploading?: boolean
  statusText?: string
  error?: string
  onDismiss?: () => void
}

type Props = {
  photos: VehicleCapture[]
  pending?: PendingItem[]
  busy?: boolean
  formBadge?: boolean
  onRemove?: (captureId: number) => void | Promise<void>
}

export default function FormRegistrationCaptures({
  photos,
  pending = [],
  busy,
  formBadge = false,
  onRemove,
}: Props) {
  const [activeTab, setActiveTab] = useState<CaptureKindTabKey>('vehicle')

  const grouped = useMemo(() => {
    const map: Record<CaptureKindTabKey, VehicleCapture[]> = {
      vehicle: [],
      odometer: [],
      chassis: [],
    }
    for (const c of photos) {
      const tab = tabForCapture(c)
      if (tab) map[tab].push(c)
    }
    for (const key of CAPTURE_KIND_TABS.map((t) => t.key)) {
      map[key].sort((a, b) => a.id - b.id)
    }
    return map
  }, [photos])

  const visible = grouped[activeTab]
  const showPending = activeTab === 'vehicle' && pending.length > 0
  const isEmpty = visible.length === 0 && !showPending

  return (
    <div className="vc-form-reg-captures">
      <div className="vc-form-reg-captures__tabs vad-tabs" role="tablist" aria-label="Capture categories">
        {CAPTURE_KIND_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={activeTab === t.key ? 'is-active' : ''}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}{' '}
            <span>
              ({t.key === 'vehicle' ? grouped[t.key].length + pending.length : grouped[t.key].length})
            </span>
          </button>
        ))}
      </div>
      <div className="vc-form-reg-captures__panel" role="tabpanel">
        {isEmpty ? (
          <div className="vad-empty vc-form-reg-captures__empty">
            <strong>No photos yet</strong>
          </div>
        ) : (
          <div className="vad-gallery">
            {showPending
              ? pending.map((p) => (
                <div key={p.localId} className="vc-pending-wrap">
                  <VehicleCaptureFrame
                    photoUrl={p.previewUrl}
                    capturedAt={p.capturedAt}
                    latitude={p.latitude}
                    longitude={p.longitude}
                    address={p.address}
                  />
                  {p.uploading ? <div className="vc-pending-badge">{p.statusText || 'Saving…'}</div> : null}
                  {p.error ? (
                    <div className="vc-pending-badge vc-pending-badge--error">
                      <span>{p.error}</span>
                      {p.onDismiss ? (
                        <button type="button" className="vc-pending-dismiss" onClick={p.onDismiss}>
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
              : null}
            {visible.map((c) => (
              <VehicleCaptureFrame
                key={c.id}
                {...captureToFrameProps(c)}
                formBadge={formBadge || String(c.source || '') === 'public_form'}
                busy={busy}
                onRemove={onRemove ? () => onRemove(c.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function countFormRegistrationPhotos(photos: VehicleCapture[]) {
  return photos.filter((c) => tabForCapture(c) != null).length
}
