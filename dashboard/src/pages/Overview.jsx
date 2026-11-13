import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Camera, CheckCircle2, Clock, DollarSign, Package, ShoppingCart, Users, Wallet } from 'lucide-react'
import { usePrefs } from '../context/Prefs'
import { api } from '../lib/api'
import { date, PAYMENT_STATUS, STATUS, usd2 } from '../lib/format'
import { Card, PageHeader, Pill, Stat, Thumb } from '../components/ui'

function ChartTip({ active, payload, label }) {
  const { t } = usePrefs()
  return active && payload?.length ? (
  <div className="rounded-xl bg-night px-3 py-2 text-xs text-snow shadow-lift">
    <p className="mb-1 font-semibold">{date(label + 'T12:00:00Z')}</p>
    {payload.map((p) => <p key={p.dataKey}>{p.dataKey === 'revenue' ? t('overview.tipRevenue', { amount: usd2(p.value) }) : t('overview.tipOrders', { n: p.value })}</p>)}
  </div>
) : null
}

export default function Overview() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const { t, theme } = usePrefs()
  const ink = theme === 'dark' ? '#F2F1EE' : '#0A0A0B'
  useEffect(() => { api('/api/admin/dashboard', { query: { days } }).then(setD).catch((e) => setErr(e.message)) }, [days])
  if (err) return <p className="text-signal">{err}</p>
  if (!d) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>
  const k = d.kpis
  const periodRevenue = d.sales_chart.reduce((s, x) => s + x.revenue, 0)
  return (
    <div>
      <PageHeader title={t('overview.title')} subtitle={t('overview.subtitle')}
        actions={<select value={days} onChange={(e) => setDays(+e.target.value)} className="field !min-h-[42px] !w-auto">
          {[7, 30, 90, 365].map((n) => <option key={n} value={n}>{t('overview.lastDays', { n })}</option>)}</select>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('overview.revenue')} value={usd2(k.revenue)} sub={t('overview.revenueSub', { amount: usd2(periodRevenue), days })} icon={DollarSign} />
        <Stat label={t('overview.totalOrders')} value={k.total_orders} sub={t('overview.ordersSub', { pending: k.pending_orders, done: k.completed_orders })} icon={ShoppingCart} />
        <Stat label={t('overview.products')} value={k.total_products} sub={t('overview.productsSub', { n: k.active_products })} icon={Package} />
        <Stat label={t('overview.customers')} value={k.total_customers} sub={t('overview.customersSub')} icon={Users} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Link to="/orders?status=pending"><Stat label={t('overview.pending')} value={k.pending_orders} icon={Clock} tone="bg-amber-50 text-amber-700" /></Link>
        <Link to="/orders?payment_status=submitted"><Stat label={t('overview.toVerify')} value={k.awaiting_payment_verification} icon={Wallet} tone="bg-ice-50 text-ice-700" /></Link>
        <Link to="/orders?status=delivered"><Stat label={t('overview.completed')} value={k.completed_orders} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" /></Link>
        <Link to="/inventory?filter=low"><Stat label={t('overview.lowStock')} value={k.low_stock} icon={AlertTriangle} tone="bg-rose-50 text-signal" /></Link>
        <Link to="/products?status=needs_photo"><Stat label={t('overview.needsPhoto')} value={k.needs_photo ?? 0} icon={Camera} tone="bg-violet-100 text-violet-700" /></Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title={t('overview.sales')} className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={d.sales_chart} margin={{ left: -10, right: 8, top: 8 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2BA6DA" stopOpacity={0.35} /><stop offset="1" stopColor="#2BA6DA" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={`${ink}14`} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: '#8A877F' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: '#8A877F' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="revenue" stroke="#1683B3" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 h-24">
            <ResponsiveContainer>
              <BarChart data={d.sales_chart} margin={{ left: -10, right: 8 }}>
                <XAxis dataKey="date" hide /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#8A877F' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: `${ink}0D` }} />
                <Bar dataKey="orders" fill={ink} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={t('overview.byStatus')}>
          <ul className="space-y-3">
            {Object.entries(d.status_counts).map(([s, n]) => (
              <li key={s}><Link to={`/orders?status=${s}`} className="flex items-center gap-3 text-sm">
                <Pill tone={STATUS[s].tone}>{t(`status.${s}`)}</Pill>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bone-200"><span className="block h-full rounded-full bg-ink" style={{ width: `${k.total_orders ? (n / k.total_orders) * 100 : 0}%` }} /></span>
                <span className="w-8 text-right font-semibold tabular-nums">{n}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title={t('overview.recent')} action={<Link to="/orders" className="text-sm font-semibold underline">{t('overview.allLink')}</Link>} pad={false} className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink/5">
                {d.recent_orders.map((o) => (
                  <tr key={o.id} className="hover:bg-bone-100">
                    <td className="px-5 py-3"><Link to={`/orders/${o.id}`} className="font-semibold">{o.order_number}</Link><p className="text-xs text-stone-450">{o.customer_name}</p></td>
                    <td className="px-3 py-3"><Pill tone={STATUS[o.status].tone}>{t(`status.${o.status}`)}</Pill></td>
                    <td className="hidden px-3 py-3 sm:table-cell"><Pill tone={PAYMENT_STATUS[o.payment_status].tone}>{t(`payStatus.${o.payment_status}`)}</Pill></td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{usd2(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={t('overview.bestSellers')}>
          {d.best_sellers.length === 0 ? <p className="text-sm text-stone-450">{t('overview.noSales')}</p> : (
            <ul className="space-y-3">
              {d.best_sellers.map((b, i) => (
                <li key={b.product_id ?? i} className="flex items-center gap-3">
                  <Thumb src={b.image} className="h-12 w-12" />
                  <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold">{b.name}</p><p className="text-xs text-stone-450">{b.brand} · {t('overview.sold', { n: b.quantity })}</p></div>
                  <p className="text-sm font-semibold tabular-nums">{usd2(b.sales)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title={t('overview.lowStockCard')} action={<Link to="/inventory?filter=low" className="text-sm font-semibold underline">{t('overview.inventoryLink')}</Link>}>
          {d.low_stock.length === 0 ? <p className="text-sm text-stone-450">{t('overview.allStocked')}</p> : (
            <ul className="divide-y divide-ink/5 text-sm">
              {d.low_stock.map((v) => (
                <li key={v.variant_id} className="flex items-center justify-between py-2.5">
                  <span className="min-w-0"><span className="block truncate font-semibold">{v.product}</span><span className="text-xs text-stone-450">{v.color} · {t('common.eu', { size: v.size })} · {v.sku}</span></span>
                  <Pill tone={v.available === 0 ? 'bg-rose-100 text-signal' : 'bg-amber-100 text-amber-800'}>{v.available === 0 ? t('overview.out') : t('overview.left', { n: v.available })}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('overview.transactions')}>
          <ul className="divide-y divide-ink/5 text-sm">
            {d.recent_transactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/orders/${tx.order_id}`} className="min-w-0"><span className="block font-semibold">{tx.order_number}</span><span className="text-xs text-stone-450">{tx.customer} · {t(`payMethod.${tx.method}`)}</span></Link>
                <span className="flex items-center gap-2"><Pill tone={PAYMENT_STATUS[tx.status].tone}>{t(`payStatus.${tx.status}`)}</Pill><span className="w-20 text-right font-semibold tabular-nums">{usd2(tx.amount)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
