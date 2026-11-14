import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, ChevronLeft, Facebook, Heart, Home, Instagram, LayoutGrid, Lock, LogOut, Menu, Moon, Music2, Package, Search, Send, ShoppingBag, Sun, Tag, User, X } from 'lucide-react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { api } from '../lib/api'
import { peek, remember } from '../lib/cache'
import { applyIfSafe } from '../lib/updates'
import { cls, usd } from '../lib/format'
import Logo from './Logo'
import MobileMenu from './MobileMenu'
import ErrorBoundary from './ErrorBoundary'
import HumanCheck, { useHuman } from './HumanCheck'
import { Drawer, Img, Price, QtyStepper, Spinner } from './ui'

const NAV = [
  { to: '/shop', key: 'nav.shop', mega: true },
  { to: '/brands', key: 'nav.brands' },
  { to: '/new-arrivals', key: 'nav.newArrivals' },
  { to: '/best-sellers', key: 'nav.bestSellers' },
  { to: '/sale', key: 'nav.sale', accent: true },
]

function useTaxonomy() {
  const [data, setData] = useState(() => peek('taxonomy') || { brands: [], categories: [] })
  useEffect(() => {
    Promise.all([api('/api/brands'), api('/api/categories')])
      .then(([brands, categories]) => { const v = { brands: brands.filter((b) => b.product_count > 0), categories }; setData(v); remember('taxonomy', v) }).catch(() => {})
  }, [])
  return data
}

export default function Layout() {
  const { pathname, hash } = useLocation()
  const [search, setSearch] = useState(false)
  const [menu, setMenu] = useState(false)
  const taxonomy = useTaxonomy()
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); setSearch(false); applyIfSafe(pathname) }, [pathname])
  // links like /about#authenticity: the page loads lazily, so wait for the section to exist, then scroll to it
  useEffect(() => {
    if (!hash) return
    let tries = 0
    const id = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); clearInterval(id) } else if (++tries > 40) clearInterval(id)
    }, 75)
    return () => clearInterval(id)
  }, [pathname, hash])
  const minimal = pathname.startsWith('/checkout')
  const { t } = usePrefs()
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">{t('common.skip')}</a>
      {/* iPhone home-screen app: keeps the clock / Dynamic Island area solid, content scrolls under it */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] bg-night" style={{ height: 'env(safe-area-inset-top)' }} />
      {/* the announcement bar normally reserves the iPhone status-bar space; checkout hides it,
          so reserve that space here or the sticky header slides over the top of the page */}
      {!minimal ? <Announcement /> : <div aria-hidden style={{ height: 'env(safe-area-inset-top)' }} />}
      <Header onSearch={() => setSearch(true)} onMenu={() => setMenu(true)} minimal={minimal} taxonomy={taxonomy} />
      <main id="main" key={pathname} className={cls('flex-1 animate-page-in', !minimal && 'pb-[calc(68px+env(safe-area-inset-bottom))] md:pb-0')}>
        {/* main is keyed by pathname, so leaving a broken page resets the boundary */}
        <ErrorBoundary><Outlet /></ErrorBoundary>
      </main>
      {!minimal && <Footer />}
      {!minimal && <MobileTabBar onSearch={() => setSearch(true)} />}
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
      <MobileMenu open={menu} onClose={() => setMenu(false)} taxonomy={taxonomy} />
      <CartDrawer />
    </div>
  )
}

function Announcement() {
  const { settings } = useStore()
  const { t } = usePrefs()
  const free = settings?.delivery?.free_shipping_threshold
  const msgs = [free ? t('announce.freeOver', { amount: usd(free) }) : t('announce.fast'), t('announce.pay'), t('announce.pp')]
  return (
    <div className="overflow-hidden bg-night pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-snow/85" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap">
        {[...msgs, ...msgs, ...msgs, ...msgs].map((m, i) => (
          <span key={i} className="flex items-center gap-16">{m}<span className="text-ice-300">◆</span></span>
        ))}
      </div>
    </div>
  )
}

