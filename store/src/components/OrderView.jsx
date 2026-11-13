// Shared order details: status timeline, KHQR / bank payment, items and totals.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, ExternalLink, ImagePlus, Loader2, Package, PackageCheck, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { api, assetUrl, upload } from '../lib/api'
import { useToast } from '../context/Toast'
import { Rich, usePrefs } from '../context/Prefs'
import { cls, dateTime, khr, PAYMENT_STATUS, STATUS, usd2 } from '../lib/format'
import { Img, Spinner, StatusPill } from './ui'

const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']
const ICON = { pending: Package, confirmed: Check, processing: Package, shipped: Truck, delivered: PackageCheck }

export default function OrderView({ order: initial, payment: initialPay, token, onChange }) {
  const { t } = usePrefs()
  const [order, setOrder] = useState(initial)
  const [pay, setPay] = useState(initialPay)
  const toast = useToast()
  useEffect(() => { setOrder(initial); setPay(initialPay) }, [initial, initialPay])
  const update = (o, p) => { setOrder(o); if (p) setPay(p); onChange?.(o) }
  const closed = ['cancelled', 'refunded'].includes(order.status)
  const canCancel = order.status === 'pending' && !['paid', 'submitted'].includes(order.payment_status)
  const cancel = async () => {
    if (!window.confirm(t('order.cancelConfirm'))) return
    try {
      const r = await api(`/api/orders/${order.order_number}/cancel`, { method: 'POST', query: { t: token } })
      update(r.order)
      toast.info(t('order.cancelled'))
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">{t('order.order')}</p>
              <p className="keep-latin font-wide text-2xl font-black tracking-tight">{order.order_number}</p>
              <p className="text-sm text-stone-450">{t('order.placed', { date: dateTime(order.created_at) })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill map={STATUS} value={order.status} label={t(`status.${order.status}`)} />
              <StatusPill map={PAYMENT_STATUS} value={order.payment_status} label={t(`payStatus.${order.payment_status}`)} />
            </div>
          </div>
          {closed ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-bone p-4 text-sm"><XCircle className="text-signal" /> {t('order.wasStatus', { status: t(`status.${order.status}`) })}</div>
          ) : <Timeline order={order} />}
          {order.tracking_number && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ice-50 p-4 text-sm">
              <span><b>{order.carrier || t('order.courier')}</b> · {t('order.tracking')} <span className="font-mono">{order.tracking_number}</span></span>
              {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">{t('order.trackParcel')} <ExternalLink size={14} /></a>}
            </div>
          )}
        </div>

        {!closed && pay && order.payment_method !== 'cod' && order.payment_status !== 'paid' && (
          <PaymentBox order={order} pay={pay} token={token} onUpdate={update} />
        )}
        {order.payment_method === 'cod' && !closed && order.payment_status !== 'paid' && (
          <div className="card flex items-start gap-4 p-5 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ice-50 text-ice-600"><Truck size={20} /></span>
            <div><p className="font-semibold">{t('order.cod')}</p>
              <p className="text-sm text-stone-450">{t('order.codText', { amount: usd2(order.total), khr: khr(order.total_khr), phone: order.customer_phone })}</p></div>
          </div>
        )}
        {order.payment_status === 'paid' && (
          <div className="card flex items-center gap-4 p-5"><ShieldCheck className="text-emerald-600" /><p className="text-sm"><b>{t('order.paid')}</b> {t('order.thankYou')}</p></div>
        )}

        <div className="card p-5 sm:p-6">
          <h3 className="font-display text-lg font-bold">{t('order.items')}</h3>
          <ul className="mt-4 divide-y divide-ink/10">
            {order.items.map((it) => (
              <li key={it.id} className="flex gap-4 py-4 first:pt-0">
                <Img src={it.image_url} className="h-20 w-20 shrink-0 rounded-xl" sizes="80px" />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow keep-latin !text-[10px]">{it.brand_name}</p>
                  {it.product_slug ? <Link to={`/product/${it.product_slug}`} className="font-semibold hover:underline">{it.product_name}</Link> : <p className="font-semibold">{it.product_name}</p>}
                  <p className="text-sm text-stone-450">{it.color} · EU {it.size} · {t('order.qty', { n: it.quantity })}</p>
                </div>
                <p className="font-semibold tabular-nums">{usd2(it.line_total)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="card p-5 sm:p-6">
          <h3 className="font-display text-lg font-bold">{t('order.summary')}</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>{t('common.subtotal')}</dt><dd className="tabular-nums">{usd2(order.subtotal)}</dd></div>
            {order.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('common.discount')} ({order.discount_code})</dt><dd>−{usd2(order.discount_amount)}</dd></div>}
            <div className="flex justify-between"><dt>{t('common.delivery')}</dt><dd className="tabular-nums">{order.delivery_fee ? usd2(order.delivery_fee) : t('common.free')}</dd></div>
            <div className="flex justify-between border-t border-ink/10 pt-3 text-base font-bold"><dt>{t('common.total')}</dt><dd className="tabular-nums">{usd2(order.total)}</dd></div>
            <p className="text-right text-xs text-stone-450">≈ {khr(order.total_khr)}</p>
          </dl>
          <p className="mt-4 rounded-xl bg-bone px-3 py-2 text-sm">{t('order.paymentLabel')} <b>{t(`payMethod.${order.payment_method}`)}</b></p>
        </div>
        <div className="card p-5 text-sm sm:p-6">
          <h3 className="font-display text-lg font-bold">{t('order.deliveryTitle')}</h3>
          <p className="mt-3 font-semibold">{order.customer_name}</p>
          <p className="text-stone-450">{order.customer_phone}{order.customer_email && ` · ${order.customer_email}`}</p>
          <p className="mt-2">{order.address_line}{order.district && `, ${order.district}`}, {order.province}</p>
          {order.delivery_note && <p className="mt-2 text-stone-450">“{order.delivery_note}”</p>}
        </div>
        {canCancel && <button onClick={cancel} className="btn-ghost w-full text-signal">{t('order.cancel')}</button>}
      </aside>
    </div>
  )
}

function Timeline({ order }) {
  const { t } = usePrefs()
  const idx = FLOW.indexOf(order.status)
  const when = (s) => order.history.filter((h) => h.status === s).pop()?.created_at
  return (
    <ol className="mt-7 grid grid-cols-5 gap-1">
      {FLOW.map((s, n) => {
        const Icon = ICON[s]
        const done = n <= idx
        return (
          <li key={s} className="relative flex flex-col items-center text-center">
            {n > 0 && <span className={cls('absolute right-1/2 top-5 h-0.5 w-full -translate-y-1/2 transition-colors duration-700', n <= idx ? 'bg-ink' : 'bg-bone-300')} />}
            <span className={cls('relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 transition', done ? 'border-ink bg-ink text-white' : 'border-bone-300 bg-white text-stone-400', n === idx && 'ring-4 ring-ice-200/60')}>
              <Icon size={17} />
            </span>
            <span className={cls('mt-2 text-[11px] font-semibold sm:text-xs', !done && 'text-stone-400')}>{t(`status.${s}`)}</span>
            {done && when(s) && <span className="hidden text-[10px] text-stone-450 sm:block">{dateTime(when(s))}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function PaymentBox({ order, pay, token, onUpdate }) {
  const { t } = usePrefs()
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  const [ref, setRef] = useState('')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [left, setLeft] = useState(null)
  const fileInput = useRef(null)
  const isQr = order.payment_method === 'khqr'
  const qr = pay.khqr
  const submitted = order.payment_status === 'submitted'

  useEffect(() => {
    if (!pay.expires_at) return
    const tm = setInterval(() => setLeft(Math.max(0, new Date(pay.expires_at) - Date.now())), 1000)
    return () => clearInterval(tm)
  }, [pay.expires_at])

  useEffect(() => {
    if (!isQr || !pay.auto_verify || order.payment_status === 'paid') return
    const tm = setInterval(() => check(true), 5000)
    return () => clearInterval(tm)
  }, [isQr, pay.auto_verify, order.payment_status]) // eslint-disable-line

  const reload = async () => {
    const r = await api(`/api/orders/${order.order_number}`, { query: { t: token } })
    onUpdate(r.order, r.payment)
  }
  const check = async (silent) => {
    if (!silent) setChecking(true)
    try {
      const r = await api(`/api/orders/${order.order_number}/payment/check`, { method: 'POST', query: { t: token } })
      if (r.paid) { toast.success(t('order.confirmedToast')); await reload() } else if (!silent) toast.info(r.error || t('order.notYet'))
    } catch (e) { if (!silent) toast.error(e.message) } finally { setChecking(false) }
  }
  const submitProof = async (e) => {
    e.preventDefault()
    const fd = new FormData()
    fd.append('reference', ref)
    if (file) fd.append('screenshot', file)
    setProgress(0)
    try {
      const qs = token ? `?t=${encodeURIComponent(token)}` : ''
      const r = await upload(`/api/orders/${order.order_number}/payment/submit${qs}`, fd, setProgress)
      onUpdate(r.order, r.payment)
      toast.success(t('order.verifying'))
    } catch (err) { toast.error(err.message) } finally { setProgress(null) }
  }
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.info(t('order.copied')) }
  const expired = left === 0
  const mmss = left != null ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : ''

  return (
    <div className="card overflow-hidden">
      <div className="bg-night p-5 text-snow sm:p-6">
        <p className="eyebrow !text-ice-300">{isQr ? t('order.scanToPay') : t('order.bankTransfer')}</p>
        <p className="keep-latin mt-1 font-wide text-3xl font-black tabular-nums">{usd2(pay.amount)}</p>
        <p className="text-sm text-snow/60">≈ {khr(pay.amount_khr)} · {t('order.reference', { ref: order.order_number })}</p>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr]">
        {isQr && (qr || pay.static_qr_url) && (
          <div className="mx-auto w-full max-w-[260px]">
            <div className={cls('relative overflow-hidden rounded-3xl border-[6px] border-[#E1232E] bg-snow p-4 text-night', expired && 'opacity-40')}>
              <div className="-mx-4 -mt-4 mb-3 bg-[#E1232E] py-2 text-center text-xs font-black tracking-[0.3em] text-snow">KHQR</div>
              <p className="text-xs font-semibold">{pay.merchant_name || 'IceQ Sole'}</p>
              <p className="mb-3 font-bold tabular-nums">{usd2(pay.amount)}</p>
              <div className="border-t border-dashed border-night/20 pt-3">
                {qr ? <QRCodeSVG value={qr} size={200} level="M" className="h-auto w-full" /> : <img src={assetUrl(pay.static_qr_url)} alt={t('order.storeQr')} className="w-full" />}
              </div>
            </div>
            {pay.expires_at && <p className={cls('mt-2 text-center text-xs', expired ? 'font-semibold text-signal' : 'text-stone-450')}>{expired ? t('order.expired') : left != null ? t('order.expiresIn', { time: mmss }) : ''}</p>}
          </div>
        )}
        <div className="space-y-4 text-sm">
          {isQr && (
            <ol className="list-decimal space-y-1.5 pl-5 text-ink-700">
              <li><Rich text={t('order.qrStep1')} /></li>
              <li>{t('order.qrStep2')}</li>
              <li><Rich text={t('order.qrStep3', { amount: usd2(pay.amount) })} /></li>
            </ol>
          )}
          {pay.bank?.account_number && (
            <div className="rounded-2xl bg-bone p-4">
              <p className="font-semibold">{pay.bank.bank_name}</p>
              <p className="text-stone-450">{pay.bank.account_name}</p>
              <button type="button" onClick={() => copy(pay.bank.account_number)} className="mt-1 inline-flex items-center gap-2 font-mono text-base font-semibold">{pay.bank.account_number} <Copy size={14} /></button>
            </div>
          )}
          {pay.instructions && <p className="text-stone-450">{pay.instructions}</p>}
          {isQr && pay.auto_verify && (
            <button type="button" onClick={() => check(false)} disabled={checking} className="btn-primary w-full sm:w-auto">
              {checking ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} {t('order.checkPaid')}
            </button>
          )}
          {submitted ? (
            <div className="flex items-start gap-3 rounded-2xl bg-ice-50 p-4"><Spinner className="mt-0.5 h-4 w-4 text-ice-600" /><p><b>{t('order.received')}</b> {t('order.receivedText')}</p></div>
          ) : (
            <form onSubmit={submitProof} className="space-y-3 rounded-2xl border border-dashed border-ink/20 p-4">
              <p className="font-semibold">{isQr && pay.auto_verify ? t('order.paidNotConfirmed') : t('order.sendReceipt')}</p>
              <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder={t('order.refPlaceholder')} className="field" aria-label={t('order.refPlaceholder')} />
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button type="button" onClick={() => fileInput.current?.click()} className="btn-outline w-full"><ImagePlus size={16} /> {file ? file.name : t('order.attach')}</button>
              {progress != null && <div className="h-1.5 overflow-hidden rounded-full bg-bone-200"><div className="h-full bg-ice-500 transition-all" style={{ width: `${progress}%` }} /></div>}
              <button className="btn-ice w-full" disabled={(!ref.trim() && !file) || progress != null}>{t('order.submitPayment')}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
