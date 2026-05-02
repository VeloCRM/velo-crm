/**
 * Velo CRM — FinancePage (new schema).
 *
 * Clinic-side payments view. Lists every payment recorded by the org with
 * patient + treatment plan joined, lets the user record new payments, and
 * shows currency-aware totals (USD and IQD never sum together).
 *
 * The legacy invoices / pending / pipeline / deals concepts are gone — the
 * new schema doesn't have a payment status column (every recorded payment
 * is paid by definition) and there's no invoices table.
 *
 * Operator (agency) view defers to OperatorConsole — billing/MRR for the
 * agency lives there, not here.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchPaymentsWithJoins,
  insertPayment,
} from '../lib/database'
import { searchPatientsForAppointment } from '../lib/appointments'
import { fetchTreatmentPlansForPatient } from '../lib/dental'
import { formatMoney, toMinor } from '../lib/money'
import { sanitizeNotes } from '../lib/sanitize'
import { fetchMyProfile } from '../lib/profiles'
import { can } from '../lib/permissions'

const PAYMENT_METHODS = [
  { id: 'cash',        en: 'Cash',        ar: 'نقداً',      icon: '💵' },
  { id: 'fib',         en: 'FIB',         ar: 'FIB',         icon: '🏦' },
  { id: 'zaincash',    en: 'ZainCash',    ar: 'زين كاش',     icon: '📱' },
  { id: 'asia_hawala', en: 'Asia Hawala', ar: 'آسيا حوالة',  icon: '💱' },
  { id: 'card',        en: 'Card',        ar: 'بطاقة',       icon: '💳' },
  { id: 'other',       en: 'Other',       ar: 'أخرى',        icon: '🔖' },
]

const methodLabel = (id, isRTL) => {
  const m = PAYMENT_METHODS.find(x => x.id === id)
  if (!m) return id
  return isRTL ? m.ar : m.en
}

// Default to the last 90 days when the page first loads.
function defaultDateFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function defaultDateTo() {
  const d = new Date(); d.setHours(23, 59, 59, 999)
  return d.toISOString().slice(0, 10)
}

// Convert YYYY-MM-DD bounds to ISO timestamps for `recorded_at` filtering.
function toIsoBounds(fromYmd, toYmd) {
  const out = {}
  if (fromYmd) {
    const d = new Date(fromYmd + 'T00:00:00')
    if (!Number.isNaN(d.getTime())) out.from = d.toISOString()
  }
  if (toYmd) {
    const d = new Date(toYmd + 'T23:59:59.999')
    if (!Number.isNaN(d.getTime())) out.to = d.toISOString()
  }
  return out
}

export default function FinancePage({ t, lang, dir, isRTL, toast, isOperator }) {
  void t
  void lang

  const [role, setRole] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRecord, setShowRecord] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [methodFilter, setMethodFilter] = useState('')
  const [patientQuery, setPatientQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMyProfile().then(p => { if (!cancelled) setRole(p?.role || null) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const reload = async () => {
    if (!isSupabaseConfigured()) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const bounds = toIsoBounds(dateFrom, dateTo)
      const data = await fetchPaymentsWithJoins({
        from: bounds.from,
        to: bounds.to,
        method: methodFilter || undefined,
        limit: 200,
      })
      setRows(data)
    } catch (err) {
      console.error('[FinancePage] load failed:', err)
      toast?.(err.message || (isRTL ? 'فشل تحميل المدفوعات' : 'Failed to load payments'), 'error')
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch when server-side filters change. Patient text-filter is client-only.
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dateFrom, dateTo, methodFilter])

  // Apply the patient-name client filter on top of the server-side rows.
  const filteredRows = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => (r.patient?.full_name || '').toLowerCase().includes(q))
  }, [rows, patientQuery])

  // Currency-aware totals. Per CLAUDE.md never sum across currencies.
  const totalsByCurrency = useMemo(() => {
    const out = {}
    for (const r of filteredRows) {
      const cur = r.currency || 'IQD'
      out[cur] = (out[cur] || 0) + Number(r.amount_minor || 0)
    }
    return out
  }, [filteredRows])

  // Operator (agency) view — payments from the operator side are managed by
  // OperatorConsole, not this page. Show a pointer. The early return must
  // come AFTER all hook calls above so we don't break rules-of-hooks.
  if (isOperator) {
    return (
      <div dir={dir} style={{ padding: 32 }}>
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
            {isRTL ? 'المالية' : 'Finance'}
          </h2>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            {isRTL
              ? 'إيرادات الاشتراكات تُدار من لوحة المشغل (OperatorConsole).'
              : 'Subscription revenue is managed in the OperatorConsole, not on this page.'}
          </p>
        </div>
      </div>
    )
  }

  // Permission gate: can the current role record a new payment?
  // Owner + receptionist + assistant-with-payments-w. Doctor reads only.
  const canRecord = !role || can(role, 'payments', 'w') || can(role, 'finance', 'w')

  return (
    <div dir={dir} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
            {isRTL ? 'المالية' : 'Finance'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, margin: '4px 0 0' }}>
            {isRTL
              ? 'سجل المدفوعات للعيادة. لا توجد فواتير معلقة في النظام الجديد — كل دفعة مسجلة هي مدفوعة.'
              : 'Recorded payments for the clinic. The new schema has no pending-invoice concept — every recorded payment is paid.'}
          </p>
        </div>
        {canRecord && (
          <button onClick={() => setShowRecord(true)} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
            {Icons.plus(14)} {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
          </button>
        )}
      </div>

      {/* Currency-split totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        {Object.keys(totalsByCurrency).length === 0 ? (
          <div style={{ ...card, padding: 16, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {isRTL ? 'لا توجد مدفوعات في النطاق المحدد' : 'No payments in the selected range'}
          </div>
        ) : (
          Object.entries(totalsByCurrency).map(([cur, sum]) => (
            <div key={cur} style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                {isRTL ? `الإجمالي (${cur})` : `Total (${cur})`}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(sum, cur)}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                {filteredRows.filter(r => (r.currency || 'IQD') === cur).length}{' '}
                {isRTL ? 'دفعة' : (filteredRows.filter(r => (r.currency || 'IQD') === cur).length === 1 ? 'payment' : 'payments')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <FormField label={isRTL ? 'من' : 'From'} dir={dir}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle(dir), width: 160 }} />
        </FormField>
        <FormField label={isRTL ? 'إلى' : 'To'} dir={dir}>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle(dir), width: 160 }} />
        </FormField>
        <FormField label={isRTL ? 'طريقة الدفع' : 'Method'} dir={dir}>
          <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} style={{ ...selectStyle(dir), width: 180 }}>
            <option value="">{isRTL ? 'الكل' : 'All methods'}</option>
            {PAYMENT_METHODS.map(m => (
              <option key={m.id} value={m.id}>{isRTL ? m.ar : m.en}</option>
            ))}
          </select>
        </FormField>
        <FormField label={isRTL ? 'بحث المريض' : 'Patient search'} dir={dir}>
          <input value={patientQuery} onChange={e => setPatientQuery(e.target.value)} placeholder={isRTL ? 'الاسم...' : 'Name...'}
            style={{ ...inputStyle(dir), width: 220 }} />
        </FormField>
      </div>

      {/* Payments table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {isRTL ? 'لا توجد مدفوعات تطابق الفلاتر' : 'No payments match the current filters'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {[
                  isRTL ? 'التاريخ' : 'Date',
                  isRTL ? 'المريض' : 'Patient',
                  isRTL ? 'المبلغ' : 'Amount',
                  isRTL ? 'طريقة الدفع' : 'Method',
                  isRTL ? 'خطة العلاج' : 'Treatment plan',
                  isRTL ? 'ملاحظات' : 'Notes',
                ].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600, color: C.textSec, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => {
                const dateStr = r.recorded_at
                  ? new Date(r.recorded_at).toLocaleString(isRTL ? 'ar-IQ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{dateStr}</td>
                    <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>{r.patient?.full_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(r.amount_minor, r.currency || 'IQD')}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.textSec }}>{methodLabel(r.method, isRTL)}</td>
                    <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 12 }}>
                      {r.plan ? (r.plan.notes || (isRTL ? 'خطة' : 'Plan')) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 12 }}>{r.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showRecord && (
        <RecordPaymentModal
          dir={dir}
          isRTL={isRTL}
          onClose={() => setShowRecord(false)}
          onSaved={() => { setShowRecord(false); reload() }}
          onError={(msg) => toast?.(msg, 'error')}
          onSuccess={(msg) => toast?.(msg, 'success')}
        />
      )}
    </div>
  )
}


// ─── Record-payment modal ──────────────────────────────────────────────────
function RecordPaymentModal({ dir, isRTL, onClose, onSaved, onError, onSuccess }) {
  const [patient, setPatient] = useState(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimer = useRef(null)

  const [plans, setPlans] = useState([])
  const [planId, setPlanId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('IQD')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Debounced patient search.
  useEffect(() => {
    if (!search || search.length < 2 || patient) { setResults([]); return }
    setSearching(true)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const rows = await searchPatientsForAppointment(search)
        setResults(rows)
      } catch (err) {
        console.error('[RecordPaymentModal] patient search:', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(searchTimer.current)
  }, [search, patient])

  // Load the patient's open plans whenever a patient is selected.
  useEffect(() => {
    if (!patient) { setPlans([]); setPlanId(''); return }
    let cancelled = false
    fetchTreatmentPlansForPatient(patient.id)
      .then(rows => {
        if (cancelled) return
        // Only show plans that are still open. completed/declined plans
        // shouldn't be the "linked plan" target by default.
        const open = (rows || []).filter(p => ['proposed', 'accepted', 'in_progress'].includes(p.status))
        setPlans(open)
      })
      .catch(err => { console.error('[RecordPaymentModal] plans load:', err); setPlans([]) })
    return () => { cancelled = true }
  }, [patient])

  const handleSubmit = async () => {
    if (!patient) { onError(isRTL ? 'اختر مريضاً' : 'Pick a patient'); return }
    const amountMinor = toMinor(amount, currency)
    if (!amountMinor || amountMinor < 1) { onError(isRTL ? 'المبلغ مطلوب' : 'Amount is required'); return }
    setSubmitting(true)
    try {
      await insertPayment({
        patient_id: patient.id,
        treatment_plan_id: planId || null,
        amount_minor: amountMinor,
        currency,
        method,
        notes: notes ? sanitizeNotes(notes) : null,
        recorded_at: new Date().toISOString(),
      })
      onSuccess(isRTL ? 'تم تسجيل الدفعة' : 'Payment recorded')
      onSaved()
    } catch (err) {
      console.error('[RecordPaymentModal] insert failed:', err)
      onError(err.message || (isRTL ? 'فشل تسجيل الدفعة' : 'Failed to record payment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={() => { if (!submitting) onClose() }} dir={dir} width={520}>
      <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>
          {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
        </h3>

        {/* Patient picker */}
        <FormField label={isRTL ? 'المريض' : 'Patient'} dir={dir}>
          {patient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bgSec }}>
              <span style={{ flex: 1, fontWeight: 600, color: C.text }}>{patient.full_name}</span>
              {patient.phone && <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{patient.phone}</span>}
              <button type="button" onClick={() => { setPatient(null); setSearch(''); setShowDropdown(true) }} aria-label="Clear" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'inline-flex' }}>
                {Icons.x(14)}
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder={isRTL ? 'ابحث بالاسم أو الرقم...' : 'Search by name or phone...'}
                style={inputStyle(dir)} />
              {showDropdown && search.length >= 2 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', insetInline: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {searching ? (
                    <div style={{ padding: 12, color: C.textMuted, fontSize: 12 }}>{isRTL ? 'جاري البحث...' : 'Searching...'}</div>
                  ) : results.length === 0 ? (
                    <div style={{ padding: 12, color: C.textMuted, fontSize: 12 }}>{isRTL ? 'لا توجد نتائج' : 'No results'}</div>
                  ) : (
                    results.map(p => (
                      <div key={p.id} onClick={() => { setPatient(p); setShowDropdown(false); setSearch('') }}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontWeight: 600, color: C.text }}>{p.full_name}</div>
                        {p.phone && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{p.phone}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </FormField>

        {/* Amount + currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <FormField label={isRTL ? 'المبلغ' : 'Amount'} dir={dir}>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0" style={{ ...inputStyle(dir), textAlign: 'right' }} />
          </FormField>
          <FormField label={isRTL ? 'العملة' : 'Currency'} dir={dir}>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={selectStyle(dir)}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </FormField>
        </div>

        <FormField label={isRTL ? 'طريقة الدفع' : 'Method'} dir={dir}>
          <select value={method} onChange={e => setMethod(e.target.value)} style={selectStyle(dir)}>
            {PAYMENT_METHODS.map(m => (
              <option key={m.id} value={m.id}>{m.icon} {isRTL ? m.ar : m.en}</option>
            ))}
          </select>
        </FormField>

        {/* Optional treatment plan link */}
        {patient && plans.length > 0 && (
          <FormField label={isRTL ? 'ربط بخطة علاج (اختياري)' : 'Link to treatment plan (optional)'} dir={dir}>
            <select value={planId} onChange={e => setPlanId(e.target.value)} style={selectStyle(dir)}>
              <option value="">{isRTL ? '— لا شيء —' : '— None —'}</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {(p.notes ? p.notes.slice(0, 60) : (isRTL ? 'خطة' : 'Plan'))} — {formatMoney(p.total_amount_minor, p.currency)} ({p.status})
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
          <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}
            placeholder={isRTL ? 'مثال: إيصال #1234' : 'e.g. receipt #1234'}
            style={inputStyle(dir)} />
        </FormField>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" disabled={submitting} onClick={onClose} style={makeBtn('secondary')}>
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting || !patient} style={makeBtn('primary', submitting ? { opacity: 0.6, cursor: 'wait' } : {})}>
            {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تسجيل' : 'Record')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
