import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ListFilter, X } from 'lucide-react'
import { AppSelect, type AppSelectOption } from './formControls'

export type VehicleListFilters = {
  search: string
  cityId: string
  location: string
  modelId: string
  model: string
  category: string
  fuelType: string
  verified: string
  registered: string
}

export const EMPTY_VEHICLE_FILTERS: VehicleListFilters = {
  search: '',
  cityId: '',
  location: '',
  modelId: '',
  model: '',
  category: '',
  fuelType: '',
  verified: '',
  registered: '',
}

export function vehicleFilterCount(f: VehicleListFilters) {
  return [
    f.search,
    f.cityId || f.location,
    f.modelId || f.model,
    f.category,
    f.fuelType,
    f.verified,
    f.registered,
  ].filter(Boolean).length
}

export function VehicleFiltersButton({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`rm-filters-btn${count ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <ListFilter size={16} strokeWidth={2.25} aria-hidden />
      Filters{count ? ` (${count})` : ''}
    </button>
  )
}

function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rm-filter-sheet-field">
      <span>{label}</span>
      {children}
    </div>
  )
}

type FacetOpt = { id?: number | null; value: string; c: number }

function pickCity(val: string, locations: FacetOpt[]) {
  const hit = locations.find((o) => String(o.id) === val || o.value === val)
  if (hit?.id != null) return { cityId: String(hit.id), location: '' }
  return { cityId: '', location: val }
}

function pickModel(val: string, models: FacetOpt[]) {
  const hit = models.find((o) => String(o.id) === val || o.value === val)
  if (hit?.id != null) return { modelId: String(hit.id), model: '' }
  return { modelId: '', model: val }
}

export function VehicleFilterSheet({
  open,
  filters,
  cityOptions,
  modelOptions,
  categoryOptions,
  fuelOptions,
  verifiedOptions,
  registeredOptions,
  locations,
  models,
  onClose,
  onApply,
}: {
  open: boolean
  filters: VehicleListFilters
  cityOptions: AppSelectOption[]
  modelOptions: AppSelectOption[]
  categoryOptions: AppSelectOption[]
  fuelOptions: AppSelectOption[]
  verifiedOptions: AppSelectOption[]
  registeredOptions: AppSelectOption[]
  locations: FacetOpt[]
  models: FacetOpt[]
  onClose: () => void
  onApply: (next: VehicleListFilters) => void
}) {
  const [draft, setDraft] = useState(filters)

  useEffect(() => {
    if (!open) return
    setDraft(filters)
  }, [open, filters])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const mq = window.matchMedia('(min-width: 992px)')
    const onMq = () => { if (mq.matches) onClose() }
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onMq)
    if (mq.matches) onClose()
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onMq)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="rm-filter-sheet" role="dialog" aria-modal="true" aria-label="Vehicle filters">
      <button type="button" className="rm-filter-sheet-scrim" aria-label="Close filters" onClick={onClose} />
      <div className="rm-filter-sheet-panel">
        <div className="rm-filter-sheet-head">
          <div>
            <p className="rm-filter-sheet-title">Filters</p>
            <p className="rm-filter-sheet-hint">Tap Apply to update the fleet list</p>
          </div>
          <button type="button" className="rm-filter-sheet-close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="rm-filter-sheet-body">
          <SheetField label="Search">
            <input
              className="form-control"
              placeholder="Search plate, model, city…"
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            />
          </SheetField>
          <SheetField label="City">
            <AppSelect
              value={draft.cityId || draft.location}
              searchable
              placeholder="All cities"
              options={cityOptions}
              onChange={(val) => setDraft((d) => ({ ...d, ...pickCity(val, locations) }))}
            />
          </SheetField>
          <SheetField label="Model">
            <AppSelect
              value={draft.modelId || draft.model}
              searchable
              placeholder="All models"
              options={modelOptions}
              onChange={(val) => setDraft((d) => ({ ...d, ...pickModel(val, models) }))}
            />
          </SheetField>
          <SheetField label="Category">
            <AppSelect
              value={draft.category}
              onChange={(category) => setDraft((d) => ({ ...d, category }))}
              searchable={false}
              placeholder="All categories"
              options={categoryOptions}
            />
          </SheetField>
          <SheetField label="Fuel type">
            <AppSelect
              value={draft.fuelType}
              onChange={(fuelType) => setDraft((d) => ({ ...d, fuelType }))}
              searchable={false}
              placeholder="All fuel types"
              options={fuelOptions}
            />
          </SheetField>
          <SheetField label="Capture status">
            <AppSelect
              value={draft.verified}
              onChange={(v) => {
                setDraft((d) => ({
                  ...d,
                  verified: v,
                  registered: v === '0' || v === '1' ? '1' : d.registered,
                }))
              }}
              searchable={false}
              placeholder="All capture status"
              options={verifiedOptions}
            />
          </SheetField>
          <SheetField label="Form capture">
            <AppSelect
              value={draft.registered}
              onChange={(v) => {
                setDraft((d) => ({
                  ...d,
                  registered: v,
                  verified: v === '0' ? '' : d.verified,
                }))
              }}
              searchable={false}
              placeholder="All form capture"
              options={registeredOptions}
            />
          </SheetField>
        </div>

        <div className="rm-filter-sheet-foot">
          <button
            type="button"
            className="btn btn-default rm-filter-sheet-action"
            onClick={() => onApply({ ...EMPTY_VEHICLE_FILTERS })}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-theme rm-filter-sheet-action"
            onClick={() => onApply({ ...draft, search: draft.search.trim() })}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
