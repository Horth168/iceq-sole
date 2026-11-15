// KHQR payment card laid out like the official KHQR card: white card, red header with the KHQR
// wordmark and the folded corner, receiver name, large amount + currency, dashed divider, QR with
// the currency mark in the centre. Always pure white (also in dark mode) so every bank app scans it.
import { QRCodeSVG } from 'qrcode.react'
import { cls } from '../lib/format'

const RED = '#E21A2C'
// centre mark: black disc with the currency sign, as on bank-issued KHQR codes
const mark = (sign) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff"/><circle cx="20" cy="20" r="17" fill="#000"/><text x="20" y="26.8" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#fff">${sign}</text></svg>`)}`

export default function KhqrCard({ value, imageUrl, name, amount, currency = 'USD', dim = false, children, className = '' }) {
  const shown = currency === 'KHR' ? Math.round(Number(amount)).toLocaleString('en-US') : Number(amount).toFixed(2)
  return (
    <div className={cls('relative mx-auto w-full max-w-[290px] select-none', className)}>
      <div className={cls('relative overflow-hidden rounded-[20px] shadow-[0_22px_48px_-20px_rgba(0,0,0,.5)] ring-1 ring-black/[0.06] transition-opacity duration-300', dim && 'opacity-40')}
        style={{ background: '#FFFFFF', color: '#000000' }}>
        {/* red header: KHQR wordmark, folded corner hanging from the right edge */}
        <div className="relative grid h-[58px] place-items-center" style={{ background: RED }}>
          <img src="/khqr/khqr-logo-white.png" alt="KHQR" width="664" height="158" className="h-[21px] w-auto" draggable="false" />
        </div>
        <span aria-hidden className="absolute right-0 top-[58px] h-0 w-0 border-l-[26px] border-t-[20px] border-l-transparent" style={{ borderTopColor: RED }} />

        <div className="px-7 pb-1 pt-5">
          <p className="truncate text-[13px] font-medium tracking-[0.01em]" style={{ color: 'rgba(0,0,0,.72)' }}>{name || 'IceQ Sole'}</p>
          <p className="keep-latin mt-1.5 flex items-baseline gap-1.5 font-sans tabular-nums">
            <span className="text-[30px] font-extrabold leading-none tracking-tight">{shown}</span>
            <span className="text-[13px] font-semibold" style={{ color: 'rgba(0,0,0,.55)' }}>{currency}</span>
          </p>
        </div>

        {/* dashed divider between the amount and the code */}
        <div className="relative my-4 h-px">
          <div className="absolute inset-x-6 top-0 border-t-[1.5px] border-dashed" style={{ borderColor: 'rgba(0,0,0,.18)' }} />
        </div>

        <div className="px-7 pb-7 pt-1">
          {value ? (
            <QRCodeSVG value={value} size={236} level="Q" bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full"
              imageSettings={{ src: mark(currency === 'KHR' ? '៛' : '$'), height: 42, width: 42, excavate: true }} />
          ) : imageUrl ? <img src={imageUrl} alt="KHQR" className="w-full" /> : null}
        </div>
      </div>
      {children}
    </div>
  )
}
