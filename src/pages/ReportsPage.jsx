/**
 * Velo CRM — ReportsPage (new schema).
 *
 * Five dental-clinic reports as cards:
 *   1. Revenue by month (split per currency)
 *   2. Appointments by status
 *   3. Top procedures by billed amount
 *   4. New patients by month
 *   5. Basic patient retention (recent vs lapsed in last 90 days)
 *
 * Charts are hand-rolled SVG/divs — no chart library is installed and we
 * don't want to pull one in for these simple visualizations. Each card
 * accepts a date range from the page-level filter.
 *
 * The ReportBuilder ("custom report" UI) was deal/ticket-based and is
 * stubbed out separately.
 */

import { useState, useEffect, useMemo } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchRevenueByMonth,
  fetchAppointmentsByStatus,
  fetchTopProcedures,
  fetchNewPatientsByMonth,
  fetchPatientRetention,
} from '../lib/reports'
import { formatMoney } from '../lib/money'

const RANGES = [
  { id: '30d', days: 30,  en: 'Last 30 days',   ar: 'آخر ٣٠ يوم' },
  { id: '90d', days: 90,  en: 'Last 90 days',   ar: 'آخر ٩٠ يوم' },
  { id: '6m',  days: 180, en: 'Last 6 months',  ar: 'آخر ٦ أشهر' },
  { id: '1y',  days: 365, en: 'Last 12 months', ar: 'آخر ١٢ شهر' },
]

const STATUS_STYLE = {
  scheduled:   { color: '#d97706', en: 'Scheduled',   ar: 'مجدول' },
  confirmed:   { color: '#3b82f6', en: 'Confirmed',   ar: 'مؤكد' },
  in_progress: { color: '#8b5cf6', en: 'In Progress', ar: 'قيد التنفيذ' },
  completed:   { color: '#22c55e', en: 'Completed',   ar: 'مكتمل' },
  no_show:     { color: '#94a3b8', en: 'No-show',     ar: 'لم يحضر' },
  cancelled:   { color: '#ef4444', en: 'Cancelled',   ar: 'ملغي' },
}

function rangeFromIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function nowIso() { return new Date().toISOString() }

function shortMonth(ymd) {
  if (!ymd) return ''
  const [y, m] = ymd.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}


