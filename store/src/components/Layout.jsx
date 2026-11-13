import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Heart, Home, LayoutGrid, Menu, Search, ShoppingBag, Tag, User, X, Facebook, Instagram, Send, Music2 } from 'lucide-react'
import { useStore } from '../context/Store'
import { api } from '../lib/api'
import { cls, usd } from '../lib/format'
import Logo from './Logo'
import { Drawer, Img, Price, QtyStepper, Spinner } from './ui'

const NAV = [
  { to: '/shop', label: 'Shop' },
  { to: '/brands', label: 'Brands' },
  { to: '/new-arrivals', label: 'New Arrivals' },
  { to: '/best-sellers', label: 'Best Sellers' },
  { to: '/sale', label: 'Sale', accent: true },
]

export default function Layout() {
  const { pathname } = useLocation()
  const [search, setSearch] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); setSearch(false) }, [pathname])
  const minimal = pathname.startsWith('/checkout')
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      {!minimal && <Announcement />}
      <Header onSearch={() => setSearch(true)} onMenu={() => setMenu(true)} minimal={minimal} />
      <main id="main" className={cls('flex-1', !minimal && 'pb-[calc(68px+env(safe-area-inset-bottom))] md:pb-0')}>
        <Outlet />
      </main>
      {!minimal && <Footer />}
      {!minimal && <MobileTabBar onSearch={() => setSearch(true)} />}
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
      <CartDrawer />
    </div>
  )
}

function Announcement() {
  const { settings } = useStore()
  const free = settings?.delivery?.free_shipping_threshold
  const msgs = [
    free ? `Free delivery on orders over ${usd(free)}` : 'Fast delivery across Cambodia',
    'Pay with ABA KHQR · Bank transfer · Cash on delivery',
    'Phnom Penh same / next-day delivery',
  ]
  return (
    <div className="overflow-hidden bg-ink py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/85">
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap">
        {[...msgs, ...msgs, ...msgs, ...msgs].map((m, i) => (
          <span key={i} className="flex items-center gap-16">{m}<span className="text-ice-300">◆</span></span>
        ))}
      </div>
    </div>
  )
}

function Header({ onSearch, onMenu, minimal }) {
  const { cart, setCartOpen, user, wishIds } = useStore()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  const count = cart?.count || 0
  return (
    <header className={cls('pt-safe sticky top-0 z-50 border-b transition-colors duration-300',
      scrolled ? 'border-ink/10 bg-bone/85 backdrop-blur-xl' : 'border-transparent bg-bone')}>
      <div className="container-x flex h-16 items-center gap-2 md:h-[72px]">
        {!minimal && (
          <button onClick={onMenu} aria-label="Open menu" className="-ml-2 grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5 lg:hidden"><Menu size={22} /></button>
        )}
        <Link to="/" className="shrink-0" aria-label="IceQ Sole home"><Logo /></Link>
        {!minimal && (
          <nav className="ml-10 hidden items-center gap-7 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cls('link-underline text-[14px] font-semibold',
                n.accent && 'text-signal', isActive && 'after:scale-x-100')}>{n.label}</NavLink>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {!minimal && (
            <>
              <button onClick={onSearch} className="hidden h-11 items-center gap-2 rounded-full border border-ink/10 bg-white/70 pl-4 pr-5 text-sm text-stone-450 transition hover:border-ink/30 md:flex">
                <Search size={17} /> Search sneakers
              </button>
              <button onClick={onSearch} aria-label="Search" className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5 md:hidden"><Search size={21} /></button>
              <Link to={user ? '/account' : '/login'} aria-label="Account" className="hidden h-11 w-11 place-items-center rounded-full hover:bg-ink/5 md:grid"><User size={21} /></Link>
              <Link to="/wishlist" aria-label="Wishlist" className="relative hidden h-11 w-11 place-items-center rounded-full hover:bg-ink/5 md:grid">
                <Heart size={21} />
                {wishIds.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-signal" />}
              </Link>
            </>
          )}
          <button onClick={() => setCartOpen(true)} aria-label={`Bag, ${count} items`} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5">
            <ShoppingBag size={21} />
            {count > 0 && <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{count}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}

function MobileTabBar({ onSearch }) {
  const { user, wishIds } = useStore()
  const tabs = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/shop', label: 'Shop', icon: LayoutGrid },
    { action: onSearch, label: 'Search', icon: Search },
    { to: '/wishlist', label: 'Wishlist', icon: Heart, dot: wishIds.length > 0 },
    { to: user ? '/account' : '/login', label: user ? 'Account' : 'Sign in', icon: User },
  ]
  return (
    <nav aria-label="Mobile" className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-bone/90 backdrop-blur-xl md:hidden">
      <div className="grid h-[68px] grid-cols-5">
        {tabs.map((t) => {
          const inner = (active) => (
            <span className={cls('flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition', active ? 'text-ink' : 'text-stone-450')}>
              <span className={cls('relative grid h-8 w-12 place-items-center rounded-full transition', active && 'bg-ink text-white')}>
                <t.icon size={19} strokeWidth={active ? 2.4 : 2} />
                {t.dot && <span className="absolute right-2.5 top-1 h-1.5 w-1.5 rounded-full bg-signal" />}
              </span>
              {t.label}
            </span>
          )
          return t.action
            ? <button key={t.label} onClick={t.action} aria-label={t.label}>{inner(false)}</button>
            : <NavLink key={t.label} to={t.to} end={t.end}>{({ isActive }) => inner(isActive)}</NavLink>
        })}
      </div>
    </nav>
  )
}

function MobileMenu({ open, onClose }) {
  const { user, settings } = useStore()
  const [cats, setCats] = useState([])
  useEffect(() => { if (open && !cats.length) api('/api/categories').then(setCats).catch(() => {}) }, [open]) // eslint-disable-line
  return (
    <Drawer open={open} onClose={onClose} side="left">
      <div className="flex items-center justify-between px-5 py-4"><Logo /><button onClick={onClose} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5"><X size={20} /></button></div>
      <nav className="flex-1 overflow-y-auto px-5 pb-6">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cls('flex items-center justify-between border-b border-ink/10 py-4 font-display text-2xl font-extrabold uppercase tracking-tight', n.accent && 'text-signal')}>
            {n.label}<ArrowRight size={18} />
          </Link>
        ))}
        <p className="eyebrow mb-3 mt-8">Categories</p>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => <Link key={c.id} to={`/category/${c.slug}`} className="chip">{c.name}</Link>)}
        </div>
        <p className="eyebrow mb-3 mt-8">Help</p>
        <div className="space-y-3 text-[15px]">
          <Link to="/track" className="block">Track an order</Link>
          <Link to={user ? '/account' : '/login'} className="block">{user ? 'My account' : 'Sign in / Register'}</Link>
          <Link to="/about" className="block">About IceQ Sole</Link>
          {settings?.store?.phone && <a href={`tel:${settings.store.phone.replace(/\s/g, '')}`} className="block">Call {settings.store.phone}</a>}
        </div>
      </nav>
    </Drawer>
  )
}

