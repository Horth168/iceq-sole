import { QRCodeSVG } from 'qrcode.react'
import { ArrowUpRight, BellRing, QrCode, Send, Zap } from 'lucide-react'
import { usePrefs } from '../context/Prefs'
import { cls } from '../lib/format'
import { inTelegramApp, openTelegramApp, TELEGRAM_APP_URL } from '../lib/telegram'
import { Reveal } from './ui'

const BLUE = '#2AABEE' // Telegram's brand blue

// Home page: why and how to shop in the Telegram Mini App. Phones get a big button;
// computers also get a QR code to scan with the phone. Hidden when already inside the Mini App.
export function TelegramAppSection() {
  const { t } = usePrefs()
  if (inTelegramApp()) return null
  const points = [[Zap, t('tg.point1')], [QrCode, t('tg.point2')], [BellRing, t('tg.point3')]]
  return (
    <Reveal as="section" className="container-x mt-24 md:mt-32">
      <div className="relative overflow-hidden rounded-[28px] text-snow ring-1 ring-white/10"
        style={{ background: 'linear-gradient(135deg, #0F2433 0%, #0B0B0D 62%)' }}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-30 blur-3xl" style={{ background: BLUE }} />
        <div className="relative grid items-center gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_auto] lg:p-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-snow/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-snow/80">
              <Send size={13} style={{ color: BLUE }} /> {t('tg.eyebrow')}
            </p>
            <h2 className="h-display mt-5 max-w-xl text-[40px] leading-[0.95] sm:text-6xl">{t('tg.title')}</h2>
            <p className="mt-4 max-w-lg text-snow/70">{t('tg.text')}</p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-3">
              {points.map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl bg-snow/[0.06] p-3.5 text-sm font-medium ring-1 ring-snow/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${BLUE}26`, color: BLUE }}><Icon size={17} /></span>{text}
                </li>
              ))}
            </ul>
            <TelegramAppButton className="mt-8 w-full sm:w-auto" />
          </div>
          <div className="hidden flex-col items-center lg:flex">
            <div className="rounded-3xl bg-white p-4 shadow-lift">
              <QRCodeSVG value={TELEGRAM_APP_URL} size={176} level="M" fgColor="#0B0B0D" />
            </div>
            <p className="mt-4 max-w-[13rem] text-center text-sm text-snow/60">{t('tg.scan')}</p>
          </div>
        </div>
      </div>
    </Reveal>
  )
}

export function TelegramAppButton({ className = '', compact = false }) {
  const { t } = usePrefs()
  if (inTelegramApp()) return null
  return (
    <a href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer"
      onClick={(e) => { if (window.Telegram?.WebApp?.openTelegramLink) { e.preventDefault(); openTelegramApp() } }}
      className={cls('tg-cta group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full font-semibold text-white',
        'shadow-[0_10px_30px_-12px_rgba(42,171,238,.75)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-12px_rgba(42,171,238,.9)] active:translate-y-0 active:scale-[.98]',
        compact ? 'min-h-[44px] px-5 text-sm' : 'min-h-[56px] px-8 text-[15px]', className)}
      style={{ background: `linear-gradient(135deg, #37B6F2 0%, ${BLUE} 55%, #1E96D6 100%)` }}>
      <span aria-hidden className="tg-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />
      <Send size={compact ? 16 : 18} className="relative transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      <span className="relative">{t('tg.open')}</span>
      <ArrowUpRight size={compact ? 15 : 17} className="relative opacity-80 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  )
}
