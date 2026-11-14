import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, ChevronLeft, ChevronRight, Expand, PackageX, X } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { peek, remember } from '../lib/cache'
import { recentlyViewed } from '../lib/storage'
import { cls, date } from '../lib/format'
import { useMeta } from '../lib/meta'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { usePrefs } from '../context/Prefs'
import PurchasePanel from '../components/PurchasePanel'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import { EmptyState, Img, PhotoPlaceholder, SectionHeader, Stars, useLockBody } from '../components/ui'
import { imagesFor } from '../lib/product'

export default function Product() {
  const { slug } = useParams()
  const { t, pick } = usePrefs()
  const [p, setP] = useState(null)
  const [missing, setMissing] = useState(false)
  const [colorId, setColorId] = useState(null)
  const [related, setRelated] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    setP(peek(`product:${slug}`)); setMissing(false); setColorId(null); setRelated(null)
    api(`/api/products/${slug}`).then((d) => {
      setP(d)
      remember(`product:${slug}`, d)
      const prev = recentlyViewed.list().filter((id) => id !== d.id)
      recentlyViewed.add(d.id)
      if (prev.length) api('/api/products', { query: { ids: prev.slice(0, 8).join(','), page_size: 8 } }).then((r) => setRecent(prev.map((id) => r.items.find((x) => x.id === id)).filter(Boolean))).catch(() => {})
      else setRecent([])
    }).catch(() => setMissing(true))
    api(`/api/products/${slug}/related`).then(setRelated).catch(() => setRelated([]))
  }, [slug])

  const name = pick(p, 'name')
  useMeta(p ? {
    title: `${name} · ${p.brand.name}`,
    description: (pick(p, 'description') || t('meta.homeDesc')).slice(0, 160),
    image: p.images[0] ? assetUrl(p.images[0].url) : undefined,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: p.brand.name },
      image: p.images.map((i) => assetUrl(i.url)), description: p.description, sku: p.variants[0]?.sku,
      offers: { '@type': 'Offer', priceCurrency: 'USD', price: p.effective_price, url: window.location.href,
        availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
      ...(p.rating_count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating_avg, reviewCount: p.rating_count } } : {}),
    },
  } : {})

  const images = useMemo(() => {
    if (!p) return []
    return imagesFor(p, colorId)
  }, [p, colorId])

  if (missing) return <EmptyState icon={PackageX} title={t('product.notFound')} text={t('product.notFoundText')} action={<Link to="/shop" className="btn-primary">{t('product.browse')}</Link>} />

  return (
    <div className="container-x pt-4 md:pt-8">
      <nav className="mb-5 truncate text-xs text-stone-450" aria-label={t('shop.breadcrumb')}>
        <Link to="/" className="hover:text-ink">{t('common.home')}</Link><span className="mx-1.5">/</span>
        <Link to="/shop" className="hover:text-ink">{t('nav.shop')}</Link><span className="mx-1.5">/</span>
        {p && <><Link to={`/brands/${p.brand.slug}`} className="hover:text-ink">{p.brand.name}</Link><span className="mx-1.5">/</span><span className="text-ink">{name}</span></>}
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        {p ? <Gallery images={images} name={name} /> : <div className="skeleton aspect-square rounded-3xl" />}
        <div className="lg:sticky lg:top-28 lg:self-start">
          {p ? <PurchasePanel product={p} colorId={colorId} onColorChange={setColorId} /> : (
            <div className="space-y-4"><div className="skeleton h-4 w-24" /><div className="skeleton h-10 w-3/4" /><div className="skeleton h-8 w-32" /><div className="skeleton h-48" /></div>
          )}
          {p && <Details p={p} />}
        </div>
      </div>

      {p && <Reviews slug={slug} product={p} />}

      <section className="mt-20 md:mt-28">
        <SectionHeader eyebrow={t('product.relatedEyebrow')} title={t('product.related')} />
        <Rail items={related} />
      </section>
      {recent.length > 0 && (
        <section className="mt-16 md:mt-24">
          <SectionHeader eyebrow={t('product.recentEyebrow')} title={t('product.recent')} />
          <Rail items={recent} />
        </section>
      )}
    </div>
  )
}

