import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'

// Cloudflare Turnstile bot check. Invisible for most people ("interaction-only"): a checkbox only
// appears when Cloudflare is unsure. Off (renders nothing, token '') until the API publishes a site key.
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true; s.defer = true
    s.onload = () => resolve(window.turnstile)
    s.onerror = () => { scriptPromise = undefined; reject(new Error('turnstile')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * const human = useHuman()
 * <HumanCheck human={human} />            inside the form
 * const token = await human.token()       right before the request, then pass { human: token } to api()
 * Tokens are single-use, so the widget refreshes itself after each one is taken.
 */
export function useHuman() {
  const { settings } = useStore()
  const siteKey = settings?.turnstile_site_key || ''
  const state = useRef({ token: '', waiters: [], widget: null })

  const set = useCallback((t) => {
    state.current.token = t
    if (t) { state.current.waiters.forEach((w) => w(t)); state.current.waiters = [] }
  }, [])

  const token = useCallback(() => {
    if (!siteKey) return Promise.resolve('')
    const s = state.current
    const take = (t) => {
      s.token = ''
      setTimeout(() => { try { window.turnstile?.reset(s.widget) } catch { /* widget gone */ } }, 0)
      return t
    }
    if (s.token) return Promise.resolve(take(s.token))
    // still checking: wait for it (the API answers clearly if it never arrives)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(''), 15000)
      s.waiters.push((t) => { clearTimeout(timer); resolve(take(t)) })
    })
  }, [siteKey])

  return { siteKey, token, set, state }
}

export default function HumanCheck({ human, className = '' }) {
  const { theme, lang } = usePrefs()
  const box = useRef(null)
  const { siteKey, set, state } = human

  useEffect(() => {
    if (!siteKey || !box.current) return
    let gone = false
    loadScript().then((ts) => {
      if (gone || !box.current) return
      state.current.widget = ts.render(box.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        theme: theme === 'dark' ? 'dark' : 'light',
        language: lang === 'km' ? 'km' : 'en',
        callback: set,
        'expired-callback': () => { set(''); try { ts.reset(state.current.widget) } catch { /* ignore */ } },
        'error-callback': () => set(''),
      })
    }).catch(() => {})
    return () => {
      gone = true
      try { if (state.current.widget != null) window.turnstile?.remove(state.current.widget) } catch { /* ignore */ }
      state.current.widget = null
    }
  }, [siteKey, theme, lang]) // eslint-disable-line

  if (!siteKey) return null
  return <div ref={box} className={className} />
}
