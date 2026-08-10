import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppLayout from '../../layout/AppLayout'
import { StatusBadge } from '../../components/ui'
import { DetailLayout, DetailPanel } from '../../components/DetailLayout'
import AssetAttachments from '../../components/AssetAttachments'
import { api, hardwareApi } from '../../api/client'
import { getStorageBase } from '../../api/baseUrl'
import { formatINR } from '../../utils/money'

type TabId = 'details' | 'attachments' | 'history' | 'agent'

type AgentStatus = {
  registered?: boolean
  presence?: string
  presence_label?: string
  online?: boolean
  pending_commands?: number
  last_agent_sync_at?: string | null
  agent_hostname?: string | null
  agent?: {
    hostname?: string | null
    serial_number?: string | null
    platform?: string | null
    agent_version?: string | null
    last_heartbeat_at?: string | null
    last_inventory_at?: string | null
  } | null
  recent_commands?: Array<{
    id: number
    command: string
    status: string
    created_at?: string | null
    completed_at?: string | null
    error_message?: string | null
  }>
}

export default function AssetDetail() {
  const { id } = useParams()
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null)
  const [tab, setTab] = useState<TabId>('details')
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [agentBusy, setAgentBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadAgent = () => {
    if (!id) return
    hardwareApi.agentStatus(id)
      .then((s) => setAgentStatus(s as AgentStatus))
      .catch(() => setAgentStatus(null))
  }

  const load = () => {
    if (!id) return
    hardwareApi.get(id).then((a) => setAsset(a)).catch(() => setAsset(null))
    hardwareApi.history(id)
      .then((r) => setHistory(r.rows || []))
      .catch(() => setHistory([]))
    loadAgent()
  }
  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (tab !== 'agent' || !id) return
    const t = window.setInterval(() => loadAgent(), 8000)
    return () => window.clearInterval(t)
  }, [tab, id])

  const a = asset || {
    id,
    asset_tag: '…',
    name: '',
    status: null,
    assigned_to: null,
    available_actions: {},
  }

  const status = a.status as { name?: string; status_type?: string } | undefined
  const assigned = a.assigned_to as { name?: string } | null
  const nest = (v: unknown) => (v && typeof v === 'object' && 'name' in (v as object) ? String((v as { name: string }).name) : String(v ?? '—'))

  const printLabel = async () => {
    try {
      const res = await api<{ pdf_base64: string }>(`/labels/hardware/${id}`, { method: 'POST', json: {} })
      const b64 = (res as { payload?: { pdf_base64: string }; pdf_base64?: string }).payload?.pdf_base64
        || (res as { pdf_base64?: string }).pdf_base64
      if (!b64) throw new Error('No PDF returned')
      const blob = await (await fetch(`data:application/pdf;base64,${b64}`)).blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setMsg('Print label generated — QR is permanent for this asset')
      load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Print label failed')
    }
  }

  const requestAgentScan = async () => {
    if (!id) return
    setAgentBusy(true)
    setMsg('')
    try {
      const res = await hardwareApi.agentScan(id, { command: 'scan' }) as {
        messages?: string[]
        payload?: { message?: string }
      }
      setMsg(res.payload?.message || res.messages?.[0] || 'Scan requested')
      loadAgent()
      setTab('agent')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not request scan')
    } finally {
      setAgentBusy(false)
    }
  }

  const presenceClass = (p?: string) => {
    if (p === 'online') return 'label label-success'
    if (p === 'idle') return 'label label-warning'
    if (p === 'stale') return 'label label-default'
    return 'label label-default'
  }

  const actionLabel = (action: string) => {
    if (action === 'checkout') return 'Assigned'
    if (action === 'checkin') return 'Unassigned'
    if (action === 'replace_out') return 'Replaced (out)'
    if (action === 'replace_in') return 'Replaced (in)'
    return action
  }

  return (
    <AppLayout title={String(a.asset_tag)} subtitle={String(a.name || '')}>
      {msg && <div className="callout callout-info"><p>{msg}</p></div>}
      <DetailLayout
        title={String(a.asset_tag)}
        backTo="/hardware"
        status={assigned ? 'Assigned' : String(status?.name || '—')}
        meta={[
          { label: 'Name', value: String(a.name || '—') },
          { label: 'Assigned', value: assigned?.name || 'Unassigned' },
          { label: 'Location', value: nest(a.location) },
        ]}
        actions={(
          <>
            {(a.available_actions as { checkout?: boolean })?.checkout && (
              <Link to={`/hardware/${a.id}/checkout`} className="btn btn-info btn-sm"><i className="fas fa-user-plus" /> Assign</Link>
            )}
            {(a.available_actions as { checkin?: boolean })?.checkin && (
              <Link to={`/hardware/${a.id}/checkin`} className="btn btn-primary btn-sm"><i className="fas fa-user-minus" /> Unassign</Link>
            )}
            <Link to={`/hardware/${a.id}/edit`} className="btn btn-warning btn-sm"><i className="fas fa-pencil-alt" /> Edit</Link>
            <Link to={`/hardware/${a.id}/audit`} className="btn btn-default btn-sm"><i className="fas fa-clipboard-check" /> Audit</Link>
            <button type="button" className="btn btn-default btn-sm" onClick={() => { void printLabel() }}>
              <i className="fas fa-print" /> Print Label
            </button>
            <button
              type="button"
              className="btn btn-info btn-sm"
              disabled={agentBusy || !agentStatus?.registered}
              title={agentStatus?.registered ? 'Ask the installed agent to re-collect inventory' : 'Install ITAgent_2026 on the device first'}
              onClick={() => { void requestAgentScan() }}
            >
              <i className="fas fa-satellite-dish" /> {agentBusy ? 'Requesting…' : 'Run agent scan'}
            </button>
            {a.qr_url ? (
              <a className="btn btn-default btn-sm" href={String(a.qr_url)} target="_blank" rel="noreferrer">
                <i className="fas fa-qrcode" /> Public QR page
              </a>
            ) : null}
          </>
        )}
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'agent', label: 'Agent' },
          { id: 'attachments', label: 'Attachments' },
          { id: 'history', label: 'History' },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as TabId)}
        fields={tab === 'details' ? [
          { label: 'Asset Tag', value: String(a.asset_tag) },
          { label: 'Serial', value: String(a.serial || '—') },
          { label: 'Model', value: `${nest(a.model)}${a.model_number ? ` (${String(a.model_number)})` : ''}` },
          {
            label: 'Status',
            value: (
              <StatusBadge
                status={assigned ? 'Assigned' : String(status?.name || '')}
                type={assigned ? 'deployed' : status?.status_type}
              />
            ),
          },
          { label: 'Assigned To', value: assigned?.name || <span className="text-muted">Unassigned</span> },
          { label: 'Location', value: nest(a.location) },
          { label: 'Company', value: nest(a.company) },
          { label: 'Department', value: nest(a.department) },
          { label: 'Manufacturer', value: nest(a.manufacturer) },
          { label: 'Supplier / Vendor', value: nest(a.supplier) },
          { label: 'Order / PO Number', value: String(a.order_number || '—') },
          { label: 'Purchase Cost', value: formatINR(a.purchase_cost) },
          { label: 'QR Token', value: a.qr_token ? String(a.qr_token) : <span className="text-muted">Not minted (Print Label once)</span> },
          {
            label: 'Public scan URL',
            value: a.qr_url
              ? <a href={String(a.qr_url)} target="_blank" rel="noreferrer">{String(a.qr_url)}</a>
              : '—',
          },
          { label: 'Label printed', value: a.label_printed_at ? `${String(a.label_printed_at)} (${Number(a.label_print_count || 0)}×)` : 'Never' },
          { label: 'Last agent sync', value: a.last_agent_sync_at ? `${String(a.last_agent_sync_at)}${a.agent_hostname ? ` · ${String(a.agent_hostname)}` : ''}` : '—' },
          { label: 'Notes', value: String(a.notes || '—'), full: true },
        ] : undefined}
      >
        {tab === 'details' && (
          <>
            <DetailPanel title="Print Label / QR">
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {a.qr_image_url ? (
                  <img
                    src={`${getStorageBase()}${String(a.qr_image_url)}`}
                    alt="Asset QR"
                    style={{ width: 120, height: 120, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}
                  />
                ) : (
                  <p className="text-muted mb-0">No QR yet — click Print Label to mint a permanent code.</p>
                )}
                <div>
                  <p className="help-block mb-1">
                    QR is permanent for this asset. Reassign / upgrade does not change it.
                    The printed label never shows the assignee name.
                  </p>
                  <button type="button" className="btn btn-theme btn-sm" onClick={() => { void printLabel() }}>
                    <i className="fas fa-print" /> Print Label
                  </button>
                </div>
              </div>
            </DetailPanel>
            <DetailPanel title="Image">
              {a.image ? (
                <img src={`${getStorageBase()}/storage/${String(a.image).replace(/^public\//, '')}`} alt="" style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : (
                <p className="text-muted mb-0">No image — use Edit to upload one.</p>
              )}
            </DetailPanel>
          </>
        )}

        {tab === 'agent' && (
          <DetailPanel title="ITAgent control">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="help-block mb-1">Agent presence</div>
                <span className={presenceClass(agentStatus?.presence)}>
                  {agentStatus?.presence_label || 'No agent'}
                </span>
                {agentStatus?.pending_commands ? (
                  <span className="label label-info" style={{ marginLeft: 8 }}>
                    {agentStatus.pending_commands} queued
                  </span>
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p className="help-block mb-2">
                  When ITAgent_2026 is installed and running on the device, you can queue a remote inventory scan from here.
                  The agent polls the server and pushes fresh hardware details back.
                </p>
                <button
                  type="button"
                  className="btn btn-theme btn-sm"
                  disabled={agentBusy || !agentStatus?.registered}
                  onClick={() => { void requestAgentScan() }}
                >
                  <i className="fas fa-sync" /> {agentBusy ? 'Requesting…' : 'Request inventory scan'}
                </button>
                <button type="button" className="btn btn-default btn-sm" style={{ marginLeft: 8 }} onClick={() => loadAgent()}>
                  Refresh status
                </button>
              </div>
            </div>

            {!agentStatus?.registered && (
              <div className="callout callout-warning">
                <p className="mb-0">
                  No agent registered for this asset yet. On the device, install and run
                  {' '}<code>ITAgent_2026/windows/Install-ITAgent.ps1</code> (or the Node service loop).
                  After the first register + sync, this button becomes active.
                </p>
              </div>
            )}

            <table className="table table-condensed" style={{ marginBottom: 16 }}>
              <tbody>
                <tr>
                  <th style={{ width: 180 }}>Hostname</th>
                  <td>{String(agentStatus?.agent?.hostname || agentStatus?.agent_hostname || '—')}</td>
                </tr>
                <tr>
                  <th>Serial</th>
                  <td>{String(agentStatus?.agent?.serial_number || a.serial || '—')}</td>
                </tr>
                <tr>
                  <th>Platform / version</th>
                  <td>
                    {String(agentStatus?.agent?.platform || '—')}
                    {agentStatus?.agent?.agent_version ? ` · v${agentStatus.agent.agent_version}` : ''}
                  </td>
                </tr>
                <tr>
                  <th>Last heartbeat</th>
                  <td>{String(agentStatus?.agent?.last_heartbeat_at || '—')}</td>
                </tr>
                <tr>
                  <th>Last inventory</th>
                  <td>{String(agentStatus?.agent?.last_inventory_at || agentStatus?.last_agent_sync_at || a.last_agent_sync_at || '—')}</td>
                </tr>
              </tbody>
            </table>

            <h5 style={{ marginTop: 8 }}>Recent commands</h5>
            <table className="table table-striped table-condensed">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Command</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(agentStatus?.recent_commands || []).length === 0 && (
                  <tr><td colSpan={6} className="text-muted">No remote commands yet</td></tr>
                )}
                {(agentStatus?.recent_commands || []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.command}</td>
                    <td>{c.status}</td>
                    <td>{String(c.created_at || '—')}</td>
                    <td>{String(c.completed_at || '—')}</td>
                    <td>{String(c.error_message || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DetailPanel>
        )}

        {tab === 'attachments' && id && (
          <DetailPanel title="Attachments">
            <AssetAttachments assetId={id} readOnly />
          </DetailPanel>
        )}

        {tab === 'history' && (
          <DetailPanel title="Complete asset history">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Employee / Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={5} className="text-muted">No history yet</td></tr>
                )}
                {history.map((x) => (
                  <tr key={String(x.id)}>
                    <td>{String(x.action_date || '—')}</td>
                    <td>{String(x.admin || '—')}</td>
                    <td>{actionLabel(String(x.action_type || ''))}</td>
                    <td>
                      {x.target_type === 'employee' && x.target_id
                        ? <Link to={`/employees/${x.target_id}`}>{String(x.target_name || x.target_id)}</Link>
                        : String(x.target_name || '—')}
                    </td>
                    <td>{String(x.note || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DetailPanel>
        )}
      </DetailLayout>
    </AppLayout>
  )
}
