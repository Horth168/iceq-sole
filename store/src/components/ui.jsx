import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Minus, Plus, Star, X } from 'lucide-react'
import { assetUrl } from '../lib/api'
import { cls, khr, usd } from '../lib/format'
import { useT } from '../context/Prefs'
import { LogoMark } from './Logo'

// Clean tile shown when a product has no genuine photo yet (never a fake shoe)
export function PhotoPlaceholder({ className = '', compact }) {
  const t = useT()
  return (
    <div className={cls('flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-bone-200 to-bone-300 text-stone-450', className)}>
      <LogoMark className={compact ? 'h-6 w-6 opacity-40' : 'h-10 w-10 opacity-30'} color="currentColor" accent="currentColor" />
      {!compact && <span className="px-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em]">{t('common.photoComingSoon')}</span>}
    </div>
  )
}

// Responsive image with srcset + fade-in, never stretched
export function Img({ image, src, alt = '', sizes = '(min-width:1024px) 25vw, 50vw', className = '', imgClass = 'object-cover', priority, placeholder = true }) {
  const [loaded, setLoaded] = useState(false)
  const url = assetUrl(image?.url || src)
  const srcSet = image?.srcset ? image.srcset.split(', ').map((s) => { const [u, w] = s.split(' '); return `${assetUrl(u)} ${w}` }).join(', ') : undefined
  const pos = /\b(absolute|fixed)\b/.test(className) ? '' : 'relative'
  if (!url) return placeholder ? <PhotoPlaceholder className={cls(pos, className)} compact={/h-1[0-9]|h-2[0-4]|w-1[0-9]/.test(className)} /> : <div className={cls('bg-bone-200', className)} />
  return (
    <div className={cls(pos, 'overflow-hidden bg-bone-200', className)}>
      <img
        src={url}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt || image?.alt || ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchpriority={priority ? 'high' : undefined}
        onLoad={() => setLoaded(true)}
        className={cls('h-full w-full transition duration-700', imgClass, loaded ? 'scale-100 opacity-100 blur-0' : 'scale-[1.02] opacity-0 blur-sm')}
      />
    </div>
  )
}

export function Price({ price, sale, className = '', size = 'md', showKhr = false, rate = 4100 }) {
  const big = size === 'lg'
  const current = sale ?? price
  return (
    <div className={cls('flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cls('font-semibold tabular-nums', big ? 'text-2xl' : 'text-[15px]', sale ? 'text-signal' : 'text-ink')}>{usd(current)}</span>
      {sale != null && <span className={cls('tabular-nums text-stone-450 line-through', big ? 'text-base' : 'text-sm')}>{usd(price)}</span>}
      {showKhr && <span className="w-full text-xs tabular-nums text-stone-450">≈ {khr(current * rate)}</span>}
    </div>
  )
}

export function Stars({ value = 0, size = 14, className = '' }) {
  return (
    <span className={cls('inline-flex items-center gap-0.5', className)} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-ink text-ink' : 'fill-bone-300 text-bone-300'} />
      ))}
    </span>
  )
}

export function Badge({ children, tone = 'bg-white text-ink', className = '' }) {
  return <span className={cls('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]', tone, className)}>{children}</span>
}

