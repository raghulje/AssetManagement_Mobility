/**
 * High-accuracy device GPS: samples until accuracy is good enough or timeout.
 * Lat/lng always come from the device — never from reverse-geocode centroids.
 */

export type PrecisePosition = {
  latitude: number
  longitude: number
  accuracyM: number
  altitude: number | null
  capturedAt: Date
}

type ReadOpts = {
  targetAccuracyM?: number
  timeoutMs?: number
  maximumAgeMs?: number
  enableHighAccuracy?: boolean
}

function toPrecise(pos: GeolocationPosition): PrecisePosition {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
    altitude: pos.coords.altitude,
    capturedAt: new Date(pos.timestamp || Date.now()),
  }
}

function sampleOnce(opts: {
  timeoutMs: number
  maximumAgeMs: number
  enableHighAccuracy: boolean
}): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        maximumAge: opts.maximumAgeMs,
        timeout: opts.timeoutMs,
      },
    )
  })
}

export function readPrecisePosition(opts: ReadOpts = {}): Promise<PrecisePosition | null> {
  if (!navigator.geolocation) return Promise.resolve(null)

  const targetAccuracyM = opts.targetAccuracyM ?? 20
  const timeoutMs = opts.timeoutMs ?? 18000
  const maximumAgeMs = opts.maximumAgeMs ?? 0
  const enableHighAccuracy = opts.enableHighAccuracy ?? true

  return new Promise((resolve) => {
    let best: GeolocationPosition | null = null
    let settled = false

    const finish = (pos: GeolocationPosition | null) => {
      if (settled) return
      settled = true
      try { watcher != null && navigator.geolocation.clearWatch(watcher) } catch { /* ignore */ }
      clearTimeout(timer)
      resolve(pos ? toPrecise(pos) : null)
    }

    const consider = (pos: GeolocationPosition) => {
      if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
      if (pos.coords.accuracy <= targetAccuracyM) finish(pos)
    }

    const watcher = navigator.geolocation.watchPosition(
      consider,
      () => undefined,
      { enableHighAccuracy, maximumAge: maximumAgeMs, timeout: timeoutMs },
    )

    void sampleOnce({ timeoutMs, maximumAgeMs, enableHighAccuracy }).then((pos) => {
      if (pos) consider(pos)
    })

    const timer = setTimeout(async () => {
      if (best) {
        finish(best)
        return
      }
      // Fallback: network/Wi‑Fi location (common on laptops indoors)
      const soft = await sampleOnce({
        timeoutMs: 8000,
        maximumAgeMs: 60_000,
        enableHighAccuracy: false,
      })
      finish(soft || best)
    }, timeoutMs)
  })
}