function Rail({ items }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 pt-2 sm:gap-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
      {(items ?? Array.from({ length: 4 })).slice(0, 8).map((p, i) => (
        <div key={p?.id ?? i} className={cls('w-[64%] shrink-0 snap-start sm:w-[40%] lg:w-auto', i >= 4 && 'lg:hidden')}>
          {p ? <ProductCard product={p} index={i} /> : <ProductCardSkeleton />}
        </div>
      ))}
    </div>
  )
}

function Gallery({ images, name }) {
  const { t } = usePrefs()
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [full, setFull] = useState(false)
  const track = useRef(null)
  useEffect(() => { setI(0); track.current?.scrollTo({ left: 0 }) }, [images])
  if (!images.length) return <PhotoPlaceholder className="aspect-square rounded-3xl" />
  const cur = images[i]
  const onScroll = () => { const el = track.current; if (el) setI(Math.round(el.scrollLeft / el.clientWidth)) }
  const go = (n) => { const idx = (n + images.length) % images.length; setI(idx); track.current?.scrollTo({ left: idx * track.current.clientWidth, behavior: 'smooth' }) }

  return (
    <div className="lg:grid lg:grid-cols-[84px_1fr] lg:gap-4">
      <div className="no-scrollbar order-2 mt-3 hidden gap-3 lg:order-1 lg:mt-0 lg:flex lg:max-h-[680px] lg:flex-col lg:overflow-y-auto">
        {images.map((im, n) => (
          <button key={im.id} onClick={() => go(n)} aria-label={t('product.image', { n: n + 1 })}
            className={cls('aspect-square w-[84px] shrink-0 overflow-hidden rounded-xl border-2 transition duration-300', n === i ? 'border-ink' : 'border-transparent opacity-60 hover:opacity-100')}>
            <Img image={im} className="h-full w-full" sizes="84px" />
          </button>
        ))}
      </div>
      <div className="relative order-1 lg:order-2">
        <div ref={track} onScroll={onScroll} className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 sm:rounded-3xl lg:hidden">
          {images.map((im, n) => (
            <button key={im.id} onClick={() => { setI(n); setFull(true) }} className="aspect-square w-full shrink-0 snap-center" aria-label={t('product.fullscreen')}>
              <Img image={im} alt={im.alt || name} className="h-full w-full" sizes="100vw" priority={n === 0} />
            </button>
          ))}
        </div>
        <div className="relative hidden aspect-square cursor-zoom-in overflow-hidden rounded-3xl bg-bone-200 lg:block"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
          onMouseLeave={() => setZoom(null)} onClick={() => setFull(true)}>
          <Img key={cur.id} image={cur} alt={cur.alt || name} className="h-full w-full animate-fade-in" sizes="(min-width:1024px) 50vw, 100vw" priority />
          <div className={cls('pointer-events-none absolute inset-0 bg-no-repeat transition-opacity duration-300', zoom ? 'opacity-100' : 'opacity-0')}
            style={{ backgroundImage: `url(${assetUrl(cur.url)})`, backgroundSize: '220%', backgroundPosition: zoom ? `${zoom.x}% ${zoom.y}%` : 'center' }} />
        </div>
        <button onClick={() => setFull(true)} aria-label={t('product.fullscreen')} className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow-soft backdrop-blur transition hover:scale-110"><Expand size={18} /></button>
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 lg:hidden">
            {images.map((_, n) => <span key={n} className={cls('h-1.5 rounded-full transition-all duration-300', n === i ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25')} />)}
          </div>
        )}
      </div>
      {full && <Lightbox images={images} start={i} onClose={() => setFull(false)} name={name} />}
    </div>
  )
}

function Lightbox({ images, start, onClose, name }) {
  const { t } = usePrefs()
  const [i, setI] = useState(start)
  const [scale, setScale] = useState(1)
  useLockBody(true)
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % images.length); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + images.length) % images.length) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [images.length, onClose])
  useEffect(() => setScale(1), [i])
  const touch = useRef(null)
  return (
    <div className="fixed inset-0 z-[95] flex animate-fade-in flex-col bg-bone-100" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <span className="text-sm font-semibold tabular-nums">{i + 1} / {images.length}</span>
        <button onClick={onClose} aria-label={t('common.close')} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-soft"><X size={20} /></button>
      </div>
      <div className="relative flex-1 overflow-hidden"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (scale === 1 && Math.abs(dx) > 50) setI((x) => (x + (dx < 0 ? 1 : -1) + images.length) % images.length) }}
        onDoubleClick={() => setScale((s) => (s === 1 ? 2.2 : 1))}>
        <img key={images[i].id} src={assetUrl(images[i].url)} alt={images[i].alt || name} className="h-full w-full animate-fade-in object-contain transition-transform duration-300" style={{ transform: `scale(${scale})` }}
          onClick={() => setScale((s) => (s === 1 ? 2.2 : 1))} />
        {images.length > 1 && (
          <>
            <button onClick={() => setI((i - 1 + images.length) % images.length)} aria-label={t('product.previous')} className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white shadow-soft"><ChevronLeft /></button>
            <button onClick={() => setI((i + 1) % images.length)} aria-label={t('product.next')} className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white shadow-soft"><ChevronRight /></button>
          </>
        )}
      </div>
      <p className="pb-safe py-3 text-center text-xs text-stone-450">{t('product.zoomHint')}</p>
    </div>
  )
}

