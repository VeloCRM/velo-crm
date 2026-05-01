/**
 * Velo CRM — dashboard query helpers.
 *
 * Powers DentalDashboard's stats panel. Bundles every parallel query into a
 * single helper so the page doesn't pierce the lib/ boundary.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'

/**
 * @returns {object} {
 *   appointmentsToday,
 *   recentContacts,
 *   newPatientsThisMonth,
 *   pendingPayments,
 *   activeDeals,
 *   totalContacts,
 * }
 */
export async function fetchDentalDashboardStats({ todayDate, firstOfMonthDate } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()

  if (!todayDate || !firstOfMonthDate) {
    throw new Error('fetchDentalDashboardStats: todayDate and firstOfMonthDate are required')
  }

  const [
    apptsRes,
    recentRes,
    newThisMonthRes,
    pendingRes,
    activeDealsRes,
    totalContactsRes,
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('org_id', orgId)
      .eq('appointment_date', todayDate)
      .order('appointment_time', { ascending: true }),
    supabase
      .from('contacts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', firstOfMonthDate),
    supabase
      .from('payments')
      .select('amount,status,contact_id,id')
      .eq('org_id', orgId)
      .in('status', ['pending', 'overdue']),
    supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('stage', 'in', '("won","lost")'),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])

  return {
    appointmentsToday: apptsRes.data || [],
    recentContacts: recentRes.data || [],
    newPatientsThisMonth: newThisMonthRes.count ?? 0,
    pendingPayments: pendingRes.data || [],
    activeDealsCount: activeDealsRes.count ?? 0,
    totalContacts: totalContactsRes.count ?? 0,
  }
}
