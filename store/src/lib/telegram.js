// The IceQ Sole Telegram Mini App and helpers for when the store is running inside it.
export const TELEGRAM_APP_URL = 'https://t.me/IceQ_Sole_MiniApp_Bot/iceqsole'

const webApp = () => window.Telegram?.WebApp
// true only inside the Mini App (Telegram passes signed initData there)
export const inTelegramApp = () => !!webApp()?.initData
export const telegramInitData = () => webApp()?.initData || ''
export const telegramUser = () => webApp()?.initDataUnsafe?.user || null

// Open the Mini App: inside Telegram jump straight to it, elsewhere use the t.me link
// (opens the Telegram app on phones, or Telegram's web page with a QR on desktop).
export function openTelegramApp() {
  const tg = webApp()
  if (tg?.openTelegramLink) { tg.openTelegramLink(TELEGRAM_APP_URL); return }
  window.open(TELEGRAM_APP_URL, '_blank', 'noopener')
}
