import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useAuth } from '../components/Layout'
import { Field, LangToggle, Spinner, ThemeToggle } from '../components/ui'
import { STORE_URL } from '../lib/api'
import { Rich, usePrefs } from '../context/Prefs'

export default function Login() {
  const { login, user } = useAuth()
  const { t } = usePrefs()
  const navigate = useNavigate()
  const loc = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={loc.state?.from || '/'} replace />
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await login(form.email.trim(), form.password); navigate(loc.state?.from || '/', { replace: true }) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="relative grid min-h-dvh place-items-center bg-night p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-bone-100 p-1"><LangToggle className="border-0" /><ThemeToggle className="h-8 w-8" /></div>
      <form onSubmit={submit} noValidate={false} className="w-full max-w-sm animate-fade-up rounded-3xl bg-bone-100 p-8 shadow-lift">
        <svg viewBox="0 0 32 32" className="h-10 w-10 text-ink" fill="none" aria-hidden="true"><path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M9.2 20.6h13.6" stroke="#8FD6F5" strokeWidth="3" strokeLinecap="round" /><path d="M20.4 23.4 28.6 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        <h1 className="h-display mt-6 text-3xl">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-stone-450">{t('login.subtitle')}</p>
        <div className="mt-6 space-y-4">
          <Field label={t('login.email')}><input type="email" required autoComplete="username" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('login.password')} error={err}>
            <span className="relative block">
              <input type={show ? 'text' : 'password'} required autoComplete="current-password" className="field pr-12" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? t('login.hide') : t('login.show')} aria-pressed={show}
                className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-stone-450 hover:bg-ink/5 hover:text-ink">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </Field>
        </div>
        <div className="mt-3 text-right"><a href={`${STORE_URL}/forgot-password`} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">{t('login.forgot')}</a></div>
        <button className="btn-primary mt-5 w-full" disabled={busy}>{busy ? <Spinner /> : <><Lock size={16} /> {t('login.submit')}</>}</button>
        <p className="mt-4 text-center text-xs text-stone-450"><Rich text={t('login.noAccount')} /></p>
      </form>
    </div>
  )
}
