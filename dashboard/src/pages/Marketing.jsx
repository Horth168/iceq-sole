import { useEffect, useState } from 'react'
import { Check, Download, Image as ImageIcon, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { api, assetUrl, upload } from '../lib/api'
import { cls, date, usd2 } from '../lib/format'
import { Card, Empty, errMap, Field, Modal, PageHeader, Pill, Spinner, Toggle, useToast } from '../components/ui'
import { Rich, usePrefs } from '../context/Prefs'

const toLocal = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

export default function Marketing() {
  const { t } = usePrefs()
  const [tab, setTab] = useState('discounts')
  return (
    <div>
      <PageHeader title={t('marketing.title')} subtitle={t('marketing.subtitle')} />
      <div className="mb-4 flex gap-2">{['discounts', 'banners', 'newsletter'].map((k) => <button key={k} onClick={() => setTab(k)} className={cls('chip', tab === k && 'chip-active')}>{t(`marketing.tabs.${k}`)}</button>)}</div>
      {tab === 'discounts' && <Discounts />}
      {tab === 'banners' && <Banners />}
      {tab === 'newsletter' && <Newsletter />}
    </div>
  )
}

const BLANK_D = { code: '', description: '', type: 'percent', value: '', min_subtotal: 0, max_discount: '', usage_limit: '', starts_at: '', expires_at: '', is_active: true }

function Discounts() {
  const { t } = usePrefs()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState({})
  const toast = useToast()
  const load = () => api('/api/admin/discounts').then(setRows)
  useEffect(() => { load() }, [])
  const save = async (e) => {
    e.preventDefault()
    const { id, used_count, created_at, ...b } = edit // eslint-disable-line no-unused-vars
    const body = { ...b, value: Number(b.value), min_subtotal: Number(b.min_subtotal || 0), max_discount: b.max_discount === '' || b.max_discount == null ? null : Number(b.max_discount),
      usage_limit: b.usage_limit === '' || b.usage_limit == null ? null : Number(b.usage_limit),
      starts_at: b.starts_at ? new Date(b.starts_at).toISOString() : null, expires_at: b.expires_at ? new Date(b.expires_at).toISOString() : null }
    try { await api(id ? `/api/admin/discounts/${id}` : '/api/admin/discounts', { method: id ? 'PUT' : 'POST', body }); toast.success(t('discounts.saved')); setEdit(null); setErrors({}); load() } catch (err) { setErrors(errMap(err)); toast.error(err.message) }
  }
  const del = async (d) => { if (window.confirm(t('discounts.confirmDelete', { code: d.code }))) { await api(`/api/admin/discounts/${d.id}`, { method: 'DELETE' }); load() } }
  const status = (d) => !d.is_active ? [t('discounts.off'), 'bg-bone-200 text-stone-450'] : d.expires_at && new Date(d.expires_at) < new Date() ? [t('discounts.expired'), 'bg-rose-100 text-signal']
    : d.usage_limit && d.used_count >= d.usage_limit ? [t('discounts.usedUp'), 'bg-amber-100 text-amber-800'] : [t('discounts.active'), 'bg-emerald-100 text-emerald-700']
  return (
    <Card pad={false} title={t('discounts.title')} action={<button onClick={() => setEdit({ ...BLANK_D })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> {t('discounts.new')}</button>}>
      {!rows ? <div className="skeleton m-4 h-40" /> : rows.length === 0 ? <Empty title={t('discounts.none')} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">{t('discounts.code')}</th><th className="px-3 py-3">{t('discounts.value')}</th><th className="px-3 py-3">{t('discounts.rules')}</th><th className="px-3 py-3">{t('discounts.used')}</th><th className="px-3 py-3">{t('discounts.status')}</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((d) => { const [l, tone] = status(d); return (
                <tr key={d.id}>
                  <td className="px-5 py-3"><span className="font-mono font-bold">{d.code}</span><p className="text-xs text-stone-450">{d.description}</p></td>
                  <td className="px-3 py-3 font-semibold">{d.type === 'percent' ? `${d.value}%` : usd2(d.value)}{d.max_discount && <span className="block text-xs font-normal text-stone-450">{t('discounts.max', { amount: usd2(d.max_discount) })}</span>}</td>
                  <td className="px-3 py-3 text-xs">{d.min_subtotal > 0 ? t('discounts.min', { amount: usd2(d.min_subtotal) }) : t('discounts.noMin')}{d.expires_at && <span className="block">{t('discounts.until', { date: date(d.expires_at) })}</span>}</td>
                  <td className="px-3 py-3 tabular-nums">{d.used_count}{d.usage_limit ? ` / ${d.usage_limit}` : ''}</td>
                  <td className="px-3 py-3"><Pill tone={tone}>{l}</Pill></td>
                  <td className="px-5 py-3 text-right"><button onClick={() => setEdit({ ...d, max_discount: d.max_discount ?? '', usage_limit: d.usage_limit ?? '', starts_at: toLocal(d.starts_at), expires_at: toLocal(d.expires_at) })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-bone" aria-label={t('common.edit')}><Pencil size={15} /></button></td>
                  <td className="pr-5"><button onClick={() => del(d)} className="grid h-9 w-9 place-items-center rounded-full text-signal hover:bg-rose-50" aria-label={t('common.delete')}><Trash2 size={15} /></button></td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('discounts.edit') : t('discounts.newTitle')}>
        {edit && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label={t('discounts.code')} error={errors.code} className="sm:col-span-2"><input required className="field font-mono uppercase" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
            <Field label={t('common.description')} className="sm:col-span-2"><input className="field" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label={t('discounts.type')}><select className="field" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="percent">{t('discounts.percent')}</option><option value="fixed">{t('discounts.fixed')}</option></select></Field>
            <Field label={t('discounts.value')} error={errors.value}><input required type="number" step="0.01" min="0.01" className="field" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></Field>
            <Field label={t('discounts.minPurchase')}><input type="number" step="0.01" min="0" className="field" value={edit.min_subtotal} onChange={(e) => setEdit({ ...edit, min_subtotal: e.target.value })} /></Field>
            <Field label={t('discounts.maxDiscount')} hint={t('discounts.maxHint')}><input type="number" step="0.01" min="0" className="field" value={edit.max_discount} onChange={(e) => setEdit({ ...edit, max_discount: e.target.value })} /></Field>
            <Field label={t('discounts.limit')} hint={t('discounts.limitHint')}><input type="number" min="1" className="field" value={edit.usage_limit} onChange={(e) => setEdit({ ...edit, usage_limit: e.target.value })} /></Field>
            <div />
            <Field label={t('discounts.starts')}><input type="datetime-local" className="field" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
            <Field label={t('discounts.expires')} error={errors.body}><input type="datetime-local" className="field" value={edit.expires_at} onChange={(e) => setEdit({ ...edit, expires_at: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label={t('discounts.active')} /></div>
            <button className="btn-primary sm:col-span-2">{t('discounts.saveCode')}</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}

const BLANK_B = { placement: 'hero', eyebrow: '', title: '', subtitle: '', cta_label: 'Shop now', eyebrow_km: '', title_km: '', subtitle_km: '', cta_label_km: '',
  image_credit: '', cta_link: '/shop', theme: 'dark', sort_order: 0, is_active: true }

function Banners() {
  const { t, pick } = usePrefs()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [files, setFiles] = useState({})
  const [progress, setProgress] = useState(null)
  const toast = useToast()
  const load = () => api('/api/admin/banners').then(setRows)
  useEffect(() => { load() }, [])
  const open = (b) => { setFiles({}); setEdit(b) }
  const save = async (e) => {
    e.preventDefault()
    const { id, image_url, mobile_image_url, ...data } = edit // eslint-disable-line no-unused-vars
    if (!id && !files.image) { toast.error(t('banners.chooseImage')); return }
    const fd = new FormData()
    fd.append('data', JSON.stringify({ ...data, sort_order: Number(data.sort_order) }))
    if (files.image) fd.append('image', files.image)
    if (files.mobile) fd.append('mobile_image', files.mobile)
    setProgress(0)
    try { await upload(id ? `/api/admin/banners/${id}` : '/api/admin/banners', fd, setProgress, id ? 'PUT' : 'POST'); toast.success(t('banners.saved')); setEdit(null); load() } catch (err) { toast.error(err.message) } finally { setProgress(null) }
  }
  const del = async (b) => { if (window.confirm(t('banners.confirmDelete'))) { await api(`/api/admin/banners/${b.id}`, { method: 'DELETE' }); load() } }
  const preview = (f, url) => (f ? URL.createObjectURL(f) : assetUrl(url))
  return (
    <Card pad={false} title={t('banners.title')} action={<button onClick={() => open({ ...BLANK_B })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> {t('banners.new')}</button>}>
      {!rows ? <div className="skeleton m-4 h-40" /> : rows.length === 0 ? <Empty icon={ImageIcon} title={t('banners.none')} text={t('banners.noneText')} /> : (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
              <div className="relative aspect-[16/9] bg-night"><img src={assetUrl(b.image_url)} alt="" className="h-full w-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-r from-night/70 to-transparent p-4 text-snow"><p className="text-[10px] uppercase tracking-widest text-ice-200">{pick(b, 'eyebrow')}</p><p className="whitespace-pre-line font-display text-lg font-extrabold uppercase leading-none">{pick(b, 'title')}</p></div>
                {b.image_credit && <span className="absolute bottom-2 right-2 rounded-full bg-night/50 px-2 py-0.5 text-[10px] text-snow/80">{b.image_credit}</span>}</div>
              <div className="flex items-center justify-between p-3 text-sm">
                <span className="flex gap-2"><Pill>{b.placement}</Pill>{!b.is_active && <Pill tone="bg-rose-100 text-signal">{t('banners.hidden')}</Pill>}</span>
                <span className="flex"><button onClick={() => open(b)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-bone" aria-label={t('common.edit')}><Pencil size={15} /></button><button onClick={() => del(b)} className="grid h-9 w-9 place-items-center rounded-full text-signal hover:bg-rose-50" aria-label={t('common.delete')}><Trash2 size={15} /></button></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('banners.edit') : t('banners.newTitle')} wide>
        {edit && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label={t('banners.placement')}><select className="field" value={edit.placement} onChange={(e) => setEdit({ ...edit, placement: e.target.value })}><option value="hero">{t('banners.hero')}</option><option value="promo">{t('banners.promo')}</option></select></Field>
            <Field label={t('banners.order')}><input type="number" className="field" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            <p className="eyebrow sm:col-span-2">{t('banners.english')}</p>
            <Field label={t('banners.eyebrow')}><input className="field" value={edit.eyebrow} onChange={(e) => setEdit({ ...edit, eyebrow: e.target.value })} maxLength={60} /></Field>
            <Field label={t('banners.title_')} hint={t('banners.titleHint')}><textarea required className="field" rows={2} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} /></Field>
            <Field label={t('banners.subtitle')} className="sm:col-span-2"><input className="field" value={edit.subtitle} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} maxLength={255} /></Field>
            <Field label={t('banners.button')}><input className="field" value={edit.cta_label} onChange={(e) => setEdit({ ...edit, cta_label: e.target.value })} /></Field>
            <div className="hidden sm:block" />
            <p className="eyebrow mt-2 sm:col-span-2">{t('banners.khmer')} · <span className="normal-case tracking-normal">{t('common.khmerHint')}</span></p>
            <Field label={t('banners.eyebrow')}><input lang="km" className="field" value={edit.eyebrow_km || ''} onChange={(e) => setEdit({ ...edit, eyebrow_km: e.target.value })} maxLength={80} /></Field>
            <Field label={t('banners.title_')}><textarea lang="km" className="field" rows={2} value={edit.title_km || ''} onChange={(e) => setEdit({ ...edit, title_km: e.target.value })} maxLength={160} /></Field>
            <Field label={t('banners.subtitle')} className="sm:col-span-2"><input lang="km" className="field" value={edit.subtitle_km || ''} onChange={(e) => setEdit({ ...edit, subtitle_km: e.target.value })} maxLength={300} /></Field>
            <Field label={t('banners.button')}><input lang="km" className="field" value={edit.cta_label_km || ''} onChange={(e) => setEdit({ ...edit, cta_label_km: e.target.value })} maxLength={60} /></Field>
            <Field label={t('banners.link')} hint={t('banners.linkHint')}><input className="field" value={edit.cta_link} onChange={(e) => setEdit({ ...edit, cta_link: e.target.value })} pattern="^(/|https://).*" /></Field>
            <Field label={t('banners.desktop')}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setFiles({ ...files, image: e.target.files?.[0] })} />
              {(files.image || edit.image_url) && <img src={preview(files.image, edit.image_url)} alt="" className="mt-2 aspect-[16/9] w-full rounded-xl object-cover" />}
            </Field>
            <Field label={t('banners.mobile')}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setFiles({ ...files, mobile: e.target.files?.[0] })} />
              {(files.mobile || edit.mobile_image_url) && <img src={preview(files.mobile, edit.mobile_image_url)} alt="" className="mt-2 aspect-[4/5] w-40 rounded-xl object-cover" />}
            </Field>
            <Field label={t('common.photoCredit')} hint={t('banners.imagePolicy')} className="sm:col-span-2"><input className="field" value={edit.image_credit || ''} onChange={(e) => setEdit({ ...edit, image_credit: e.target.value })} maxLength={300} placeholder={t('common.creditHint')} /></Field>
            <div className="sm:col-span-2"><Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label={t('banners.show')} /></div>
            {progress != null && <div className="h-2 overflow-hidden rounded-full bg-bone-200 sm:col-span-2"><div className="h-full bg-ice-500" style={{ width: `${progress}%` }} /></div>}
            <button className="btn-primary sm:col-span-2" disabled={progress != null}>{progress != null ? <Spinner /> : t('banners.saveBanner')}</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}

function Newsletter() {
  const { t } = usePrefs()
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/admin/newsletter').then(setRows) }, [])
  const csv = () => {
    const blob = new Blob([['email,subscribed_at', ...rows.map((r) => `${r.email},${r.created_at}`)].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'iceq-newsletter.csv'; a.click()
  }
  return (
    <Card title={`${t('newsletter.title')}${rows ? ` (${rows.length})` : ''}`} action={rows?.length ? <button onClick={csv} className="btn-outline !min-h-[36px] text-sm"><Download size={15} /> {t('newsletter.export')}</button> : null}>
      {!rows ? <div className="skeleton h-32" /> : rows.length === 0 ? <p className="text-sm text-stone-450">{t('newsletter.none')}</p> : (
        <ul className="divide-y divide-ink/5 text-sm">{rows.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.email}</span><span className="text-stone-450">{date(r.created_at)}</span></li>)}</ul>
      )}
    </Card>
  )
}

export function Reviews() {
  const { t } = usePrefs()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const toast = useToast()
  const load = () => api('/api/admin/reviews', { query: { status } }).then(setRows)
  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line
  const patch = async (r, body) => { try { await api(`/api/admin/reviews/${r.id}`, { method: 'PATCH', body }); load() } catch (e) { toast.error(e.message) } }
  const del = async (r) => { if (window.confirm(t('reviews.confirmDelete'))) { await api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }); load() } }
  return (
    <div>
      <PageHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
      <div className="mb-4 flex gap-2">{['pending', 'approved', 'all'].map((k) => <button key={k} onClick={() => setStatus(k)} className={cls('chip', status === k && 'chip-active')}>{t(`reviews.tabs.${k}`)}</button>)}</div>
      {!rows ? <div className="skeleton h-40" /> : rows.length === 0 ? <Card><Empty icon={Star} title={t('reviews.none')} /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-bone-300">{'★'.repeat(5 - r.rating)}</span></p><p className="mt-1 font-semibold">{r.title || t('reviews.untitled')}</p></div>
                <span className="flex gap-1">{r.is_approved && <Pill tone="bg-emerald-100 text-emerald-700">{t('reviews.live')}</Pill>}{r.is_featured && <Pill tone="bg-ice-100 text-ice-700">{t('reviews.featured')}</Pill>}</span>
              </div>
              <p className="mt-2 text-sm text-ink-700">{r.body}</p>
              <p className="mt-3 text-xs text-stone-450"><Rich text={t('reviews.on', { author: r.author_name, product: r.product?.name || '', date: date(r.created_at) })} />{r.verified_purchase && t('reviews.verified')}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/5 pt-3">
                {r.is_approved ? <button onClick={() => patch(r, { is_approved: false })} className="btn-outline !min-h-[36px] text-sm"><X size={15} /> {t('reviews.unpublish')}</button>
                  : <button onClick={() => patch(r, { is_approved: true })} className="btn-primary !min-h-[36px] text-sm"><Check size={15} /> {t('reviews.approve')}</button>}
                <button onClick={() => patch(r, { is_featured: !r.is_featured, ...(r.is_featured ? {} : { is_approved: true }) })} className="btn-outline !min-h-[36px] text-sm"><Star size={15} /> {r.is_featured ? t('reviews.unfeature') : t('reviews.feature')}</button>
                <button onClick={() => del(r)} className="btn-ghost !min-h-[36px] text-sm text-signal"><Trash2 size={15} /> {t('common.delete')}</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
