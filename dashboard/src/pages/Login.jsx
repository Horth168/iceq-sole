import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../components/Layout'
import { Field, Spinner } from '../components/ui'

export default function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={loc.state?.from || '/'} replace />
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await login(form.email, form.password); navigate(loc.state?.from || '/', { replace: true }) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-bone-100 p-8 shadow-lift">
        <svg viewBox="0 0 32 32" className="h-10 w-10" fill="none"><path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke="#0A0A0B" strokeWidth="3" strokeLinejoin="round" /><path d="M9.2 20.6h13.6" stroke="#8FD6F5" strokeWidth="3" strokeLinecap="round" /><path d="M20.4 23.4 28.6 30" stroke="#0A0A0B" strokeWidth="3" strokeLinecap="round" /></svg>
        <h1 className="h-display mt-6 text-3xl">Dashboard sign in</h1>
        <p className="mt-1 text-sm text-stone-450">Staff and administrators only.</p>
        <div className="mt-6 space-y-4">
          <Field label="Email"><input type="email" required autoComplete="username" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" error={err}><input type="password" required autoComplete="current-password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
        <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? <Spinner /> : <><Lock size={16} /> Sign in</>}</button>
        <p className="mt-4 text-center text-xs text-stone-450">No account yet? Run <code className="rounded bg-bone-200 px-1">python create_admin.py</code> in the backend folder.</p>
      </form>
    </div>
  )
}
