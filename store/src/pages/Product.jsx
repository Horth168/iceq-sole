import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Expand, PackageX, X } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { recentlyViewed } from '../lib/storage'
import { cls, date } from '../lib/format'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import PurchasePanel from '../components/PurchasePanel'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import { EmptyState, Img, SectionHeader, Stars, useLockBody } from '../components/ui'

export default function Product() {
  const { slug } = useParams()
  const [p, setP] = useState(null)
  const [missing, setMissing] = useState(false)
  const [colorId, setColorId] = useState(null)
  const [related, setRelated] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    setP(null); setMissing(false); setColorId(null); setRelated(null)
    api(`/api/products/${slug}`).then((d) => {
      setP(d)
      document.title = `${d.name} — IceQ Sole`
      const prev = recentlyViewed.list().filter((id) => id !== d.id)
      recentlyViewed.add(d.id)
      if (prev.length) api('/api/products', { query: { ids: prev.slice(0, 8).join(','), page_size: 8 } }).then((r) => setRecent(prev.map((id) => r.items.find((x) => x.id === id)).filter(Boolean))).catch(() => {})
      else setRecent([])
    }).catch(() => setMissing(true))
    api(`/api/products/${slug}/related`).then(setRelated).catch(() => setRelated([]))
    return () => { document.title = 'IceQ Sole — Premium Sneakers in Cambodia' }
  }, [slug])

  const images = useMemo(() => {
    if (!p) return []
    const forColor = p.images.filter((i) => i.color_id === (colorId ?? p.variants[0]?.color_id) || !i.color_id)
    return forColor.length ? forColor : p.images
  }, [p, colorId])

  if (missing) return <EmptyState icon={PackageX} title="Sneaker not found" text="It may have sold out or been removed." action={<Link to="/shop" className="btn-primary">Browse the shop</Link>} />

  return (
    <div className="container-x pt-4 md:pt-8">
      <nav className="mb-5 truncate text-xs text-stone-450" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-ink">Home</Link><span className="mx-1.5">/</span>
        <Link to="/shop" className="hover:text-ink">Shop</Link><span className="mx-1.5">/</span>
        {p && <><Link to={`/brands/${p.brand.slug}`} className="hover:text-ink">{p.brand.name}</Link><span className="mx-1.5">/</span><span className="text-ink">{p.name}</span></>}
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        {p ? <Gallery images={images} name={p.name} /> : <div className="skeleton aspect-square rounded-3xl" />}
        <div className="lg:sticky lg:top-28 lg:self-start">
          {p ? <PurchasePanel product={p} colorId={colorId} onColorChange={setColorId} /> : (
            <div className="space-y-4"><div className="skeleton h-4 w-24" /><div className="skeleton h-10 w-3/4" /><div className="skeleton h-8 w-32" /><div className="skeleton h-48" /></div>
          )}
          {p && <Details p={p} />}
        </div>
      </div>

      {p && <Reviews slug={slug} product={p} />}

      <section className="mt-20 md:mt-28">
        <SectionHeader eyebrow="You may also like" title="Related" />
        <Rail items={related} />
      </section>
      {recent.length > 0 && (
        <section className="mt-16 md:mt-24">
          <SectionHeader eyebrow="Pick up where you left off" title="Recently viewed" />
          <Rail items={recent} />
        </section>
      )}
    </div>
  )
}

function Rail({ items }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:gap-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
      {(items ?? Array.from({ length: 4 })).slice(0, 8).map((p, i) => (
        <div key={p?.id ?? i} className={cls('w-[64%] shrink-0 snap-start sm:w-[40%] lg:w-auto', i >= 4 && 'lg:hidden')}>
          {p ? <ProductCard product={p} /> : <ProductCardSkeleton />}
        </div>
      ))}
    </div>
  )
}

