// Keeps the installed app (home-screen PWA / Telegram Mini App) on the newest version.
// The service worker activates a new version as soon as it is downloaded; we then reload the page so
// the new code runs - but never on the checkout page (a half-filled form would be lost): there we wait
// until the customer moves to another page. Checks happen on open, on return to the app, and every 30 min.
let pending = false

const onCheckout = (p = window.location.pathname) => p.startsWith('/checkout')

export function startUpdates() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return // first install: nothing to refresh
    pending = true
    applyIfSafe()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}) }
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    }).catch(() => {})
  })
}

export function applyIfSafe(pathname = window.location.pathname) {
  if (pending && !onCheckout(pathname)) {
    pending = false
    window.location.reload()
  }
}
