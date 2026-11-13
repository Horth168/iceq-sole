import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { cls, khr, usd } from '../lib/format'
import { EmptyState, Img, QtyStepper, Spinner } from '../components/ui'
import { usePrefs } from '../context/Prefs'

export default function Cart() {
  const { t } = usePrefs()
  const { cart, updateQty, removeItem, changeVariant, applyDiscount, removeDiscount, settings, refreshCart } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [code, setCode] = useState('')
  const [codeErr, setCodeErr] = useState('')
  useEffect(() => { refreshCart() }, []) // eslint-disable-line

  const run = async (id, fn) => {
    setBusy(id)
    try { await fn() } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  const onCode = async (e) => {
    e.preventDefault()
    setCodeErr('')
    setBusy('code')
    try { await applyDiscount(code); setCode(''); toast.success(t('bag.codeApplied')) } catch (err) { setCodeErr(err.message) } finally { setBusy(null) }
  }

  if (!cart) return <div className="container-x py-10"><div className="skeleton h-80" /></div>
  if (!cart.items.length) {
    return <EmptyState icon={ShoppingBag} title={t('bag.empty')} text={t('bag.emptyLong')} action={<Link to="/shop" className="btn-primary">{t('bag.startShopping')}</Link>} />
  }
  const free = settings?.delivery?.free_shipping_threshold
  const remaining = free ? Math.max(0, free - (cart.subtotal - cart.discount_amount)) : 0
  const hasIssue = cart.items.some((i) => i.available < i.quantity)

  return (
    <div className="container-x pt-6 md:pt-10">
      <h1 className="h-display text-5xl sm:text-6xl">{t('bag.heading')}</h1>
      <p className="mt-2 text-stone-450">{t(cart.count === 1 ? 'common.item' : 'common.items', { n: cart.count })}</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          {free > 0 && (
            <div className="mb-6 rounded-2xl bg-white p-4 shadow-soft">
              <p className="text-sm">{remaining > 0 ? t('bag.freeProgress', { amount: usd(remaining) }) : <b>{t('bag.freeUnlocked')}</b>}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bone-200"><div className="h-full rounded-full bg-ice-500 transition-all duration-500" style={{ width: `${Math.min(100, ((free - remaining) / free) * 100)}%` }} /></div>
            </div>
          )}
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {cart.items.map((it) => <CartLine key={it.id} it={it} busy={busy === it.id} run={run} updateQty={updateQty} removeItem={removeItem} changeVariant={changeVariant} />)}
          </ul>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="card p-6">
            <h2 className="font-display text-xl font-bold">{t('bag.summary')}</h2>
            <form onSubmit={onCode} className="mt-5">
              {cart.discount_code ? (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-emerald-800"><Tag size={15} /> {cart.discount_code}</span>
                  <button type="button" onClick={() => run('code', removeDiscount)} aria-label={t('bag.removeCode')} className="text-emerald-800"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('bag.codePlaceholder')} aria-label={t('bag.codePlaceholder')} className="field !min-h-[46px] uppercase" />
                  <button className="btn-outline !min-h-[46px] shrink-0 !px-5" disabled={!code || busy === 'code'}>{busy === 'code' ? <Spinner className="h-4 w-4" /> : t('common.apply')}</button>
                </div>
              )}
              {(codeErr || cart.messages?.[0]) && <p className="mt-2 text-xs font-medium text-signal">{codeErr || cart.messages[0]}</p>}
            </form>
            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between"><dt>{t('common.subtotal')}</dt><dd className="tabular-nums">{usd(cart.subtotal)}</dd></div>
              {cart.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('common.discount')}</dt><dd className="tabular-nums">−{usd(cart.discount_amount)}</dd></div>}
              <div className="flex justify-between"><dt>{t('common.delivery')}</dt><dd className="tabular-nums">{cart.delivery_fee === 0 ? t('common.free') : t('bag.from', { amount: usd(cart.delivery_fee) })}</dd></div>
              <div className="flex items-baseline justify-between border-t border-ink/10 pt-3 text-base font-bold"><dt>{t('bag.estimated')}</dt><dd className="tabular-nums">{usd(cart.total)}</dd></div>
              <p className="text-right text-xs text-stone-450">≈ {khr(cart.total_khr)}</p>
            </dl>
            <button onClick={() => navigate('/checkout')} disabled={hasIssue} className="btn-primary mt-6 w-full">{t('bag.checkout')} <ArrowRight size={18} /></button>
            {hasIssue && <p className="mt-2 text-center text-xs text-signal">{t('bag.fixIssues')}</p>}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-stone-450"><Lock size={12} /> {t('bag.secure')}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function CartLine({ it, busy, run, updateQty, removeItem, changeVariant }) {
  const { t, pick } = usePrefs()
  const [options, setOptions] = useState(null)
  const loadOptions = () => !options && api(`/api/products/${it.product.slug}`).then((p) => setOptions(p.variants)).catch(() => {})
  const sameColor = options?.filter((v) => v.color === it.color) || []
  const colors = options ? [...new Map(options.map((v) => [v.color, v])).values()] : []
  return (
    <li className={cls('flex gap-4 py-5 transition sm:gap-6', busy && 'pointer-events-none opacity-50')}>
      <Link to={`/product/${it.product.slug}`} className="shrink-0"><Img image={it.image} className="h-28 w-28 rounded-2xl sm:h-36 sm:w-36" sizes="144px" /></Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow !text-[10px]">{it.product.brand}</p>
            <Link to={`/product/${it.product.slug}`} className="block truncate font-semibold hover:underline">{pick(it.product, 'name')}</Link>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{usd(it.line_total)}</p>
            {it.compare_price && <p className="text-xs text-stone-450 line-through">{usd(it.compare_price * it.quantity)}</p>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" onFocus={loadOptions} onMouseEnter={loadOptions}>
          <select aria-label={t('bag.colour')} value={it.color} onChange={(e) => { const v = options.find((x) => x.color === e.target.value && x.available > 0); if (v) run(it.id, () => changeVariant(it.id, v.id, 1)) }}
            className="h-9 rounded-full border border-ink/15 bg-white px-3 text-xs font-semibold">
            {options ? colors.map((c) => <option key={c.color} value={c.color}>{c.color}</option>) : <option>{it.color}</option>}
          </select>
          <select aria-label={t('bag.size')} value={it.size} onChange={(e) => { const v = sameColor.find((x) => x.size === e.target.value); if (v) run(it.id, () => changeVariant(it.id, v.id, Math.min(it.quantity, v.available))) }}
            className="h-9 rounded-full border border-ink/15 bg-white px-3 text-xs font-semibold">
            {options ? sameColor.map((v) => <option key={v.id} value={v.size} disabled={v.available <= 0}>EU {v.size}{v.available <= 0 ? ` — ${t('bag.soldOut')}` : ''}</option>) : <option value={it.size}>EU {it.size}</option>}
          </select>
        </div>
        {it.available < it.quantity && <p className="mt-2 text-xs font-semibold text-signal">{it.available ? t('bag.onlyLeftLower', { n: it.available }) : t('bag.soldOutRemove')}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <QtyStepper compact value={it.quantity} max={Math.max(1, Math.min(10, it.available))} onChange={(q) => run(it.id, () => updateQty(it.id, q))} />
          <button onClick={() => run(it.id, () => removeItem(it.id))} className="flex items-center gap-1.5 text-sm text-stone-450 hover:text-signal"><Trash2 size={15} /> {t('common.remove')}</button>
        </div>
      </div>
    </li>
  )
}