function Gallery({ images, name }) {
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [full, setFull] = useState(false)
  const track = useRef(null)
  useEffect(() => { setI(0); track.current?.scrollTo({ left: 0 }) }, [images])
  const cur = images[i]
  const onScroll = () => { const el = track.current; if (el) setI(Math.round(el.scrollLeft / el.clientWidth)) }
  const go = (n) => { const idx = (n + images.length) % images.length; setI(idx); track.current?.scrollTo({ left: idx * track.current.clientWidth, behavior: 'smooth' }) }

  return (
    <div className="lg:grid lg:grid-cols-[84px_1fr] lg:gap-4">
      <div className="no-scrollbar order-2 mt-3 hidden gap-3 lg:order-1 lg:mt-0 lg:flex lg:max-h-[680px] lg:flex-col lg:overflow-y-auto">
        {images.map((im, n) => (
          <button key={im.id} onClick={() => go(n)} aria-label={`Image ${n + 1}`}
            className={cls('aspect-square w-[84px] shrink-0 overflow-hidden rounded-xl border-2 transition', n === i ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100')}>
            <Img image={im} className="h-full w-full" sizes="84px" />
          </button>
        ))}
      </div>
      <div className="relative order-1 lg:order-2">
        {/* mobile: swipeable track */}
        <div ref={track} onScroll={onScroll} className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 sm:rounded-3xl lg:hidden">
          {images.map((im, n) => (
            <button key={im.id} onClick={() => { setI(n); setFull(true) }} className="aspect-square w-full shrink-0 snap-center" aria-label="Open full screen">
              <Img image={im} alt={im.alt || name} className="h-full w-full" sizes="100vw" priority={n === 0} />
            </button>
          ))}
        </div>
        {/* desktop: hover zoom */}
        <div className="relative hidden aspect-square cursor-zoom-in overflow-hidden rounded-3xl bg-bone-200 lg:block"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
          onMouseLeave={() => setZoom(null)} onClick={() => setFull(true)}>
          <Img image={cur} alt={cur?.alt || name} className="h-full w-full" sizes="(min-width:1024px) 50vw, 100vw" priority />
          {zoom && cur && (
            <div className="pointer-events-none absolute inset-0 bg-no-repeat"
              style={{ backgroundImage: `url(${assetUrl(cur.url)})`, backgroundSize: '220%', backgroundPosition: `${zoom.x}% ${zoom.y}%`, backgroundColor: '#EDEBE6' }} />
          )}
        </div>
        <button onClick={() => setFull(true)} aria-label="Full screen" className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow-soft backdrop-blur"><Expand size={18} /></button>
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 lg:hidden">
            {images.map((_, n) => <span key={n} className={cls('h-1.5 rounded-full transition-all', n === i ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25')} />)}
          </div>
        )}
      </div>
      {full && <Lightbox images={images} start={i} onClose={() => setFull(false)} name={name} />}
    </div>
  )
}

function Lightbox({ images, start, onClose, name }) {
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
    <div className="fixed inset-0 z-[95] flex animate-fade-in flex-col bg-bone-100" role="dialog" aria-modal="true" aria-label={`${name} images`}>
      <div className="pt-safe flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold tabular-nums">{i + 1} / {images.length}</span>
        <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-soft"><X size={20} /></button>
      </div>
      <div className="relative flex-1 overflow-hidden"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (scale === 1 && Math.abs(dx) > 50) setI((x) => (x + (dx < 0 ? 1 : -1) + images.length) % images.length) }}
        onDoubleClick={() => setScale((s) => (s === 1 ? 2.2 : 1))}>
        <img src={assetUrl(images[i].url)} alt={images[i].alt || name} className="h-full w-full object-contain transition-transform duration-300" style={{ transform: `scale(${scale})` }}
          onClick={() => setScale((s) => (s === 1 ? 2.2 : 1))} />
        {images.length > 1 && (
          <>
            <button onClick={() => setI((i - 1 + images.length) % images.length)} aria-label="Previous" className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white shadow-soft"><ChevronLeft /></button>
            <button onClick={() => setI((i + 1) % images.length)} aria-label="Next" className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white shadow-soft"><ChevronRight /></button>
          </>
        )}
      </div>
      <p className="pb-safe py-3 text-center text-xs text-stone-450">Tap or double-click to zoom · swipe to browse</p>
    </div>
  )
}

function Details({ p }) {
  const rows = [
    ['Brand', p.brand.name], ['Model', p.model || '—'], ['Category', p.category.name],
    ['For', { men: 'Men', women: 'Women', unisex: 'Unisex', kids: 'Kids' }[p.gender]],
    ['Colours', [...new Set(p.variants.map((v) => v.color))].join(', ')],
  ]
  return (
    <div className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
      <details open className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Description<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-700">{p.description || 'Details coming soon.'}</p>
      </details>
      <details className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Product details<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => <Fragment key={k}><dt className="text-stone-450">{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </details>
      <details className="group py-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Delivery & exchanges<span className="text-xl transition group-open:rotate-45">+</span></summary>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">Phnom Penh: same or next day. Provinces: 1–3 days via trusted couriers. Unworn pairs in original packaging can be exchanged within 7 days of delivery.</p>
      </details>
    </div>
  )
}

function Reviews({ slug, product }) {
  const { user } = useStore()
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
      const r = await api(`/api/products/${slug}/reviews`, { method: 'POST', body: form })
      toast.success(r.message)
      setOpen(false)
      setForm({ rating: 5, title: '', body: '' })
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  if (!data) return null
  return (
    <section id="reviews" className="mt-20 scroll-mt-28 md:mt-28">
      <SectionHeader eyebrow="Reviews" title={data.count ? `${data.average.toFixed(1)} / 5` : 'No reviews yet'} />
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="card h-fit p-6">
          <Stars value={data.average} size={18} />
          <p className="mt-2 text-sm text-stone-450">Based on {data.count} review{data.count === 1 ? '' : 's'}</p>
          <div className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-3 text-xs">
                <span className="w-3">{n}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bone-200"><div className="h-full rounded-full bg-ink" style={{ width: `${data.count ? (data.distribution[n] / data.count) * 100 : 0}%` }} /></div>
                <span className="w-5 text-right text-stone-450">{data.distribution[n]}</span>
              </div>
            ))}
          </div>
          {user ? (
            <button onClick={() => setOpen(!open)} className="btn-outline mt-6 w-full">Write a review</button>
          ) : (
            <Link to={`/login?next=/product/${product.slug}`} className="btn-outline mt-6 w-full">Sign in to review</Link>
          )}
        </div>
        <div>
          {open && (
            <form onSubmit={submit} className="card mb-6 space-y-4 p-6">
              <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} onClick={() => setForm({ ...form, rating: n })} aria-label={`${n} stars`} className="p-1">
                    <span className={cls('text-2xl', n <= form.rating ? 'text-ink' : 'text-bone-400')}>★</span>
                  </button>
                ))}
              </div>
              <input className="field" placeholder="Title" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="field min-h-[110px]" placeholder="How do they fit and feel?" maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <button className="btn-primary" disabled={busy}>Submit review</button>
            </form>
          )}
          {data.items.length === 0 ? <p className="text-stone-450">Be the first to review this pair.</p> : (
            <ul className="divide-y divide-ink/10">
              {data.items.map((r) => (
                <li key={r.id} className="py-5 first:pt-0">
                  <div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-stone-450">{date(r.created_at)}</span></div>
                  {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                  <p className="mt-1 text-ink-700">{r.body}</p>
                  <p className="mt-2 text-xs text-stone-450">{r.author_name}{r.verified_purchase && ' · ✓ Verified purchase'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
