import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../layout/AppLayout'
import { SmallBox, Box } from '../components/ui'
import { dashboardApi, reportsApi } from '../api/client'

type DashCounts = Record<string, number>

const emptyCounts: DashCounts = {
  assets: 0,
  licenses: 0,
  accessories: 0,
  consumables: 0,
  components: 0,
  users: 0,
  employees: 0,
  deployed: 0,
  rtd: 0,
  audit_due: 0,
  eol_due: 0,
}

function actionLabel(action: string) {
  if (action === 'checkout') return 'assign'
  if (action === 'checkin') return 'unassign'
  if (action === 'replace_out') return 'replace out'
  if (action === 'replace_in') return 'replace in'
  return action
}

export default function Dashboard() {
  const [counts, setCounts] = useState<DashCounts>(emptyCounts)
  const [activity, setActivity] = useState<Array<{
    id: number
    date: string
    admin: string
    action: string
    item_name: string
    target_name: string
    note: string
  }>>([])

  useEffect(() => {
    dashboardApi.counts().then((c) => setCounts({ ...emptyCounts, ...c })).catch(() => undefined)

    reportsApi.activity().then((res) => {
      setActivity(res.rows.slice(0, 8).map((r) => ({
        id: Number(r.id),
        date: String(r.action_date || ''),
        admin: String(r.admin || ''),
        action: String(r.action_type || ''),
        item_name: String(r.item_name || ''),
        target_name: String(r.target_name || ''),
        note: String(r.note || ''),
      })))
    }).catch(() => undefined)
  }, [])

  const totalAssets = Math.max(counts.assets || 1, 1)
  const bars = [
    { label: 'Assigned', value: counts.deployed || 0, tone: 'amber' },
    { label: 'In stock', value: counts.rtd || 0, tone: 'teal' },
  ]

  return (
    <AppLayout title="Dashboard">
      <div className="row">
        <SmallBox to="/hardware" count={counts.assets} label="Assets" color="bg-teal" icon="fas fa-barcode" />
        <SmallBox to="/licenses" count={counts.licenses} label="Licenses" color="bg-maroon" icon="fas fa-save" />
        <SmallBox to="/accessories" count={counts.accessories} label="Accessories" color="bg-orange" icon="fas fa-keyboard" />
        <SmallBox to="/consumables" count={counts.consumables} label="Consumables" color="bg-purple" icon="fas fa-tint" />
        <SmallBox to="/components" count={counts.components} label="Components" color="bg-olive" icon="fas fa-hdd" />
        <SmallBox to="/employees" count={counts.employees || counts.users} label="Employees" color="bg-navy" icon="fas fa-users" />
      </div>

      <div className="module-insights-title" style={{ marginTop: 4 }}>Asset inventory snapshot</div>
      <div className="row">
        <SmallBox to="/hardware?status_type=Assigned" count={counts.deployed || 0} label="Assigned" color="bg-orange" icon="fas fa-user-check" />
        <SmallBox to="/hardware?status_type=RTD" count={counts.rtd || 0} label="In stock" color="bg-olive" icon="fas fa-warehouse" />
        <SmallBox to="/hardware/eol/due" count={counts.eol_due || 0} label="EOL due" color="bg-red" icon="fas fa-calendar-times" />
      </div>

      <div className="row">
        <div className="col-md-8">
          <Box title="Recent Activity" type="primary" tools={<Link to="/reports/activity" className="btn btn-default btn-sm">View All</Link>}>
            <div className="table-responsive dash-activity-desktop">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Item</th>
                    <th>Target</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.length === 0 ? (
                    <tr><td colSpan={6} className="text-muted">No recent activity</td></tr>
                  ) : activity.map((a) => (
                    <tr key={a.id}>
                      <td>{a.date}</td>
                      <td>{a.admin}</td>
                      <td><span className="label label-info">{actionLabel(a.action)}</span></td>
                      <td>{a.item_name}</td>
                      <td>{a.target_name || '—'}</td>
                      <td>{a.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dash-activity-mobile">
              {activity.length === 0 ? (
                <p className="text-muted mb-0">No recent activity</p>
              ) : activity.map((a) => (
                <article key={a.id} className="data-card">
                  <div className="data-card-title">{a.item_name}</div>
                  <dl className="data-card-fields">
                    <div className="data-card-field"><dt>Date</dt><dd>{a.date}</dd></div>
                    <div className="data-card-field"><dt>Admin</dt><dd>{a.admin}</dd></div>
                    <div className="data-card-field">
                      <dt>Action</dt>
                      <dd><span className="label label-info">{actionLabel(a.action)}</span></dd>
                    </div>
                    <div className="data-card-field"><dt>Target</dt><dd>{a.target_name || '—'}</dd></div>
                    {a.note ? <div className="data-card-field"><dt>Notes</dt><dd>{a.note}</dd></div> : null}
                  </dl>
                </article>
              ))}
            </div>
          </Box>
        </div>
        <div className="col-md-4">
          <Box title="Asset status mix" type="default">
            <div className="dash-status-bars">
              {bars.map((b) => (
                <div key={b.label} className="dash-status-row">
                  <div className="dash-status-meta">
                    <span>{b.label}</span>
                    <strong>{b.value}</strong>
                  </div>
                  <div className="dash-status-track">
                    <div
                      className={`dash-status-fill tone-${b.tone}`}
                      style={{ width: `${Math.min(100, Math.round((b.value / totalAssets) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Box>
          {/* Quick Links — hidden for now
          <Box title="Quick Links" type="default">
            <p><Link to="/hardware?status_type=RTD">In Stock</Link></p>
            <p><Link to="/hardware/audit/due">Audit Due</Link></p>
            <p><Link to="/hardware/eol/due">EOL Due</Link></p>
            <p><Link to="/hardware/checkins/due">Due for Unassign</Link></p>
            <p><Link to="/reports/unaccepted">Unaccepted Assets</Link></p>
            <p><Link to="/hardware/create" className="btn btn-theme btn-sm"><i className="fas fa-plus" /> Create Asset</Link></p>
          </Box>
          */}
        </div>
      </div>
    </AppLayout>
  )
}
