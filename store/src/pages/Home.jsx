import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BadgeCheck, CreditCard, Quote, RefreshCcw, Truck } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { peek, remember } from '../lib/cache'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import HumanCheck, { useHuman } from '../components/HumanCheck'
import { cls, usd } from '../lib/format'
import { useMeta } from '../lib/meta'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import { Img, Reveal, SectionHeader, Stars, useTilt, BrandMark } from '../components/ui'

export default function Home() {
  const { t } = usePrefs()
  const [d, setD] = useState(() => peek('home'))
  const [err, setErr] = useState(false)
  useMeta({ title: t('meta.home'), description: t('meta.homeDesc') })
  useEffect(() => { api('/api/home').then((r) => { setD(r); remember('home', r) }).catch(() => setErr(true)) }, [])
  const [slow, setSlow] = useState(false)
  useEffect(() => { if (d) return; const tm = setTimeout(() => setSlow(true), 5000); return () => clearTimeout(tm) }, [d])
  const heroes = d?.banners.filter((b) => b.placement === 'hero') || []
  const promo = d?.banners.find((b) => b.placement === 'promo')
  return (
    <div>
      {slow && !d && !err && (
        <div className="container-x mt-3"><p className="flex items-center gap-2.5 rounded-2xl bg-ice-50 px-4 py-3 text-sm text-ice-700">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />{t('home.waking')}</p></div>
      )}
      <Hero banners={heroes} loading={!d && !err} />
      <TrustBar />
      <Rail eyebrow={t('home.justLanded')} title={t('nav.newArrivals')} link="/new-arrivals" items={d?.new_arrivals} loading={!d} />
      <CategoryTiles categories={d?.categories} />
      <Rail eyebrow={t('home.favourites')} title={t('nav.bestSellers')} link="/best-sellers" items={d?.best_sellers} loading={!d} />
      {promo && <Promo banner={promo} />}
      <Featured items={d?.featured} />
      <Brands brands={d?.brands} />
      <Rail eyebrow={t('home.talking')} title={t('home.trending')} link="/shop?sort=best_selling" items={d?.trending} loading={!d} />
      <Story />
      {d?.testimonials?.length > 0 && <Testimonials items={d.testimonials} />}
      <Newsletter />
    </div>
  )
}

