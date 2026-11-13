import { useEffect, useState } from 'react'
import { Check, Download, Image as ImageIcon, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { api, assetUrl, upload } from '../lib/api'
import { cls, date, usd2 } from '../lib/format'
import { Card, Empty, errMap, Field, Modal, PageHeader, Pill, Spinner, Toggle, useToast } from '../components/ui'

const toLocal = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

export default function Marketing() {
  const [tab, setTab] = useState('discounts')
  return (
    <div>
      <PageHeader title="Marketing" subtitle="Discount codes, homepage banners and newsletter subscribers." />
      <div className="mb-4 flex gap-2">{[['discounts', 'Discount codes'], ['banners', 'Homepage banners'], ['newsletter', 'Newsletter']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cls('chip', tab === k && 'chip-active')}>{l}</button>)}</div>
      {tab === 'discounts' && <Discounts />}
      {tab === 'banners' && <Banners />}
      {tab === 'newsletter' && <Newsletter />}
    </div>
  )
}

const BLANK_D = { code: '', description: '', type: 'percent', value: '', min_subtotal: 0, max_discount: '', usage_limit: '', starts_at: '', expires_at: '', is_active: true }

function Discounts() {
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
    try { await api(id ? `/api/admin/discounts/${id}` : '/api/admin/discounts', { method: id ? 'PUT' : 'POST', body }); toast.success('Discount saved'); setEdit(null); setErrors({}); load() } catch (err) { setErrors(errMap(err)); toast.error(err.message) }
  }
  const del = async (d) => { if (window.confirm(`Delete code ${d.code}?`)) { await api(`/api/admin/discounts/${d.id}`, { method: 'DELETE' }); load() } }
  const status = (d) => !d.is_active ? ['Off', 'bg-bone-200 text-stone-450'] : d.expires_at && new Date(d.expires_at) < new Date() ? ['Expired', 'bg-rose-100 text-signal']
    : d.usage_limit && d.used_count >= d.usage_limit ? ['Used up', 'bg-amber-100 text-amber-800'] : ['Active', 'bg-emerald-100 text-emerald-700']
  return (
    <Card pad={false} title="Discount codes" action={<button onClick={() => setEdit({ ...BLANK_D })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> New code</button>}>
      {!rows ? <div className="skeleton m-4 h-40" /> : rows.length === 0 ? <Empty title="No discount codes yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">Code</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Rules</th><th className="px-3 py-3">Used</th><th className="px-3 py-3">Status</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((d) => { const [l, t] = status(d); return (
                <tr key={d.id}>
                  <td className="px-5 py-3"><span className="font-mono font-bold">{d.code}</span><p className="text-xs text-stone-450">{d.description}</p></td>
                  <td className="px-3 py-3 font-semibold">{d.type === 'percent' ? `${d.value}%` : usd2(d.value)}{d.max_discount && <span className="block text-xs font-normal text-stone-450">max {usd2(d.max_discount)}</span>}</td>
                  <td className="px-3 py-3 text-xs">{d.min_subtotal > 0 ? `Min ${usd2(d.min_subtotal)}` : 'No minimum'}{d.expires_at && <span className="block">Until {date(d.expires_at)}</span>}</td>
                  <td className="px-3 py-3 tabular-nums">{d.used_count}{d.usage_limit ? ` / ${d.usage_limit}` : ''}</td>
                  <td className="px-3 py-3"><Pill tone={t}>{l}</Pill></td>
                  <td className="px-5 py-3 text-right"><button onClick={() => setEdit({ ...d, max_discount: d.max_discount ?? '', usage_limit: d.usage_limit ?? '', starts_at: toLocal(d.starts_at), expires_at: toLocal(d.expires_at) })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-bone" aria-label="Edit"><Pencil size={15} /></button></td>
                  <td className="pr-5"><button onClick={() => del(d)} className="grid h-9 w-9 place-items-center rounded-full text-signal hover:bg-rose-50" aria-label="Delete"><Trash2 size={15} /></button></td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit code' : 'New discount code'}>
        {edit && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" error={errors.code} className="sm:col-span-2"><input required className="field font-mono uppercase" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
            <Field label="Description" className="sm:col-span-2"><input className="field" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Type"><select className="field" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="percent">Percentage %</option><option value="fixed">Fixed amount $</option></select></Field>
            <Field label="Value" error={errors.value}><input required type="number" step="0.01" min="0.01" className="field" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></Field>
            <Field label="Minimum purchase ($)"><input type="number" step="0.01" min="0" className="field" value={edit.min_subtotal} onChange={(e) => setEdit({ ...edit, min_subtotal: e.target.value })} /></Field>
            <Field label="Max discount ($)" hint="Cap for % codes"><input type="number" step="0.01" min="0" className="field" value={edit.max_discount} onChange={(e) => setEdit({ ...edit, max_discount: e.target.value })} /></Field>
            <Field label="Usage limit" hint="Empty = unlimited"><input type="number" min="1" className="field" value={edit.usage_limit} onChange={(e) => setEdit({ ...edit, usage_limit: e.target.value })} /></Field>
            <div />
            <Field label="Starts"><input type="datetime-local" className="field" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
            <Field label="Expires" error={errors.body}><input type="datetime-local" className="field" value={edit.expires_at} onChange={(e) => setEdit({ ...edit, expires_at: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Active" /></div>
            <button className="btn-primary sm:col-span-2">Save code</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}

const BLANK_B = { placement: 'hero', eyebrow: '', title: '', subtitle: '', cta_label: 'Shop now', cta_link: '/shop', theme: 'dark', sort_order: 0, is_active: true }

function Banners() {
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
    if (!id && !files.image) { toast.error('Choose a banner image'); return }
    const fd = new FormData()
    fd.append('data', JSON.stringify({ ...data, sort_order: Number(data.sort_order) }))
    if (files.image) fd.append('image', files.image)
    if (files.mobile) fd.append('mobile_image', files.mobile)
    setProgress(0)
    try { await upload(id ? `/api/admin/banners/${id}` : '/api/admin/banners', fd, setProgress, id ? 'PUT' : 'POST'); toast.success('Banner saved'); setEdit(null); load() } catch (err) { toast.error(err.message) } finally { setProgress(null) }
  }
  const del = async (b) => { if (window.confirm('Delete this banner and its images?')) { await api(`/api/admin/banners/${b.id}`, { method: 'DELETE' }); load() } }
  const preview = (f, url) => (f ? URL.createObjectURL(f) : assetUrl(url))
  return (
    <Card pad={false} title="Homepage banners" action={<button onClick={() => open({ ...BLANK_B })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> New banner</button>}>
      {!rows ? <div className="skeleton m-4 h-40" /> : rows.length === 0 ? <Empty icon={ImageIcon} title="No banners" text="The homepage uses a built-in campaign until you add one." /> : (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
              <div className="relative aspect-[16/9] bg-ink"><img src={assetUrl(b.image_url)} alt="" className="h-full w-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-r from-ink/70 to-transparent p-4 text-white"><p className="text-[10px] uppercase tracking-widest text-ice-200">{b.eyebrow}</p><p className="whitespace-pre-line font-display text-lg font-extrabold uppercase leading-none">{b.title}</p></div></div>
              <div className="flex items-center justify-between p-3 text-sm">
                <span className="flex gap-2"><Pill>{b.placement}</Pill>{!b.is_active && <Pill tone="bg-rose-100 text-signal">Hidden</Pill>}</span>
                <span className="flex"><button onClick={() => open(b)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-bone" aria-label="Edit"><Pencil size={15} /></button><button onClick={() => del(b)} className="grid h-9 w-9 place-items-center rounded-full text-signal hover:bg-rose-50" aria-label="Delete"><Trash2 size={15} /></button></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit banner' : 'New banner'} wide>
        {edit && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Placement"><select className="field" value={edit.placement} onChange={(e) => setEdit({ ...edit, placement: e.target.value })}><option value="hero">Hero slider</option><option value="promo">Promo strip</option></select></Field>
            <Field label="Order"><input type="number" className="field" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            <Field label="Eyebrow"><input className="field" value={edit.eyebrow} onChange={(e) => setEdit({ ...edit, eyebrow: e.target.value })} maxLength={60} /></Field>
            <Field label="Title" hint="Use a new line for a line break"><textarea required className="field" rows={2} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} /></Field>
            <Field label="Subtitle" className="sm:col-span-2"><input className="field" value={edit.subtitle} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} maxLength={255} /></Field>
            <Field label="Button label"><input className="field" value={edit.cta_label} onChange={(e) => setEdit({ ...edit, cta_label: e.target.value })} /></Field>
            <Field label="Button link" hint="e.g. /shop?on_sale=true"><input className="field" value={edit.cta_link} onChange={(e) => setEdit({ ...edit, cta_link: e.target.value })} pattern="^(/|https://).*" /></Field>
            <Field label="Desktop image (16:9, min 1920px wide)">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setFiles({ ...files, image: e.target.files?.[0] })} />
              {(files.image || edit.image_url) && <img src={preview(files.image, edit.image_url)} alt="" className="mt-2 aspect-[16/9] w-full rounded-xl object-cover" />}
            </Field>
            <Field label="Mobile image (4:5, optional)">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setFiles({ ...files, mobile: e.target.files?.[0] })} />
              {(files.mobile || edit.mobile_image_url) && <img src={preview(files.mobile, edit.mobile_image_url)} alt="" className="mt-2 aspect-[4/5] w-40 rounded-xl object-cover" />}
            </Field>
            <div className="sm:col-span-2"><Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Show on homepage" /></div>
            {progress != null && <div className="h-2 overflow-hidden rounded-full bg-bone-200 sm:col-span-2"><div className="h-full bg-ice-500" style={{ width: `${progress}%` }} /></div>}
            <button className="btn-primary sm:col-span-2" disabled={progress != null}>{progress != null ? <Spinner /> : 'Save banner'}</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}

function Newsletter() {
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/admin/newsletter').then(setRows) }, [])
  const csv = () => {
    const blob = new Blob([['email,subscribed_at', ...rows.map((r) => `${r.email},${r.created_at}`)].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'iceq-newsletter.csv'; a.click()
  }
  return (
    <Card title={`Subscribers${rows ? ` (${rows.length})` : ''}`} action={rows?.length ? <button onClick={csv} className="btn-outline !min-h-[36px] text-sm"><Download size={15} /> Export CSV</button> : null}>
      {!rows ? <div className="skeleton h-32" /> : rows.length === 0 ? <p className="text-sm text-stone-450">No subscribers yet.</p> : (
        <ul className="divide-y divide-ink/5 text-sm">{rows.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.email}</span><span className="text-stone-450">{date(r.created_at)}</span></li>)}</ul>
      )}
    </Card>
  )
}

export function Reviews() {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const toast = useToast()
  const load = () => api('/api/admin/reviews', { query: { status } }).then(setRows)
  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line
  const patch = async (r, body) => { try { await api(`/api/admin/reviews/${r.id}`, { method: 'PATCH', body }); load() } catch (e) { toast.error(e.message) } }
  const del = async (r) => { if (window.confirm('Delete review?')) { await api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }); load() } }
  return (
    <div>
      <PageHeader title="Reviews" subtitle="Approve reviews before they appear. Featured reviews show on the homepage." />
      <div className="mb-4 flex gap-2">{[['pending', 'Pending'], ['approved', 'Approved'], ['all', 'All']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cls('chip', status === k && 'chip-active')}>{l}</button>)}</div>
      {!rows ? <div className="skeleton h-40" /> : rows.length === 0 ? <Card><Empty icon={Star} title="Nothing to moderate" /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-bone-300">{'★'.repeat(5 - r.rating)}</span></p><p className="mt-1 font-semibold">{r.title || 'Untitled'}</p></div>
                <span className="flex gap-1">{r.is_approved && <Pill tone="bg-emerald-100 text-emerald-700">Live</Pill>}{r.is_featured && <Pill tone="bg-ice-100 text-ice-700">Featured</Pill>}</span>
              </div>
              <p className="mt-2 text-sm text-ink-700">{r.body}</p>
              <p className="mt-3 text-xs text-stone-450">{r.author_name} on <b>{r.product?.name}</b> · {date(r.created_at)}{r.verified_purchase && ' · verified buyer'}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/5 pt-3">
                {r.is_approved ? <button onClick={() => patch(r, { is_approved: false })} className="btn-outline !min-h-[36px] text-sm"><X size={15} /> Unpublish</button>
                  : <button onClick={() => patch(r, { is_approved: true })} className="btn-primary !min-h-[36px] text-sm"><Check size={15} /> Approve</button>}
                <button onClick={() => patch(r, { is_featured: !r.is_featured, ...(r.is_featured ? {} : { is_approved: true }) })} className="btn-outline !min-h-[36px] text-sm"><Star size={15} /> {r.is_featured ? 'Unfeature' : 'Feature'}</button>
                <button onClick={() => del(r)} className="btn-ghost !min-h-[36px] text-sm text-signal"><Trash2 size={15} /> Delete</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
