// In-store point of sale. Left: find items (search, scan a SKU barcode, tap a product, pick colour/size).
// Right: the sale - quantities, discount, customer, payment (Cash with change in USD + riel, KHQR, bank
// transfer). Charging creates a normal order tagged "pos": stock updates, it shows in Orders, reports,
// invoices and backups. A thermal (80 mm) receipt prints after every sale; "Today" closes the day.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Banknote, Building2, CheckCircle2, Minus, Plus, Printer, QrCode, RotateCcw, ScanLine, Search, ShoppingBag, Trash2, User, X } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { cls, dateTime, khr, usd2, uuid } from '../lib/format'
import { Modal, Spinner, Thumb, useToast } from '../components/ui'
import { useAuth } from '../components/Layout'
import { usePrefs } from '../context/Prefs'

const TEXT = {
  en: {
    title: 'Point of sale', sell: 'Sell', today: 'Today', search: 'Search or scan a barcode (SKU)…', all: 'All',
    inStock: '{n} in stock', soldOut: 'Sold out', pick: 'Choose colour & size', colour: 'Colour', size: 'Size',
    sale: 'Current sale', empty: 'Scan or tap a product to start a sale.', clear: 'Clear', customer: 'Customer (optional)',
    name: 'Name', phone: 'Phone', email: 'Email for the receipt', discount: 'Discount', subtotal: 'Subtotal', total: 'Total',
    tax: 'Tax', pay: 'Payment', cash: 'Cash', khqr: 'KHQR', bank: 'Bank transfer', receivedUsd: 'Received (USD)',
    receivedKhr: 'Received (riel)', exact: 'Exact', change: 'Change', short: 'Still due', charge: 'Charge {amount}',
    bankHint: 'Check the money arrived in your bank app before charging.', scanToPay: 'Scan to pay',
    waiting: 'Waiting for the payment… it confirms by itself when ABA notifies us.', received: 'Payment received',
    cancelSale: 'Cancel sale', cancelled: 'Sale cancelled, items are back in stock', done: 'Sale complete',
    printReceipt: 'Print receipt', newSale: 'New sale', cashier: 'Cashier', paidBy: 'Paid by', receipt: 'Receipt',
    thanks: 'Thank you for shopping with IceQ Sole!', policy: 'Unworn items in original packaging can be exchanged within 7 days with this receipt.',
    sales: 'Sales', revenue: 'Revenue', items: 'Items sold', drawer: 'Cash drawer', drawerHint: 'Cash taken minus change given',
    open: '{n} unpaid KHQR sale(s) waiting', noSales: 'No in-store sales yet today.', reprint: 'Reprint', notFound: 'No item with SKU {sku}',
    added: 'Added {name}', maxStock: 'Only {n} in stock', walkIn: 'Walk-in customer', refresh: 'Refresh',
  },
  km: {
    title: 'ការលក់នៅហាង (POS)', sell: 'លក់', today: 'ថ្ងៃនេះ', search: 'ស្វែងរក ឬស្កេនបាកូដ (SKU)…', all: 'ទាំងអស់',
    inStock: 'មានក្នុងស្តុក {n}', soldOut: 'អស់ស្តុក', pick: 'ជ្រើសពណ៌ និងទំហំ', colour: 'ពណ៌', size: 'ទំហំ',
    sale: 'ការលក់បច្ចុប្បន្ន', empty: 'ស្កេន ឬចុចលើផលិតផល ដើម្បីចាប់ផ្តើមលក់។', clear: 'សម្អាត', customer: 'អតិថិជន (មិនចាំបាច់)',
    name: 'ឈ្មោះ', phone: 'លេខទូរស័ព្ទ', email: 'អ៊ីមែលសម្រាប់បង្កាន់ដៃ', discount: 'បញ្ចុះតម្លៃ', subtotal: 'សរុបរង', total: 'សរុប',
    tax: 'ពន្ធ', pay: 'ការទូទាត់', cash: 'សាច់ប្រាក់', khqr: 'KHQR', bank: 'ផ្ទេរប្រាក់', receivedUsd: 'ទទួលបាន (ដុល្លារ)',
    receivedKhr: 'ទទួលបាន (រៀល)', exact: 'គ្រប់ចំនួន', change: 'ប្រាក់អាប់', short: 'នៅខ្វះ', charge: 'គិតប្រាក់ {amount}',
    bankHint: 'ពិនិត្យថាប្រាក់ចូលក្នុងកម្មវិធីធនាគាររួចហើយ មុនពេលគិតប្រាក់។', scanToPay: 'ស្កេនដើម្បីបង់',
    waiting: 'កំពុងរង់ចាំការទូទាត់… នឹងបញ្ជាក់ដោយខ្លួនឯង ពេល ABA ជូនដំណឹង។', received: 'បានទទួលប្រាក់',
    cancelSale: 'បោះបង់ការលក់', cancelled: 'បានបោះបង់ ទំនិញត្រលប់ចូលស្តុកវិញ', done: 'លក់រួចរាល់',
    printReceipt: 'បោះពុម្ពបង្កាន់ដៃ', newSale: 'លក់ថ្មី', cashier: 'អ្នកគិតលុយ', paidBy: 'បង់ដោយ', receipt: 'បង្កាន់ដៃ',
    thanks: 'សូមអរគុណសម្រាប់ការទិញទំនិញជាមួយ IceQ Sole!', policy: 'ទំនិញមិនទាន់ប្រើ ក្នុងកញ្ចប់ដើម អាចប្តូរបានក្នុង 7 ថ្ងៃ ជាមួយបង្កាន់ដៃនេះ។',
    sales: 'ការលក់', revenue: 'ចំណូល', items: 'ទំនិញបានលក់', drawer: 'ថតលុយ', drawerHint: 'សាច់ប្រាក់ទទួល ដកប្រាក់អាប់',
    open: 'ការលក់ KHQR {n} មិនទាន់បង់', noSales: 'មិនទាន់មានការលក់នៅហាងថ្ងៃនេះទេ។', reprint: 'បោះពុម្ពម្តងទៀត', notFound: 'រកមិនឃើញ SKU {sku}',
    added: 'បានបន្ថែម {name}', maxStock: 'មានតែ {n} ក្នុងស្តុក', walkIn: 'អតិថិជនដើរចូល', refresh: 'ផ្ទុកឡើងវិញ',
  },
}
const fill = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const sizeText = (s) => (/^\d/.test(String(s)) ? `EU ${s}` : s)
const METHOD_ICON = { cash: Banknote, khqr: QrCode, bank_transfer: Building2 }

