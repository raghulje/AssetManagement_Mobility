import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { get } from '../db/index.js'
import { fail } from '../utils/response.js'

export type AuthUser = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string | null
  company_id: number | null
  permissions: Record<string, unknown>
  activated: number
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const secret = () => process.env.JWT_SECRET || 'dev-secret'

export function signToken(user: { id: number; username: string }) {
  return jwt.sign({ sub: user.id, username: user.username }, secret(), { expiresIn: '7d' })
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 'Unauthorized', 401)
  }
  try {
    const decoded = jwt.verify(header.slice(7), secret()) as unknown as { sub: number }
    const row = await get<AuthUser>(`
      SELECT id, username, first_name, last_name, email, company_id, permissions, activated
      FROM users WHERE id = ? AND deleted_at IS NULL
    `, [decoded.sub])

    if (!row || !row.activated) return fail(res, 'Unauthorized', 401)
    row.permissions = typeof row.permissions === 'string'
      ? JSON.parse(row.permissions as unknown as string)
      : (row.permissions || {})
    req.user = row
    next()
  } catch {
    return fail(res, 'Unauthorized', 401)
  }
}

/** Soft permission gate — superuser bypass via permissions.superuser */
export function can(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms = req.user?.permissions || {}
    if (perms.superuser === '1' || perms.superuser === true || perms.superuser === 1) return next()
    if (perms[permission] === '1' || perms[permission] === true || perms[permission] === 1) return next()
    // Demo clone: allow authenticated users for read/write unless explicitly denied
    if (Object.keys(perms).length === 0) return next()
    return fail(res, `Forbidden: missing ${permission}`, 403)
  }
}
