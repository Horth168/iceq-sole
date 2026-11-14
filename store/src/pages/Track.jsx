import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, PackageSearch } from 'lucide-react'
import { myOrders, saveMyOrder } from '../lib/myOrders'
import { dateTime, PAYMENT_STATUS, STATUS, usd2 } from '../lib/format'
import { StatusPill } from '../components/ui'
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
  const [mine, setMine] = useState(() => myOrders())
  // refresh the status of recent orders (newest 6) from the server
  useEffect(() => {
    let alive = true
    Promise.all(mine.slice(0, 6).map((o) => api(`/api/orders/${o.n}`, { query: { t: o.t } }).then((r) => { saveMyOrder(r.order, o.t); return true }).catch(() => false)))
      .then(() => { if (alive) setMine(myOrders()) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api('/api/orders/track', { method: 'POST', body: { order_number: form.order_number.trim().toUpperCase(), contact: form.contact.trim() } })
      saveMyOrder(r.order, r.access_token)
      navigate(`/order/${r.order.order_number}?t=${r.access_token}`)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="container-x max-w-lg py-12 md:py-20">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-soft"><PackageSearch size={24} /></span>
      <h1 className="h-display mt-6 text-5xl">{t('track.title')}</h1>
      {mine.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">{t('track.mine')}</h2>
          <ul className="space-y-2.5">
            {mine.slice(0, 10).map((o) => (
              <li key={o.n}>
                <Link to={`/order/${o.n}?t=${o.t}`} className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[.99]">
                  <div className="min-w-0 flex-1">
                    <p className="keep-latin font-wide text-base font-black tracking-tight">{o.n}</p>
                    <p className="text-xs text-stone-450">{o.at ? dateTime(o.at) : ''}{o.total != null && ` · ${usd2(o.total)}`}</p>
                    {o.status && <div className="mt-2 flex flex-wrap gap-1.5"><StatusPill map={STATUS} value={o.status} label={t(`status.${o.status}`)} />{o.pay && <StatusPill map={PAYMENT_STATUS} value={o.pay} label={t(`payStatus.${o.pay}`)} />}</div>}
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-stone-450" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-stone-450">{t('track.other')}</p>
        </section>
      )}
      <p className="mt-6 text-stone-450">{t('track.text')}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label={t('track.number')}><input required className="field uppercase" placeholder="IQ261113-ABCDE" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></Field>
        <Field label={t('track.contact')} error={err}><input required className="field" placeholder="012 345 678" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : t('track.find')}</button>
      </form>
    </div>
  )
}
