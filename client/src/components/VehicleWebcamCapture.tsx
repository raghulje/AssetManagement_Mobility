import { useEffect, useRef, useState } from 'react'
import { readPrecisePosition, type PrecisePosition } from '../lib/preciseLocation'

type Props = {
  open: boolean
  vehicleLabel?: string
  onClose: () => void
  onCapture: (file: File, position: PrecisePosition | null) => void
}

function formatCoord(n: number, kind: 'lat' | 'lng') {
  const hemi = kind === 'lat' ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'W')
  return `${Math.abs(n).toFixed(7)}° ${hemi}`
}

export default function VehicleWebcamCapture({ open, vehicleLabel, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<PrecisePosition | null>(null)
  const [locStatus, setLocStatus] = useState('Acquiring GPS…')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const mirrored = facing === 'user'

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    setReady(false)
    setPos(null)
    setLocStatus('Acquiring GPS…')

    async function startCamera() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await new Promise<void>((resolve) => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              resolve()
              return
            }
            const onMeta = () => {
              video.removeEventListener('loadedmetadata', onMeta)
              resolve()
            }
            video.addEventListener('loadedmetadata', onMeta)
          })
          await video.play()
        }
        setReady(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera permission denied')
        setReady(false)
      }
    }

    void startCamera()
    void readPrecisePosition({ targetAccuracyM: 25, timeoutMs: 16000 }).then((p) => {
      if (cancelled) return
      if (p) {
        setPos(p)
        setLocStatus(`±${Math.round(p.accuracyM)} m`)
      } else {
        setLocStatus('Allow location in browser')
      }
    })

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [open, facing])

  if (!open) return null

  async function snap() {
    const video = videoRef.current
    if (!video || !ready || busy) return
    setBusy(true)
    try {
      // Prefer already-locked GPS; quick refresh only if missing
      let usePos = pos
      if (!usePos) {
        setLocStatus('Getting GPS…')
        usePos = await readPrecisePosition({ targetAccuracyM: 40, timeoutMs: 10000 })
        if (usePos) {
          setPos(usePos)
          setLocStatus(`±${Math.round(usePos.accuracyM)} m`)
        }
      }

      // Wait one frame so dimensions are stable
      await new Promise((r) => requestAnimationFrame(() => r(undefined)))

      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) throw new Error('Camera not ready — try again')

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not capture frame')

      // Match what the user sees: mirror front camera in the saved photo too
      if (mirrored) {
        ctx.translate(w, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, w, h)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.94))
      if (!blob) throw new Error('Could not encode photo')
      const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture(file, usePos)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vc-webcam-overlay" role="dialog" aria-modal="true" aria-label="Webcam capture">
      <div className="vc-webcam-panel">
        <header className="vc-webcam-head">
          <div>
            <strong>Live camera</strong>
            <span>{vehicleLabel || 'Refex Mobility GPS capture'}</span>
          </div>
          <button type="button" className="btn btn-default btn-sm" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <div className="vc-webcam-stage">
          {error ? <div className="vc-webcam-error">{error}</div> : null}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`vc-webcam-video${mirrored ? ' is-mirrored' : ''}`}
          />
          <div className="vc-webcam-hud">
            <div className="vc-webcam-gps">
              <i className="fas fa-crosshairs" />
              {pos ? (
                <>
                  <span>{formatCoord(pos.latitude, 'lat')}</span>
                  <span>{formatCoord(pos.longitude, 'lng')}</span>
                  <em>{locStatus}</em>
                </>
              ) : (
                <em>{locStatus}</em>
              )}
            </div>
          </div>
        </div>

        <footer className="vc-webcam-foot">
          <button
            type="button"
            className="btn btn-default btn-sm"
            disabled={busy}
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          >
            <i className="fas fa-sync-alt" /> Flip
          </button>
          <button type="button" className="btn btn-primary vc-webcam-shutter" disabled={!ready || busy} onClick={() => void snap()}>
            {busy ? 'Capturing…' : 'Capture GPS photo'}
          </button>
        </footer>
        {!pos ? (
          <p className="vc-webcam-hint">Tip: allow Location for this site so lat/lng and address are stamped.</p>
        ) : null}
      </div>
    </div>
  )
}
