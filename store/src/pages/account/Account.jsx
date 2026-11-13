import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { ChevronRight, Heart, KeyRound, LogOut, MapPin, Package, Pencil, Plus, Trash2, User } from 'lucide-react'
import { api, tokens } from '../../lib/api'
import { useStore } from '../../context/Store'
import { useToast } from '../../context/Toast'
import { usePrefs } from '../../context/Prefs'
import { cls, date, STATUS, usd2, validKhPhone } from '../../lib/format'
import { useMeta } from '../../lib/meta'
import OrderView from '../../components/OrderView'
import { EmptyState, Field, Img, Modal, Spinner, StatusPill } from '../../components/ui'
import { PasswordInput } from '../Auth'

const TABS = [
  { to: '/account', key: 'account.profile', icon: User, end: true },
  { to: '/account/orders', key: 'account.orders', icon: Package },
  { to: '/wishlist', key: 'nav.wishlist', icon: Heart },
  { to: '/account/addresses', key: 'account.addresses', icon: MapPin },
  { to: '/account/password', key: 'account.password', icon: KeyRound },
]

export default function AccountLayout() {
  const { user, authReady, logout } = useStore()
  const { t } = usePrefs()
  const loc = useLocation()
  useMeta({ title: t('account.eyebrow') })
  if (!authReady) return <div className="container-x py-10"><div className="skeleton h-64" /></div>
  if (!user) return <Navigate to={`/login?next=${loc.pathname}`} replace />
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">{t('account.eyebrow')}</p>
      <h1 className="h-display mt-2 text-5xl sm:text-6xl">{t('account.hi', { name: user.full_name.split(' ')[0] })}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label={t('account.eyebrow')}>
          {TABS.map((tb) => (
            <NavLink key={tb.to} to={tb.to} end={tb.end} className={({ isActive }) => cls('chip shrink-0 lg:justify-start lg:rounded-xl lg:border-0 lg:py-3', isActive ? 'chip-active' : 'lg:bg-transparent')}>
              <tb.icon size={16} /> {t(tb.key)}
            </NavLink>
          ))}
          <button onClick={logout} className="chip shrink-0 text-signal lg:justify-start lg:rounded-xl lg:border-0 lg:bg-transparent lg:py-3"><LogOut size={16} /> {t('account.signOut')}</button>
        </nav>
        <div className="min-w-0 animate-fade-up"><Outlet /></div>
      </div>
    </div>
  )
}

export function Profile() {
  const { user, setUser } = useStore()
  const { t, lang, setLang } = usePrefs()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone || '' })
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState(null)
  useEffect(() => { api('/api/account/orders').then((o) => setRecent(o.slice(0, 3))).catch(() => setRecent([])) }, [])
  const save = async (e) => {
    e.preventDefault()
    if (form.phone && !validKhPhone(form.phone)) { setErr({ phone: t('auth.errors.phone') }); return }
    setBusy(true)
    try {
      setUser(await api('/api/account/me', { method: 'PUT', body: { full_name: form.full_name, phone: form.phone || null, locale: lang } }))
      toast.success(t('account.profileUpdated')); setErr({})
    } catch (e2) { toast.error(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={save} className="card space-y-4 p-6">
        <h2 className="font-display text-xl font-bold">{t('account.profile')}</h2>
        <Field label={t('auth.fullName')}><input className="field" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label={t('auth.email')} hint={t('account.emailHint')}><input className="field bg-bone" value={user.email} disabled /></Field>
        <Field label={t('checkout.phone')} error={err.phone}><input className="field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="012 345 678" /></Field>
        <Field label={t('account.language')}>
          <select className="field" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="km">ភាសាខ្មែរ</option></select>
        </Field>
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('common.saveChanges')}</button>
      </form>
      <div className="card p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">{t('account.recentOrders')}</h2><Link to="/account/orders" className="text-sm font-semibold underline">{t('account.allOrders')}</Link></div>
        {!recent ? <div className="skeleton mt-4 h-32" /> : recent.length === 0 ? <p className="mt-4 text-stone-450">{t('account.noOrders')} <Link to="/shop" className="font-semibold text-ink underline">{t('account.startShopping')}</Link></p> : (
          <ul className="mt-4 divide-y divide-ink/10">{recent.map((o) => <OrderRow key={o.id} o={o} />)}</ul>
        )}
      </div>
    </div>
  )
}

