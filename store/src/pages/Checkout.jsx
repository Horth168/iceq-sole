import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banknote, Building2, Check, ChevronLeft, Lock, QrCode } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { cls, khr, usd, uuid, validKhPhone } from '../lib/format'
import { store } from '../lib/storage'
import { Field, Img, Spinner } from '../components/ui'
import { usePrefs } from '../context/Prefs'

const METHODS = [
  { id: 'khqr', title: 'checkout.methods.khqr', text: 'checkout.methods.khqrText', icon: QrCode, flag: 'khqr_enabled' },
  { id: 'bank_transfer', title: 'checkout.methods.bank', text: 'checkout.methods.bankText', icon: Building2, flag: 'bank_transfer_enabled' },
  { id: 'cod', title: 'checkout.methods.cod', text: 'checkout.methods.codText', icon: Banknote, flag: 'cod_enabled' },
]

export default function Checkout() {
  const { t, pick } = usePrefs()
  const { cart, user, settings, setCart, refreshCart } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [addresses, setAddresses] = useState([])
  const [form, setForm] = useState(() => ({
    full_name: '', phone: '', email: '', province: 'Phnom Penh', district: '', address_line: '', delivery_note: '',
    payment_method: 'khqr', save_address: true, ...store.json('iq_checkout', {}),
  }))
  const [errors, setErrors] = useState({})
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = useRef(store.get('iq_checkout_key') || uuid())
  useEffect(() => { store.set('iq_checkout_key', key.current) }, [])
  useEffect(() => { refreshCart() }, []) // eslint-disable-line

  useEffect(() => {
    if (!user) return
    setForm((f) => ({ ...f, full_name: f.full_name || user.full_name, phone: f.phone || user.phone || '', email: f.email || user.email }))
    api('/api/account/addresses').then((a) => {
      setAddresses(a)
      const d = a.find((x) => x.is_default)
      if (d) pickAddress(d)
    }).catch(() => {})
  }, [user?.id]) // eslint-disable-line

  // save draft (never payment data)
  useEffect(() => {
    const { save_address, ...draft } = form
    store.setJson('iq_checkout', draft)
  }, [form])

  useEffect(() => {
    if (!cart?.items.length) return
    const t = setTimeout(() => api('/api/cart/quote', { method: 'POST', body: { province: form.province } }).then(setQuote).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [form.province, cart?.subtotal, cart?.discount_code]) // eslint-disable-line

  const methods = useMemo(() => METHODS.filter((m) => settings?.payments?.[m.flag]), [settings])
  useEffect(() => { if (methods.length && !methods.find((m) => m.id === form.payment_method)) setForm((f) => ({ ...f, payment_method: methods[0].id })) }, [methods]) // eslint-disable-line

  const pickAddress = (a) => setForm((f) => ({ ...f, full_name: a.full_name, phone: a.phone, province: a.province, district: a.district, address_line: a.address_line, delivery_note: a.note || f.delivery_note }))
  const upd = (k) => (e) => { setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErrors({ ...errors, [k]: undefined }) }

  const validate = () => {
    const e = {}
    if (form.full_name.trim().length < 2) e.full_name = t('checkout.errors.name')
    if (!validKhPhone(form.phone)) e.phone = t('checkout.errors.phone')
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = t('checkout.errors.email')
    if (!form.province) e.province = t('checkout.errors.province')
    if (form.address_line.trim().length < 3) e.address_line = t('checkout.errors.street')
    setErrors(e)
    if (Object.keys(e).length) document.querySelector(`[name="${Object.keys(e)[0]}"]`)?.focus()
    return !Object.keys(e).length
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate() || busy) return
    setBusy(true)
    try {
      const body = { ...form, email: form.email || null, idempotency_key: key.current, save_address: !!user && form.save_address }
      const res = await api('/api/checkout', { method: 'POST', body })
      store.remove('iq_checkout_key')
      store.setJson(`iq_order_${res.order.order_number}`, res.access_token)
      setCart({ ...cart, items: [], count: 0 })
      navigate(`/order/${res.order.order_number}?t=${res.access_token}&new=1`, { replace: true })
    } catch (err) {
      if (err.data?.errors) setErrors(Object.fromEntries(err.data.errors.map((x) => [x.field, x.message])))
      toast.error(err.message)
      if (err.status === 409) refreshCart()
      key.current = uuid()
      store.set('iq_checkout_key', key.current)
    } finally {
      setBusy(false)
    }
  }

  if (cart && !cart.items.length) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="font-display text-3xl font-bold">{t('checkout.emptyBag')}</h1>
        <Link to="/shop" className="btn-primary mt-6">{t('checkout.continueShopping')}</Link>
      </div>
    )
  }
  const q = quote || cart
  const provinces = settings?.provinces || ['Phnom Penh']

  return (
    <div className="container-x max-w-6xl pt-4 md:pt-8">
      <h1 className="h-display mt-2 text-5xl sm:text-6xl">{t('checkout.title')}</h1>
      {!user && (
        <p className="mt-3 text-sm text-stone-450">{t('checkout.guest')} <Link to="/login?next=/checkout" className="font-semibold text-ink underline">{t('checkout.signInFaster')}</Link> {t('checkout.guestRest')}</p>
      )}
      <form onSubmit={submit} noValidate className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <section>
            <Step n={1} title={t('checkout.contact')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t('checkout.fullName')} *`} error={errors.full_name}><input name="full_name" autoComplete="name" className="field" value={form.full_name} onChange={upd('full_name')} /></Field>
              <Field label={`${t('checkout.phone')} *`} error={errors.phone} hint={t('checkout.phoneHint')}>
                <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="012 345 678" className="field" value={form.phone} onChange={upd('phone')} />
              </Field>
              <Field label={t('checkout.email')} error={errors.email} className="sm:col-span-2"><input name="email" type="email" autoComplete="email" className="field" value={form.email} onChange={upd('email')} /></Field>
            </div>
          </section>

          <section>
            <Step n={2} title={t('checkout.address')} />
            {addresses.length > 0 && (
              <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
                {addresses.map((a) => (
                  <button type="button" key={a.id} onClick={() => pickAddress(a)}
                    className={cls('min-w-[200px] rounded-2xl border bg-white p-3 text-left text-sm transition', form.address_line === a.address_line && form.province === a.province ? 'border-ink' : 'border-ink/10')}>
                    <p className="font-semibold">{a.label}</p><p className="truncate text-stone-450">{a.address_line}, {a.province}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t('checkout.province')} *`} error={errors.province}>
                <select name="province" className="field" value={form.province} onChange={upd('province')}>
                  {provinces.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label={t('checkout.district')}><input name="district" className="field" autoComplete="address-level2" value={form.district} onChange={upd('district')} placeholder={t('checkout.districtPh')} /></Field>
              <Field label={`${t('checkout.street')} *`} error={errors.address_line} className="sm:col-span-2">
                <input name="address_line" className="field" autoComplete="street-address" value={form.address_line} onChange={upd('address_line')} placeholder={t('checkout.streetPh')} />
              </Field>
              <Field label={t('checkout.instructions')} className="sm:col-span-2">
                <textarea name="delivery_note" className="field min-h-[90px]" maxLength={500} value={form.delivery_note} onChange={upd('delivery_note')} placeholder={t('checkout.instructionsPh')} />
              </Field>
              {user && (
                <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={form.save_address} onChange={upd('save_address')} className="h-5 w-5 accent-ink" /> {t('checkout.saveAddress')}</label>
              )}
            </div>
          </section>

          <section>
            <Step n={3} title={t('checkout.payment')} />
            <div className="grid gap-3" role="radiogroup">
              {methods.map((m) => {
                const on = form.payment_method === m.id
                return (
                  <label key={m.id} className={cls('flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white p-4 transition', on ? 'border-ink' : 'border-transparent shadow-soft hover:border-ink/20')}>
                    <input type="radio" name="payment_method" value={m.id} checked={on} onChange={upd('payment_method')} className="sr-only" />
                    <span className={cls('grid h-12 w-12 shrink-0 place-items-center rounded-xl', on ? 'bg-ink text-white' : 'bg-bone text-ink')}><m.icon size={22} /></span>
                    <span className="flex-1"><span className="block font-semibold">{t(m.title)}</span><span className="block text-sm text-stone-450">{t(m.text)}</span></span>
                    <span className={cls('grid h-6 w-6 place-items-center rounded-full border-2', on ? 'border-ink bg-ink text-white' : 'border-ink/20')}>{on && <Check size={14} strokeWidth={3} />}</span>
                  </label>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-stone-450">{t('checkout.paymentNote')}</p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="font-display text-xl font-bold">{t('checkout.yourOrder')}</h2>
            <ul className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
              {cart?.items.map((it) => (
                <li key={it.id} className="flex gap-3">
                  <div className="relative"><Img image={it.image} className="h-16 w-16 rounded-xl" sizes="64px" />
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{it.quantity}</span></div>
                  <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold">{pick(it.product, 'name')}</p><p className="text-stone-450">{it.color} · EU {it.size}</p></div>
                  <p className="text-sm font-semibold tabular-nums">{usd(it.line_total)}</p>
                </li>
              ))}
            </ul>
            {q && (
              <dl className="mt-5 space-y-2 border-t border-ink/10 pt-4 text-sm">
                <div className="flex justify-between"><dt>{t('common.subtotal')}</dt><dd className="tabular-nums">{usd(q.subtotal)}</dd></div>
                {q.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('common.discount')} {q.discount_code && `(${q.discount_code})`}</dt><dd className="tabular-nums">−{usd(q.discount_amount)}</dd></div>}
                <div className="flex justify-between"><dt>{t('checkout.deliveryTo', { province: form.province })}</dt><dd className="tabular-nums">{q.delivery_fee === 0 ? t('common.free') : usd(q.delivery_fee)}</dd></div>
                {q.tax_amount > 0 && <div className="flex justify-between text-stone-450"><dt>{settings?.tax?.label || 'Tax'} {settings?.tax?.inclusive ? t('checkout.taxIncluded') : ''}</dt><dd className="tabular-nums">{usd(q.tax_amount)}</dd></div>}
                <div className="flex items-baseline justify-between border-t border-ink/10 pt-3 text-lg font-bold"><dt>{t('common.total')}</dt><dd className="tabular-nums">{usd(q.total)}</dd></div>
                <p className="text-right text-xs text-stone-450">≈ {khr(q.total_khr)}</p>
              </dl>
            )}
            <button className="btn-primary mt-6 w-full" disabled={busy || !cart}>
              {busy ? <><Spinner className="h-4 w-4" /> {t('checkout.placing')}</> : <><Lock size={16} /> {t('checkout.placeOrder')} {q && `· ${usd(q.total)}`}</>}
            </button>
            <p className="mt-3 text-center text-xs text-stone-450">{t('checkout.agree')}</p>
          </div>
        </aside>
      </form>
    </div>
  )
}

function Step({ n, title }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  )
}
