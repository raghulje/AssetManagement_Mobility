import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api/client'

export type MapLocationValue = {
  latitude: number | null
  longitude: number | null
  address: string
}

type Props = {
  value: MapLocationValue
  onChange: (next: MapLocationValue) => void
}

const DEFAULT_CENTER: L.LatLngExpression = [13.0827, 80.2707] // Chennai
const DEFAULT_ZOOM = 12

// Leaflet's default marker icons break under Vite bundling — use CDN icons
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

type SearchHit = { lat: number; lng: number; address: string; place_id: number }

export default function LocationMapPicker({ value, onChange }: Props) {
  const hasPin = value.latitude != null && value.longitude != null
    && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [mapBusy, setMapBusy] = useState(false)
  const [err, setErr] = useState('')
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const applyPoint = async (lat: number, lng: number, address?: string) => {
    setMapBusy(true)
    setErr('')
    try {
      let addr = address?.trim() || ''
      if (!addr) {
        const rev = await api<{ lat: number; lng: number; address: string }>(
          `/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
        )
        addr = rev.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      }
      onChangeRef.current({ latitude: lat, longitude: lng, address: addr })
      setQuery(addr)
      setHits([])
    } catch (e) {
      onChangeRef.current({
        latitude: lat,
        longitude: lng,
        address: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      })
      setErr(e instanceof Error ? e.message : 'Could not resolve address')
    } finally {
      setMapBusy(false)
    }
  }
  const applyPointRef = useRef(applyPoint)
  applyPointRef.current = applyPoint

  useEffect(() => {
    if (!open || !mapEl.current) return

    if (!mapRef.current) {
      const map = L.map(mapEl.current, { scrollWheelZoom: true }).setView(
        hasPin ? [value.latitude!, value.longitude!] : DEFAULT_CENTER,
        hasPin ? 16 : DEFAULT_ZOOM,
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e: L.LeafletMouseEvent) => {
        void applyPointRef.current(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
    }

    const map = mapRef.current
    if (hasPin) {
      const ll: L.LatLngExpression = [value.latitude!, value.longitude!]
      if (!markerRef.current) {
        markerRef.current = L.marker(ll, { icon: markerIcon, draggable: true }).addTo(map)
        markerRef.current.on('dragend', () => {
          const p = markerRef.current?.getLatLng()
          if (p) void applyPointRef.current(p.lat, p.lng)
        })
      } else {
        markerRef.current.setLatLng(ll)
      }
      map.setView(ll, Math.max(map.getZoom(), 15))
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => window.clearTimeout(t)
  }, [open, value.latitude, value.longitude, hasPin])

  useEffect(() => () => {
    mapRef.current?.remove()
    mapRef.current = null
    markerRef.current = null
  }, [])

  const runSearch = async () => {
    const q = query.trim()
    if (q.length < 3) {
      setErr('Enter at least 3 characters to search')
      return
    }
    setSearchBusy(true)
    setErr('')
    try {
      const res = await api<{ results: SearchHit[] }>(
        `/geo/search?q=${encodeURIComponent(q)}`,
      )
      setHits(res.results || [])
      if (!(res.results || []).length) setErr('No places found — try a different address')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
      setHits([])
    } finally {
      setSearchBusy(false)
    }
  }

  const clear = () => {
    onChange({ latitude: null, longitude: null, address: '' })
    setQuery('')
    setHits([])
    setErr('')
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }

  return (
    <div className="map-location-picker">
      <div className="map-location-actions">
        <button
          type="button"
          className="btn btn-default btn-sm"
          onClick={() => setOpen((v) => !v)}
        >
          <i className={`fas ${open ? 'fa-chevron-up' : 'fa-map-marker-alt'}`} />{' '}
          {open ? 'Hide map' : hasPin ? 'Edit map pin' : 'Choose on map'}
        </button>
        {hasPin ? (
          <button type="button" className="btn btn-link btn-sm" onClick={clear}>
            Clear pin
          </button>
        ) : null}
      </div>

      {hasPin && !open ? (
        <div className="map-location-summary">
          <div className="map-location-summary-addr">{value.address || 'Pinned location'}</div>
          <div className="map-location-summary-coords text-muted">
            Lat {Number(value.latitude).toFixed(6)}, Lng {Number(value.longitude).toFixed(6)}
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="map-location-panel">
          <p className="help-block" style={{ marginTop: 0 }}>
            Search an address (OpenStreetMap / Nominatim) or click the map to drop a pin. Drag the marker to adjust.
          </p>
          <div className="map-location-search">
            <input
              className="form-control"
              placeholder="Search address or place…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runSearch()
                }
              }}
            />
            <button
              type="button"
              className="btn btn-theme btn-sm"
              disabled={searchBusy}
              onClick={() => { void runSearch() }}
            >
              {searchBusy ? 'Searching…' : 'Search'}
            </button>
          </div>
          {hits.length > 0 ? (
            <ul className="map-location-hits">
              {hits.map((h) => (
                <li key={h.place_id}>
                  <button
                    type="button"
                    onClick={() => { void applyPoint(h.lat, h.lng, h.address) }}
                  >
                    {h.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {err ? <p className="text-danger" style={{ margin: '6px 0 0', fontSize: 13 }}>{err}</p> : null}
          {mapBusy ? <p className="help-block" style={{ marginBottom: 0 }}>Resolving address…</p> : null}
          <div ref={mapEl} className="map-location-canvas" role="application" aria-label="Map location picker" />
          {hasPin ? (
            <div className="map-location-summary" style={{ marginTop: 10 }}>
              <div className="map-location-summary-addr">{value.address}</div>
              <div className="map-location-summary-coords text-muted">
                Lat {Number(value.latitude).toFixed(6)}, Lng {Number(value.longitude).toFixed(6)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