function OrderRow({ o }) {
  const { t } = usePrefs()
  return (
    <li>
      <Link to={`/account/orders/${o.order_number}`} className="flex items-center gap-4 py-4 transition hover:translate-x-1">
        <div className="flex -space-x-3">{o.thumbs?.slice(0, 2).map((th, i) => <Img key={i} src={th} className="h-12 w-12 rounded-xl border-2 border-white" sizes="48px" />)}</div>
        <div className="min-w-0 flex-1"><p className="keep-latin font-semibold">{o.order_number}</p><p className="text-xs text-stone-450">{date(o.created_at)} · {t(o.item_count > 1 ? 'common.items' : 'common.item', { n: o.item_count })}</p></div>
        <div className="text-right"><StatusPill map={STATUS} value={o.status} label={t(`status.${o.status}`)} /><p className="mt-1 text-sm font-semibold tabular-nums">{usd2(o.total)}</p></div>
        <ChevronRight size={18} className="text-stone-400" />
      </Link>
    </li>
  )
}

export function Orders() {
  const { t } = usePrefs()
  const [orders, setOrders] = useState(null)
  useEffect(() => { api('/api/account/orders').then(setOrders).catch(() => setOrders([])) }, [])
  if (!orders) return <div className="skeleton h-64" />
  if (!orders.length) return <EmptyState icon={Package} title={t('account.noOrdersTitle')} text={t('account.noOrdersText')} action={<Link to="/shop" className="btn-primary">{t('common.shopNow')}</Link>} />
  return <div className="card px-6"><ul className="divide-y divide-ink/10">{orders.map((o) => <OrderRow key={o.id} o={o} />)}</ul></div>
}

export function OrderDetail() {
  const { t } = usePrefs()
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => { api(`/api/orders/${number}`).then(setData).catch(() => setErr(true)) }, [number])
  if (err) return <EmptyState icon={Package} title={t('order.notFound')} action={<Link to="/account/orders" className="btn-primary">{t('nav.myOrders')}</Link>} />
  if (!data) return <div className="skeleton h-96" />
  return (
    <div>
      <Link to="/account/orders" className="mb-4 inline-block text-sm font-semibold text-stone-450 hover:text-ink">{t('account.allOrdersBack')}</Link>
      <OrderView order={data.order} payment={data.payment} token={null} />
    </div>
  )
}

const EMPTY_ADDR = { label: 'Home', full_name: '', phone: '', province: 'Phnom Penh', district: '', address_line: '', note: '', is_default: false }

