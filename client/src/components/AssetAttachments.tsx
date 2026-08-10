import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { getApiBase } from '../api/baseUrl'
import { Box } from './ui'

export type AttachmentKind = 'invoice' | 'po' | 'other'

export const ATTACHMENT_SLOTS: { kind: AttachmentKind; label: string; hint: string; accept?: string }[] = [
  { kind: 'invoice', label: 'Invoice', hint: 'PDF or image of the invoice', accept: '.pdf,image/*' },
  { kind: 'po', label: 'Purchase Order (PO)', hint: 'PO document (PDF preferred)', accept: '.pdf,image/*' },
  { kind: 'other', label: 'Other documents', hint: 'Warranty, delivery note, etc.', accept: undefined },
]

export type PendingAttachment = { kind: AttachmentKind; file: File; key: string }

type Props = {
  /** When set, uploads go to the server immediately */
  assetId?: string | number | null
  /** Staged files for create flow (before asset exists) */
  pending?: PendingAttachment[]
  onPendingChange?: (files: PendingAttachment[]) => void
  /** Create mode: no asset id yet */
  stagingMode?: boolean
  /** View-only: list/download attachments, no upload or delete */
  readOnly?: boolean
}

function kindLabel(k: string) {
  if (k === 'po') return 'PO'
  if (k === 'invoice') return 'Invoice'
  if (k === 'label') return 'Print Label'
  if (k === 'other') return 'Other'
  return k
}

export async function uploadAssetFile(assetId: string | number, file: File, kind: AttachmentKind) {
  const fd = new FormData()
  fd.append('file', file)
  const t = localStorage.getItem('refex_token')
  const res = await fetch(`${getApiBase()}/hardware/${assetId}/files?kind=${kind}`, {
    method: 'POST',
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: fd,
  })
  const data = await res.json()
  if (!res.ok) throw new Error((data.messages || []).join(', ') || 'Upload failed')
  return data
}

