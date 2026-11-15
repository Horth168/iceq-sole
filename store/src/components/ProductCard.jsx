import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Heart } from 'lucide-react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { cls } from '../lib/format'
import { Badge, Img, Price, Reveal, useTilt } from './ui'
import QuickView from './QuickView'

export default function ProductCard({ product: p, priority = false, sizes, index = 0 }) {
  const { isWished, toggleWish } = useStore()
  const { t, pick } = usePrefs()
  const [quick, setQuick] = useState(false)
  const [pop, setPop] = useState(false)
  const tilt = useTilt(6)
  const wished = isWished(p.id)
  const name = pick(p, 'name')
  const label = !p.in_stock ? [t('card.soldOut'), 'bg-ink text-white']
    : p.discount_percent ? [t('card.off', { n: p.discount_percent }), 'bg-signal text-snow']
      : p.is_new_arrival ? [t('card.new'), 'bg-ice-300 text-night']
        : p.is_best_seller ? [t('card.bestSeller'), 'bg-white text-ink'] : null
  const heart = () => { setPop(true); setTimeout(() => setPop(false), 450); toggleWish(p) }

  return (
    <Reveal as="article" className="group relative" delay={Math.min(index, 4) * 60}>
      <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}
        className="tilt relative overflow-hidden rounded-2xl bg-bone-200 shadow-none transition-shadow duration-500 group-hover:shadow-lift">
        <Link to={`/product/${p.slug}`} aria-label={name} className="block">
          <div className="relative aspect-square">
            <Img image={p.image} alt={name} priority={priority} sizes={sizes || '(min-width:1280px) 22vw, (min-width:768px) 30vw, 48vw'}
              className={cls('absolute inset-0 transition duration-700 ease-out group-hover:scale-[1.06]', !p.in_stock && 'opacity-70')} />
            {p.hover_image && (
              <Img image={p.hover_image} alt="" className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 max-md:hidden" />
            )}
            <div className="tilt-glare pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-300 group-hover:opacity-100" />
          </div>
        </Link>
        {label && <Badge tone={label[1]} className="absolute left-3 top-3 shadow-sm">{label[0]}</Badge>}
        <button onClick={heart} aria-label={wished ? t('card.removeWish') : t('card.addWish')} aria-pressed={wished}
          className="absolute right-2.5 top-2.5 grid h-10 w-10 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:scale-110 hover:bg-white active:scale-90">
          <Heart size={18} className={cls('transition', wished ? 'fill-signal text-signal' : 'text-ink', pop && 'animate-pop')} />
        </button>
        <button onClick={() => setQuick(true)}
          className="absolute inset-x-3 bottom-3 hidden translate-y-3 items-center justify-center gap-2 rounded-full bg-white/95 py-3 text-sm font-semibold opacity-0 shadow-soft backdrop-blur transition duration-300 hover:bg-ink hover:text-white group-hover:translate-y-0 group-hover:opacity-100 md:flex">
          <Eye size={16} /> {t('card.quickView')}
        </button>
      </div>
      <div className="px-0.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="eyebrow keep-latin !text-[10px]">{p.brand.name}</p>
          {p.colors?.length > 1 && <p className="text-[11px] text-stone-450">{t('common.colours', { n: p.colors.length })}</p>}
        </div>
        <Link to={`/product/${p.slug}`} className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-snug hover:underline">{name}</Link>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Price price={p.price} sale={p.sale_price} />
          <div className="flex -space-x-1">
            {p.colors?.slice(0, 4).map((c) => (
              <span key={c.id} title={c.name} className="h-3.5 w-3.5 rounded-full border-2 border-bone ring-1 ring-ink/10" style={{ background: c.hex }} />
            ))}
          </div>
        </div>
        {p.in_stock && p.sizes?.length > 0 && (
          <p className="mt-1 truncate text-xs text-stone-450">{/^\d/.test(p.sizes[0] || '') ? 'EU ' : ''}{p.sizes.slice(0, 6).join(' · ')}{p.sizes.length > 6 ? ' …' : ''}</p>
        )}
        <button onClick={() => setQuick(true)} className="mt-2 text-xs font-semibold underline underline-offset-4 md:hidden">{t('card.quickAdd')}</button>
      </div>
      {quick && <QuickView slug={p.slug} onClose={() => setQuick(false)} />}
    </Reveal>
  )
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-square rounded-2xl" />
      <div className="skeleton mt-3 h-3 w-16" />
      <div className="skeleton mt-2 h-4 w-3/4" />
      <div className="skeleton mt-2 h-4 w-1/3" />
    </div>
  )
}

export function ProductGrid({ products, loading, count = 8, className = '' }) {
  return (
    <div className={cls('grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4', className)}>
      {loading
        ? Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} />)
        : products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} index={i % 4} />)}
    </div>
  )
}
