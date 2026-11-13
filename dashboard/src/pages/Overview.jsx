import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Package, ShoppingCart, Users, Wallet } from 'lucide-react'
import { api } from '../lib/api'
import { date, PAYMENT_METHOD, PAYMENT_STATUS, STATUS, usd2 } from '../lib/format'
import { Card, PageHeader, Pill, Stat, Thumb } from '../components/ui'

const ChartTip = ({ active, payload, label }) => active && payload?.length ? (
  <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lift">
    <p className="mb-1 font-semibold">{date(label + 'T12:00:00Z')}</p>
    {payload.map((p) => <p key={p.dataKey}>{p.dataKey === 'revenue' ? `Revenue ${usd2(p.value)}` : `${p.value} orders`}</p>)}
  </div>
) : null

export default function Overview() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/api/admin/dashboard', { query: { days } }).then(setD).catch((e) => setErr(e.message)) }, [days])
  if (err) return <p className="text-signal">{err}</p>
  if (!d) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>
  const k = d.kpis
  const periodRevenue = d.sales_chart.reduce((s, x) => s + x.revenue, 0)
  return (
    <div>
      <PageHeader title="Overview" subtitle="Live numbers from your store database."
        actions={<select value={days} onChange={(e) => setDays(+e.target.value)} className="field !min-h-[42px] !w-auto">
          {[7, 30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue (paid)" value={usd2(k.revenue)} sub={`${usd2(periodRevenue)} in the last ${days} days`} icon={DollarSign} />
        <Stat label="Total orders" value={k.total_orders} sub={`${k.pending_orders} pending · ${k.completed_orders} delivered`} icon={ShoppingCart} />
        <Stat label="Products" value={k.total_products} sub={`${k.active_products} visible in store`} icon={Package} />
        <Stat label="Customers" value={k.total_customers} sub="Registered accounts" icon={Users} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/orders?status=pending"><Stat label="Pending orders" value={k.pending_orders} icon={Clock} tone="bg-amber-50 text-amber-700" /></Link>
        <Link to="/orders?payment_status=submitted"><Stat label="Payments to verify" value={k.awaiting_payment_verification} icon={Wallet} tone="bg-ice-50 text-ice-700" /></Link>
        <Link to="/orders?status=delivered"><Stat label="Completed" value={k.completed_orders} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" /></Link>
        <Link to="/inventory?filter=low"><Stat label="Low-stock variants" value={k.low_stock} icon={AlertTriangle} tone="bg-rose-50 text-signal" /></Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Sales" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={d.sales_chart} margin={{ left: -10, right: 8, top: 8 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2BA6DA" stopOpacity={0.35} /><stop offset="1" stopColor="#2BA6DA" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#0A0A0B10" vertical={false} />
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
                <Tooltip content={<ChartTip />} cursor={{ fill: '#0A0A0B08' }} />
                <Bar dataKey="orders" fill="#0A0A0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Orders by status">
          <ul className="space-y-3">
            {Object.entries(d.status_counts).map(([s, n]) => (
              <li key={s}><Link to={`/orders?status=${s}`} className="flex items-center gap-3 text-sm">
                <Pill tone={STATUS[s].tone}>{STATUS[s].label}</Pill>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bone-200"><span className="block h-full rounded-full bg-ink" style={{ width: `${k.total_orders ? (n / k.total_orders) * 100 : 0}%` }} /></span>
                <span className="w-8 text-right font-semibold tabular-nums">{n}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Recent orders" action={<Link to="/orders" className="text-sm font-semibold underline">All</Link>} pad={false} className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink/5">
                {d.recent_orders.map((o) => (
                  <tr key={o.id} className="hover:bg-bone-100">
                    <td className="px-5 py-3"><Link to={`/orders/${o.id}`} className="font-semibold">{o.order_number}</Link><p className="text-xs text-stone-450">{o.customer_name}</p></td>
                    <td className="px-3 py-3"><Pill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Pill></td>
                    <td className="hidden px-3 py-3 sm:table-cell"><Pill tone={PAYMENT_STATUS[o.payment_status].tone}>{PAYMENT_STATUS[o.payment_status].label}</Pill></td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{usd2(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Best sellers">
          {d.best_sellers.length === 0 ? <p className="text-sm text-stone-450">No confirmed sales yet.</p> : (
            <ul className="space-y-3">
              {d.best_sellers.map((b, i) => (
                <li key={b.product_id ?? i} className="flex items-center gap-3">
                  <Thumb src={b.image} className="h-12 w-12" />
                  <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold">{b.name}</p><p className="text-xs text-stone-450">{b.brand} · {b.quantity} sold</p></div>
                  <p className="text-sm font-semibold tabular-nums">{usd2(b.sales)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Low stock" action={<Link to="/inventory?filter=low" className="text-sm font-semibold underline">Inventory</Link>}>
          {d.low_stock.length === 0 ? <p className="text-sm text-stone-450">All variants are well stocked.</p> : (
            <ul className="divide-y divide-ink/5 text-sm">
              {d.low_stock.map((v) => (
                <li key={v.variant_id} className="flex items-center justify-between py-2.5">
                  <span className="min-w-0"><span className="block truncate font-semibold">{v.product}</span><span className="text-xs text-stone-450">{v.color} · EU {v.size} · {v.sku}</span></span>
                  <Pill tone={v.available === 0 ? 'bg-rose-100 text-signal' : 'bg-amber-100 text-amber-800'}>{v.available === 0 ? 'Out' : `${v.available} left`}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent transactions">
          <ul className="divide-y divide-ink/5 text-sm">
            {d.recent_transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/orders/${t.order_id}`} className="min-w-0"><span className="block font-semibold">{t.order_number}</span><span className="text-xs text-stone-450">{t.customer} · {PAYMENT_METHOD[t.method]}</span></Link>
                <span className="flex items-center gap-2"><Pill tone={PAYMENT_STATUS[t.status].tone}>{PAYMENT_STATUS[t.status].label}</Pill><span className="w-20 text-right font-semibold tabular-nums">{usd2(t.amount)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
