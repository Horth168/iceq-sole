import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, Users } from 'lucide-react'
import { api } from '../lib/api'
import { date, dateTime, STATUS, usd2 } from '../lib/format'
import { Card, Empty, PageHeader, Pagination, Pill, SearchInput, Stat, Toggle, useToast } from '../components/ui'
import { usePrefs } from '../context/Prefs'

export function Customers() {
  const { t } = usePrefs()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const q = Object.fromEntries(params)
  useEffect(() => { api('/api/admin/customers', { query: q }).then(setData) }, [params]) // eslint-disable-line
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setParams(n) }
  return (
    <div>
      <PageHeader title={t('customers.title')} subtitle={data ? t('customers.count', { n: data.total }) : ''} />
      <Card pad={false}>
        <div className="border-b border-ink/5 p-4"><SearchInput value={q.q} onChange={(v) => set('q', v)} placeholder={t('customers.searchPh')} /></div>
        {!data ? <div className="skeleton m-4 h-60" /> : data.items.length === 0 ? <Empty icon={Users} title={t('customers.none')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-stone-450"><tr><th className="px-5 py-3">{t('customers.customer')}</th><th className="px-3 py-3">{t('customers.phone')}</th><th className="px-3 py-3 text-right">{t('customers.orders')}</th><th className="px-3 py-3 text-right">{t('customers.spent')}</th><th className="px-5 py-3">{t('customers.joined')}</th></tr></thead>
              <tbody className="divide-y divide-ink/5">
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-bone-100">
                    <td className="px-5 py-3"><Link to={`/customers/${c.id}`} className="font-semibold hover:underline">{c.full_name}</Link><p className="text-xs text-stone-450">{c.email}{!c.is_active && ` · ${t('customers.disabled')}`}</p></td>
                    <td className="px-3 py-3">{c.phone || '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.order_count}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{usd2(c.total_spent)}</td>
                    <td className="px-5 py-3 text-xs">{date(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => set('page', String(n))} />}
      </Card>
    </div>
  )
}

export function CustomerDetail() {
  const { t } = usePrefs()
  const { id } = useParams()
  const [c, setC] = useState(null)
  const toast = useToast()
  const load = () => api(`/api/admin/customers/${id}`).then(setC)
  useEffect(() => { load() }, [id]) // eslint-disable-line
  if (!c) return <div className="skeleton h-96" />
  const toggle = async (v) => { try { await api(`/api/admin/customers/${id}`, { method: 'PATCH', body: { is_active: v } }); toast.success(v ? t('customers.enabled') : t('customers.disabledToast')); load() } catch (e) { toast.error(e.message) } }
  return (
    <div>
      <PageHeader back={<Link to="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-450 hover:text-ink"><ArrowLeft size={15} /> {t('nav.customers')}</Link>} title={c.full_name} subtitle={t('customers.since', { date: date(c.created_at), last: c.last_login_at ? dateTime(c.last_login_at) : t('customers.never') })} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t('customers.orders')} value={c.order_count} /><Stat label={t('customers.totalSpent')} value={usd2(c.total_spent)} /><Stat label={t('customers.wishlist')} value={c.wishlist_count} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title={t('customers.history')} pad={false}>
          {c.orders.length === 0 ? <p className="p-5 text-sm text-stone-450">{t('customers.noOrders')}</p> : (
            <ul className="divide-y divide-ink/5">
              {c.orders.map((o) => (
                <li key={o.id}><Link to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-bone-100">
                  <span><span className="font-semibold">{o.order_number}</span><span className="block text-xs text-stone-450">{dateTime(o.created_at)} · {t('customers.items', { n: o.item_count })}</span></span>
                  <span className="flex items-center gap-3"><Pill tone={STATUS[o.status].tone}>{t(`status.${o.status}`)}</Pill><span className="w-20 text-right font-semibold tabular-nums">{usd2(o.total)}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title={t('customers.contact')}>
            <p className="flex items-center gap-2 text-sm"><Mail size={15} /> <a className="underline" href={`mailto:${c.email}`}>{c.email}</a></p>
            {c.phone && <p className="mt-2 flex items-center gap-2 text-sm"><Phone size={15} /> <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a></p>}
            <div className="mt-5 border-t border-ink/5 pt-4"><Toggle checked={c.is_active} onChange={toggle} label={t('customers.active')} /></div>
          </Card>
          <Card title={t('customers.addresses')}>
            {c.addresses.length === 0 ? <p className="text-sm text-stone-450">{t('customers.noneSaved')}</p> : c.addresses.map((a) => (
              <div key={a.id} className="mb-3 rounded-xl bg-bone-100 p-3 text-sm last:mb-0"><p className="font-semibold">{a.label}{a.is_default && ` · ${t('customers.default')}`}</p><p>{a.address_line}{a.district && `, ${a.district}`}, {a.province}</p><p className="text-xs text-stone-450">{a.full_name} · {a.phone}</p></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