function Hero({ banners, loading }) {
  const { t, pick } = usePrefs()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (banners.length < 2) return
    const tm = setInterval(() => setI((x) => (x + 1) % banners.length), 7000)
    return () => clearInterval(tm)
  }, [banners.length])
  if (loading) return <div className="container-x pt-2"><div className="skeleton h-[78svh] max-h-[820px] min-h-[520px] rounded-[28px]" /></div>
  const fallback = { eyebrow: t('home.heroEyebrow'), title: t('home.heroTitle'), subtitle: t('home.heroSubtitle'), cta_label: t('common.shopNow'), cta_link: '/shop', image_url: '/images/hero-fallback.jpg' }
  const list = banners.length ? banners : [fallback]
  return (
    <section className="container-x pt-2" aria-label={t('home.campaign')}>
      <div className="relative h-[78svh] max-h-[820px] min-h-[540px] overflow-hidden rounded-[28px] bg-night">
        {list.map((b, n) => {
          const active = n === i
          const lines = (pick(b, 'title') || '').split('\n')
          return (
            <div key={b.id ?? n} className={cls('absolute inset-0 transition-opacity duration-1000', active ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={!active}>
              <picture>
                {b.mobile_image_url && <source media="(max-width: 767px)" srcSet={assetUrl(b.mobile_image_url)} />}
                <img src={assetUrl(b.image_url)} alt="" className={cls('h-full w-full object-cover transition-transform duration-[8000ms] ease-out', active ? 'scale-100' : 'scale-110')} fetchpriority={n === 0 ? 'high' : undefined} />
              </picture>
              <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/25 to-transparent md:bg-gradient-to-r md:from-night/80 md:via-night/30" />
              {active && (
                <div className="absolute inset-x-0 bottom-0 p-6 pb-12 sm:p-10 md:inset-y-0 md:flex md:max-w-3xl md:flex-col md:justify-center md:p-16">
                  {pick(b, 'eyebrow') && <p className="mb-4 inline-flex w-fit animate-fade-up items-center gap-2 rounded-full bg-snow/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ice-200 backdrop-blur">{pick(b, 'eyebrow')}</p>}
                  <h1 className="h-display text-[52px] text-snow sm:text-7xl lg:text-[100px]">
                    {lines.map((l, k) => (
                      <span key={k} className="block overflow-hidden pb-[0.06em]"><span className="block animate-line-up" style={{ animationDelay: `${120 + k * 140}ms` }}>{l}</span></span>
                    ))}
                  </h1>
                  {pick(b, 'subtitle') && <p className="mt-5 max-w-md animate-fade-up text-base text-snow/80 [animation-delay:450ms] sm:text-lg">{pick(b, 'subtitle')}</p>}
                  <div className="mt-8 flex animate-fade-up flex-wrap gap-3 [animation-delay:600ms]">
                    <Link to={b.cta_link || '/shop'} className="btn-snow group">{pick(b, 'cta_label') || t('common.shopNow')} <ArrowRight size={18} className="transition group-hover:translate-x-1" /></Link>
                    <Link to="/new-arrivals" className="btn border border-snow/30 text-snow backdrop-blur hover:bg-snow/10">{t('nav.newArrivals')}</Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {list.length > 1 && (
          <div className="absolute bottom-5 right-6 z-10 flex gap-2 sm:bottom-8 sm:right-10">
            {list.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={t('home.slide', { n: n + 1 })} className="grid h-8 w-8 place-items-center">
                <span className={cls('block h-1 rounded-full transition-all duration-500', n === i ? 'w-8 bg-snow' : 'w-4 bg-snow/40')} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TrustBar() {
  const { settings } = useStore()
  const { t } = usePrefs()
  const free = settings?.delivery?.free_shipping_threshold
  const items = [
    [Truck, t('home.trust.fast'), free ? t('home.trust.freeOver', { amount: usd(free) }) : t('home.trust.allProvinces')],
    [CreditCard, t('home.trust.pay'), t('home.trust.payText')],
    [BadgeCheck, t('home.trust.care'), t('home.trust.careText')],
    [RefreshCcw, t('home.trust.exchange'), t('home.trust.exchangeText')],
  ]
  return (
    <section className="container-x mt-6">
      {/* fixed grid: 2 x 2 on phones, 4 across on desktop - never scrolls sideways */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {items.map(([Icon, title, sub], n) => (
          <Reveal key={title} delay={n * 70} className="card flex min-w-0 flex-col gap-2.5 p-3.5 transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ice-50 text-ice-600 sm:h-11 sm:w-11"><Icon size={19} /></span>
            <div className="min-w-0"><p className="text-[13px] font-semibold leading-snug sm:text-sm">{title}</p><p className="mt-0.5 text-[11.5px] leading-snug text-stone-450 sm:text-xs">{sub}</p></div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Rail({ eyebrow, title, link, items, loading }) {
  if (!loading && !items?.length) return null
  return (
    <section className="container-x mt-20 md:mt-28">
      <SectionHeader eyebrow={eyebrow} title={title} link={link} />
      {/* phones: 2-column grid (scrolls with the page, no sideways swiping); desktop: 4 across */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 pt-2 sm:gap-x-5 lg:grid-cols-4">
        {(loading ? Array.from({ length: 4 }) : items.slice(0, 4)).map((p, i) => (
          <div key={p?.id ?? i} className="min-w-0">
            {loading ? <ProductCardSkeleton /> : <ProductCard product={p} index={i} sizes="(min-width:1024px) 24vw, 48vw" />}
          </div>
        ))}
      </div>
    </section>
  )
}

function CategoryTiles({ categories }) {
  const { t, pick } = usePrefs()
  if (!categories?.length) return null
  return (
    <section className="container-x mt-20 md:mt-28">
      <SectionHeader eyebrow={t('home.findFit')} title={t('nav.shopByCategory')} link="/shop" linkLabel={t('nav.allSneakers')} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {categories.slice(0, 5).map((c, i) => (
          <Reveal key={c.id} delay={i * 70} className={i === 0 ? 'col-span-2 lg:col-span-1' : ''}>
            <Link to={`/category/${c.slug}`} className={cls('group relative block overflow-hidden rounded-3xl bg-night', i === 0 ? 'aspect-[16/10] lg:aspect-[3/4]' : 'aspect-[3/4]')}>
              <Img src={c.image_url} alt={pick(c, 'name')} className="absolute inset-0" imgClass="object-cover transition duration-1000 group-hover:scale-110" sizes="(min-width:1024px) 20vw, 50vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 sm:p-5">
                <div>
                  <p className="h-display text-2xl text-snow sm:text-3xl">{pick(c, 'name')}</p>
                  <p className="mt-1 text-xs text-snow/70">{t(c.product_count === 1 ? 'common.style' : 'common.styles', { n: c.product_count })}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-snow text-night transition duration-500 group-hover:rotate-45"><ArrowUpRight size={18} /></span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Promo({ banner: b }) {
  const { pick } = usePrefs()
  return (
    <Reveal as="section" className="container-x mt-20 md:mt-28">
      <Link to={b.cta_link} className="group relative block overflow-hidden rounded-[28px] bg-night">
        <Img src={b.image_url} alt="" className="aspect-[4/5] sm:aspect-[21/9]" imgClass="object-cover transition duration-[1500ms] group-hover:scale-105" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-night/85 to-transparent sm:bg-gradient-to-r sm:from-night/85 sm:via-night/40" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:inset-y-0 sm:flex sm:max-w-xl sm:flex-col sm:justify-center sm:p-14">
          <p className="eyebrow !text-ice-300">{pick(b, 'eyebrow')}</p>
          <h3 className="h-display mt-3 text-5xl text-snow sm:text-6xl">{pick(b, 'title')}</h3>
          <p className="mt-3 text-snow/75">{pick(b, 'subtitle')}</p>
          <span className="btn-ice mt-6 w-fit">{pick(b, 'cta_label')} <ArrowRight size={18} /></span>
        </div>
      </Link>
    </Reveal>
  )
}

function Featured({ items }) {
  const { t, pick } = usePrefs()
  const tilt = useTilt(4)
  if (!items?.length) return null
  const [lead, ...rest] = items
  return (
    <section className="container-x mt-20 md:mt-28">
      <SectionHeader eyebrow={t('home.editors')} title={t('nav.featured')} link="/shop?featured=true" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal>
          <Link ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} to={`/product/${lead.slug}`}
            className="tilt group relative block overflow-hidden rounded-[28px] bg-white shadow-soft">
            <Img image={lead.image} alt={pick(lead, 'name')} className="aspect-square" imgClass="object-cover transition duration-1000 group-hover:scale-105" sizes="(min-width:1024px) 48vw, 100vw" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-white via-white/90 to-transparent p-6 pt-16">
              <div><p className="eyebrow keep-latin">{lead.brand.name}</p><p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{pick(lead, 'name')}</p></div>
              <span className="btn-primary shrink-0">{usd(lead.effective_price)}</span>
            </div>
          </Link>
        </Reveal>
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5">
          {rest.slice(0, 4).map((p, i) => <ProductCard key={p.id} product={p} index={i} sizes="(min-width:1024px) 23vw, 48vw" />)}
        </div>
      </div>
    </section>
  )
}

function Brands({ brands }) {
  const { t } = usePrefs()
  if (!brands?.length) return null
  return (
    <section className="mt-20 overflow-hidden bg-night py-16 text-snow md:mt-28 md:py-24">
      <Reveal className="container-x">
        <p className="eyebrow !text-ice-300">{t('home.lineup')}</p>
        <h2 className="h-display mt-2 text-[34px] sm:text-5xl lg:text-6xl">{t('nav.shopByBrand')}</h2>
      </Reveal>
      <div className="container-x mt-10">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-snow/10 ring-1 ring-snow/10 lg:grid-cols-5">
        {brands.filter((b) => b.product_count > 0).map((b, i) => (
          <Reveal key={b.id} delay={(i % 5) * 50}>
            <Link to={`/brands/${b.slug}`} className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden bg-night p-5 transition duration-300 hover:bg-night-800 active:bg-night-800 sm:min-h-[160px] sm:p-6">
              {/* brand logo, large and faint behind the name */}
              <BrandMark brand={b} className="pointer-events-none absolute -right-3 top-1/2 h-[68%] w-[78%] -translate-y-1/2 text-snow/[.09] transition duration-500 ease-out group-hover:scale-110 group-hover:text-ice-300/25 group-active:scale-110 group-active:text-ice-300/25" />
              <span className="relative flex items-center justify-between text-xs text-snow/40">{t(b.product_count === 1 ? 'common.style' : 'common.styles', { n: b.product_count })} <ArrowUpRight size={16} className="transition duration-300 group-hover:rotate-45 group-hover:text-ice-300" /></span>
              <span className="keep-latin relative font-wide text-xl font-black uppercase leading-none tracking-tight transition duration-300 group-hover:translate-x-1 sm:text-2xl">{b.name}</span>
            </Link>
          </Reveal>
        ))}
      </div>
      </div>
    </section>
  )
}

function Story() {
  const { t } = usePrefs()
  return (
    <section className="container-x mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16">
      <Reveal className="relative">
        <Img src="/images/story-lifestyle.jpg" alt={t('home.storyAlt')} className="aspect-[4/5] rounded-[28px]" sizes="(min-width:1024px) 45vw, 100vw" />
        <div className="absolute -bottom-6 right-4 w-44 rounded-2xl bg-white p-4 shadow-lift sm:right-8 sm:w-56">
          <p className="keep-latin font-wide text-4xl font-black">25</p>
          <p className="text-sm text-stone-450">{t('home.provinces')}</p>
        </div>
      </Reveal>
      <Reveal delay={120} className="lg:pr-10">
        <p className="eyebrow">{t('home.storyEyebrow')}</p>
        <h2 className="h-display mt-3 text-[40px] sm:text-6xl">{t('home.storyTitle')}</h2>
        <p className="mt-6 text-lg leading-relaxed text-ink-700">{t('home.storyText')}</p>
        <div className="mt-8 grid grid-cols-3 gap-4 border-t border-ink/10 pt-6">
          {[['9', t('home.statBrands')], ['3', t('home.statPay')], ['7', t('home.statExchange')]].map(([n, l]) => (
            <div key={l}><p className="keep-latin font-wide text-3xl font-black">{n}</p><p className="text-sm text-stone-450">{l}</p></div>
          ))}
        </div>
        <Link to="/about" className="btn-outline mt-8">{t('home.ourStory')} <ArrowRight size={16} /></Link>
      </Reveal>
    </section>
  )
}

function Testimonials({ items }) {
  const { t, pick } = usePrefs()
  if (!items?.length) return null
  // two copies side by side; the track slides left by exactly one copy, so the loop is seamless
  const loop = [...items, ...items]
  const card = (r, i) => (
    <figure key={`${r.id}-${i}`} aria-hidden={i >= items.length || undefined}
      className="card flex w-[290px] shrink-0 flex-col p-6 sm:w-[340px]">
      <Quote size={26} className="text-ice-400" />
      <Stars value={r.rating} className="mt-4" />
      <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed"><p className="font-semibold">{r.title}</p><p className="mt-1 text-ink-700">{r.body}</p></blockquote>
      <figcaption className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4 text-sm">
        <span className="font-semibold">{r.author_name}{r.verified_purchase && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><BadgeCheck size={13} />{t('home.verified')}</span>}</span>
        {r.product && <Link to={`/product/${r.product.slug}`} tabIndex={i >= items.length ? -1 : undefined} className="truncate pl-3 text-xs text-stone-450 underline">{pick(r.product, 'name')}</Link>}
      </figcaption>
    </figure>
  )
  return (
    <section className="mt-24 md:mt-32">
      <div className="container-x"><SectionHeader eyebrow={t('home.realCustomers')} title={t('home.whatPeopleSay')} /></div>
      <Reveal className="reviews-marquee mt-2">
        <div className="reviews-track flex w-max gap-4 py-2" style={{ '--marquee-duration': `${Math.max(30, items.length * 9)}s` }}>
          {loop.map(card)}
        </div>
      </Reveal>
    </section>
  )
}

function Newsletter() {
  const { t } = usePrefs()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')
  const human = useHuman()
  const submit = async (e) => {
    e.preventDefault()
    setState('busy')
    try { await api('/api/newsletter', { method: 'POST', body: { email }, human: await human.token() }); setState('done') } catch { setState('error') }
  }
  return (
    <Reveal as="section" className="container-x mt-24 md:mt-32">
      <div className="relative overflow-hidden rounded-[28px] bg-ice-100 px-6 py-14 text-center sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rotate-12 rounded-[48px] border-[18px] border-white/60" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 -rotate-12 rounded-[56px] border-[22px] border-ice-200/50" />
        <p className="eyebrow relative">{t('home.insiders')}</p>
        <h2 className="h-display relative mx-auto mt-3 max-w-2xl text-[40px] sm:text-6xl">{t('home.firstOnDrop')}</h2>
        <p className="relative mx-auto mt-4 max-w-md text-ink-700">{t('home.newsletterText')}</p>
        {state === 'done' ? (
          <p className="relative mx-auto mt-8 w-fit animate-fade-up rounded-full bg-white px-6 py-3.5 font-semibold">{t('home.youreIn')}</p>
        ) : (
          <form onSubmit={submit} className="relative mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label={t('auth.email')} className="field flex-1 !rounded-full" />
            <button className="btn-primary" disabled={state === 'busy'}>{t('home.subscribe')}</button>
          </form>
        )}
        {state !== 'done' && email && (
          <HumanCheck human={human} className="relative mx-auto mt-3 flex justify-center" />
        )}
        {state === 'error' && <p className="relative mt-3 text-sm text-signal">{t('home.somethingWrong')}</p>}
      </div>
    </Reveal>
  )
}
