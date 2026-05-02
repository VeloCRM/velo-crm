/**
 * Velo CRM — dashboard query helpers (new schema).
 *
 * Powers DentalDashboard's stats panel. Returns the rows the page needs in
 * one round-trip so the page doesn't pierce the lib/ boundary.
 *
 * The legacy `deals` table is gone; the "active deals" stat is dropped.
 * `payments` no longer has a `status` column (every recorded payment is
 * paid by definition); the "pending payments" stat is dropped too.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'

/**
 * @param {object} args
 * @param {string} args.dayStartIso  - ISO timestamp marking start-of-today (UTC) for `scheduled_at` filtering
 * @param {string} args.dayEndIso    - ISO timestamp marking end-of-today (UTC, exclusive)
 * @param {string} args.firstOfMonthIso - ISO timestamp at the first of the current month
 * @returns {object} {
 *   appointmentsToday: row[],
 *   recentPatients:    row[],   // 5 most recent
 *   newPatientsThisMonth: number,
 *   totalPatients:     number,
 * }
 */
export async function fetchDentalDashboardStats({ dayStartIso, dayEndIso, firstOfMonthIso } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()

  if (!dayStartIso || !dayEndIso || !firstOfMonthIso) {
    throw new Error(
      'fetchDentalDashboardStats: dayStartIso, dayEndIso, and firstOfMonthIso are required'
    )
  }

  const [
    apptsRes,
    recentRes,
    newThisMonthRes,
    totalPatientsRes,
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, patient_id, doctor_id, type, status, scheduled_at, duration_minutes, chair_id, notes, patients:patient_id(id, full_name, phone)')
      .eq('org_id', orgId)
      .gte('scheduled_at', dayStartIso)
      .lt('scheduled_at', dayEndIso)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('patients')
      .select('id, full_name, phone, email, dob, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', firstOfMonthIso),
    supabase
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])

  if (apptsRes.error) throw apptsRes.error
  if (recentRes.error) throw recentRes.error
  if (newThisMonthRes.error) throw newThisMonthRes.error
  if (totalPatientsRes.error) throw totalPatientsRes.error

  return {
    appointmentsToday: apptsRes.data || [],
    recentPatients: recentRes.data || [],
    newPatientsThisMonth: newThisMonthRes.count ?? 0,
    totalPatients: totalPatientsRes.count ?? 0,
  }
}
