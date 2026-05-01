/**
 * Velo CRM — org settings helpers.
 *
 * Targets the legacy `organizations` table for compatibility with current
 * pages; will be retargeted to `orgs` (new schema) when the cutover lands.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeOrgUpdate(updates) {
  const out = { ...updates }
  if (out.name !== undefined) out.name = sanitizeText(out.name, LIMITS.name)
  if (out.tagline !== undefined) out.tagline = sanitizeText(out.tagline, 200)
  if (out.industry !== undefined) out.industry = sanitizeText(out.industry, 50)
  if (out.timezone !== undefined) out.timezone = sanitizeText(out.timezone, 64)
  if (out.locale !== undefined) out.locale = sanitizeText(out.locale, 8)
  if (out.currency !== undefined) out.currency = sanitizeText(out.currency, 8)
  return out
}

/**
 * Update an org row. `orgId` must equal the caller's current org_id (or be
 * an org the caller is authorized for via RLS). Throws on mismatch.
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
    .from('organizations')
    .update(sanitized)
    .eq('id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'org.update',
    entityType: 'organization',
    entityId: orgId,
    payload: { fields: Object.keys(sanitized) },
  })

  return data
}

/**
 * Bulk-insert default departments for a new org during onboarding. Takes a
 * pre-built array of rows ([{ name, color, org_id }, ...]).
 */
export async function insertDepartments(orgId, rows) {
  await requireUser()
  if (!orgId) throw new Error('insertDepartments: orgId is required')
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertDepartments: org_id mismatch with current session')
  }

  const sanitized = (rows || []).map(r => ({
    ...r,
    org_id: orgId,
    name: sanitizeText(r.name || '', LIMITS.name),
  }))

  const { data, error } = await supabase
    .from('departments')
    .insert(sanitized)
    .select()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'department.bulk_insert',
    entityType: 'department',
    entityId: null,
    payload: { count: sanitized.length },
  })

  return data
}
