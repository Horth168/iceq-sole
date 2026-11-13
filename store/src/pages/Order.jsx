import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PackageSearch, PartyPopper } from 'lucide-react'
import { api } from '../lib/api'
import { store } from '../lib/storage'
import { useStore } from '../context/Store'
import OrderView from '../components/OrderView'
import { EmptyState } from '../components/ui'

export default function Order() {
  const { number } = useParams()
  const [params] = useSearchParams()
  const { user } = useStore()
  const token = params.get('t') || store.json(`iq_order_${number}`, null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    api(`/api/orders/${number}`, { query: { t: token } }).then(setData).catch(() => setError(true))
  }, [number, token, user?.id])
  if (error) return <EmptyState icon={PackageSearch} title="Order not found" text="Check the link, or track your order with your phone number." action={<Link to="/track" className="btn-primary">Track an order</Link>} />
  if (!data) return <div className="container-x py-10"><div className="skeleton h-96" /></div>
  const isNew = params.get('new')
  return (
    <div className="container-x pt-6 md:pt-10">
      {isNew && (
        <div className="mb-8 flex flex-col items-start gap-4 rounded-[28px] bg-ice-100 p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white"><PartyPopper size={26} /></span>
          <div>
            <h1 className="h-display text-4xl sm:text-5xl">Thank you, {data.order.customer_name.split(' ')[0]}!</h1>
            <p className="mt-1 text-ink-700">Your order is placed and your pairs are reserved. {data.order.payment_method === 'cod' ? "We'll call you to confirm delivery." : 'Complete your payment below so we can ship.'}</p>
          </div>
        </div>
      )}
      {!isNew && <h1 className="h-display mb-8 text-5xl">Order status</h1>}
      <OrderView order={data.order} payment={data.payment} token={token} />
      {!user && isNew && (
        <p className="mt-8 text-center text-sm text-stone-450">Bookmark this page to follow your order, or <Link to="/register" className="font-semibold text-ink underline">create an account</Link> for order history.</p>
      )}
    </div>
  )
}
