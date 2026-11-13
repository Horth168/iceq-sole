import { useEffect, useState } from 'react'
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, upload } from '../lib/api'
import { cls } from '../lib/format'
import { Card, Field, Modal, PageHeader, Thumb, Toggle, useToast } from '../components/ui'
import { usePrefs } from '../context/Prefs'

const TABS = ['brands', 'categories', 'colors', 'sizes']
const BLANK = { brands: { name: '', description: '', is_active: true, sort_order: 0 }, categories: { name: '', name_km: '', description: '', is_active: true, sort_order: 0 },
  colors: { name: '', hex: '#000000', sort_order: 0 }, sizes: { label: '', system: 'EU', sort_order: 0 } }

export default function Catalog() {
  const { t, pick, lang } = usePrefs()
  const [tab, setTab] = useState('brands')
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const toast = useToast()
  const load = () => api(`/api/admin/${tab}`).then(setRows)
  useEffect(() => { setRows(null); load() }, [tab]) // eslint-disable-line
  const save = async (e) => {
    e.preventDefault()
    const { id, product_count, slug, logo_url, image_url, ...body } = edit // eslint-disable-line no-unused-vars
    try { await api(id ? `/api/admin/${tab}/${id}` : `/api/admin/${tab}`, { method: id ? 'PUT' : 'POST', body }); toast.success(t('common.saved')); setEdit(null); load() } catch (err) { toast.error(err.message) }
  }
  const del = async (r) => { if (!window.confirm(t('catalog.confirmDelete', { name: r.name || r.label }))) return; try { await api(`/api/admin/${tab}/${r.id}`, { method: 'DELETE' }); load() } catch (e) { toast.error(e.message) } }
  const img = async (r, file) => { if (!file) return; const fd = new FormData(); fd.append('file', file); try { await upload(`/api/admin/${tab}/${r.id}/image`, fd); toast.success(t('catalog.imageUpdated')); load() } catch (e) { toast.error(e.message) } }
  const isTax = tab === 'brands' || tab === 'categories'
  return (
    <div>
      <PageHeader title={t('catalog.title')} subtitle={t('catalog.subtitle')}
        actions={<button onClick={() => setEdit({ ...BLANK[tab] })} className="btn-primary !min-h-[42px]"><Plus size={16} /> {t('common.add')}</button>} />
      <div className="mb-4 flex gap-2">{TABS.map((k) => <button key={k} onClick={() => setTab(k)} className={cls('chip', tab === k && 'chip-active')}>{t(`catalog.tabs.${k}`)}</button>)}</div>
      <Card pad={false}>
        {!rows ? <div className="skeleton m-4 h-40" /> : (
          <ul className="divide-y divide-ink/5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                {isTax && <Thumb src={r.logo_url || r.image_url} className="h-12 w-12" />}
                {tab === 'colors' && <span className="h-8 w-8 rounded-full ring-1 ring-ink/15" style={{ background: r.hex }} />}
                <div className="min-w-0 flex-1"><p className="font-semibold">{r.name ? pick(r, 'name') : t('common.eu', { size: r.label })}{r.name_km && lang !== 'km' && <span className="ml-2 font-normal text-stone-450" lang="km">{r.name_km}</span>}</p>
                  <p className="text-xs text-stone-450">{isTax ? `${t('catalog.products', { n: r.product_count })} · /${r.slug}${r.is_active ? '' : ` · ${t('catalog.hidden')}`}` : tab === 'colors' ? r.hex : r.system}</p></div>
                {isTax && <label className="btn-ghost !min-h-[36px] cursor-pointer text-xs"><ImagePlus size={15} /> {tab === 'brands' ? t('catalog.logo') : t('catalog.image')}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => img(r, e.target.files?.[0])} /></label>}
                <button onClick={() => setEdit(r)} aria-label={t('common.edit')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-bone"><Pencil size={15} /></button>
                <button onClick={() => del(r)} aria-label={t('common.delete')} className="grid h-9 w-9 place-items-center rounded-full text-signal hover:bg-rose-50"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('common.add')}>
        {edit && (
          <form onSubmit={save} className="space-y-4">
            {'name' in edit && <Field label={t('common.name')}><input required className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>}
            {tab === 'categories' && <Field label={t('catalog.nameKm')} hint={t('common.khmerHint')}><input lang="km" className="field" value={edit.name_km || ''} onChange={(e) => setEdit({ ...edit, name_km: e.target.value })} maxLength={80} /></Field>}
            {'label' in edit && <Field label={t('catalog.sizeLabel')} hint={t('catalog.sizeHint')}><input required className="field" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>}
            {'hex' in edit && <Field label={t('catalog.colour')}><div className="flex gap-3"><input type="color" value={edit.hex} onChange={(e) => setEdit({ ...edit, hex: e.target.value.toUpperCase() })} className="h-12 w-16 rounded-xl" /><input className="field" value={edit.hex} onChange={(e) => setEdit({ ...edit, hex: e.target.value })} pattern="^#[0-9A-Fa-f]{6}$" /></div></Field>}
            {'description' in edit && <Field label={t('common.description')}><textarea className="field" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
            <Field label={t('common.sortOrder')}><input type="number" className="field" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: +e.target.value })} /></Field>
            {'is_active' in edit && <Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label={t('common.visibleInStore')} />}
            <button className="btn-primary w-full">{t('common.save')}</button>
          </form>
        )}
      </Modal>
    </div>
  )
}