export default function ReportsPage({ t, lang, dir, isRTL, onOpenBuilder }) {
  void t
  void lang
  void onOpenBuilder

  const [rangeId, setRangeId] = useState('90d')
  const [data, setData] = useState({ revenue: null, status: null, procedures: null, newPatients: null, retention: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      setError(isRTL ? 'يحتاج إلى اتصال Supabase' : 'Supabase not configured')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const days = (RANGES.find(r => r.id === rangeId) || RANGES[1]).days
    const fromIso = rangeFromIso(days)
    const toIso = nowIso()
    Promise.all([
      fetchRevenueByMonth({ fromIso, toIso }),
      fetchAppointmentsByStatus({ fromIso, toIso }),
      fetchTopProcedures({ fromIso, toIso, limit: 10 }),
      fetchNewPatientsByMonth({ fromIso, toIso }),
      fetchPatientRetention({ recentDays: 90 }),
    ])
      .then(([revenue, status, procedures, newPatients, retention]) => {
        if (cancelled) return
        setData({ revenue, status, procedures, newPatients, retention })
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[ReportsPage] load failed:', err)
        setError(err.message || (isRTL ? 'فشل تحميل التقارير' : 'Failed to load reports'))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [rangeId, isRTL])

  return (
    <div dir={dir} style={{ padding: 24 }}>
      {/* Header + range filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
            {isRTL ? 'التقارير' : 'Reports'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, margin: '4px 0 0' }}>
            {isRTL ? 'لمحة سريعة على أداء العيادة' : 'Snapshot of clinic performance'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRangeId(r.id)}
              style={{
                ...makeBtn(rangeId === r.id ? 'primary' : 'secondary', { fontSize: 12 }),
                opacity: rangeId === r.id ? 1 : 0.85,
              }}>
              {isRTL ? r.ar : r.en}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: 16, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
          {isRTL ? 'جاري التحميل...' : 'Loading reports...'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
          <RevenueByMonthCard isRTL={isRTL} data={data.revenue} />
          <AppointmentsStatusCard isRTL={isRTL} data={data.status} />
          <TopProceduresCard isRTL={isRTL} data={data.procedures} />
          <NewPatientsCard isRTL={isRTL} data={data.newPatients} />
          <RetentionCard isRTL={isRTL} data={data.retention} />
        </div>
      )}
    </div>
  )
}


// ─── Revenue by month ──────────────────────────────────────────────────────
function RevenueByMonthCard({ isRTL, data }) {
  const months = data?.months || []
  const series = data?.series || {}
  const currencies = Object.keys(series)

  const max = useMemo(() => {
    let m = 0
    for (const arr of Object.values(series)) for (const v of arr) if (v > m) m = v
    return m || 1
  }, [series])

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: C.primary, display: 'flex' }}>{Icons.dollar(16)}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {isRTL ? 'الإيرادات حسب الشهر' : 'Revenue by month'}
        </h3>
      </div>
      {currencies.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
          {isRTL ? 'لا توجد مدفوعات في النطاق' : 'No payments in range'}
        </div>
      ) : (
        <>
          {currencies.map(cur => {
            const total = series[cur].reduce((s, v) => s + v, 0)
            return (
              <div key={cur} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.4 }}>{cur}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total, cur)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: 4, alignItems: 'end', height: 80 }}>
                  {series[cur].map((v, i) => {
                    const pct = max > 0 ? (v / max) : 0
                    return (
                      <div key={i} title={`${shortMonth(months[i])}: ${formatMoney(v, cur)}`}
                        style={{
                          height: `${Math.max(2, pct * 100)}%`,
                          background: cur === 'USD' ? C.primary : '#22c55e',
                          borderRadius: 3,
                          opacity: v === 0 ? 0.18 : 1,
                          transition: 'height .2s',
                        }} />
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: 4, marginTop: 4 }}>
            {months.map((m, i) => (
              <div key={i} style={{ fontSize: 9, color: C.textMuted, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {shortMonth(m)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


// ─── Appointments by status ────────────────────────────────────────────────
function AppointmentsStatusCard({ isRTL, data }) {
  const total = data?.total || 0
  const STATUSES = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: C.primary, display: 'flex' }}>{Icons.calendar(16)}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {isRTL ? 'المواعيد حسب الحالة' : 'Appointments by status'}
        </h3>
        <span style={{ marginInlineStart: 'auto', fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {total} {isRTL ? 'إجمالي' : 'total'}
        </span>
      </div>
      {total === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
          {isRTL ? 'لا توجد مواعيد في النطاق' : 'No appointments in range'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STATUSES.map(s => {
            const def = STATUS_STYLE[s]
            const count = data?.[s] || 0
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: def.color, minWidth: 100 }}>
                  {isRTL ? def.ar : def.en}
                </span>
                <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: def.color, transition: 'width .2s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>{count}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ─── Top procedures ────────────────────────────────────────────────────────
function TopProceduresCard({ isRTL, data }) {
  const rows = data || []
  const max = rows.length > 0 ? Math.max(...rows.map(r => r.total_amount_minor)) : 1

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: C.primary, display: 'flex' }}>{Icons.barChart(16)}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {isRTL ? 'أكثر الإجراءات' : 'Top procedures'}
        </h3>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
          {isRTL ? 'لا توجد بنود علاج في النطاق' : 'No treatment items in range'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => {
            const pct = max > 0 ? (r.total_amount_minor / max) * 100 : 0
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.procedure_label}
                  <span style={{ marginInlineStart: 6, fontSize: 10, color: C.textMuted, fontWeight: 500 }}>({r.count})</span>
                </span>
                <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: C.primary, transition: 'width .2s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>
                  {formatMoney(r.total_amount_minor, r.currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ─── New patients by month ─────────────────────────────────────────────────
function NewPatientsCard({ isRTL, data }) {
  const months = data?.months || []
  const counts = data?.counts || []
  const max = counts.length > 0 ? Math.max(1, ...counts) : 1
  const total = counts.reduce((s, v) => s + v, 0)

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: C.primary, display: 'flex' }}>{Icons.users(16)}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {isRTL ? 'مرضى جدد حسب الشهر' : 'New patients by month'}
        </h3>
        <span style={{ marginInlineStart: 'auto', fontSize: 12, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {total} {isRTL ? 'إجمالي' : 'total'}
        </span>
      </div>
      {months.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
          {isRTL ? 'لا توجد بيانات' : 'No data'}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: 4, alignItems: 'end', height: 80 }}>
            {counts.map((v, i) => {
              const pct = max > 0 ? (v / max) : 0
              return (
                <div key={i} title={`${shortMonth(months[i])}: ${v}`}
                  style={{
                    height: `${Math.max(3, pct * 100)}%`,
                    background: C.primary,
                    borderRadius: 3,
                    opacity: v === 0 ? 0.2 : 1,
                  }} />
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: 4, marginTop: 4 }}>
            {months.map((m, i) => (
              <div key={i} style={{ fontSize: 9, color: C.textMuted, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {shortMonth(m)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


// ─── Patient retention ─────────────────────────────────────────────────────
function RetentionCard({ isRTL, data }) {
  const recent = data?.recent || 0
  const lapsed = data?.lapsed || 0
  const total = data?.total || 0
  const days = data?.recentDays || 90
  const recentPct = total > 0 ? Math.round((recent / total) * 100) : 0

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: C.primary, display: 'flex' }}>{Icons.trendUp(16)}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {isRTL ? 'احتفاظ المرضى' : 'Patient retention'}
        </h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {recentPct}%
        </span>
        <span style={{ fontSize: 12, color: C.textMuted }}>
          {isRTL ? `زاروا في آخر ${days} يوم` : `seen in the last ${days} days`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {isRTL ? 'نشطون' : 'Active'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{recent}</div>
        </div>
        <div style={{ flex: 1, padding: 12, borderRadius: 8, background: 'rgba(148,163,184,0.15)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {isRTL ? 'منقطعون' : 'Lapsed'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{lapsed}</div>
        </div>
        <div style={{ flex: 1, padding: 12, borderRadius: 8, background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {isRTL ? 'الإجمالي' : 'Total'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
        </div>
      </div>
    </div>
  )
}
