import { createContext, useCallback, useContext, useState } from 'react'
import { Check, Info, X, AlertTriangle } from 'lucide-react'

const ToastCtx = createContext(null)
const ICONS = { success: Check, error: AlertTriangle, info: Info }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((t) => t.id !== id)), [])
  const push = useCallback((type, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    setItems((xs) => [...xs.slice(-2), { id, type, message, ...opts }])
    setTimeout(() => dismiss(id), opts.duration ?? 3800)
  }, [dismiss])
  const api = {
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-auto md:top-24 md:right-6 md:left-auto md:items-end">
        {items.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-2xl bg-ink px-4 py-3.5 text-sm text-white shadow-lift">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${t.type === 'error' ? 'bg-signal' : t.type === 'success' ? 'bg-ice-300 text-ink' : 'bg-white/20'}`}>
                <Icon size={12} strokeWidth={3} />
              </span>
              <div className="flex-1">
                <p className="leading-snug">{t.message}</p>
                {t.action && (
                  <button onClick={() => { t.action.onClick(); dismiss(t.id) }} className="mt-1 font-semibold text-ice-300 underline-offset-2 hover:underline">
                    {t.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-white/50 hover:text-white"><X size={16} /></button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
