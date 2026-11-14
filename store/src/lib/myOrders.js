// Orders placed (or looked up) on this device, so guests can always get back to them without an account.
// Each entry holds the order number and its private access token (the same link the customer was given).
import { store } from './storage'

const KEY = 'iq_my_orders'

export function myOrders() {
  const list = store.json(KEY, [])
  // include orders saved by earlier versions (iq_order_<number> = token)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('iq_order_')) {
        const n = k.slice(9)
        if (!list.some((o) => o.n === n)) list.push({ n, t: store.json(k, ''), at: null })
      }
    }
  } catch { /* storage blocked */ }
  return list.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

export function saveMyOrder(order, token) {
  if (!order?.order_number || !token) return
  const list = store.json(KEY, []).filter((o) => o.n !== order.order_number)
  list.unshift({ n: order.order_number, t: token, at: order.created_at, total: order.total,
    status: order.status, pay: order.payment_status, items: order.item_count })
  store.setJson(KEY, list.slice(0, 30))
  store.setJson(`iq_order_${order.order_number}`, token)
}
