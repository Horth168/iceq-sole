import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Upload } from 'lucide-react'
import { api, assetUrl, upload } from '../lib/api'
import { useAuth } from '../components/Layout'
import { cls, date } from '../lib/format'
import { Card, Field, Modal, PageHeader, Pill, Spinner, Toggle, useToast } from '../components/ui'

const TABS = [['store', 'Store'], ['delivery', 'Delivery'], ['payments', 'Payments'], ['regional', 'Currency & tax'], ['staff', 'Staff'], ['system', 'System']]

export default function Settings() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('store')
  const [s, setS] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const load = () => api('/api/admin/settings').then(setS)
  useEffect(() => { load() }, [])
  const save = async (key, value) => {
    setBusy(true)
    try { const r = await api(`/api/admin/settings/${key}`, { method: 'PUT', body: value }); setS({ ...s, [key]: r }); toast.success('Settings saved') } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const up = (group, k, v) => setS({ ...s, [group]: { ...s[group], [k]: v } })
  const uploadImg = async (kind, file) => {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try { const r = await upload(`/api/admin/settings/upload/${kind}`, fd); setS({ ...s, [kind === 'logo' ? 'store' : 'payments']: r }); toast.success('Uploaded') } catch (e) { toast.error(e.message) }
  }
  if (!s) return <div className="skeleton h-96" />
  const ro = !isAdmin
  const saveBtn = (k) => <button onClick={() => save(k, s[k])} disabled={busy || ro} className="btn-primary !min-h-[42px]">{busy ? <Spinner /> : 'Save'}</button>
  const pay = s.payments
  return (
    <div>
      <PageHeader title="Settings" subtitle={ro ? 'Read-only — only admins can change settings.' : 'Changes apply to the storefront immediately.'} />
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cls('chip shrink-0', tab === k && 'chip-active')}>{l}</button>)}</div>

      {tab === 'store' && (
        <Card title="Store information" action={saveBtn("store")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[['name', 'Store name'], ['tagline', 'Tagline'], ['email', 'Contact email'], ['phone', 'Phone'], ['address', 'Address'], ['opening_hours', 'Opening hours']].map(([k, l]) => (
              <Field key={k} label={l}><input disabled={ro} className="field" value={s.store[k] || ''} onChange={(e) => up('store', k, e.target.value)} /></Field>
            ))}
            {['facebook', 'instagram', 'tiktok', 'telegram'].map((k) => (
              <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} link`}><input disabled={ro} type="url" className="field" placeholder="https://" value={s.store.social?.[k] || ''} onChange={(e) => up('store', 'social', { ...s.store.social, [k]: e.target.value })} /></Field>
            ))}
            <Field label="Store logo (used on invoices)" className="sm:col-span-2">
              <div className="flex items-center gap-4">{s.store.logo_url && <img src={assetUrl(s.store.logo_url)} alt="" className="h-14 rounded-xl border border-ink/10 bg-white p-2" />}
                <label className={cls('btn-outline !min-h-[42px] cursor-pointer', ro && 'pointer-events-none opacity-40')}><Upload size={16} /> Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImg('logo', e.target.files?.[0])} /></label></div>
            </Field>
          </div>
        </Card>
      )}

      {tab === 'delivery' && (
        <Card title="Delivery fees (USD)" action={saveBtn("delivery")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phnom Penh fee"><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.phnom_penh_fee} onChange={(e) => up('delivery', 'phnom_penh_fee', Number(e.target.value))} /></Field>
            <Field label="Province fee"><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.province_fee} onChange={(e) => up('delivery', 'province_fee', Number(e.target.value))} /></Field>
            <Field label="Free delivery over" hint="0 = never free"><input disabled={ro} type="number" step="0.01" min="0" className="field" value={s.delivery.free_shipping_threshold || 0} onChange={(e) => up('delivery', 'free_shipping_threshold', Number(e.target.value))} /></Field>
            <Field label="Phnom Penh delivery time"><input disabled={ro} className="field" value={s.delivery.estimated_days_phnom_penh} onChange={(e) => up('delivery', 'estimated_days_phnom_penh', e.target.value)} /></Field>
            <Field label="Province delivery time"><input disabled={ro} className="field" value={s.delivery.estimated_days_province} onChange={(e) => up('delivery', 'estimated_days_province', e.target.value)} /></Field>
          </div>
          <ZoneFees value={s.delivery.zone_fees || {}} disabled={ro} onChange={(z) => up('delivery', 'zone_fees', z)} />
        </Card>
      )}

      {tab === 'payments' && (
        <div className="space-y-6">
          <Card title="Payment methods" action={saveBtn("payments")}>
            <div className="space-y-4">
              <Toggle disabled={ro} checked={pay.khqr_enabled} onChange={(v) => up('payments', 'khqr_enabled', v)} label="ABA / Bakong KHQR" />
              <Toggle disabled={ro} checked={pay.bank_transfer_enabled} onChange={(v) => up('payments', 'bank_transfer_enabled', v)} label="Bank transfer (manual verification)" />
              <Toggle disabled={ro} checked={pay.cod_enabled} onChange={(v) => up('payments', 'cod_enabled', v)} label="Cash on delivery" />
            </div>
            <div className="mt-5 space-y-2 rounded-2xl bg-bone-100 p-4 text-sm">
              <Status ok={s.system.bakong_auto_verify} yes={`Bakong API connected (${s.system.bakong_account_id}) — dynamic KHQR + automatic verification`}
                no={s.system.bakong_account_id ? `Dynamic KHQR for ${s.system.bakong_account_id}, but BAKONG_API_TOKEN is missing — payments are verified manually` : 'BAKONG_ACCOUNT_ID / BAKONG_API_TOKEN not set in the backend .env — KHQR needs a static QR image below'} />
              <Status ok={!!(pay.khqr_static_image_url || s.system.bakong_account_id)} yes="KHQR can be shown to customers" no="KHQR is hidden at checkout until a QR is available" />
              <Status ok={!!pay.bank_account_number} yes="Bank transfer details set" no="Bank transfer is hidden at checkout until an account number is set" />
            </div>
          </Card>
          <Card title="KHQR & bank details" action={saveBtn("payments")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Merchant name (in QR)"><input disabled={ro} className="field" maxLength={25} value={pay.khqr_merchant_name} onChange={(e) => up('payments', 'khqr_merchant_name', e.target.value)} /></Field>
              <Field label="Merchant city"><input disabled={ro} className="field" maxLength={15} value={pay.khqr_merchant_city} onChange={(e) => up('payments', 'khqr_merchant_city', e.target.value)} /></Field>
              <Field label="Bank name"><input disabled={ro} className="field" value={pay.bank_name} onChange={(e) => up('payments', 'bank_name', e.target.value)} /></Field>
              <Field label="Account name"><input disabled={ro} className="field" value={pay.bank_account_name} onChange={(e) => up('payments', 'bank_account_name', e.target.value)} /></Field>
              <Field label="Account number"><input disabled={ro} className="field font-mono" value={pay.bank_account_number} onChange={(e) => up('payments', 'bank_account_number', e.target.value)} /></Field>
              <Field label="Payment instructions" className="sm:col-span-2"><textarea disabled={ro} className="field" value={pay.instructions} onChange={(e) => up('payments', 'instructions', e.target.value)} /></Field>
              <Field label="Static KHQR image (fallback)" hint="Your printed ABA merchant QR. Customers type the amount themselves; verify manually." className="sm:col-span-2">
                <div className="flex items-center gap-4">{pay.khqr_static_image_url && <img src={assetUrl(pay.khqr_static_image_url)} alt="" className="h-28 rounded-xl border border-ink/10" />}
                  <label className={cls('btn-outline !min-h-[42px] cursor-pointer', ro && 'pointer-events-none opacity-40')}><Upload size={16} /> Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImg('khqr', e.target.files?.[0])} /></label>
                  {pay.khqr_static_image_url && !ro && <button className="btn-ghost text-signal" onClick={() => save('payments', { ...pay, khqr_static_image_url: '' })}>Remove</button>}</div>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'regional' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Currency" action={saveBtn("currency")}>
            <p className="mb-4 text-sm text-stone-450">Prices are charged in USD. KHR is shown as a reference.</p>
            <Field label="KHR per 1 USD"><input disabled={ro} type="number" min="1000" max="10000" className="field" value={s.currency.khr_rate} onChange={(e) => up('currency', 'khr_rate', Number(e.target.value))} /></Field>
            <div className="mt-4"><Toggle disabled={ro} checked={s.currency.show_secondary} onChange={(v) => up('currency', 'show_secondary', v)} label="Show KHR amounts" /></div>
          </Card>
          <Card title="Tax" action={saveBtn("tax")}>
            <div className="space-y-4">
              <Toggle disabled={ro} checked={s.tax.enabled} onChange={(v) => up('tax', 'enabled', v)} label="Charge / show tax" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label"><input disabled={ro} className="field" value={s.tax.label} onChange={(e) => up('tax', 'label', e.target.value)} /></Field>
                <Field label="Rate %"><input disabled={ro} type="number" step="0.1" min="0" max="30" className="field" value={s.tax.rate_percent} onChange={(e) => up('tax', 'rate_percent', Number(e.target.value))} /></Field>
              </div>
              <Toggle disabled={ro} checked={s.tax.inclusive} onChange={(v) => up('tax', 'inclusive', v)} label="Prices already include tax" />
            </div>
          </Card>
          <Card title="Inventory" action={saveBtn("inventory")}>
            <Field label="Low-stock alert at (pairs per variant)"><input disabled={ro} type="number" min="0" className="field" value={s.inventory.low_stock_threshold} onChange={(e) => up('inventory', 'low_stock_threshold', Number(e.target.value))} /></Field>
          </Card>
        </div>
      )}

      {tab === 'staff' && <Staff disabled={ro} />}

      {tab === 'system' && (
        <Card title="System status">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-stone-450">Image storage</dt><dd className="font-semibold capitalize">{s.system.storage_provider}{s.system.storage_provider === 'local' && <span className="ml-2 font-normal text-amber-700">(development only — set STORAGE_PROVIDER=cloudflare for production)</span>}</dd></div>
            <div><dt className="text-stone-450">Environment</dt><dd className="font-semibold">{s.system.environment}</dd></div>
            <div><dt className="text-stone-450">Time zone</dt><dd className="font-semibold">{s.system.timezone}</dd></div>
            <div><dt className="text-stone-450">KHQR auto-verify</dt><dd className="font-semibold">{s.system.bakong_auto_verify ? 'On' : 'Off'}</dd></div>
          </dl>
          <p className="mt-5 text-xs text-stone-450">Secrets (database, storage keys, Bakong token) live only in the backend environment variables and are never sent to this dashboard.</p>
        </Card>
      )}
    </div>
  )
}

function Status({ ok, yes, no }) {
  return <p className="flex items-start gap-2">{ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />}{ok ? yes : no}</p>
}

function ZoneFees({ value, onChange, disabled }) {
  const [provinces, setProvinces] = useState([])
  const [pick, setPick] = useState('')
  useEffect(() => { api('/api/settings/public').then((r) => setProvinces(r.provinces)) }, [])
  return (
    <div className="mt-6 border-t border-ink/5 pt-5">
      <p className="label">Per-province overrides</p>
      <div className="space-y-2">
        {Object.entries(value).map(([p, fee]) => (
          <div key={p} className="flex items-center gap-3 text-sm"><span className="w-40">{p}</span>
            <input disabled={disabled} type="number" step="0.01" min="0" className="field !min-h-[38px] w-28" value={fee} onChange={(e) => onChange({ ...value, [p]: Number(e.target.value) })} />
            <button disabled={disabled} className="text-xs text-signal underline" onClick={() => { const n = { ...value }; delete n[p]; onChange(n) }}>Remove</button></div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <select disabled={disabled} className="field !min-h-[40px] !w-auto" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Add province…</option>{provinces.filter((p) => !(p in value)).map((p) => <option key={p}>{p}</option>)}</select>
        <button disabled={disabled || !pick} className="btn-outline !min-h-[40px]" onClick={() => { onChange({ ...value, [pick]: 2.5 }); setPick('') }}><Plus size={15} /> Add</button>
      </div>
    </div>
  )
}

function Staff({ disabled }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)
  const { user } = useAuth()
  const toast = useToast()
  const load = () => api('/api/admin/staff').then(setRows).catch(() => setRows([]))
  useEffect(() => { if (!disabled) load() }, [disabled])
  if (disabled) return <Card><p className="text-sm text-stone-450">Only admins can manage staff accounts.</p></Card>
  const create = async (e) => { e.preventDefault(); try { await api('/api/admin/staff', { method: 'POST', body: form }); toast.success('Account created'); setForm(null); load() } catch (err) { toast.error(err.message) } }
  const patch = async (u, body) => { try { await api(`/api/admin/staff/${u.id}`, { method: 'PATCH', body }); load() } catch (e) { toast.error(e.message) } }
  return (
    <Card title="Staff accounts" action={<button onClick={() => setForm({ email: '', full_name: '', password: '', role: 'staff' })} className="btn-primary !min-h-[38px] text-sm"><Plus size={15} /> Add staff</button>}>
      <p className="mb-4 text-xs text-stone-450"><b>Staff</b> manage orders, products and inventory. <b>Admins</b> can also change settings and staff.</p>
      <ul className="divide-y divide-ink/5">
        {rows?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-semibold">{u.full_name}</p><p className="text-xs text-stone-450">{u.email} · since {date(u.created_at)}</p></div>
            <Pill tone={u.role === 'admin' ? 'bg-ink text-white' : undefined}>{u.role}</Pill>
            {u.id !== user.id && <>
              <select className="field !min-h-[36px] !w-auto text-sm" value={u.role} onChange={(e) => patch(u, { role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select>
              <Toggle checked={u.is_active} onChange={(v) => patch(u, { is_active: v })} label="" />
            </>}
          </li>
        ))}
      </ul>
      <Modal open={!!form} onClose={() => setForm(null)} title="New staff account">
        {form && (
          <form onSubmit={create} className="space-y-4">
            <Field label="Full name"><input required className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after first sign-in."><input required minLength={8} type="password" autoComplete="new-password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Role"><select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select></Field>
            <button className="btn-primary w-full">Create account</button>
          </form>
        )}
      </Modal>
    </Card>
  )
}
