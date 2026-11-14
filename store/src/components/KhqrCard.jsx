// KHQR payment card in the official KHQR style: white card, red header with the folded corner,
// receiver name, big amount + currency, dashed divider, QR with the currency mark in the centre.
import { QRCodeSVG } from 'qrcode.react'
import { cls } from '../lib/format'

const RED = '#E1232E'
// centre mark: black disc with the currency sign (as on bank-issued KHQR codes)
const mark = (sign) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#000"/><circle cx="20" cy="20" r="19" fill="none" stroke="#fff" stroke-width="2"/><text x="20" y="27.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#fff">${sign}</text></svg>`)}`

export default function KhqrCard({ value, imageUrl, name, amount, currency = 'USD', dim = false, children, className = '' }) {
  const shown = currency === 'KHR' ? Math.round(Number(amount)).toLocaleString('en-US') : Number(amount).toFixed(2)
  return (
    <div className={cls('relative mx-auto w-full max-w-[280px] select-none', className)}>
      <div className={cls('overflow-hidden rounded-[22px] bg-snow text-night shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] ring-1 ring-black/5 transition-opacity', dim && 'opacity-40')}>
        {/* red header with the KHQR folded corner */}
        <div className="relative flex h-[52px] items-center justify-center" style={{ background: RED }}>
          <span className="keep-latin text-[19px] font-black tracking-[0.18em] text-snow">KHQR</span>
          <span aria-hidden className="absolute -bottom-[18px] right-0 h-0 w-0 border-l-[22px] border-t-[18px] border-l-transparent" style={{ borderTopColor: RED }} />
        </div>
        <div className="px-6 pb-2 pt-4">
          <p className="truncate text-[13px] font-medium uppercase tracking-wide text-night/80">{name || 'IceQ Sole'}</p>
          <p className="keep-latin mt-1 flex items-baseline gap-1.5 font-sans tabular-nums">
            <span className="text-[30px] font-extrabold leading-none">{shown}</span>
            <span className="text-sm font-semibold text-night/60">{currency}</span>
          </p>
        </div>
        <div className="relative my-3">
          <div className="mx-0 border-t-2 border-dashed border-night/15" />
        </div>
        <div className="px-6 pb-6">
          {value ? (
            <QRCodeSVG value={value} size={232} level="Q" bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full"
              imageSettings={{ src: mark(currency === 'KHR' ? '៛' : '$'), height: 40, width: 40, excavate: true }} />
          ) : imageUrl ? <img src={imageUrl} alt="KHQR" className="w-full" /> : null}
        </div>
      </div>
      {children}
    </div>
  )
}
