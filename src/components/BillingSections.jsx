/**
 * Velo CRM — Billing tab sections (V1.5 Slice 4).
 *
 * Two presentational pieces composed by PatientProfile above the existing
 * (Slice 3) Payments section:
 *   - BalanceSummary — the headline: getPatientBalance() rendered per-currency
 *     as Owes / Settled / Credit. Never blends currencies.
 *   - ChargesSection — the charges half of the ledger: list (with kind so voids
 *     render distinctly), netted active-row total, doctor/owner "Add Charge",
 *     and operator-only "Void" (mirrors the payments Reverse affordance).
 *
 * Data + mutations are owned by PatientProfile and passed in (addCharge/onVoid);
 * this file only renders + gathers form input, matching how PaymentsTab is fed.
 */
import { useState, useEffect } from 'react'
import { Icons, FormField, inputStyle, selectStyle, Modal } from './shared'
import { GlassCard, Button } from './ui'
import { formatMoney, toMinor } from '../lib/money'
import { listDoctorsInOrg } from '../lib/profiles'
import useCurrentProfile from '../hooks/useCurrentProfile'
import { useIsOperator } from '../lib/operator'

// ─── Balance summary ─────────────────────────────────────────────────────────

export function BalanceSummary({ balance, isRTL }) {
  const entries = Object.entries(balance || {})
  return (
    <GlassCard padding="lg">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-500 mb-3">
        {isRTL ? 'الرصيد' : 'Balance'}
      </div>
      {entries.length === 0 ? (
        <div className="text-lg font-bold text-navy-500">{isRTL ? 'لا يوجد رصيد' : 'No balance yet'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entries.map(([cur, owed]) => {
            const n = Number(owed || 0)
            const cfg = n > 0
              ? { label: isRTL ? 'مستحق' : 'Owes', cls: 'text-rose-700 border-rose-200 bg-rose-50/70' }
              : n < 0
                ? { label: isRTL ? 'رصيد دائن' : 'Credit', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50/70' }
                : { label: isRTL ? 'مسدّد' : 'Settled', cls: 'text-navy-600 border-navy-200 bg-navy-50/70' }
            return (
              <div key={cur} className={`rounded-glass border px-4 py-3 ${cfg.cls}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1">{cfg.label} ({cur})</div>
                <div className="text-xl font-bold tabular-nums">{formatMoney(Math.abs(n), cur)}</div>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}

// ─── Charges section ─────────────────────────────────────────────────────────

export function ChargesSection({ patient, charges, addCharge, onVoid, dir, isRTL }) {
  const { profile } = useCurrentProfile()
  const { isOperator } = useIsOperator()
  // Charge creation is doctor/owner (mirrors the charges RLS gate) — a DIFFERENT
  // gate than payments (owner/receptionist). Corrections (void) are operator-only.
  const canAddCharge = ['doctor', 'owner'].includes(profile?.role)

  const [showForm, setShowForm] = useState(false)
  const [confirmVoidId, setConfirmVoidId] = useState(null)

  // Active-row rule (mirror payments): a 'charge' whose id is NOT referenced by
  // any void's reverses_id. void rows never count as positive; a voided original
  // drops out — so a voided charge contributes 0 to the billed total.
  const reversedIds = new Set(charges.map(c => c.reversesId ?? c.reverses_id).filter(Boolean))
  const isActiveCharge = (c) => (c.kind || 'charge') === 'charge' && !reversedIds.has(c.id)
  const totals = charges.reduce((acc, c) => {
    if (!isActiveCharge(c)) return acc
    const cur = c.currency || 'IQD'
    acc[cur] = (acc[cur] || 0) + Number(c.amountMinor || c.amount_minor || 0)
    return acc
  }, {})

  return (
    <GlassCard padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-navy-900 m-0">
          {isRTL ? 'الرسوم' : 'Charges'} ({charges.length})
        </h3>
        {canAddCharge && (
          <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={() => setShowForm(true)}>
            {isRTL ? 'إضافة رسوم' : 'Add Charge'}
          </Button>
        )}
      </div>

      {/* Billed total per currency (active charges only) */}
      {Object.keys(totals).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(totals).map(([cur, sum]) => (
            <span key={cur} className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-navy-50/70 px-2.5 py-1 text-xs font-semibold text-navy-700 tabular-nums">
              {isRTL ? 'مفوتر' : 'Billed'} ({cur}): {formatMoney(sum, cur)}
            </span>
          ))}
        </div>
      )}

      {charges.length === 0 ? (
        <p className="text-sm text-navy-500 text-center py-6 m-0">
          {isRTL ? 'لا توجد رسوم' : 'No charges yet'}
        </p>
      ) : (
        <ul className="flex flex-col">
          {charges.map(c => {
            const amountMinor = c.amountMinor ?? c.amount_minor ?? 0
            const createdAt = c.createdAt || c.created_at
            const dateStr = createdAt ? new Date(createdAt).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US') : ''
            const kind = c.kind || 'charge'
            const isVoid = kind === 'void'
            const isVoided = reversedIds.has(c.id) // an original that has been voided
            const canVoid = isOperator && !isVoid && !isVoided
            const amountClass = isVoid ? 'text-rose-700' : isVoided ? 'text-navy-400 line-through' : 'text-navy-900'
            return (
              <li key={c.id} className={`flex items-center gap-3 py-3 border-b border-navy-100/60 last:border-b-0${isVoid ? ' opacity-80' : ''}`}>
                <span aria-hidden="true" className={`grid place-items-center w-9 h-9 rounded-md shrink-0 ${isVoid ? 'bg-rose-50 text-rose-700' : 'bg-navy-50 text-navy-500'}`}>
                  {isVoid ? Icons.undo(16) : Icons.file(16)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-base font-semibold tabular-nums ${amountClass}`}>
                    {isVoid ? '−' : ''}{formatMoney(amountMinor, c.currency || 'IQD')}
                  </div>
                  <div className="text-xs text-navy-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    {isVoid && (
                      <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {isRTL ? 'إبطال' : 'Void'}
                      </span>
                    )}
                    {isVoided && (
                      <span className="inline-flex items-center rounded-full bg-navy-100 text-navy-500 border border-navy-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {isRTL ? 'مُبطلة' : 'Voided'}
                      </span>
                    )}
                    <span className="truncate">
                      {c.description}
                      {c.doctorName && <> &middot; {c.doctorName}</>}
                      {dateStr && <> &middot; {dateStr}</>}
                    </span>
                  </div>
                </div>
                {canVoid && (
                  <button
                    type="button"
                    onClick={() => setConfirmVoidId(c.id)}
                    aria-label={isRTL ? 'إبطال الرسوم' : 'Void charge'}
                    title={isRTL ? 'إبطال الرسوم' : 'Void charge'}
                    className="grid place-items-center w-11 h-11 md:w-8 md:h-8 rounded-md text-navy-500 hover:text-amber-700 hover:bg-amber-50 transition-colors shrink-0"
                  >
                    {Icons.undo(14)}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showForm && (
        <AddChargeModal
          patient={patient}
          profile={profile}
          onClose={() => setShowForm(false)}
          onSubmit={async (c) => { await addCharge(c); setShowForm(false) }}
          dir={dir}
          isRTL={isRTL}
        />
      )}

      {confirmVoidId && (
        <Modal onClose={() => setConfirmVoidId(null)} dir={dir} width={420}>
          <div className="ds-root text-center px-2">
            <h3 className="text-lg font-semibold text-navy-900 m-0 mb-2">
              {isRTL ? 'إبطال هذه الرسوم؟' : 'Void this charge?'}
            </h3>
            <p className="text-sm text-navy-600 m-0 mb-4">
              {isRTL
                ? 'سيتم تسجيل قيد تصحيح — تبقى الرسوم الأصلية في السجل.'
                : 'A correcting entry will be recorded — the original charge stays in history.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={() => setConfirmVoidId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="primary" onClick={() => { onVoid(confirmVoidId); setConfirmVoidId(null) }}>{isRTL ? 'إبطال' : 'Void'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </GlassCard>
  )
}

// ─── Add-charge modal ────────────────────────────────────────────────────────

function AddChargeModal({ patient, profile, onClose, onSubmit, dir, isRTL }) {
  const isDoctor = profile?.role === 'doctor'
  const primaryDoctorId = patient.primary_doctor_id ?? patient.primaryDoctorId ?? ''
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'IQD',
    // Doctor rendering the service: default to the current user if they are a
    // doctor, else the patient's primary doctor (owner then picks from the list).
    doctorId: isDoctor ? (profile?.id || '') : primaryDoctorId,
  })
  const [doctors, setDoctors] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Owner/receptionist can't add charges (button hidden), so only owners reach
  // this modal without being a doctor → load the org's doctors for the picker.
  useEffect(() => {
    if (isDoctor) return
    let cancelled = false
    listDoctorsInOrg().then(d => { if (!cancelled) setDoctors(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [isDoctor])

  const amountMinor = toMinor(form.amount, form.currency)
  const valid = form.description.trim() && amountMinor >= 1 && form.doctorId

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        description: form.description.trim(),
        amountMinor,
        currency: form.currency,
        doctorId: form.doctorId,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose} dir={dir} width={480}>
      <div className="ds-root">
        <form onSubmit={submit}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
            {isRTL ? 'إضافة رسوم' : 'Add Charge'}
          </h3>
          <FormField label={isRTL ? 'الوصف' : 'Description'} dir={dir}>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder={isRTL ? 'مثال: تركيب تاج' : 'e.g. Crown fitting'}
              style={inputStyle(dir)}
              maxLength={500}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-x-3">
            <FormField label={isRTL ? 'المبلغ' : 'Amount'} dir={dir}>
              <input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} type="number" step="0.01" min="0" style={inputStyle(dir)} />
            </FormField>
            <FormField label={isRTL ? 'العملة' : 'Currency'} dir={dir}>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} style={selectStyle(dir)}>
                <option value="IQD">IQD</option>
                <option value="USD">USD</option>
              </select>
            </FormField>
          </div>
          {isDoctor ? (
            <FormField label={isRTL ? 'الطبيب' : 'Doctor'} dir={dir}>
              <input value={profile?.full_name || (isRTL ? 'أنت' : 'You')} readOnly disabled style={{ ...inputStyle(dir), opacity: 0.7 }} />
            </FormField>
          ) : (
            <FormField label={isRTL ? 'الطبيب' : 'Doctor'} dir={dir}>
              <select value={form.doctorId} onChange={e => setForm(p => ({ ...p, doctorId: e.target.value }))} style={selectStyle(dir)}>
                <option value="">{isRTL ? '— اختر طبيباً —' : '— Select a doctor —'}</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name || d.id}</option>)}
              </select>
            </FormField>
          )}
          <div className="flex gap-2 justify-end mt-3">
            <Button variant="secondary" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="primary" type="submit" disabled={!valid || submitting}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
