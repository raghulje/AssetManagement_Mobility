import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../layout/AppLayout'
import { Box } from '../../components/ui'
import { groupsApi, usersApi } from '../../api/client'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../api/AuthContext'

type Role = {
  id: number
  name: string
  permissions: Record<string, unknown>
  users_count?: number
}

const MODULE_LABELS: Record<string, string> = {
  assets: 'Assets',
  licenses: 'Licenses',
  accessories: 'Accessories',
  consumables: 'Consumables',
  components: 'Components',
  people: 'People',
  reports: 'Reports',
  settings: 'Settings',
  maintenance: 'Maintenance',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  checkout: 'Assign / Unassign',
}

const BUILTIN = new Set(['Superusers', 'Admin', 'IT Asset Manager', 'Viewer'])

export default function RolesPermissions() {
  const toast = useToast()
  const { can, refreshUser } = useAuth()
  const canEdit = can('settings.edit')

  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [moduleActions, setModuleActions] = useState<Record<string, string[]>>({})
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Array<{ id: number; email: string | null; first_name: string; last_name: string; username: string }>>([])
  const [allUsers, setAllUsers] = useState<Array<{ id: number; label: string }>>([])
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newRoleName, setNewRoleName] = useState('')

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) || null, [roles, selectedId])

  const loadRoles = async () => {
    const [catalog, list] = await Promise.all([
      groupsApi.catalog(),
      groupsApi.list(),
    ])
    setModuleActions(catalog.module_actions || {})
    const rows = (list.rows || []) as Role[]
    setRoles(rows.map((r) => ({
      ...r,
      id: Number(r.id),
      permissions: (r.permissions && typeof r.permissions === 'object')
        ? r.permissions as Record<string, unknown>
        : {},
    })))
    if (!selectedId && rows.length) setSelectedId(Number(rows[0].id))
  }

  useEffect(() => {
    loadRoles().catch((e: Error) => setError(e.message))
    usersApi.list({ limit: 500 }).then((r) => {
      setAllUsers((r.rows || []).map((u) => ({
        id: Number(u.id),
        label: `${String(u.first_name || '')} ${String(u.last_name || '')}`.trim() || String(u.username || u.email || u.id),
      })))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    groupsApi.get(selectedId)
      .then((role) => {
        setName(String(role.name || ''))
        const p = (role.permissions && typeof role.permissions === 'object')
          ? role.permissions as Record<string, unknown>
          : {}
        const map: Record<string, boolean> = {}
        for (const [k, v] of Object.entries(p)) {
          map[k] = v === '1' || v === 1 || v === true
        }
        setPerms(map)
        const mem = (role.members as typeof members) || []
        setMembers(mem)
        setMemberIds(mem.map((m) => Number(m.id)))
      })
      .catch((e: Error) => setError(e.message))
  }, [selectedId])

  const toggle = (key: string) => {
    if (!canEdit) return
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const saveRole = async () => {
    if (!selectedId || !canEdit) return
    setBusy(true)
    setError('')
    try {
      const permissions: Record<string, string> = {}
      for (const [k, v] of Object.entries(perms)) {
        if (v) permissions[k] = '1'
      }
      await groupsApi.update(selectedId, { name: name.trim(), permissions })
      await groupsApi.setMembers(selectedId, memberIds)
      toast.success('Role saved')
      await loadRoles()
      await refreshUser()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const createRole = async () => {
    if (!canEdit || !newRoleName.trim()) return
    setBusy(true)
    try {
      const res = await groupsApi.create({ name: newRoleName.trim(), permissions: { 'assets.view': '1' } })
      const id = Number(res.payload?.id)
      setNewRoleName('')
      await loadRoles()
      if (id) setSelectedId(id)
      toast.success('Role created')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteRole = async () => {
    if (!selectedId || !selected || BUILTIN.has(selected.name) || !canEdit) return
    if (!window.confirm(`Delete role “${selected.name}”?`)) return
    setBusy(true)
    try {
      await groupsApi.remove(selectedId)
      setSelectedId(null)
      await loadRoles()
      toast.success('Role deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const modules = Object.keys(moduleActions)

  return (
    <AppLayout title="Roles & permissions" subtitle="Control module access and ops email recipients">
      {error ? <div className="callout callout-danger"><p>{error}</p></div> : null}
      <div className="row">
        <div className="col-md-3">
          <Box title="Roles" type="primary"
            tools={canEdit ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="form-control input-sm"
                  style={{ width: 120 }}
                  placeholder="New role"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
                <button type="button" className="btn btn-xs btn-theme" disabled={busy} onClick={() => { void createRole() }}>
                  Add
                </button>
              </div>
            ) : undefined}
          >
            <ul className="nav nav-pills nav-stacked">
              {roles.map((r) => (
                <li key={r.id} className={selectedId === r.id ? 'active' : ''}>
                  <a
                    href={`#role-${r.id}`}
                    onClick={(e) => { e.preventDefault(); setSelectedId(r.id) }}
                  >
                    {r.name}
                    <span className="badge pull-right">{r.users_count ?? 0}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Box>
        </div>
        <div className="col-md-9">
          {selected ? (
            <Box
              title={`Edit: ${selected.name}`}
              type="default"
              tools={(
                <>
                  {canEdit && !BUILTIN.has(selected.name) ? (
                    <button type="button" className="btn btn-xs btn-danger" disabled={busy} onClick={() => { void deleteRole() }}>
                      Delete
                    </button>
                  ) : null}
                  {' '}
                  {canEdit ? (
                    <button type="button" className="btn btn-xs btn-theme" disabled={busy} onClick={() => { void saveRole() }}>
                      {busy ? 'Saving…' : 'Save role'}
                    </button>
                  ) : (
                    <span className="text-muted">View only</span>
                  )}
                </>
              )}
            >
              <div className="form-group">
                <label>Role name</label>
                <input
                  className="form-control"
                  value={name}
                  disabled={!canEdit || BUILTIN.has(selected.name)}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <label className="checkbox-inline" style={{ marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={Boolean(perms['notify.ops'])}
                  disabled={!canEdit}
                  onChange={() => toggle('notify.ops')}
                />
                {' '}Receive ops workflow emails (assign, maintenance, inventory alerts)
              </label>

              <div className="table-responsive">
                <table className="table table-bordered table-condensed">
                  <thead>
                    <tr>
                      <th>Module</th>
                      {['view', 'create', 'edit', 'delete', 'checkout'].map((a) => (
                        <th key={a} style={{ textAlign: 'center' }}>{ACTION_LABELS[a] || a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => {
                      const actions = moduleActions[mod] || []
                      return (
                        <tr key={mod}>
                          <td><strong>{MODULE_LABELS[mod] || mod}</strong></td>
                          {['view', 'create', 'edit', 'delete', 'checkout'].map((act) => {
                            const key = `${mod}.${act}`
                            const allowed = actions.includes(act)
                            return (
                              <td key={act} style={{ textAlign: 'center' }}>
                                {allowed ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(perms[key])}
                                    disabled={!canEdit}
                                    onChange={() => toggle(key)}
                                  />
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h4 style={{ marginTop: 20 }}>Members</h4>
              <p className="text-muted">Users in this role inherit the permissions above.</p>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e5e7eb', padding: 10, borderRadius: 6 }}>
                {allUsers.map((u) => (
                  <label key={u.id} className="checkbox-inline" style={{ display: 'block', margin: '4px 0' }}>
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.id)}
                      disabled={!canEdit}
                      onChange={(e) => {
                        setMemberIds((prev) => e.target.checked
                          ? [...prev, u.id]
                          : prev.filter((x) => x !== u.id))
                      }}
                    />
                    {' '}{u.label}
                  </label>
                ))}
              </div>
              {members.length === 0 ? <p className="help-block">No members yet.</p> : null}
              <p style={{ marginTop: 12 }}>
                <Link to="/users">Manage app users</Link>
              </p>
            </Box>
          ) : (
            <p className="text-muted">Select a role</p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
