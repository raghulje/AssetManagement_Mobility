import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, setToken } from './client'

type User = {
  id: number
  username: string
  first_name: string
  last_name: string
  email?: string
  name?: string
  permissions?: Record<string, unknown>
}

type AuthCtx = {
  user: User | null
  loading: boolean
  permissions: Record<string, unknown>
  can: (permission: string) => boolean
  login: (email: string, password: string) => Promise<void>
  loginWithToken: (token: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

function isTruthy(v: unknown) {
  return v === '1' || v === 1 || v === true || v === 'true'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('refex_token')
    if (!t) {
      setLoading(false)
      return
    }
    authApi.me()
      .then((u) => setUser(u as User))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const permissions = (user?.permissions && typeof user.permissions === 'object')
    ? user.permissions
    : {}

  const can = useCallback((permission: string) => {
    if (isTruthy(permissions.superuser) || isTruthy(permissions.admin)) return true
    return isTruthy(permissions[permission])
  }, [permissions])

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    permissions,
    can,
    async login(email, password) {
      const res = await authApi.login(email, password)
      setToken(res.token)
      setUser(res.user as unknown as User)
    },
    async loginWithToken(token) {
      setToken(token)
      const u = await authApi.me()
      setUser(u as User)
    },
    logout() {
      setToken(null)
      setUser(null)
    },
    async refreshUser() {
      const u = await authApi.me()
      setUser(u as User)
    },
  }), [user, loading, permissions, can])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}

export function useCan(permission: string) {
  return useAuth().can(permission)
}