export default function Pos() {
  const { lang } = usePrefs()
  const T = TEXT[lang] || TEXT.en
  const t = (k, v) => fill(T[k] || k, v)
  const toast = useToast()
  const { user } = useAuth()
  const [tab, setTab] = useState('sell')
  const [items, setItems] = useState(null)
  const [rate, setRate] = useState(4100)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('')
  const [picker, setPicker] = useState(null)
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' })
  const [showCustomer, setShowCustomer] = useState(false)
  const [disc, setDisc] = useState({ type: 'amount', value: '' })
  const [method, setMethod] = useState('cash')
  const [cashUsd, setCashUsd] = useState('')
  const [cashKhr, setCashKhr] = useState('')
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(null)   // KHQR sale being paid
  const [done, setDone] = useState(null)         // finished sale -> receipt
  const searchRef = useRef(null)
  const key = useRef(uuid())

  const load = useCallback(() => api('/api/admin/pos/catalog').then(setItems).catch((e) => toast.error(e.message)), [toast])
  useEffect(() => {
    load()
    api('/api/admin/settings').then((s) => setRate(Number(s.currency?.khr_rate) || 4100)).catch(() => {})
  }, [load])

  const variants = useMemo(() => {
    const m = new Map()
    for (const p of items || []) for (const v of p.variants) m.set(v.id, { ...v, product: p })
    return m
  }, [items])
  const categories = useMemo(() => [...new Set((items || []).map((p) => p.category).filter(Boolean))], [items])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items || []).filter((p) => (!cat || p.category === cat) && (!q || `${p.name} ${p.brand} ${p.variants.map((v) => v.sku).join(' ')}`.toLowerCase().includes(q)))
  }, [items, query, cat])

  // ---- sale maths (the server recalculates; this is what the cashier sees)
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const discount = Math.min(subtotal, disc.type === 'percent' ? subtotal * (Number(disc.value) || 0) / 100 : Number(disc.value) || 0)
  const total = Math.round((subtotal - discount) * 100) / 100
  const tendered = (Number(cashUsd) || 0) + (Number(cashKhr) || 0) / rate
  const change = Math.max(0, tendered - total)
  const enough = method !== 'cash' || tendered + 0.005 >= total
  const count = cart.reduce((s, l) => s + l.qty, 0)

  const add = (v) => {
    if (!v || v.available <= 0) { toast.error(t('soldOut')); return }
    setCart((c) => {
      const line = c.find((l) => l.id === v.id)
      if (line) {
        if (line.qty >= v.available) { toast.error(t('maxStock', { n: v.available })); return c }
        return c.map((l) => (l.id === v.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...c, { id: v.id, qty: 1, price: v.price, available: v.available, name: v.product.name, color: v.color, size: v.size, sku: v.sku, image: v.image }]
    })
  }
  const setQty = (id, qty) => setCart((c) => c.flatMap((l) => (l.id !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, l.available) }])))
  const reset = () => {
    setCart([]); setCustomer({ name: '', phone: '', email: '' }); setShowCustomer(false); setDisc({ type: 'amount', value: '' })
    setMethod('cash'); setCashUsd(''); setCashKhr(''); key.current = uuid(); setTimeout(() => searchRef.current?.focus(), 50)
  }

  // barcode scanners type the SKU and press Enter
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return
    const q = query.trim().toUpperCase()
    if (!q) return
    const v = [...variants.values()].find((x) => x.sku.toUpperCase() === q)
    if (v) { add(v); toast.success(t('added', { name: `${v.product.name} · ${sizeText(v.size)}` })); setQuery(''); return }
    if (shown.length === 1) { setPicker(shown[0]); return }
    toast.error(t('notFound', { sku: query.trim() }))
  }

  const charge = async () => {
    setBusy(true)
    try {
      const body = {
        items: cart.map((l) => ({ variant_id: l.id, quantity: l.qty })), payment_method: method, idempotency_key: key.current,
        ...(disc.value ? (disc.type === 'percent' ? { discount_percent: Number(disc.value) } : { discount_amount: Number(disc.value) }) : {}),
        ...(method === 'cash' ? { cash_usd: Number(cashUsd) || 0, cash_khr: Number(cashKhr) || 0 } : {}),
        ...(customer.name.trim() ? { customer_name: customer.name.trim() } : {}),
        ...(customer.phone.trim() ? { customer_phone: customer.phone.trim() } : {}),
        ...(customer.email.trim() ? { customer_email: customer.email.trim() } : {}),
      }
      const sale = await api('/api/admin/pos/sales', { method: 'POST', body })
      if (sale.order.payment_status === 'paid') { setDone(sale); reset(); load() } else setWaiting(sale)
    } catch (e) {
      toast.error(e.message)
      if (e.status === 409) load()
      key.current = uuid()
    } finally { setBusy(false) }
  }

  // KHQR: poll until paid (PayWay auto-confirm or cashier), then hand over
  useEffect(() => {
    if (!waiting) return
    let stop = false
    const tick = async () => {
      try {
        const s = await api(`/api/admin/pos/sales/${waiting.order.id}`)
        if (stop) return
        if (s.order.payment_status === 'paid') {
          const fin = await api(`/api/admin/pos/sales/${waiting.order.id}/complete`, { method: 'POST', body: {} })
          setWaiting(null); setDone(fin); reset(); load()
        }
      } catch { /* keep waiting */ }
    }
    const id = setInterval(tick, 3000)
    return () => { stop = true; clearInterval(id) }
  }, [waiting]) // eslint-disable-line

  const confirmKhqr = async () => {
    setBusy(true)
    try {
      const fin = await api(`/api/admin/pos/sales/${waiting.order.id}/complete`, { method: 'POST', body: { confirm_received: true } })
      setWaiting(null); setDone(fin); reset(); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const cancelKhqr = async () => {
    setBusy(true)
    try { await api(`/api/admin/pos/sales/${waiting.order.id}/cancel`, { method: 'POST' }); setWaiting(null); toast.success(t('cancelled')); key.current = uuid(); load() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="-mt-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black tracking-tight">{T.title}</h1>
        <div className="flex rounded-full bg-ink/5 p-1">
          {['sell', 'today'].map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cls('rounded-full px-5 py-2 text-sm font-semibold transition', tab === k ? 'bg-ink text-white shadow' : 'text-stone-450 hover:text-ink')}>{T[k]}</button>
          ))}
        </div>
      </div>

      {tab === 'today' ? <Today T={T} t={t} onReprint={setDone} /> : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* ---------------- products */}
          <section className="min-w-0">
            <div className="relative">
              <ScanLine size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-450" />
              <input ref={searchRef} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
                placeholder={T.search} aria-label={T.search} className="field !min-h-[52px] !rounded-2xl pl-11 pr-10 text-[15px]" />
              {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full hover:bg-ink/5" aria-label={T.clear}><X size={16} /></button>}
            </div>
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {['', ...categories].map((c) => (
                <button key={c || 'all'} onClick={() => setCat(c)} className={cls('chip shrink-0', cat === c && 'chip-active')}>{c || T.all}</button>
              ))}
            </div>
            {!items ? <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}</div> : (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                {shown.map((p) => {
                  const stock = p.variants.reduce((s, v) => s + Math.max(0, v.available), 0)
                  return (
                    <button key={p.id} onClick={() => (p.variants.length === 1 ? add({ ...p.variants[0], product: p }) : setPicker(p))} disabled={!stock}
                      className="group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-soft ring-1 ring-ink/5 transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[.98] disabled:opacity-45">
                      <div className="relative aspect-square overflow-hidden bg-bone">{p.image && <img src={assetUrl(p.image)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}</div>
                      <div className="flex flex-1 flex-col p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-450">{p.brand}</p>
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                        <div className="mt-auto flex items-baseline justify-between pt-2">
                          <span className="font-bold tabular-nums">{usd2(p.price)}</span>
                          <span className={cls('text-[11px] font-medium', stock ? 'text-stone-450' : 'text-signal')}>{stock ? t('inStock', { n: stock }) : T.soldOut}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* ---------------- current sale */}
          <aside className="md:sticky md:top-4 md:self-start">
            <div className="flex max-h-none flex-col rounded-3xl bg-white shadow-soft ring-1 ring-ink/5 md:max-h-[calc(100dvh-110px)]">
              <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
                <p className="flex items-center gap-2 font-display text-lg font-bold"><ShoppingBag size={18} /> {T.sale}{count > 0 && <span className="rounded-full bg-ink px-2 text-xs text-white">{count}</span>}</p>
                {cart.length > 0 && <button onClick={reset} className="flex items-center gap-1.5 text-sm text-stone-450 hover:text-signal"><RotateCcw size={14} /> {T.clear}</button>}
              </div>

              <div className="min-h-[120px] flex-1 overflow-y-auto px-5 py-3">
                {!cart.length ? <p className="py-10 text-center text-sm text-stone-450">{T.empty}</p> : cart.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 border-b border-ink/5 py-3 last:border-0">
                    <Thumb src={l.image && assetUrl(l.image)} className="h-12 w-12 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.name}</p>
                      <p className="text-xs text-stone-450">{l.color} · {sizeText(l.size)} · {usd2(l.price)}</p>
                    </div>
                    <div className="flex items-center rounded-full border border-ink/10">
                      <button onClick={() => setQty(l.id, l.qty - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5" aria-label="-">{l.qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                      <button onClick={() => setQty(l.id, l.qty + 1)} disabled={l.qty >= l.available} className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5 disabled:opacity-30" aria-label="+"><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-ink/10 px-5 py-4">
                {/* customer + discount */}
                <div className="flex gap-2">
                  <button onClick={() => setShowCustomer((s) => !s)} className={cls('chip flex-1 justify-center', (showCustomer || customer.name) && 'chip-active')}><User size={14} /> {customer.name || T.customer}</button>
                  <div className="flex flex-1 items-center rounded-full border border-ink/15 pl-3">
                    <span className="text-xs text-stone-450">{T.discount}</span>
                    <input inputMode="decimal" value={disc.value} onChange={(e) => setDisc({ ...disc, value: e.target.value.replace(/[^\d.]/g, '') })} className="w-full min-w-0 bg-transparent px-2 py-2 text-right text-sm tabular-nums outline-none" placeholder="0" aria-label={T.discount} />
                    <button onClick={() => setDisc({ ...disc, type: disc.type === 'amount' ? 'percent' : 'amount' })} className="mr-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold">{disc.type === 'amount' ? '$' : '%'}</button>
                  </div>
                </div>
                {showCustomer && (
                  <div className="grid animate-fade-in gap-2 sm:grid-cols-2">
                    <input className="field !min-h-[42px]" placeholder={T.name} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                    <input className="field !min-h-[42px]" placeholder={T.phone} inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                    <input className="field !min-h-[42px] sm:col-span-2" type="email" placeholder={T.email} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                  </div>
                )}

                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between text-stone-450"><dt>{T.subtotal}</dt><dd className="tabular-nums">{usd2(subtotal)}</dd></div>
                  {discount > 0 && <div className="flex justify-between text-emerald-700"><dt>{T.discount}</dt><dd className="tabular-nums">−{usd2(discount)}</dd></div>}
                  <div className="flex items-baseline justify-between pt-1"><dt className="font-display text-lg font-bold">{T.total}</dt><dd className="font-display text-3xl font-black tabular-nums">{usd2(total)}</dd></div>
                  <div className="text-right text-xs text-stone-450">≈ {khr(Math.round(total * rate / 100) * 100)}</div>
                </dl>

                {/* payment method */}
                <div className="grid grid-cols-3 gap-2">
                  {[['cash', T.cash], ['khqr', T.khqr], ['bank_transfer', T.bank]].map(([k, label]) => {
                    const Icon = METHOD_ICON[k]
                    return <button key={k} onClick={() => setMethod(k)} className={cls('flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-xs font-semibold transition', method === k ? 'border-ink bg-ink text-white' : 'border-ink/10 hover:border-ink/30')}><Icon size={18} />{label}</button>
                  })}
                </div>
                {method === 'cash' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-stone-450">{T.receivedUsd}<input inputMode="decimal" value={cashUsd} onChange={(e) => setCashUsd(e.target.value.replace(/[^\d.]/g, ''))} className="field mt-1 !min-h-[44px] text-right tabular-nums" placeholder="0.00" /></label>
                      <label className="text-xs text-stone-450">{T.receivedKhr}<input inputMode="numeric" value={cashKhr} onChange={(e) => setCashKhr(e.target.value.replace(/\D/g, ''))} className="field mt-1 !min-h-[44px] text-right tabular-nums" placeholder="0" /></label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => { setCashUsd(total.toFixed(2)); setCashKhr('') }} className="chip !py-1.5 text-xs">{T.exact}</button>
                      {[5, 10, 20, 50, 100].map((n) => <button key={n} onClick={() => setCashUsd(String((Number(cashUsd) || 0) + n))} className="chip !py-1.5 text-xs">+${n}</button>)}
                    </div>
                    {(cashUsd || cashKhr) && (
                      <div className={cls('flex items-baseline justify-between rounded-xl px-3 py-2.5 text-sm', enough ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
                        <span className="font-semibold">{enough ? T.change : T.short}</span>
                        <span className="font-bold tabular-nums">{enough ? `${usd2(change)} · ${khr(Math.round(change * rate / 100) * 100)}` : usd2(total - tendered)}</span>
                      </div>
                    )}
                  </div>
                )}
                {method === 'bank_transfer' && <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">{T.bankHint}</p>}

                <button onClick={charge} disabled={!cart.length || !enough || busy}
                  className="btn-primary w-full !min-h-[56px] text-base disabled:opacity-40">
                  {busy ? <Spinner className="h-5 w-5" /> : t('charge', { amount: usd2(total) })}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* colour / size picker */}
      <Modal open={!!picker} onClose={() => setPicker(null)} title={picker?.name || T.pick}>
        {picker && <Picker p={picker} T={T} t={t} onPick={(v) => { add({ ...v, product: picker }); setPicker(null); setQuery('') }} />}
      </Modal>

      {/* KHQR: customer scans, sale completes when the money arrives */}
      <Modal open={!!waiting} onClose={() => {}} title={T.scanToPay}>
        {waiting && (
          <div className="text-center">
            <div className="mx-auto w-[260px] overflow-hidden rounded-[20px] bg-white shadow-soft ring-1 ring-black/5" style={{ color: '#000' }}>
              <div className="grid h-[52px] place-items-center" style={{ background: '#E21A2C' }}><img src="/khqr-logo-white.png" alt="KHQR" className="h-[19px]" onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('b'), { textContent: 'KHQR', style: 'color:#fff;letter-spacing:.2em' })) }} /></div>
              <div className="px-6 pt-4 text-left"><p className="text-xs" style={{ color: 'rgba(0,0,0,.7)' }}>{waiting.merchant_name || 'IceQ Sole'}</p><p className="text-2xl font-black tabular-nums">{Number(waiting.order.total).toFixed(2)} <span className="text-xs font-semibold" style={{ color: 'rgba(0,0,0,.55)' }}>USD</span></p></div>
              <div className="mx-5 my-3 border-t border-dashed" style={{ borderColor: 'rgba(0,0,0,.18)' }} />
              <div className="px-6 pb-6"><QRCodeSVG value={waiting.payment.khqr} size={208} level="Q" className="h-auto w-full" /></div>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-stone-450"><Spinner className="h-4 w-4" /> {T.waiting}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={cancelKhqr} disabled={busy} className="btn-outline">{T.cancelSale}</button>
              <button onClick={confirmKhqr} disabled={busy} className="btn-primary"><CheckCircle2 size={16} /> {T.received}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* receipt after a sale */}
      <Modal open={!!done} onClose={() => setDone(null)} title={T.done}>
        {done && (
          <div>
            <div className="mx-auto max-h-[52vh] overflow-y-auto rounded-xl bg-white p-2 shadow-inner ring-1 ring-ink/5"><Receipt sale={done} T={T} cashier={user?.full_name} rate={rate} /></div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => window.print()} className="btn-outline"><Printer size={16} /> {T.printReceipt}</button>
              <button onClick={() => setDone(null)} className="btn-primary">{T.newSale}</button>
            </div>
            {createPortal(<div className="print-only"><style>{'@page { size: 80mm auto; margin: 0; }'}</style><Receipt sale={done} T={T} cashier={user?.full_name} rate={rate} /></div>, document.body)}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Picker({ p, T, t, onPick }) {
  const colours = [...new Set(p.variants.map((v) => v.color))]
  const [colour, setColour] = useState(colours[0])
  const sizes = p.variants.filter((v) => v.color === colour)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-450">{T.colour}</p>
      <div className="mt-2 flex flex-wrap gap-2">{colours.map((c) => <button key={c} onClick={() => setColour(c)} className={cls('chip', colour === c && 'chip-active')}>{c}</button>)}</div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-stone-450">{T.size}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {sizes.map((v) => (
          <button key={v.id} onClick={() => onPick(v)} disabled={v.available <= 0}
            className="rounded-xl border border-ink/15 px-2 py-3 text-center transition hover:border-ink hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
            <span className="block text-sm font-bold">{sizeText(v.size)}</span>
            <span className="block text-[11px] opacity-70">{v.available > 0 ? t('inStock', { n: v.available }) : T.soldOut}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 80 mm thermal receipt (also shown on screen)
function Receipt({ sale, T, cashier, rate }) {
  const o = sale.order
  const cash = sale.payment?.cash
  const method = { cash: T.cash, khqr: 'ABA KHQR', bank_transfer: T.bank }[o.payment_method] || o.payment_method
  const row = (a, b, strong) => <div className={cls('flex justify-between gap-3', strong && 'text-[15px] font-black')}><span>{a}</span><span className="tabular-nums">{b}</span></div>
  return (
    <div className="pos-receipt force-light mx-auto bg-white px-3 py-4 font-mono text-[12px] leading-snug text-black" style={{ width: '72mm' }}>
      <div className="text-center">
        <svg viewBox="0 0 32 32" className="mx-auto h-9 w-9" aria-hidden><path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke="#000" strokeWidth="2.6" strokeLinejoin="round" fill="none" /><path d="M9.2 20.6h13.6" stroke="#000" strokeWidth="2.6" strokeLinecap="round" /><path d="M20.4 23.4 28.6 30" stroke="#000" strokeWidth="2.6" strokeLinecap="round" /></svg>
        <p className="mt-1 font-sans text-[17px] font-black tracking-tight">ICEQ SOLE</p>
        <p className="text-[10px]">Street 240, Daun Penh, Phnom Penh</p>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {row(T.receipt, o.invoice_number)}
      {row('Order', o.order_number)}
      {row('Date', dateTime(o.created_at))}
      {cashier && row(T.cashier, cashier)}
      {o.customer_name && o.customer_name !== 'Walk-in customer' && row('Customer', o.customer_name)}
      <div className="my-2 border-t border-dashed border-black" />
      {o.items.map((it) => (
        <div key={it.id} className="mb-1.5">
          <p className="font-bold">{it.product_name}</p>
          <div className="flex justify-between"><span>{it.color} {sizeText(it.size)} · {it.quantity} x {usd2(it.unit_price)}</span><span className="tabular-nums">{usd2(it.line_total)}</span></div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      {row(T.subtotal, usd2(o.subtotal))}
      {o.discount_amount > 0 && row(T.discount, `-${usd2(o.discount_amount)}`)}
      {o.tax_amount > 0 && row(T.tax, usd2(o.tax_amount))}
      {row(T.total, usd2(o.total), true)}
      {row('', khr(o.total_khr ?? o.total * rate))}
      <div className="my-2 border-t border-dashed border-black" />
      {row(T.paidBy, method)}
      {cash && Number(cash.cash_usd) > 0 && row(T.receivedUsd, usd2(cash.cash_usd))}
      {cash && Number(cash.cash_khr) > 0 && row(T.receivedKhr, khr(cash.cash_khr))}
      {cash && row(T.change, `${usd2(cash.change_usd)} / ${khr(cash.change_khr)}`)}
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center font-sans text-[11px] font-bold">{T.thanks}</p>
      <p className="mt-1 text-center text-[10px]">{T.policy}</p>
    </div>
  )
}

function Today({ T, t, onReprint }) {
  const toast = useToast()
  const [s, setS] = useState(null)
  const load = useCallback(() => api('/api/admin/pos/summary').then(setS).catch((e) => toast.error(e.message)), [toast])
  useEffect(() => { load() }, [load])
  if (!s) return <div className="skeleton h-72 rounded-3xl" />
  const drawer = s.cash.received_usd - s.cash.change_usd
  const reprint = async (id) => { try { onReprint(await api(`/api/admin/pos/sales/${id}`)) } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[T.sales, s.sales], [T.revenue, usd2(s.revenue)], [T.items, s.items], [T.drawer, `${usd2(drawer)}${s.cash.received_khr ? ` + ${khr(s.cash.received_khr)}` : ''}`]].map(([k, v], i) => (
          <div key={k} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-450">{k}</p>
            <p className="mt-2 font-display text-2xl font-black tabular-nums">{v}</p>
            {i === 3 && <p className="mt-1 text-[11px] text-stone-450">{T.drawerHint}</p>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(s.by_method).map(([m, v]) => <span key={m} className="chip">{{ cash: T.cash, khqr: 'KHQR', bank_transfer: T.bank }[m] || m}: <b className="tabular-nums">{usd2(v)}</b></span>)}
        {s.open > 0 && <span className="chip !border-amber-300 text-amber-800">{t('open', { n: s.open })}</span>}
        <button onClick={load} className="chip"><RotateCcw size={13} /> {T.refresh}</button>
      </div>
      <div className="overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink/5">
        {!s.orders.length ? <p className="p-10 text-center text-sm text-stone-450">{T.noSales}</p> : (
          <table className="w-full text-sm">
            <tbody>{s.orders.map((o) => (
              <tr key={o.id} className="border-b border-ink/5 last:border-0">
                <td className="px-5 py-3"><p className="font-mono text-xs font-semibold">{o.invoice_number}</p><p className="text-xs text-stone-450">{dateTime(o.created_at)}</p></td>
                <td className="px-3 py-3 text-xs text-stone-450">{o.customer_name}<br />{o.items} item(s)</td>
                <td className="px-3 py-3 text-xs">{{ cash: T.cash, khqr: 'KHQR', bank_transfer: T.bank }[o.method]}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">{usd2(o.total)}<p className={cls('text-[10px] font-semibold uppercase', o.payment_status === 'paid' ? 'text-emerald-700' : o.status === 'cancelled' ? 'text-stone-450' : 'text-amber-700')}>{o.status === 'cancelled' ? o.status : o.payment_status}</p></td>
                <td className="px-5 py-3 text-right">{o.payment_status === 'paid' && <button onClick={() => reprint(o.id)} className="chip !py-1.5 text-xs"><Printer size={13} /> {T.reprint}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
