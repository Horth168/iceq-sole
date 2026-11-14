// "Your bank KHQR": the admin uploads their own bank QR (e.g. ABA). The code is read in the browser,
// checked by the server, shown for confirmation, then saved. Every order's QR is built from it.
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, QrCode, ScanLine, Trash2 } from 'lucide-react'
import jsQR from 'jsqr'
import { api } from '../lib/api'
import { usePrefs } from '../context/Prefs'
import { Card, Spinner, useToast } from './ui'

function readQr(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // try full size, then a smaller copy (phone screenshots can be very large)
      for (const scale of [1, 0.5, 1.5]) {
        const c = document.createElement('canvas')
        c.width = Math.round(img.naturalWidth * scale)
        c.height = Math.round(img.naturalHeight * scale)
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, c.width, c.height)
        const res = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
        if (res?.data) { URL.revokeObjectURL(url); resolve(res.data.trim()); return }
      }
      URL.revokeObjectURL(url)
      reject(new Error('no-qr'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no-qr')) }
    img.src = url
  })
}

export default function BankQrCard({ template, disabled, onSave }) {
  const { t } = usePrefs()
  const toast = useToast()
  const [saved, setSaved] = useState(null)   // info for the saved template
  const [found, setFound] = useState(null)   // { template, ...info } read from a new upload
  const [busy, setBusy] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    if (!template) { setSaved(null); return }
    api('/api/admin/settings/khqr/preview', { method: 'POST', body: { template } }).then(setSaved).catch(() => setSaved(null))
  }, [template])

  const pick = async (file) => {
    if (!file) return
    setBusy(true); setFound(null)
    try {
      const code = await readQr(file)
      const info = await api('/api/admin/settings/khqr/preview', { method: 'POST', body: { template: code } })
      setFound({ ...info, template: code })
    } catch (e) {
      toast.error(e.message === 'no-qr' ? t('settings.bankQrNoCode') : e.message)
    } finally { setBusy(false) }
  }
  const use = async () => { setBusy(true); try { await onSave(found.template); setFound(null) } catch (e) { toast.error(e.message) } finally { setBusy(false) } }
  const remove = async () => { if (!window.confirm(t('settings.bankQrRemoveConfirm'))) return; try { await onSave('') } catch (e) { toast.error(e.message) } }

  const Info = ({ info }) => (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-stone-450">{t('settings.bankQrName')}</dt><dd className="font-semibold">{info.name || '—'}</dd></div>
      <div><dt className="text-xs text-stone-450">{t('settings.bankQrBank')}</dt><dd className="font-semibold">{info.bank || info.bakong_id || '—'}</dd></div>
      {info.account && <div><dt className="text-xs text-stone-450">{t('settings.bankQrAccount')}</dt><dd className="font-mono">{info.account}</dd></div>}
      {info.city && <div><dt className="text-xs text-stone-450">{t('settings.bankQrCity')}</dt><dd>{info.city}</dd></div>}
    </dl>
  )

  return (
    <Card title={t('settings.bankQr')}>
      <p className="text-sm text-stone-450">{t('settings.bankQrHint')}</p>
      {saved ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> {t('settings.bankQrActive')}</p>
          <Info info={saved} />
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><QrCode size={16} /> {t('settings.bankQrNone')}</p>
      )}
      {found && (
        <div className="mt-4 rounded-2xl border-2 border-ice-400 p-4">
          <p className="mb-3 text-sm font-semibold">{t('settings.bankQrCheck')}</p>
          <Info info={found} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={use} disabled={busy || disabled} className="btn-primary !min-h-[42px]">{busy ? <Spinner /> : <CheckCircle2 size={16} />} {t('settings.bankQrUse')}</button>
            <button type="button" onClick={() => setFound(null)} className="btn-ghost !min-h-[42px]">{t('common.cancel')}</button>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="btn-outline !min-h-[42px]">
          {busy && !found ? <Spinner /> : <ScanLine size={16} />} {saved ? t('settings.bankQrReplace') : t('settings.bankQrUpload')}
        </button>
        {saved && !disabled && <button type="button" onClick={remove} className="btn-ghost !min-h-[42px] text-signal"><Trash2 size={16} /> {t('common.remove')}</button>}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </Card>
  )
}
