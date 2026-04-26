import { supabase, isSupabaseConfigured } from './supabase'

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
  const { data: user } = await supabase.auth.getUser()
  const invitedBy = user?.user?.id || null
  const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : undefined // let the DB default fill it
  const payload = {
    org_id: orgId,
    email: String(email || '').toLowerCase().trim(),
    role: role || 'member',
    invited_by: invitedBy,
  }
  if (token) payload.token = token
  const { data, error } = await supabase
    .from('invitations')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export function buildInviteUrl(token, email) {
  const params = new URLSearchParams({ token })
  if (email) params.set('email', email)
  return `${APP_URL}/join?${params.toString()}`
}

export async function listPendingInvitations(orgId) {
  if (!isSupabaseConfigured() || !orgId) return []
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
  const { error } = await supabase.from('invitations').delete().eq('id', id)
  if (error) throw error
}

// Called on the /join page (unauthenticated). Returns { orgName, email, role }
// or null if the token is invalid / expired.
export async function getInvitationPreview(token) {
  if (!isSupabaseConfigured() || !token) return null
  const { data, error } = await supabase.rpc('get_invitation_preview', {
    invite_token: token,
  })
  if (error) { console.warn('Invite preview error:', error); return null }
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
