/**
 * Velo CRM — ReportsPage (Liquid Glass restyle, Phase 2.4).
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
import { GlassCard, Button } from '../components/ui'
import { KPICard } from '../components/ds/KPICard'
import { ChartCard } from '../components/ds/ChartCard'

const RANGES = [
  { id: '30d', days: 30,  en: 'Last 30 days',   ar: 'آخر ٣٠ يوم' },
  { id: '90d', days: 90,  en: 'Last 90 days',   ar: 'آخر ٩٠ يوم' },
  { id: '6m',  days: 180, en: 'Last 6 months',  ar: 'آخر ٦ أشهر' },
  { id: '1y',  days: 365, en: 'Last 12 months', ar: 'آخر ١٢ شهر' },
]

// Desaturated, semantically-grouped palette tuned for the white Liquid Glass
// canvas. Keep success greenish, danger reddish — do NOT swap meanings to
// match aesthetics.
const STATUS_STYLE = {
  scheduled:   { fg: '#b45309', bg: 'rgba(180, 83,  9,  0.10)', en: 'Scheduled',   ar: 'مجدول' },
  confirmed:   { fg: '#0891B2', bg: 'rgba( 8, 145,178,  0.10)', en: 'Confirmed',   ar: 'مؤكد' },
  in_progress: { fg: '#1B4477', bg: 'rgba(27, 68, 119, 0.10)',  en: 'In Progress', ar: 'قيد التنفيذ' },
  completed:   { fg: '#059669', bg: 'rgba( 5, 150,105, 0.10)',  en: 'Completed',   ar: 'مكتمل' },
  no_show:     { fg: '#64748B', bg: 'rgba(100,116,139, 0.10)',  en: 'No-show',     ar: 'لم يحضر' },
  cancelled:   { fg: '#B91C42', bg: 'rgba(185, 28, 66, 0.10)',  en: 'Cancelled',   ar: 'ملغي' },
}

// Bar colors for revenue series — USD navy primary, IQD cyan accent.
const CURRENCY_BAR = {
  USD: '#103562',  // navy-700
  IQD: '#06B6D4',  // accent-cyan-500
}
function currencyBarColor(cur) {
  return CURRENCY_BAR[cur] || '#1B4477'
}

function rangeFromIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function nowIso() { return new Date().toISOString() }

function shortMonth(ymd, isRTL) {
  if (!ymd) return ''
  const [y, m] = ymd.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(isRTL ? 'ar-IQ' : undefined, { month: 'short' })
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

  // Derived KPI values pulled from already-loaded report data — no extra
  // queries, no new math (sums and counts only). Currency totals come from
  // the same series the revenue chart renders, so the KPI and chart can
  // never disagree.
  const kpi = useMemo(() => {
    const series = data.revenue?.series || {}
    const revenuePerCurrency = Object.keys(series).map(cur => ({
      currency: cur,
      total: (series[cur] || []).reduce((s, v) => s + (Number(v) || 0), 0),
    }))
    const apptTotal = data.status?.total || 0
    const newPatientsTotal = (data.newPatients?.counts || []).reduce((s, v) => s + (Number(v) || 0), 0)
    const retention = data.retention || null
    const retentionPct = retention && retention.total > 0
      ? Math.round((retention.recent / retention.total) * 100)
      : 0
    return { revenuePerCurrency, apptTotal, newPatientsTotal, retentionPct }
  }, [data])

  const rangeMeta = RANGES.find(r => r.id === rangeId) || RANGES[1]
  const rangeLabel = isRTL ? rangeMeta.ar : rangeMeta.en

  return (
    <div dir={dir} className="ds-root min-h-full p-6 md:p-8">
      {/* Header + range filter */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[28px] font-semibold text-navy-800 m-0 leading-tight tracking-tight">
            {isRTL ? 'التقارير' : 'Reports'}
          </h1>
          <p className="text-sm text-navy-600 mt-1.5 mb-0">
            {isRTL ? 'لمحة سريعة على أداء العيادة' : 'Snapshot of clinic performance'}
          </p>
        </div>
        <div
          role="tablist"
          aria-label={isRTL ? 'النطاق الزمني' : 'Date range'}
          className="flex flex-wrap gap-1.5"
        >
          {RANGES.map(r => (
            <Button
              key={r.id}
              variant={rangeId === r.id ? 'primary' : 'secondary'}
              size="sm"
              role="tab"
              aria-selected={rangeId === r.id}
              onClick={() => setRangeId(r.id)}
            >
              {isRTL ? r.ar : r.en}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <GlassCard padding="md" className="mb-6 border-rose-200 bg-rose-50/70">
          <div className="text-sm text-rose-700 font-medium">{error}</div>
        </GlassCard>
      )}

      {loading ? (
        <GlassCard padding="lg" className="text-center">
          <div className="text-sm text-navy-500">
            {isRTL ? 'جاري تحميل التقارير...' : 'Loading reports...'}
          </div>
        </GlassCard>
      ) : (
        <>
          {/* KPI overview */}
          <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              icon={Icons.dollar}
              label={isRTL ? 'الإيرادات' : 'Revenue'}
              value={
                kpi.revenuePerCurrency.length === 0 ? (
                  <span className="text-2xl text-navy-400 font-medium">—</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {kpi.revenuePerCurrency.map(({ currency, total }) => (
                      <div key={currency} className="flex items-baseline gap-2">
                        <span
                          className={`${total === 0 ? 'text-navy-400 font-medium' : 'text-navy-900 font-semibold'} text-lg`}
                          style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
                        >
                          {formatMoney(total, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }
              hint={rangeLabel}
            />
            <KPICard
              icon={Icons.calendar}
              label={isRTL ? 'المواعيد' : 'Appointments'}
              value={kpi.apptTotal.toLocaleString(isRTL ? 'ar-IQ' : undefined)}
              hint={rangeLabel}
            />
            <KPICard
              icon={Icons.users}
              label={isRTL ? 'مرضى جدد' : 'New patients'}
              value={kpi.newPatientsTotal.toLocaleString(isRTL ? 'ar-IQ' : undefined)}
              hint={rangeLabel}
            />
            <KPICard
              icon={Icons.trendUp}
              label={isRTL ? 'الاحتفاظ' : 'Retention'}
              value={`${kpi.retentionPct}%`}
              hint={
                data.retention
                  ? (isRTL
                      ? `زاروا في آخر ${data.retention.recentDays || 90} يوم`
                      : `seen in the last ${data.retention.recentDays || 90} days`)
                  : ''
              }
            />
          </div>

          {/* Chart grid */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <RevenueByMonthCard isRTL={isRTL} data={data.revenue} />
            <AppointmentsStatusCard isRTL={isRTL} data={data.status} />
            <TopProceduresCard isRTL={isRTL} data={data.procedures} />
            <NewPatientsCard isRTL={isRTL} data={data.newPatients} />
            <RetentionCard isRTL={isRTL} data={data.retention} />
          </div>
        </>
      )}
    </div>
  )
}


// ─── Revenue by month ──────────────────────────────────────────────────────
function RevenueByMonthCard({ isRTL, data }) {
  const months = data?.months || []
  const series = data?.series || {}
  const currencies = Object.keys(series)

  // Per-currency max so each currency's bars use its own scale (mixing IQD
  // and USD on a single axis is meaningless — IQD numbers dwarf USD).
  const perCurrencyMax = useMemo(() => {
    const out = {}
    for (const cur of currencies) {
      let m = 0
      for (const v of series[cur] || []) if (v > m) m = v
      out[cur] = m || 1
    }
    return out
  }, [series, currencies])

  return (
    <ChartCard icon={Icons.dollar} title={isRTL ? 'الإيرادات حسب الشهر' : 'Revenue by month'}>
      {currencies.length === 0 ? (
        <ChartEmpty>{isRTL ? 'لا توجد مدفوعات في النطاق' : 'No payments in range'}</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          {currencies.map(cur => {
            const total = series[cur].reduce((s, v) => s + v, 0)
            const max = perCurrencyMax[cur]
            const bar = currencyBarColor(cur)
            return (
              <div key={cur}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10.5px] font-semibold text-navy-600 uppercase tracking-[0.08em]">
                    {cur}
                  </span>
                  <span
                    className={`text-[12px] font-semibold ${total === 0 ? 'text-navy-400' : 'text-navy-800'}`}
                    style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
                  >
                    {formatMoney(total, cur)}
                  </span>
                </div>
                <div
                  className="grid items-end h-24 gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
                >
                  {series[cur].map((v, i) => {
                    const pct = max > 0 ? (v / max) : 0
                    return (
                      <div
                        key={i}
                        title={`${shortMonth(months[i], isRTL)}: ${formatMoney(v, cur)}`}
                        className="rounded-[3px] transition-all duration-300"
                        style={{
                          height: `${Math.max(2, pct * 100)}%`,
                          background: v === 0
                            ? 'rgba(15,23,42,0.10)'
                            : `linear-gradient(180deg, ${bar}E6 0%, ${bar} 100%)`,
                          opacity: v === 0 ? 0.6 : 1,
                          boxShadow: v === 0 ? 'none' : `0 1px 3px ${bar}33`,
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div
            className="grid gap-1.5 mt-1"
            style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
          >
            {months.map((m, i) => (
              <div
                key={i}
                className="text-[9.5px] text-navy-500 text-center"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {shortMonth(m, isRTL)}
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  )
}


// ─── Appointments by status ────────────────────────────────────────────────
function AppointmentsStatusCard({ isRTL, data }) {
  const total = data?.total || 0
  const STATUSES = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']

  return (
    <ChartCard
      icon={Icons.calendar}
      title={isRTL ? 'المواعيد حسب الحالة' : 'Appointments by status'}
      right={
        total > 0
          ? (isRTL ? `${total} إجمالي` : `${total} total`)
          : null
      }
    >
      {total === 0 ? (
        <ChartEmpty>{isRTL ? 'لا توجد مواعيد في النطاق' : 'No appointments in range'}</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {STATUSES.map(s => {
            const def = STATUS_STYLE[s]
            const count = data?.[s] || 0
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: def.fg }}
                    aria-hidden="true"
                  />
                  <span className="text-[12px] font-medium text-navy-700">
                    {isRTL ? def.ar : def.en}
                  </span>
                </div>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(15,23,42,0.06)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: def.fg }}
                  />
                </div>
                <span
                  className="text-[12px] font-semibold text-navy-800 min-w-[2.25rem]"
                  style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}
                >
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}


// ─── Top procedures ────────────────────────────────────────────────────────
function TopProceduresCard({ isRTL, data }) {
  const rows = data || []
  const max = rows.length > 0 ? Math.max(...rows.map(r => Number(r.total_amount_minor) || 0)) : 1

  return (
    <ChartCard icon={Icons.barChart} title={isRTL ? 'أكثر الإجراءات' : 'Top procedures'}>
      {rows.length === 0 ? (
        <ChartEmpty>{isRTL ? 'لا توجد بنود علاج في النطاق' : 'No treatment items in range'}</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => {
            const amount = Number(r.total_amount_minor) || 0
            const pct = max > 0 ? (amount / max) * 100 : 0
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-navy-800 flex-1 min-w-0 truncate">
                  {r.procedure_label}
                  <span className="ms-1.5 text-[10.5px] text-navy-500 font-normal">
                    ({r.count})
                  </span>
                </span>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(15,23,42,0.06)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, #1B4477 0%, #103562 100%)',
                    }}
                  />
                </div>
                <span
                  className={`text-[12px] font-semibold min-w-[6rem] ${amount === 0 ? 'text-navy-400' : 'text-navy-800'}`}
                  style={{ fontVariantNumeric: 'tabular-nums lining-nums', textAlign: 'end' }}
                >
                  {formatMoney(r.total_amount_minor, r.currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}


// ─── New patients by month ─────────────────────────────────────────────────
function NewPatientsCard({ isRTL, data }) {
  const months = data?.months || []
  const counts = data?.counts || []
  const max = counts.length > 0 ? Math.max(1, ...counts) : 1
  const total = counts.reduce((s, v) => s + v, 0)

  return (
    <ChartCard
      icon={Icons.users}
      title={isRTL ? 'مرضى جدد حسب الشهر' : 'New patients by month'}
      right={
        total > 0
          ? (isRTL ? `${total} إجمالي` : `${total} total`)
          : null
      }
    >
      {months.length === 0 ? (
        <ChartEmpty>{isRTL ? 'لا توجد بيانات' : 'No data'}</ChartEmpty>
      ) : (
        <>
          <div
            className="grid items-end h-24 gap-1.5"
            style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
          >
            {counts.map((v, i) => {
              const pct = max > 0 ? (v / max) : 0
              return (
                <div
                  key={i}
                  title={`${shortMonth(months[i], isRTL)}: ${v}`}
                  className="rounded-[3px] transition-all duration-300"
                  style={{
                    height: `${Math.max(3, pct * 100)}%`,
                    background: v === 0
                      ? 'rgba(15,23,42,0.10)'
                      : 'linear-gradient(180deg, #22D3EE 0%, #06B6D4 100%)',
                    boxShadow: v === 0 ? 'none' : '0 1px 3px rgba(6,182,212,0.25)',
                    opacity: v === 0 ? 0.6 : 1,
                  }}
                />
              )
            })}
          </div>
          <div
            className="grid gap-1.5 mt-2"
            style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
          >
            {months.map((m, i) => (
              <div
                key={i}
                className="text-[9.5px] text-navy-500 text-center"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {shortMonth(m, isRTL)}
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  )
}


// ─── Patient retention ─────────────────────────────────────────────────────
function RetentionCard({ isRTL, data }) {
  const recent = data?.recent || 0
  const lapsed = data?.lapsed || 0
  const total = data?.total || 0
  const days = data?.recentDays || 90
  const recentPct = total > 0 ? Math.round((recent / total) * 100) : 0
  const lapsedPct = total > 0 ? Math.round((lapsed / total) * 100) : 0

  return (
    <ChartCard icon={Icons.trendUp} title={isRTL ? 'احتفاظ المرضى' : 'Patient retention'}>
      {total === 0 ? (
        <ChartEmpty>{isRTL ? 'لا توجد بيانات' : 'No data'}</ChartEmpty>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className="text-3xl font-semibold text-navy-900"
              style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
            >
              {recentPct}%
            </span>
            <span className="text-[12px] text-navy-500">
              {isRTL ? `زاروا في آخر ${days} يوم` : `seen in the last ${days} days`}
            </span>
          </div>

          {/* Stacked bar: active vs lapsed share of total */}
          <div className="h-2 rounded-full overflow-hidden flex mb-4" style={{ background: 'rgba(15,23,42,0.06)' }}>
            <div
              style={{ width: `${recentPct}%`, background: '#059669' }}
              className="h-full transition-[width] duration-300"
            />
            <div
              style={{ width: `${lapsedPct}%`, background: '#94A3B8' }}
              className="h-full transition-[width] duration-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <RetentionStat
              label={isRTL ? 'نشطون' : 'Active'}
              value={recent}
              fg="#047857"
              bg="rgba(5,150,105,0.08)"
            />
            <RetentionStat
              label={isRTL ? 'منقطعون' : 'Lapsed'}
              value={lapsed}
              fg="#475569"
              bg="rgba(100,116,139,0.10)"
            />
            <RetentionStat
              label={isRTL ? 'الإجمالي' : 'Total'}
              value={total}
              fg="#0A2540"
              bg="rgba(10,37,64,0.06)"
            />
          </div>
        </>
      )}
    </ChartCard>
  )
}

function RetentionStat({ label, value, fg, bg }) {
  return (
    <div className="rounded-glass p-3" style={{ background: bg }}>
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1"
        style={{ color: fg }}
      >
        {label}
      </div>
      <div
        className="text-lg font-semibold"
        style={{ color: fg, fontVariantNumeric: 'tabular-nums lining-nums' }}
      >
        {value}
      </div>
    </div>
  )
}


// ─── Empty state used inside chart cards ───────────────────────────────────
function ChartEmpty({ children }) {
  return (
    <div className="py-10 text-center text-[12.5px] text-navy-500">
      {children}
    </div>
  )
}
