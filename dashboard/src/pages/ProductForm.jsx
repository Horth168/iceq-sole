import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Save, Star, Trash2, UploadCloud, X } from 'lucide-react'
import { api, assetUrl, STORE_URL, upload } from '../lib/api'
import { cls } from '../lib/format'
import { Card, errMap, Field, PageHeader, Spinner, Toggle, useToast } from '../components/ui'
import { usePrefs } from '../context/Prefs'

const EMPTY = { name: '', name_km: '', model: '', description: '', description_km: '', gender: 'unisex', price: '', sale_price: '', brand_id: '', category_id: '',
  is_active: true, is_featured: false, is_best_seller: false, is_new_arrival: true, is_trending: false }

export default function ProductForm() {
  const { t, pick } = usePrefs()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const [meta, setMeta] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [product, setProduct] = useState(null)
  const [colorIds, setColorIds] = useState([])
  const [sizeIds, setSizeIds] = useState([])
  const [stock, setStock] = useState({}) // "colorId-sizeId" -> {id, stock, sku, is_active}
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all(['brands', 'categories', 'colors', 'sizes'].map((k) => api(`/api/admin/${k}`)))
      .then(([brands, categories, colors, sizes]) => setMeta({ brands, categories, colors, sizes }))
  }, [])
  const hydrate = (p) => {
    setProduct(p)
    setForm({ name: p.name, name_km: p.name_km || '', model: p.model, description: p.description, description_km: p.description_km || '', gender: p.gender, price: p.price, sale_price: p.regular_sale_price ?? '',
      brand_id: p.brand_id, category_id: p.category_id, is_active: p.is_active, is_featured: p.is_featured, is_best_seller: p.is_best_seller,
      is_new_arrival: p.is_new_arrival, is_trending: p.is_trending })
    const s = {}
    p.variants.forEach((v) => { s[`${v.color_id}-${v.size_id}`] = { id: v.id, stock: v.stock, reserved: v.reserved, sku: v.sku, is_active: v.is_active } })
    setStock(s)
    setColorIds([...new Set(p.variants.map((v) => v.color_id))])
    setSizeIds([...new Set(p.variants.map((v) => v.size_id))])
  }
  useEffect(() => { if (!isNew) api(`/api/admin/products/${id}`).then(hydrate).catch((e) => toast.error(e.message)) }, [id]) // eslint-disable-line

  const sizesSorted = useMemo(() => (meta?.sizes || []).filter((s) => sizeIds.includes(s.id)), [meta, sizeIds])
  const colorsSel = useMemo(() => (meta?.colors || []).filter((c) => colorIds.includes(c.id)), [meta, colorIds])
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const toggleIn = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const setCell = (c, s, val) => setStock({ ...stock, [`${c}-${s}`]: { ...(stock[`${c}-${s}`] || {}), stock: Math.max(0, parseInt(val || '0', 10) || 0) } })
  const fillRow = (c) => { const v = prompt(t('form.fillPrompt'), '5'); if (v !== null) { const n = { ...stock }; sizeIds.forEach((s) => { n[`${c}-${s}`] = { ...(n[`${c}-${s}`] || {}), stock: Math.max(0, parseInt(v, 10) || 0) } }); setStock(n) } }

  const save = async (e) => {
    e.preventDefault()
    const variants = []
    colorIds.forEach((c) => sizeIds.forEach((s) => {
      const cell = stock[`${c}-${s}`] || {}
      variants.push({ ...(cell.id ? { id: cell.id } : {}), color_id: c, size_id: s, stock: cell.stock || 0, is_active: cell.is_active ?? true })
    }))
    if (!variants.length) { toast.error(t('form.needColourSize')); return }
    const body = { ...form, price: Number(form.price), sale_price: form.sale_price === '' ? null : Number(form.sale_price), brand_id: Number(form.brand_id), category_id: Number(form.category_id), variants }
    setBusy(true); setErrors({})
    try {
      const p = await api(isNew ? '/api/admin/products' : `/api/admin/products/${id}`, { method: isNew ? 'POST' : 'PUT', body })
      toast.success(isNew ? t('form.created') : t('form.productSaved'))
      if (isNew) navigate(`/products/${p.id}`, { replace: true }); else hydrate(p)
    } catch (err) { setErrors(errMap(err)); toast.error(err.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm(t('form.confirmDelete'))) return
    try { const r = await api(`/api/admin/products/${id}`, { method: 'DELETE' }); toast.success(r.archived ? r.message : t('form.deleted')); navigate('/products') } catch (e) { toast.error(e.message) }
  }

  if (!meta || (!isNew && !product)) return <div className="skeleton h-96" />
  return (
    <form onSubmit={save}>
      <PageHeader back={<Link to="/products" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-450 hover:text-ink"><ArrowLeft size={15} /> {t('nav.products')}</Link>}
        title={isNew ? t('form.newTitle') : product.name}
        actions={<>
          {!isNew && <a href={`${STORE_URL}/product/${product.slug}`} target="_blank" rel="noreferrer" className="btn-outline !min-h-[42px]">{t('form.viewInStore')}</a>}
          {!isNew && <button type="button" onClick={remove} className="btn-ghost !min-h-[42px] text-signal"><Trash2 size={16} /> {t('common.delete')}</button>}
          <button className="btn-primary !min-h-[42px]" disabled={busy}>{busy ? <Spinner /> : <Save size={16} />} {t('common.save')}</button>
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title={t('form.details')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('form.name')} error={errors.name} className="sm:col-span-2"><input required className="field" value={form.name} onChange={up('name')} placeholder={t('form.namePh')} /></Field>
              <Field label={t('form.nameKm')} hint={t('form.nameKmHint')} error={errors.name_km} className="sm:col-span-2"><input lang="km" className="field" value={form.name_km} onChange={up('name_km')} maxLength={200} /></Field>
              <Field label={t('form.model')} hint={t('form.modelHint')}><input className="field" value={form.model} onChange={up('model')} /></Field>
              <Field label={t('form.gender')}><select className="field" value={form.gender} onChange={up('gender')}>{['men', 'women', 'unisex', 'kids'].map((g) => <option key={g} value={g}>{t(`form.genders.${g}`)}</option>)}</select></Field>
              <Field label={t('form.brand')} error={errors.brand_id}><select required className="field" value={form.brand_id} onChange={up('brand_id')}><option value="">{t('common.choose')}</option>{meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label={t('form.category')} error={errors.category_id}><select required className="field" value={form.category_id} onChange={up('category_id')}><option value="">{t('common.choose')}</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{pick(c, 'name')}</option>)}</select></Field>
              <Field label={t('form.description')} className="sm:col-span-2"><textarea className="field min-h-[140px]" value={form.description} onChange={up('description')} /></Field>
              <Field label={t('form.descriptionKm')} hint={t('common.khmerHint')} className="sm:col-span-2"><textarea lang="km" className="field min-h-[140px]" value={form.description_km} onChange={up('description_km')} /></Field>
            </div>
          </Card>

          <Card title={t('form.stockCard')} action={<span className="text-xs text-stone-450">{t('form.stockHint')}</span>}>
            <p className="label">{t('form.colours')}</p>
            <div className="flex flex-wrap gap-2">
              {meta.colors.map((c) => (
                <button type="button" key={c.id} onClick={() => toggleIn(colorIds, setColorIds, c.id)} className={cls('chip !py-1.5', colorIds.includes(c.id) && 'chip-active')}>
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/20" style={{ background: c.hex }} />{c.name}</button>
              ))}
            </div>
            <p className="label mt-5">{t('form.sizes')}</p>
            <div className="flex flex-wrap gap-2">
              {meta.sizes.map((s) => <button type="button" key={s.id} onClick={() => toggleIn(sizeIds, setSizeIds, s.id)} className={cls('chip !px-3 !py-1.5', sizeIds.includes(s.id) && 'chip-active')}>{s.label}</button>)}
            </div>
            {colorsSel.length > 0 && sizesSorted.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="text-sm">
                  <thead><tr><th className="sticky left-0 bg-white px-2 py-2 text-left text-xs text-stone-450">{t('form.grid')}</th>{sizesSorted.map((s) => <th key={s.id} className="px-1 py-2 text-xs font-semibold">{s.label}</th>)}<th /></tr></thead>
                  <tbody>
                    {colorsSel.map((c) => (
                      <tr key={c.id}>
                        <td className="sticky left-0 whitespace-nowrap bg-white py-1 pr-3 font-semibold"><span className="mr-2 inline-block h-3 w-3 rounded-full ring-1 ring-ink/20" style={{ background: c.hex }} />{c.name}</td>
                        {sizesSorted.map((s) => {
                          const cell = stock[`${c.id}-${s.id}`] || {}
                          return (
                            <td key={s.id} className="p-1">
                              <input type="number" min={cell.reserved || 0} inputMode="numeric" aria-label={t('form.cellLabel', { color: c.name, size: s.label })} value={cell.stock ?? 0} onChange={(e) => setCell(c.id, s.id, e.target.value)}
                                className={cls('h-10 w-14 rounded-lg border text-center tabular-nums outline-none focus:border-ink', (cell.stock ?? 0) === 0 ? 'border-rose-200 bg-rose-50' : 'border-ink/15 bg-white')} />
                              {cell.reserved > 0 && <span className="block text-center text-[10px] text-amber-700">{t('form.reserved', { n: cell.reserved })}</span>}
                            </td>
                          )
                        })}
                        <td className="pl-2"><button type="button" onClick={() => fillRow(c.id)} className="text-xs font-semibold underline">{t('form.fill')}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-stone-450">{t('form.stockNote')}</p>
              </div>
            )}
          </Card>

          {isNew ? (
            <Card title={t('form.photos')}><p className="text-sm text-stone-450">{t('form.saveFirst')}</p></Card>
          ) : <ImageManager product={product} colors={colorsSel} onChange={(imgs) => setProduct({ ...product, images: imgs })} />}
        </div>

        <div className="space-y-6">
          <Card title={t('form.pricing')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.price')} error={errors.price}><input required type="number" min="0" step="0.01" className="field" value={form.price} onChange={up('price')} /></Field>
              <Field label={t('form.salePrice')} error={errors.sale_price} hint={t('form.saleHint')}><input type="number" min="0" step="0.01" className="field" value={form.sale_price} onChange={up('sale_price')} /></Field>
            </div>
            {form.price && form.sale_price !== '' && Number(form.sale_price) < Number(form.price) && (
              <p className="mt-3 text-sm font-semibold text-signal">{t('form.off', { n: Math.round((1 - form.sale_price / form.price) * 100) })}</p>
            )}
            {errors.body && <p className="mt-2 text-xs text-signal">{errors.body}</p>}
          </Card>
          <Card title={t('form.visibility')}>
            <div className="space-y-4">
              <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label={t('common.visibleInStore')} />
              <Toggle checked={form.is_featured} onChange={(v) => setForm({ ...form, is_featured: v })} label={t('form.featured')} />
              <Toggle checked={form.is_best_seller} onChange={(v) => setForm({ ...form, is_best_seller: v })} label={t('form.bestSeller')} />
              <Toggle checked={form.is_new_arrival} onChange={(v) => setForm({ ...form, is_new_arrival: v })} label={t('form.newArrival')} />
              <Toggle checked={form.is_trending} onChange={(v) => setForm({ ...form, is_trending: v })} label={t('form.trending')} />
            </div>
          </Card>
        </div>
      </div>
    </form>
  )
}

function ImageManager({ product, colors, onChange }) {
  const { t } = usePrefs()
  const toast = useToast()
  const [images, setImages] = useState(product.images)
  const [pending, setPending] = useState([]) // [{file, url}]
  const [color, setColor] = useState('')
  const [progress, setProgress] = useState(null)
  const [drag, setDrag] = useState(false)
  const input = useRef(null)
  useEffect(() => setImages(product.images), [product.images])
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []) // eslint-disable-line
  const commit = (imgs) => { setImages(imgs); onChange(imgs) }

  const pick = (files) => {
    const ok = [...files].filter((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast.error(t('images.badType', { name: f.name })); return false }
      if (f.size > 8 * 1024 * 1024) { toast.error(t('images.tooBig', { name: f.name })); return false }
      return true
    })
    setPending((p) => [...p, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 10))
  }
  const uploadAll = async () => {
    const fd = new FormData()
    pending.forEach((p) => fd.append('files', p.file))
    if (color) fd.append('color_id', color)
    setProgress(0)
    try {
      const created = await upload(`/api/admin/products/${product.id}/images`, fd, setProgress)
      commit([...images, ...created])
      pending.forEach((p) => URL.revokeObjectURL(p.url))
      setPending([])
      toast.success(t('images.uploaded', { n: created.length }))
    } catch (e) { toast.error(e.message) } finally { setProgress(null) }
  }
  const reorder = async (idx, dir) => {
    const next = [...images]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    try { commit(await api(`/api/admin/products/${product.id}/images-order`, { method: 'PUT', body: { image_ids: next.map((i) => i.id) } })) } catch (e) { toast.error(e.message) }
  }
  const makePrimary = async (img) => {
    const next = [img, ...images.filter((i) => i.id !== img.id)]
    try { commit(await api(`/api/admin/products/${product.id}/images-order`, { method: 'PUT', body: { image_ids: next.map((i) => i.id) } })); toast.success(t('images.mainUpdated')) } catch (e) { toast.error(e.message) }
  }
  const setImgColor = async (img, colorId) => {
    try { const r = await api(`/api/admin/products/${product.id}/images/${img.id}`, { method: 'PATCH', body: { color_id: colorId ? Number(colorId) : null } }); commit(images.map((i) => (i.id === img.id ? r : i))) } catch (e) { toast.error(e.message) }
  }
  const replace = async (img, file) => {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    setProgress(0)
    try { const r = await upload(`/api/admin/products/${product.id}/images/${img.id}/file`, fd, setProgress, 'PUT'); commit(images.map((i) => (i.id === img.id ? r : i))); toast.success(t('images.replaced')) } catch (e) { toast.error(e.message) } finally { setProgress(null) }
  }
  const setCredit = async (img, credit) => {
    if ((img.credit || '') === credit) return
    try { const r = await api(`/api/admin/products/${product.id}/images/${img.id}`, { method: 'PATCH', body: { credit } }); commit(images.map((i) => (i.id === img.id ? r : i))); toast.success(t('images.creditSaved')) } catch (e) { toast.error(e.message) }
  }
  const del = async (img) => {
    if (!window.confirm(t('images.confirmDelete'))) return
    try {
      await api(`/api/admin/products/${product.id}/images/${img.id}`, { method: 'DELETE' })
      const rest = images.filter((i) => i.id !== img.id).map((i, n) => ({ ...i, is_primary: n === 0 }))
      commit(rest)
      toast.success(t('images.deleted'))
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Card title={t('images.title', { n: images.length })} action={<span className="text-xs text-stone-450">{t('images.mainHint')}</span>}>
      <div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{t('images.policy')}</div>
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files) }}
        className={cls('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition', drag ? 'border-ice-500 bg-ice-50' : 'border-ink/15')}>
        <UploadCloud size={28} className="text-stone-450" />
        <p className="mt-2 text-sm"><button type="button" onClick={() => input.current?.click()} className="font-semibold underline">{t('images.choose')}</button> {t('images.drag')}</p>
        <p className="text-xs text-stone-450">{t('images.formats')}</p>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      </div>
      {pending.length > 0 && (
        <div className="mt-4 rounded-2xl bg-bone-100 p-4">
          <p className="mb-3 text-sm font-semibold">{t('images.ready', { n: pending.length })}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {pending.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.url} alt="" className="aspect-square w-full rounded-xl object-cover" />
                <button type="button" onClick={() => { URL.revokeObjectURL(p.url); setPending(pending.filter((_, n) => n !== i)) }} aria-label={t('common.remove')} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white shadow"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={color} onChange={(e) => setColor(e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">{t('images.allColours')}</option>{colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button type="button" onClick={uploadAll} disabled={progress != null} className="btn-primary !min-h-[42px]"><ImagePlus size={16} /> {t('images.upload', { n: pending.length })}</button>
          </div>
        </div>
      )}
      {progress != null && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-bone-200"><div className="h-full bg-ice-500 transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-stone-450">{t('images.uploading', { n: progress })}</p></div>}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <div key={img.id} className="group overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <div className="relative"><img src={assetUrl(img.thumb_url || img.url)} alt={img.alt} className="aspect-square w-full bg-bone-200 object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-night px-2 py-0.5 text-[10px] font-bold text-snow">{t('images.main')}</span>}
              <span className="absolute right-2 top-2 rounded-full bg-snow/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-night">{img.provider}</span></div>
            <div className="space-y-2 p-2">
              <select value={img.color_id || ''} onChange={(e) => setImgColor(img, e.target.value)} className="h-8 w-full rounded-lg border border-ink/10 bg-white px-2 text-xs" aria-label={t('images.photoColour')}><option value="">{t('images.allColours')}</option>{colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input key={`${img.id}-${img.credit}`} defaultValue={img.credit || ''} onBlur={(e) => setCredit(img, e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
                placeholder={t('common.photoCredit')} title={t('common.creditHint')} aria-label={t('common.photoCredit')} maxLength={300} className="h-8 w-full rounded-lg border border-ink/10 bg-white px-2 text-xs" />
              <div className="flex items-center justify-between">
                <div className="flex">
                  <button type="button" onClick={() => reorder(i, -1)} disabled={i === 0} aria-label={t('images.moveLeft')} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bone disabled:opacity-30"><ArrowLeft size={14} /></button>
                  <button type="button" onClick={() => reorder(i, 1)} disabled={i === images.length - 1} aria-label={t('images.moveRight')} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bone disabled:opacity-30"><ArrowRight size={14} /></button>
                </div>
                <div className="flex">
                  {i !== 0 && <button type="button" onClick={() => makePrimary(img)} aria-label={t('images.makeMain')} title={t('images.makeMain')} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bone"><Star size={14} /></button>}
                  <label title={t('images.replace')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg hover:bg-bone"><RefreshCw size={14} /><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => replace(img, e.target.files?.[0])} /></label>
                  <button type="button" onClick={() => del(img)} aria-label={t('images.del')} className="grid h-8 w-8 place-items-center rounded-lg text-signal hover:bg-rose-50"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
