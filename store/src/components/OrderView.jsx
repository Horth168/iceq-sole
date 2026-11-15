// Shared order details: status timeline, KHQR / bank payment, items and totals.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import KhqrCard from './KhqrCard'
import { AlertTriangle, Check, Copy, ExternalLink, ImagePlus, Loader2, Package, PackageCheck, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { api, assetUrl, upload } from '../lib/api'
import { useToast } from '../context/Toast'
import { Rich, usePrefs } from '../context/Prefs'
import { cls, dateTime, khr, PAYMENT_STATUS, STATUS, usd2, sizeLabel } from '../lib/format'
import { Img, Spinner, StatusPill } from './ui'

const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']
const ICON = { pending: Package, confirmed: Check, processing: Package, shipped: Truck, delivered: PackageCheck }

export default function OrderView({ order: initial, payment: initialPay, token, onChange }) {
  const { t } = usePrefs()
  const [order, setOrder] = useState(initial)
  const [pay, setPay] = useState(initialPay)
  const toast = useToast()
  const [justPaid, setJustPaid] = useState(false)
  useEffect(() => { setOrder(initial); setPay(initialPay) }, [initial, initialPay])
  const update = (o, p) => { setOrder(o); if (p) setPay(p); onChange?.(o) }

  // Live updates: while a payment is outstanding, re-read the order every 5 s (and right away when the
  // customer comes back to the app), so a confirmation made on Telegram shows up without refreshing.
  const waiting = !['cancelled', 'refunded'].includes(order.status) && order.payment_method !== 'cod' && order.payment_status !== 'paid'
  const last = useRef(order.payment_status)
  useEffect(() => {
    if (!waiting) return
    let alive = true
    const poll = async () => {
      if (document.hidden) return
      try {
        const r = await api(`/api/orders/${order.order_number}`, { query: { t: token } })
        if (!alive) return
        const before = last.current
        last.current = r.order.payment_status
        if (r.order.payment_status !== before || r.order.status !== order.status) {
          update(r.order, r.payment)
          if (r.order.payment_status === 'paid') { setJustPaid(true); toast.success(t('order.confirmedToast')) }
          else if (r.order.payment_status === 'failed') toast.error(t('order.failedTitle'))
        }
      } catch { /* offline for a moment - try again next tick */ }
    }
    const tm = setInterval(poll, 5000)
    const onShow = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    return () => { alive = false; clearInterval(tm); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow) }
  }, [waiting, order.order_number, order.status, token]) // eslint-disable-line react-hooks/exhaustive-deps
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
          <div className={cls('card relative overflow-hidden p-5 sm:p-6', justPaid && 'animate-pop-in')}>
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <span className={cls('grid h-14 w-14 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30', justPaid && 'animate-check-in')}><Check size={28} strokeWidth={3} /></span>
              <div><p className="font-display text-xl font-bold">{t('order.paidTitle')}</p><p className="text-sm text-stone-450">{t('order.paidText')}</p></div>
            </div>
          </div>
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
                  <p className="text-sm text-stone-450">{it.color} · {sizeLabel(it.size)} · {t('order.qty', { n: it.quantity })}</p>
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
  const [renewing, setRenewing] = useState(false)
  const renew = async () => {
    setRenewing(true)
    try {
      const r = await api(`/api/orders/${order.order_number}/payment/renew`, { method: 'POST', query: { t: token } })
      onUpdate(r.order, r.payment)
      setLeft(null)
      toast.success(t('order.newQrReady'))
    } catch (e) { toast.error(e.message) } finally { setRenewing(false) }
  }
  const failed = order.payment_status === 'failed'
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
      {failed && (
        <div className="flex flex-wrap items-start gap-3 border-b border-ink/10 bg-rose-50 p-5 sm:p-6">
          <AlertTriangle className="mt-0.5 shrink-0 text-signal" size={20} />
          <div className="min-w-0 flex-1"><p className="font-semibold">{t('order.failedTitle')}</p><p className="text-sm text-stone-450">{t('order.failedText')}</p></div>
          {isQr && <button type="button" onClick={renew} disabled={renewing} className="btn-primary !min-h-[42px] w-full sm:w-auto">{renewing ? <Spinner /> : <RefreshCw size={16} />} {t('order.newQr')}</button>}
        </div>
      )}
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr]">
        {isQr && (qr || pay.static_qr_url) && (
          <div className="mx-auto w-full max-w-[280px]">
            <KhqrCard value={qr} imageUrl={!qr ? assetUrl(pay.static_qr_url) : undefined} name={pay.merchant_name} amount={pay.amount} dim={expired || failed}>
              {(expired || failed) && qr && (
                <div className="absolute inset-0 grid place-items-center">
                  <button type="button" onClick={renew} disabled={renewing} className="btn-primary !min-h-[44px] shadow-lift">{renewing ? <Spinner /> : <RefreshCw size={16} />} {t('order.newQr')}</button>
                </div>
              )}
            </KhqrCard>
            <p className="mt-3 text-center text-xs text-stone-450">{t('order.qrHint')}</p>
            {pay.expires_at && !failed && <p className={cls('mt-1 text-center text-xs', expired ? 'font-semibold text-signal' : 'text-stone-450')}>{expired ? t('order.expiredShort') : left != null ? t('order.expiresIn', { time: mmss }) : ''}</p>}
            {!expired && !failed && <p className="mt-2 flex items-center justify-center gap-2 text-xs text-stone-450"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>{t('order.waiting')}</p>}
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