export function Addresses() {
  const { settings, user } = useStore()
  const { t } = usePrefs()
  const toast = useToast()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState({})
  const load = () => api('/api/account/addresses').then(setList)
  useEffect(() => { load() }, [])
  const save = async (e) => {
    e.preventDefault()
    const { id, ...body } = edit
    try {
      await api(id ? `/api/account/addresses/${id}` : '/api/account/addresses', { method: id ? 'PUT' : 'POST', body })
      toast.success(t('account.addressSaved')); setEdit(null); setErrors({}); load()
    } catch (e2) { setErrors(e2.data?.errors ? Object.fromEntries(e2.data.errors.map((x) => [x.field, x.message])) : {}); toast.error(e2.message) }
  }
  const remove = async (a) => { if (window.confirm(t('account.deleteAddress'))) { await api(`/api/account/addresses/${a.id}`, { method: 'DELETE' }); load() } }
  const up = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div>
      <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">{t('account.savedAddresses')}</h2>
        <button className="btn-primary !min-h-[42px] text-sm" onClick={() => setEdit({ ...EMPTY_ADDR, full_name: user.full_name, phone: user.phone || '' })}><Plus size={16} /> {t('common.add')}</button></div>
      {!list ? <div className="skeleton h-40" /> : list.length === 0 ? <EmptyState icon={MapPin} title={t('account.noAddresses')} text={t('account.noAddressesText')} /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className={cls('card p-5', a.is_default && 'ring-2 ring-ink')}>
              <div className="flex items-center justify-between"><p className="font-semibold">{a.label}</p>{a.is_default && <span className="text-xs font-semibold text-ice-700">{t('common.default')}</span>}</div>
              <p className="mt-2 text-sm">{a.full_name} · {a.phone}</p>
              <p className="text-sm text-stone-450">{a.address_line}{a.district && `, ${a.district}`}, {a.province}</p>
              <div className="mt-4 flex gap-4 text-sm">
                <button onClick={() => setEdit(a)} className="flex items-center gap-1 font-semibold"><Pencil size={14} /> {t('common.edit')}</button>
                <button onClick={() => remove(a)} className="flex items-center gap-1 text-signal"><Trash2 size={14} /> {t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} label={t('account.addresses')} className="sm:max-w-lg">
        {edit && (
          <form onSubmit={save} className="space-y-4 p-6">
            <h3 className="font-display text-xl font-bold">{edit.id ? t('account.editAddress') : t('account.newAddress')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('account.label')}><input className="field" value={edit.label} onChange={up('label')} /></Field>
              <Field label={t('auth.fullName')} error={errors.full_name}><input className="field" required value={edit.full_name} onChange={up('full_name')} /></Field>
              <Field label={t('checkout.phone')} error={errors.phone}><input className="field" type="tel" required value={edit.phone} onChange={up('phone')} /></Field>
              <Field label={t('checkout.province')} error={errors.province}><select className="field" value={edit.province} onChange={up('province')}>{(settings?.provinces || ['Phnom Penh']).map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label={t('checkout.district')}><input className="field" value={edit.district} onChange={up('district')} /></Field>
              <Field label={t('checkout.street')} error={errors.address_line}><input className="field" required value={edit.address_line} onChange={up('address_line')} /></Field>
              <Field label={t('account.note')} className="sm:col-span-2"><input className="field" value={edit.note} onChange={up('note')} /></Field>
            </div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={edit.is_default} onChange={up('is_default')} className="h-5 w-5 accent-ink" /> {t('account.useDefault')}</label>
            <button className="btn-primary w-full">{t('account.saveAddress')}</button>
          </form>
        )}
      </Modal>
    </div>
  )
}

export function ChangePassword() {
  const toast = useToast()
  const { setUser } = useStore()
  const { t } = usePrefs()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm) { setErr(t('auth.errors.match')); return }
    if (form.new_password.length < 8 || !/[A-Za-z]/.test(form.new_password) || !/\d/.test(form.new_password)) { setErr(t('auth.errors.password')); return }
    setBusy(true); setErr('')
    try {
      const r = await api('/api/account/password', { method: 'POST', body: { current_password: form.current_password, new_password: form.new_password } })
      tokens.set(r); setUser(r.user)
      toast.success(t('account.passwordChanged'))
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="card max-w-lg space-y-4 p-6">
      <h2 className="font-display text-xl font-bold">{t('account.changePassword')}</h2>
      <Field label={t('account.currentPassword')}><PasswordInput autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} /></Field>
      <Field label={t('account.newPassword')} hint={t('auth.passwordHint')}><PasswordInput autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} /></Field>
      <Field label={t('account.confirmNew')} error={err}><PasswordInput autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
      <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('account.updatePassword')}</button>
    </form>
  )
}