export function QtyStepper({ value, onChange, max = 10, min = 1, disabled, compact }) {
  const sz = compact ? 'h-9 w-9' : 'h-12 w-12'
  return (
    <div className={cls('inline-flex items-center rounded-full border border-ink/15 bg-white', compact ? 'h-9' : 'h-12')}>
      <button type="button" aria-label="−" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}
        className={cls('grid place-items-center rounded-full text-ink transition hover:bg-bone active:scale-90 disabled:opacity-30', sz)}><Minus size={16} /></button>
      <span key={value} className="w-7 animate-fade-in text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="+" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}
        className={cls('grid place-items-center rounded-full text-ink transition hover:bg-bone active:scale-90 disabled:opacity-30', sz)}><Plus size={16} /></button>
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <span className={cls('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="mx-auto flex max-w-md animate-fade-up flex-col items-center px-6 py-16 text-center">
      <div className="relative mb-6 grid h-24 w-24 place-items-center rounded-full bg-white shadow-soft">
        <div className="absolute inset-2 rounded-full border border-dashed border-ice-300" />
        {Icon && <Icon size={34} strokeWidth={1.5} className="text-ink" />}
      </div>
      <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
      {text && <p className="mt-2 text-stone-450">{text}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  )
}

export function useLockBody(lock) {
  useEffect(() => {
    if (!lock) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [lock])
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

export function Drawer({ open, onClose, children, side = 'right', title, className = '' }) {
  const t = useT()
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null
  const pos = side === 'right' ? 'right-0 top-0 h-full w-full max-w-md animate-slide-in'
    : side === 'left' ? 'left-0 top-0 h-full w-[88%] max-w-sm animate-fade-in'
      : 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl animate-slide-up'
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-night/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cls('pt-safe absolute flex flex-col bg-bone-100 shadow-lift', pos, className)}>
        {title && (
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
            <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
            <button onClick={onClose} aria-label={t('common.close')} className="grid h-10 w-10 place-items-center rounded-full transition hover:rotate-90 hover:bg-ink/5"><X size={20} /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Modal({ open, onClose, children, className = '', label }) {
  const t = useT()
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 animate-fade-in bg-night/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cls('relative max-h-[94dvh] w-full animate-slide-up overflow-y-auto rounded-t-3xl bg-bone-100 shadow-lift sm:max-w-4xl sm:animate-fade-up sm:rounded-3xl', className)}>
        <button onClick={onClose} aria-label={t('common.close')} className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-soft transition hover:rotate-90 hover:bg-white"><X size={18} /></button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function SectionHeader({ eyebrow, title, link, linkLabel, className = '' }) {
  const t = useT()
  return (
    <Reveal className={cls('mb-6 flex items-end justify-between gap-4 md:mb-8', className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="h-display text-[34px] sm:text-5xl lg:text-6xl">{title}</h2>
      </div>
      {link && <Link to={link} className="link-underline shrink-0 pb-1 text-sm font-semibold">{linkLabel || t('common.viewAll')}</Link>}
    </Reveal>
  )
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 block animate-fade-in text-xs font-medium text-signal" role="alert">{error}</span>
        : hint ? <span className="mt-1.5 block text-xs text-stone-450">{hint}</span> : null}
    </label>
  )
}

export function StatusPill({ map, value, label }) {
  const s = map[value] || { tone: 'bg-bone-200 text-ink' }
  return <span className={cls('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', s.tone)}>{label || value}</span>
}

// Fade/slide elements in as they scroll into view (IntersectionObserver; respects reduced motion via CSS)
export function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={cls('reveal', shown && 'is-visible', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>{children}</Tag>
}

// Subtle 3D tilt that follows the pointer (mouse/pen only; touch devices keep a flat card)
export function useTilt(max = 7) {
  const ref = useRef(null)
  const onMove = useCallback((e) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.classList.add('is-tilting')
    el.style.setProperty('--ry', `${(x - 0.5) * max * 2}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * max * 2}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
  }, [max])
  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove('is-tilting')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }, [])
  return { ref, onPointerMove: onMove, onPointerLeave: onLeave }
}

// Brand logo as a one-colour mark that follows the text colour (light/dark safe).
// Bundled marks live in /public/brands; anything else falls back to the uploaded logo image.
const BRAND_MARKS = new Set(['nike', 'air-jordan', 'adidas', 'new-balance', 'puma', 'converse', 'vans', 'asics'])
export function BrandMark({ brand, className = '' }) {
  if (!brand) return null
  if (BRAND_MARKS.has(brand.slug)) {
    const url = `url(/brands/${brand.slug}.svg)`
    return <span aria-hidden className={cls('block bg-current', className)}
      style={{ WebkitMask: `${url} center / contain no-repeat`, mask: `${url} center / contain no-repeat` }} />
  }
  return brand.logo_url ? <Img src={brand.logo_url} alt="" className={cls('bg-transparent', className)} imgClass="object-contain" placeholder={false} /> : null
}
