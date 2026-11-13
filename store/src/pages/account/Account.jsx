import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { ChevronRight, Heart, KeyRound, LogOut, MapPin, Package, Pencil, Plus, Trash2, User } from 'lucide-react'
import { api, tokens } from '../../lib/api'
import { useStore } from '../../context/Store'
import { useToast } from '../../context/Toast'
import { cls, date, STATUS, usd2, validKhPhone } from '../../lib/format'
import OrderView from '../../components/OrderView'
import { EmptyState, Field, Img, Modal, Spinner, StatusPill } from '../../components/ui'

const TABS = [
  { to: '/account', label: 'Profile', icon: User, end: true },
  { to: '/account/orders', label: 'Orders', icon: Package },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/password', label: 'Password', icon: KeyRound },
]

export default function AccountLayout() {
  const { user, authReady, logout } = useStore()
  const loc = useLocation()
  if (!authReady) return <div className="container-x py-10"><div className="skeleton h-64" /></div>
  if (!user) return <Navigate to={`/login?next=${loc.pathname}`} replace />
  return (
    <div className="container-x pt-6 md:pt-10">
      <p className="eyebrow">My account</p>
      <h1 className="h-display mt-2 text-5xl sm:text-6xl">Hi, {user.full_name.split(' ')[0]}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Account">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cls('chip shrink-0 lg:justify-start lg:rounded-xl lg:border-0 lg:py-3', isActive ? 'chip-active' : 'lg:bg-transparent')}>
              <t.icon size={16} /> {t.label}
            </NavLink>
          ))}
          <button onClick={logout} className="chip shrink-0 text-signal lg:justify-start lg:rounded-xl lg:border-0 lg:bg-transparent lg:py-3"><LogOut size={16} /> Sign out</button>
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}

export function Profile() {
  const { user, setUser } = useStore()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone || '' })
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState(null)
  useEffect(() => { api('/api/account/orders').then((o) => setRecent(o.slice(0, 3))).catch(() => setRecent([])) }, [])
  const save = async (e) => {
    e.preventDefault()
    if (form.phone && !validKhPhone(form.phone)) { setErr({ phone: 'Enter a valid Cambodian phone number' }); return }
    setBusy(true)
    try { setUser(await api('/api/account/me', { method: 'PUT', body: { full_name: form.full_name, phone: form.phone || null } })); toast.success('Profile updated'); setErr({}) } catch (e2) { toast.error(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={save} className="card space-y-4 p-6">
        <h2 className="font-display text-xl font-bold">Profile</h2>
        <Field label="Full name"><input className="field" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Email" hint="Contact us to change your email"><input className="field bg-bone" value={user.email} disabled /></Field>
        <Field label="Phone" error={err.phone}><input className="field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="012 345 678" /></Field>
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save changes'}</button>
      </form>
      <div className="card p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Recent orders</h2><Link to="/account/orders" className="text-sm font-semibold underline">All orders</Link></div>
        {!recent ? <div className="skeleton mt-4 h-32" /> : recent.length === 0 ? <p className="mt-4 text-stone-450">No orders yet. <Link to="/shop" className="font-semibold text-ink underline">Start shopping</Link></p> : (
          <ul className="mt-4 divide-y divide-ink/10">{recent.map((o) => <OrderRow key={o.id} o={o} />)}</ul>
        )}
      </div>
    </div>
  )
}

function OrderRow({ o }) {
  return (
    <li>
      <Link to={`/account/orders/${o.order_number}`} className="flex items-center gap-4 py-4">
        <div className="flex -space-x-3">{o.thumbs?.slice(0, 2).map((t, i) => <Img key={i} src={t} className="h-12 w-12 rounded-xl border-2 border-white" sizes="48px" />)}</div>
        <div className="min-w-0 flex-1"><p className="font-semibold">{o.order_number}</p><p className="text-xs text-stone-450">{date(o.created_at)} · {o.item_count} item{o.item_count > 1 ? 's' : ''}</p></div>
        <div className="text-right"><StatusPill map={STATUS} value={o.status} /><p className="mt-1 text-sm font-semibold tabular-nums">{usd2(o.total)}</p></div>
        <ChevronRight size={18} className="text-stone-400" />
      </Link>
    </li>
  )
}

export function Orders() {
  const [orders, setOrders] = useState(null)
  useEffect(() => { api('/api/account/orders').then(setOrders).catch(() => setOrders([])) }, [])
  if (!orders) return <div className="skeleton h-64" />
  if (!orders.length) return <EmptyState icon={Package} title="No orders yet" text="When you place an order it will show up here." action={<Link to="/shop" className="btn-primary">Shop now</Link>} />
  return <div className="card px-6"><ul className="divide-y divide-ink/10">{orders.map((o) => <OrderRow key={o.id} o={o} />)}</ul></div>
}

export function OrderDetail() {
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    Promise.all([api(`/api/orders/${number}`)]).then(([d]) => setData(d)).catch(() => setErr(true))
  }, [number])
  if (err) return <EmptyState icon={Package} title="Order not found" action={<Link to="/account/orders" className="btn-primary">My orders</Link>} />
  if (!data) return <div className="skeleton h-96" />
  return (
    <div>
      <Link to="/account/orders" className="mb-4 inline-block text-sm font-semibold text-stone-450 hover:text-ink">← All orders</Link>
      <OrderView order={data.order} payment={data.payment} token={null} />
    </div>
  )
}

