// Colour / size / quantity selection + Add to bag, Buy now, Wishlist. Used by product page and Quick View.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, Heart, Ruler, ShieldCheck, Truck } from 'lucide-react'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { Rich, usePrefs } from '../context/Prefs'
import { cls, usd, sizeLabel } from '../lib/format'
import { Price, QtyStepper, Spinner, Stars } from './ui'
import { productColors } from '../lib/product'

export default function PurchasePanel({ product: p, colorId, onColorChange, compact = false, onAdded }) {
  const { addToCart, toggleWish, isWished, settings } = useStore()
  const { t, pick } = usePrefs()
  const toast = useToast()
  const navigate = useNavigate()
  const [sizeId, setSizeId] = useState(null)
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const actions = useRef(null)
  const sizeBox = useRef(null)

  const colors = useMemo(() => productColors(p), [p])
  const activeColor = colorId ?? colors[0]?.id
  const sizes = useMemo(() => p.variants.filter((v) => v.color_id === activeColor)
    .sort((a, b) => parseFloat(a.size) - parseFloat(b.size)), [p, activeColor])
  const variant = sizes.find((v) => v.size_id === sizeId)
  const colorName = colors.find((c) => c.id === activeColor)?.name
  const freeOver = settings?.delivery?.free_shipping_threshold
  const name = pick(p, 'name')

  // a one-size item (keychain, lace charm) has nothing to choose: pick it so "Buy now" works straight away
  const onlySize = sizes.length === 1 && sizes[0].available > 0 ? sizes[0].size_id : null
  useEffect(() => {
    setSizeId(onlySize)
    setQty(1); setError('')
  }, [activeColor, onlySize])
  useEffect(() => { if (variant && qty > variant.available) setQty(Math.max(1, variant.available)) }, [variant]) // eslint-disable-line

  // sticky mobile bar when the main buttons scroll out of view (product page only)
  useEffect(() => {
    if (compact || !actions.current || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
    io.observe(actions.current)
    return () => io.disconnect()
  }, [compact])

  const submit = async (buyNow) => {
    if (!variant) {
      setError(t('product.selectSizeError'))
      sizeBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(buyNow ? 'buy' : 'add')
    try {
      await addToCart(variant.id, qty, { silent: buyNow })
      if (buyNow) navigate('/checkout')
      else {
        setAdded(true)
        setTimeout(() => setAdded(false), 1600)
        toast.success(t('bag.added', { name, size: variant.size }))
        onAdded?.()
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const lowStock = variant && variant.available > 0 && variant.available <= 3
  const price = variant ? variant.price * qty : p.effective_price

  return (
    <div>
      <p className="eyebrow keep-latin">{p.brand.name}{p.model && p.model !== p.name ? ` · ${p.model}` : ''}</p>
      <h1 className={cls('mt-2 font-display font-extrabold leading-[1.05] tracking-tight', compact ? 'text-2xl' : 'text-3xl md:text-[40px]')}>{name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Price price={p.price} sale={p.sale_price} size="lg" />
        {p.discount_percent > 0 && <span className="rounded-full bg-signal/10 px-2.5 py-1 text-xs font-bold text-signal">{t('product.save', { n: p.discount_percent })}</span>}
        {p.rating_count > 0 && (
          <a href="#reviews" className="flex items-center gap-1.5 text-sm text-stone-450"><Stars value={p.rating_avg} size={13} /> {t('product.reviewsCount', { avg: p.rating_avg.toFixed(1), n: p.rating_count })}</a>
        )}
      </div>

      <div className="mt-7">
        <p className="mb-3 text-sm"><span className="font-semibold">{t('product.colour')}</span> <span className="text-stone-450">· {colorName}</span></p>
        <div className="flex flex-wrap gap-2.5">
          {colors.map((c) => {
            const any = p.variants.some((v) => v.color_id === c.id && v.available > 0)
            const on = c.id === activeColor
            return (
              <button key={c.id} onClick={() => onColorChange?.(c.id)} title={c.name} aria-label={c.name} aria-pressed={on}
                className={cls('relative grid h-11 w-11 place-items-center rounded-full border-2 transition duration-300', on ? 'scale-110 border-ink' : 'border-transparent hover:scale-105 hover:border-ink/30')}>
                <span className="h-8 w-8 rounded-full ring-1 ring-inset ring-ink/15" style={{ background: c.hex }} />
                {!any && <span className="absolute h-[2px] w-9 rotate-45 bg-ink/60" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6" ref={sizeBox}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{t('product.selectSize')} <span className="font-normal text-stone-450">(EU)</span></p>
          <details className="group relative text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-stone-450 hover:text-ink"><Ruler size={15} /> {t('product.sizeGuide')}</summary>
            <div className="absolute right-0 z-20 mt-2 w-64 animate-fade-up rounded-2xl bg-white p-4 text-xs shadow-lift">
              <p className="mb-2 font-semibold">{t('product.sizeGuideTitle')}</p>
              {[['38', '5.5', '24'], ['39', '6.5', '24.5'], ['40', '7', '25'], ['41', '8', '26'], ['42', '8.5', '26.5'], ['43', '9.5', '27.5'], ['44', '10', '28'], ['45', '11', '29']].map((r) => (
                <div key={r[0]} className="flex justify-between border-b border-ink/5 py-1 tabular-nums"><span>{sizeLabel(r[0])}</span><span>US {r[1]}</span><span>{r[2]} cm</span></div>
              ))}
              <p className="mt-2 text-stone-450">{t('product.sizeGuideNote')}</p>
            </div>
          </details>
        </div>
        <div className={cls('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-5', error && 'animate-[pop_.4s]')}>
          {sizes.map((v) => {
            const out = v.available <= 0
            const on = v.size_id === sizeId
            return (
              <button key={v.id} disabled={out} onClick={() => { setSizeId(v.size_id); setError('') }} aria-pressed={on}
                className={cls('relative h-12 rounded-xl border text-sm font-semibold tabular-nums transition duration-200',
                  on ? 'scale-[1.04] border-ink bg-ink text-white shadow-lift' : 'border-ink/15 bg-white hover:-translate-y-0.5 hover:border-ink',
                  out && 'cursor-not-allowed border-dashed bg-transparent text-stone-400 line-through hover:translate-y-0 hover:border-ink/15')}>
                {v.size}
                {v.available > 0 && v.available <= 2 && !on && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-signal" />}
              </button>
            )
          })}
        </div>
        {error && <p className="mt-2 animate-fade-in text-sm font-medium text-signal" role="alert">{error}</p>}
        <p className={cls('mt-3 h-5 text-sm', lowStock ? 'font-semibold text-signal' : 'text-stone-450')}>
          {variant ? (variant.available <= 0 ? t('product.soldOut') : lowStock ? t('product.onlyLeft', { n: variant.available, size: variant.size }) : t('product.inStock', { size: variant.size }))
            : sizes.every((v) => v.available <= 0) ? t('product.colourSoldOut') : ''}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <QtyStepper value={qty} onChange={setQty} max={Math.min(10, variant?.available || 10)} disabled={!variant} />
        <button onClick={() => toggleWish(p)} aria-label={t('nav.wishlist')} aria-pressed={isWished(p.id)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-ink/15 bg-white transition hover:scale-105 hover:border-ink active:scale-90">
          <Heart size={20} className={isWished(p.id) ? 'fill-signal text-signal' : ''} />
        </button>
      </div>
      <div ref={actions} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button className={cls('btn-primary w-full', added && '!bg-emerald-600 !text-snow')} onClick={() => submit(false)} disabled={!!busy || !p.in_stock}>
          {busy === 'add' ? <Spinner /> : added ? <><Check size={18} className="animate-pop" /> {t('product.addToBag')}</>
            : <>{t('product.addToBag')} {variant && <span className="opacity-60">· {usd(price)}</span>}</>}
        </button>
        <button className="btn-ice w-full" onClick={() => submit(true)} disabled={!!busy || !p.in_stock}>
          {busy === 'buy' ? <Spinner /> : t('product.buyNow')}
        </button>
      </div>

      {!compact && (
        <ul className="mt-7 space-y-3 rounded-2xl bg-white p-5 text-sm shadow-soft">
          <li className="flex gap-3"><Truck size={18} className="shrink-0 text-ice-600" />
            <span><Rich text={t('product.perksDelivery', { free: freeOver ? t('product.perksFree', { amount: usd(freeOver) }) : '' })} /></span></li>
          <li className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-ice-600" /><span><Rich text={t('product.perksPay')} /></span></li>
          <li className="flex gap-3"><Check size={18} className="shrink-0 text-ice-600" /><span><Rich text={t('product.perksExchange')} /></span></li>
        </ul>
      )}

      {!compact && showSticky && p.in_stock && createPortal(
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 animate-slide-up border-t border-ink/10 bg-bone/95 px-4 py-3 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="text-xs text-stone-450">{variant ? `${colorName} · ${sizeLabel(variant.size)}` : t('product.selectSize')}</p>
            </div>
            <button onClick={() => submit(false)} disabled={!!busy} className="btn-primary !min-h-[44px] shrink-0 !px-5 text-sm">
              {busy ? <Spinner className="h-4 w-4" /> : t('product.stickyAdd', { price: usd(price) })}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
