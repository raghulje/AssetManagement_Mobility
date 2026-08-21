import { Link, useNavigate } from 'react-router-dom'
import {
  Battery,
  Bolt,
  Car,
  MapPin,
  Hash,
  Pencil,
  ArrowLeft,
  ArrowLeftRight,
  Trash2,
  Wrench,
} from 'lucide-react'
import type { Vehicle } from '../../../api/vehicles'
import { dash, sohLabel, statusTone } from './helpers'

type Props = {
  vehicle: Vehicle
  imageUrl: string | null
  canEdit: boolean
  canDelete: boolean
  onTransfer: () => void
  onDelete: () => void
}

export default function VehicleHero({
  vehicle,
  imageUrl,
  canEdit,
  canDelete,
  onTransfer,
  onDelete,
}: Props) {
  const navigate = useNavigate()
  const tone = statusTone(vehicle)
  const statusClass =
    tone === 'maintenance' ? 'vad-status--maintenance'
      : tone === 'inactive' ? 'vad-status--inactive'
        : tone === 'assigned' ? 'vad-status--assigned'
          : 'vad-status--active'

  const modelLabel = [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(' ') || vehicle.model || 'Vehicle'
  const soc = vehicle.state_of_charge_pct
  const soh = vehicle.battery_health_pct
  const odo = vehicle.current_odometer_km

  function goBackToFleet() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/vehicles')
  }

  return (
    <>
      <div className="vad-crumb">
        <button type="button" className="vad-back-btn" onClick={goBackToFleet}>
          <ArrowLeft size={16} /> Back to fleet
        </button>
        <span className="vad-crumb__sep" aria-hidden>/</span>
        <Link to="/">Home</Link>
        <span className="vad-crumb__sep">›</span>
        <Link to="/vehicles">Vehicles</Link>
        <span className="vad-crumb__sep">›</span>
        <span className="vad-crumb__current">{vehicle.vehicle_number}</span>
      </div>

      <div className="vad-title-row">
        <div className="vad-title-block">
          <h1>
            {vehicle.vehicle_number}
            <span className={`vad-status ${statusClass}`}>{vehicle.status || 'Active'}</span>
          </h1>
          <p>
            {[modelLabel, vehicle.location_name].filter(Boolean).join('  •  ') || 'Refex Mobility fleet'}
          </p>
        </div>
        <div className="vad-actions">
          <button type="button" className="btn btn-default" onClick={goBackToFleet}>
            <ArrowLeft size={15} /> Back
          </button>
          {canEdit ? (
            <Link to={`/vehicles/${vehicle.id}/edit`} className="btn vad-btn-edit">
              <Pencil size={15} /> Edit vehicle
            </Link>
          ) : null}
          {canEdit ? (
            <button type="button" className="btn vad-btn-transfer" onClick={onTransfer}>
              <ArrowLeftRight size={15} /> Transfer vehicle
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="btn vad-btn-delete" onClick={onDelete}>
              <Trash2 size={15} /> Delete vehicle
            </button>
          ) : null}
        </div>
      </div>

      <section className="vad-hero" aria-label="Vehicle overview">
        <div className="vad-hero__media">
          {imageUrl ? (
            <img src={imageUrl} alt={vehicle.vehicle_number} />
          ) : (
            <div className="vad-hero__placeholder">
              <Car size={48} strokeWidth={1.5} />
              <span>No vehicle photo yet</span>
            </div>
          )}
        </div>

        <div className="vad-hero__body">
          <div className="vad-meta">
            <span className="vad-chip">
              <Bolt size={14} />
              {vehicle.fuel_type === 'EV' ? 'EV Vehicle' : dash(vehicle.fuel_type || vehicle.category)}
            </span>
            <span className="vad-chip">
              <Car size={14} />
              {modelLabel}
            </span>
            <span className="vad-chip">
              <MapPin size={14} />
              {dash(vehicle.location_name)}
            </span>
            <span className="vad-chip">
              <Hash size={14} />
              Fleet ID {dash(vehicle.fleet_id)}
            </span>
          </div>

          <div className="vad-kpis">
            <div className="vad-kpi">
              <div className="vad-kpi__label">State of charge</div>
              <div className="vad-kpi__value">{soc != null ? `${soc}%` : '—'}</div>
              {soc != null ? (
                <div className="vad-kpi__bar" aria-hidden>
                  <span style={{ width: `${Math.max(0, Math.min(100, Number(soc)))}%` }} />
                </div>
              ) : null}
              <div className="vad-kpi__hint">From vehicle profile</div>
              {/* Hidden for now: last charging
              <div className="vad-kpi__hint">
                {vehicle.last_charging_at ? `Charged ${vehicle.last_charging_at}` : 'From vehicle profile'}
              </div>
              */}
            </div>

            <div className="vad-kpi">
              <div className="vad-kpi__label">Odometer</div>
              <div className="vad-kpi__value">
                {odo != null ? `${Number(odo).toLocaleString('en-IN')} km` : '—'}
              </div>
              <div className="vad-kpi__hint">Current reading</div>
            </div>

            <div className="vad-kpi">
              <div className="vad-kpi__label">Battery health</div>
              <div className="vad-kpi__value">{soh != null ? `${soh}%` : '—'}</div>
              {soh != null ? (
                <div className="vad-kpi__soh">{sohLabel(soh)}</div>
              ) : (
                <div className="vad-kpi__hint">SOH</div>
              )}
            </div>

            <div className="vad-kpi">
              <div className="vad-kpi__label">Next service</div>
              <div className="vad-kpi__value" style={{ fontSize: '1.05rem' }}>—</div>
              <div className="vad-kpi__hint">
                <Wrench size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Not scheduled in profile
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
