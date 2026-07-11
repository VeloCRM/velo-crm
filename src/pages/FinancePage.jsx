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

import { useState, useEffect, useMemo } from 'react'
import { Icons, Modal } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'
import { insertPayment } from '../lib/database'
import PatientPicker from '../components/PatientPicker'
import { fetchTreatmentPlansForPatient } from '../lib/dental'
import { formatMoney, toMinor, fromMinor } from '../lib/money'
import { sanitizeNotes } from '../lib/sanitize'
import { fetchMyProfile } from '../lib/profiles'
import { getClinicLedgerTotals, fetchAllCharges, fetchAllPayments, getOutstandingCollections, createCharge } from '../lib/billing'
import { AddChargeModal } from '../components/BillingSections'
import { getImpersonationContext } from '../lib/auth_session'
import { can } from '../lib/permissions'
import { GlassCard, Button, Input, Select, Badge, EmptyState } from '../components/ui'

const PAYMENT_METHODS = [
  { id: 'cash',        en: 'Cash',        ar: 'نقداً',      icon: '💵' },
  { id: 'fib',         en: 'FIB',         ar: 'FIB',         icon: '🏦' },
  { id: 'zaincash',    en: 'ZainCash',    ar: 'زين كاش',     icon: '📱' },
  { id: 'asia_hawala', en: 'Asia Hawala', ar: 'آسيا حوالة',  icon: '💱' },
  { id: 'card',        en: 'Card',        ar: 'بطاقة',       icon: '💳' },
  { id: 'other',       en: 'Other',       ar: 'أخرى',        icon: '🔖' },
]

