import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, MessageCircle, SendHorizontal, X } from 'lucide-react'
import { useStore } from '../context/Store'
import { usePrefs } from '../context/Prefs'
import { cls } from '../lib/format'
import { LogoMark } from './Logo'

// Support chat with instant automatic answers (no account or server needed). For anything urgent it
// hands over to the owner's Telegram - the ONLY place on the site that links to that account.
const URGENT_URL = 'https://t.me/iceq_168'
const URGENT_HANDLE = '@iceq_168'
const KEY = 'iq_support_chat'

const TEXT = {
  en: {
    open: 'Chat with us', close: 'Close chat', title: 'IceQ Sole support', status: 'Instant answers · 24/7',
    hello: "Hi! Welcome to IceQ Sole. I'm the IceQ assistant: ask me anything or tap a topic below.",
    placeholder: 'Type your question…', send: 'Send',
    topics: { track: 'Track my order', delivery: 'Delivery & fees', pay: 'How to pay', sizes: 'Sizes & exchanges', human: 'Urgent question' },
    track: 'Open Track an order and enter your order number (it starts with IQ) and the phone you used. Orders you placed on this phone are listed there too.',
    trackBtn: 'Track an order',
    delivery: ({ pp, ppDays, prov, provDays, free }) => `Phnom Penh: ${pp} · ${ppDays}. Provinces: ${prov} · ${provDays}.${free ? ` Free delivery on orders over ${free}.` : ''}`,
    pay: 'You can pay with ABA KHQR: scan the code at checkout with ABA or any Bakong banking app, and your order updates as soon as the payment is confirmed. Bank transfer and cash on delivery are also available when shown at checkout.',
    sizes: 'All sneakers use EU sizes. Unworn pairs in their original box can be exchanged for another size or style within 7 days of delivery.',
    human: 'For an urgent question, message our team directly on Telegram. Please include your order number if you have one.',
    humanBtn: `Chat on Telegram ${URGENT_HANDLE}`,
    fallback: "I'm not sure about that one. Pick a topic below, or for something urgent message our team on Telegram.",
    thanks: "You're welcome! Anything else?",
  },
  km: {
    open: 'ជជែកជាមួយយើង', close: 'បិទ', title: 'ជំនួយ IceQ Sole', status: 'ឆ្លើយភ្លាមៗ · 24/7',
    hello: 'សួស្តី! សូមស្វាគមន៍មកកាន់ IceQ Sole។ ខ្ញុំជាជំនួយការ IceQ៖ សួរខ្ញុំបាន ឬជ្រើសប្រធានបទខាងក្រោម។',
    placeholder: 'វាយសំណួររបស់អ្នក…', send: 'ផ្ញើ',
    topics: { track: 'តាមដានការបញ្ជាទិញ', delivery: 'ការដឹកជញ្ជូន និងតម្លៃ', pay: 'របៀបបង់ប្រាក់', sizes: 'ទំហំ និងការប្តូរ', human: 'សំណួរបន្ទាន់' },
    track: 'បើក "តាមដានការបញ្ជាទិញ" ហើយបញ្ចូលលេខការបញ្ជាទិញ (ចាប់ផ្តើមដោយ IQ) និងលេខទូរស័ព្ទដែលអ្នកបានប្រើ។ ការបញ្ជាទិញនៅលើទូរស័ព្ទនេះក៏បង្ហាញនៅទីនោះដែរ។',
    trackBtn: 'តាមដានការបញ្ជាទិញ',
    delivery: ({ pp, ppDays, prov, provDays, free }) => `ភ្នំពេញ៖ ${pp} · ${ppDays}។ ខេត្ត៖ ${prov} · ${provDays}។${free ? ` ដឹកជញ្ជូនឥតគិតថ្លៃ សម្រាប់ការបញ្ជាទិញលើស ${free}។` : ''}`,
    pay: 'អ្នកអាចបង់ដោយ ABA KHQR៖ ស្កេនកូដនៅពេលទូទាត់ ដោយ ABA ឬកម្មវិធីធនាគារ Bakong ណាមួយ ហើយការបញ្ជាទិញនឹងធ្វើបច្ចុប្បន្នភាពភ្លាមៗពេលការបង់ប្រាក់ត្រូវបានបញ្ជាក់។ ការផ្ទេរប្រាក់ និងបង់ពេលទទួលទំនិញ ក៏មានផងដែរ ពេលបង្ហាញនៅទំព័រទូទាត់។',
    sizes: 'ស្បែកជើងទាំងអស់ប្រើទំហំ EU។ ស្បែកជើងមិនទាន់ពាក់ ក្នុងប្រអប់ដើម អាចប្តូរទំហំ ឬម៉ូដផ្សេងបាន ក្នុងរយៈពេល 7 ថ្ងៃ បន្ទាប់ពីទទួលបាន។',
    human: 'សម្រាប់សំណួរបន្ទាន់ សូមផ្ញើសារទៅក្រុមការងាររបស់យើងតាម Telegram។ សូមភ្ជាប់លេខការបញ្ជាទិញ ប្រសិនបើមាន។',
    humanBtn: `ជជែកតាម Telegram ${URGENT_HANDLE}`,
    fallback: 'ខ្ញុំមិនប្រាកដអំពីសំណួរនេះទេ។ សូមជ្រើសប្រធានបទខាងក្រោម ឬសម្រាប់រឿងបន្ទាន់ សូមផ្ញើសារទៅក្រុមការងារតាម Telegram។',
    thanks: 'មិនអីទេ! មានអ្វីទៀតទេ?',
  },
}

