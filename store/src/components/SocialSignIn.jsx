import { useEffect, useRef, useState } from 'react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { cls } from '../lib/format'
import { inTelegramApp, telegramInitData, telegramUser } from '../lib/telegram'
import { Spinner } from './ui'

// "Continue with Google / Telegram" (both free), drawn as our own buttons so they match the store.
// Clicking opens the official Google / Telegram sign-in popup; the API then verifies the result with
// Google / Telegram before signing anyone in. Each button appears only once its key is configured.
// Inside the Telegram Mini App: a one-tap "Continue as <name>" (Google refuses in-app browsers).

function loadScript(src, ready) {
  if (ready()) return Promise.resolve()
  loadScript.cache ??= {}
  loadScript.cache[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src; s.async = true
    s.onload = () => resolve()
    s.onerror = () => { delete loadScript.cache[src]; reject(new Error(src)) }
    document.head.appendChild(s)
  })
  return loadScript.cache[src]
}
const GSI = 'https://accounts.google.com/gsi/client'
const TG_WIDGET = 'https://telegram.org/js/telegram-widget.js?22'

export function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function TelegramLogo({ size = 20, mono = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {!mono && <circle cx="12" cy="12" r="12" fill="#2AABEE" />}
      <path fill={mono ? 'currentColor' : '#fff'} d="M5.4 11.8c3.5-1.5 5.8-2.5 7-3 3.3-1.4 4-1.6 4.5-1.6.1 0 .3 0 .5.2.1.1.2.3.2.4v.6c-.2 2-1 6.9-1.4 9.2-.2 1-.5 1.3-.9 1.3-.8.1-1.4-.5-2.1-1l-3-2c-1.3-.9-.5-1.4.3-2.2.2-.2 3.6-3.3 3.6-3.6 0 0 0-.2-.1-.2-.1-.1-.2 0-.3 0-.1 0-2 1.3-5.7 3.8-.5.4-1 .5-1.5.5-.5 0-1.4-.3-2.1-.5-.8-.3-1.5-.4-1.4-.9 0-.2.4-.5 1-.8z" />
    </svg>
  )
}

function ProviderButton({ logo, label, busy, disabled, onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cls('group relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full border border-ink/15 bg-white px-5 text-[15px] font-semibold text-ink shadow-sm transition',
        'hover:-translate-y-px hover:border-ink/30 hover:shadow-lift active:translate-y-0 active:scale-[.985] disabled:pointer-events-none disabled:opacity-60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone', className)}>
      <span className="absolute left-5 grid h-6 w-6 place-items-center">{busy ? <Spinner className="h-4 w-4" /> : logo}</span>
      <span>{label}</span>
    </button>
  )
}

export default function SocialSignIn({ onDone, remember = true }) {
  const { settings, socialLogin } = useStore()
  const { t, lang } = usePrefs()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const googleId = settings?.google_client_id
  const botId = settings?.telegram_login_bot_id
  const insideTg = inTelegramApp() && !!settings?.telegram_login
  const showGoogle = !!googleId && !inTelegramApp()
  const showTelegram = !!botId && !insideTg

  const run = async (provider, body) => {
    setBusy(provider); setErr('')
    try { onDone(await socialLogin(provider, body, remember)) } catch (e) { setErr(e.message || t('auth.socialFailed')) } finally { setBusy('') }
  }
  const runRef = useRef(run)
  runRef.current = run

  // Load the providers' scripts as soon as the page opens, so the popup opens instantly on tap
  // (browsers only allow popups straight from the click).
  const tokenClient = useRef(null)
  useEffect(() => {
    if (!showGoogle) return
    loadScript(GSI, () => window.google?.accounts?.oauth2).then(() => {
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleId,
        scope: 'openid email profile',
        callback: (r) => { if (r?.access_token) runRef.current('google', { access_token: r.access_token }); else setBusy('') },
        error_callback: () => setBusy(''), // popup closed or blocked
      })
    }).catch(() => {})
  }, [showGoogle, googleId])
  useEffect(() => {
    if (showTelegram) loadScript(TG_WIDGET, () => window.Telegram?.Login).catch(() => {})
  }, [showTelegram])

  const google = () => {
    setErr('')
    if (!tokenClient.current) { setErr(t('auth.socialFailed')); return }
    setBusy('google')
    tokenClient.current.requestAccessToken({ prompt: 'select_account' })
  }
  const telegram = () => {
    setErr('')
    if (!window.Telegram?.Login) { setErr(t('auth.socialFailed')); return }
    setBusy('telegram')
    window.Telegram.Login.auth({ bot_id: botId, request_access: 'write', lang: lang === 'km' ? 'en' : lang }, (data) => {
      if (data) runRef.current('telegram', data); else setBusy('') // closed without signing in
    })
  }

  if (!showGoogle && !showTelegram && !insideTg) return null
  const me = telegramUser()
  return (
    <div className="mt-8">
      <div className="space-y-3">
        {insideTg && (
          <button type="button" onClick={() => run('telegram-app', { init_data: telegramInitData() })} disabled={!!busy}
            className="relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full bg-[#2AABEE] px-5 text-[15px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:brightness-105 active:scale-[.985] disabled:opacity-60">
            <span className="absolute left-5 grid h-6 w-6 place-items-center">{busy === 'telegram-app' ? <Spinner className="h-4 w-4" /> : <TelegramLogo mono size={20} />}</span>
            {me?.first_name ? t('auth.continueAs', { name: me.first_name }) : t('auth.continueTelegram')}
          </button>
        )}
        {showGoogle && <ProviderButton logo={<GoogleLogo />} label={t('auth.continueGoogle')} busy={busy === 'google'} disabled={!!busy} onClick={google} />}
        {showTelegram && <ProviderButton logo={<TelegramLogo />} label={t('auth.continueTelegram')} busy={busy === 'telegram'} disabled={!!busy} onClick={telegram} />}
      </div>
      {err && <p className="mt-3 animate-fade-in rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-signal" role="alert">{err}</p>}
      <div className="mt-7 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-450">
        <span className="h-px flex-1 bg-ink/10" />{t('auth.orEmail')}<span className="h-px flex-1 bg-ink/10" />
      </div>
    </div>
  )
}
