import { get, all } from '../db/index.js'

/** Sanitize segment for tags: letters/digits only, uppercased. */
export function tagSegment(value: unknown, fallback: string, maxLen = 24): string {
  const raw = String(value ?? '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase()
    .slice(0, maxLen)
  return raw || fallback
}

export async function resolveTagCodeParts(opts: {
  companyId?: number | null
  legalEntityId?: number | null
  categoryId?: number | null
}): Promise<{ code: string; type: string; prefix: string }> {
  let code = 'ASSET'
  if (opts.legalEntityId) {
    const le = await get<{ code: string }>(
      `SELECT code FROM legal_entities WHERE id = ? AND deleted_at IS NULL`,
      [opts.legalEntityId],
    )
    if (le?.code) code = tagSegment(le.code, 'ASSET')
  }
  if (code === 'ASSET' && opts.companyId) {
    const co = await get<{ code: string | null; name: string }>(
      `SELECT code, name FROM companies WHERE id = ? AND deleted_at IS NULL`,
      [opts.companyId],
    )
    if (co?.code) code = tagSegment(co.code, 'ASSET')
    else if (co?.name) code = tagSegment(co.name, 'ASSET', 12)
  }

  let type = 'ASSET'
  if (opts.categoryId) {
    const cat = await get<{ name: string }>(
      `SELECT name FROM categories WHERE id = ? AND deleted_at IS NULL`,
      [opts.categoryId],
    )
    if (cat?.name) type = tagSegment(cat.name, 'ASSET', 16)
  }

  return { code, type, prefix: `${code}-${type}` }
}

/**
 * Next tag for prefix CODE-TYPE → CODE-TYPE-0001, CODE-TYPE-0002, …
 * Looks at existing asset_tag values (including soft-deleted) to avoid reuse.
 */
export async function nextAssetTag(opts: {
  companyId?: number | null
  legalEntityId?: number | null
  categoryId?: number | null
}): Promise<{ asset_tag: string; prefix: string; sequence: number }> {
  if (!opts.categoryId) throw new Error('category_id (asset type) is required to generate asset tag')
  if (!opts.companyId && !opts.legalEntityId) {
    throw new Error('company_id or legal_entity_id is required to generate asset tag')
  }

  const { prefix } = await resolveTagCodeParts(opts)
  const like = `${prefix}-%`
  const rows = await all<{ asset_tag: string }>(
    `SELECT asset_tag FROM assets WHERE asset_tag LIKE ?`,
    [like],
  )

  let max = 0
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i')
  for (const r of rows) {
    const m = String(r.asset_tag || '').match(re)
    if (m) max = Math.max(max, Number(m[1]) || 0)
  }
  const sequence = max + 1
  const asset_tag = `${prefix}-${String(sequence).padStart(4, '0')}`
  return { asset_tag, prefix, sequence }
}

/** Allocate a unique tag (retry if race). */
export async function allocateAssetTag(opts: {
  companyId?: number | null
  legalEntityId?: number | null
  categoryId?: number | null
}): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const { asset_tag } = await nextAssetTag(opts)
    const clash = await get<{ id: number }>(
      `SELECT id FROM assets WHERE asset_tag = ? LIMIT 1`,
      [asset_tag],
    )
    if (!clash) return asset_tag
  }
  throw new Error('Could not allocate a unique asset tag — try again')
}