const RULES = [
  ['human', /urgent|human|person|agent|admin|staff|call|talk|contact|complain|telegram|refund|problem|issue|បន្ទាន់|មនុស្ស|ទាក់ទង|បញ្ហា/i],
  ['track', /track|order|where|status|arriv|iq\d|តាមដាន|ការបញ្ជាទិញ|ឥវ៉ាន់|ទៅដល់/i],
  ['delivery', /deliver|ship|fee|cost|province|phnom|courier|how long|ដឹក|ខេត្ត|ថ្លៃ/i],
  ['pay', /pay|khqr|aba|bank|cash|cod|qr|card|visa|bakong|បង់|ប្រាក់|ធនាគារ/i],
  ['sizes', /size|fit|exchange|return|swap|small|big|ទំហំ|ប្តូរ|លេខជើង/i],
  ['thanks', /thank|thx|អរគុណ/i],
]

function answerFor(topic, t, settings) {
  if (topic === 'delivery') {
    const d = settings?.delivery || {}
    const usd = (v) => (v === 0 || v === '0' ? (t === TEXT.km ? 'ឥតគិតថ្លៃ' : 'free') : v != null ? `$${Number(v).toFixed(2)}` : '—')
    return { text: t.delivery({ pp: usd(d.phnom_penh_fee), ppDays: d.estimated_days_phnom_penh || 'Same / next day', prov: usd(d.province_fee),
      provDays: d.estimated_days_province || '1–3 days', free: d.free_shipping_threshold ? `$${d.free_shipping_threshold}` : '' }) }
  }
  if (topic === 'track') return { text: t.track, link: { to: '/track', label: t.trackBtn } }
  if (topic === 'human') return { text: t.human, urgent: true }
  return { text: t[topic] || t.fallback, urgent: !t[topic] }
}

const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || [] } catch { return [] } }

