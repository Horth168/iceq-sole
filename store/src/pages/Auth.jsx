import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Lock, Mail, MailCheck, Phone, User as UserIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { Rich, usePrefs } from '../context/Prefs'
import { cls, validKhPhone } from '../lib/format'
import { useMeta } from '../lib/meta'
import { Field, Spinner } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { LangToggle, ThemeToggle } from '../components/Layout'

function Shell({ title, sub, children }) {
  const { t } = usePrefs()
  useMeta({ title })
  return (
    <div className="container-x grid min-h-[82dvh] items-center gap-10 py-8 lg:grid-cols-2 lg:py-12">
      <div className="relative hidden h-[680px] overflow-hidden rounded-[28px] bg-night lg:block">
        <img src="/images/auth-side.jpg" alt="" className="h-full w-full animate-fade-in object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/20 to-transparent" />
        <div className="absolute bottom-0 p-10 text-snow">
          <LogoMark className="h-12 w-12" color="#fff" />
          <p className="h-display mt-6 whitespace-pre-line text-5xl">{t('auth.sideTitle')}</p>
          <p className="mt-3 max-w-sm text-snow/70">{t('auth.sideText')}</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md animate-fade-up">
        <div className="mb-8 flex items-center justify-end gap-2 lg:hidden"><LangToggle /><ThemeToggle className="border border-ink/10" /></div>
        <h1 className="h-display text-5xl">{title}</h1>
        {sub && <p className="mt-3 text-stone-450">{sub}</p>}
        {children}
      </div>
    </div>
  )
}

// Text input with a leading icon
function IconInput({ icon: Icon, className = '', ...props }) {
  return (
    <div className="relative">
      <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-450" />
      <input {...props} className={cls('field pl-11', className)} />
    </div>
  )
}

// Password input whose eye button really switches type="password" <-> type="text"
export function PasswordInput({ value, onChange, autoComplete, name, invalid, ...rest }) {
  const { t } = usePrefs()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-450" />
      <input type={show ? 'text' : 'password'} name={name} required autoComplete={autoComplete} value={value} onChange={onChange}
        aria-invalid={invalid || undefined} className={cls('field pl-11 pr-12', invalid && '!border-signal')} {...rest} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')} aria-pressed={show}
        className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-stone-450 transition hover:bg-ink/5 hover:text-ink">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

function Strength({ value }) {
  const score = [/.{8,}/, /[A-Za-z]/, /\d/, /[^A-Za-z0-9]/, /.{12,}/].filter((r) => r.test(value)).length
  if (!value) return null
  return (
    <div className="mt-2 flex gap-1" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cls('h-1 flex-1 rounded-full transition-colors duration-300', i < score ? (score < 3 ? 'bg-signal' : score < 4 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-bone-300')} />)}
    </div>
  )
}

const nextFrom = (params) => (params.get('next')?.startsWith('/') ? params.get('next') : '/account')

export function Login() {
  const { login, user } = useStore()
  const { t } = usePrefs()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = nextFrom(params)
  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  const submit = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setErr(t('auth.errors.email')); return }
    setBusy(true); setErr('')
    try {
      const u = await login(form.email, form.password, form.remember)
      toast.success(t('auth.welcomeBack', { name: u.full_name.split(' ')[0] }))
      navigate(next, { replace: true })
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Shell title={t('auth.signInTitle')} sub={t('auth.signInSub')}>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <Field label={t('auth.email')}><IconInput icon={Mail} type="email" name="email" required autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={t('auth.password')}><PasswordInput name="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        {err && <p className="animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-signal" role="alert">{err}</p>}
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2.5"><input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} className="h-5 w-5 accent-ink" />{t('auth.remember')}</label>
          <Link to="/forgot-password" className="font-semibold underline-offset-4 hover:underline">{t('auth.forgot')}</Link>
        </div>
        <button className="btn-primary w-full" disabled={busy || !form.email || !form.password}>{busy ? <Spinner className="h-4 w-4" /> : t('auth.signInBtn')}</button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-450">{t('auth.newHere')} <Link to={`/register${params.get('next') ? `?next=${params.get('next')}` : ''}`} className="font-semibold text-ink underline">{t('auth.createAccount')}</Link></p>
    </Shell>
  )
}

export function Register() {
  const { register, user } = useStore()
  const { t } = usePrefs()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = nextFrom(params)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', password_confirm: '', accept_terms: false })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next} replace />
  const up = (k) => (e) => { setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErrors((x) => ({ ...x, [k]: undefined })) }
  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.full_name.trim().length < 2) errs.full_name = t('checkout.errors.name')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('auth.errors.email')
    if (form.phone && !validKhPhone(form.phone)) errs.phone = t('auth.errors.phone')
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = t('auth.errors.password')
    if (form.password !== form.password_confirm) errs.password_confirm = t('auth.errors.match')
    if (!form.accept_terms) errs.accept_terms = t('auth.errors.terms')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await register({ ...form, phone: form.phone || null })
      toast.success(t('auth.created'))
      navigate(next, { replace: true })
    } catch (e2) {
      setErrors(e2.data?.errors ? Object.fromEntries(e2.data.errors.map((x) => [x.field || 'email', x.message])) : { email: e2.message })
    } finally { setBusy(false) }
  }
  return (
    <Shell title={t('auth.registerTitle')} sub={t('auth.registerSub')}>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <Field label={t('auth.fullName')} error={errors.full_name}><IconInput icon={UserIcon} name="full_name" autoComplete="name" value={form.full_name} onChange={up('full_name')} /></Field>
        <Field label={t('auth.email')} error={errors.email}><IconInput icon={Mail} type="email" name="email" autoComplete="email" inputMode="email" value={form.email} onChange={up('email')} /></Field>
        <Field label={t('auth.phone')} error={errors.phone}><IconInput icon={Phone} type="tel" name="phone" inputMode="tel" autoComplete="tel" placeholder="012 345 678" value={form.phone} onChange={up('phone')} /></Field>
        <Field label={t('auth.password')} error={errors.password} hint={t('auth.passwordHint')}>
          <PasswordInput name="password" autoComplete="new-password" value={form.password} onChange={up('password')} invalid={!!errors.password} />
          <Strength value={form.password} />
        </Field>
        <Field label={t('auth.confirmPassword')} error={errors.password_confirm}>
          <PasswordInput name="password_confirm" autoComplete="new-password" value={form.password_confirm} onChange={up('password_confirm')} invalid={!!errors.password_confirm} />
        </Field>
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="accept_terms" checked={form.accept_terms} onChange={up('accept_terms')} className="mt-0.5 h-5 w-5 shrink-0 accent-ink" />
            <span><Rich text={t('auth.agree')} link={(txt) => <Link to="/terms" target="_blank" className="font-semibold underline">{txt}</Link>} /></span>
          </label>
          {errors.accept_terms && <p className="mt-1.5 text-xs font-medium text-signal" role="alert">{errors.accept_terms}</p>}
        </div>
        {errors.body && <p className="animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-signal" role="alert">{errors.body}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('auth.registerBtn')}</button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-450">{t('auth.haveAccount')} <Link to="/login" className="font-semibold text-ink underline">{t('auth.signInBtn')}</Link></p>
    </Shell>
  )
}

