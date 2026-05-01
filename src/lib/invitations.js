import { supabase, isSupabaseConfigured } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeEmail, sanitizeText } from './sanitize'

// App URL used in the invite link shown to the admin. Override with
// VITE_APP_URL in the environment if the deployment URL changes.
export const APP_URL =
  (import.meta.env && import.meta.env.VITE_APP_URL) ||
  'https://velo-crm-coral.vercel.app'

const PENDING_INVITE_KEY = 'velo_pending_invite'

export function rememberPendingInvite(token) {
  try { localStorage.setItem(PENDING_INVITE_KEY, String(token)) } catch {}
}
export function getPendingInvite() {
  try { return localStorage.getItem(PENDING_INVITE_KEY) || null } catch { return null }
}
export function clearPendingInvite() {
  try { localStorage.removeItem(PENDING_INVITE_KEY) } catch {}
}

// Admin creates an invitation. Returns the full row (incl. token), which the
// caller turns into a /join link for the admin to copy-paste.
export async function createInvitation({ orgId, email, role }) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured')
  const user = await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (!orgId) throw new Error('createInvitation: orgId is required')
  if (orgId !== myOrgId) {
    throw new Error('createInvitation: org_id mismatch with current session')
  }

  const safeEmail = sanitizeEmail(email || '')
  const safeRole = sanitizeText(role || 'member', 32)
  const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : undefined // let the DB default fill it
  const payload = {
    org_id: orgId,
    email: safeEmail,
    role: safeRole,
    invited_by: user.id,
  }
  if (token) payload.token = token
  const { data, error } = await supabase
    .from('invitations')
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'invitation.create',
    entityType: 'invitation',
    entityId: data?.id || null,
    payload: { email: safeEmail, role: safeRole },
  })

  return data
}

export function buildInviteUrl(token, email) {
  const params = new URLSearchParams({ token })
  if (email) params.set('email', email)
  return `${APP_URL}/join?${params.toString()}`
}

export async function listPendingInvitations(orgId) {
  if (!isSupabaseConfigured() || !orgId) return []
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('listPendingInvitations: org_id mismatch with current session')
  }
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function revokeInvitation(id) {
  if (!isSupabaseConfigured()) return
  if (!id) throw new Error('revokeInvitation: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'invitation.revoke',
    entityType: 'invitation',
    entityId: id,
  })
}

// Called on the /join page (unauthenticated). Returns { orgName, email, role }
// or null if the token is invalid / expired.
export async function getInvitationPreview(token) {
  if (!isSupabaseConfigured() || !token) return null
  const { data, error } = await supabase.rpc('get_invitation_preview', {
    invite_token: token,
  })
  // Errors here usually mean a bad / expired token — return null so the UI
  // can fall back to the generic "your invite link is invalid" state.
  if (error) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { orgName: row.org_name, email: row.invite_email, role: row.invite_role }
}

// Called after the invitee signs in/signs up. Assigns their profile to the
// inviting org and deletes the token. Returns { orgId, orgName, role }.
export async function acceptInvitation(token) {
  if (!isSupabaseConfigured() || !token) throw new Error('Invalid token')
  const { data, error } = await supabase.rpc('accept_invitation', {
    invite_token: token,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Invitation not applied')
  return { orgId: row.assigned_org_id, orgName: row.org_name, role: row.assigned_role }
}
