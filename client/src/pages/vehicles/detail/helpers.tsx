import type { ReactNode } from 'react'
import type { Vehicle } from '../../../api/vehicles'

export function dash(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

export function moneyInr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN')}`
}

export function initials(name: string | null | undefined): string {
  const parts = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

export function statusTone(vehicle: Vehicle): 'active' | 'assigned' | 'maintenance' | 'inactive' {
  const s = (vehicle.status || '').toLowerCase()
  if (s.includes('maint')) return 'maintenance'
  if (s.includes('inactive') || s.includes('retire')) return 'inactive'
  if (vehicle.assigned_to) return 'assigned'
  return 'active'
}

export function sohLabel(pct: number | null | undefined): string {
  if (pct == null) return '—'
  if (pct >= 90) return 'Excellent'
  if (pct >= 75) return 'Good'
  if (pct >= 60) return 'Fair'
  return 'Needs attention'
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="vad-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
