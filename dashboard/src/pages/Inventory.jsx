import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { History, SlidersHorizontal, Warehouse } from 'lucide-react'
import { api } from '../lib/api'
import { cls, dateTime } from '../lib/format'
import { Card, Empty, Field, Modal, PageHeader, Pagination, Pill, SearchInput, Spinner, Stat, Thumb, useToast } from '../components/ui'
import { usePrefs } from '../context/Prefs'

const REASONS = ['adjustment', 'restock', 'returned', 'damaged']

export default function Inventory() {
  const { t } = usePrefs()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState('stock')
  const [data, setData] = useState(null)
  const [moves, setMoves] = useState(null)
  const [adj, setAdj] = useState(null)
  const [form, setForm] = useState({ mode: 'change', value: '', reason: 'restock', note: '' })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const q = Object.fromEntries(params)
  const load = () => api('/api/admin/inventory', { query: q }).then(setData).catch((e) => toast.error(e.message))
  useEffect(() => { if (view === 'stock') load(); else api('/api/admin/inventory/movements', { query: { page: q.page } }).then(setMoves) }, [params, view]) // eslint-disable-line
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setParams(n) }
  const submit = async (e) => {
    e.preventDefault()
    const v = parseInt(form.value, 10)
    if (Number.isNaN(v)) return
    setBusy(true)
    try {
      await api(`/api/admin/inventory/${adj.id}/adjust`, { method: 'POST', body: { [form.mode === 'set' ? 'set_to' : 'change']: v, reason: form.reason, note: form.note } })
      toast.success(t('inventory.updated')); setAdj(null); load()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle')} />
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label={t('inventory.onShelf')} value={data.summary.stock} icon={Warehouse} />
          <Stat label={t('inventory.reservedPending')} value={data.summary.reserved} tone="bg-amber-50 text-amber-700" icon={History} />
          <Stat label={t('inventory.lowStock', { n: data.threshold })} value={data.summary.low} tone="bg-rose-50 text-signal" icon={SlidersHorizontal} />
        </div>
      )}
      <div className="mb-4 flex gap-2">
        <button onClick={() => setView('stock')} className={cls('chip', view === 'stock' && 'chip-active')}>{t('inventory.levels')}</button>
        <button onClick={() => setView('moves')} className={cls('chip', view === 'moves' && 'chip-active')}>{t('inventory.history')}</button>
      </div>
      {view === 'stock' ? (
        <Card pad={false}>
          <div className="flex flex-wrap gap-2 border-b border-ink/5 p-4">
            <SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder={t('inventory.searchPh')} />
            {['', 'low', 'out', 'reserved'].map((k) => <button key={k} onClick={() => set('filter', k)} className={cls('chip', (q.filter || '') === k && 'chip-active')}>{t(`inventory.filters.${k || 'all'}`)}</button>)}
          </div>
          {!data ? <div className="skeleton m-4 h-60" /> : data.items.length === 0 ? <Empty icon={Warehouse} title={t('inventory.empty')} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">{t('inventory.variant')}</th><th className="px-3 py-3">{t('inventory.sku')}</th><th className="px-3 py-3 text-right">{t('inventory.shelf')}</th><th className="px-3 py-3 text-right">{t('inventory.reserved')}</th><th className="px-3 py-3 text-right">{t('inventory.available')}</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {data.items.map((v) => (
                    <tr key={v.id} className="hover:bg-bone-100">
                      <td className="px-5 py-2.5"><Link to={`/products/${v.product_id}`} className="flex items-center gap-3"><Thumb src={v.image} className="h-10 w-10" /><span><span className="block font-semibold">{v.product_name}</span><span className="text-xs text-stone-450"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full ring-1 ring-ink/20" style={{ background: v.color_hex }} />{v.color} · {t('common.eu', { size: v.size })}</span></span></Link></td>
                      <td className="px-3 py-2.5 font-mono text-xs">{v.sku}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{v.stock}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{v.reserved || '—'}</td>
                      <td className="px-3 py-2.5 text-right"><Pill tone={v.available === 0 ? 'bg-rose-100 text-signal' : v.low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>{v.available}</Pill></td>
                      <td className="px-5 py-2.5 text-right"><button onClick={() => { setAdj(v); setForm({ mode: 'change', value: '', reason: 'restock', note: '' }) }} className="btn-outline !min-h-[34px] !px-3 text-xs">{t('inventory.adjust')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => set('page', String(n))} />}
        </Card>
      ) : (
        <Card pad={false}>
          {!moves ? <div className="skeleton m-4 h-60" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">{t('inventory.when')}</th><th className="px-3 py-3">{t('inventory.variant')}</th><th className="px-3 py-3">{t('inventory.reason')}</th><th className="px-3 py-3 text-right">{t('inventory.stockDelta')}</th><th className="px-3 py-3 text-right">{t('inventory.reservedDelta')}</th><th className="px-3 py-3 text-right">{t('inventory.after')}</th><th className="px-5 py-3">{t('inventory.refBy')}</th></tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {moves.items.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs">{dateTime(m.created_at)}</td>
                      <td className="px-3 py-2.5"><span className="font-semibold">{m.product}</span><span className="block text-xs text-stone-450">{m.color} · {t('common.eu', { size: m.size })}</span></td>
                      <td className="px-3 py-2.5">{t(`inventory.reasons.${m.reason}`)}{m.note && <span className="block text-xs text-stone-450">{m.note}</span>}</td>
                      <td className={cls('px-3 py-2.5 text-right font-semibold tabular-nums', m.change > 0 ? 'text-emerald-700' : m.change < 0 ? 'text-signal' : 'text-stone-400')}>{m.change > 0 ? `+${m.change}` : m.change || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-450">{m.reserved_change > 0 ? `+${m.reserved_change}` : m.reserved_change || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.stock_after}</td>
                      <td className="px-5 py-2.5 text-xs">{m.reference}{m.user && <span className="block text-stone-450">{m.user}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={moves.page} pages={moves.pages} onChange={(n) => set('page', String(n))} />
            </div>
          )}
        </Card>
      )}
      <Modal open={!!adj} onClose={() => setAdj(null)} title={t('inventory.adjustTitle')}>
        {adj && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm"><b>{adj.product_name}</b> · {adj.color} · {t('common.eu', { size: adj.size })}<br /><span className="text-stone-450">{t('inventory.shelfReserved', { stock: adj.stock, reserved: adj.reserved })}</span></p>
            <div className="flex gap-2">{[['change', 'modeChange'], ['set', 'modeSet']].map(([k, l]) => <button type="button" key={k} onClick={() => setForm({ ...form, mode: k })} className={cls('chip', form.mode === k && 'chip-active')}>{t(`inventory.${l}`)}</button>)}</div>
            <Field label={form.mode === 'set' ? t('inventory.newQty') : t('inventory.change')} hint={form.mode === 'set' ? t('inventory.minHint', { n: adj.reserved }) : t('inventory.changeHint')}>
              <input required type="number" className="field" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} min={form.mode === 'set' ? adj.reserved : undefined} /></Field>
            <Field label={t('inventory.reason')}><select className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{REASONS.map((k) => <option key={k} value={k}>{t(`inventory.reasons.${k}`)}</option>)}</select></Field>
            <Field label={t('inventory.note')}><input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={255} placeholder={t('inventory.notePh')} /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : t('inventory.saveAdj')}</button>
          </form>
        )}
      </Modal>
    </div>
  )
}
