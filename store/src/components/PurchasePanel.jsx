// Colour / size / quantity selection + Add to bag, Buy now, Wishlist. Used by product page and Quick View.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Heart, Ruler, ShieldCheck, Truck } from 'lucide-react'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { cls, usd } from '../lib/format'
import { Price, QtyStepper, Spinner, Stars } from './ui'

export default function PurchasePanel({ product: p, colorId, onColorChange, compact = false, onAdded }) {
  const { addToCart, toggleWish, isWished, settings } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [sizeId, setSizeId] = useState(null)
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const colors = useMemo(() => {
    const m = new Map()
    p.variants.forEach((v) => m.set(v.color_id, { id: v.color_id, name: v.color, hex: v.color_hex }))
    return [...m.values()]
  }, [p])
  const activeColor = colorId ?? colors[0]?.id
  const sizes = useMemo(() => p.variants.filter((v) => v.color_id === activeColor)
    .sort((a, b) => parseFloat(a.size) - parseFloat(b.size)), [p, activeColor])
  const variant = sizes.find((v) => v.size_id === sizeId)
  const colorName = colors.find((c) => c.id === activeColor)?.name
  const freeOver = settings?.delivery?.free_shipping_threshold

  useEffect(() => { setSizeId(null); setQty(1); setError('') }, [activeColor])
  useEffect(() => { if (variant && qty > variant.available) setQty(Math.max(1, variant.available)) }, [variant]) // eslint-disable-line

  const submit = async (buyNow) => {
    if (!variant) { setError('Please select your size'); return }
    setBusy(buyNow ? 'buy' : 'add')
    try {
      await addToCart(variant.id, qty, { silent: buyNow })
      if (buyNow) navigate('/checkout')
      else { toast.success(`Added ${p.name} · EU ${variant.size}`); onAdded?.() }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const lowStock = variant && variant.available > 0 && variant.available <= 3

  return (
    <div>
      <p className="eyebrow">{p.brand.name}{p.model && p.model !== p.name ? ` · ${p.model}` : ''}</p>
      <h1 className={cls('mt-2 font-display font-extrabold leading-[1.02] tracking-tight', compact ? 'text-2xl' : 'text-3xl md:text-[40px]')}>{p.name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Price price={p.price} sale={p.sale_price} size="lg" />
        {p.discount_percent > 0 && <span className="rounded-full bg-signal/10 px-2.5 py-1 text-xs font-bold text-signal">Save {p.discount_percent}%</span>}
        {p.rating_count > 0 && (
          <a href="#reviews" className="flex items-center gap-1.5 text-sm text-stone-450"><Stars value={p.rating_avg} size={13} /> {p.rating_avg.toFixed(1)} ({p.rating_count})</a>
        )}
      </div>

      {/* colours */}
      <div className="mt-7">
        <p className="mb-3 text-sm"><span className="font-semibold">Colour</span> <span className="text-stone-450">· {colorName}</span></p>
        <div className="flex flex-wrap gap-2.5">
          {colors.map((c) => {
            const any = p.variants.some((v) => v.color_id === c.id && v.available > 0)
            return (
              <button key={c.id} onClick={() => onColorChange?.(c.id)} title={c.name} aria-label={c.name} aria-pressed={c.id === activeColor}
                className={cls('relative grid h-11 w-11 place-items-center rounded-full border-2 transition',
                  c.id === activeColor ? 'border-ink' : 'border-transparent hover:border-ink/30')}>
                <span className="h-8 w-8 rounded-full ring-1 ring-inset ring-ink/15" style={{ background: c.hex }} />
                {!any && <span className="absolute h-[2px] w-9 rotate-45 bg-ink/60" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* sizes */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Select size <span className="font-normal text-stone-450">(EU)</span></p>
          <details className="group relative text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-stone-450 hover:text-ink"><Ruler size={15} /> Size guide</summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl bg-white p-4 text-xs shadow-lift">
              <p className="mb-2 font-semibold">EU → US (men) → CM</p>
              {[['38', '5.5', '24'], ['39', '6.5', '24.5'], ['40', '7', '25'], ['41', '8', '26'], ['42', '8.5', '26.5'], ['43', '9.5', '27.5'], ['44', '10', '28'], ['45', '11', '29']].map((r) => (
                <div key={r[0]} className="flex justify-between border-b border-ink/5 py-1 tabular-nums"><span>EU {r[0]}</span><span>US {r[1]}</span><span>{r[2]} cm</span></div>
              ))}
              <p className="mt-2 text-stone-450">Sizing varies by brand. Message us if you're between sizes.</p>
            </div>
          </details>
        </div>
        <div className={cls('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-5')}>
          {sizes.map((v) => {
            const out = v.available <= 0
            return (
              <button key={v.id} disabled={out} onClick={() => { setSizeId(v.size_id); setError('') }}
                aria-pressed={v.size_id === sizeId}
                className={cls('relative h-12 rounded-xl border text-sm font-semibold tabular-nums transition',
                  v.size_id === sizeId ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white hover:border-ink',
                  out && 'cursor-not-allowed border-dashed bg-transparent text-stone-400 line-through hover:border-ink/15')}>
                {v.size}
              </button>
            )
          })}
        </div>
        {error && <p className="mt-2 text-sm font-medium text-signal">{error}</p>}
        <p className={cls('mt-3 h-5 text-sm', lowStock ? 'font-semibold text-signal' : 'text-stone-450')}>
          {variant ? (variant.available <= 0 ? 'Sold out' : lowStock ? `Only ${variant.available} left in EU ${variant.size}` : `In stock · EU ${variant.size}`)
            : sizes.every((v) => v.available <= 0) ? 'This colour is sold out' : ''}
        </p>
      </div>

      {/* actions */}
      <div className="mt-4 flex items-center gap-3">
        <QtyStepper value={qty} onChange={setQty} max={Math.min(10, variant?.available || 10)} disabled={!variant} />
        <button onClick={() => toggleWish(p)} aria-label="Wishlist" aria-pressed={isWished(p.id)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-ink/15 bg-white transition hover:border-ink">
          <Heart size={20} className={isWished(p.id) ? 'fill-signal text-signal' : ''} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button className="btn-primary w-full" onClick={() => submit(false)} disabled={!!busy || !p.in_stock}>
          {busy === 'add' ? <Spinner /> : <>Add to bag {variant && <span className="opacity-60">· {usd((variant.price) * qty)}</span>}</>}
        </button>
        <button className="btn-ice w-full" onClick={() => submit(true)} disabled={!!busy || !p.in_stock}>
          {busy === 'buy' ? <Spinner /> : 'Buy now'}
        </button>
      </div>

      {!compact && (
        <ul className="mt-7 space-y-3 rounded-2xl bg-white p-5 text-sm shadow-soft">
          <li className="flex gap-3"><Truck size={18} className="shrink-0 text-ice-600" />
            <span><b>Delivery across Cambodia.</b> Phnom Penh same/next day{freeOver ? ` · free over ${usd(freeOver)}` : ''}.</span></li>
          <li className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-ice-600" />
            <span><b>Pay your way.</b> ABA KHQR, bank transfer or cash on delivery.</span></li>
          <li className="flex gap-3"><Check size={18} className="shrink-0 text-ice-600" />
            <span><b>Easy exchanges</b> on unworn pairs within 7 days.</span></li>
        </ul>
      )}
    </div>
  )
}
