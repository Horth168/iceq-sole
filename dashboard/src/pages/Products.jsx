import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Package, Plus, Star } from 'lucide-react'
import { api, STORE_URL } from '../lib/api'
import { cls, usd2 } from '../lib/format'
import { Empty, PageHeader, Pagination, Pill, SearchInput, Thumb, useToast } from '../components/ui'

export default function Products() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [meta, setMeta] = useState({ brands: [], categories: [] })
  const toast = useToast()
  const q = Object.fromEntries(params)
  const load = () => api('/api/admin/products', { query: { ...q, page_size: 25 } }).then(setData).catch((e) => toast.error(e.message))
  useEffect(() => { load() }, [params]) // eslint-disable-line
  useEffect(() => { Promise.all([api('/api/admin/brands'), api('/api/admin/categories')]).then(([brands, categories]) => setMeta({ brands, categories })) }, [])
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setParams(n) }
  const flag = async (p, key) => {
    try { await api(`/api/admin/products/${p.id}/flags`, { method: 'PATCH', body: { [key]: !p[key] } }); load() } catch (e) { toast.error(e.message) }
  }
  return (
    <div>
      <PageHeader title="Products" subtitle={data ? `${data.total} products` : ''} actions={<Link to="/products/new" className="btn-primary !min-h-[42px]"><Plus size={18} /> New product</Link>} />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-ink/5 p-4">
          <SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder="Search name, model or SKU" />
          <select value={q.brand_id || ''} onChange={(e) => set('brand_id', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">All brands</option>{meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={q.category_id || ''} onChange={(e) => set('category_id', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">All categories</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={q.status || ''} onChange={(e) => set('status', e.target.value)} className="field !min-h-[42px] !w-auto">
            <option value="">Any status</option><option value="active">Visible</option><option value="hidden">Hidden</option><option value="low">Low stock</option><option value="out">Has sold-out sizes</option></select>
        </div>
        {!data ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
          : data.items.length === 0 ? <Empty icon={Package} title="No products found" action={<Link to="/products/new" className="btn-primary">Add your first product</Link>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr>
                  <th className="px-5 py-3">Product</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3">Labels</th><th className="px-3 py-3">Visible</th><th className="px-5 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-bone-100">
                      <td className="px-5 py-3"><Link to={`/products/${p.id}`} className="flex items-center gap-3"><Thumb src={p.image?.thumb_url} /><span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="text-xs text-stone-450">{p.brand.name} · {p.category.name} · {p.variants.length} variants</span></span></Link></td>
                      <td className="px-3 py-3 tabular-nums">{p.sale_price ? <><span className="font-semibold text-signal">{usd2(p.sale_price)}</span> <span className="text-xs text-stone-450 line-through">{usd2(p.price)}</span></> : usd2(p.price)}</td>
                      <td className="px-3 py-3"><Pill tone={p.total_available === 0 ? 'bg-rose-100 text-signal' : p.total_available < 10 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>{p.total_available} avail.</Pill></td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                        {[['is_featured', 'Featured'], ['is_best_seller', 'Best'], ['is_new_arrival', 'New'], ['is_trending', 'Trend']].map(([k, l]) => (
                          <button key={k} onClick={() => flag(p, k)} className={cls('rounded-full px-2 py-0.5 text-[11px] font-semibold transition', p[k] ? 'bg-ink text-white' : 'bg-bone-200 text-stone-450 hover:bg-bone-300')}>{l}</button>
                        ))}</div></td>
                      <td className="px-3 py-3"><button onClick={() => flag(p, 'is_active')} aria-label="Toggle visibility" className={cls('grid h-9 w-9 place-items-center rounded-full', p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-bone-200 text-stone-450')}>{p.is_active ? <Eye size={16} /> : <EyeOff size={16} />}</button></td>
                      <td className="px-5 py-3 text-right"><a href={`${STORE_URL}/product/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => set('page', String(n))} />}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-450"><Star size={12} /> Click a label to toggle it — changes go live on the storefront immediately.</p>
    </div>
  )
}
