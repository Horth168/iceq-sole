import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PackageSearch, PartyPopper } from 'lucide-react'
import { api } from '../lib/api'
import { store } from '../lib/storage'
import { saveMyOrder } from '../lib/myOrders'
import { useStore } from '../context/Store'
import OrderView from '../components/OrderView'
import { EmptyState } from '../components/ui'
import { usePrefs } from '../context/Prefs'

export default function Order() {
  const { t } = usePrefs()
  const { number } = useParams()
  const [params] = useSearchParams()
  const { user } = useStore()
  const token = params.get('t') || store.json(`iq_order_${number}`, null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    api(`/api/orders/${number}`, { query: { t: token } }).then((r) => { setData(r); if (token) saveMyOrder(r.order, token) }).catch(() => setError(true))
  }, [number, token, user?.id])
  if (error) return <EmptyState icon={PackageSearch} title={t('order.notFound')} text={t('order.notFoundText')} action={<Link to="/track" className="btn-primary">{t('order.track')}</Link>} />
  if (!data) return <div className="container-x py-10"><div className="skeleton h-96" /></div>
  const isNew = params.get('new')
  return (
    <div className="container-x pt-6 md:pt-10">
      {isNew && (
        <div className="mb-8 flex flex-col items-start gap-4 rounded-[28px] bg-ice-100 p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white"><PartyPopper size={26} /></span>
          <div>
            <h1 className="h-display text-4xl sm:text-5xl">{t('order.thanks', { name: data.order.customer_name.split(' ')[0] })}</h1>
            <p className="mt-1 text-ink-700">{data.order.payment_method === 'cod' ? t('order.placedCod') : t('order.placedPay')}</p>
          </div>
        </div>
      )}
      {!isNew && <h1 className="h-display mb-8 text-5xl">{t('order.status')}</h1>}
      <OrderView order={data.order} payment={data.payment} token={token} onChange={(o) => { if (token) saveMyOrder(o, token) }} />
      {!user && (
        <p className="mt-8 rounded-2xl bg-bone-100 p-4 text-center text-sm text-stone-450">{t('order.findAgain')} <Link to="/track" className="font-semibold text-ink underline">{t('nav.trackOrder')}</Link>. {t('order.bookmark')} <Link to="/register" className="font-semibold text-ink underline">{t('order.createAccount')}</Link> {t('order.forHistory')}</p>
      )}
    </div>
  )
}
