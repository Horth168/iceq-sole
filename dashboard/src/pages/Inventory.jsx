import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { History, SlidersHorizontal, Warehouse } from 'lucide-react'
import { api } from '../lib/api'
import { cls, dateTime } from '../lib/format'
import { Card, Empty, Field, Modal, PageHeader, Pagination, Pill, SearchInput, Spinner, Stat, Thumb, useToast } from '../components/ui'

const REASONS = [['adjustment', 'Count correction'], ['restock', 'Restock / delivery'], ['returned', 'Customer return'], ['damaged', 'Damaged / lost']]

export default function Inventory() {
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
      toast.success('Stock updated'); setAdj(null); load()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock per colour and size. Pending orders reserve pairs so you never oversell." />
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Pairs on shelf" value={data.summary.stock} icon={Warehouse} />
          <Stat label="Reserved by pending orders" value={data.summary.reserved} tone="bg-amber-50 text-amber-700" icon={History} />
          <Stat label={`Low stock (≤ ${data.threshold})`} value={data.summary.low} tone="bg-rose-50 text-signal" icon={SlidersHorizontal} />
        </div>
      )}
      <div className="mb-4 flex gap-2">
        <button onClick={() => setView('stock')} className={cls('chip', view === 'stock' && 'chip-active')}>Stock levels</button>
        <button onClick={() => setView('moves')} className={cls('chip', view === 'moves' && 'chip-active')}>Movement history</button>
      </div>
      {view === 'stock' ? (
        <Card pad={false}>
          <div className="flex flex-wrap gap-2 border-b border-ink/5 p-4">
            <SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder="Search product or SKU" />
            {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['reserved', 'Reserved']].map(([k, l]) => <button key={k} onClick={() => set('filter', k)} className={cls('chip', (q.filter || '') === k && 'chip-active')}>{l}</button>)}
          </div>
          {!data ? <div className="skeleton m-4 h-60" /> : data.items.length === 0 ? <Empty icon={Warehouse} title="Nothing here" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">Variant</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3 text-right">On shelf</th><th className="px-3 py-3 text-right">Reserved</th><th className="px-3 py-3 text-right">Available</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {data.items.map((v) => (
                    <tr key={v.id} className="hover:bg-bone-100">
                      <td className="px-5 py-2.5"><Link to={`/products/${v.product_id}`} className="flex items-center gap-3"><Thumb src={v.image} className="h-10 w-10" /><span><span className="block font-semibold">{v.product_name}</span><span className="text-xs text-stone-450"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full ring-1 ring-ink/20" style={{ background: v.color_hex }} />{v.color} · EU {v.size}</span></span></Link></td>
                      <td className="px-3 py-2.5 font-mono text-xs">{v.sku}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{v.stock}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{v.reserved || '—'}</td>
                      <td className="px-3 py-2.5 text-right"><Pill tone={v.available === 0 ? 'bg-rose-100 text-signal' : v.low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>{v.available}</Pill></td>
                      <td className="px-5 py-2.5 text-right"><button onClick={() => { setAdj(v); setForm({ mode: 'change', value: '', reason: 'restock', note: '' }) }} className="btn-outline !min-h-[34px] !px-3 text-xs">Adjust</button></td>
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
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">When</th><th className="px-3 py-3">Variant</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3 text-right">Stock Δ</th><th className="px-3 py-3 text-right">Reserved Δ</th><th className="px-3 py-3 text-right">After</th><th className="px-5 py-3">Ref / by</th></tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {moves.items.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs">{dateTime(m.created_at)}</td>
                      <td className="px-3 py-2.5"><span className="font-semibold">{m.product}</span><span className="block text-xs text-stone-450">{m.color} · EU {m.size}</span></td>
                      <td className="px-3 py-2.5 capitalize">{m.reason.replace(/_/g, ' ')}{m.note && <span className="block text-xs text-stone-450">{m.note}</span>}</td>
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
      <Modal open={!!adj} onClose={() => setAdj(null)} title="Adjust stock">
        {adj && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm"><b>{adj.product_name}</b> · {adj.color} · EU {adj.size}<br /><span className="text-stone-450">On shelf {adj.stock} · reserved {adj.reserved}</span></p>
            <div className="flex gap-2">{[['change', 'Add / remove'], ['set', 'Set exact count']].map(([k, l]) => <button type="button" key={k} onClick={() => setForm({ ...form, mode: k })} className={cls('chip', form.mode === k && 'chip-active')}>{l}</button>)}</div>
            <Field label={form.mode === 'set' ? 'New on-shelf quantity' : 'Change (use − to remove)'} hint={form.mode === 'set' ? `Cannot go below ${adj.reserved} reserved` : 'e.g. 6 or -2'}>
              <input required type="number" className="field" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} min={form.mode === 'set' ? adj.reserved : undefined} /></Field>
            <Field label="Reason"><select className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Note"><input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={255} placeholder="Supplier invoice #, reason…" /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Save adjustment'}</button>
          </form>
        )}
      </Modal>
    </div>
  )
}
