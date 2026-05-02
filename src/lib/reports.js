/**
 * Velo CRM — reports helpers (new schema).
 *
 * Reports query denormalized projections of the same tables that power the
 * rest of the app. New-schema column names:
 *   appointments.scheduled_at   (timestamptz)
 *   payments.recorded_at        (timestamptz)
 *   payments.amount_minor       (bigint)
 *   treatment_plan_items.amount_minor + procedure_label
 *   patients.created_at         (timestamptz)
 *
 * Every query is org-scoped via `.eq('org_id', orgId)` for defense in depth
 * on top of RLS. None of these helpers writes — read-only by design.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'

/** Fetch all clinicians in the caller's org for filter UIs. Includes owners
 * because in small dental clinics the owner is also a practicing dentist. */
export async function fetchDoctorsForReports() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', orgId)
    .in('role', ['owner', 'doctor'])
  if (error) throw error
  return data || []
}

/**
 * Rolled-up rows for the older monthly-summary panel: appointments scheduled
 * in the window, payments recorded in the window, and the doctor lookup.
 *
 * Kept for backwards compatibility with anything still using it. New report
 * cards use the focused per-report helpers below.
 */
export async function fetchMonthlyReports({ fromIso } = {}) {
  if (!fromIso) throw new Error('fetchMonthlyReports: fromIso is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const [apptsRes, paymentsRes, doctorsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, doctor_id, type, scheduled_at')
      .eq('org_id', orgId)
      .gte('scheduled_at', fromIso),
    supabase
      .from('payments')
      .select('amount_minor, currency, recorded_at, created_at')
      .eq('org_id', orgId)
      .gte('recorded_at', fromIso),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', orgId)
      .in('role', ['owner', 'doctor']),
  ])

  if (apptsRes.error) throw apptsRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (doctorsRes.error) throw doctorsRes.error

  return {
    appointments: apptsRes.data || [],
    payments: paymentsRes.data || [],
    doctors: doctorsRes.data || [],
  }
}


// ─── Per-report helpers ────────────────────────────────────────────────────
// Each takes { fromIso, toIso } and returns a cleanly-shaped object the page
// can pipe straight into a chart. We don't try to do the time-bucket grouping
// in SQL (no date_trunc via PostgREST without an RPC) — group in JS.

