// Last-known API responses kept on the device, so pages paint instantly (stale) while fresh data loads.
// Useful when the free API host is waking up. Data is public catalogue data only - never user data.
import { store } from './storage'

const PREFIX = 'iq_cache_v1:'
const MAX_AGE = 7 * 24 * 3600 * 1000

export function peek(key) {
  const hit = store.json(PREFIX + key, null)
  return hit && Date.now() - hit.at < MAX_AGE ? hit.data : null
}

export function remember(key, data) {
  try { store.setJson(PREFIX + key, { at: Date.now(), data }) } catch { /* storage full - fine */ }
}
