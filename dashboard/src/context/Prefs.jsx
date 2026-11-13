// Language (English / Khmer) and theme (light / dark), remembered in localStorage.
// The inline script in index.html applies both before React loads, so there is no flash.
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

  const setTheme = useCallback((t) => {
    const root = document.documentElement
    root.classList.add('theme-anim')
    root.classList.toggle('dark', t === 'dark')
    root.style.colorScheme = t
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0B0B0D' : '#F5F4F0')
    store.set('iq_theme', t)
    setThemeState(t)
    setTimeout(() => root.classList.remove('theme-anim'), 400)
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
