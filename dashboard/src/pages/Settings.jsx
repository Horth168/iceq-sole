import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseBackup, FileJson, FileSpreadsheet, Plus, ShieldCheck, Upload } from 'lucide-react'
import { api, assetUrl, download, upload } from '../lib/api'
import { useAuth } from '../components/Layout'
import { cls, date } from '../lib/format'
import { Card, Field, Modal, PageHeader, Pill, Spinner, Toggle, useToast } from '../components/ui'
import { Rich, usePrefs } from '../context/Prefs'
import BankQrCard from '../components/BankQrCard'

const TABS = ['store', 'delivery', 'payments', 'regional', 'staff', 'backup', 'system']

export default function Settings() {
  const { t } = usePrefs()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('store')
  const [s, setS] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const load = () => api('/api/admin/settings').then(setS)
  useEffect(() => { load() }, [])
  const save = async (key, value) => {
    setBusy(true)
    try { const r = await api(`/api/admin/settings/${key}`, { method: 'PUT', body: value }); setS({ ...s, [key]: r }); toast.success(t('settings.saved')) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const up = (group, k, v) => setS({ ...s, [group]: { ...s[group], [k]: v } })
  const uploadImg = async (kind, file) => {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try { const r = await upload(`/api/admin/settings/upload/${kind}`, fd); setS({ ...s, [kind === 'logo' ? 'store' : 'payments']: r }); toast.success(t('common.uploaded')) } catch (e) { toast.error(e.message) }
  }
  if (!s) return <div className="skeleton h-96" />
  const ro = !isAdmin
  const saveBtn = (k) => <button onClick={() => save(k, s[k])} disabled={busy || ro} className="btn-primary !min-h-[42px]">{busy ? <Spinner /> : t('common.save')}</button>
  const pay = s.payments
  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={ro ? t('settings.readOnly') : t('settings.live')} />
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">{TABS.map((k) => <button key={k} onClick={() => setTab(k)} className={cls('chip shrink-0', tab === k && 'chip-active')}>{t(`settings.tabs.${k}`)}</button>)}</div>

      {tab === 'store' && (
        <Card title={t('settings.storeInfo')} action={saveBtn('store')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {['name', 'tagline', 'email', 'phone', 'address', 'opening_hours'].map((k) => (
              <Field key={k} label={t(`settings.fields.${k}`)}><input disabled={ro} className="field" value={s.store[k] || ''} onChange={(e) => up('store', k, e.target.value)} /></Field>
            ))}
            {['facebook', 'instagram', 'tiktok', 'telegram'].map((k) => (
              <Field key={k} label={t('settings.socialLink', { name: k[0].toUpperCase() + k.slice(1) })}><input disabled={ro} type="url" className="field" placeholder="https://" value={s.store.social?.[k] || ''} onChange={(e) => up('store', 'social', { ...s.store.social, [k]: e.target.value })} /></Field>
            ))}
            <Field label={t('settings.logo')} className="sm:col-span-2">
              <div className="flex items-center gap-4">{s.store.logo_url && <img src={assetUrl(s.store.logo_url)} alt="" className="h-14 rounded-xl border border-ink/10 bg-white p-2" />}
                <label className={cls('btn-outline !min-h-[42px] cursor-pointer', ro && 'pointer-events-none opacity-40')}><Upload size={16} /> {t('settings.uploadLogo')}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImg('logo', e.target.files?.[0])} /></label></div>
            </Field>
          </div>
        </Card>
      )}

      {tab === 'delivery' && (
        <Card title={t('settings.deliveryFees')} action={saveBtn('delivery')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('settings.ppFee')}><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.phnom_penh_fee} onChange={(e) => up('delivery', 'phnom_penh_fee', Number(e.target.value))} /></Field>
            <Field label={t('settings.provFee')}><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.province_fee} onChange={(e) => up('delivery', 'province_fee', Number(e.target.value))} /></Field>
            <Field label={t('settings.freeOver')} hint={t('settings.freeHint')}><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.free_shipping_threshold || 0} onChange={(e) => up('delivery', 'free_shipping_threshold', Number(e.target.value))} /></Field>
            <Field label={t('settings.ppTime')}><input disabled={ro} className="field" value={s.delivery.estimated_days_phnom_penh} onChange={(e) => up('delivery', 'estimated_days_phnom_penh', e.target.value)} /></Field>
            <Field label={t('settings.provTime')}><input disabled={ro} className="field" value={s.delivery.estimated_days_province} onChange={(e) => up('delivery', 'estimated_days_province', e.target.value)} /></Field>
          </div>
          <ZoneFees value={s.delivery.zone_fees || {}} disabled={ro} onChange={(z) => up('delivery', 'zone_fees', z)} />
        </Card>
      )}

      {tab === 'payments' && (
        <div className="space-y-6">
          <Card title={t('settings.methods')} action={saveBtn('payments')}>
            <div className="space-y-4">
              <Toggle disabled={ro} checked={pay.khqr_enabled} onChange={(v) => up('payments', 'khqr_enabled', v)} label={t('settings.khqr')} />
              <Toggle disabled={ro} checked={pay.bank_transfer_enabled} onChange={(v) => up('payments', 'bank_transfer_enabled', v)} label={t('settings.bank')} />
              <Toggle disabled={ro} checked={pay.cod_enabled} onChange={(v) => up('payments', 'cod_enabled', v)} label={t('settings.cod')} />
            </div>
            <Field label={t('settings.qrCurrency')} hint={t('settings.qrCurrencyHint')} className="mt-5">
              <div className="flex gap-2">
                {['USD', 'KHR'].map((c) => (
                  <button key={c} type="button" disabled={ro} onClick={() => up('payments', 'khqr_currency', c)}
                    className={cls('chip', (pay.khqr_currency || 'USD') === c && 'chip-active')}>{c === 'USD' ? t('settings.qrUsd') : t('settings.qrKhr')}</button>
                ))}
              </div>
            </Field>
            <div className="mt-5 space-y-2 rounded-2xl bg-bone-100 p-4 text-sm">
              {pay.khqr_template ? <Status ok yes={t('settings.bankQrStatus')} /> : <Status ok={s.system.bakong_auto_verify} yes={t('settings.bakongOk', { id: s.system.bakong_account_id })}
                no={s.system.bakong_account_id ? t('settings.bakongNoToken', { id: s.system.bakong_account_id }) : t('settings.bakongNone')} />}
              <Status ok={!!(pay.khqr_template || pay.khqr_static_image_url || s.system.bakong_account_id)} yes={t('settings.khqrOk')} no={t('settings.khqrNo')} />
              <Status ok={!!pay.bank_account_number} yes={t('settings.bankOk')} no={t('settings.bankNo')} />
              <Status ok={!!s.system.telegram_configured} yes={t('settings.tgOk')} no={t('settings.tgNo')} />
              <Status ok={!!s.system.email_configured} yes={`${t('settings.email')}: ${t('settings.emailOk')}`} no={`${t('settings.email')}: ${t('settings.emailNo')}`} />
            </div>
          </Card>
          <BankQrCard template={pay.khqr_template} disabled={ro} onSave={async (tpl) => {
            const r = await api('/api/admin/settings/payments', { method: 'PUT', body: { khqr_template: tpl } })
            setS({ ...s, payments: r }); toast.success(t('settings.bankQrSaved'))
          }} />
          <Card title={t('settings.khqrBank')} action={saveBtn('payments')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.merchant')}><input disabled={ro} className="field" maxLength={25} value={pay.khqr_merchant_name} onChange={(e) => up('payments', 'khqr_merchant_name', e.target.value)} /></Field>
              <Field label={t('settings.city')}><input disabled={ro} className="field" maxLength={15} value={pay.khqr_merchant_city} onChange={(e) => up('payments', 'khqr_merchant_city', e.target.value)} /></Field>
              <Field label={t('settings.bankName')}><input disabled={ro} className="field" value={pay.bank_name} onChange={(e) => up('payments', 'bank_name', e.target.value)} /></Field>
              <Field label={t('settings.accountName')}><input disabled={ro} className="field" value={pay.bank_account_name} onChange={(e) => up('payments', 'bank_account_name', e.target.value)} /></Field>
              <Field label={t('settings.accountNumber')}><input disabled={ro} className="field font-mono" value={pay.bank_account_number} onChange={(e) => up('payments', 'bank_account_number', e.target.value)} /></Field>
              <Field label={t('settings.instructions')} className="sm:col-span-2"><textarea disabled={ro} className="field" value={pay.instructions} onChange={(e) => up('payments', 'instructions', e.target.value)} /></Field>
              <Field label={t('settings.staticQr')} hint={t('settings.staticHint')} className="sm:col-span-2">
                <div className="flex items-center gap-4">{pay.khqr_static_image_url && <img src={assetUrl(pay.khqr_static_image_url)} alt="" className="h-28 rounded-xl border border-ink/10" />}
                  <label className={cls('btn-outline !min-h-[42px] cursor-pointer', ro && 'pointer-events-none opacity-40')}><Upload size={16} /> {t('settings.uploadQr')}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImg('khqr', e.target.files?.[0])} /></label>
                  {pay.khqr_static_image_url && !ro && <button className="btn-ghost text-signal" onClick={() => save('payments', { ...pay, khqr_static_image_url: '' })}>{t('common.remove')}</button>}</div>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'regional' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('settings.currency')} action={saveBtn('currency')}>
            <p className="mb-4 text-sm text-stone-450">{t('settings.currencyHint')}</p>
            <Field label={t('settings.rate')}><input disabled={ro} type="number" min="1000" max="10000" className="field" value={s.currency.khr_rate} onChange={(e) => up('currency', 'khr_rate', Number(e.target.value))} /></Field>
            <div className="mt-4"><Toggle disabled={ro} checked={s.currency.show_secondary} onChange={(v) => up('currency', 'show_secondary', v)} label={t('settings.showKhr')} /></div>
          </Card>
          <Card title={t('settings.tax')} action={saveBtn('tax')}>
            <div className="space-y-4">
              <Toggle disabled={ro} checked={s.tax.enabled} onChange={(v) => up('tax', 'enabled', v)} label={t('settings.taxEnabled')} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('settings.label')}><input disabled={ro} className="field" value={s.tax.label} onChange={(e) => up('tax', 'label', e.target.value)} /></Field>
                <Field label={t('settings.ratePct')}><input disabled={ro} type="number" step="0.1" min="0" max="30" className="field" value={s.tax.rate_percent} onChange={(e) => up('tax', 'rate_percent', Number(e.target.value))} /></Field>
              </div>
              <Toggle disabled={ro} checked={s.tax.inclusive} onChange={(v) => up('tax', 'inclusive', v)} label={t('settings.inclusive')} />
            </div>
          </Card>
          <Card title={t('settings.inventory')} action={saveBtn('inventory')}>
            <Field label={t('settings.lowAt')}><input disabled={ro} type="number" min="0" className="field" value={s.inventory.low_stock_threshold} onChange={(e) => up('inventory', 'low_stock_threshold', Number(e.target.value))} /></Field>
          </Card>
        </div>
      )}

      {tab === 'staff' && <Staff disabled={ro} />}

      {tab === 'backup' && <Backup disabled={ro} />}

      {tab === 'system' && (
        <Card title={t('settings.system')}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-stone-450">{t('settings.storage')}</dt><dd className="font-semibold capitalize">{s.system.storage_provider}{s.system.storage_provider === 'local' && <span className="ml-2 font-normal text-amber-700">{t('settings.localWarn')}</span>}</dd></div>
            <div><dt className="text-stone-450">{t('settings.environment')}</dt><dd className="font-semibold">{s.system.environment}</dd></div>
            <div><dt className="text-stone-450">{t('settings.timezone')}</dt><dd className="font-semibold">{s.system.timezone}</dd></div>
            <div><dt className="text-stone-450">{t('settings.autoVerify')}</dt><dd className="font-semibold">{s.system.bakong_auto_verify ? t('common.on') : t('common.off')}</dd></div>
            <div><dt className="text-stone-450">{t('settings.telegram')}</dt><dd className="font-semibold">{s.system.telegram_configured ? t('common.on') : t('common.off')}</dd></div>
            <div><dt className="text-stone-450">{t('settings.email')}</dt><dd className="font-semibold">{s.system.email_configured ? t('settings.emailOk') : t('settings.emailNo')}</dd></div>
          </dl>
          <p className="mt-5 text-xs text-stone-450">{t('settings.secrets')}</p>
        </Card>
      )}
    </div>
  )
}

