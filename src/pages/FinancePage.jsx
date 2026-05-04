/**
 * Velo CRM — FinancePage (Liquid Glass restyle, Phase 2.4).
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
import { Icons, Modal } from '../components/shared'
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
import { GlassCard, Button, Input, Select, Badge, EmptyState } from '../components/ui'
import { KPICard } from '../components/ds/KPICard'

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

// Tone for the method badge — keeps the palette tight (no rainbow).
const methodTone = (id) => {
  switch (id) {
    case 'cash':        return 'success'
    case 'card':        return 'cyan'
    case 'fib':         return 'navy'
    case 'zaincash':    return 'navy'
    case 'asia_hawala': return 'cyan'
    default:            return 'neutral'
  }
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

  // Currency-aware totals + counts. Per CLAUDE.md never sum across currencies.
  const totalsByCurrency = useMemo(() => {
    const out = {}
    for (const r of filteredRows) {
      const cur = r.currency || 'IQD'
      const slot = out[cur] || { sum: 0, count: 0 }
      slot.sum += Number(r.amount_minor || 0)
      slot.count += 1
      out[cur] = slot
    }
    return out
  }, [filteredRows])

  const txnCount = filteredRows.length
  const presentCurrencies = Object.keys(totalsByCurrency)

  // Operator (agency) view — payments from the operator side are managed by
  // OperatorConsole, not this page. Show a pointer. The early return must
  // come AFTER all hook calls above so we don't break rules-of-hooks.
  if (isOperator) {
    return (
      <div dir={dir} className="ds-root min-h-full p-6 md:p-8">
        <GlassCard padding="lg" className="max-w-xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-navy-800 m-0 mb-2">
            {isRTL ? 'المالية' : 'Finance'}
          </h2>
          <p className="text-sm text-navy-600 m-0">
            {isRTL
              ? 'إيرادات الاشتراكات تُدار من لوحة المشغل (OperatorConsole).'
              : 'Subscription revenue is managed in the OperatorConsole, not on this page.'}
          </p>
        </GlassCard>
      </div>
    )
  }

  // Permission gate: can the current role record a new payment?
  // Owner + receptionist + assistant-with-payments-w. Doctor reads only.
  const canRecord = !role || can(role, 'payments', 'w') || can(role, 'finance', 'w')

  const dateRangeLabel = (() => {
    const fmt = (ymd) => {
      if (!ymd) return ''
      try {
        return new Date(ymd + 'T00:00:00').toLocaleDateString(isRTL ? 'ar-IQ' : undefined, { month: 'short', day: 'numeric' })
      } catch { return ymd }
    }
    return `${fmt(dateFrom)} – ${fmt(dateTo)}`
  })()

  return (
    <div dir={dir} className="ds-root min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[28px] font-semibold text-navy-800 m-0 leading-tight tracking-tight">
            {isRTL ? 'المالية' : 'Finance'}
          </h1>
          <p className="text-sm text-navy-600 mt-1.5 mb-0 max-w-2xl">
            {isRTL
              ? 'سجل المدفوعات للعيادة. كل دفعة مسجلة هي مدفوعة — لا توجد فواتير معلقة في النظام الجديد.'
              : 'Recorded payments for the clinic. Every recorded payment is paid — the new schema has no pending-invoice concept.'}
          </p>
        </div>
        {canRecord && (
          <Button
            variant="primary"
            size="md"
            iconStart={Icons.plus}
            onClick={() => setShowRecord(true)}
          >
            {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
          </Button>
        )}
      </div>

      {/* KPI row — currency totals are shown SEPARATELY (never summed). */}
      <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {presentCurrencies.length === 0 ? (
          <GlassCard padding="md" className="sm:col-span-2 lg:col-span-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-500 mb-2">
              {isRTL ? 'الإيرادات' : 'Revenue'}
            </div>
            <div className="text-sm text-navy-500">
              {isRTL ? 'لا توجد مدفوعات في النطاق المحدد' : 'No payments in the selected range'}
            </div>
          </GlassCard>
        ) : (
          <>
            {/* One revenue card per currency present. Sum + count + avg ticket. */}
            {presentCurrencies.map(cur => {
              const t = totalsByCurrency[cur]
              const avg = t.count > 0 ? Math.round(t.sum / t.count) : 0
              return (
                <KPICard
                  key={cur}
                  icon={Icons.dollar}
                  label={isRTL ? `الإيرادات (${cur})` : `Revenue (${cur})`}
                  value={
                    <span
                      className={t.sum === 0 ? 'text-2xl text-navy-400 font-medium' : 'text-2xl'}
                      style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
                    >
                      {formatMoney(t.sum, cur)}
                    </span>
                  }
                  hint={
                    isRTL
                      ? `${t.count} دفعة • معدل ${formatMoney(avg, cur)}`
                      : `${t.count} ${t.count === 1 ? 'payment' : 'payments'} • avg ${formatMoney(avg, cur)}`
                  }
                />
              )
            })}
            {/* Transactions card — total count across both currencies (count is currency-agnostic). */}
            <KPICard
              icon={Icons.barChart}
              label={isRTL ? 'المعاملات' : 'Transactions'}
              value={txnCount.toLocaleString(isRTL ? 'ar-IQ' : undefined)}
              hint={dateRangeLabel}
            />
          </>
        )}
      </div>

      {/* Filters */}
      <GlassCard padding="none" className="p-4 mb-5">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="date"
            label={isRTL ? 'من' : 'From'}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <Input
            type="date"
            label={isRTL ? 'إلى' : 'To'}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
          <Select
            label={isRTL ? 'طريقة الدفع' : 'Method'}
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
          >
            <option value="">{isRTL ? 'كل الطرق' : 'All methods'}</option>
            {PAYMENT_METHODS.map(m => (
              <option key={m.id} value={m.id}>{isRTL ? m.ar : m.en}</option>
            ))}
          </Select>
          <Input
            label={isRTL ? 'بحث المريض' : 'Patient search'}
            placeholder={isRTL ? 'الاسم...' : 'Name...'}
            value={patientQuery}
            onChange={e => setPatientQuery(e.target.value)}
            iconStart={Icons.search}
          />
        </div>
      </GlassCard>

      {/* Payments table */}
      <GlassCard padding="none" className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-navy-500">
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title={isRTL ? 'لا توجد مدفوعات' : 'No payments'}
            description={
              isRTL
                ? 'لا توجد مدفوعات تطابق الفلاتر الحالية. جرّب توسيع نطاق التاريخ.'
                : 'No payments match the current filters. Try widening the date range.'
            }
            action={canRecord ? (
              <Button variant="primary" iconStart={Icons.plus} onClick={() => setShowRecord(true)}>
                {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
              </Button>
            ) : null}
          />
        ) : (
          <PaymentsTable rows={filteredRows} isRTL={isRTL} />
        )}
      </GlassCard>

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


