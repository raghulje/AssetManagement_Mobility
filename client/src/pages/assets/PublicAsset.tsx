import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getApiBase, getStorageBase } from '../../api/baseUrl'

type PublicAsset = {
  id: number
  asset_tag: string
  name?: string | null
  serial?: string | null
  model?: string | null
  model_number?: string | null
  manufacturer?: string | null
  status?: string | null
  company?: string | null
  department?: string | null
  location?: string | null
  supplier?: string | null
  purchase_date?: string | null
  purchase_cost?: number | string | null
  order_number?: string | null
  warranty_months?: number | null
  asset_eol_date?: string | null
  notes?: string | null
  assigned_to?: { name?: string; type?: string } | null
  last_checkout?: string | null
  last_checkin?: string | null
  last_audit_date?: string | null
  next_audit_date?: string | null
  label_printed_at?: string | null
  label_print_count?: number
  last_agent_sync_at?: string | null
  agent_hostname?: string | null
  public_url?: string
  qr_image_url?: string | null
}

function Field({ label, value }: { label: string; value: unknown }) {
  const text = value == null || value === '' ? '—' : String(value)
  return (
    <div className="public-asset-field">
      <span className="public-asset-field-label">{label}</span>
      <span className="public-asset-field-value" title={text}>{text}</span>
    </div>
  )
}

export default function PublicAsset() {
  const { token } = useParams()
  const [asset, setAsset] = useState<PublicAsset | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${getApiBase()}/public/assets/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data?.messages?.[0] || data?.message || 'Not found')
        setAsset(data as PublicAsset)
        setError('')
      })
      .catch((e: Error) => {
        setAsset(null)
        setError(e.message || 'Asset not found')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="public-asset-page">
        <div className="public-asset-card"><p className="text-muted">Loading asset…</p></div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="public-asset-page">
        <div className="public-asset-card">
          <h1>Asset not found</h1>
          <p className="text-muted">Token: {token}</p>
          {error ? <p className="text-danger">{error}</p> : null}
        </div>
      </div>
    )
  }

  const qrSrc = asset.qr_image_url
    ? (asset.qr_image_url.startsWith('http') ? asset.qr_image_url : `${getStorageBase()}${asset.qr_image_url}`)
    : null

  return (
    <div className="public-asset-page">
      <div className="public-asset-card">
        <header className="public-asset-header">
          <div>
            <p className="public-asset-brand">Refex IT Asset</p>
            <h1>{asset.asset_tag}</h1>
            <p className="public-asset-subtitle">{asset.name || asset.model || 'Asset details'}</p>
          </div>
          {qrSrc ? (
            <img className="public-asset-qr" src={qrSrc} alt={`QR for ${asset.asset_tag}`} />
          ) : null}
        </header>

        <div className="public-asset-grid">
          <Field label="Asset Tag" value={asset.asset_tag} />
          <Field label="Name" value={asset.name} />
          <Field label="Serial" value={asset.serial} />
          <Field label="Model" value={[asset.model, asset.model_number].filter(Boolean).join(' · ')} />
          <Field label="Manufacturer" value={asset.manufacturer} />
          <Field label="Status" value={asset.status} />
          <Field label="Assigned To" value={asset.assigned_to?.name || 'Unassigned'} />
          <Field label="Company" value={asset.company} />
          <Field label="Department" value={asset.department} />
          <Field label="Location" value={asset.location} />
          <Field label="Supplier" value={asset.supplier} />
          <Field label="Order / PO" value={asset.order_number} />
          <Field label="Purchase Date" value={asset.purchase_date} />
          <Field label="Purchase Cost" value={asset.purchase_cost} />
          <Field label="Warranty (months)" value={asset.warranty_months} />
          <Field label="EOL Date" value={asset.asset_eol_date} />
          <Field label="Last Checkout" value={asset.last_checkout} />
          <Field label="Last Checkin" value={asset.last_checkin} />
          <Field label="Last Audit" value={asset.last_audit_date} />
          <Field label="Next Audit" value={asset.next_audit_date} />
          <Field label="Label Printed" value={asset.label_printed_at} />
          <Field label="Print Count" value={asset.label_print_count} />
          <Field label="Agent Hostname" value={asset.agent_hostname} />
          <Field label="Last Agent Sync" value={asset.last_agent_sync_at} />
        </div>

        {asset.notes ? (
          <div className="public-asset-notes">
            <strong>Notes</strong>
            <p>{asset.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
