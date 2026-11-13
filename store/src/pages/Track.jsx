import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageSearch } from 'lucide-react'
import { api } from '../lib/api'
import { store } from '../lib/storage'
import { Field, Spinner } from '../components/ui'
import { usePrefs } from '../context/Prefs'

export default function Track() {
  const { t } = usePrefs()
  const [form, setForm] = useState({ order_number: '', contact: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api('/api/orders/track', { method: 'POST', body: { order_number: form.order_number.trim().toUpperCase(), contact: form.contact.trim() } })
      store.setJson(`iq_order_${r.order.order_number}`, r.access_token)
      navigate(`/order/${r.order.order_number}?t=${r.access_token}`)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="container-x max-w-lg py-12 md:py-20">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-soft"><PackageSearch size={24} /></span>
      <h1 className="h-display mt-6 text-5xl">{t('track.title')}</h1>
      <p className="mt-3 text-stone-450">{t('track.text')}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label={t('track.number')}><input required className="field uppercase" placeholder="IQ261113-ABCDE" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></Field>
        <Field label={t('track.contact')} error={err}><input required className="field" placeholder="012 345 678" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('track.find')}</button>
      </form>
    </div>
  )
}
