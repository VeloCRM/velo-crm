/**
 * Velo CRM — profile / team-member helpers.
 *
 * The `profiles` row is owned by the auth user. Self-edit allowed (RLS-
 * enforced); role/org_id mutation is operator-only via the triggers
 * declared in schema.sql. Doctor demotion goes through `demoteDoctor`.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeProfileUpdate(updates) {
  const out = {}
  if (updates.full_name !== undefined) out.full_name = sanitizeText(updates.full_name, LIMITS.name)
  if (updates.specialization !== undefined) out.specialization = sanitizeText(updates.specialization, 100)
  if (updates.color !== undefined) out.color = sanitizeText(updates.color, 16)
  if (updates.phone !== undefined) out.phone = sanitizeText(updates.phone, LIMITS.phone)
  if (updates.is_active !== undefined) out.is_active = !!updates.is_active
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
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Read the current user's org_id. Thin wrapper kept for ergonomics; most
 * helpers should call `getCurrentOrgId` from auth_session directly.
 */
export async function fetchMyOrgId() {
  return getCurrentOrgId()
}

/**
 * List doctors (profiles with role='doctor') in the caller's org. Optional
 * filter by is_active.
 */
export async function listDoctorsInOrg({ activeOnly = false } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  let query = supabase
    .from('profiles')
    .select('id, full_name, specialization, color, phone, is_active, role')
    .eq('org_id', orgId)
    .eq('role', 'doctor')
  if (activeOnly) query = query.eq('is_active', true)
  query = query.order('full_name')
  const { data, error } = await query
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
    .select('id, full_name, email, role, color, specialization, is_active')
    .eq('org_id', orgId)
    .order('full_name', { nullsFirst: false })
  if (error) throw error
  return data || []
}

/**
 * Update a profile row. The caller must be either:
 *   - the profile's owner (self-update), or
 *   - in the same org (e.g. an owner editing a team member's display info).
 *
 * Trigger `enforce_profile_immutable_fields` blocks role/org_id changes by
 * non-operators. Audit-logged.
 */
export async function updateProfile(profileId, updates) {
  if (!profileId) throw new Error('updateProfile: profileId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Defense in depth: caller-supplied row must belong to the caller's org.
  // Without this, a misconfigured RLS policy could allow cross-tenant edits.
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

/**
 * Demote a doctor to plain member. Used by the Settings → Doctors page.
 * RLS + the immutable-fields trigger limit who can do this; we additionally
 * scope by org_id and audit-log it.
 */
export async function demoteDoctor(profileId) {
  if (!profileId) throw new Error('demoteDoctor: profileId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('profiles')
    .update({ role: 'member' })
    .eq('id', profileId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'profile.demote_doctor',
    entityType: 'profile',
    entityId: profileId,
  })
}