function _isoMonth(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Revenue by month, split by currency. Sums payments.amount_minor and groups
 * by month bucket (YYYY-MM). Returns:
 *   { months: ['2026-01', '2026-02', ...],
 *     series: { USD: [123, 456, ...], IQD: [...] } }
 */
export async function fetchRevenueByMonth({ fromIso, toIso } = {}) {
  if (!fromIso) throw new Error('fetchRevenueByMonth: fromIso is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  let q = supabase
    .from('payments')
    .select('amount_minor, currency, recorded_at')
    .eq('org_id', orgId)
    .gte('recorded_at', fromIso)
  if (toIso) q = q.lte('recorded_at', toIso)

  const { data, error } = await q
  if (error) throw error

  // Build the month list spanning [fromIso, toIso] inclusive so the chart has
  // empty months too (avoids gaps that hide zero-revenue months).
  const start = new Date(fromIso); start.setDate(1); start.setHours(0,0,0,0)
  const end = toIso ? new Date(toIso) : new Date()
  const months = []
  const cursor = new Date(start)
  while (cursor <= end) {
    months.push(_isoMonth(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const series = {}
  for (const row of data || []) {
    const m = _isoMonth(row.recorded_at)
    if (!m) continue
    const cur = row.currency || 'IQD'
    if (!series[cur]) series[cur] = Object.fromEntries(months.map(x => [x, 0]))
    series[cur][m] = (series[cur][m] || 0) + Number(row.amount_minor || 0)
  }
  // Convert each currency's map → array aligned with `months`.
  const seriesArrays = {}
  for (const cur of Object.keys(series)) {
    seriesArrays[cur] = months.map(m => series[cur][m] || 0)
  }
  return { months, series: seriesArrays }
}

/**
 * Appointment counts grouped by status, filtered to a scheduled_at window.
 * Returns { scheduled, confirmed, in_progress, completed, no_show, cancelled, total }.
 */
export async function fetchAppointmentsByStatus({ fromIso, toIso } = {}) {
  if (!fromIso) throw new Error('fetchAppointmentsByStatus: fromIso is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  let q = supabase
    .from('appointments')
    .select('status')
    .eq('org_id', orgId)
    .gte('scheduled_at', fromIso)
  if (toIso) q = q.lte('scheduled_at', toIso)

  const { data, error } = await q
  if (error) throw error

  const out = { scheduled: 0, confirmed: 0, in_progress: 0, completed: 0, no_show: 0, cancelled: 0, total: 0 }
  for (const row of data || []) {
    if (out[row.status] != null) out[row.status]++
    out.total++
  }
  return out
}

/**
 * Top procedures by total billed amount. Groups treatment_plan_items by
 * procedure_label, sums amount_minor, counts occurrences. Returns up to
 * `limit` rows sorted by total amount DESC.
 *
 * Since amount_minor across currencies isn't comparable, we split per-currency
 * and let the page render the dominant currency only (or pick the larger).
 */
export async function fetchTopProcedures({ fromIso, toIso, limit = 10 } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()

  let q = supabase
    .from('treatment_plan_items')
    .select('procedure_code, procedure_label, amount_minor, currency, created_at')
    .eq('org_id', orgId)
  if (fromIso) q = q.gte('created_at', fromIso)
  if (toIso) q = q.lte('created_at', toIso)

  const { data, error } = await q
  if (error) throw error

  // Group by (procedure_label, currency) so totals stay currency-honest.
  const groups = new Map()
  for (const row of data || []) {
    const label = row.procedure_label || row.procedure_code || '—'
    const cur = row.currency || 'IQD'
    const key = `${cur}|${label}`
    const g = groups.get(key) || { procedure_label: label, currency: cur, total_amount_minor: 0, count: 0 }
    g.total_amount_minor += Number(row.amount_minor || 0)
    g.count++
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => b.total_amount_minor - a.total_amount_minor)
    .slice(0, limit)
}

/**
 * New patients per month, bucketed by patients.created_at.
 * Returns { months: [...], counts: [...] } aligned 1:1.
 */
export async function fetchNewPatientsByMonth({ fromIso, toIso } = {}) {
  if (!fromIso) throw new Error('fetchNewPatientsByMonth: fromIso is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  let q = supabase
    .from('patients')
    .select('created_at')
    .eq('org_id', orgId)
    .gte('created_at', fromIso)
  if (toIso) q = q.lte('created_at', toIso)

  const { data, error } = await q
  if (error) throw error

  const start = new Date(fromIso); start.setDate(1); start.setHours(0,0,0,0)
  const end = toIso ? new Date(toIso) : new Date()
  const months = []
  const cursor = new Date(start)
  while (cursor <= end) {
    months.push(_isoMonth(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const bucket = Object.fromEntries(months.map(m => [m, 0]))
  for (const row of data || []) {
    const m = _isoMonth(row.created_at)
    if (m && bucket[m] != null) bucket[m]++
  }
  return { months, counts: months.map(m => bucket[m]) }
}

/**
 * Basic patient retention: how many patients had an appointment in the last
 * `recentDays` days, vs. patients who exist but had no recent appointment.
 *
 * Returns { recent, lapsed, total }.
 */
export async function fetchPatientRetention({ recentDays = 90 } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - recentDays)
  cutoff.setHours(0, 0, 0, 0)
  const cutoffIso = cutoff.toISOString()

  const [totalRes, recentApptRes] = await Promise.all([
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('appointments')
      .select('patient_id')
      .eq('org_id', orgId)
      .gte('scheduled_at', cutoffIso),
  ])
  if (totalRes.error) throw totalRes.error
  if (recentApptRes.error) throw recentApptRes.error

  const recentSet = new Set((recentApptRes.data || []).map(r => r.patient_id))
  const total = totalRes.count ?? 0
  const recent = recentSet.size
  const lapsed = Math.max(0, total - recent)
  return { recent, lapsed, total, recentDays }
}
