import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BadgeCheck, Compass, Heart, RefreshCcw, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../context/Store'
import { ProductGrid } from '../components/ProductCard'
import { EmptyState, Img } from '../components/ui'

export function Wishlist() {
  const { wishIds, user } = useStore()
  const [items, setItems] = useState(null)
  useEffect(() => {
    if (!wishIds.length) { setItems([]); return }
    api('/api/products', { query: { ids: wishIds.join(','), page_size: 60 } })
      .then((r) => setItems(wishIds.map((id) => r.items.find((p) => p.id === id)).filter(Boolean))).catch(() => setItems([]))
  }, [wishIds])
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">Saved for later</p>
      <h1 className="h-display mt-2 text-5xl sm:text-6xl">Wishlist</h1>
      {!user && wishIds.length > 0 && <p className="mt-3 text-sm text-stone-450"><Link to="/login?next=/wishlist" className="font-semibold text-ink underline">Sign in</Link> to keep your wishlist on every device.</p>}
      <div className="mt-8">
        {items && items.length === 0 ? (
          <EmptyState icon={Heart} title="Nothing saved yet" text="Tap the heart on any sneaker to save it here." action={<Link to="/shop" className="btn-primary">Explore sneakers</Link>} />
        ) : <ProductGrid products={items || []} loading={!items} count={4} />}
      </div>
    </div>
  )
}

export function Brands() {
  const [brands, setBrands] = useState(null)
  useEffect(() => { api('/api/brands').then(setBrands).catch(() => setBrands([])) }, [])
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">The line-up</p>
      <h1 className="h-display mt-2 text-5xl sm:text-7xl">Brands</h1>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {(brands || Array.from({ length: 8 })).map((b, i) => b ? (
          <Link key={b.id} to={`/brands/${b.slug}`} className="group card flex min-h-[180px] flex-col justify-between p-5 transition hover:-translate-y-1 hover:shadow-lift sm:min-h-[220px] sm:p-6">
            <div className="flex items-center justify-between">
              {b.logo_url ? <Img src={b.logo_url} className="h-10 w-20 bg-transparent" imgClass="object-contain" /> : <span className="text-xs text-stone-450">{b.product_count} styles</span>}
              <ArrowUpRight size={18} className="transition group-hover:rotate-45" />
            </div>
            <div><p className="font-wide text-xl font-black uppercase leading-none sm:text-2xl">{b.name}</p><p className="mt-2 line-clamp-2 text-sm text-stone-450">{b.description}</p></div>
          </Link>
        ) : <div key={i} className="skeleton min-h-[180px] sm:min-h-[220px]" />)}
      </div>
    </div>
  )
}

export function About() {
  const { settings } = useStore()
  const d = settings?.delivery
  return (
    <div>
      <section className="container-x pt-6 md:pt-10">
        <p className="eyebrow">About</p>
        <h1 className="h-display mt-2 max-w-4xl text-5xl sm:text-7xl">Sneakers, served ice cold.</h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-700">IceQ Sole started with a simple idea: buying premium sneakers in Cambodia should feel as good as wearing them. We curate the icons and the new drops, inspect every pair, and deliver to every province.</p>
      </section>
      <section className="container-x mt-14 grid gap-4 md:grid-cols-3">
        {[
          [Truck, 'Delivery', `Phnom Penh: ${d?.estimated_days_phnom_penh || 'same / next day'}${d ? ` · $${d.phnom_penh_fee}` : ''}. Provinces: ${d?.estimated_days_province || '1–3 days'}${d ? ` · $${d.province_fee}` : ''}.${d?.free_shipping_threshold ? ` Free over $${d.free_shipping_threshold}.` : ''}`],
          [RefreshCcw, 'Exchanges', 'Unworn pairs in original packaging can be exchanged for another size or style within 7 days of delivery. Contact us with your order number.'],
          [BadgeCheck, 'Authenticity', 'We source through trusted channels and inspect every pair before it ships. If anything looks wrong on arrival, contact us within 48 hours and we will make it right.'],
        ].map(([Icon, t, s]) => (
          <div key={t} id={t === 'Authenticity' ? 'authenticity' : undefined} className="card scroll-mt-28 p-6">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ice-50 text-ice-600"><Icon size={22} /></span>
            <h2 className="mt-5 font-display text-2xl font-bold">{t}</h2>
            <p className="mt-2 text-ink-700">{s}</p>
          </div>
        ))}
      </section>
      <section className="container-x mt-14">
        <Img src="/images/story-lifestyle.jpg" alt="" className="aspect-[16/9] rounded-[28px] sm:aspect-[21/9]" sizes="100vw" />
      </section>
    </div>
  )
}

export function NotFound() {
  return <EmptyState icon={Compass} title="Lost your footing?" text="The page you're looking for doesn't exist." action={<Link to="/" className="btn-primary">Back to home</Link>} />
}
