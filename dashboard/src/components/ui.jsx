import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Moon, Sun, X } from 'lucide-react'
import { usePrefs } from '../context/Prefs'
import { assetUrl } from '../lib/api'
import { cls } from '../lib/format'

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2)
    setItems((x) => [...x.slice(-3), { id, type, message }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000)
  }, [])
  const api = { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 md:items-end md:pr-6">
        {items.map((t) => {
          const Icon = t.type === 'error' ? AlertTriangle : t.type === 'success' ? Check : Info
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-center gap-3 rounded-2xl bg-night px-4 py-3 text-sm text-snow shadow-lift ring-1 ring-white/10">
              <span className={cls('grid h-6 w-6 place-items-center rounded-full', t.type === 'error' ? 'bg-signal' : t.type === 'success' ? 'bg-ice-300 text-night' : 'bg-snow/20')}><Icon size={13} strokeWidth={3} /></span>
              <p className="flex-1">{t.message}</p>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------- primitives
export function Spinner({ className = 'h-4 w-4' }) {
  return <span className={cls('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function Pill({ children, tone = 'bg-bone-200 text-ink' }) {
  return <span className={cls('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>{children}</span>
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-signal">{error}</span> : hint ? <span className="mt-1 block text-xs text-stone-450">{hint}</span> : null}
    </label>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cls('flex cursor-pointer select-none items-center gap-3 text-sm', disabled && 'opacity-50')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cls('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-ink' : 'bg-bone-400')}>
        <span className={cls('absolute top-0.5 h-5 w-5 rounded-full bg-snow shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  )
}

export function Thumb({ src, className = 'h-12 w-12' }) {
  // logos (SVG) are shown whole on a white chip so black marks stay visible in dark mode
  if (src && /\.svg(\?|$)/i.test(src)) return <img src={assetUrl(src)} alt="" loading="lazy" className={cls('shrink-0 rounded-xl bg-snow object-contain p-2 ring-1 ring-ink/10', className)} />
  return src ? <img src={assetUrl(src)} alt="" loading="lazy" className={cls('shrink-0 rounded-xl bg-bone-200 object-cover', className)} />
    : <div className={cls('shrink-0 rounded-xl bg-bone-200', className)} />
}

export function Card({ title, action, children, className = '', pad = true }) {
  return (
    <section className={cls('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-ink/5 px-5 py-4">
          {title && <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="h-display text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-450">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && <span className="grid h-14 w-14 place-items-center rounded-full bg-bone-200"><Icon size={24} /></span>}
      <p className="mt-4 font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-450">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Pagination({ page, pages, onChange }) {
  const { t } = usePrefs()
  if (!pages || pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-4 text-sm">
      <span className="text-stone-450">{t('common.page', { page, pages })}</span>
      <button className="btn-outline !min-h-[36px] !px-3" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.prev')}><ChevronLeft size={16} /></button>
      <button className="btn-outline !min-h-[36px] !px-3" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.next')}><ChevronRight size={16} /></button>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  const { t } = usePrefs()
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-night/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cls('relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-3xl bg-bone-100 shadow-lift sm:animate-fade-up sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink/10 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Stat({ label, value, sub, icon: Icon, tone = 'bg-ice-50 text-ice-600' }) {
  return (
    <div className="card flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-450">{label}</p>
        <p className="mt-2 truncate font-wide text-2xl font-black tabular-nums sm:text-3xl">{value}</p>
        {sub && <p className="mt-1 text-xs text-stone-450">{sub}</p>}
      </div>
      {Icon && <span className={cls('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tone)}><Icon size={19} /></span>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  const { t } = usePrefs()
  placeholder ||= t('common.search')
  const [v, setV] = useState(value || '')
  useEffect(() => setV(value || ''), [value])
  useEffect(() => { const t = setTimeout(() => v !== (value || '') && onChange(v), 300); return () => clearTimeout(t) }, [v]) // eslint-disable-line
  return <input type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="field !min-h-[42px] max-w-xs" aria-label={placeholder} />
}

export const errMap = (e) => (e?.data?.errors ? Object.fromEntries(e.data.errors.map((x) => [x.field.split('.').pop(), x.message])) : {})

// ---------------------------------------------------------------- theme + language switches
export function ThemeToggle({ className = '' }) {
  const { theme, setTheme, t } = usePrefs()
  const dark = theme === 'dark'
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? t('common.light') : t('common.dark')} title={dark ? t('common.light') : t('common.dark')}
      className={cls('grid h-10 w-10 place-items-center rounded-full transition hover:bg-ink/5', className)}>
      <span key={theme} className="animate-fade-in">{dark ? <Sun size={19} /> : <Moon size={19} />}</span>
    </button>
  )
}

export function LangToggle({ className = '' }) {
  const { lang, setLang, t } = usePrefs()
  return (
    <div role="group" aria-label={t('common.language')} className={cls('flex rounded-full border border-ink/10 p-0.5 text-xs font-semibold', className)}>
      {[['en', 'EN'], ['km', 'ខ្មែរ']].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setLang(k)} aria-pressed={lang === k} lang={k}
          className={cls('rounded-full px-2.5 py-1 transition', lang === k ? 'bg-ink text-white' : 'text-stone-450 hover:text-ink')}>{l}</button>
      ))}
    </div>
  )
}
