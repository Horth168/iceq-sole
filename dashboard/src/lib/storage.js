// localStorage that never throws (private mode, blocked storage, SSR).
export const store = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(key)
      return v === null ? fallback : v
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value) } catch { /* ignore */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key) } catch { /* ignore */ }
  },
  json(key, fallback) {
    try { return JSON.parse(store.get(key)) ?? fallback } catch { return fallback }
  },
  setJson(key, value) { store.set(key, JSON.stringify(value)) },
}

const RECENT = 'iq_recent'
export const recentlyViewed = {
  list: () => store.json(RECENT, []),
  add(id) {
    const next = [id, ...recentlyViewed.list().filter((x) => x !== id)].slice(0, 12)
    store.setJson(RECENT, next)
  },
}