// Income categories — values MUST match the charges_category_check DB constraint.
const CHARGE_CATEGORY_OPTIONS = [
  { value: 'clinical', en: 'Clinical', ar: 'علاجي' },
  { value: 'product', en: 'Product', ar: 'منتج' },
  { value: 'consultation', en: 'Consultation', ar: 'استشارة' },
  { value: 'other', en: 'Other', ar: 'أخرى' },
]
const CATEGORY_LABEL = Object.fromEntries(CHARGE_CATEGORY_OPTIONS.map(c => [c.value, c]))

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

  const [profile, setProfile] = useState(null)
  const role = profile?.role || null
  const [showRecord, setShowRecord] = useState(false)
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [activeTab, setActiveTab] = useState('charges')

  // Clinic-wide ledger totals (getClinicLedgerTotals → the finance_ledger_totals view).
  const [totals, setTotals] = useState({})
  const [totalsLoading, setTotalsLoading] = useState(true)
  const [totalsError, setTotalsError] = useState(null)

  // Ledger tabs (fetchAllCharges / fetchAllPayments — org-wide, surface kind/reversesId).
  const [charges, setCharges] = useState([])
  const [chargesLoading, setChargesLoading] = useState(true)
  const [chargesError, setChargesError] = useState(null)
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState(null)

  // Collections worklist (getOutstandingCollections — patients who owe > 0).
  const [collections, setCollections] = useState([])
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [collectionsError, setCollectionsError] = useState(null)
  // Pre-fill for the Record Payment modal when opened via a "Collect" button:
  // { patient, amountMinor, currency } — null means a blank Record Payment.
  const [collect, setCollect] = useState(null)

  // Bumped after a mutation (e.g. Record Payment) to refetch totals + ledger + worklist.
  const [refreshKey, setRefreshKey] = useState(0)

  // Filters — shared: date range + patient search; tab-specific: category / method.
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [methodFilter, setMethodFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [patientQuery, setPatientQuery] = useState('')

  // Finance is per-clinic. A clinic user always sees it; an operator only when
  // impersonating a clinic (then getCurrentOrgId() resolves to the impersonated org,
  // so the clinic reads run in that context). A no-org operator gets the fallback.
  const impersonating = getImpersonationContext()?.orgId || null
  const showClinicView = !isOperator || !!impersonating

  useEffect(() => {
    if (!showClinicView) return
    let cancelled = false
    fetchMyProfile().then(p => { if (!cancelled) setProfile(p || null) }).catch(() => {})
    return () => { cancelled = true }
  }, [showClinicView])

  // Clinic-wide ledger totals — all-time (getClinicLedgerTotals scopes by org). Refetched
  // on refreshKey (after a mutation). Not affected by the date/tab filters.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!showClinicView) { if (!cancelled) setTotalsLoading(false); return }
      if (!isSupabaseConfigured()) { if (!cancelled) { setTotals({}); setTotalsLoading(false) } return }
      if (!cancelled) { setTotalsLoading(true); setTotalsError(null) }
      try {
        const t = await getClinicLedgerTotals()
        if (!cancelled) { setTotals(t || {}); setTotalsLoading(false) }
      } catch (err) {
        if (!cancelled) { console.error('[FinancePage] totals load failed:', err); setTotalsError(err); setTotalsLoading(false) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [showClinicView, refreshKey])

  // All Charges tab — org-wide, date range + category filter (patient filter is client-side).
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!showClinicView) { if (!cancelled) setChargesLoading(false); return }
      if (!isSupabaseConfigured()) { if (!cancelled) { setCharges([]); setChargesLoading(false) } return }
      if (!cancelled) { setChargesLoading(true); setChargesError(null) }
      try {
        const b = toIsoBounds(dateFrom, dateTo)
        const rows = await fetchAllCharges({ from: b.from, to: b.to, category: categoryFilter || undefined, limit: 200 })
        if (!cancelled) { setCharges(rows || []); setChargesLoading(false) }
      } catch (err) {
        if (!cancelled) { console.error('[FinancePage] charges load failed:', err); setChargesError(err); setChargesLoading(false) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [showClinicView, dateFrom, dateTo, categoryFilter, refreshKey])

  // All Payments tab — org-wide, date range + method filter. Surfaces kind/reversesId so
  // reversal corrections render struck and are excluded from the active total.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!showClinicView) { if (!cancelled) setPaymentsLoading(false); return }
      if (!isSupabaseConfigured()) { if (!cancelled) { setPayments([]); setPaymentsLoading(false) } return }
      if (!cancelled) { setPaymentsLoading(true); setPaymentsError(null) }
      try {
        const b = toIsoBounds(dateFrom, dateTo)
        const rows = await fetchAllPayments({ from: b.from, to: b.to, method: methodFilter || undefined, limit: 200 })
        if (!cancelled) { setPayments(rows || []); setPaymentsLoading(false) }
      } catch (err) {
        if (!cancelled) { console.error('[FinancePage] payments load failed:', err); setPaymentsError(err); setPaymentsLoading(false) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [showClinicView, dateFrom, dateTo, methodFilter, refreshKey])

  // Collections worklist — every patient owing > 0 (not date-filtered; it's the current
  // book of debt). Refetched on refreshKey so a settled patient drops off after collect.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!showClinicView) { if (!cancelled) setCollectionsLoading(false); return }
      if (!isSupabaseConfigured()) { if (!cancelled) { setCollections([]); setCollectionsLoading(false) } return }
      if (!cancelled) { setCollectionsLoading(true); setCollectionsError(null) }
      try {
        const rows = await getOutstandingCollections()
        if (!cancelled) { setCollections(rows || []); setCollectionsLoading(false) }
      } catch (err) {
        if (!cancelled) { console.error('[FinancePage] collections load failed:', err); setCollectionsError(err); setCollectionsLoading(false) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [showClinicView, refreshKey])

  // Client-side patient-name filter across both tabs (server already scoped by date/etc.).
  const visibleCharges = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    return q ? charges.filter(c => (c.patientName || '').toLowerCase().includes(q)) : charges
  }, [charges, patientQuery])
  const visiblePayments = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    return q ? payments.filter(p => (p.patientName || '').toLowerCase().includes(q)) : payments
  }, [payments, patientQuery])

  // No-org operator (not impersonating any clinic): finance is per-clinic, so there is
  // nothing to aggregate. An operator IMPERSONATING a clinic falls through to the real
  // clinic view (getClinicLedgerTotals runs in the impersonated org context). The early
  // return must come AFTER all hook calls above so we don't break rules-of-hooks.
  if (!showClinicView) {
    return (
      <div dir={dir} className="ds-root min-h-full p-6 md:p-8">
        <GlassCard padding="lg" className="max-w-xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-navy-800 m-0 mb-2">
            {isRTL ? 'المالية على مستوى العيادة' : 'Clinic finance'}
          </h2>
          <p className="text-sm text-navy-600 m-0">
            {isRTL
              ? 'اختر عيادة (انتحال) لعرض بياناتها المالية. تُدار إيرادات الوكالة في وحدة تحكم المشغّل.'
              : 'Impersonate a clinic to view its finance. Agency revenue is managed in the Operator Console.'}
          </p>
        </GlassCard>
      </div>
    )
  }

  // Permission gate: can the current role record a new payment?
  // Owner + receptionist + assistant-with-payments-w. Doctor reads only.
  const canRecord = !role || can(role, 'payments', 'w') || can(role, 'finance', 'w')
  // Add Charge is doctor/owner (mirrors the Billing tab + the charges INSERT RLS;
  // no 'charges' matrix key, so this is a direct role check).
  const canAddCharge = ['owner', 'doctor'].includes(role)

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
        <div className="flex items-center gap-2 flex-wrap">
          {canAddCharge && (
            <Button
              variant="secondary"
              size="md"
              iconStart={Icons.plus}
              onClick={() => setShowAddCharge(true)}
            >
              {isRTL ? 'إضافة رسوم' : 'Add Charge'}
            </Button>
          )}
          {canRecord && (
            <Button
              variant="primary"
              size="md"
              iconStart={Icons.plus}
              onClick={() => { setCollect(null); setShowRecord(true) }}
            >
              {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
            </Button>
          )}
        </div>
      </div>

      {/* Clinic-wide ledger headline (getClinicLedgerTotals → finance_ledger_totals
          view): Billed / Collected / Outstanding (net), per currency, never blended.
          All-time clinic totals. Modals render at page root (below), never inside this. */}
      <LedgerTotalsHeader totals={totals} loading={totalsLoading} error={totalsError} isRTL={isRTL} />

      {/* Collections worklist — patients who owe (gross "To collect"), each with a
          per-currency Collect action that pre-fills Record Payment. */}
      <CollectionsPanel
        collections={collections}
        loading={collectionsLoading}
        error={collectionsError}
        canCollect={canRecord}
        onCollect={(prefill) => { setCollect(prefill); setShowRecord(true) }}
        isRTL={isRTL}
      />

      {/* Shared filters: date range + patient search (always); plus a tab-specific
          filter — category on Charges, method on Payments. */}
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
          <Input
            label={isRTL ? 'بحث المريض' : 'Patient search'}
            placeholder={isRTL ? 'الاسم...' : 'Name...'}
            value={patientQuery}
            onChange={e => setPatientQuery(e.target.value)}
            iconStart={Icons.search}
          />
          {activeTab === 'charges' ? (
            <Select
              label={isRTL ? 'الفئة' : 'Category'}
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">{isRTL ? 'كل الفئات' : 'All categories'}</option>
              {CHARGE_CATEGORY_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</option>
              ))}
            </Select>
          ) : (
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
          )}
        </div>
      </GlassCard>

      {/* Ledger tabs */}
      <div className="flex items-center gap-1 mb-4" role="tablist">
        <LedgerTab active={activeTab === 'charges'} onClick={() => setActiveTab('charges')}>
          {isRTL ? 'كل الرسوم' : 'All Charges'}
        </LedgerTab>
        <LedgerTab active={activeTab === 'payments'} onClick={() => setActiveTab('payments')}>
          {isRTL ? 'كل المدفوعات' : 'All Payments'}
        </LedgerTab>
      </div>

      <GlassCard padding="none" className="overflow-hidden">
        {activeTab === 'charges' ? (
          <ChargesLedger charges={visibleCharges} loading={chargesLoading} error={chargesError} isRTL={isRTL} />
        ) : (
          <PaymentsLedger payments={visiblePayments} loading={paymentsLoading} error={paymentsError} isRTL={isRTL} />
        )}
      </GlassCard>

      {showRecord && (
        <RecordPaymentModal
          dir={dir}
          isRTL={isRTL}
          initialPatient={collect?.patient || null}
          initialAmountMinor={collect?.amountMinor}
          initialCurrency={collect?.currency}
          lockPatient={!!collect}
          onClose={() => { setShowRecord(false); setCollect(null) }}
          onSaved={() => { setShowRecord(false); setCollect(null); setRefreshKey(k => k + 1) }}
          onError={(msg) => toast?.(msg, 'error')}
          onSuccess={(msg) => toast?.(msg, 'success')}
        />
      )}

      {/* Add Charge — no fixed patient, so the modal renders PatientPicker first.
          At page root, outside every GlassCard (backdrop-filter breaks fixed centering). */}
      {showAddCharge && (
        <AddChargeModal
          profile={profile}
          dir={dir}
          isRTL={isRTL}
          onClose={() => setShowAddCharge(false)}
          onSubmit={async (c) => {
            try {
              await createCharge(c)
              toast?.(isRTL ? 'تمت إضافة الرسوم' : 'Charge added', 'success')
              setShowAddCharge(false)
              setRefreshKey(k => k + 1)
            } catch (err) {
              console.error('[FinancePage] add charge failed:', err)
              toast?.(err.message || (isRTL ? 'فشل إضافة الرسوم' : 'Failed to add charge'), 'error')
            }
          }}
        />
      )}
    </div>
  )
}


