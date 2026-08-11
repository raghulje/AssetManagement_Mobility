import { Router } from 'express'
import { fail, okItem } from '../utils/response.js'

/**
 * Free geocoding via OpenStreetMap Nominatim (no API key).
 * Proxied here so we can set a proper User-Agent per Nominatim usage policy.
 */
export const geoRouter = Router()

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const UA = process.env.NOMINATIM_USER_AGENT
  || `RefexITAM/1.0 (${process.env.PUBLIC_APP_URL || 'https://asset.refexone.com'}; itam@refex.co.in)`

async function nominatim(path: string, params: Record<string, string>) {
  const url = new URL(path, NOMINATIM)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('format', 'json')
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`)
  }
  return res.json()
}

geoRouter.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 3) return fail(res, 'Enter at least 3 characters')
  try {
    const data = await nominatim('/search', {
      q,
      addressdetails: '0',
      limit: '6',
      countrycodes: String(req.query.country || 'in'),
    }) as Array<{
      lat: string
      lon: string
      display_name: string
      place_id: number
    }>
    const results = (Array.isArray(data) ? data : []).map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      address: r.display_name,
      place_id: r.place_id,
    }))
    return okItem(res, { results })
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Search failed', 502)
  }
})

geoRouter.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng ?? req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(res, 'lat and lng are required')
  }
  try {
    const data = await nominatim('/reverse', {
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '0',
    }) as { display_name?: string; lat?: string; lon?: string }
    return okItem(res, {
      lat,
      lng,
      address: data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    })
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Reverse geocode failed', 502)
  }
})
