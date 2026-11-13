import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Heart } from 'lucide-react'
import { useStore } from '../context/Store'
import { cls } from '../lib/format'
import { Badge, Img, Price } from './ui'
import QuickView from './QuickView'

export default function ProductCard({ product: p, priority = false, sizes }) {
  const { isWished, toggleWish } = useStore()
  const [quick, setQuick] = useState(false)
  const wished = isWished(p.id)
  const label = !p.in_stock ? ['Sold out', 'bg-ink text-white']
    : p.discount_percent ? [`−${p.discount_percent}%`, 'bg-signal text-white']
      : p.is_new_arrival ? ['New', 'bg-ice-300 text-ink']
        : p.is_best_seller ? ['Best seller', 'bg-white text-ink'] : null

  return (
    <article className="group relative">
      <div className="relative overflow-hidden rounded-2xl bg-bone-200">
        <Link to={`/product/${p.slug}`} aria-label={p.name} className="block">
          <div className="relative aspect-square">
            <Img image={p.image} alt={p.name} priority={priority} sizes={sizes || '(min-width:1280px) 22vw, (min-width:768px) 30vw, 48vw'}
              className={cls('absolute inset-0 transition duration-700 group-hover:scale-[1.04]', !p.in_stock && 'opacity-70')} />
            {p.hover_image && (
              <Img image={p.hover_image} alt="" className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 max-md:hidden" />
            )}
          </div>
        </Link>
        {label && <Badge tone={label[1]} className="absolute left-3 top-3 shadow-sm">{label[0]}</Badge>}
        <button
          onClick={() => toggleWish(p)}
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wished}
          className="absolute right-2.5 top-2.5 grid h-10 w-10 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:scale-105 hover:bg-white">
          <Heart size={18} className={cls('transition', wished ? 'fill-signal text-signal' : 'text-ink')} />
        </button>
        <button
          onClick={() => setQuick(true)}
          className="absolute inset-x-3 bottom-3 hidden translate-y-3 items-center justify-center gap-2 rounded-full bg-white/95 py-3 text-sm font-semibold opacity-0 shadow-soft backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:flex">
          <Eye size={16} /> Quick view
        </button>
      </div>
      <div className="px-0.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="eyebrow !text-[10px]">{p.brand.name}</p>
          {p.colors?.length > 1 && <p className="text-[11px] text-stone-450">{p.colors.length} colours</p>}
        </div>
        <Link to={`/product/${p.slug}`} className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-snug hover:underline">{p.name}</Link>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Price price={p.price} sale={p.sale_price} />
          <div className="flex -space-x-1">
            {p.colors?.slice(0, 4).map((c) => (
              <span key={c.id} title={c.name} className="h-3.5 w-3.5 rounded-full border-2 border-bone ring-1 ring-ink/10" style={{ background: c.hex }} />
            ))}
          </div>
        </div>
        {p.in_stock && p.sizes?.length > 0 && (
          <p className="mt-1 truncate text-xs text-stone-450">EU {p.sizes.slice(0, 6).join(' · ')}{p.sizes.length > 6 ? ' …' : ''}</p>
        )}
        <button onClick={() => setQuick(true)} className="mt-2 text-xs font-semibold underline underline-offset-4 md:hidden">Quick add</button>
      </div>
      {quick && <QuickView slug={p.slug} onClose={() => setQuick(false)} />}
    </article>
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
        : products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  )
}