const PROVINCE_FALLBACK = ['Phnom Penh']
const EMPTY_ADDR = { label: 'Home', full_name: '', phone: '', province: 'Phnom Penh', district: '', address_line: '', note: '', is_default: false }

export function Addresses() {
  const { settings, user } = useStore()
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
      toast.success('Address saved'); setEdit(null); setErrors({}); load()
    } catch (e2) { setErrors(e2.data?.errors ? Object.fromEntries(e2.data.errors.map((x) => [x.field, x.message])) : {}); toast.error(e2.message) }
  }
  const remove = async (a) => { if (window.confirm('Delete this address?')) { await api(`/api/account/addresses/${a.id}`, { method: 'DELETE' }); load() } }
  const up = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div>
      <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Saved addresses</h2>
        <button className="btn-primary !min-h-[42px] text-sm" onClick={() => setEdit({ ...EMPTY_ADDR, full_name: user.full_name, phone: user.phone || '' })}><Plus size={16} /> Add</button></div>
      {!list ? <div className="skeleton h-40" /> : list.length === 0 ? <EmptyState icon={MapPin} title="No saved addresses" text="Save an address for faster checkout." /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className={cls('card p-5', a.is_default && 'ring-2 ring-ink')}>
              <div className="flex items-center justify-between"><p className="font-semibold">{a.label}</p>{a.is_default && <span className="text-xs font-semibold text-ice-700">Default</span>}</div>
              <p className="mt-2 text-sm">{a.full_name} · {a.phone}</p>
              <p className="text-sm text-stone-450">{a.address_line}{a.district && `, ${a.district}`}, {a.province}</p>
              <div className="mt-4 flex gap-4 text-sm">
                <button onClick={() => setEdit(a)} className="flex items-center gap-1 font-semibold"><Pencil size={14} /> Edit</button>
                <button onClick={() => remove(a)} className="flex items-center gap-1 text-signal"><Trash2 size={14} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} label="Address" className="sm:max-w-lg">
        {edit && (
          <form onSubmit={save} className="space-y-4 p-6">
            <h3 className="font-display text-xl font-bold">{edit.id ? 'Edit address' : 'New address'}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label"><input className="field" value={edit.label} onChange={up('label')} /></Field>
              <Field label="Full name" error={errors.full_name}><input className="field" required value={edit.full_name} onChange={up('full_name')} /></Field>
              <Field label="Phone" error={errors.phone}><input className="field" type="tel" required value={edit.phone} onChange={up('phone')} /></Field>
              <Field label="Province" error={errors.province}><select className="field" value={edit.province} onChange={up('province')}>{(settings?.provinces || PROVINCE_FALLBACK).map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="District"><input className="field" value={edit.district} onChange={up('district')} /></Field>
              <Field label="Street / house / landmark" error={errors.address_line}><input className="field" required value={edit.address_line} onChange={up('address_line')} /></Field>
              <Field label="Note" className="sm:col-span-2"><input className="field" value={edit.note} onChange={up('note')} /></Field>
            </div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={edit.is_default} onChange={up('is_default')} className="h-5 w-5 accent-ink" /> Use as default</label>
            <button className="btn-primary w-full">Save address</button>
          </form>
        )}
      </Modal>
    </div>
  )
}

export function ChangePassword() {
  const toast = useToast()
  const { setUser } = useStore()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm) { setErr('Passwords do not match'); return }
    setBusy(true); setErr('')
    try {
      const r = await api('/api/account/password', { method: 'POST', body: { current_password: form.current_password, new_password: form.new_password } })
      tokens.set(r); setUser(r.user)
      toast.success('Password changed. Other devices were signed out.')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="card max-w-lg space-y-4 p-6">
      <h2 className="font-display text-xl font-bold">Change password</h2>
      <Field label="Current password"><input type="password" autoComplete="current-password" required className="field" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} /></Field>
      <Field label="New password" hint="At least 8 characters with letters and numbers"><input type="password" autoComplete="new-password" required minLength={8} className="field" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} /></Field>
      <Field label="Confirm new password" error={err}><input type="password" autoComplete="new-password" required className="field" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
      <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Update password'}</button>
    </form>
  )
}
