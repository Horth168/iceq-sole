// Thin fetch wrapper: JSON, auth headers, silent token refresh and the guest cart token.
import { session, store } from './storage'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

let refreshing = null
const listeners = new Set()
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn))

// "Remember me" keeps tokens in localStorage; otherwise sessionStorage (gone when the browser closes).
export const tokens = {
  get access() { return store.get('iq_access') || session.get('iq_access') },
  get refresh() { return store.get('iq_refresh') || session.get('iq_refresh') },
  get remembered() { return !!store.get('iq_refresh') || !session.get('iq_refresh') },
  set({ access_token, refresh_token }, remember = tokens.remembered) {
    const target = remember ? store : session
    const other = remember ? session : store
    target.set('iq_access', access_token)
    target.set('iq_refresh', refresh_token)
    other.remove('iq_access')
    other.remove('iq_refresh')
  },
  clear() {
    ;[store, session].forEach((s) => { s.remove('iq_access'); s.remove('iq_refresh') })
    listeners.forEach((fn) => fn(null))
  },
}

export const cartToken = {
  get: () => store.get('iq_cart'),
  set: (t) => t && store.set('iq_cart', t),
}

async function refreshTokens() {
  if (!tokens.refresh) throw new ApiError('Not signed in', 401)
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) throw new ApiError('Session expired', 401)
      tokens.set(await r.json())
    })
    .finally(() => (refreshing = null))
  return refreshing
}

export async function api(path, { method = 'GET', body, form, query, auth = true, retry = true, signal, human } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === false) return
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x))
      else url.searchParams.set(k, v)
    })
  }
  const headers = { 'Accept-Language': document.documentElement.lang || 'en' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`
  if (cartToken.get()) headers['X-Cart-Token'] = cartToken.get()
  if (human) headers['X-Human-Token'] = human // Cloudflare Turnstile token (see components/HumanCheck)

  let res
  try {
    res = await fetch(url, { method, headers, signal, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError(document.documentElement.lang === 'km'
      ? 'ហាក់ដូចជាអ្នកមិនបានភ្ជាប់អ៊ីនធឺណិត។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។'
      : 'You appear to be offline. Check your connection and try again.', 0)
  }
  if (res.status === 401 && auth && retry && tokens.refresh) {
    try {
      await refreshTokens()
      return api(path, { method, body, form, query, auth, retry: false, signal, human })
    } catch {
      tokens.clear()
    }
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.detail || `Request failed (${res.status})`, res.status, data)
  return data
}

// Multipart upload with progress (used for payment screenshots)
export function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    xhr.setRequestHeader('Accept-Language', document.documentElement.lang || 'en')
    if (tokens.access) xhr.setRequestHeader('Authorization', `Bearer ${tokens.access}`)
    if (cartToken.get()) xhr.setRequestHeader('X-Cart-Token', cartToken.get())
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch { /* empty */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(data?.detail || 'Upload failed', xhr.status, data))
    }
    xhr.onerror = () => reject(new ApiError('Network error during upload', 0))
    xhr.send(formData)
  })
}

// API-relative paths (/uploads/…) get the API host; the store's own public files (/images/…, /icons/…) stay on this site.
export const assetUrl = (u) => (!u ? '' : /^https?:|^data:|^blob:|^\/(images|icons)\//.test(u) ? u : `${BASE}${u}`)
