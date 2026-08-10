import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ToastKind = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
}

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++
    setItems((prev) => [...prev.slice(-4), { id, kind, message }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push])

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.kind}`} role="status">
            <span className="toast-msg">{t.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
