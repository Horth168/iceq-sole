import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { useStore } from '../context/Store'
import { useToast } from '../context/Toast'
import { usePrefs } from '../context/Prefs'
import { Spinner } from './ui'

// Discount-code box shared by the bag and checkout. The code is stored on the cart server-side,
// so applying it here is exactly the same as applying it in the bag, and checkout re-quotes the total.
// Not a <form>: it sits inside the checkout form, so Enter is handled by hand.
export default function PromoCode({ className = '' }) {
  const { t } = usePrefs()
  const { cart, applyDiscount, removeDiscount } = useStore()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!cart) return null

  const apply = async () => {
    if (!code.trim() || busy) return
    setErr(''); setBusy(true)
    try { await applyDiscount(code.trim()); setCode(''); toast.success(t('bag.codeApplied')) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await removeDiscount() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className={className}>
      {cart.discount_code ? (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-semibold text-emerald-800"><Tag size={15} /> {cart.discount_code}</span>
          <button type="button" onClick={remove} disabled={busy} aria-label={t('bag.removeCode')} className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-emerald-800 hover:bg-emerald-100">
            {busy ? <Spinner className="h-4 w-4" /> : <X size={16} />}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
            placeholder={t('bag.codePlaceholder')} aria-label={t('bag.codePlaceholder')} autoComplete="off" enterKeyHint="go"
            className="field !min-h-[46px] uppercase" />
          <button type="button" onClick={apply} className="btn-outline !min-h-[46px] shrink-0 !px-5" disabled={!code.trim() || busy}>
            {busy ? <Spinner className="h-4 w-4" /> : t('common.apply')}
          </button>
        </div>
      )}
      {(err || cart.messages?.[0]) && <p className="mt-2 text-xs font-medium text-signal">{err || cart.messages[0]}</p>}
    </div>
  )
}
