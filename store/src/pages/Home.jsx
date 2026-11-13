import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BadgeCheck, CreditCard, Quote, RefreshCcw, Truck } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { useStore } from '../context/Store'
import { usd } from '../lib/format'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import { Img, SectionHeader, Stars } from '../components/ui'

export default function Home() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => { api('/api/home').then(setD).catch(() => setErr(true)) }, [])
  const heroes = d?.banners.filter((b) => b.placement === 'hero') || []
  const promo = d?.banners.find((b) => b.placement === 'promo')
  return (
    <div>
      <Hero banners={heroes} loading={!d && !err} />
      <TrustBar />
      <Rail eyebrow="Just landed" title="New arrivals" link="/new-arrivals" items={d?.new_arrivals} loading={!d} />
      <CategoryTiles categories={d?.categories} />
      <Rail eyebrow="Customer favourites" title="Best sellers" link="/best-sellers" items={d?.best_sellers} loading={!d} />
      {promo && <Promo banner={promo} />}
      <Featured items={d?.featured} />
      <Brands brands={d?.brands} />
      <Rail eyebrow="Everyone's talking" title="Trending now" link="/shop?sort=best_selling" items={d?.trending} loading={!d} />
      <Story />
      {d?.testimonials?.length > 0 && <Testimonials items={d.testimonials} />}
      <Newsletter />
    </div>
  )
}

