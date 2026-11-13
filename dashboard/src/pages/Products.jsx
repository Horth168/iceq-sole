import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Camera, Eye, EyeOff, Package, Plus, Star } from 'lucide-react'
import { usePrefs } from '../context/Prefs'
import { api, STORE_URL } from '../lib/api'
import { cls, usd2 } from '../lib/format'
import { Empty, PageHeader, Pagination, Pill, SearchInput, Thumb, useToast } from '../components/ui'

export default function Products() {
  const { t, pick } = usePrefs()
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
      <PageHeader title={t('products.title')} subtitle={data ? t('products.count', { n: data.total }) : ''} actions={<Link to="/products/new" className="btn-primary !min-h-[42px]"><Plus size={18} /> {t('products.new')}</Link>} />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-ink/5 p-4">
          <SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder={t('products.searchPh')} />
          <select value={q.brand_id || ''} onChange={(e) => set('brand_id', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">{t('products.allBrands')}</option>{meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={q.category_id || ''} onChange={(e) => set('category_id', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">{t('products.allCategories')}</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{pick(c, 'name')}</option>)}</select>
          <select value={q.status || ''} onChange={(e) => set('status', e.target.value)} className="field !min-h-[42px] !w-auto">
            <option value="">{t('products.anyStatus')}</option><option value="active">{t('products.visible')}</option><option value="hidden">{t('products.hidden')}</option><option value="low">{t('products.low')}</option><option value="out">{t('products.out')}</option><option value="needs_photo">{t('products.needsPhoto')}</option></select>
        </div>
        {!data ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
          : data.items.length === 0 ? <Empty icon={Package} title={t('products.none')} action={<Link to="/products/new" className="btn-primary">{t('products.addFirst')}</Link>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr>
                  <th className="px-5 py-3">{t('products.product')}</th><th className="px-3 py-3">{t('products.price')}</th><th className="px-3 py-3">{t('products.stock')}</th><th className="px-3 py-3">{t('products.labels')}</th><th className="px-3 py-3">{t('products.visible')}</th><th className="px-5 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-bone-100">
                      <td className="px-5 py-3"><Link to={`/products/${p.id}`} className="flex items-center gap-3">{p.image ? <Thumb src={p.image.thumb_url} /> : <span title={t('products.noPhoto')} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Camera size={18} /></span>}<span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="text-xs text-stone-450">{p.brand.name} · {pick(p.category, 'name')} · {t('products.variants', { n: p.variants.length })}</span></span></Link></td>
                      <td className="px-3 py-3 tabular-nums">{p.sale_price ? <><span className="font-semibold text-signal">{usd2(p.sale_price)}</span> <span className="text-xs text-stone-450 line-through">{usd2(p.price)}</span></> : usd2(p.price)}</td>
                      <td className="px-3 py-3"><Pill tone={p.total_available === 0 ? 'bg-rose-100 text-signal' : p.total_available < 10 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>{t('products.avail', { n: p.total_available })}</Pill></td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                        {['is_featured', 'is_best_seller', 'is_new_arrival', 'is_trending'].map((k) => (
                          <button key={k} onClick={() => flag(p, k)} className={cls('rounded-full px-2 py-0.5 text-[11px] font-semibold transition', p[k] ? 'bg-ink text-white' : 'bg-bone-200 text-stone-450 hover:bg-bone-300')}>{t(`products.flags.${k}`)}</button>
                        ))}</div></td>
                      <td className="px-3 py-3"><button onClick={() => flag(p, 'is_active')} aria-label={t('products.toggleVisibility')} className={cls('grid h-9 w-9 place-items-center rounded-full', p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-bone-200 text-stone-450')}>{p.is_active ? <Eye size={16} /> : <EyeOff size={16} />}</button></td>
                      <td className="px-5 py-3 text-right"><a href={`${STORE_URL}/product/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">{t('common.view')}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => set('page', String(n))} />}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-450"><Star size={12} /> {t('products.labelHint')}</p>
    </div>
  )
}
