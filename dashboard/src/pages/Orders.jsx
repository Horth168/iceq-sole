import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ExternalLink, Printer, ShoppingCart, Truck, XCircle } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { cls, dateTime, khr, PAYMENT_METHOD, PAYMENT_STATUS, STATUS, usd2 } from '../lib/format'
import { Card, Empty, Field, Modal, PageHeader, Pagination, Pill, SearchInput, Spinner, Thumb, useToast } from '../components/ui'

export function Orders() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const toast = useToast()
  const navigate = useNavigate()
  const q = Object.fromEntries(params)
  useEffect(() => { api('/api/admin/orders', { query: q }).then(setData).catch((e) => toast.error(e.message)) }, [params]) // eslint-disable-line
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setParams(n) }
  return (
    <div>
      <PageHeader title="Orders" subtitle={data ? `${data.total} orders` : ''} />
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        <button onClick={() => set('status', '')} className={cls('chip shrink-0', !q.status && 'chip-active')}>All</button>
        {Object.entries(STATUS).map(([s, v]) => (
          <button key={s} onClick={() => set('status', s)} className={cls('chip shrink-0', q.status === s && 'chip-active')}>{v.label} <span className="opacity-60">{data?.status_counts?.[s] ?? ''}</span></button>
        ))}
      </div>
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-ink/5 p-4">
          <SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder="Order #, name, phone, email" />
          <select value={q.payment_status || ''} onChange={(e) => set('payment_status', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">Any payment</option>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={q.payment_method || ''} onChange={(e) => set('payment_method', e.target.value)} className="field !min-h-[42px] !w-auto"><option value="">Any method</option>{Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input type="date" value={q.date_from || ''} onChange={(e) => set('date_from', e.target.value)} className="field !min-h-[42px] !w-auto" aria-label="From date" />
          <input type="date" value={q.date_to || ''} onChange={(e) => set('date_to', e.target.value)} className="field !min-h-[42px] !w-auto" aria-label="To date" />
        </div>
        {!data ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
          : data.items.length === 0 ? <Empty icon={ShoppingCart} title="No orders match" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr>
                  <th className="px-5 py-3">Order</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3">Items</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-ink/5">
                  {data.items.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-bone-100" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="px-5 py-3"><Link to={`/orders/${o.id}`} className="font-semibold hover:underline">{o.order_number}</Link><p className="text-xs text-stone-450">{dateTime(o.created_at)}</p></td>
                      <td className="px-3 py-3">{o.customer_name}<p className="text-xs text-stone-450">{o.customer_phone} · {o.province}</p></td>
                      <td className="px-3 py-3"><Pill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Pill></td>
                      <td className="px-3 py-3"><Pill tone={PAYMENT_STATUS[o.payment_status].tone}>{PAYMENT_STATUS[o.payment_status].label}</Pill><p className="mt-1 text-xs text-stone-450">{PAYMENT_METHOD[o.payment_method]}</p></td>
                      <td className="px-3 py-3 tabular-nums">{o.item_count}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{usd2(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => set('page', String(n))} />}
      </div>
    </div>
  )
}

const NEXT_LABEL = { confirmed: 'Confirm order', processing: 'Start processing', shipped: 'Mark shipped', delivered: 'Mark delivered', cancelled: 'Cancel order', refunded: 'Refund' }

export function OrderDetail() {
  const { id } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const [o, setO] = useState(null)
  const [busy, setBusy] = useState(null)
  const [statusModal, setStatusModal] = useState(null)
  const [note, setNote] = useState('')
  const [restock, setRestock] = useState(true)
  const [track, setTrack] = useState({ carrier: '', tracking_number: '', tracking_url: '' })
  const [adminNote, setAdminNote] = useState('')
  const [proof, setProof] = useState(null)
  const load = () => api(`/api/admin/orders/${id}`).then((d) => { setO(d); setTrack({ carrier: d.carrier, tracking_number: d.tracking_number, tracking_url: d.tracking_url }); setAdminNote(d.admin_note) }).catch((e) => toast.error(e.message))
  useEffect(() => { load() }, [id]) // eslint-disable-line
  const act = async (key, fn, msg) => {
    setBusy(key)
    try { setO(await fn()); toast.success(msg) } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  if (!o) return <div className="skeleton h-96" />
  const pay = o.payments[o.payments.length - 1]
  const changeStatus = () => act('status', () => api(`/api/admin/orders/${id}/status`, { method: 'POST', body: { status: statusModal, note, restock } }), `Order ${STATUS[statusModal].label.toLowerCase()}`).then(() => { setStatusModal(null); setNote('') })
  const verify = (approve) => {
    const n = approve ? '' : window.prompt('Reason for rejecting this payment (shown to the customer):', 'We could not find this transfer.')
    if (!approve && n === null) return
    act('pay', () => api(`/api/admin/orders/${id}/payment`, { method: 'POST', body: { approve, note: n || '' } }), approve ? 'Payment confirmed' : 'Payment rejected')
  }

  return (
    <div>
      <PageHeader back={<Link to="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-450 hover:text-ink"><ArrowLeft size={15} /> Orders</Link>}
        title={o.order_number} subtitle={`Placed ${dateTime(o.created_at)}`}
        actions={<button onClick={() => navigate(`/orders/${id}/invoice`)} className="btn-outline !min-h-[42px]"><Printer size={16} /> Invoice</button>} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Pill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Pill>
        <Pill tone={PAYMENT_STATUS[o.payment_status].tone}>{PAYMENT_STATUS[o.payment_status].label}</Pill>
        <Pill>{PAYMENT_METHOD[o.payment_method]}</Pill>
        {o.stock_committed && !o.stock_released && <Pill tone="bg-ice-100 text-ice-700">Stock deducted</Pill>}
        {!o.stock_committed && !o.stock_released && <Pill tone="bg-amber-100 text-amber-800">Stock reserved</Pill>}
        {o.stock_released && <Pill>Stock returned</Pill>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {o.allowed_status.length > 0 && (
            <Card title="Update status">
              <div className="flex flex-wrap gap-2">
                {o.allowed_status.map((s) => (
                  <button key={s} onClick={() => { setStatusModal(s); setRestock(true) }} className={cls(s === 'cancelled' || s === 'refunded' ? 'btn-outline text-signal' : 'btn-primary', '!min-h-[42px]')}>{NEXT_LABEL[s]}</button>
                ))}
              </div>
              {o.status === 'pending' && o.payment_method !== 'cod' && o.payment_status !== 'paid' && <p className="mt-3 text-xs text-stone-450">Tip: verifying the payment confirms the order automatically.</p>}
            </Card>
          )}
          {pay && o.payment_method !== 'cod' && (
            <Card title="Payment" action={<span className="text-sm font-semibold tabular-nums">{usd2(pay.amount)} <span className="text-xs font-normal text-stone-450">≈ {khr(o.total_khr)}</span></span>}>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-stone-450">Status</dt><dd><Pill tone={PAYMENT_STATUS[pay.status].tone}>{PAYMENT_STATUS[pay.status].label}</Pill></dd></div>
                <div><dt className="text-xs text-stone-450">Customer reference</dt><dd className="font-mono">{pay.reference || '—'}</dd></div>
                {pay.verified_at && <div><dt className="text-xs text-stone-450">Verified</dt><dd>{dateTime(pay.verified_at)} · {pay.verification_source === 'gateway' ? 'Bakong API' : 'by staff'}</dd></div>}
                {pay.note && <div className="sm:col-span-2"><dt className="text-xs text-stone-450">Note</dt><dd>{pay.note}</dd></div>}
              </dl>
              {pay.proof_url && (
                <button onClick={() => setProof(pay.proof_url)} className="mt-4 block"><img src={assetUrl(pay.proof_url)} alt="Payment screenshot" className="h-48 rounded-xl border border-ink/10 object-cover" /><span className="mt-1 block text-xs font-semibold underline">View screenshot</span></button>
              )}
              {!['paid', 'refunded'].includes(o.payment_status) && !['cancelled', 'refunded'].includes(o.status) && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/5 pt-4">
                  <button onClick={() => verify(true)} disabled={!!busy} className="btn-primary !min-h-[42px]">{busy === 'pay' ? <Spinner /> : <CheckCircle2 size={16} />} Confirm payment received</button>
                  <button onClick={() => verify(false)} disabled={!!busy} className="btn-outline !min-h-[42px] text-signal"><XCircle size={16} /> Reject</button>
                  <p className="w-full text-xs text-stone-450">Only confirm after you see the money in your bank app / ABA merchant account.</p>
                </div>
              )}
            </Card>
          )}
          <Card title={`Items (${o.item_count})`} pad={false}>
            <ul className="divide-y divide-ink/5">
              {o.items.map((it) => (
                <li key={it.id} className="flex items-center gap-4 px-5 py-3">
                  <Thumb src={it.image_url} className="h-14 w-14" />
                  <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{it.product_name}</p><p className="text-xs text-stone-450">{it.brand_name} · {it.color} · EU {it.size} · {it.sku}</p></div>
                  <p className="text-sm tabular-nums">{usd2(it.unit_price)} × {it.quantity}</p>
                  <p className="w-20 text-right text-sm font-semibold tabular-nums">{usd2(it.line_total)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-ink/5 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{usd2(o.subtotal)}</dd></div>
              {o.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount ({o.discount_code})</dt><dd>−{usd2(o.discount_amount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd className="tabular-nums">{usd2(o.delivery_fee)}</dd></div>
              {o.tax_amount > 0 && <div className="flex justify-between text-stone-450"><dt>Tax</dt><dd>{usd2(o.tax_amount)}</dd></div>}
              <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{usd2(o.total)}</dd></div>
            </dl>
          </Card>
          <Card title="Timeline">
            <ol className="space-y-3 border-l-2 border-bone-300 pl-5">
              {[...o.history].reverse().map((h, i) => (
                <li key={i} className="relative text-sm"><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-ink" />
                  <p className="font-semibold capitalize">{h.status.replace(/_/g, ' ')}</p>{h.note && <p className="text-stone-450">{h.note}</p>}<p className="text-xs text-stone-400">{dateTime(h.created_at)}</p></li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Customer">
            <p className="font-semibold">{o.customer_name}</p>
            <p className="text-sm"><a href={`tel:${o.customer_phone}`} className="underline">{o.customer_phone}</a>{o.customer_email && <> · <a href={`mailto:${o.customer_email}`} className="underline">{o.customer_email}</a></>}</p>
            {o.customer ? <Link to={`/customers/${o.customer.id}`} className="mt-2 inline-block text-xs font-semibold underline">Account · {o.customer.order_count} orders</Link> : <p className="mt-2 text-xs text-stone-450">Guest checkout</p>}
            <div className="mt-4 rounded-xl bg-bone-100 p-3 text-sm">
              <p>{o.address_line}{o.district && `, ${o.district}`}</p><p className="font-semibold">{o.province}</p>
              {o.delivery_note && <p className="mt-2 text-stone-450">“{o.delivery_note}”</p>}
            </div>
          </Card>
          <Card title="Shipping & tracking">
            <form onSubmit={(e) => { e.preventDefault(); act('track', () => api(`/api/admin/orders/${id}/tracking`, { method: 'POST', body: track }), 'Tracking saved') }} className="space-y-3">
              <Field label="Carrier"><input className="field" value={track.carrier} onChange={(e) => setTrack({ ...track, carrier: e.target.value })} placeholder="J&T, VET, Grab, own rider…" list="carriers" />
                <datalist id="carriers">{['J&T Express', 'VET Express', 'Virak Buntham', 'Grab Express', 'Own rider'].map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Tracking number"><input className="field" value={track.tracking_number} onChange={(e) => setTrack({ ...track, tracking_number: e.target.value })} /></Field>
              <Field label="Tracking link"><input className="field" type="url" value={track.tracking_url} onChange={(e) => setTrack({ ...track, tracking_url: e.target.value })} placeholder="https://" /></Field>
              <div className="flex items-center gap-3"><button className="btn-primary !min-h-[42px]" disabled={busy === 'track'}><Truck size={16} /> Save tracking</button>
                {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="text-sm underline"><ExternalLink size={14} className="inline" /> Open</a>}</div>
            </form>
          </Card>
          <Card title="Internal note">
            <textarea className="field min-h-[100px]" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Only visible to staff" />
            <button onClick={() => act('note', () => api(`/api/admin/orders/${id}/note`, { method: 'PUT', body: { admin_note: adminNote } }), 'Note saved')} className="btn-outline mt-3 !min-h-[40px]">Save note</button>
          </Card>
        </div>
      </div>

      <Modal open={!!statusModal} onClose={() => setStatusModal(null)} title={statusModal ? NEXT_LABEL[statusModal] : ''}
        footer={<><button className="btn-ghost" onClick={() => setStatusModal(null)}>Close</button><button className="btn-primary" onClick={changeStatus} disabled={busy === 'status'}>{busy === 'status' ? <Spinner /> : 'Confirm'}</button></>}>
        {statusModal === 'confirmed' && <p className="mb-4 text-sm">Reserved pairs will be <b>deducted from stock</b>.{o.payment_method !== 'cod' && o.payment_status !== 'paid' && <span className="mt-2 block text-amber-700">Payment is not verified yet.</span>}</p>}
        {statusModal === 'cancelled' && <p className="mb-4 text-sm">Reserved/deducted pairs will be <b>returned to stock</b>. {o.payment_status === 'paid' && 'This order is paid — refund it afterwards.'}</p>}
        {statusModal === 'refunded' && <label className="mb-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-5 w-5 accent-ink" /> Return the pairs to stock (unworn returns)</label>}
        <Field label="Note for the timeline (optional)"><textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </Modal>
      <Modal open={!!proof} onClose={() => setProof(null)} title="Payment screenshot" wide><img src={assetUrl(proof)} alt="Payment proof" className="mx-auto max-h-[75vh] rounded-xl" /></Modal>
    </div>
  )
}

export function Invoice() {
  const { id } = useParams()
  const [o, setO] = useState(null)
  const [store, setStore] = useState(null)
  useEffect(() => {
    api(`/api/admin/orders/${id}`).then(setO)
    api('/api/admin/settings').then((s) => setStore(s.store))
  }, [id])
  if (!o || !store) return <div className="skeleton h-96" />
  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden"><Link to={`/orders/${id}`} className="btn-outline !min-h-[42px]"><ArrowLeft size={16} /> Back</Link><button onClick={() => window.print()} className="btn-primary !min-h-[42px]"><Printer size={16} /> Print</button></div>
      <article className="mx-auto max-w-3xl bg-white p-8 text-sm shadow-soft print:max-w-none print:p-0 print:shadow-none sm:p-12">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-6">
          <div>
            {store.logo_url ? <img src={assetUrl(store.logo_url)} alt="" className="h-12" /> : <p className="font-wide text-2xl font-black">ICEQ <span className="text-xs font-semibold tracking-[0.3em]">SOLE</span></p>}
            <p className="mt-2 text-stone-450">{store.address}<br />{store.phone} · {store.email}</p>
          </div>
          <div className="text-right"><p className="h-display text-3xl">Invoice</p><p className="mt-1 font-semibold">{o.order_number}</p><p className="text-stone-450">{dateTime(o.created_at)}</p></div>
        </header>
        <section className="mt-6 grid grid-cols-2 gap-6">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-stone-450">Bill / ship to</p><p className="mt-1 font-semibold">{o.customer_name}</p><p>{o.customer_phone}</p><p>{o.address_line}{o.district && `, ${o.district}`}, {o.province}</p></div>
          <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wider text-stone-450">Payment</p><p className="mt-1">{PAYMENT_METHOD[o.payment_method]}</p><p className="font-semibold">{PAYMENT_STATUS[o.payment_status].label}</p></div>
        </section>
        <table className="mt-8 w-full">
          <thead><tr className="border-b border-ink/20 text-left text-xs uppercase tracking-wider text-stone-450"><th className="py-2">Item</th><th className="py-2">SKU</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody>{o.items.map((it) => <tr key={it.id} className="border-b border-ink/10"><td className="py-2"><b>{it.product_name}</b><br /><span className="text-stone-450">{it.color} · EU {it.size}</span></td><td className="py-2 font-mono text-xs">{it.sku}</td><td className="py-2 text-right">{it.quantity}</td><td className="py-2 text-right tabular-nums">{usd2(it.unit_price)}</td><td className="py-2 text-right tabular-nums">{usd2(it.line_total)}</td></tr>)}</tbody>
        </table>
        <dl className="ml-auto mt-6 w-64 space-y-1">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{usd2(o.subtotal)}</dd></div>
          {o.discount_amount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{usd2(o.discount_amount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd className="tabular-nums">{usd2(o.delivery_fee)}</dd></div>
          <div className="flex justify-between border-t-2 border-ink pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{usd2(o.total)}</dd></div>
          <div className="flex justify-between text-xs text-stone-450"><dt>KHR (rate {o.khr_rate})</dt><dd>{khr(o.total_khr)}</dd></div>
        </dl>
        <footer className="mt-12 border-t border-ink/10 pt-4 text-center text-xs text-stone-450">Thank you for shopping with {store.name}. Exchanges on unworn pairs within 7 days with this invoice.</footer>
      </article>
    </div>
  )
}
