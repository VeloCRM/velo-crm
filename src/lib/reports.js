/**
 * Velo CRM — reports helpers.
 *
 * Reports query a few denormalized projections of the same tables that power
 * the rest of the app. Today there's only one direct query (doctors filter);
 * keeping the surface area open for the rest of the reports work.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'

/**
 * Fetch all doctors in the caller's org. Slimmer projection than the
 * Settings/Doctors fetch so it can be used in report filters.
 */
export async function fetchDoctorsForReports() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, color')
    .eq('org_id', orgId)
    .eq('role', 'doctor')
  if (error) throw error
  return data || []
}

/**
 * Fetch the rolled-up rows for the monthly reports view: appointments,
 * paid payments, and the doctor lookup. Aggregation is client-side; this
 * helper keeps every query inside lib/ for the lint/architecture rule.
 */
export async function fetchMonthlyReports({ fromDate }) {
  if (!fromDate) throw new Error('fetchMonthlyReports: fromDate is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const [apptsRes, paymentsRes, doctorsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, doctor_id, type, appointment_date')
      .eq('org_id', orgId)
      .gte('appointment_date', fromDate),
    supabase
      .from('payments')
      .select('amount, currency, status, payment_date, created_at')
      .eq('org_id', orgId)
      .eq('status', 'paid')
      .gte('payment_date', fromDate),
    supabase
      .from('profiles')
      .select('id, full_name, color')
      .eq('org_id', orgId)
      .eq('role', 'doctor'),
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
