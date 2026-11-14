// Language (English / Khmer) and theme (light / dark), remembered in localStorage.
// The inline script in index.html applies both before React loads, so there is no flash.
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import en from '../i18n/en'
import km from '../i18n/km'
import { store } from '../lib/storage'

const DICTS = { en, km }
const Ctx = createContext(null)

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict)
}

export function format(str, vars) {
  if (typeof str !== 'string' || !vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
}

export function currentLang() {
  return document.documentElement.lang === 'km' ? 'km' : 'en'
}

export function PrefsProvider({ children }) {
  const [lang, setLangState] = useState(currentLang())
  const [theme, setThemeState] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light')

  const setLang = useCallback((l) => {
    setLangState(l)
    store.set('iq_lang', l)
    document.documentElement.lang = l
  }, [])

  // Theme switch: a circular reveal from the tapped button using the View Transitions API
  // (one composited animation, smooth on phones). Older browsers get a short cross-fade.
  const setTheme = useCallback((t, origin) => {
    const root = document.documentElement
    const apply = () => {
      root.classList.toggle('dark', t === 'dark')
      root.style.colorScheme = t
      const c = t === 'dark' ? '#0B0B0D' : '#F5F4F0'
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', c)
      try { const tg = window.Telegram?.WebApp; tg?.setHeaderColor?.(c); tg?.setBackgroundColor?.(c) } catch { /* not in Telegram */ }
      store.set('iq_theme', t)
      setThemeState(t)
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { apply(); return }
    if (!document.startViewTransition) {
      root.classList.add('theme-fade')
      apply()
      setTimeout(() => root.classList.remove('theme-fade'), 320)
      return
    }
    const x = origin?.x ?? window.innerWidth - 40
    const y = origin?.y ?? 40
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)
    root.classList.add('theme-vt')
    const vt = document.startViewTransition(() => { flushSync(apply) })
    vt.finished.finally(() => root.classList.remove('theme-vt'))
  }, [])

  // follow the OS setting until the visitor chooses a theme themselves
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const f = (e) => { if (!store.get('iq_theme')) setTheme(e.matches ? 'dark' : 'light') }
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [setTheme])

  const value = useMemo(() => {
    const dict = DICTS[lang]
    const t = (key, vars) => {
      const v = lookup(dict, key) ?? lookup(en, key) ?? key
      return format(v, vars)
    }
    // pick a Khmer field (name_km, title_km…) when available
    const pick = (obj, field) => (obj ? (lang === 'km' && obj[`${field}_km`]) || obj[field] || '' : '')
    const locale = lang === 'km' ? 'km-KH' : 'en-GB'
    return { lang, setLang, theme, setTheme, t, pick, locale }
  }, [lang, theme, setLang, setTheme])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const usePrefs = () => useContext(Ctx)
export const useT = () => useContext(Ctx).t

// Renders translations containing <b>…</b> or <a>…</a> safely (no innerHTML).
export function Rich({ text, link }) {
  const parts = String(text).split(/(<b>.*?<\/b>|<a>.*?<\/a>)/g)
  return parts.map((p, i) => {
    if (p.startsWith('<b>')) return <b key={i}>{p.slice(3, -4)}</b>
    if (p.startsWith('<a>')) return link ? <Fragment key={i}>{link(p.slice(3, -4))}</Fragment> : <u key={i}>{p.slice(3, -4)}</u>
    return <Fragment key={i}>{p}</Fragment>
  })
}
