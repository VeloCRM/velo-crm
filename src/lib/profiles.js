/**
 * Velo CRM — profile / team-member helpers (new schema).
 *
 * The `profiles` row is owned by the auth user. Schema columns:
 *   id, org_id, role, full_name, avatar_url, locale, created_at.
 *
 * Self-edit allowed (RLS-enforced). Role/org_id mutation is operator-only
 * via the `enforce_profile_immutable_fields` trigger declared in
 * src/lib/schema.sql.
 *
 * Legacy columns (specialization, color, phone, email, is_active) are gone.
 * Doctor demotion (`demoteDoctor`) was removed — operators manage roles
 * directly via /api/operator/* endpoints, not from clinic-side helpers.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeProfileUpdate(updates) {
  const out = {}
  if (updates.full_name !== undefined) out.full_name = sanitizeText(updates.full_name, LIMITS.name)
  if (updates.avatar_url !== undefined) out.avatar_url = sanitizeText(updates.avatar_url, 512)
  if (updates.locale !== undefined) out.locale = sanitizeText(updates.locale, 8)
  return out
}

/**
 * Read the current user's own profile row.
 */
export async function fetchMyProfile() {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, avatar_url, locale, created_at')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Read the current user's org_id. Thin wrapper kept for ergonomics.
 */
export async function fetchMyOrgId() {
  return getCurrentOrgId()
}

/**
 * List clinicians who can be assigned to appointments / treatments in the
 * caller's org. Includes both doctors and owners — in small Iraqi dental
 * clinics, the owner is typically the practicing dentist as well. Owner and
 * doctor remain distinct roles for permissions purposes; this is purely a
 * UI picker concern.
 */
export async function listDoctorsInOrg() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('org_id', orgId)
    .in('role', ['owner', 'doctor'])
    .order('full_name')
  if (error) throw error
  return data || []
}

/**
 * List team members (every profile in the caller's org).
 */
export async function listTeamMembersInOrg() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, locale, created_at')
    .eq('org_id', orgId)
    .order('full_name', { nullsFirst: false })
  if (error) throw error
  return data || []
}

/**
 * Update a profile row. The caller must be either:
 *   - the profile's owner (self-update — full_name / avatar_url / locale),
 *     or
 *   - an operator (RLS allows it).
 *
 * The `enforce_profile_immutable_fields` trigger blocks role/org_id changes
 * by non-operators server-side. Audit-logged.
 */
export async function updateProfile(profileId, updates) {
  if (!profileId) throw new Error('updateProfile: profileId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Defense in depth: caller-supplied row must belong to the caller's org.
  const { data: target, error: lookupErr } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', profileId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!target) throw new Error('updateProfile: profile not found in your org')

  const sanitized = sanitizeProfileUpdate(updates)

  const { data, error } = await supabase
    .from('profiles')
    .update(sanitized)
    .eq('id', profileId)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'profile.update',
    entityType: 'profile',
    entityId: profileId,
    payload: { fields: Object.keys(sanitized) },
  })

  return data
}