// ─── Payments table ────────────────────────────────────────────────────────
function PaymentsTable({ rows, isRTL }) {
  const headers = [
    { key: 'date',     label: isRTL ? 'التاريخ' : 'Date' },
    { key: 'patient',  label: isRTL ? 'المريض' : 'Patient' },
    { key: 'amount',   label: isRTL ? 'المبلغ' : 'Amount', align: 'end' },
    { key: 'method',   label: isRTL ? 'طريقة الدفع' : 'Method' },
    { key: 'plan',     label: isRTL ? 'خطة العلاج' : 'Treatment plan' },
    { key: 'notes',    label: isRTL ? 'ملاحظات' : 'Notes' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr className="bg-navy-50/60 backdrop-blur-glass-sm">
            {headers.map(h => (
              <th
                key={h.key}
                className="px-4 py-3 text-[10.5px] font-semibold text-navy-600 uppercase tracking-[0.08em] border-b border-navy-100"
                style={{ textAlign: h.align === 'end' ? 'end' : 'start' }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const dateStr = r.recorded_at
              ? new Date(r.recorded_at).toLocaleString(isRTL ? 'ar-IQ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
              : '—'
            const amount = Number(r.amount_minor || 0)
            const cur = r.currency || 'IQD'
            const isZero = amount === 0
            // FINANCE-AUDIT: existing schema stores only positive payments (no
            // refunds/negatives in the current data model). If a refund concept
            // is added later, render negatives in `text-rose-700` here and
            // prefix the formatted string with the locale-correct minus sign.
            const moneyCls = isZero
              ? 'text-navy-400 font-medium'
              : 'text-navy-900 font-semibold'

            return (
              <tr
                key={r.id}
                className={`${i % 2 === 1 ? 'bg-white/40' : 'bg-transparent'} hover:bg-accent-cyan-50/40 transition-colors`}
              >
                <td
                  className="px-4 py-3 text-navy-700 whitespace-nowrap border-b border-navy-50"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {dateStr}
                </td>
                <td className="px-4 py-3 text-navy-900 font-medium border-b border-navy-50">
                  {r.patient?.full_name || '—'}
                </td>
                <td
                  className={`px-4 py-3 ${moneyCls} whitespace-nowrap border-b border-navy-50`}
                  style={{ fontVariantNumeric: 'tabular-nums lining-nums', textAlign: 'end' }}
                >
                  {formatMoney(r.amount_minor, cur)}
                </td>
                <td className="px-4 py-3 border-b border-navy-50">
                  <Badge tone={methodTone(r.method)} size="sm">
                    {methodLabel(r.method, isRTL)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-navy-600 text-[12.5px] border-b border-navy-50 max-w-[220px] truncate">
                  {r.plan ? (r.plan.notes || (isRTL ? 'خطة' : 'Plan')) : '—'}
                </td>
                <td className="px-4 py-3 text-navy-500 text-[12.5px] border-b border-navy-50 max-w-[220px] truncate">
                  {r.notes || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
    <Modal onClose={() => { if (!submitting) onClose() }} dir={dir} width={560}>
      <div className="ds-root px-6 py-5">
        <form onSubmit={e => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-navy-800 m-0">
              {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
            </h3>
            <button
              type="button"
              onClick={() => { if (!submitting) onClose() }}
              aria-label={isRTL ? 'إغلاق' : 'Close'}
              className="text-navy-400 hover:text-navy-700 hover:bg-navy-50 w-8 h-8 grid place-items-center rounded-full transition-colors"
            >
              {Icons.x(16)}
            </button>
          </div>

          {/* Patient picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-navy-600 select-none">
              {isRTL ? 'المريض' : 'Patient'}
            </label>
            {patient ? (
              <div className="flex items-center gap-3 h-11 px-3.5 rounded-glass bg-white/85 border border-navy-100 shadow-glass-sm">
                <span className="flex-1 font-semibold text-navy-800 truncate">{patient.full_name}</span>
                {patient.phone && (
                  <span className="text-[11px] text-navy-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {patient.phone}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setPatient(null); setSearch(''); setShowDropdown(true) }}
                  aria-label={isRTL ? 'مسح' : 'Clear'}
                  className="text-navy-400 hover:text-navy-700 transition-colors flex"
                >
                  {Icons.x(14)}
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={isRTL ? 'ابحث بالاسم أو الرقم...' : 'Search by name or phone...'}
                  iconStart={Icons.search}
                />
                {showDropdown && search.length >= 2 && (
                  <div className="absolute top-[calc(100%+4px)] inset-x-0 z-20 max-h-56 overflow-y-auto rounded-glass border border-navy-100 bg-white shadow-glass-md">
                    {searching ? (
                      <div className="p-3 text-xs text-navy-500">{isRTL ? 'جاري البحث...' : 'Searching...'}</div>
                    ) : results.length === 0 ? (
                      <div className="p-3 text-xs text-navy-500">{isRTL ? 'لا توجد نتائج' : 'No results'}</div>
                    ) : (
                      results.map(p => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => { setPatient(p); setShowDropdown(false); setSearch('') }}
                          className="w-full text-start px-3 py-2.5 border-b border-navy-50 last:border-b-0 hover:bg-accent-cyan-50/60 transition-colors"
                        >
                          <div className="font-semibold text-navy-800 text-[13px]">{p.full_name}</div>
                          {p.phone && (
                            <div className="text-[11px] text-navy-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {p.phone}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Input
              label={isRTL ? 'المبلغ' : 'Amount'}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              inputClassName="text-end"
            />
            <Select
              label={isRTL ? 'العملة' : 'Currency'}
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            >
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </Select>
          </div>

          <Select
            label={isRTL ? 'طريقة الدفع' : 'Method'}
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map(m => (
              <option key={m.id} value={m.id}>{m.icon} {isRTL ? m.ar : m.en}</option>
            ))}
          </Select>

          {/* Optional treatment plan link */}
          {patient && plans.length > 0 && (
            <Select
              label={isRTL ? 'ربط بخطة علاج (اختياري)' : 'Link to treatment plan (optional)'}
              value={planId}
              onChange={e => setPlanId(e.target.value)}
            >
              <option value="">{isRTL ? '— لا شيء —' : '— None —'}</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {(p.notes ? p.notes.slice(0, 60) : (isRTL ? 'خطة' : 'Plan'))} — {formatMoney(p.total_amount_minor, p.currency)} ({p.status})
                </option>
              ))}
            </Select>
          )}

          <Input
            label={isRTL ? 'ملاحظات' : 'Notes'}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={500}
            placeholder={isRTL ? 'مثال: إيصال #1234' : 'e.g. receipt #1234'}
          />

          <div className="flex gap-2 justify-end mt-2">
            <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting || !patient}>
              {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تسجيل' : 'Record')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
