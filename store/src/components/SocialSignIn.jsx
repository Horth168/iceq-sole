import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { inTelegramApp, telegramInitData, telegramUser } from '../lib/telegram'
import { Spinner } from './ui'

// "Continue with Google / Telegram" (both free). Each button only appears once the API publishes
// its key (google_client_id / telegram_login_bot), so nothing shows until it is configured.
// Inside the Telegram Mini App: one-tap "Continue as <name>" (Google refuses in-app browsers).
let gsiPromise
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  gsiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
    s.onload = () => resolve(window.google)
    s.onerror = () => { gsiPromise = undefined; reject(new Error('gsi')) }
    document.head.appendChild(s)
  })
  return gsiPromise
}

export default function SocialSignIn({ onDone, remember = true }) {
  const { settings, socialLogin } = useStore()
  const { t, theme, lang } = usePrefs()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const googleId = settings?.google_client_id
  const tgBot = settings?.telegram_login_bot
  const insideTg = inTelegramApp() && !!settings?.telegram_login
  const showGoogle = !!googleId && !inTelegramApp()
  const showTgWidget = !!tgBot && !insideTg

  const run = async (provider, body) => {
    setBusy(provider); setErr('')
    try { onDone(await socialLogin(provider, body, remember)) } catch (e) { setErr(e.message || t('auth.socialFailed')) } finally { setBusy('') }
  }
  const runRef = useRef(run)
  runRef.current = run

  // Google button
  const gBox = useRef(null)
  useEffect(() => {
    if (!showGoogle || !gBox.current) return
    let gone = false
    loadGoogle().then((g) => {
      if (gone || !gBox.current) return
      g.accounts.id.initialize({ client_id: googleId, callback: (r) => runRef.current('google', { credential: r.credential }), ux_mode: 'popup' })
      gBox.current.innerHTML = ''
      g.accounts.id.renderButton(gBox.current, {
        type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill',
        text: 'continue_with', logo_alignment: 'center', locale: lang === 'km' ? 'km' : 'en',
        width: Math.min(400, Math.max(240, Math.round(gBox.current.offsetWidth || 320))),
      })
    }).catch(() => {})
    return () => { gone = true }
  }, [showGoogle, googleId, theme, lang])

  // Telegram Login Widget (websites)
  const tBox = useRef(null)
  useEffect(() => {
    if (!showTgWidget || !tBox.current) return
    window.__iqTelegramAuth = (u) => runRef.current('telegram', u)
    const s = document.createElement('script')
    s.src = 'https://telegram.org/js/telegram-widget.js?22'; s.async = true
    s.setAttribute('data-telegram-login', tgBot)
    s.setAttribute('data-size', 'large')
    s.setAttribute('data-radius', '999')
    s.setAttribute('data-request-access', 'write')
    s.setAttribute('data-lang', lang === 'km' ? 'en' : lang) // Telegram has no Khmer widget
    s.setAttribute('data-onauth', '__iqTelegramAuth(user)')
    tBox.current.innerHTML = ''
    tBox.current.appendChild(s)
  }, [showTgWidget, tgBot, lang])

  if (!showGoogle && !showTgWidget && !insideTg) return null
  const me = telegramUser()
  return (
    <div className="mt-8">
      <div className="space-y-3">
        {insideTg && (
          <button type="button" onClick={() => run('telegram-app', { init_data: telegramInitData() })} disabled={!!busy}
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-[#2AABEE] px-5 font-semibold text-white transition hover:brightness-105 active:scale-[.98] disabled:opacity-60">
            {busy === 'telegram-app' ? <Spinner className="h-4 w-4" /> : <Send size={18} />}
            {me?.first_name ? t('auth.continueAs', { name: me.first_name }) : t('auth.continueTelegram')}
          </button>
        )}
        {showGoogle && <div ref={gBox} className="flex min-h-[44px] w-full justify-center" />}
        {showTgWidget && <div ref={tBox} className="flex min-h-[40px] w-full justify-center" />}
      </div>
      {busy && busy !== 'telegram-app' && <p className="mt-3 flex items-center justify-center gap-2 text-sm text-stone-450"><Spinner className="h-4 w-4" /> {t('auth.signingIn')}</p>}
      {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-signal" role="alert">{err}</p>}
      <div className="mt-7 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-450">
        <span className="h-px flex-1 bg-ink/10" />{t('auth.orEmail')}<span className="h-px flex-1 bg-ink/10" />
      </div>
    </div>
  )
}
