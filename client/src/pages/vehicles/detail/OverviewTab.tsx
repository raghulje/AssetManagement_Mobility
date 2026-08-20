import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  ClipboardCheck,
  MapPinned,
  FileDown,
  History,
  Zap,
} from 'lucide-react'
import type { Vehicle } from '../../../api/vehicles'
import { AppSelect } from '../../../components/formControls'
import { Field, dash, initials, moneyInr, statusTone } from './helpers'

type Props = {
  vehicle: Vehicle
  assignRef: RefObject<HTMLElement | null>
  drivers: Array<{ id: number; text: string }>
  users: Array<{ id: number; text?: string; name?: string }>
  assignTargetType: 'driver' | 'user'
  setAssignTargetType: (t: 'driver' | 'user') => void
  assignDriverId: string
  setAssignDriverId: (v: string) => void
  assignUserId: string
  setAssignUserId: (v: string) => void
  assignReason: string
  setAssignReason: (v: string) => void
  unassignReason: string
  setUnassignReason: (v: string) => void
  busy: boolean
  onAssign: () => void
  onUnassign: () => void
  onQuick: (action: 'service' | 'inspection' | 'map' | 'rc' | 'activity') => void
}

export default function OverviewTab(props: Props) {
  const {
    vehicle,
    assignRef,
    drivers,
    users,
    assignTargetType,
    setAssignTargetType,
    assignDriverId,
    setAssignDriverId,
    assignUserId,
    setAssignUserId,
    assignReason,
    setAssignReason,
    unassignReason,
    setUnassignReason,
    busy,
    onAssign,
    onUnassign,
    onQuick,
  } = props

  const tone = statusTone(vehicle)
  const statusClass =
    tone === 'maintenance' ? 'vad-status--maintenance'
      : tone === 'inactive' ? 'vad-status--inactive'
        : tone === 'assigned' ? 'vad-status--assigned'
          : 'vad-status--active'

  const makeModel = [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(' · ') || vehicle.model || '—'
  const yearColor = [vehicle.model_year, vehicle.color].filter(Boolean).join(' / ') || '—'
  const isEv = vehicle.fuel_type === 'EV'

  return (
    <>
      <div className="vad-overview">
        <article className="vad-card">
          <div className="vad-card__head">
            <h3>Basic information</h3>
          </div>
          <dl className="vad-info-grid">
            <Field label="Asset ID">{vehicle.id}</Field>
            <Field label="Fleet ID">{dash(vehicle.fleet_id)}</Field>
            <Field label="Registration No.">{vehicle.vehicle_number}</Field>
            <Field label="Type">{dash(vehicle.vehicle_type)}</Field>
            <Field label="Make / Model">{makeModel}</Field>
            <Field label="Year / Color">{yearColor}</Field>
            <Field label="Category">{dash(vehicle.category)}</Field>
            <Field label="Fuel">{dash(vehicle.fuel_type)}</Field>
            <Field label="Seating capacity">{dash(vehicle.seats)}</Field>
            <Field label="Vehicle class">{dash(vehicle.vehicle_class)}</Field>
            <Field label="Status">
              <span className={`vad-status ${statusClass}`}>{vehicle.status || '—'}</span>
            </Field>
            <Field label="Purchase value">{moneyInr(vehicle.purchase_cost)}</Field>
          </dl>
        </article>

        <article className="vad-card" id="vad-assignment" ref={assignRef as RefObject<HTMLElement>}>
          <div className="vad-card__head">
            <h3>Current assignment</h3>
          </div>
          {vehicle.assigned_to ? (
            <div className="vad-assign-body">
              <div className="vad-assign-person">
                <div className="vad-avatar">{initials(vehicle.assigned_name)}</div>
                <div>
                  <strong>{vehicle.assigned_name}</strong>
                  <span>
                    {[vehicle.assignment_kind || 'Vehicle assignee', vehicle.department_id ? null : null]
                      .filter(Boolean)
                      .join(' · ') || 'Vehicle assignee'}
                    {vehicle.team_name ? ` · ${vehicle.team_name}` : ''}
                  </span>
                </div>
              </div>
              <dl className="vad-assign-meta">
                <div>
                  <dt>Assigned on</dt>
                  <dd>{dash(vehicle.last_checkout)}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{dash(vehicle.assignment_location || vehicle.location_name)}</dd>
                </div>
                {vehicle.driver_phone ? (
                  <div>
                    <dt>Phone</dt>
                    <dd>{vehicle.driver_phone}</dd>
                  </div>
                ) : null}
              </dl>
              <button type="button" className="vad-link-btn" onClick={() => onQuick('activity')}>
                View assignment history
              </button>
              <div className="vad-assign-actions">
                <input
                  className="form-control"
                  value={unassignReason}
                  onChange={(e) => setUnassignReason(e.target.value)}
                  placeholder="Unassign reason (required)"
                  aria-label="Unassign reason"
                />
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  disabled={busy}
                  onClick={onUnassign}
                >
                  Unassign
                </button>
              </div>
            </div>
          ) : (
            <div className="vad-assign-form">
              <div className="vad-empty" style={{ textAlign: 'left', padding: '0 0 4px' }}>
                <strong>Unassigned</strong>
                Assign this vehicle to a driver or app user.
                {' '}<Link to="/drivers">Manage drivers</Link>
              </div>
              <div className="vad-assign-toggle">
                <button
                  type="button"
                  className={`btn btn-sm ${assignTargetType === 'driver' ? 'btn-primary' : 'btn-default'}`}
                  onClick={() => setAssignTargetType('driver')}
                >
                  Driver
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${assignTargetType === 'user' ? 'btn-primary' : 'btn-default'}`}
                  onClick={() => setAssignTargetType('user')}
                >
                  App user
                </button>
              </div>
              {assignTargetType === 'driver' ? (
                <AppSelect
                  value={assignDriverId}
                  onChange={setAssignDriverId}
                  searchable
                  placeholder="Select driver…"
                  options={[
                    { value: '', label: 'Select driver…' },
                    ...drivers.map((d) => ({ value: String(d.id), label: d.text })),
                  ]}
                />
              ) : (
                <AppSelect
                  value={assignUserId}
                  onChange={setAssignUserId}
                  searchable
                  placeholder="Select user…"
                  options={[
                    { value: '', label: 'Select user…' },
                    ...users.map((u) => ({ value: String(u.id), label: u.text || u.name || String(u.id) })),
                  ]}
                />
              )}
              <div className="vad-assign-actions">
                <input
                  className="form-control"
                  placeholder="Assignment reason"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                />
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onAssign}>
                  Assign
                </button>
              </div>
            </div>
          )}
        </article>

        <article className="vad-card">
          <div className="vad-card__head">
            <h3>Quick actions</h3>
          </div>
          <div className="vad-qa">
            <button type="button" onClick={() => onQuick('service')}>
              <CalendarClock /> Schedule service
            </button>
            <button type="button" onClick={() => onQuick('inspection')}>
              <ClipboardCheck /> Log inspection
            </button>
            <button type="button" onClick={() => onQuick('map')}>
              <MapPinned /> View on map
            </button>
            <button type="button" onClick={() => onQuick('rc')}>
              <FileDown /> Download RC
            </button>
            <button type="button" onClick={() => onQuick('activity')}>
              <History /> View activity log
            </button>
          </div>
        </article>
      </div>

      <div className="vad-overview__bottom" style={{ marginTop: 16 }}>
        <article className="vad-card">
          <div className="vad-card__head">
            <h3>Identification</h3>
          </div>
          <dl className="vad-info-grid vad-info-grid--2">
            <Field label="VIN / Chassis No.">{dash(vehicle.vin || vehicle.chassis_number)}</Field>
            <Field label="Engine No.">{dash(vehicle.engine_number)}</Field>
            <Field label="Motor No.">{dash(vehicle.motor_number)}</Field>
            <Field label="Battery serial No.">{dash(vehicle.battery_serial_number)}</Field>
            <Field label="Registration date">{dash(vehicle.registration_date)}</Field>
            <Field label="RTO">{dash([vehicle.registration_state, vehicle.registration_rto].filter(Boolean).join(' · ') || null)}</Field>
            <Field label="Registration valid upto">{dash(vehicle.registration_expiry)}</Field>
            <Field label="FIT valid upto">{dash(vehicle.fitness_expiry_date)}</Field>
          </dl>
        </article>

        {isEv ? (
          <article className="vad-card">
            <div className="vad-card__head">
              <h3>EV specifications</h3>
              <div className="vad-card__icon" aria-hidden><Zap size={16} /></div>
            </div>
            <dl className="vad-info-grid vad-info-grid--2">
              <Field label="Battery capacity">
                {vehicle.battery_capacity != null
                  ? `${vehicle.battery_capacity} ${vehicle.battery_unit || 'kWh'}`
                  : '—'}
              </Field>
              <Field label="Usable capacity">
                {vehicle.usable_battery_capacity != null
                  ? `${vehicle.usable_battery_capacity} ${vehicle.battery_unit || 'kWh'}`
                  : '—'}
              </Field>
              <Field label="Range (ARAI)">
                {vehicle.range_value != null
                  ? `${vehicle.range_value} ${vehicle.range_unit || 'km'}`
                  : '—'}
              </Field>
              <Field label="Charging type">{dash(vehicle.charging_types)}</Field>
              <Field label="AC charging">
                {vehicle.ac_charging_capacity != null ? `${vehicle.ac_charging_capacity} kW` : '—'}
              </Field>
              <Field label="DC fast charging">
                {vehicle.dc_fast_charging_capacity != null ? `${vehicle.dc_fast_charging_capacity} kW` : '—'}
              </Field>
              <Field label="Connector type">{dash(vehicle.charging_connector_type)}</Field>
              <Field label="Powertrain">{dash(vehicle.powertrain_type)}</Field>
            </dl>
          </article>
        ) : (
          <article className="vad-card">
            <div className="vad-card__head">
              <h3>Home location</h3>
            </div>
            <dl className="vad-info-grid vad-info-grid--2">
              <Field label="Type">{dash(vehicle.location_type)}</Field>
              <Field label="Parking">{dash(vehicle.parking_location)}</Field>
              <Field label="Coordinates">
                {vehicle.latitude != null && vehicle.longitude != null
                  ? `${vehicle.latitude}, ${vehicle.longitude}`
                  : '—'}
              </Field>
              <Field label="Address">{dash(vehicle.address)}</Field>
            </dl>
          </article>
        )}
      </div>
    </>
  )
}
