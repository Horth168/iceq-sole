// Side menu: spring slide-in, blurred backdrop, staggered links, swipe-to-close on touch,
// and an exit animation (the panel stays mounted until it has slid out).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Facebook, Flame, Heart, Info, Instagram, LayoutGrid, LogOut, Music2, Package, Percent, Phone, Send, Sparkles, Tag, User, X } from 'lucide-react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { cls } from '../lib/format'
import Logo from './Logo'
import { useLockBody } from './ui'
import { LangToggle, ThemeToggle } from './Layout'
import { inTelegramApp, TELEGRAM_APP_URL } from '../lib/telegram'

const LINKS = [
  { to: '/shop', key: 'nav.shop', icon: LayoutGrid },
  { to: '/new-arrivals', key: 'nav.newArrivals', icon: Sparkles },
  { to: '/best-sellers', key: 'nav.bestSellers', icon: Flame },
  { to: '/brands', key: 'nav.brands', icon: Tag },
  { to: '/sale', key: 'nav.sale', icon: Percent, accent: true },
]
const EXIT_MS = 320

export default function MobileMenu({ open, onClose, taxonomy }) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(0)
  const start = useRef(null)
  const panel = useRef(null)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); setDrag(0) }
    else if (mounted) {
      setClosing(true)
      const tm = setTimeout(() => { setMounted(false); setClosing(false) }, EXIT_MS)
      return () => clearTimeout(tm)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useLockBody(mounted)
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  if (!mounted) return null

  const onTouchStart = (e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, lock: null } }
  const onTouchMove = (e) => {
    const s = start.current
    if (!s) return
    const dx = e.touches[0].clientX - s.x
    const dy = e.touches[0].clientY - s.y
    if (s.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.lock === 'x') setDrag(Math.min(0, dx))
  }
  const onTouchEnd = () => {
    if (drag < -80) onClose()
    else setDrag(0)
    start.current = null
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Menu">
      <div onClick={onClose} className={cls('absolute inset-0 bg-night/55 backdrop-blur-sm', closing ? 'menu-backdrop-out' : 'menu-backdrop-in')}
        style={drag ? { opacity: Math.max(0.2, 1 + drag / 360) } : undefined} />
      <aside ref={panel} tabIndex={-1} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        className={cls('pt-safe pb-safe absolute inset-y-0 left-0 flex w-[min(90vw,430px)] flex-col overflow-hidden rounded-r-[32px] bg-bone-100 shadow-lift outline-none', closing ? 'menu-panel-out' : 'menu-panel-in')}
        style={drag ? { transform: `translate3d(${drag}px,0,0)`, transition: 'none' } : undefined}>
        <MenuBody onClose={onClose} taxonomy={taxonomy} />
      </aside>
    </div>,
    document.body,
  )
}

