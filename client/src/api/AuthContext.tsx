import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, setToken } from '../api/client'

type User = {
  id: number
  username: string
  first_name: string
  last_name: string
  email?: string
  name?: string
}

type AuthCtx = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

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

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    async login(email, password) {
      const res = await authApi.login(email, password)
      setToken(res.token)
      setUser(res.user as unknown as User)
    },
    logout() {
      setToken(null)
      setUser(null)
    },
    async refreshUser() {
      const u = await authApi.me()
      setUser(u as User)
    },
  }), [user, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
