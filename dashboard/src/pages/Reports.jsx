// Sales reports: pick a period, compare with the one before, see where the money comes from.
// Only paid, non-cancelled sales count (online + in-store POS). Export the same report to Excel.
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react'
import { api, download } from '../lib/api'
import { cls, date, usd2 } from '../lib/format'
import { Card, PageHeader, Spinner, useToast } from '../components/ui'
import { usePrefs } from '../context/Prefs'

const TEXT = {
  en: {
    title: 'Sales reports', subtitle: 'Paid sales only, online and in store. Compared with the period before.',
    today: 'Today', d7: 'Last 7 days', d30: 'Last 30 days', month: 'This month', lastMonth: 'Last month', year: 'This year', custom: 'Custom',
    from: 'From', to: 'To', export: 'Excel', exporting: 'Preparing…',
    revenue: 'Revenue', orders: 'Paid orders', aov: 'Average order', items: 'Items sold', discounts: 'Discounts given',
    delivery: 'Delivery fees', cancelled: 'Cancelled', unpaid: 'Waiting for payment', vs: 'vs {start} – {end}', noPrev: 'none before', ordersShort: 'orders',
    overTime: 'Revenue over time', online: 'Online', pos: 'In store', channels: 'Online vs in store', payments: 'Payment methods',
    products: 'Best-selling products', brands: 'Brands', categories: 'Categories', sizes: 'Sizes sold', sizesHint: 'Restock the sizes that sell most.',
    provinces: 'Where online orders go', units: 'units', none: 'No paid sales in this period yet.',
    cash: 'Cash (in store)', khqr: 'ABA KHQR', bank_transfer: 'Bank transfer', cod: 'Cash on delivery',
  },
  km: {
    title: 'របាយការណ៍លក់', subtitle: 'តែការលក់ដែលបានបង់ ទាំងតាមអនឡាញ និងនៅហាង។ ប្រៀបធៀបនឹងរយៈពេលមុន។',
    today: 'ថ្ងៃនេះ', d7: '7 ថ្ងៃចុងក្រោយ', d30: '30 ថ្ងៃចុងក្រោយ', month: 'ខែនេះ', lastMonth: 'ខែមុន', year: 'ឆ្នាំនេះ', custom: 'ជ្រើសថ្ងៃ',
    from: 'ពី', to: 'ដល់', export: 'Excel', exporting: 'កំពុងរៀបចំ…',
    revenue: 'ចំណូល', orders: 'ការបញ្ជាទិញបានបង់', aov: 'មធ្យមក្នុងមួយការបញ្ជាទិញ', items: 'ទំនិញបានលក់', discounts: 'បញ្ចុះតម្លៃ',
    delivery: 'ថ្លៃដឹកជញ្ជូន', cancelled: 'បានបោះបង់', unpaid: 'រង់ចាំការបង់ប្រាក់', vs: 'ធៀបនឹង {start} – {end}', noPrev: 'មុននេះគ្មាន', ordersShort: 'ការបញ្ជាទិញ',
    overTime: 'ចំណូលតាមពេលវេលា', online: 'អនឡាញ', pos: 'នៅហាង', channels: 'អនឡាញ និងនៅហាង', payments: 'វិធីបង់ប្រាក់',
    products: 'ផលិតផលលក់ដាច់ជាងគេ', brands: 'ម៉ាក', categories: 'ប្រភេទ', sizes: 'ទំហំដែលបានលក់', sizesHint: 'បន្ថែមស្តុកទំហំដែលលក់ដាច់ជាងគេ។',
    provinces: 'ខេត្តនៃការបញ្ជាទិញអនឡាញ', units: 'គូ/ដុំ', none: 'មិនទាន់មានការលក់ដែលបានបង់ក្នុងរយៈពេលនេះទេ។',
    cash: 'សាច់ប្រាក់ (នៅហាង)', khqr: 'ABA KHQR', bank_transfer: 'ផ្ទេរប្រាក់', cod: 'បង់ពេលទទួល',
  },
}
const fill = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const COLORS = ['#1683B3', '#0A0A0B', '#8FD6F5', '#C8102E', '#2F6B4F', '#C99A2E', '#6B4A35', '#9EA3A8']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function preset(key) {
  const now = new Date()
  const d = (y, m, day) => iso(new Date(y, m, day))
  const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
  switch (key) {
    case 'today': return [d(y, m, day), d(y, m, day)]
    case 'd7': return [d(y, m, day - 6), d(y, m, day)]
    case 'month': return [d(y, m, 1), d(y, m, day)]
    case 'lastMonth': return [d(y, m - 1, 1), d(y, m, 0)]
    case 'year': return [d(y, 0, 1), d(y, m, day)]
    default: return [d(y, m, day - 29), d(y, m, day)]
  }
}

