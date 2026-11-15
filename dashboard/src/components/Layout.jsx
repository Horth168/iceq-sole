import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Boxes, Store, ExternalLink, LayoutDashboard, LogOut, Megaphone, Menu, Package, Settings, ShoppingCart, Star, Tags, Users, Warehouse, X } from 'lucide-react'
import { api, onLogout, STORE_URL, tokens } from '../lib/api'
import { cls, dateTime, intlLocale } from '../lib/format'
import { usePrefs } from '../context/Prefs'
import { LangToggle, Spinner, ThemeToggle } from './ui'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const load = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) { setReady(true); return }
    try {
      const me = await api('/api/account/me')
      if (me.role === 'customer') { tokens.clear(); setUser(null) } else setUser(me)
    } catch { setUser(null) } finally { setReady(true) }
  }, [])
  useEffect(() => { load(); return onLogout(() => setUser(null)) }, [load])
  const login = async (email, password) => {
    const r = await api('/api/auth/admin/login', { method: 'POST', body: { email, password } })
    tokens.set(r)
    setUser(r.user)
    return r.user
  }
  const logout = () => {
    const rt = tokens.refresh
    tokens.clear()
    if (rt) api('/api/auth/logout', { method: 'POST', body: { refresh_token: rt } }).catch(() => {})
  }
  return <AuthCtx.Provider value={{ user, ready, login, logout, isAdmin: user?.role === 'admin' }}>{children}</AuthCtx.Provider>
}

const NAV = [
  { to: '/', label: 'overview', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'pos', icon: Store },
  { to: '/orders', label: 'orders', icon: ShoppingCart },
  { to: '/products', label: 'products', icon: Package },
  { to: '/catalog', label: 'catalog', icon: Tags },
  { to: '/inventory', label: 'inventory', icon: Warehouse },
  { to: '/customers', label: 'customers', icon: Users },
  { to: '/marketing', label: 'marketing', icon: Megaphone },
  { to: '/reviews', label: 'reviews', icon: Star },
  { to: '/settings', label: 'settings', icon: Settings },
]

export default function Layout() {
  const { user, ready, logout } = useAuth()
  const loc = useLocation()
  const { t } = usePrefs()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [loc.pathname])
  if (!ready) return <div className="grid h-dvh place-items-center"><Spinner className="h-6 w-6" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  // cashiers work the shop counter: Point of sale only (the API refuses everything else as well)
  const cashier = user.role === 'cashier'
  if (cashier && !loc.pathname.startsWith('/pos')) return <Navigate to="/pos" replace />

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-6 py-6">
        <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none"><path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><path d="M9.2 20.6h13.6" stroke="#8FD6F5" strokeWidth="3" strokeLinecap="round" /><path d="M20.4 23.4 28.6 30" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
        <span className="leading-none text-snow"><span className="font-wide keep-latin block text-lg font-black">ICEQ</span><span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-snow/50">{t('nav.dashboard')}</span></span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label={t('nav.dashboard')}>
        {NAV.filter((n) => !cashier || n.to === '/pos').map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cls('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-snow text-night' : 'text-snow/70 hover:bg-snow/10 hover:text-snow')}>
            <n.icon size={18} /> {t(`nav.${n.label}`)}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-snow/10 p-3">
        <a href={STORE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-snow/70 hover:bg-snow/10 hover:text-snow"><ExternalLink size={18} /> {t('nav.viewStore')}</a>
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ice-300 text-sm font-bold text-night">{user.full_name?.[0] || 'A'}</span>
          <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold text-snow">{user.full_name}</p><p className="text-xs text-snow/50">{t(`nav.roles.${user.role}`)}</p></div>
          <button onClick={logout} aria-label={t('nav.signOut')} title={t('nav.signOut')} className="grid h-9 w-9 place-items-center rounded-full text-snow/60 hover:bg-snow/10 hover:text-snow"><LogOut size={17} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-night lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-night/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-night">{sidebar}
            <button onClick={() => setOpen(false)} className="absolute right-3 top-6 grid h-9 w-9 place-items-center rounded-full text-snow" aria-label={t('nav.closeMenu')}><X size={20} /></button></aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink/10 bg-bone/85 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => setOpen(true)} className="-ml-1 grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5 lg:hidden" aria-label={t('nav.openMenu')}><Menu size={20} /></button>
        <p className="hidden truncate text-sm text-stone-450 sm:block">{new Intl.DateTimeFormat(intlLocale(), { timeZone: 'Asia/Phnom_Penh', dateStyle: 'full' }).format(new Date())} · {t('nav.phnomPenh')}</p>
        <div className="ml-auto flex items-center gap-1.5"><LangToggle /><ThemeToggle />{!cashier && <Notifications />}</div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8"><Outlet /></main>
    </div>
  )
}

function Notifications() {
  const { t } = usePrefs()
  const [data, setData] = useState({ items: [], unread: 0 })
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const load = () => api('/api/admin/notifications').then(setData).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [])
  const toggle = async () => {
    setOpen(!open)
    if (!open && data.unread) { await api('/api/admin/notifications/read', { method: 'POST' }).catch(() => {}); setData((d) => ({ ...d, unread: 0 })) }
  }
  return (
    <div className="relative">
      <button onClick={toggle} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label={t('nav.notificationsUnread', { n: data.unread })}>
        <Bell size={20} />
        {data.unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[9px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto rounded-2xl bg-white shadow-lift">
            <p className="sticky top-0 border-b border-ink/5 bg-white px-4 py-3 text-sm font-bold">{t('nav.notifications')}</p>
            {data.items.length === 0 ? <p className="p-6 text-center text-sm text-stone-450">{t('nav.caughtUp')}</p> : data.items.map((n) => (
              <button key={n.id} onClick={() => { setOpen(false); n.link && navigate(n.link) }} className="flex w-full gap-3 border-b border-ink/5 px-4 py-3 text-left hover:bg-bone-100">
                <span className={cls('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.type.includes('stock') ? 'bg-amber-500' : n.type.includes('payment') ? 'bg-ice-500' : 'bg-emerald-500')} />
                <span className="min-w-0 text-sm"><span className="block font-semibold">{n.title}</span><span className="block truncate text-stone-450">{n.message}</span><span className="text-xs text-stone-400">{dateTime(n.created_at)}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