export default function AssetAttachments({
  assetId,
  pending = [],
  onPendingChange,
  stagingMode = false,
  readOnly = false,
}: Props) {
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [uploading, setUploading] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    if (!assetId) {
      setFiles([])
      return
    }
    api<{ rows: Record<string, unknown>[] }>(`/hardware/${assetId}/files`)
      .then((r) => setFiles(r.rows || []))
      .catch((e) => {
        setFiles([])
        setError(e instanceof Error ? e.message : 'Could not load attachments')
      })
  }

  useEffect(() => { load() }, [assetId])

  const filesFor = (kind: string) => files.filter((f) => String(f.kind) === kind)
  const pendingFor = (kind: string) => pending.filter((p) => p.kind === kind)
  const docFiles = files.filter((f) => String(f.kind) !== 'image')

  const uploadNow = async (file: File, kind: AttachmentKind) => {
    if (!assetId) return
    setUploading(kind)
    setMsg('')
    setError('')
    try {
      await uploadAssetFile(assetId, file, kind)
      setMsg(`${kind === 'po' ? 'PO' : kind.charAt(0).toUpperCase() + kind.slice(1)} uploaded`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading('')
    }
  }

  const stageFile = (file: File, kind: AttachmentKind) => {
    onPendingChange?.([
      ...pending,
      { kind, file, key: `${kind}-${file.name}-${Date.now()}` },
    ])
    setMsg(`${file.name} queued — will upload when you create the asset`)
  }

  const removePending = (key: string) => {
    onPendingChange?.(pending.filter((p) => p.key !== key))
  }

  const deleteFile = async (fileId: number) => {
    if (!window.confirm('Delete this attachment?')) return
    try {
      await api(`/files/${fileId}`, { method: 'DELETE' })
      setMsg('Attachment deleted')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const onPick = (file: File | undefined, kind: AttachmentKind, input: HTMLInputElement) => {
    input.value = ''
    if (!file) return
    if (stagingMode || !assetId) stageFile(file, kind)
    else void uploadNow(file, kind)
  }

  return (
    <div className="asset-attachments">
      {msg && <div className="callout callout-info"><p>{msg}</p></div>}
      {error && <div className="callout callout-danger"><p>{error}</p></div>}

      <Box title="Attachments" type="primary">
        <p className="help-block" style={{ marginTop: 0, marginBottom: 14 }}>
          {readOnly
            ? 'Documents attached to this asset. Use Edit to upload or remove files.'
            : stagingMode
              ? 'Select Invoice, PO, or other documents now — they upload after you create the asset.'
              : 'Upload Invoice, PO, or other documents for this asset.'}
        </p>

        <div className="attachment-grid">
          {ATTACHMENT_SLOTS.map((slot) => {
            const rows = filesFor(slot.kind)
            const staged = pendingFor(slot.kind)
            const busy = uploading === slot.kind
            const hasFiles = rows.length > 0 || staged.length > 0

            return (
              <div className="attachment-slot" key={slot.kind}>
                <div>
                  <h4 className="attachment-slot-title">{slot.label}</h4>
                  <p className="attachment-slot-hint">{slot.hint}</p>
                </div>

                {!readOnly ? (
                  <label
                    className={`attachment-dropzone${busy ? ' is-busy' : ''}${uploading && !busy ? ' is-disabled' : ''}`}
                  >
                    <span className="attachment-dropzone-icon" aria-hidden>
                      <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} />
                    </span>
                    <span className="attachment-dropzone-label">
                      {busy ? 'Uploading…' : 'Choose file'}
                    </span>
                    <span className="attachment-dropzone-meta">PDF, PNG, or JPG</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept={slot.accept}
                      disabled={Boolean(uploading)}
                      onChange={(e) => onPick(e.target.files?.[0], slot.kind, e.target)}
                    />
                  </label>
                ) : null}

                {!readOnly && staged.length > 0 && (
                  <ul className="attachment-list">
                    {staged.map((p) => (
                      <li key={p.key}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.file.name}
                        </span>
                        <span className="label label-default">Queued</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => removePending(p.key)}
                          aria-label={`Remove ${p.file.name}`}
                        >
                          <i className="fas fa-times" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!stagingMode && rows.length > 0 && (
                  <ul className="attachment-list">
                    {rows.map((f) => (
                      <li key={String(f.id)}>
                        <a href={`${getApiBase()}/files/${f.id}/download`} target="_blank" rel="noreferrer">
                          {String(f.original_filename || f.filename)}
                        </a>
                        <span className="attachment-size">
                          {f.filesize ? `${Math.round(Number(f.filesize) / 1024)} KB` : ''}
                        </span>
                        {!readOnly ? (
                          <button
                            type="button"
                            className="btn btn-xs btn-danger"
                            onClick={() => { void deleteFile(Number(f.id)) }}
                            aria-label="Delete attachment"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {readOnly && !hasFiles ? (
                  <p className="attachment-empty">No files</p>
                ) : null}
              </div>
            )
          })}
        </div>
      </Box>

      {!stagingMode && (
        <Box title={`All documents (${docFiles.length})`}>
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                {!readOnly ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {docFiles.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 3 : 4} className="text-muted">
                    {readOnly ? 'No attachments' : 'No attachments yet — use Choose file above'}
                  </td>
                </tr>
              )}
              {docFiles.map((f) => (
                <tr key={String(f.id)}>
                  <td>
                    <a href={`${getApiBase()}/files/${f.id}/download`} target="_blank" rel="noreferrer">
                      {String(f.original_filename || f.filename)}
                    </a>
                  </td>
                  <td><span className="label label-default">{kindLabel(String(f.kind))}</span></td>
                  <td>{f.filesize ? `${Math.round(Number(f.filesize) / 1024)} KB` : '—'}</td>
                  {!readOnly ? (
                    <td>
                      <button type="button" className="btn btn-xs btn-danger" onClick={() => { void deleteFile(Number(f.id)) }}>
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </div>
  )
}
