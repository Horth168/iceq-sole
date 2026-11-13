const TZ = 'Asia/Phnom_Penh'

export const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0 }).format(n ?? 0)

export const usd2 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

export const khr = (n) => `${new Intl.NumberFormat('en-US').format(Math.round(n ?? 0))} ៛`

const loc = () => (document.documentElement.lang === 'km' ? 'km-KH' : 'en-GB')

export const date = (iso, opts = { dateStyle: 'medium' }) =>
  iso ? new Intl.DateTimeFormat(loc(), { timeZone: TZ, ...opts }).format(new Date(iso)) : ''

export const dateTime = (iso) => date(iso, { dateStyle: 'medium', timeStyle: 'short' })

export const STATUS = {
  pending: { tone: 'bg-amber-100 text-amber-800' },
  confirmed: { tone: 'bg-ice-100 text-ice-700' },
  processing: { tone: 'bg-indigo-100 text-indigo-700' },
  shipped: { tone: 'bg-violet-100 text-violet-700' },
  delivered: { tone: 'bg-emerald-100 text-emerald-700' },
  cancelled: { tone: 'bg-stone-200 text-stone-600' },
  refunded: { tone: 'bg-rose-100 text-rose-700' },
}

export const PAYMENT_STATUS = {
  unpaid: { tone: 'bg-amber-100 text-amber-800' },
  submitted: { tone: 'bg-ice-100 text-ice-700' },
  paid: { tone: 'bg-emerald-100 text-emerald-700' },
  failed: { tone: 'bg-rose-100 text-rose-700' },
  refunded: { tone: 'bg-stone-200 text-stone-600' },
}


export const cls = (...a) => a.filter(Boolean).join(' ')

export const uuid = () =>
  (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '')

// Cambodian phone: mirrors backend validation for instant feedback
export function validKhPhone(v) {
  const d = (v || '').replace(/[\s\-().]/g, '')
  const m = d.match(/^(?:\+?855|0)?(\d{8,9})$/)
  return !!m && !m[1].startsWith('0')
}