function SearchOverlay({ open, onClose }) {
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
    const t = setTimeout(() => {
      api('/api/search/suggest', { query: { q }, signal: ctl.signal }).then(setRes).catch(() => {}).finally(() => setLoading(false))
    }, 220)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])
  if (!open) return null
  const submit = (e) => { e.preventDefault(); if (q.trim()) { navigate(`/shop?q=${encodeURIComponent(q.trim())}`); onClose() } }
  const popular = ['Air Force 1', 'Samba', 'Jordan', 'New Balance 550', 'Running', 'Sale']
  return (
    <Drawer open onClose={onClose} side="bottom" className="md:inset-x-auto md:left-1/2 md:top-6 md:bottom-auto md:w-[720px] md:-translate-x-1/2 md:rounded-3xl">
      <form onSubmit={submit} className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
        <Search size={20} className="text-stone-450" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by model, brand or style" aria-label="Search"
          className="h-11 flex-1 bg-transparent text-lg outline-none placeholder:text-stone-400" enterKeyHint="search" />
        {loading ? <Spinner className="h-4 w-4 text-stone-450" /> : null}
        <button type="button" onClick={onClose} className="text-sm font-semibold">Close</button>
      </form>
      <div className="max-h-[70dvh] overflow-y-auto p-5">
        {!res && (
          <>
            <p className="eyebrow mb-3">Popular searches</p>
            <div className="flex flex-wrap gap-2">
              {popular.map((s) => <button key={s} onClick={() => setQ(s)} className="chip">{s}</button>)}
            </div>
          </>
        )}
        {res && (
          <>
            {res.brands.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {res.brands.map((b) => <Link key={b.id} to={`/brands/${b.slug}`} onClick={onClose} className="chip"><Tag size={14} /> {b.name}</Link>)}
              </div>
            )}
            {res.products.length === 0 ? <p className="py-8 text-center text-stone-450">No sneakers match “{q}”. Try another model or brand.</p> : (
              <ul className="divide-y divide-ink/5">
                {res.products.map((p) => (
                  <li key={p.id}>
                    <Link to={`/product/${p.slug}`} onClick={onClose} className="flex items-center gap-4 py-3">
                      <Img image={p.image} className="h-16 w-16 shrink-0 rounded-xl" sizes="64px" />
                      <div className="min-w-0 flex-1"><p className="eyebrow !text-[10px]">{p.brand.name}</p><p className="truncate font-semibold">{p.name}</p></div>
                      <Price price={p.price} sale={p.sale_price} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={submit} className="btn-outline mt-4 w-full">See all results <ArrowRight size={16} /></button>
          </>
        )}
      </div>
    </Drawer>
  )
}

function CartDrawer() {
  const { cart, cartOpen, setCartOpen, updateQty, removeItem } = useStore()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const close = () => setCartOpen(false)
  const run = async (id, fn) => { setBusy(id); try { await fn() } finally { setBusy(null) } }
  const items = cart?.items || []
  return (
    <Drawer open={cartOpen} onClose={close} title={`Your bag (${cart?.count || 0})`}>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <ShoppingBag size={40} strokeWidth={1.4} />
          <p className="mt-4 font-display text-xl font-bold">Your bag is empty</p>
          <p className="mt-1 text-sm text-stone-450">Fresh pairs are waiting for you.</p>
          <button onClick={() => { close(); navigate('/shop') }} className="btn-primary mt-6">Start shopping</button>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-ink/10 overflow-y-auto px-5">
            {items.map((it) => (
              <li key={it.id} className={cls('flex gap-4 py-4 transition', busy === it.id && 'opacity-50')}>
                <Link to={`/product/${it.product.slug}`} onClick={close}><Img image={it.image} className="h-24 w-24 rounded-xl" sizes="96px" /></Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="eyebrow !text-[10px]">{it.product.brand}</p>
                  <p className="truncate font-semibold">{it.product.name}</p>
                  <p className="text-xs text-stone-450">{it.color} · EU {it.size}</p>
                  {it.available < it.quantity && <p className="text-xs font-semibold text-signal">Only {it.available} available</p>}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <QtyStepper compact value={it.quantity} max={Math.min(10, it.available)} min={1} onChange={(q) => run(it.id, () => updateQty(it.id, q))} />
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{usd(it.line_total)}</p>
                      <button onClick={() => run(it.id, () => removeItem(it.id))} className="text-xs text-stone-450 underline">Remove</button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="pb-safe border-t border-ink/10 bg-white px-5 pt-4">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold tabular-nums">{usd(cart.subtotal)}</span></div>
            {cart.discount_amount > 0 && <div className="mt-1 flex justify-between text-sm text-emerald-700"><span>Discount ({cart.discount_code})</span><span>−{usd(cart.discount_amount)}</span></div>}
            <p className="mt-1 text-xs text-stone-450">Delivery calculated at checkout.</p>
            <div className="mb-4 mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => { close(); navigate('/cart') }} className="btn-outline">View bag</button>
              <button onClick={() => { close(); navigate('/checkout') }} className="btn-primary">Checkout</button>
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}

function Footer() {
  const { settings } = useStore()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const s = settings?.store || {}
  const social = s.social || {}
  const subscribe = async (e) => {
    e.preventDefault()
    try { await api('/api/newsletter', { method: 'POST', body: { email } }); setDone(true) } catch { setDone(true) }
  }
  const socials = [['facebook', Facebook], ['instagram', Instagram], ['tiktok', Music2], ['telegram', Send]].filter(([k]) => social[k])
  return (
    <footer className="mt-20 bg-ink text-white">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo light />
          <p className="mt-5 max-w-sm text-white/60">{s.tagline || 'Premium sneakers, delivered across Cambodia.'}</p>
          <form onSubmit={subscribe} className="mt-7 max-w-md">
            <p className="mb-3 text-sm font-semibold">Get drop alerts & members-only codes</p>
            {done ? <p className="rounded-full bg-white/10 px-5 py-3.5 text-sm">You're on the list. ❄</p> : (
              <div className="flex rounded-full bg-white/10 p-1.5 focus-within:ring-2 focus-within:ring-ice-300">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address"
                  className="min-w-0 flex-1 bg-transparent px-4 text-white outline-none placeholder:text-white/40" />
                <button className="btn-ice !min-h-[42px] !px-5 text-sm">Join</button>
              </div>
            )}
          </form>
        </div>
        <FooterCol title="Shop" links={[['/shop', 'All sneakers'], ['/new-arrivals', 'New arrivals'], ['/best-sellers', 'Best sellers'], ['/sale', 'Sale'], ['/brands', 'Brands']]} />
        <FooterCol title="Help" links={[['/track', 'Track order'], ['/account/orders', 'My orders'], ['/about', 'Delivery & returns'], ['/about#authenticity', 'Authenticity']]} />
        <div className="md:col-span-3">
          <p className="eyebrow !text-white/50">Visit / contact</p>
          <address className="mt-4 space-y-1.5 text-sm not-italic text-white/75">
            {s.address && <p>{s.address}</p>}
            {s.phone && <p><a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a></p>}
            {s.email && <p><a href={`mailto:${s.email}`}>{s.email}</a></p>}
            {s.opening_hours && <p>{s.opening_hours}</p>}
          </address>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map(([k, Icon]) => (
                <a key={k} href={social[k]} target="_blank" rel="noreferrer" aria-label={k} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Icon size={17} /></a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-3 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {s.name || 'IceQ Sole'}. All rights reserved. Brand names belong to their respective owners.</p>
          <div className="flex items-center gap-2"><span className="rounded bg-white/10 px-2 py-1 font-semibold text-white/70">KHQR</span><span className="rounded bg-white/10 px-2 py-1 font-semibold text-white/70">ABA</span><span className="rounded bg-white/10 px-2 py-1 font-semibold text-white/70">COD</span></div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div className="md:col-span-2">
      <p className="eyebrow !text-white/50">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-white/75">
        {links.map(([to, l]) => <li key={to + l}><Link to={to} className="hover:text-white">{l}</Link></li>)}
      </ul>
    </div>
  )
}
