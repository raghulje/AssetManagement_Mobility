import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { vehiclesApi } from '../../api/vehicles'

export default function VehicleEolDue() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    vehiclesApi.eolDue(search).then((r) => setRows(r.rows || [])).finally(() => setLoading(false))
  }, [search])

  return (
    <AppLayout title="EOL / warranty due" subtitle="Vehicles nearing end of life or warranty">
      <Box title="Due soon">
        <input
          className="form-control"
          style={{ maxWidth: 320, marginBottom: 12 }}
          placeholder="Search plate / model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Model</th>
              <th>City</th>
              <th>EOL</th>
              <th>Warranty end</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6}>Loading…</td></tr> : null}
            {!loading && rows.length === 0 ? <tr><td colSpan={6}>Nothing due in the next 30 days</td></tr> : null}
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td><Link to={`/vehicles/${r.id}`}>{String(r.vehicle_number)}</Link></td>
                <td>{String(r.model)}</td>
                <td>{String(r.location_name)}</td>
                <td>{String(r.eol_date || '—')}</td>
                <td>{String(r.warranty_end || '—')}</td>
                <td>{r.days_to_eol != null ? String(r.days_to_eol) : (r.days_to_warranty != null ? String(r.days_to_warranty) : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </AppLayout>
  )
}
