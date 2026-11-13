// Admin API client. Tokens are stored separately from the storefront session.
import { store } from './storage'
import { currentLang } from '../context/Prefs'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data }
}

const listeners = new Set()
export const onLogout = (fn) => (listeners.add(fn), () => listeners.delete(fn))
export const tokens = {
  get access() { return store.get('iqa_access') },
  get refresh() { return store.get('iqa_refresh') },
  set({ access_token, refresh_token }) { store.set('iqa_access', access_token); store.set('iqa_refresh', refresh_token) },
  clear() { store.remove('iqa_access'); store.remove('iqa_refresh'); listeners.forEach((f) => f()) },
}

let refreshing = null
async function refresh() {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: tokens.refresh }),
  }).then(async (r) => { if (!r.ok) throw new ApiError('Session expired', 401); tokens.set(await r.json()) })
    .finally(() => (refreshing = null))
  return refreshing
}

export async function api(path, { method = 'GET', body, form, query, retry = true, signal } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    url.searchParams.set(k, v)
  })
  const headers = { 'Accept-Language': currentLang() }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`
  let res
  try {
    res = await fetch(url, { method, headers, signal, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError(currentLang() === 'km' ? 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ។ សូមព្យាយាមម្តងទៀត។' : 'Cannot reach the API. Is the backend running?', 0)
  }
  if (res.status === 401 && retry && tokens.refresh) {
    try { await refresh(); return api(path, { method, body, form, query, retry: false, signal }) } catch { tokens.clear() }
  } else if (res.status === 401) tokens.clear()
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.detail || `Request failed (${res.status})`, res.status, data)
  return data
}

// Multipart upload with progress
export function upload(path, formData, onProgress, method = 'POST') {
  return new Promise((resolve, reject) => {
    const send = (retry) => {
      const xhr = new XMLHttpRequest()
      xhr.open(method, `${BASE}${path}`)
      if (tokens.access) xhr.setRequestHeader('Authorization', `Bearer ${tokens.access}`)
      xhr.setRequestHeader('Accept-Language', currentLang())
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
      xhr.onload = async () => {
        let data = null
        try { data = JSON.parse(xhr.responseText) } catch { /* empty */ }
        if (xhr.status === 401 && retry && tokens.refresh) { try { await refresh(); return send(false) } catch { tokens.clear() } }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new ApiError(data?.detail || 'Upload failed', xhr.status, data))
      }
      xhr.onerror = () => reject(new ApiError('Network error during upload', 0))
      xhr.send(formData)
    }
    send(true)
  })
}

export const assetUrl = (u) => (!u ? '' : /^https?:|^data:|^blob:/.test(u) ? u : `${BASE}${u}`)
export const STORE_URL = import.meta.env.VITE_STORE_URL || 'http://localhost:5173'