// ─── Clinic-wide ledger totals header ──────────────────────────────────────
// Billed / Collected / Outstanding (net) per currency. Never blends currencies.
// "Outstanding (net)" is the net receivable — patient credits reduce it — distinct
// from the (later) collections worklist's gross "to collect".
function Stat({ label, value, hint, emphasis }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-navy-500 mb-1">{label}</div>
      <div
        className={emphasis ? 'text-xl font-bold text-navy-900' : 'text-lg font-semibold text-navy-800'}
        style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-navy-400 mt-0.5">{hint}</div>}
    </div>
  )
}

function LedgerTotalsHeader({ totals, loading, error, isRTL }) {
  const currencies = Object.keys(totals || {})

  if (loading) {
    return (
      <GlassCard padding="lg" className="mb-6">
        <div className="text-sm text-navy-500">{isRTL ? 'جاري تحميل الإجماليات...' : 'Loading totals...'}</div>
      </GlassCard>
    )
  }
  if (error) {
    return (
      <GlassCard padding="lg" className="mb-6">
        <div className="text-sm text-rose-600">
          {isRTL ? 'تعذّر تحميل إجماليات الفوترة' : 'Could not load billing totals'}
        </div>
      </GlassCard>
    )
  }
  if (currencies.length === 0) {
    return (
      <GlassCard padding="lg" className="mb-6 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-500 mb-2">
          {isRTL ? 'نظرة عامة على الفوترة' : 'Billing overview'}
        </div>
        <div className="text-sm text-navy-500">{isRTL ? 'لا يوجد نشاط فوترة بعد' : 'No billing activity yet'}</div>
      </GlassCard>
    )
  }

  return (
    <div className={`grid gap-4 mb-6 ${currencies.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
      {currencies.map(cur => {
        const t = totals[cur] || { billed: 0, collected: 0, outstanding: 0 }
        return (
          <GlassCard key={cur} padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-500">
                {isRTL ? 'الفوترة' : 'Billing'}
              </div>
              <span className="text-xs font-semibold text-navy-600 border border-navy-200 rounded-full px-2.5 py-0.5">
                {cur}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={isRTL ? 'مفوتر' : 'Billed'} value={formatMoney(t.billed, cur)} />
              <Stat label={isRTL ? 'محصّل' : 'Collected'} value={formatMoney(t.collected, cur)} />
              <Stat
                label={isRTL ? 'المتبقّي (صافي)' : 'Outstanding (net)'}
                value={formatMoney(t.outstanding, cur)}
                hint={isRTL ? 'صافٍ بعد أرصدة المرضى الدائنة' : 'net of patient credits'}
                emphasis
              />
            </div>
          </GlassCard>
        )
      })}
    </div>
  )
}

// ─── Collections worklist ───────────────────────────────────────────────────
// Patients who owe (getOutstandingCollections). "To collect" is GROSS — only the
// per-currency positive balances, patients in debit only. It differs from the KPI
// "Outstanding (net)", which nets in patient credits. Each owed currency gets its
// own Collect button (a payment is single-currency) that pre-fills Record Payment.
function CollectionsPanel({ collections, loading, error, canCollect, onCollect, isRTL }) {
  return (
    <GlassCard padding="lg" className="mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-navy-900 m-0">{isRTL ? 'التحصيل' : 'To collect'}</h3>
        <span className="text-[11px] text-navy-400 text-end">
          {isRTL ? 'إجمالي المستحق — المرضى المدينون فقط' : 'Gross owed — patients in debit only'}
        </span>
      </div>
      <p className="text-[11px] text-navy-400 m-0 mb-4">
        {isRTL
          ? 'يختلف عن «المتبقّي (صافي)» أعلاه لأن الصافي يشمل أرصدة المرضى الدائنة.'
          : 'Differs from "Outstanding (net)" above — net nets in patient credits.'}
      </p>

      {loading ? (
        <div className="py-8 text-center text-sm text-navy-500">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-rose-600">{isRTL ? 'تعذّر تحميل قائمة التحصيل' : 'Could not load collections'}</div>
      ) : collections.length === 0 ? (
        <div className="py-8 text-center text-sm text-navy-500">{isRTL ? 'لا توجد أرصدة مستحقة' : 'No outstanding balances'}</div>
      ) : (
        <ul className="flex flex-col">
          {collections.map(c => {
            const owed = Object.entries(c.balances || {}).filter(([, v]) => Number(v) > 0)
            if (!owed.length) return null
            const dateStr = c.latestChargeAt
              ? new Date(c.latestChargeAt).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US')
              : ''
            return (
              <li key={c.patientId} className="flex items-center gap-3 py-3 border-b border-navy-100/60 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-navy-900 truncate">{c.fullName || '—'}</div>
                  <div className="text-xs text-navy-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {c.phone && <span className="tabular-nums" dir="ltr">{c.phone}</span>}
                    {c.phone && dateStr && <span>·</span>}
                    {dateStr && <span>{isRTL ? 'آخر رسم' : 'last charge'} {dateStr}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-x-4 gap-y-2 flex-wrap justify-end">
                  {owed.map(([cur, v]) => (
                    <div key={cur} className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-navy-900 tabular-nums whitespace-nowrap">
                        {formatMoney(Number(v), cur)} <span className="text-navy-400 font-normal">{cur}</span>
                      </span>
                      {canCollect && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCollect({
                            patient: { id: c.patientId, full_name: c.fullName, phone: c.phone },
                            amountMinor: Number(v),
                            currency: cur,
                          })}
                        >
                          {isRTL ? 'تحصيل' : 'Collect'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </GlassCard>
  )
}

// ─── Ledger tabs (All Charges / All Payments) ───────────────────────────────
// Correction-aware clinic ledger. Mirrors the patient Billing tab: void/reversal
// rows and the originals they cancel render struck + badged, and are EXCLUDED from
// the per-currency "active" total (active-row rule: a positive row counts only while
// its id is not referenced by any reverses_id).

const TH = 'px-4 py-3 text-[10.5px] font-semibold text-navy-600 uppercase tracking-[0.08em] border-b border-navy-100'
const TD = 'px-4 py-3 border-b border-navy-50'

function fmtDate(iso, isRTL) {
  return iso ? new Date(iso).toLocaleString(isRTL ? 'ar-IQ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

// Σ active rows per currency (never blended). positiveKind = 'charge' | 'payment'.
function activeSumByCurrency(rows, positiveKind) {
  const reversed = new Set((rows || []).map(r => r.reversesId).filter(Boolean))
  const out = {}
  for (const r of rows || []) {
    if ((r.kind || positiveKind) !== positiveKind) continue // void/reversal never positive
    if (reversed.has(r.id)) continue                        // a cancelled original drops out
    const cur = r.currency || 'IQD'
    out[cur] = (out[cur] || 0) + Number(r.amountMinor || 0)
  }
  return out
}

function CorrectionBadge({ type, isRTL }) {
  const MAP = {
    void:     { en: 'Void',     ar: 'إبطال',      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    voided:   { en: 'Voided',   ar: 'مُبطلة',     cls: 'bg-navy-100 text-navy-500 border-navy-200' },
    reversal: { en: 'Reversal', ar: 'قيد تصحيح', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    reversed: { en: 'Reversed', ar: 'معكوسة',    cls: 'bg-navy-100 text-navy-500 border-navy-200' },
  }
  const m = MAP[type]
  if (!m) return null
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {isRTL ? m.ar : m.en}
    </span>
  )
}

// Per-currency active total strip above each ledger table (corrections excluded).
function ActiveTotalStrip({ label, totals }) {
  const currencies = Object.keys(totals)
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-100 bg-navy-50/40">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-navy-500">{label}</span>
      {currencies.length === 0 ? (
        <span className="text-xs text-navy-400">—</span>
      ) : currencies.map(cur => (
        <span key={cur} className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white/70 px-2 py-0.5 text-xs font-semibold text-navy-800 tabular-nums">
          {formatMoney(totals[cur], cur)} <span className="text-navy-400 font-medium">{cur}</span>
        </span>
      ))}
    </div>
  )
}

function LedgerTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-glass transition-colors ${
        active ? 'bg-white text-navy-900 shadow-glass-sm' : 'text-navy-500 hover:text-navy-800 hover:bg-white/50'
      }`}
    >
      {children}
    </button>
  )
}

