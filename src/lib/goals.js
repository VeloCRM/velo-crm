/**
 * Velo CRM — goals progress helpers.
 *
 * The schema does NOT yet have a `goals` table — goals are persisted in
 * localStorage on the page side. This file is just the read path: given a
 * goal type and a [from, to] window, compute the current value from the
 * patients / appointments / payments / treatment_plan_items tables.
 *
 * Phase 6 rigor: requireUser, getCurrentOrgId, defense-in-depth org filter,
 * no service-role key. Read-only — never mutates.
 *
 * Goal types:
 *   patients_seen        - distinct patient_id from appointments where
 *                          status='completed' and scheduled_at in window
 *   revenue_usd          - sum(payments.amount_minor) where currency='USD'
 *                          and recorded_at in window
 *   revenue_iqd          - sum(payments.amount_minor) where currency='IQD'
 *                          and recorded_at in window
 *   treatments_completed - count of treatment_plan_items with status='completed'
 *                          and created_at in window. (Schema has no
 *                          completed_at / updated_at on items, so we fall
 *                          back to created_at; documented imperfection.)
 *   new_patients         - count of patients with created_at in window
 *
 * computeGoalProgress returns either an integer count or an amount_minor
 * (for revenue_usd / revenue_iqd). The page is responsible for picking the
 * right unit/formatter.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'

export const GOAL_TYPES = [
  'patients_seen',
  'revenue_usd',
  'revenue_iqd',
  'treatments_completed',
  'new_patients',
]

const REVENUE_TYPES = new Set(['revenue_usd', 'revenue_iqd'])

export function isRevenueGoal(type) {
  return REVENUE_TYPES.has(type)
}

export function goalCurrency(type) {
  if (type === 'revenue_usd') return 'USD'
  if (type === 'revenue_iqd') return 'IQD'
  return null
}

/**
 * @param {object} args
 * @param {string} args.type
 * @param {string} args.fromIso
 * @param {string} args.toIso
 * @returns {Promise<number>} amount_minor for revenue goals; integer count
 *                             otherwise.
 */
export async function computeGoalProgress({ type, fromIso, toIso } = {}) {
  if (!type) throw new Error('computeGoalProgress: type is required')
  if (!fromIso || !toIso) throw new Error('computeGoalProgress: fromIso and toIso are required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  if (type === 'patients_seen') {
    const { data, error } = await supabase
      .from('appointments')
      .select('patient_id')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
    if (error) throw error
    const set = new Set((data || []).map(r => r.patient_id).filter(Boolean))
    return set.size
  }

  if (type === 'revenue_usd' || type === 'revenue_iqd') {
    const cur = type === 'revenue_usd' ? 'USD' : 'IQD'
    const { data, error } = await supabase
      .from('payments')
      .select('amount_minor')
      .eq('org_id', orgId)
      .eq('currency', cur)
      .gte('recorded_at', fromIso)
      .lte('recorded_at', toIso)
    if (error) throw error
    return (data || []).reduce((s, r) => s + Number(r.amount_minor || 0), 0)
  }

  if (type === 'treatments_completed') {
    const { data, error } = await supabase
      .from('treatment_plan_items')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
    if (error) throw error
    return (data || []).length
  }

  if (type === 'new_patients') {
    const { count, error } = await supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
    if (error) throw error
    return count ?? 0
  }

  throw new Error(`computeGoalProgress: unsupported type "${type}"`)
}