function Status({ ok, yes, no }) {
  return <p className="flex items-start gap-2">{ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />}{ok ? yes : no}</p>
}

function ZoneFees({ value, onChange, disabled }) {
  const { t } = usePrefs()
  const [provinces, setProvinces] = useState([])
  const [pick, setPick] = useState('')
  useEffect(() => { api('/api/settings/public').then((r) => setProvinces(r.provinces)) }, [])
  return (
    <div className="mt-6 border-t border-ink/5 pt-5">
      <p className="label">{t('settings.zones')}</p>
      <div className="space-y-2">
        {Object.entries(value).map(([p, fee]) => (
          <div key={p} className="flex items-center gap-3 text-sm"><span className="w-40">{p}</span>
            <input disabled={disabled} type="number" step="0.01" min="0" className="field !min-h-[38px] w-28" value={fee} onChange={(e) => onChange({ ...value, [p]: Number(e.target.value) })} />
            <button disabled={disabled} className="text-xs text-signal underline" onClick={() => { const n = { ...value }; delete n[p]; onChange(n) }}>{t('common.remove')}</button></div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <select disabled={disabled} className="field !min-h-[40px] !w-auto" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">{t('settings.addProvince')}</option>{provinces.filter((p) => !(p in value)).map((p) => <option key={p}>{p}</option>)}</select>
        <button disabled={disabled || !pick} className="btn-outline !min-h-[40px]" onClick={() => { onChange({ ...value, [pick]: 2.5 }); setPick('') }}><Plus size={15} /> {t('common.add')}</button>
      </div>
    </div>
  )
}

function Staff({ disabled }) {
  const { t } = usePrefs()
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)
  const { user } = useAuth()
  const toast = useToast()
  const load = () => api('/api/admin/staff').then(setRows).catch(() => setRows([]))
  useEffect(() => { if (!disabled) load() }, [disabled])
  if (disabled) return <Card><p className="text-sm text-stone-450">{t('settings.staffOnly')}</p></Card>
  const create = async (e) => { e.preventDefault(); try { await api('/api/admin/staff', { method: 'POST', body: form }); toast.success(t('settings.created')); setForm(null); load() } catch (err) { toast.error(err.message) } }
  const patch = async (u, body) => { try { await api(`/api/admin/staff/${u.id}`, { method: 'PATCH', body }); load() } catch (e) { toast.error(e.message) } }
  return (
    <Card title={t('settings.staff')} action={<button onClick={() => setForm({ email: '', full_name: '', password: '', role: 'staff' })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> {t('settings.addStaff')}</button>}>
      <p className="mb-4 text-xs text-stone-450"><Rich text={t('settings.rolesHint')} /></p>
      <ul className="divide-y divide-ink/5">
        {rows?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-semibold">{u.full_name}</p><p className="text-xs text-stone-450">{t('settings.since', { email: u.email, date: date(u.created_at) })}</p></div>
            <Pill tone={u.role === 'admin' ? 'bg-ink text-white' : undefined}>{t(`nav.roles.${u.role}`)}</Pill>
            {u.id !== user.id && <>
              <select className="field !min-h-[36px] !w-auto text-sm" value={u.role} onChange={(e) => patch(u, { role: e.target.value })}><option value="cashier">{t('nav.roles.cashier')}</option><option value="staff">{t('nav.roles.staff')}</option><option value="admin">{t('nav.roles.admin')}</option></select>
              <Toggle checked={u.is_active} onChange={(v) => patch(u, { is_active: v })} label="" />
            </>}
          </li>
        ))}
      </ul>
      <Modal open={!!form} onClose={() => setForm(null)} title={t('settings.newStaff')}>
        {form && (
          <form onSubmit={create} className="space-y-4">
            <Field label={t('settings.fullName')}><input required className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label={t('login.email')}><input required type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('settings.tempPassword')} hint={t('settings.tempHint')}><input required minLength={8} type="password" autoComplete="new-password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label={t('settings.role')}><select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="cashier">{t('nav.roles.cashier')}</option><option value="staff">{t('nav.roles.staff')}</option><option value="admin">{t('nav.roles.admin')}</option></select></Field>
            <button className="btn-primary w-full">{t('settings.create')}</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}


function Backup({ disabled }) {
  const { t } = usePrefs()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const get = async (kind) => {
    setBusy(kind)
    try { toast.success(t('backup.saved', { name: await download(`/api/admin/backup/${kind}`) })) } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }
  const options = [
    ['xlsx', FileSpreadsheet, t('backup.excel'), t('backup.excelText')],
    ['json', FileJson, t('backup.json'), t('backup.jsonText')],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card title={t('backup.title')}>
        <p className="mb-5 text-sm text-stone-450">{t('backup.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map(([kind, Icon, title, text]) => (
            <button key={kind} type="button" disabled={disabled || !!busy} onClick={() => get(kind)}
              className="group flex items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-lift disabled:pointer-events-none disabled:opacity-50">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-white">{busy === kind ? <Spinner className="h-4 w-4" /> : <Icon size={20} />}</span>
              <span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-stone-450">{text}</span></span>
            </button>
          ))}
        </div>
        {disabled && <p className="mt-4 text-sm text-amber-700">{t('backup.adminOnly')}</p>}
      </Card>
      <Card title={t('backup.whatTitle')}>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-2.5"><DatabaseBackup size={17} className="mt-0.5 shrink-0 text-ice-600" />{t('backup.what1')}</li>
          <li className="flex gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" />{t('backup.what2')}</li>
          <li className="flex gap-2.5"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-stone-450" />{t('backup.what3')}</li>
        </ul>
      </Card>
    </div>
  )
}