export default function Reports() {
  const { lang, theme } = usePrefs()
  const T = TEXT[lang] || TEXT.en
  const toast = useToast()
  const ink = theme === 'dark' ? '#F2F1EE' : '#0A0A0B'
  const [period, setPeriod] = useState('d30')
  const [range, setRange] = useState(() => preset('d30'))
  const [r, setR] = useState(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setBusy(true)
    api('/api/admin/reports', { query: { start: range[0], end: range[1] } }).then(setR).catch((e) => toast.error(e.message)).finally(() => setBusy(false))
  }, [range]) // eslint-disable-line

  const pick = (k) => { setPeriod(k); if (k !== 'custom') setRange(preset(k)) }
  const exportXlsx = async () => {
    setExporting(true)
    try { await download(`/api/admin/reports/xlsx?start=${range[0]}&end=${range[1]}`) } catch (e) { toast.error(e.message) } finally { setExporting(false) }
  }
  const series = useMemo(() => (r?.series || []).map((s) => ({ ...s, total: Math.round((s.online + s.pos) * 100) / 100 })), [r])
  const label = (v) => (r?.grouped_by === 'month' ? new Date(`${v}-15T12:00:00Z`).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', { month: 'short', year: '2-digit' }) : v.slice(5))

  return (
    <div>
      <PageHeader title={T.title} subtitle={T.subtitle}
        actions={<button onClick={exportXlsx} disabled={!r || exporting} className="btn-outline !min-h-[42px]">{exporting ? <Spinner className="h-4 w-4" /> : <Download size={16} />} {exporting ? T.exporting : T.export}</button>} />

      {/* period */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['today', 'd7', 'd30', 'month', 'lastMonth', 'year', 'custom'].map((k) => (
          <button key={k} onClick={() => pick(k)} className={cls('chip', period === k && 'chip-active')}>{T[k]}</button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" aria-label={T.from} value={range[0]} max={range[1]} onChange={(e) => e.target.value && setRange([e.target.value, range[1]])} className="field !min-h-[40px] !w-auto" />
            <span className="text-stone-450">–</span>
            <input type="date" aria-label={T.to} value={range[1]} min={range[0]} onChange={(e) => e.target.value && setRange([range[0], e.target.value])} className="field !min-h-[40px] !w-auto" />
          </div>
        )}
        {busy && <Spinner className="h-4 w-4" />}
      </div>

      {!r ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-28" />)}</div> : (
        <div className={cls('space-y-6 transition-opacity', busy && 'opacity-60')}>
          <p className="-mt-2 text-xs text-stone-450">{date(`${r.start}T12:00:00Z`)} – {date(`${r.end}T12:00:00Z`)} · {fill(T.vs, { start: date(`${r.previous.start}T12:00:00Z`), end: date(`${r.previous.end}T12:00:00Z`) })}</p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[['revenue', usd2], ['orders', String], ['aov', usd2], ['items', String]].map(([k, fmt]) => <Kpi key={k} label={T[k]} kpi={r.kpis[k]} fmt={fmt} T={T} big />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[['discounts', usd2, true], ['delivery', usd2], ['cancelled', String, true], ['unpaid', String, true]].map(([k, fmt, lowerIsBetter]) => <Kpi key={k} label={T[k]} kpi={r.kpis[k]} fmt={fmt} T={T} invert={lowerIsBetter} />)}
          </div>

          <Card title={T.overTime}>
            {!r.kpis.orders.value ? <p className="py-16 text-center text-sm text-stone-450">{T.none}</p> : (
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ left: -6, right: 8, top: 8 }}>
                    <CartesianGrid stroke={`${ink}14`} vertical={false} />
                    <XAxis dataKey="label" tickFormatter={label} tick={{ fontSize: 11, fill: '#8A877F' }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: '#8A877F' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: `${ink}0D` }} content={<SeriesTip T={T} fmt={label} />} />
                    <Legend formatter={(v) => (v === 'online' ? T.online : T.pos)} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="online" stackId="a" fill="#1683B3" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pos" stackId="a" fill={ink} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Split title={T.channels} rows={r.channels.map((c) => ({ ...c, label: c.name === 'pos' ? T.pos : T.online }))} />
            <Split title={T.payments} rows={r.payments.map((c) => ({ ...c, label: T[c.name] || c.name }))} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title={T.products} className="xl:col-span-2">
              <Ranked rows={r.products} T={T} sub={(x) => x.brand} />
            </Card>
            <Card title={T.sizes}>
              <p className="-mt-2 mb-3 text-xs text-stone-450">{T.sizesHint}</p>
              {!r.sizes.length ? <p className="py-8 text-center text-sm text-stone-450">{T.none}</p> : (
                <div style={{ height: Math.max(160, r.sizes.length * 26) }}>
                  <ResponsiveContainer>
                    <BarChart data={r.sizes} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis type="category" dataKey="size" width={64} tickFormatter={(v) => (/^\d/.test(v) ? `EU ${v}` : v)} tick={{ fontSize: 11, fill: '#8A877F' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: `${ink}0D` }} formatter={(v) => [`${v} ${T.units}`, '']} separator="" />
                      <Bar dataKey="units" fill="#1683B3" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={T.brands}><Ranked rows={r.brands} T={T} compact /></Card>
            <Card title={T.categories}><Ranked rows={r.categories} T={T} compact /></Card>
            <Card title={T.provinces}><Ranked rows={r.provinces.map((p) => ({ ...p, units: p.orders }))} T={T} compact orders /></Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, kpi, fmt, T, big, invert }) {
  const ch = kpi.change
  const good = ch == null ? null : invert ? ch <= 0 : ch >= 0
  const Icon = ch == null || ch === 0 ? Minus : ch > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/5">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-450">{label}</p>
      <p className={cls('mt-2 font-display font-black tabular-nums', big ? 'text-3xl' : 'text-2xl')}>{fmt(kpi.value)}</p>
      <p className={cls('mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        ch == null ? 'bg-ink/5 text-stone-450' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-signal')}>
        <Icon size={13} />{ch == null ? T.noPrev : `${ch > 0 ? '+' : ''}${ch}%`}
      </p>
    </div>
  )
}

function SeriesTip({ active, payload, label, T, fmt }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl bg-night px-3 py-2 text-xs text-snow shadow-lift">
      <p className="mb-1 font-semibold">{fmt(label)}</p>
      <p>{T.online}: {usd2(row.online)}</p><p>{T.pos}: {usd2(row.pos)}</p>
      <p className="mt-1 font-semibold">{usd2(row.total)} · {row.orders} {T.orders.toLowerCase()}</p>
    </div>
  )
}

function Split({ title, rows }) {
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  return (
    <Card title={title}>
      {!rows.length ? <p className="py-8 text-center text-sm text-stone-450">—</p> : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={rows} dataKey="revenue" nameKey="label" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">
                  {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [usd2(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-2.5 text-sm">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1">{r.label}<span className="ml-1.5 text-xs text-stone-450">· {r.orders}</span></span>
                <span className="font-semibold tabular-nums">{usd2(r.revenue)}</span>
                <span className="w-12 text-right text-xs text-stone-450 tabular-nums">{total ? Math.round((r.revenue / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Ranked({ rows, T, sub, compact, orders }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-stone-450">—</p>
  const max = Math.max(...rows.map((r) => r.revenue)) || 1
  return (
    <ol className="space-y-3">
      {rows.slice(0, compact ? 8 : 15).map((r, i) => (
        <li key={r.name} className="text-sm">
          <div className="flex items-baseline gap-3">
            <span className="w-5 text-xs font-semibold text-stone-450 tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{r.name}{sub && sub(r) && <span className="ml-1.5 text-xs text-stone-450">{sub(r)}</span>}</span>
            <span className="text-xs text-stone-450 tabular-nums">{r.units} {orders ? T.ordersShort : T.units}</span>
            <span className="w-20 text-right font-semibold tabular-nums">{usd2(r.revenue)}</span>
          </div>
          <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/5"><div className="h-full rounded-full bg-[#1683B3]" style={{ width: `${(r.revenue / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  )
}