export function ForgotPassword() {
  const { t } = usePrefs()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr(t('auth.errors.email')); return }
    setBusy(true); setErr('')
    try { await api('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }); setSent(true) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Shell title={t('auth.forgotTitle')} sub={!sent ? t('auth.forgotSub') : undefined}>
      {sent ? (
        <div className="mt-8 animate-fade-up rounded-3xl bg-white p-6 shadow-soft">
          <MailCheck size={32} className="text-ice-600" />
          <p className="mt-4 font-display text-xl font-bold">{t('auth.checkEmail')}</p>
          <p className="mt-2 text-stone-450">{t('auth.checkEmailText', { email })}</p>
          <Link to="/login" className="btn-outline mt-6 w-full">{t('auth.backToSignIn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 space-y-4">
          <Field label={t('auth.email')} error={err}><IconInput icon={Mail} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={busy || !email}>{busy ? <Spinner className="h-4 w-4" /> : t('auth.sendLink')}</button>
          <p className="text-center text-sm"><Link to="/login" className="font-semibold underline">{t('auth.backToSignIn')}</Link></p>
        </form>
      )}
    </Shell>
  )
}

export function ResetPassword() {
  const { t } = usePrefs()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [form, setForm] = useState({ password: '', password_confirm: '' })
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = t('auth.errors.password')
    if (form.password !== form.password_confirm) errs.password_confirm = t('auth.errors.match')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try { await api('/api/auth/reset-password', { method: 'POST', body: { token, ...form }, auth: false }); setDone(true) } catch (e2) { setErrors({ form: e2.message }) } finally { setBusy(false) }
  }
  if (!token) {
    return (
      <Shell title={t('auth.resetTitle')}>
        <p className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-signal">{t('auth.invalidLink')}</p>
        <Link to="/forgot-password" className="btn-primary mt-6 w-full">{t('auth.requestNew')}</Link>
      </Shell>
    )
  }
  return (
    <Shell title={done ? t('auth.resetDone') : t('auth.resetTitle')} sub={done ? undefined : t('auth.resetSub')}>
      {done ? (
        <div className="mt-8 animate-fade-up rounded-3xl bg-white p-6 shadow-soft">
          <CheckCircle2 size={32} className="text-emerald-600" />
          <p className="mt-4 text-stone-450">{t('auth.resetDoneText')}</p>
          <Link to="/login" className="btn-primary mt-6 w-full">{t('auth.signInBtn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 space-y-4">
          <Field label={t('auth.newPassword')} error={errors.password} hint={t('auth.passwordHint')}>
            <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} />
            <Strength value={form.password} />
          </Field>
          <Field label={t('auth.confirmPassword')} error={errors.password_confirm}>
            <PasswordInput autoComplete="new-password" value={form.password_confirm} onChange={(e) => setForm({ ...form, password_confirm: e.target.value })} invalid={!!errors.password_confirm} />
          </Field>
          {errors.form && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-signal" role="alert">{errors.form} <Link to="/forgot-password" className="font-semibold underline">{t('auth.requestNew')}</Link></div>
          )}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('auth.resetBtn')}</button>
        </form>
      )}
    </Shell>
  )
}
