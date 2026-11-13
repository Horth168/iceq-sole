import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { validKhPhone } from '../lib/format'
import { Field, Spinner } from '../components/ui'
import { LogoMark } from '../components/Logo'

function Shell({ title, sub, children }) {
  return (
    <div className="container-x grid min-h-[80dvh] items-center gap-10 py-10 lg:grid-cols-2">
      <div className="relative hidden h-[640px] overflow-hidden rounded-[28px] bg-ink lg:block">
        <img src="/images/auth-side.jpg" alt="" className="h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <div className="absolute bottom-0 p-10 text-white">
          <LogoMark className="h-12 w-12" color="#fff" />
          <p className="h-display mt-6 text-5xl">Members get<br />first dibs.</p>
          <p className="mt-3 max-w-sm text-white/70">Faster checkout, saved addresses, order tracking and early access to drops.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md">
        <h1 className="h-display text-5xl">{title}</h1>
        <p className="mt-3 text-stone-450">{sub}</p>
        {children}
      </div>
    </div>
  )
}

function Password({ value, onChange, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} required minLength={8} autoComplete={autoComplete} value={value} onChange={onChange} className="field pr-12" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-stone-450">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export function Login() {
  const { login, user } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') ? params.get('next') : '/account'
  const [form, setForm] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { const u = await login(form.email, form.password); toast.success(`Welcome back, ${u.full_name.split(' ')[0]}`); navigate(next, { replace: true }) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Sign in" sub="Welcome back to IceQ Sole.">
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Email"><input type="email" required autoComplete="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" error={err}><Password autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-450">New to IceQ Sole? <Link to={`/register${params.get('next') ? `?next=${params.get('next')}` : ''}`} className="font-semibold text-ink underline">Create an account</Link></p>
      <p className="mt-2 text-center text-sm text-stone-450">Forgot your password? Contact us on Telegram or phone and we'll reset it.</p>
    </Shell>
  )
}

export function Register() {
  const { register, user } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') ? params.get('next') : '/account'
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.phone && !validKhPhone(form.phone)) errs.phone = 'Enter a valid Cambodian phone number'
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = 'Use at least 8 characters with letters and numbers'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await register({ ...form, phone: form.phone || null })
      toast.success('Account created — welcome to IceQ Sole!')
      navigate(next, { replace: true })
    } catch (e2) {
      setErrors(e2.data?.errors ? Object.fromEntries(e2.data.errors.map((x) => [x.field, x.message])) : { email: e2.message })
    } finally { setBusy(false) }
  }
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <Shell title="Join IceQ" sub="Create an account in seconds.">
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Full name" error={errors.full_name}><input required minLength={2} autoComplete="name" className="field" value={form.full_name} onChange={up('full_name')} /></Field>
        <Field label="Email" error={errors.email}><input type="email" required autoComplete="email" className="field" value={form.email} onChange={up('email')} /></Field>
        <Field label="Phone (optional)" error={errors.phone}><input type="tel" inputMode="tel" autoComplete="tel" placeholder="012 345 678" className="field" value={form.phone} onChange={up('phone')} /></Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters, letters and numbers"><Password autoComplete="new-password" value={form.password} onChange={up('password')} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Create account'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-450">Already a member? <Link to="/login" className="font-semibold text-ink underline">Sign in</Link></p>
    </Shell>
  )
}