function Details({ p }) {
  const { t, pick } = usePrefs()
  const rows = [
    [t('product.brand'), p.brand.name], [t('product.model'), p.model || '—'], [t('product.category'), pick(p.category, 'name')],
    [t('product.for'), t(`shop.genders.${p.gender}`)], [t('product.colours'), [...new Set(p.variants.map((v) => v.color))].join(', ')],
  ]
  return (
    <div className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
      <details open className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{t('product.description')}<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-700">{pick(p, 'description') || t('product.noDescription')}</p>
      </details>
      <details className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{t('product.details')}<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => <Fragment key={k}><dt className="text-stone-450">{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </details>
      <details className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{t('product.deliveryExchanges')}<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{t('product.deliveryText')}</p>
      </details>
    </div>
  )
}

function Reviews({ slug, product }) {
  const { user } = useStore()
  const { t } = usePrefs()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ rating: 5, title: '', body: '' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api(`/api/products/${slug}/reviews`).then(setData).catch(() => {}) }, [slug])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/api/products/${slug}/reviews`, { method: 'POST', body: form })
      toast.success(t('product.reviewThanks'))
      setOpen(false)
      setForm({ rating: 5, title: '', body: '' })
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  if (!data) return null
  return (
    <section id="reviews" className="mt-20 scroll-mt-28 md:mt-28">
      <SectionHeader eyebrow={t('product.reviews')} title={data.count ? `${data.average.toFixed(1)} / 5` : t('product.noReviews')} />
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="card h-fit p-6">
          <Stars value={data.average} size={18} />
          <p className="mt-2 text-sm text-stone-450">{data.count === 1 ? t('product.basedOne') : t('product.basedOn', { n: data.count })}</p>
          <div className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-3 text-xs">
                <span className="w-3">{n}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bone-200"><div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${data.count ? (data.distribution[n] / data.count) * 100 : 0}%` }} /></div>
                <span className="w-5 text-right text-stone-450">{data.distribution[n]}</span>
              </div>
            ))}
          </div>
          {user ? <button onClick={() => setOpen(!open)} className="btn-outline mt-6 w-full">{t('product.writeReview')}</button>
            : <Link to={`/login?next=/product/${product.slug}`} className="btn-outline mt-6 w-full">{t('product.signInReview')}</Link>}
        </div>
        <div>
          {open && (
            <form onSubmit={submit} className="card mb-6 animate-fade-up space-y-4 p-6">
              <div className="flex gap-1" role="radiogroup" aria-label={t('product.rating')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} onClick={() => setForm({ ...form, rating: n })} aria-label={t('product.stars', { n })} className="p-1 transition hover:scale-125">
                    <span className={cls('text-2xl', n <= form.rating ? 'text-ink' : 'text-bone-400')}>★</span>
                  </button>
                ))}
              </div>
              <input className="field" placeholder={t('product.reviewTitle')} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="field min-h-[110px]" placeholder={t('product.reviewBody')} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <button className="btn-primary" disabled={busy}>{t('product.submitReview')}</button>
            </form>
          )}
          {data.items.length === 0 ? <p className="text-stone-450">{t('product.firstReview')}</p> : (
            <ul className="divide-y divide-ink/10">
              {data.items.map((r) => (
                <li key={r.id} className="py-5 first:pt-0">
                  <div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-stone-450">{date(r.created_at)}</span></div>
                  {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                  <p className="mt-1 text-ink-700">{r.body}</p>
                  <p className="mt-2 text-xs text-stone-450">{r.author_name}{r.verified_purchase && <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={12} className="ml-0.5" />{t('product.verifiedPurchase')}</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