export function ThemeToggle({ className = '' }) {
  const { theme, setTheme, t } = usePrefs()
  const dark = theme === 'dark'
  return (
    <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTheme(dark ? 'light' : 'dark', { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }} aria-label={t('common.theme.toggle')} title={dark ? t('common.theme.light') : t('common.theme.dark')}
      className={cls('relative grid h-11 w-11 place-items-center overflow-hidden rounded-full transition hover:bg-ink/5', className)}>
      <Sun size={20} className={cls('absolute transition-all duration-500', dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
      <Moon size={19} className={cls('absolute transition-all duration-500', dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')} />
    </button>
  )
}

export function LangToggle({ className = '' }) {
  const { lang, setLang, t } = usePrefs()
  return (
    <div className={cls('flex h-9 items-center rounded-full border border-ink/10 bg-white/60 p-0.5 text-xs font-bold', className)} role="group" aria-label={t('common.language')}>
      {[['en', 'EN'], ['km', 'ខ្មែរ']].map(([k, l]) => (
        <button key={k} onClick={() => setLang(k)} aria-pressed={lang === k}
          className={cls('h-8 rounded-full px-2.5 transition', lang === k ? 'bg-ink text-white' : 'text-stone-450 hover:text-ink', k === 'km' && 'font-khmer')}>{l}</button>
      ))}
    </div>
  )
}

function Header({ onSearch, onMenu, minimal, taxonomy }) {
  const { cart, setCartOpen, user, wishIds } = useStore()
  const { t } = usePrefs()
  const [scrolled, setScrolled] = useState(false)
  const [mega, setMega] = useState(false)
  const count = cart?.count || 0
  const [bump, setBump] = useState(false)
  const prev = useRef(count)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  useEffect(() => { if (count > prev.current) { setBump(true); setTimeout(() => setBump(false), 500) } prev.current = count }, [count])
  const { pathname } = useLocation()
  useEffect(() => setMega(false), [pathname])

  return (
    <header style={{ top: 'env(safe-area-inset-top)' }} className={cls('sticky z-50 border-b transition-colors duration-300', scrolled || mega ? 'border-ink/10 bg-bone/85 backdrop-blur-xl' : 'border-transparent bg-bone')}
      onMouseLeave={() => setMega(false)}>
      {minimal ? (
        // checkout: always-visible way back to the bag, logo centred, reassurance on the right
        <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-[72px]">
          <Link to="/cart" className="group -ml-1 inline-flex h-11 items-center gap-1.5 justify-self-start rounded-full pl-1.5 pr-4 text-sm font-semibold transition hover:bg-ink/5 active:scale-95">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition group-hover:-translate-x-0.5"><ChevronLeft size={18} /></span>
            {t('nav.bag')}{count > 0 && <span className="text-stone-450">({count})</span>}
          </Link>
          <Link to="/" aria-label="IceQ Sole"><Logo /></Link>
          <span className="inline-flex items-center gap-1.5 justify-self-end rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Lock size={13} /><span className="hidden sm:inline">{t('checkout.secureShort')}</span></span>
        </div>
      ) : (
      <div className="container-x flex h-16 items-center gap-2 md:h-[72px]">
        {!minimal && <button onClick={onMenu} aria-label={t('nav.openMenu')} className="-ml-2 grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5 lg:hidden"><Menu size={22} /></button>}
        <Link to="/" className="group shrink-0" aria-label="IceQ Sole"><Logo /></Link>
        {!minimal && (
          <nav className="ml-8 hidden items-center gap-6 lg:flex xl:ml-10 xl:gap-7" aria-label={t('nav.main')}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} onMouseEnter={() => setMega(!!n.mega)} onFocus={() => setMega(!!n.mega)}
                className={({ isActive }) => cls('link-underline flex items-center gap-1 text-[14px] font-semibold', n.accent && 'text-signal', isActive && 'after:scale-x-100')}>
                {t(n.key)}{n.mega && <ChevronDown size={14} className={cls('transition', mega && 'rotate-180')} />}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {!minimal && (
            <>
              <button onClick={onSearch} className="hidden h-11 items-center gap-2 rounded-full border border-ink/10 bg-white/70 pl-4 pr-5 text-sm text-stone-450 transition hover:border-ink/30 xl:flex">
                <Search size={17} /> {t('nav.searchPlaceholder')}
              </button>
              <button onClick={onSearch} aria-label={t('nav.search')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5 xl:hidden"><Search size={21} /></button>
              <LangToggle className="hidden md:flex" />
              <ThemeToggle className="hidden md:grid" />
              <AccountMenu user={user} />
              <Link to="/wishlist" aria-label={t('nav.wishlist')} className="relative hidden h-11 w-11 place-items-center rounded-full hover:bg-ink/5 md:grid">
                <Heart size={21} />
                {wishIds.length > 0 && <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 animate-fade-in place-items-center rounded-full bg-signal px-1 text-[10px] font-bold text-snow">{wishIds.length}</span>}
              </Link>
            </>
          )}
          <button onClick={() => setCartOpen(true)} aria-label={t('nav.bagCount', { n: count })} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5">
            <ShoppingBag size={21} className={cls(bump && 'animate-pop')} />
            {count > 0 && <span key={count} className="absolute right-0.5 top-0.5 grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{count}</span>}
          </button>
        </div>
      </div>
      )}
      {mega && !minimal && <MegaMenu taxonomy={taxonomy} onClose={() => setMega(false)} />}
    </header>
  )
}

function MegaMenu({ taxonomy, onClose }) {
  const { t, pick } = usePrefs()
  return (
    <div className="absolute inset-x-0 top-full hidden animate-fade-in border-b border-ink/10 bg-bone/95 shadow-lift backdrop-blur-xl lg:block" onMouseLeave={onClose}>
      <div className="container-x grid grid-cols-[1fr_1fr_1.2fr] gap-10 py-8">
        <div>
          <p className="eyebrow mb-4">{t('nav.shopByCategory')}</p>
          <ul className="space-y-2.5">
            <li><Link to="/shop" className="font-semibold hover:underline">{t('nav.allSneakers')}</Link></li>
            {taxonomy.categories.map((c) => <li key={c.id}><Link to={`/category/${c.slug}`} className="text-ink-700 transition hover:pl-1 hover:text-ink">{pick(c, 'name')}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">{t('nav.shopByBrand')}</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {taxonomy.brands.map((b) => <li key={b.id}><Link to={`/brands/${b.slug}`} className="keep-latin text-ink-700 transition hover:pl-1 hover:text-ink">{b.name}</Link></li>)}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {taxonomy.categories.slice(0, 2).map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="group relative overflow-hidden rounded-2xl bg-night">
              <Img src={c.image_url} alt={pick(c, 'name')} className="aspect-[4/5]" imgClass="object-cover transition duration-700 group-hover:scale-105" sizes="240px" />
              <div className="absolute inset-0 bg-gradient-to-t from-night/80 to-transparent" />
              <span className="absolute bottom-3 left-3 font-display text-lg font-bold text-snow">{pick(c, 'name')}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function AccountMenu({ user }) {
  const { logout } = useStore()
  const { t } = usePrefs()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', f)
    return () => document.removeEventListener('pointerdown', f)
  }, [open])
  if (!user) return <Link to="/login" aria-label={t('nav.signIn')} className="hidden h-11 w-11 place-items-center rounded-full hover:bg-ink/5 md:grid"><User size={21} /></Link>
  return (
    <div ref={ref} className="relative hidden md:block">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('nav.account')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-bold text-white">{user.full_name?.[0]?.toUpperCase() || 'U'}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 origin-top-right animate-fade-up overflow-hidden rounded-2xl bg-white p-2 shadow-lift ring-1 ring-ink/5">
          <p className="truncate px-3 py-2 text-sm font-semibold">{t('nav.hi', { name: user.full_name.split(' ')[0] })}</p>
          {[['/account', User, 'nav.myAccount'], ['/account/orders', Package, 'nav.myOrders'], ['/wishlist', Heart, 'nav.wishlist']].map(([to, Icon, k]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-bone"><Icon size={16} />{t(k)}</Link>
          ))}
          <button onClick={() => { setOpen(false); logout() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-signal hover:bg-bone"><LogOut size={16} />{t('nav.signOut')}</button>
        </div>
      )}
    </div>
  )
}

function MobileTabBar({ onSearch }) {
  const { user, wishIds } = useStore()
  const { t } = usePrefs()
  const tabs = [
    { to: '/', label: t('tabs.home'), icon: Home, end: true },
    { to: '/shop', label: t('tabs.shop'), icon: LayoutGrid },
    { action: onSearch, label: t('tabs.search'), icon: Search },
    { to: '/wishlist', label: t('tabs.wishlist'), icon: Heart, badge: wishIds.length },
    { to: user ? '/account' : '/login', label: user ? t('tabs.account') : t('tabs.signIn'), icon: User },
  ]
  return (
    <nav aria-label="Mobile" className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-bone/90 backdrop-blur-xl md:hidden">
      <div className="grid h-[68px] grid-cols-5">
        {tabs.map((tb) => {
          const inner = (active) => (
            <span className={cls('flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition', active ? 'text-ink' : 'text-stone-450')}>
              <span className={cls('relative grid h-8 w-12 place-items-center rounded-full transition-all duration-300', active && 'bg-ink text-white')}>
                <tb.icon size={19} strokeWidth={active ? 2.4 : 2} />
                {tb.badge > 0 && <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[9px] font-bold text-snow">{tb.badge}</span>}
              </span>
              <span className="max-w-full truncate px-1">{tb.label}</span>
            </span>
          )
          return tb.action
            ? <button key={tb.label} onClick={tb.action} aria-label={tb.label}>{inner(false)}</button>
            : <NavLink key={tb.label} to={tb.to} end={tb.end}>{({ isActive }) => inner(isActive)}</NavLink>
        })}
      </div>
    </nav>
  )
}

function SearchOverlay({ open, onClose }) {
  const { t, pick } = usePrefs()
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const input = useRef(null)
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); else { setQ(''); setRes(null) } }, [open])
  useEffect(() => {
    if (!q.trim()) { setRes(null); return }
    const ctl = new AbortController()
    setLoading(true)
    const tm = setTimeout(() => {
      api('/api/search/suggest', { query: { q }, signal: ctl.signal }).then(setRes).catch(() => {}).finally(() => setLoading(false))
    }, 220)
    return () => { clearTimeout(tm); ctl.abort() }
  }, [q])
  if (!open) return null
  const submit = (e) => { e.preventDefault(); if (q.trim()) { navigate(`/shop?q=${encodeURIComponent(q.trim())}`); onClose() } }
  const popular = ['Air Force 1', 'Samba', 'Jordan', 'New Balance', 'Gazelle', 'Running']
  return (
    <Drawer open onClose={onClose} side="bottom" className="md:inset-x-auto md:left-1/2 md:top-6 md:bottom-auto md:w-[720px] md:-translate-x-1/2 md:rounded-3xl">
      <form onSubmit={submit} className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
        <Search size={20} className="text-stone-450" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.label')}
          className="h-11 flex-1 bg-transparent text-lg outline-none placeholder:text-stone-400" enterKeyHint="search" />
        {loading ? <Spinner className="h-4 w-4 text-stone-450" /> : null}
        <button type="button" onClick={onClose} className="text-sm font-semibold">{t('common.close')}</button>
      </form>
      <div className="max-h-[70dvh] overflow-y-auto p-5">
        {!res && (
          <>
            <p className="eyebrow mb-3">{t('search.popular')}</p>
            <div className="flex flex-wrap gap-2">{popular.map((s) => <button key={s} onClick={() => setQ(s)} className="chip keep-latin">{s}</button>)}</div>
          </>
        )}
        {res && (
          <>
            {res.brands.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {res.brands.map((b) => <Link key={b.id} to={`/brands/${b.slug}`} onClick={onClose} className="chip"><Tag size={14} /> {b.name}</Link>)}
              </div>
            )}
            {res.products.length === 0 ? <p className="py-8 text-center text-stone-450">{t('search.none', { q })}</p> : (
              <ul className="divide-y divide-ink/5">
                {res.products.map((p) => (
                  <li key={p.id}>
                    <Link to={`/product/${p.slug}`} onClick={onClose} className="flex items-center gap-4 py-3 transition hover:translate-x-1">
                      <Img image={p.image} className="h-16 w-16 shrink-0 rounded-xl" sizes="64px" />
                      <div className="min-w-0 flex-1"><p className="eyebrow !text-[10px]">{p.brand.name}</p><p className="truncate font-semibold">{pick(p, 'name')}</p></div>
                      <Price price={p.price} sale={p.sale_price} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={submit} className="btn-outline mt-4 w-full">{t('search.seeAll')} <ArrowRight size={16} /></button>
          </>
        )}
      </div>
    </Drawer>
  )
}

function CartDrawer() {
  const { cart, cartOpen, setCartOpen, updateQty, removeItem } = useStore()
  const { t, pick } = usePrefs()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const close = () => setCartOpen(false)
  const run = async (id, fn) => { setBusy(id); try { await fn() } finally { setBusy(null) } }
  const items = cart?.items || []
  return (
    <Drawer open={cartOpen} onClose={close} title={t('bag.title', { n: cart?.count || 0 })}>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <ShoppingBag size={40} strokeWidth={1.4} />
          <p className="mt-4 font-display text-xl font-bold">{t('bag.empty')}</p>
          <p className="mt-1 text-sm text-stone-450">{t('bag.emptyText')}</p>
          <button onClick={() => { close(); navigate('/shop') }} className="btn-primary mt-6">{t('bag.startShopping')}</button>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-ink/10 overflow-y-auto px-5">
            {items.map((it, i) => (
              <li key={it.id} className={cls('flex animate-fade-up gap-4 py-4 transition', busy === it.id && 'opacity-50')} style={{ animationDelay: `${i * 50}ms` }}>
                <Link to={`/product/${it.product.slug}`} onClick={close}><Img image={it.image} className="h-24 w-24 rounded-xl" sizes="96px" /></Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="eyebrow !text-[10px]">{it.product.brand}</p>
                  <p className="truncate font-semibold">{pick(it.product, 'name')}</p>
                  <p className="text-xs text-stone-450">{it.color} · EU {it.size}</p>
                  {it.available < it.quantity && <p className="text-xs font-semibold text-signal">{t('bag.onlyAvailable', { n: it.available })}</p>}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <QtyStepper compact value={it.quantity} max={Math.min(10, it.available)} min={1} onChange={(q) => run(it.id, () => updateQty(it.id, q))} />
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{usd(it.line_total)}</p>
                      <button onClick={() => run(it.id, () => removeItem(it.id))} className="text-xs text-stone-450 underline">{t('common.remove')}</button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="pb-safe border-t border-ink/10 bg-white px-5 pt-4">
            <div className="flex justify-between text-sm"><span>{t('common.subtotal')}</span><span className="font-semibold tabular-nums">{usd(cart.subtotal)}</span></div>
            {cart.discount_amount > 0 && <div className="mt-1 flex justify-between text-sm text-emerald-700"><span>{t('common.discount')} ({cart.discount_code})</span><span>−{usd(cart.discount_amount)}</span></div>}
            <p className="mt-1 text-xs text-stone-450">{t('bag.deliveryAtCheckout')}</p>
            <div className="mb-4 mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => { close(); navigate('/cart') }} className="btn-outline">{t('bag.viewBag')}</button>
              <button onClick={() => { close(); navigate('/checkout') }} className="btn-primary">{t('bag.checkout')}</button>
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}

function Footer() {
  const { settings } = useStore()
  const { t } = usePrefs()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const human = useHuman()
  const s = settings?.store || {}
  const social = s.social || {}
  const subscribe = async (e) => {
    e.preventDefault()
    try { await api('/api/newsletter', { method: 'POST', body: { email }, human: await human.token() }) } catch { /* ignore */ }
    setDone(true)
  }
  const socials = [['facebook', Facebook], ['instagram', Instagram], ['tiktok', Music2], ['telegram', Send]].filter(([k]) => social[k])
  return (
    <footer className="mt-20 bg-night text-snow">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo light />
          <p className="mt-5 max-w-sm text-snow/60">{t('footer.tagline')}</p>
          <form onSubmit={subscribe} className="mt-7 max-w-md">
            <p className="mb-3 text-sm font-semibold">{t('footer.dropAlerts')}</p>
            {done ? <p className="rounded-full bg-snow/10 px-5 py-3.5 text-sm">{t('footer.onList')}</p> : (
              <div className="flex rounded-full bg-snow/10 p-1.5 focus-within:ring-2 focus-within:ring-ice-300">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('footer.emailPlaceholder')} aria-label={t('footer.emailPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent px-4 text-snow outline-none placeholder:text-snow/40" />
                <button className="btn-ice !min-h-[42px] !px-5 text-sm">{t('footer.join')}</button>
              </div>
            )}
          {email && <HumanCheck human={human} className="mt-3" />}
          </form>
        </div>
        <FooterCol title={t('footer.shop')} links={[['/shop', t('nav.allSneakers')], ['/new-arrivals', t('nav.newArrivals')], ['/best-sellers', t('nav.bestSellers')], ['/sale', t('nav.sale')], ['/brands', t('nav.brands')]]} />
        <FooterCol title={t('footer.help')} links={[['/track', t('nav.trackOrder')], ['/account/orders', t('nav.myOrders')], ['/about#delivery', t('footer.deliveryReturns')], ['/about#authenticity', t('footer.authenticity')], ['/terms', t('footer.terms')]]} />
        <div className="md:col-span-3">
          <p className="eyebrow !text-snow/50">{t('footer.contact')}</p>
          <address className="mt-4 space-y-1.5 text-sm not-italic text-snow/75">
            {s.address && <p>{s.address}</p>}
            {s.phone && <p><a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a></p>}
            {s.email && <p><a href={`mailto:${s.email}`}>{s.email}</a></p>}
            {s.opening_hours && <p>{s.opening_hours}</p>}
          </address>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map(([k, Icon]) => (
                <a key={k} href={social[k]} target="_blank" rel="noreferrer" aria-label={k} className="grid h-10 w-10 place-items-center rounded-full bg-snow/10 transition hover:-translate-y-0.5 hover:bg-snow/20"><Icon size={17} /></a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-snow/10">
        <div className="container-x flex flex-col gap-3 py-6 text-xs text-snow/45 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footer.rights', { year: new Date().getFullYear(), name: s.name || 'IceQ Sole' })}</p>
          <div className="flex items-center gap-2">{['KHQR', 'ABA', 'COD'].map((x) => <span key={x} className="rounded bg-snow/10 px-2 py-1 font-semibold text-snow/70">{x}</span>)}</div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div className="md:col-span-2">
      <p className="eyebrow !text-snow/50">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-snow/75">
        {links.map(([to, l]) => <li key={to + l}><Link to={to} className="transition hover:text-snow">{l}</Link></li>)}
      </ul>
    </div>
  )
}