function MenuBody({ onClose, taxonomy }) {
  const { user, settings, logout, wishIds } = useStore()
  const { t, pick } = usePrefs()
  const { pathname } = useLocation()
  const social = settings?.store?.social || {}
  const socials = [['facebook', Facebook], ['instagram', Instagram], ['tiktok', Music2], ['telegram', Send]].filter(([k]) => social[k])
  const phone = settings?.store?.phone
  const d = (i) => ({ animationDelay: `${90 + i * 45}ms` })
  let n = 0

  return (
    <>
      {/* soft glow behind the header */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-ice-300/25 blur-3xl" />
      <div className="relative flex items-center justify-between px-5 py-4">
        <Logo />
        <button onClick={onClose} aria-label={t('nav.closeMenu')} className="group grid h-11 w-11 place-items-center rounded-full bg-ink/5 transition hover:bg-ink hover:text-white">
          <X size={20} className="transition-transform duration-300 group-hover:rotate-90" />
        </button>
      </div>

      <div className="no-scrollbar relative flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {/* profile card */}
        <Link to={user ? '/account' : '/login'} className="menu-item group relative mt-1 flex items-center gap-4 overflow-hidden rounded-3xl bg-night p-4 text-snow" style={d(n++)}>
          <span aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-ice-400/30 blur-2xl transition-transform duration-700 group-hover:scale-150" />
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ice-300 font-display text-lg font-black text-night">
            {user ? (user.full_name?.[0] || 'U').toUpperCase() : <User size={20} />}
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block truncate font-semibold">{user ? t('nav.hi', { name: user.full_name?.split(' ')[0] || '' }) : t('nav.menuWelcome')}</span>
            <span className="block truncate text-xs text-snow/60">{user ? t('nav.menuSignedIn', { email: user.email }) : t('nav.menuGuest')}</span>
          </span>
          <ArrowUpRight size={18} className="relative shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>

        {/* main links */}
        <p className="eyebrow menu-item mb-1 mt-7" style={d(n++)}>{t('nav.menuExplore')}</p>
        <nav aria-label={t('nav.main')}>
          {LINKS.map((l, i) => {
            const active = pathname === l.to || pathname.startsWith(`${l.to}/`)
            return (
              <Link key={l.to} to={l.to} style={d(n++)}
                className={cls('menu-item group relative flex items-center gap-4 border-b border-ink/10 py-3.5', l.accent && 'text-signal')}>
                <span className={cls('w-6 font-mono text-[11px] tabular-nums transition-colors', active ? 'text-ice-600' : 'text-stone-450')}>{String(i + 1).padStart(2, '0')}</span>
                <span className="font-display text-[28px] font-extrabold uppercase leading-none tracking-tight transition-transform duration-300 group-hover:translate-x-1.5 sm:text-3xl">{t(l.key)}</span>
                {active && <span className="h-2 w-2 rounded-full bg-ice-500 shadow-[0_0_0_4px] shadow-ice-300/30" />}
                <l.icon size={20} className="ml-auto opacity-40 transition duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:opacity-100" />
              </Link>
            )
          })}
        </nav>

        {/* categories */}
        {taxonomy.categories.length > 0 && <>
          <p className="eyebrow menu-item mb-3 mt-7" style={d(n++)}>{t('nav.categories')}</p>
          <div className="flex flex-wrap gap-2">
            {taxonomy.categories.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} style={d(n++)} className="menu-item chip transition hover:-translate-y-0.5 hover:border-ink">{pick(c, 'name')}</Link>
            ))}
          </div>
        </>}

        {/* quick tiles */}
        <p className="eyebrow menu-item mb-3 mt-7" style={d(n++)}>{t('nav.menuQuick')}</p>
        {!inTelegramApp() && (
          <a href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer" style={{ ...d(n++), background: '#2AABEE' }}
            className="menu-item mb-2.5 flex items-center gap-3.5 rounded-2xl p-4 text-white transition duration-300 hover:-translate-y-0.5 active:scale-[.98]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20"><Send size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('tg.menuTitle')}</span><span className="block truncate text-xs text-white/80">{t('tg.menuText')}</span></span>
            <ArrowUpRight size={18} className="shrink-0 opacity-80" />
          </a>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['/track', Package, t('nav.trackOrder')],
            ['/wishlist', Heart, `${t('nav.wishlist')}${wishIds.length ? ` · ${wishIds.length}` : ''}`],
            [user ? '/account/orders' : '/login', User, user ? t('nav.myOrders') : t('nav.signInRegister')],
            ['/about', Info, t('nav.about')],
          ].map(([to, Icon, label]) => (
            <Link key={to + label} to={to} style={d(n++)} className="menu-item card flex flex-col gap-3 p-4 text-sm font-semibold transition duration-300 hover:-translate-y-0.5 hover:shadow-lift active:scale-[.97]">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ice-50 text-ice-600"><Icon size={17} /></span>
              <span className="leading-snug">{label}</span>
            </Link>
          ))}
        </div>

        {/* preferences */}
        <p className="eyebrow menu-item mb-3 mt-7" style={d(n++)}>{t('nav.menuPrefs')}</p>
        <div className="menu-item flex items-center justify-between rounded-2xl border border-ink/10 p-2 pl-3" style={d(n++)}>
          <LangToggle />
          <ThemeToggle className="border border-ink/10" />
        </div>

        <div className="menu-item mt-6 space-y-3 text-[15px]" style={d(n++)}>
          {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5"><Phone size={16} className="text-stone-450" />{t('nav.call', { phone })}</a>}
          {user && <button onClick={() => { onClose(); logout() }} className="flex items-center gap-2.5 text-signal"><LogOut size={16} />{t('nav.signOut')}</button>}
        </div>

        {socials.length > 0 && (
          <div className="menu-item mt-6 flex gap-2" style={d(n++)}>
            {socials.map(([k, Icon]) => (
              <a key={k} href={social[k]} target="_blank" rel="noreferrer" aria-label={k} className="grid h-10 w-10 place-items-center rounded-full bg-ink/5 transition hover:-translate-y-0.5 hover:bg-ink hover:text-white"><Icon size={17} /></a>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
