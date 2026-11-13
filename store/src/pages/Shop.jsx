import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, SlidersHorizontal, X, SearchX } from 'lucide-react'
import { api } from '../lib/api'
import { cls } from '../lib/format'
import { ProductGrid } from '../components/ProductCard'
import { Drawer, EmptyState } from '../components/ui'

const PRESETS = {
  shop: { title: 'All sneakers', eyebrow: 'The full collection' },
  new: { title: 'New arrivals', eyebrow: 'Fresh this season', query: { new_arrival: true }, sort: 'newest' },
  best: { title: 'Best sellers', eyebrow: 'Customer favourites', query: { best_seller: true }, sort: 'best_selling' },
  sale: { title: 'Sale', eyebrow: 'Limited-time prices', query: { on_sale: true }, sort: 'discount' },
}
const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['best_selling', 'Best selling'], ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['discount', 'Biggest discount']]
const GENDERS = { men: 'Men', women: 'Women', unisex: 'Unisex', kids: 'Kids' }
const MULTI = ['brand', 'category', 'gender', 'size', 'color']

export default function Shop({ preset = 'shop' }) {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const cfg = PRESETS[preset] || PRESETS.shop
  const lockedBrand = preset === 'brand' ? slug : null
  const lockedCategory = preset === 'category' ? slug : null

  useEffect(() => { api('/api/products/filters').then(setMeta).catch(() => setMeta(null)) }, [])

  const query = useMemo(() => {
    const q = { ...(cfg.query || {}) }
    MULTI.forEach((k) => { const v = params.getAll(k); if (v.length) q[k] = v })
    ;['q', 'min_price', 'max_price', 'page'].forEach((k) => params.get(k) && (q[k] = params.get(k)))
    ;['in_stock', 'on_sale', 'featured'].forEach((k) => params.get(k) === 'true' && (q[k] = true))
    q.sort = params.get('sort') || cfg.sort || 'featured'
    if (lockedBrand) q.brand = [lockedBrand]
    if (lockedCategory) q.category = [lockedCategory]
    q.page_size = 24
    return q
  }, [params, preset, slug]) // eslint-disable-line

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true)
    api('/api/products', { query, signal: ctl.signal }).then((d) => { setData(d); setLoading(false) }).catch((e) => e.name !== 'AbortError' && setLoading(false))
    return () => ctl.abort()
  }, [query])

  const set = (key, value, multi = false) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (multi) {
      const cur = next.getAll(key)
      next.delete(key)
      ;(cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).forEach((x) => next.append(key, x))
    } else if (value === null || value === '' || value === false) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const setMany = (obj) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    Object.entries(obj).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }
  const clearAll = () => setParams(params.get('q') ? { q: params.get('q') } : {}, { replace: true })

  const title = lockedBrand ? meta?.brands.find((b) => b.slug === slug)?.name || 'Brand'
    : lockedCategory ? meta?.categories.find((c) => c.slug === slug)?.name || 'Category'
      : params.get('q') ? `“${params.get('q')}”` : cfg.title
  const active = [
    ...MULTI.flatMap((k) => params.getAll(k).map((v) => ({ k, v, label: k === 'gender' ? GENDERS[v] : k === 'size' ? `EU ${v}` : meta?.[k === 'category' ? 'categories' : `${k}s`]?.find((x) => x.slug === v || x.name === v)?.name || v }))),
    ...(params.get('min_price') || params.get('max_price') ? [{ k: 'price', label: `$${params.get('min_price') || 0} – $${params.get('max_price') || '∞'}` }] : []),
    ...(params.get('in_stock') ? [{ k: 'in_stock', label: 'In stock' }] : []),
    ...(params.get('on_sale') ? [{ k: 'on_sale', label: 'On sale' }] : []),
  ]
  const removeChip = (c) => {
    if (c.k === 'price') setMany({ min_price: null, max_price: null })
    else if (MULTI.includes(c.k)) set(c.k, c.v, true)
    else set(c.k, null)
  }

  const filters = meta && (
    <Filters meta={meta} params={params} set={set} setMany={setMany} lockedBrand={lockedBrand} lockedCategory={lockedCategory} />
  )

  return (
    <div className="container-x pt-6 md:pt-10">
      <nav className="mb-4 text-xs text-stone-450" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-ink">Home</Link> <span className="mx-1.5">/</span>
        {lockedBrand && <><Link to="/brands" className="hover:text-ink">Brands</Link> <span className="mx-1.5">/</span></>}
        <span className="text-ink">{title}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{lockedBrand ? 'Brand' : lockedCategory ? 'Category' : params.get('q') ? 'Search results' : cfg.eyebrow}</p>
          <h1 className="h-display mt-2 text-5xl sm:text-6xl lg:text-7xl">{title}</h1>
        </div>
        <p className="pb-2 text-sm text-stone-450">{data ? `${data.total} style${data.total === 1 ? '' : 's'}` : ' '}</p>
      </div>

      {/* toolbar */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 flex items-center gap-2 border-y border-ink/10 bg-bone/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-[72px] lg:mx-0 lg:rounded-full lg:border lg:px-3">
        <button onClick={() => setFiltersOpen(true)} className="chip lg:hidden"><SlidersHorizontal size={15} /> Filters{active.length ? ` (${active.length})` : ''}</button>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {active.map((c) => (
            <button key={c.k + (c.v || '')} onClick={() => removeChip(c)} className="chip chip-active shrink-0 !py-1.5">{c.label} <X size={13} /></button>
          ))}
          {active.length > 0 && <button onClick={clearAll} className="shrink-0 px-2 text-sm font-semibold underline underline-offset-4">Clear all</button>}
        </div>
        <label className="relative shrink-0">
          <span className="sr-only">Sort by</span>
          <select value={query.sort} onChange={(e) => set('sort', e.target.value)}
            className="h-10 appearance-none rounded-full border border-ink/10 bg-white pl-4 pr-9 text-sm font-semibold outline-none focus:border-ink">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
        </label>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{filters || <div className="skeleton h-96" />}</aside>
        <div>
          {!loading && data?.items.length === 0 ? (
            <EmptyState icon={SearchX} title="No sneakers found" text="Try removing a filter or searching for another model."
              action={<button onClick={clearAll} className="btn-primary">Clear filters</button>} />
          ) : (
            <ProductGrid products={data?.items || []} loading={loading && !data} count={12} className={cls('md:!grid-cols-3', loading && data && 'opacity-60 transition')} />
          )}
          {data && data.pages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              {Array.from({ length: data.pages }).map((_, i) => (
                <button key={i} onClick={() => { set('page', i + 1 === 1 ? null : String(i + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className={cls('grid h-11 w-11 place-items-center rounded-full text-sm font-semibold', data.page === i + 1 ? 'bg-ink text-white' : 'bg-white hover:bg-bone-200')}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} side="bottom" title="Filters">
        <div className="flex-1 overflow-y-auto px-5 py-4">{filters}</div>
        <div className="pb-safe grid grid-cols-2 gap-3 border-t border-ink/10 bg-white p-4">
          <button className="btn-outline" onClick={clearAll}>Clear</button>
          <button className="btn-primary" onClick={() => setFiltersOpen(false)}>Show {data?.total ?? ''} results</button>
        </div>
      </Drawer>
    </div>
  )
}

function Group({ title, children, open: initial = true }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className="border-b border-ink/10 py-5 first:pt-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-bold uppercase tracking-wider" aria-expanded={open}>
        {title}<ChevronDown size={16} className={cls('transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

function Check({ checked, onChange, label, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-[15px]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 rounded accent-ink" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-stone-450">{count}</span>}
    </label>
  )
}

function Filters({ meta, params, set, setMany, lockedBrand, lockedCategory }) {
  const [min, setMin] = useState(params.get('min_price') || '')
  const [max, setMax] = useState(params.get('max_price') || '')
  useEffect(() => { setMin(params.get('min_price') || ''); setMax(params.get('max_price') || '') }, [params])
  const applyPrice = (e) => { e.preventDefault(); setMany({ min_price: min, max_price: max }) }
  return (
    <div>
      <Group title="Availability">
        <Check checked={params.get('in_stock') === 'true'} onChange={(e) => set('in_stock', e.target.checked ? 'true' : null)} label="In stock only" />
        <Check checked={params.get('on_sale') === 'true'} onChange={(e) => set('on_sale', e.target.checked ? 'true' : null)} label="On sale" />
      </Group>
      {!lockedBrand && (
        <Group title="Brand">
          {meta.brands.map((b) => <Check key={b.id} checked={params.getAll('brand').includes(b.slug)} onChange={() => set('brand', b.slug, true)} label={b.name} count={b.product_count} />)}
        </Group>
      )}
      {!lockedCategory && (
        <Group title="Category">
          {meta.categories.map((c) => <Check key={c.id} checked={params.getAll('category').includes(c.slug)} onChange={() => set('category', c.slug, true)} label={c.name} count={c.product_count} />)}
        </Group>
      )}
      <Group title="Gender">
        {meta.genders.map((g) => <Check key={g} checked={params.getAll('gender').includes(g)} onChange={() => set('gender', g, true)} label={GENDERS[g]} />)}
      </Group>
      <Group title="Size (EU)">
        <div className="grid grid-cols-4 gap-2">
          {meta.sizes.map((s) => {
            const on = params.getAll('size').includes(s.label)
            return <button key={s.id} onClick={() => set('size', s.label, true)} aria-pressed={on}
              className={cls('h-11 rounded-xl border text-sm font-semibold transition', on ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white hover:border-ink')}>{s.label}</button>
          })}
        </div>
      </Group>
      <Group title="Colour">
        <div className="grid grid-cols-5 gap-3">
          {meta.colors.map((c) => {
            const on = params.getAll('color').includes(c.name)
            return (
              <button key={c.id} onClick={() => set('color', c.name, true)} title={c.name} aria-pressed={on} className="flex flex-col items-center gap-1">
                <span className={cls('h-9 w-9 rounded-full ring-1 ring-inset ring-ink/15 transition', on && 'ring-2 ring-ink ring-offset-2 ring-offset-bone')} style={{ background: c.hex }} />
                <span className="text-[10px] text-stone-450">{c.name}</span>
              </button>
            )
          })}
        </div>
      </Group>
      <Group title="Price (USD)">
        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} placeholder={`${Math.floor(meta.price.min)}`} aria-label="Minimum price" className="field !min-h-[44px] !px-3" />
          <span className="text-stone-450">–</span>
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} placeholder={`${Math.ceil(meta.price.max)}`} aria-label="Maximum price" className="field !min-h-[44px] !px-3" />
          <button className="btn-primary !min-h-[44px] !px-4 text-sm">Go</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {[[0, 80], [80, 120], [120, 160], [160, '']].map(([a, b]) => (
            <button key={a} type="button" className="chip !py-1.5 text-xs" onClick={() => setMany({ min_price: a ? String(a) : null, max_price: b ? String(b) : null })}>
              {b ? `$${a}–$${b}` : `$${a}+`}
            </button>
          ))}
        </div>
      </Group>
    </div>
  )
}
