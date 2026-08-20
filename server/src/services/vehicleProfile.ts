/**
 * Refex Mobility vehicle asset profile — field whitelist + normalize helpers.
 * Keep vehicles vehicle-specific (no polymorphic asset engine).
 */

export const VEHICLE_PROFILE_KEYS = [
  'fleet_id',
  'vehicle_type',
  'vehicle_sub_type',
  'make',
  'variant',
  'model_year',
  'color',
  'primary_image_path',
  'seats',
  'description',
  'vin',
  'chassis_number',
  'engine_number',
  'motor_number',
  'battery_serial_number',
  'vehicle_id_number',
  'key_id',
  'rfid_tag',
  'barcode',
  'registration_date',
  'registration_state',
  'registration_rto',
  'registration_expiry',
  'vehicle_class',
  'puc_number',
  'puc_issue_date',
  'puc_expiry_date',
  'fitness_number',
  'fitness_expiry_date',
  'permit_number',
  'permit_expiry_date',
  'powertrain_type',
  'battery_type',
  'battery_capacity',
  'battery_unit',
  'usable_battery_capacity',
  'charging_types',
  'ac_charging_capacity',
  'dc_fast_charging_capacity',
  'charging_connector_type',
  'charging_port_count',
  'range_value',
  'range_unit',
  'battery_warranty_start',
  'battery_warranty_end',
  'battery_warranty_km',
  'battery_health_pct',
  'battery_cycle_count',
  'state_of_charge_pct',
  'last_charging_at',
  'last_charging_location',
  'charging_station_id',
  'telematics_device_id',
  'company_id',
  'legal_entity_id',
  'business_unit',
  'department_id',
  'team_name',
  'cost_center',
  'sub_location',
  'fleet_name',
  'vehicle_pool',
  'vehicle_owner_id',
  'fleet_manager_id',
  'current_custodian_id',
  'assignment_kind',
  'driver_name',
  'driver_phone',
  'assignment_status',
  'assignment_location',
  'location_type',
  'latitude',
  'longitude',
  'address',
  'last_location_updated',
  'gps_accuracy_m',
  'geofence_name',
  'parking_location',
  'procurement_type',
  'invoice_number',
  'invoice_date',
  'vendor_name',
  'dealer_name',
  'tax_amount',
  'total_cost',
  'currency',
  'funding_type',
  'financing_company',
  'loan_number',
  'loan_start_date',
  'loan_end_date',
  'asset_cost',
  'capitalized_cost',
  'current_book_value',
  'depreciation_method',
  'depreciation_rate',
  'depreciation_start_date',
  'useful_life_months',
  'residual_value',
  'gl_account',
  'profit_center',
  'asset_class',
  'insurance_provider',
  'insurance_policy_number',
  'insurance_policy_type',
  'insurance_start_date',
  'insurance_expiry_date',
  'insurance_idv',
  'insurance_premium',
  'insured_name',
  'insurance_status',
  'insurance_renewal_reminder',
  'warranty_provider',
  'warranty_start_date',
  'warranty_end_date',
  'warranty_km',
  'current_odometer_km',
  'warranty_status',
  'has_battery_warranty',
  'has_motor_warranty',
  'motor_warranty_end',
] as const

export type VehicleProfileKey = (typeof VEHICLE_PROFILE_KEYS)[number]

const NUMBER_KEYS = new Set<string>([
  'model_year', 'seats', 'battery_capacity', 'usable_battery_capacity',
  'ac_charging_capacity', 'dc_fast_charging_capacity', 'charging_port_count',
  'range_value', 'battery_warranty_km', 'battery_health_pct', 'battery_cycle_count',
  'state_of_charge_pct', 'company_id', 'legal_entity_id', 'department_id',
  'vehicle_owner_id', 'fleet_manager_id', 'current_custodian_id',
  'latitude', 'longitude', 'gps_accuracy_m', 'tax_amount', 'total_cost',
  'asset_cost', 'capitalized_cost', 'current_book_value', 'depreciation_rate',
  'useful_life_months', 'residual_value', 'insurance_idv', 'insurance_premium',
  'warranty_km', 'current_odometer_km',
])

const BOOL_KEYS = new Set<string>(['has_battery_warranty', 'has_motor_warranty'])

const UNIQUE_KEYS = [
  'fleet_id',
  'vin',
  'chassis_number',
  'battery_serial_number',
  'rfid_tag',
  'barcode',
] as const

function emptyToNull(v: unknown): unknown {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v === 'string' && !v.trim()) return null
  if (Array.isArray(v)) {
    const joined = v.map(String).map((s) => s.trim()).filter(Boolean).join(',')
    return joined || null
  }
  return v
}

export function normalizeProfileValue(key: string, raw: unknown): unknown {
  const v = emptyToNull(raw)
  if (v === undefined || v === null) return v === undefined ? undefined : null
  if (BOOL_KEYS.has(key)) {
    if (typeof v === 'boolean') return v ? 1 : 0
    if (v === 1 || v === '1' || v === 'true' || v === 'yes') return 1
    return 0
  }
  if (NUMBER_KEYS.has(key)) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (key === 'charging_types' && typeof v === 'string') {
    return v.split(',').map((s) => s.trim()).filter(Boolean).join(',') || null
  }
  return typeof v === 'string' ? v.trim() : v
}

/** Merge body onto existing for profile columns (create: no existing). */
export function pickVehicleProfile(
  body: Record<string, unknown>,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of VEHICLE_PROFILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = normalizeProfileValue(key, body[key])
    } else if (existing) {
      out[key] = existing[key] ?? null
    } else {
      out[key] = null
    }
  }
  return out
}

export function mapVehicleProfile(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of VEHICLE_PROFILE_KEYS) {
    const v = row[key]
    if (BOOL_KEYS.has(key)) {
      out[key] = v === 1 || v === true || v === '1'
      continue
    }
    if (NUMBER_KEYS.has(key)) {
      out[key] = v != null && v !== '' ? Number(v) : null
      continue
    }
    if (key === 'charging_types') {
      const s = v != null ? String(v) : ''
      out[key] = s
      out.charging_types_list = s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []
      continue
    }
    out[key] = v ?? null
  }
  return out
}

export { UNIQUE_KEYS }
