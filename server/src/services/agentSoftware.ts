/** Parse Installed_Software / Installed_Software_List from an agent sync payload. */

export type InstalledApp = {
  name: string
  publisher?: string
  version?: string
  install_date?: string
}

function clean(s: unknown) {
  return String(s ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Legacy HSAgent string: `"Name", "Pub", "Ver", "Date", "Name2", ...` */
export function parseLegacySoftwareString(raw: string): InstalledApp[] {
  const text = String(raw || '').trim()
  if (!text) return []
  // Prefer CSV-of-quoted-fields when present
  const quoted = text.match(/"(?:[^"]|"")*"/g)
  if (quoted && quoted.length >= 4) {
    const fields = quoted.map((q) => q.slice(1, -1).replace(/""/g, '"').trim())
    const apps: InstalledApp[] = []
    for (let i = 0; i + 3 < fields.length; i += 4) {
      const name = clean(fields[i])
      if (!name) continue
      apps.push({
        name,
        publisher: clean(fields[i + 1]) || undefined,
        version: clean(fields[i + 2]) || undefined,
        install_date: clean(fields[i + 3]) || undefined,
      })
    }
    return dedupeApps(apps)
  }
  // Fallback: semicolon / newline separated names
  return dedupeApps(
    text
      .split(/[;\n]+/)
      .map((name) => ({ name: clean(name) }))
      .filter((a) => a.name),
  )
}

export function extractInstalledSoftware(payload: unknown): InstalledApp[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>

  const list = p.Installed_Software_List ?? p.installed_software_list ?? p.software_list
  if (Array.isArray(list) && list.length) {
    const apps = list.map((row) => {
      if (!row || typeof row !== 'object') return { name: clean(row) }
      const r = row as Record<string, unknown>
      return {
        name: clean(r.name ?? r.DisplayName ?? r.display_name ?? ''),
        publisher: clean(r.publisher ?? r.Publisher ?? '') || undefined,
        version: clean(r.version ?? r.DisplayVersion ?? r.display_version ?? '') || undefined,
        install_date: clean(r.install_date ?? r.InstallDate ?? r.installDate ?? '') || undefined,
      }
    }).filter((a) => a.name)
    return dedupeApps(apps)
  }

  const raw = p.Installed_Software ?? p.installed_software ?? p.Software ?? ''
  if (typeof raw === 'string' && raw.trim()) return parseLegacySoftwareString(raw)
  return []
}

function dedupeApps(apps: InstalledApp[]) {
  const seen = new Set<string>()
  const out: InstalledApp[] = []
  for (const a of apps) {
    const key = `${a.name.toLowerCase()}|${(a.version || '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

/** Make agent payload safe for MySQL JSON (strip control chars in string fields). */
export function sanitizeAgentPayload(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (typeof v === 'string') {
      out[k] = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => {
        if (item && typeof item === 'object') {
          const row: Record<string, unknown> = {}
          for (const [ik, iv] of Object.entries(item as Record<string, unknown>)) {
            row[ik] = typeof iv === 'string'
              ? iv.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
              : iv
          }
          return row
        }
        return item
      })
    } else {
      out[k] = v
    }
  }
  return out
}