export default function SupportChat() {
  const { settings } = useStore()
  const { lang } = usePrefs()
  const t = TEXT[lang] || TEXT.en
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState(load)
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const list = useRef(null)
  const field = useRef(null)

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))) } catch { /* private mode */ } }, [msgs])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs, typing, open])
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  if (pathname.startsWith('/checkout')) return null

  const reply = (topic, userText) => {
    setMsgs((m) => [...m, { from: 'me', text: userText }])
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      setMsgs((m) => [...m, { from: 'bot', topic }])
    }, 650)
  }
  const ask = (e) => {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    setInput('')
    reply(RULES.find(([, rx]) => rx.test(q))?.[0] || 'fallback', q)
  }

  return (
    <>
      {/* launcher: sits above the mobile tab bar */}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? t.close : t.open} aria-expanded={open}
        className={cls('fixed right-4 z-[55] grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-[0_14px_34px_-12px_rgba(0,0,0,.6)] ring-1 ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:scale-105 active:scale-95 md:bottom-6 md:right-6',
          'bottom-[calc(80px+env(safe-area-inset-bottom))]')}>
        <span className={cls('absolute transition duration-300', open ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')}><MessageCircle size={24} /></span>
        <span className={cls('absolute transition duration-300', open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')}><X size={22} /></span>
        {!open && !msgs.length && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-ice-500 ring-2 ring-bone" />}
      </button>

      <section role="dialog" aria-label={t.title} aria-hidden={!open}
        className={cls('fixed right-4 z-[56] flex w-[min(380px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-[24px] bg-bone text-ink shadow-[0_30px_80px_-24px_rgba(0,0,0,.55)] ring-1 ring-ink/10 transition-all duration-300 ease-[cubic-bezier(.2,.8,.2,1)] md:bottom-24 md:right-6',
          'bottom-[calc(146px+env(safe-area-inset-bottom))] h-[min(560px,calc(100dvh-220px))] md:h-[min(560px,calc(100dvh-140px))]',
          open ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-4 scale-95 opacity-0')}>
        <header className="flex items-center gap-3 bg-night px-5 py-4 text-snow">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-snow/10"><LogoMark className="h-6 w-6" color="#fff" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold">{t.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-snow/60"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t.status}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="grid h-9 w-9 place-items-center rounded-full text-snow/70 transition hover:bg-snow/10 hover:text-snow"><X size={18} /></button>
        </header>

        <div ref={list} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5">
          <Bubble>{t.hello}</Bubble>
          {msgs.map((m, i) => m.from === 'me'
            ? <Bubble key={i} me>{m.text}</Bubble>
            : <BotAnswer key={i} a={answerFor(m.topic, t, settings)} t={t} />)}
          {typing && <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-soft">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 120}ms` }} />)}</div>}
        </div>

        <div className="border-t border-ink/10 bg-bone px-3 pb-3 pt-2.5">
          <div className="no-scrollbar -mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1">
            {Object.entries(t.topics).map(([k, label]) => (
              <button key={k} type="button" onClick={() => reply(k, label)}
                className={cls('shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-95',
                  k === 'human' ? 'border-[#2AABEE]/40 text-[#1E96D6] hover:bg-[#2AABEE]/10' : 'border-ink/15 hover:border-ink/40')}>{label}</button>
            ))}
          </div>
          <form onSubmit={ask} className="flex items-center gap-2">
            <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder}
              maxLength={300} className="field !min-h-[46px] flex-1 !rounded-full !py-2.5" />
            <button aria-label={t.send} disabled={!input.trim()} className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-ink text-white transition hover:-translate-y-px active:scale-95 disabled:opacity-40"><SendHorizontal size={18} /></button>
          </form>
        </div>
      </section>
    </>
  )
}

function Bubble({ me, children }) {
  return (
    <div className={cls('max-w-[85%] animate-fade-up whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed',
      me ? 'ml-auto rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white text-ink shadow-soft')}>{children}</div>
  )
}

function BotAnswer({ a, t }) {
  return (
    <div className="max-w-[85%] animate-fade-up space-y-2.5">
      <Bubble>{a.text}</Bubble>
      {a.link && <Link to={a.link.to} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white">{a.link.label}<ArrowUpRight size={14} /></Link>}
      {a.urgent && (
        <a href={URGENT_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px"
          style={{ background: 'linear-gradient(135deg, #37B6F2, #2AABEE 55%, #1E96D6)' }}>
          <SendHorizontal size={14} />{t.humanBtn}
        </a>
      )}
    </div>
  )
}
