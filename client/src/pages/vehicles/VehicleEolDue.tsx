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

  const daysVal = (r: Record<string, unknown>) => (
    r.days_to_eol != null ? String(r.days_to_eol) : (r.days_to_warranty != null ? String(r.days_to_warranty) : '—')
  )

  return (
    <AppLayout title="EOL / warranty due" subtitle="Vehicles nearing end of life or warranty">
      <Box title="Due soon">
        <input
          className="form-control"
          style={{ maxWidth: 320, marginBottom: 12, width: '100%' }}
          placeholder="Search plate / model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="table-responsive data-table-desktop">
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
                  <td>{daysVal(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="data-table-mobile" aria-label="EOL due vehicles">
          {loading ? <p className="text-muted data-card-empty">Loading…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="text-muted data-card-empty">Nothing due in the next 30 days</p>
          ) : null}
          {!loading && rows.map((r) => (
            <article key={String(r.id)} className="data-card">
              <div className="data-card-title">
                <Link to={`/vehicles/${r.id}`}>{String(r.vehicle_number)}</Link>
              </div>
              <dl className="data-card-fields">
                <div className="data-card-field"><dt>Model</dt><dd>{String(r.model || '—')}</dd></div>
                <div className="data-card-field"><dt>City</dt><dd>{String(r.location_name || '—')}</dd></div>
                <div className="data-card-field"><dt>EOL</dt><dd>{String(r.eol_date || '—')}</dd></div>
                <div className="data-card-field"><dt>Warranty end</dt><dd>{String(r.warranty_end || '—')}</dd></div>
                <div className="data-card-field"><dt>Days</dt><dd>{daysVal(r)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </Box>
    </AppLayout>
  )
}
