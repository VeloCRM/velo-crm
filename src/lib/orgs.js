/**
 * Velo CRM — org settings helpers (new schema).
 *
 * Targets the `orgs` table (was `organizations`). Schema columns:
 *   id, name, slug, locale, currency, timezone, status, operator_notes,
 *   created_by_operator_id, created_at.
 *
 * Legacy `tagline` and `industry` columns from the old schema do not exist
 * on the new table; updates that include them will be rejected by Postgres.
 *
 * The legacy `departments` table is gone — `insertDepartments` was deleted.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeOrgUpdate(updates) {
  const out = {}
  if (updates.name !== undefined) out.name = sanitizeText(updates.name, LIMITS.name)
  if (updates.slug !== undefined) out.slug = sanitizeText(updates.slug, 64)
  if (updates.timezone !== undefined) out.timezone = sanitizeText(updates.timezone, 64)
  if (updates.locale !== undefined) out.locale = sanitizeText(updates.locale, 8)
  if (updates.currency !== undefined) out.currency = sanitizeText(updates.currency, 8)
  if (updates.operator_notes !== undefined) out.operator_notes = sanitizeText(updates.operator_notes, 2000)
  return out
}

/**
 * Update an org row. `orgId` must equal the caller's current org_id (or the
 * caller must be an operator — RLS enforces this independently).
 */
export async function updateOrgSettings(orgId, updates) {
  await requireUser()
  if (!orgId) throw new Error('updateOrgSettings: orgId is required')
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('updateOrgSettings: org_id mismatch with current session')
  }

  const sanitized = sanitizeOrgUpdate(updates)

  const { data, error } = await supabase
    .from('orgs')
    .update(sanitized)
    .eq('id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'org.update',
    entityType: 'org',
    entityId: orgId,
    payload: { fields: Object.keys(sanitized) },
  })

  return data
}
