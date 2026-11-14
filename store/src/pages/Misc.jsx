import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BadgeCheck, Compass, Heart, RefreshCcw, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { useMeta } from '../lib/meta'
import { ProductGrid } from '../components/ProductCard'
import { BrandMark, EmptyState, Reveal } from '../components/ui'

export function Wishlist() {
  const { wishIds, user } = useStore()
  const { t } = usePrefs()
  const [items, setItems] = useState(null)
  useMeta({ title: t('wishlist.title') })
  useEffect(() => {
    if (!wishIds.length) { setItems([]); return }
    api('/api/products', { query: { ids: wishIds.join(','), page_size: 60 } })
      .then((r) => setItems(wishIds.map((id) => r.items.find((p) => p.id === id)).filter(Boolean))).catch(() => setItems([]))
  }, [wishIds])
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">{t('wishlist.eyebrow')}</p>
      <h1 className="h-display mt-2 text-5xl sm:text-6xl">{t('wishlist.title')}</h1>
      {!user && wishIds.length > 0 && <p className="mt-3 text-sm text-stone-450"><Link to="/login?next=/wishlist" className="font-semibold text-ink underline">{t('nav.signIn')}</Link> {t('wishlist.signInSync')}</p>}
      <div className="mt-8">
        {items && items.length === 0 ? (
          <EmptyState icon={Heart} title={t('wishlist.emptyTitle')} text={t('wishlist.emptyText')} action={<Link to="/shop" className="btn-primary">{t('wishlist.explore')}</Link>} />
        ) : <ProductGrid products={items || []} loading={!items} count={4} />}
      </div>
    </div>
  )
}

export function Brands() {
  const { t } = usePrefs()
  const [brands, setBrands] = useState(null)
  useMeta({ title: t('brandsPage.title') })
  useEffect(() => { api('/api/brands').then(setBrands).catch(() => setBrands([])) }, [])
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">{t('brandsPage.eyebrow')}</p>
      <h1 className="h-display mt-2 text-5xl sm:text-7xl">{t('brandsPage.title')}</h1>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {(brands || Array.from({ length: 8 })).map((b, i) => b ? (
          <Reveal key={b.id} delay={(i % 4) * 60}>
            <Link to={`/brands/${b.slug}`} className="group card relative flex min-h-[180px] flex-col justify-between overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lift sm:min-h-[220px] sm:p-6">
              <BrandMark brand={b} className="pointer-events-none absolute -right-4 top-6 h-[55%] w-[75%] text-ink/[.06] transition duration-500 ease-out group-hover:scale-110 group-hover:text-ice-500/20" />
              <div className="relative flex items-center justify-between">
                <span className="flex items-center gap-2.5"><BrandMark brand={b} className="h-7 w-11 text-ink" /><span className="text-xs text-stone-450">{t(b.product_count === 1 ? 'common.style' : 'common.styles', { n: b.product_count })}</span></span>
                <ArrowUpRight size={18} className="transition duration-300 group-hover:rotate-45" />
              </div>
              <div className="relative"><p className="keep-latin font-wide text-xl font-black uppercase leading-none sm:text-2xl">{b.name}</p><p className="mt-2 line-clamp-2 text-sm text-stone-450">{b.description}</p></div>
            </Link>
          </Reveal>
        ) : <div key={i} className="skeleton min-h-[180px] sm:min-h-[220px]" />)}
      </div>
    </div>
  )
}

export function About() {
  const { settings } = useStore()
  const { t } = usePrefs()
  useMeta({ title: t('about.eyebrow') })
  const d = settings?.delivery
  const deliveryText = t('about.deliveryText', {
    pp: d?.estimated_days_phnom_penh || '1', ppFee: d ? ` · $${d.phnom_penh_fee}` : '',
    prov: d?.estimated_days_province || '1–3', provFee: d ? ` · $${d.province_fee}` : '',
    free: d?.free_shipping_threshold ? t('about.freeOver', { amount: d.free_shipping_threshold }) : '',
  })
  return (
    <div>
      <section className="container-x pt-6 md:pt-10">
        <p className="eyebrow">{t('about.eyebrow')}</p>
        <h1 className="h-display mt-2 max-w-4xl text-5xl sm:text-7xl">{t('about.title')}</h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-700">{t('about.text')}</p>
      </section>
      <section className="container-x mt-14 grid gap-4 md:grid-cols-3">
        {[[Truck, t('about.delivery'), deliveryText, ''], [RefreshCcw, t('about.exchanges'), t('about.exchangesText'), ''], [BadgeCheck, t('about.authenticity'), t('about.authenticityText'), 'authenticity']].map(([Icon, title, s, id], i) => (
          <Reveal key={title} delay={i * 80} id={id || undefined} className="card scroll-mt-28 p-6">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ice-50 text-ice-600"><Icon size={22} /></span>
            <h2 className="mt-5 font-display text-2xl font-bold">{title}</h2>
            <p className="mt-2 text-ink-700">{s}</p>
          </Reveal>
        ))}
      </section>
      <Reveal as="section" className="container-x mt-14">
        <Img src="/images/story-lifestyle.jpg" alt={t('home.storyAlt')} className="aspect-[16/9] rounded-[28px] sm:aspect-[21/9]" sizes="100vw" />
      </Reveal>
    </div>
  )
}

export function Terms() {
  const { t } = usePrefs()
  useMeta({ title: t('terms.title') })
  const sections = t('terms.body')
  return (
    <div className="container-x max-w-3xl pt-6 md:pt-10">
      <h1 className="h-display text-5xl sm:text-6xl">{t('terms.title')}</h1>
      <div className="mt-10 space-y-8">
        {Array.isArray(sections) && sections.map(([h, p]) => (
          <section key={h}><h2 className="font-display text-xl font-bold">{h}</h2><p className="mt-2 leading-relaxed text-ink-700">{p}</p></section>
        ))}
      </div>
    </div>
  )
}

export function NotFound() {
  const { t } = usePrefs()
  useMeta({ title: t('notFound.title') })
  return <EmptyState icon={Compass} title={t('notFound.title')} text={t('notFound.text')} action={<Link to="/" className="btn-primary">{t('notFound.back')}</Link>} />
}