// Shared loading / error / empty wrapper for a ledger tab.
function LedgerState({ loading, error, empty, isRTL, children }) {
  if (loading) return <div className="py-16 text-center text-sm text-navy-500">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
  if (error) return <div className="py-16 text-center text-sm text-rose-600">{isRTL ? 'تعذّر تحميل السجل' : 'Could not load the ledger'}</div>
  if (empty) {
    return (
      <div className="py-16">
        <EmptyState
          title={isRTL ? 'لا توجد سجلات' : 'Nothing here'}
          description={isRTL ? 'لا توجد سجلات تطابق الفلاتر الحالية. جرّب توسيع نطاق التاريخ.' : 'No records match the current filters. Try widening the date range.'}
        />
      </div>
    )
  }
  return children
}

// ─── All Charges ────────────────────────────────────────────────────────────
function ChargesLedger({ charges, loading, error, isRTL }) {
  const reversedIds = new Set((charges || []).map(c => c.reversesId).filter(Boolean))
  const totals = activeSumByCurrency(charges, 'charge')
  return (
    <LedgerState loading={loading} error={error} empty={!charges.length} isRTL={isRTL}>
      <ActiveTotalStrip label={isRTL ? 'مفوتر (نشط)' : 'Billed (active)'} totals={totals} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="bg-navy-50/60 backdrop-blur-glass-sm">
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'التاريخ' : 'Date'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'المريض' : 'Patient'}</th>
              <th className={TH} style={{ textAlign: 'end' }}>{isRTL ? 'المبلغ' : 'Amount'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'الطبيب' : 'Doctor'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'الفئة' : 'Category'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((c, i) => {
              const isVoid = (c.kind || 'charge') === 'void'
              const isVoided = reversedIds.has(c.id)
              const cur = c.currency || 'IQD'
              const amtCls = isVoid ? 'text-rose-700' : isVoided ? 'text-navy-400 line-through' : 'text-navy-900 font-semibold'
              const cat = CATEGORY_LABEL[c.category] || null
              const isClinical = (c.category || 'clinical') === 'clinical'
              return (
                <tr key={c.id} className={`${i % 2 === 1 ? 'bg-white/40' : 'bg-transparent'} hover:bg-accent-cyan-50/40 transition-colors${isVoid ? ' opacity-80' : ''}`}>
                  <td className={`${TD} text-navy-700 whitespace-nowrap`} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(c.createdAt, isRTL)}</td>
                  <td className={`${TD} text-navy-900 font-medium`}>{c.patientName || '—'}</td>
                  <td className={`${TD} ${amtCls} whitespace-nowrap`} style={{ fontVariantNumeric: 'tabular-nums lining-nums', textAlign: 'end' }}>
                    {isVoid ? '−' : ''}{formatMoney(Number(c.amountMinor || 0), cur)} <span className="text-navy-400 font-normal">{cur}</span>
                  </td>
                  <td className={`${TD} text-navy-600 text-[12.5px]`}>{c.doctorName || '—'}</td>
                  <td className={TD}>
                    {isClinical ? (
                      <span className="text-[12.5px] text-navy-500">{cat ? (isRTL ? cat.ar : cat.en) : '—'}</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {cat ? (isRTL ? cat.ar : cat.en) : c.category}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {isVoid ? <CorrectionBadge type="void" isRTL={isRTL} /> : isVoided ? <CorrectionBadge type="voided" isRTL={isRTL} /> : <span className="text-navy-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </LedgerState>
  )
}

// ─── All Payments ───────────────────────────────────────────────────────────
function PaymentsLedger({ payments, loading, error, isRTL }) {
  const reversedIds = new Set((payments || []).map(p => p.reversesId).filter(Boolean))
  const totals = activeSumByCurrency(payments, 'payment')
  return (
    <LedgerState loading={loading} error={error} empty={!payments.length} isRTL={isRTL}>
      <ActiveTotalStrip label={isRTL ? 'محصّل (نشط)' : 'Collected (active)'} totals={totals} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="bg-navy-50/60 backdrop-blur-glass-sm">
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'التاريخ' : 'Date'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'المريض' : 'Patient'}</th>
              <th className={TH} style={{ textAlign: 'end' }}>{isRTL ? 'المبلغ' : 'Amount'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'طريقة الدفع' : 'Method'}</th>
              <th className={TH} style={{ textAlign: 'start' }}>{isRTL ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => {
              const isReversal = (p.kind || 'payment') === 'reversal'
              const isReversed = reversedIds.has(p.id)
              const cur = p.currency || 'IQD'
              const amtCls = isReversal ? 'text-rose-700' : isReversed ? 'text-navy-400 line-through' : 'text-navy-900 font-semibold'
              return (
                <tr key={p.id} className={`${i % 2 === 1 ? 'bg-white/40' : 'bg-transparent'} hover:bg-accent-cyan-50/40 transition-colors${isReversal ? ' opacity-80' : ''}`}>
                  <td className={`${TD} text-navy-700 whitespace-nowrap`} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(p.recordedAt, isRTL)}</td>
                  <td className={`${TD} text-navy-900 font-medium`}>{p.patientName || '—'}</td>
                  <td className={`${TD} ${amtCls} whitespace-nowrap`} style={{ fontVariantNumeric: 'tabular-nums lining-nums', textAlign: 'end' }}>
                    {isReversal ? '−' : ''}{formatMoney(Number(p.amountMinor || 0), cur)} <span className="text-navy-400 font-normal">{cur}</span>
                  </td>
                  <td className={TD}>
                    <Badge tone={methodTone(p.method)} size="sm">{methodLabel(p.method, isRTL)}</Badge>
                  </td>
                  <td className={TD}>
                    {isReversal ? <CorrectionBadge type="reversal" isRTL={isRTL} /> : isReversed ? <CorrectionBadge type="reversed" isRTL={isRTL} /> : <span className="text-navy-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </LedgerState>
  )
}


// ─── Record-payment modal ──────────────────────────────────────────────────
function RecordPaymentModal({
  dir, isRTL, onClose, onSaved, onError, onSuccess,
  initialPatient = null, initialAmountMinor, initialCurrency, lockPatient = false,
}) {
  // The modal remounts each time it opens (showRecord toggles), so these initializers
  // pick up the current Collect pre-fill on every open.
  const [patient, setPatient] = useState(initialPatient)

  const [plans, setPlans] = useState([])
  const [planId, setPlanId] = useState('')
  const [amount, setAmount] = useState(
    initialAmountMinor != null && initialCurrency ? String(fromMinor(initialAmountMinor, initialCurrency)) : '',
  )
  const [currency, setCurrency] = useState(initialCurrency || 'IQD')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
              {lockPatient ? (isRTL ? 'تحصيل دفعة' : 'Collect payment') : (isRTL ? 'تسجيل دفعة' : 'Record Payment')}
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
            <PatientPicker
              selected={patient}
              onSelect={setPatient}
              isRTL={isRTL}
              dir={dir}
              disabled={submitting || lockPatient}
            />
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