function Hero({ banners, loading }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (banners.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % banners.length), 7000)
    return () => clearInterval(t)
  }, [banners.length])
  if (loading) return <div className="container-x pt-2"><div className="skeleton h-[78svh] max-h-[820px] min-h-[520px] rounded-[28px]" /></div>
  const fallback = { eyebrow: 'New season', title: 'Stay cold.\nWalk loud.', subtitle: 'Premium sneakers, delivered across Cambodia.', cta_label: 'Shop now', cta_link: '/shop', image_url: '/images/hero-fallback.jpg' }
  const list = banners.length ? banners : [fallback]
  return (
    <section className="container-x pt-2" aria-label="Featured campaign">
      <div className="relative h-[78svh] max-h-[820px] min-h-[540px] overflow-hidden rounded-[28px] bg-ink">
        {list.map((b, n) => (
          <div key={b.id ?? n} className={`absolute inset-0 transition-opacity duration-1000 ${n === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={n !== i}>
            <picture>
              {b.mobile_image_url && <source media="(max-width: 767px)" srcSet={assetUrl(b.mobile_image_url)} />}
              <img src={assetUrl(b.image_url)} alt="" className={`h-full w-full object-cover ${n === i ? 'scale-100' : 'scale-105'} transition-transform duration-[7000ms] ease-out`} fetchpriority={n === 0 ? 'high' : undefined} />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent md:bg-gradient-to-r md:from-ink/75 md:via-ink/25" />
            <div className="absolute inset-x-0 bottom-0 p-6 pb-10 sm:p-10 md:inset-y-0 md:flex md:max-w-3xl md:flex-col md:justify-center md:p-16">
              {b.eyebrow && <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ice-200 backdrop-blur">{b.eyebrow}</p>}
              <h1 className="h-display whitespace-pre-line text-[56px] text-white sm:text-7xl lg:text-[104px]">{b.title}</h1>
              {b.subtitle && <p className="mt-5 max-w-md text-base text-white/80 sm:text-lg">{b.subtitle}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={b.cta_link || '/shop'} className="btn-white">{b.cta_label || 'Shop now'} <ArrowRight size={18} /></Link>
                <Link to="/new-arrivals" className="btn border border-white/30 text-white backdrop-blur hover:bg-white/10">New arrivals</Link>
              </div>
            </div>
          </div>
        ))}
        {list.length > 1 && (
          <div className="absolute bottom-5 right-6 flex gap-2 sm:bottom-8 sm:right-10">
            {list.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} className="grid h-8 w-8 place-items-center">
                <span className={`block h-1 rounded-full transition-all ${n === i ? 'w-8 bg-white' : 'w-4 bg-white/40'}`} />
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
  const free = settings?.delivery?.free_shipping_threshold
  const items = [
    [Truck, 'Fast delivery', free ? `Free over ${usd(free)}` : 'Across all 25 provinces'],
    [CreditCard, 'KHQR & COD', 'ABA, bank transfer or cash'],
    [BadgeCheck, 'Sourced with care', 'Checked before it ships'],
    [RefreshCcw, '7-day exchange', 'On unworn pairs'],
  ]
  return (
    <section className="container-x mt-6">
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {items.map(([Icon, t, s]) => (
          <div key={t} className="flex min-w-[240px] snap-start items-center gap-4 rounded-2xl bg-white p-4 shadow-soft sm:min-w-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ice-50 text-ice-600"><Icon size={20} /></span>
            <div><p className="text-sm font-semibold">{t}</p><p className="text-xs text-stone-450">{s}</p></div>
          </div>
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
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:gap-5 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {(loading ? Array.from({ length: 4 }) : items.slice(0, 8)).map((p, i) => (
          <div key={p?.id ?? i} className={`w-[68%] shrink-0 snap-start sm:w-[42%] lg:w-auto ${i >= 4 ? 'lg:hidden' : ''}`}>
            {loading ? <ProductCardSkeleton /> : <ProductCard product={p} sizes="(min-width:1024px) 24vw, 68vw" />}
          </div>
        ))}
      </div>
    </section>
  )
}

function CategoryTiles({ categories }) {
  if (!categories?.length) return null
  const list = categories.slice(0, 5)
  return (
    <section className="container-x mt-20 md:mt-28">
      <SectionHeader eyebrow="Find your fit" title="Shop by category" link="/shop" linkLabel="All sneakers" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {list.map((c, i) => (
          <Link key={c.id} to={`/category/${c.slug}`}
            className={`group relative overflow-hidden rounded-3xl bg-ink ${i === 0 ? 'col-span-2 aspect-[16/10] lg:col-span-1 lg:row-span-1 lg:aspect-[3/4]' : 'aspect-[3/4]'}`}>
            <Img src={c.image_url || `/images/category-${c.slug}.jpg`} alt={c.name} className="absolute inset-0 transition duration-700 group-hover:scale-105" sizes="(min-width:1024px) 20vw, 50vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 sm:p-5">
              <div>
                <p className="h-display text-2xl text-white sm:text-3xl">{c.name}</p>
                <p className="mt-1 text-xs text-white/70">{c.product_count} styles</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink transition group-hover:rotate-45"><ArrowUpRight size={18} /></span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Promo({ banner: b }) {
  return (
    <section className="container-x mt-20 md:mt-28">
      <Link to={b.cta_link} className="group relative block overflow-hidden rounded-[28px] bg-ink">
        <Img src={b.image_url} alt="" className="aspect-[4/5] sm:aspect-[21/9]" imgClass="object-cover transition duration-1000 group-hover:scale-105" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 to-transparent sm:bg-gradient-to-r sm:from-ink/85 sm:via-ink/40" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:inset-y-0 sm:flex sm:max-w-xl sm:flex-col sm:justify-center sm:p-14">
          <p className="eyebrow !text-ice-300">{b.eyebrow}</p>
          <h3 className="h-display mt-3 text-5xl text-white sm:text-6xl">{b.title}</h3>
          <p className="mt-3 text-white/75">{b.subtitle}</p>
          <span className="btn-ice mt-6 w-fit">{b.cta_label} <ArrowRight size={18} /></span>
        </div>
      </Link>
    </section>
  )
}

function Featured({ items }) {
  if (!items?.length) return null
  const [lead, ...rest] = items
  return (
    <section className="container-x mt-20 md:mt-28">
      <SectionHeader eyebrow="Editor's picks" title="Featured" link="/shop?featured=true" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Link to={`/product/${lead.slug}`} className="group relative overflow-hidden rounded-[28px] bg-white shadow-soft">
          <Img image={lead.image} alt={lead.name} className="aspect-square" imgClass="object-cover transition duration-700 group-hover:scale-105" sizes="(min-width:1024px) 48vw, 100vw" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-white via-white/90 to-transparent p-6 pt-16">
            <div><p className="eyebrow">{lead.brand.name}</p><p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{lead.name}</p></div>
            <span className="btn-primary shrink-0">{usd(lead.effective_price)}</span>
          </div>
        </Link>
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5">
          {rest.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} sizes="(min-width:1024px) 23vw, 48vw" />)}
        </div>
      </div>
    </section>
  )
}

function Brands({ brands }) {
  if (!brands?.length) return null
  return (
    <section className="mt-20 overflow-hidden bg-ink py-16 text-white md:mt-28 md:py-24">
      <div className="container-x">
        <p className="eyebrow !text-ice-300">The line-up</p>
        <h2 className="h-display mt-2 text-[34px] sm:text-5xl lg:text-6xl">Shop by brand</h2>
      </div>
      <div className="container-x mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
        {brands.filter((b) => b.product_count > 0).map((b) => (
          <Link key={b.id} to={`/brands/${b.slug}`} className="group flex min-h-[132px] flex-col justify-between bg-ink p-5 transition hover:bg-ink-800 sm:min-h-[160px] sm:p-6">
            <span className="flex items-center justify-between text-xs text-white/40">{b.product_count} styles <ArrowUpRight size={16} className="transition group-hover:text-ice-300" /></span>
            <span className="font-wide text-xl font-black uppercase leading-none tracking-tight sm:text-2xl">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Story() {
  return (
    <section className="container-x mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16">
      <div className="relative">
        <Img src="/images/story-lifestyle.jpg" alt="Sneakers on a Phnom Penh street at dusk" className="aspect-[4/5] rounded-[28px]" sizes="(min-width:1024px) 45vw, 100vw" />
        <div className="absolute -bottom-6 right-4 w-44 rounded-2xl bg-white p-4 shadow-lift sm:right-8 sm:w-56">
          <p className="font-wide text-4xl font-black">25</p>
          <p className="text-sm text-stone-450">provinces we deliver to — from Phnom Penh to Ratanakiri.</p>
        </div>
      </div>
      <div className="lg:pr-10">
        <p className="eyebrow">About IceQ Sole</p>
        <h2 className="h-display mt-3 text-[40px] sm:text-6xl">Cold-blooded style. Built for the street.</h2>
        <p className="mt-6 text-lg leading-relaxed text-ink-700">IceQ Sole is a Phnom Penh sneaker boutique for people who care about the details. We curate icons and new drops from the brands you love, inspect every pair before it ships, and deliver right to your door.</p>
        <div className="mt-8 grid grid-cols-3 gap-4 border-t border-ink/10 pt-6">
          {[['9', 'Brands'], ['3', 'Ways to pay'], ['7-day', 'Exchanges']].map(([n, l]) => (
            <div key={l}><p className="font-wide text-3xl font-black">{n}</p><p className="text-sm text-stone-450">{l}</p></div>
          ))}
        </div>
        <Link to="/about" className="btn-outline mt-8">Our story <ArrowRight size={16} /></Link>
      </div>
    </section>
  )
}

function Testimonials({ items }) {
  return (
    <section className="container-x mt-24 md:mt-32">
      <SectionHeader eyebrow="Real customers" title="What people say" />
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
        {items.map((r) => (
          <figure key={r.id} className="card flex min-w-[85%] snap-start flex-col p-6 sm:min-w-0">
            <Quote size={26} className="text-ice-400" />
            <Stars value={r.rating} className="mt-4" />
            <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed"><p className="font-semibold">{r.title}</p><p className="mt-1 text-ink-700">{r.body}</p></blockquote>
            <figcaption className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4 text-sm">
              <span className="font-semibold">{r.author_name}{r.verified_purchase && <span className="ml-2 text-xs font-medium text-emerald-700">✓ Verified</span>}</span>
              {r.product && <Link to={`/product/${r.product.slug}`} className="truncate pl-3 text-xs text-stone-450 underline">{r.product.name}</Link>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Newsletter() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')
  const submit = async (e) => {
    e.preventDefault()
    setState('busy')
    try { await api('/api/newsletter', { method: 'POST', body: { email } }); setState('done') } catch { setState('error') }
  }
  return (
    <section className="container-x mt-24 md:mt-32">
      <div className="relative overflow-hidden rounded-[28px] bg-ice-100 px-6 py-14 text-center sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rotate-12 rounded-[48px] border-[18px] border-white/60" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 -rotate-12 rounded-[56px] border-[22px] border-ice-200" />
        <p className="eyebrow relative">IceQ insiders</p>
        <h2 className="h-display relative mx-auto mt-3 max-w-2xl text-[40px] sm:text-6xl">First on every drop.</h2>
        <p className="relative mx-auto mt-4 max-w-md text-ink-700">Restock alerts, early access and members-only codes. No spam — unsubscribe anytime.</p>
        {state === 'done' ? (
          <p className="relative mx-auto mt-8 w-fit rounded-full bg-white px-6 py-3.5 font-semibold">You're in. Welcome to IceQ Sole ❄</p>
        ) : (
          <form onSubmit={submit} className="relative mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" className="field flex-1 !rounded-full" />
            <button className="btn-primary" disabled={state === 'busy'}>Subscribe</button>
          </form>
        )}
        {state === 'error' && <p className="relative mt-3 text-sm text-signal">Something went wrong, please try again.</p>}
      </div>
    </section>
  )
}
