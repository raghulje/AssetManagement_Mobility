import { useEffect, useRef, useState } from 'react'

const MAX_MS = 30_000

type Props = {
  open: boolean
  vehicleLabel?: string
  onClose: () => void
  onCapture: (file: File) => void
}

type PendingVideo = {
  file: File
  previewUrl: string
}

function pickMime() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

function extForMime(mime: string) {
  if (mime.includes('mp4')) return '.mp4'
  return '.webm'
}

export default function VehicleVideoCapture({ open, vehicleLabel, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [pending, setPending] = useState<PendingVideo | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const mirrored = facing === 'user'

  useEffect(() => {
    if (!open) {
      setPending((p) => {
        if (p) URL.revokeObjectURL(p.previewUrl)
        return null
      })
      return
    }

    let cancelled = false
    setError('')
    setReady(false)
    setRecording(false)
    setElapsedMs(0)
    setPending(null)

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not available in this browser')
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          video.srcObject = stream
          await video.play()
        }
        setReady(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera permission denied')
        setReady(false)
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* ignore */ }
      }
      recorderRef.current = null
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [open, facing])

  if (!open) return null

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream || recording || pending) return
    const mime = pickMime()
    if (!mime) {
      setError('Video recording is not supported in this browser')
      return
    }
    setError('')
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime })
      const file = new File([blob], `walkaround-${Date.now()}${extForMime(mime)}`, { type: blob.type })
      setPending({ file, previewUrl: URL.createObjectURL(blob) })
      recorderRef.current = null
    }
    recorder.start(500)
    setRecording(true)
    setElapsedMs(0)
    timerRef.current = window.setInterval(() => {
      setElapsedMs((ms) => {
        const next = ms + 250
        if (next >= MAX_MS) stopRecording()
        return Math.min(next, MAX_MS)
      })
    }, 250)
  }

  const secondsLeft = Math.max(0, Math.ceil((MAX_MS - elapsedMs) / 1000))

  return (
    <div className="vc-webcam-overlay" role="dialog" aria-modal="true" aria-label="Walkaround video capture">
      <div className="vc-webcam-panel">
        <header className="vc-webcam-head">
          <div>
            <strong>Walkaround video</strong>
            <span>{vehicleLabel || 'Slowly rotate around the vehicle (180°+)'}</span>
          </div>
          <button type="button" className="btn btn-default btn-sm" onClick={onClose} disabled={recording}>
            Done
          </button>
        </header>

        <div className="vc-webcam-stage">
          {error ? <div className="vc-webcam-error">{error}</div> : null}
          {pending ? (
            <video src={pending.previewUrl} className="vc-webcam-preview" controls playsInline />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`vc-webcam-video${mirrored ? ' is-mirrored' : ''}${recording ? ' is-recording' : ''}`}
              />
              {recording ? (
                <div className="vc-video-timer" aria-live="polite">
                  <span className="vc-video-timer__dot" aria-hidden />
                  Recording · {secondsLeft}s left
                </div>
              ) : null}
            </>
          )}
        </div>

        {pending ? (
          <footer className="vc-webcam-review">
            <button
              type="button"
              className="vc-review-btn vc-review-btn--discard"
              onClick={() => {
                setPending((p) => {
                  if (p) URL.revokeObjectURL(p.previewUrl)
                  return null
                })
              }}
              aria-label="Discard video"
            >
              <i className="fas fa-times" />
            </button>
            <button
              type="button"
              className="vc-review-btn vc-review-btn--keep"
              onClick={() => {
                if (!pending) return
                onCapture(pending.file)
                URL.revokeObjectURL(pending.previewUrl)
                setPending(null)
                onClose()
              }}
              aria-label="Use this video"
            >
              <i className="fas fa-check" />
            </button>
            <p className="vc-webcam-hint">✕ Discard · ✓ Use this video</p>
          </footer>
        ) : (
          <footer className="vc-webcam-foot">
            <button
              type="button"
              className="btn btn-default btn-sm"
              disabled={recording}
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            >
              <i className="fas fa-sync-alt" /> Flip
            </button>
            {recording ? (
              <button type="button" className="btn btn-danger vc-webcam-shutter" onClick={stopRecording}>
                Stop ({secondsLeft}s)
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary vc-webcam-shutter"
                disabled={!ready}
                onClick={startRecording}
              >
                Record 30s walkaround
              </button>
            )}
            <p className="vc-webcam-hint">
              Walk slowly around the vehicle and rotate the camera to capture all sides. Recording stops at 30 seconds.
            </p>
          </footer>
        )}
      </div>
    </div>
  )
}
