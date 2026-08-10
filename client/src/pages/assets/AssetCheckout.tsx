import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { AppSelect, Box, Field } from '../../components/ui'
import { hardwareApi, mastersApi, usersApi, type SelectOption } from '../../api/client'
import { employeesApi } from '../../api/employees'
import { useToast } from '../../components/Toast'

export function AssetCheckout() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null)
  const [targetType, setTargetType] = useState('employee')
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const [employeeOpts, setEmployeeOpts] = useState<SelectOption[]>([])
  const [userOpts, setUserOpts] = useState<SelectOption[]>([])
  const [locationOpts, setLocationOpts] = useState<SelectOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [empSearch, setEmpSearch] = useState('')

  useEffect(() => {
    if (!id) return
    hardwareApi.get(id).then(setAsset).catch(() => setAsset(null))
  }, [id])

  useEffect(() => {
    employeesApi.selectlist(empSearch || undefined)
      .then((r) => {
        setEmployeeOpts(r.results || [])
        if (!targetId && r.results?.[0]) setTargetId(String(r.results[0].id))
      })
      .catch(() => setEmployeeOpts([]))
  }, [empSearch])

  useEffect(() => {
    usersApi.list({ limit: 100 })
      .then((r) => {
        setUserOpts(
          r.rows.map((u) => ({
            id: Number(u.id),
            text: String(u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()),
          })),
        )
      })
      .catch(() => setUserOpts([]))
    mastersApi.locations()
      .then((r) => setLocationOpts(r.results || []))
      .catch(() => setLocationOpts([]))
  }, [])

  if (!asset) {
    return (
      <AppLayout title="Assign Asset">
        <Box title="Assign"><p className="text-muted">Loading…</p></Box>
      </AppLayout>
    )
  }

  const assetId = Number(asset.id || id)
  const assetTag = String(asset.asset_tag || '')
  const modelName = typeof asset.model === 'object' && asset.model
    ? String((asset.model as { name?: string }).name || '')
    : String(asset.model || '')
  const alreadyAssigned = asset.assigned_to as { id?: number; name?: string } | null
  const canCheckout = Boolean((asset.available_actions as { checkout?: boolean } | undefined)?.checkout)

  if (alreadyAssigned) {
    const who = String(alreadyAssigned.name || alreadyAssigned.id || 'someone')
    return (
      <AppLayout title="Assign Asset" subtitle={assetTag}>
        <div className="callout callout-warning">
          <p>
            This asset is already assigned to <strong>{who}</strong>.
            Unassign it first before assigning to someone else.
          </p>
        </div>
        <Link to={`/hardware/${assetId}/checkin`} className="btn btn-primary">Unassign</Link>{' '}
        <Link to={`/hardware/${assetId}`} className="btn btn-default">Back to asset</Link>
      </AppLayout>
    )
  }

  if (!canCheckout) {
    return (
      <AppLayout title="Assign Asset" subtitle={assetTag}>
        <div className="callout callout-warning">
          <p>This asset cannot be assigned in its current status. Set it to In Stock (Ready to Assign) first.</p>
        </div>
        <Link to={`/hardware/${assetId}`} className="btn btn-default">Back to asset</Link>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Assign Asset" subtitle={assetTag}>
      <div className="row">
        <div className="col-md-7">
          <Box title={`Asset Tag ${assetTag}`} type="primary">
            {error && <div className="callout callout-danger"><p>{error}</p></div>}
            <form
              className="form-horizontal"
              onSubmit={async (e) => {
                e.preventDefault()
                setError('')
                if (!targetId) {
                  setError('Select who to assign this asset to')
                  return
                }
                setBusy(true)
                try {
                  const body: Record<string, unknown> = { checkout_to_type: targetType }
                  if (targetType === 'employee') body.assigned_employee = Number(targetId)
                  if (targetType === 'user') body.assigned_user = Number(targetId)
                  if (targetType === 'location') body.assigned_location = Number(targetId)
                  if (targetType === 'asset') body.assigned_asset = Number(targetId)
                  if (note.trim()) body.note = note.trim()
                  await hardwareApi.checkout(assetId, body)
                  toast.success('Asset assigned')
                  navigate(`/hardware/${assetId}`)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Assign failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <div className="form-group">
                <label className="control-label">Model</label>
                <div className="form-control-wrap">
                  <p className="form-control-static" style={{ paddingTop: 7 }}>{modelName || '—'}</p>
                </div>
              </div>
              <Field label="Assign to" required>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                  {(['employee', 'user', 'location'] as const).map((t) => (
                    <label key={t} className="radio">
                      <input
                        type="radio"
                        name="type"
                        checked={targetType === t}
                        onChange={() => {
                          setTargetType(t)
                          setTargetId('')
                        }}
                      />{' '}
                      {t === 'employee' ? 'Employee' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </label>
                  ))}
                </div>
                {targetType === 'employee' && (
                  <input
                    className="form-control"
                    style={{ marginBottom: 8 }}
                    placeholder="Search employees…"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                  />
                )}
                <AppSelect
                  value={targetId}
                  onChange={setTargetId}
                  required
                  searchable
                  placeholder="— Select —"
                  options={[
                    { value: '', label: '— Select —' },
                    ...(targetType === 'employee' ? employeeOpts : targetType === 'user' ? userOpts : locationOpts)
                      .map((o) => ({ value: String(o.id), label: o.text })),
                  ]}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className="form-control"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional assignment note"
                  rows={3}
                />
              </Field>
              <button type="submit" className="btn btn-theme" disabled={busy}>
                {busy ? 'Assigning…' : 'Assign'}
              </button>{' '}
              <Link to={`/hardware/${assetId}`} className="btn btn-default">Cancel</Link>
            </form>
          </Box>
        </div>
        <div className="col-md-5">
          <div className="callout callout-info">
            <h4>Assign Tip</h4>
            <p>Assign assets to <strong>Employees</strong> from the HRMS directory. App Users are for login accounts only.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export function AssetCheckin() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    hardwareApi.get(id).then(setAsset).catch(() => setAsset(null))
  }, [id])

  if (!asset) {
    return (
      <AppLayout title="Unassign Asset">
        <Box title="Unassign"><p className="text-muted">Loading…</p></Box>
      </AppLayout>
    )
  }

  const assetId = Number(asset.id || id)
  const assetTag = String(asset.asset_tag || '')
  const assigned = asset.assigned_to as { name?: string } | string | null
  const assignedName = typeof assigned === 'object' && assigned ? assigned.name : assigned

  return (
    <AppLayout title="Unassign Asset" subtitle={assetTag}>
      <div className="col-md-7" style={{ padding: 0 }}>
        <Box title={`Unassign ${assetTag}`} type="primary">
          {error && <div className="callout callout-danger"><p>{error}</p></div>}
          <form
            className="form-horizontal"
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              if (!reason.trim()) {
                setError('Reason is required to unassign')
                return
              }
              setBusy(true)
              try {
                await hardwareApi.checkin(assetId, { status_id: 1, reason: reason.trim() })
                toast.success('Asset unassigned')
                navigate(`/hardware/${assetId}`)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unassign failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            <p>Currently assigned to: <strong>{String(assignedName || '—')}</strong></p>
            <Field label="Reason" required>
              <textarea
                className="form-control"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this asset being unassigned?"
                rows={3}
                required
              />
              <span className="help-block">Stored on both the asset and employee history.</span>
            </Field>
            <button type="submit" className="btn btn-theme" disabled={busy}>
              {busy ? 'Unassigning…' : 'Unassign'}
            </button>{' '}
            <Link to={`/hardware/${assetId}`} className="btn btn-default">Cancel</Link>
          </form>
        </Box>
      </div>
    </AppLayout>
  )
}
