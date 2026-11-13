// IceQ Sole identity: a hexagonal ice crystal whose base reads as a sneaker sole,
// with a blade-like tail that turns the crystal into a "Q".
export function LogoMark({ className = 'h-8 w-8', color = 'currentColor', accent = '#8FD6F5' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <path d="M9.2 20.6h13.6" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <path d="M20.4 23.4 28.6 30" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ className = '', light = false, compact = false }) {
  const color = light ? '#FFFFFF' : '#0A0A0B'
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="IceQ Sole">
      <LogoMark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" color={color} />
      {!compact && (
        <span className="flex items-baseline gap-1.5 leading-none" style={{ color }}>
          <span className="font-wide text-[19px] font-black tracking-[-0.02em] sm:text-[21px]">ICEQ</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.42em] opacity-70 sm:text-xs">Sole</span>
        </span>
      )}
    </span>
  )
}
