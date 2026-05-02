/**
 * Velo CRM — invitations helpers (link-only flow).
 *
 * Owner generates a /join?token=... URL → owner shares it via WhatsApp /
 * email / etc. → invitee clicks the link → /join page calls
 * accept_invitation. No email infrastructure.
 *
 * Reads (listPendingInvitations) and the revoke UPDATE go through Supabase
 * directly with defense-in-depth org_id filtering. Writes (create) go
 * through /api/invitations/create so the server can do JWT verify, role
 * check (must be owner), test-org refusal, and audit logging in one place.
 *
 * The two RPCs (`get_invitation_preview`, `accept_invitation`) are
 * SECURITY DEFINER on the database — see schema.sql for the function
 * definitions. Helpers wrap them.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'

// ─── Build the invite URL the owner shares ──────────────────────────────────
//
// Pure function. Uses VITE_APP_URL when set (production builds), falls back
// to window.location.origin in dev/preview where the env var isn't pinned.

const APP_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_URL) || ''

export function buildInviteUrl(token) {
  if (!token) return ''
  const base = APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/join?token=${encodeURIComponent(token)}`
}

// ─── localStorage round-trip helpers ────────────────────────────────────────
// Survive the auth round-trip: invitee clicks /join?token, we capture the
// token before redirecting through sign-in / sign-up, and replay it after.

const PENDING_INVITE_KEY = 'velo_pending_invite'

export function rememberPendingInvite(token) {
  try { localStorage.setItem(PENDING_INVITE_KEY, String(token)) }
  catch { /* storage may be unavailable */ }
}

export function getPendingInvite() {
  try { return localStorage.getItem(PENDING_INVITE_KEY) || null }
  catch { return null }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(PENDING_INVITE_KEY) }
  catch { /* storage may be unavailable */ }
}

// ─── Server-mediated create ─────────────────────────────────────────────────
// Goes through /api/invitations/create so the server enforces the
// owner-only rule, refuses test orgs, and writes the audit row.
//
// Returns the new invitation row: { id, token, expires_at, role, email,
// org_id, status }.

export async function createInvitation({ email, role }) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  await requireUser()

  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) throw new Error('Not signed in')

  const res = await fetch('/api/invitations/create', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: String(email || '').toLowerCase().trim(),
      role: String(role || ''),
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Create invitation failed (${res.status})`)
  }
  return res.json()
}

// ─── Direct read: pending invitations for the caller's org ──────────────────
// RLS allows owners to read their org's invitations; the helper just adds
// the explicit org_id filter for defense in depth.

export async function listPendingInvitations() {
  if (!isSupabaseConfigured()) return []
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('invitations')
    .select('id, org_id, email, role, token, status, invited_at, expires_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── Direct revoke (status update) ──────────────────────────────────────────
// Owners can revoke their own org's pending invitations. RLS enforces it
// server-side; we add the org_id filter as defense in depth and audit-log
// the action.

export async function revokeInvitation(id) {
  if (!id) throw new Error('revokeInvitation: id is required')
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
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

// ─── /join-page helpers ─────────────────────────────────────────────────────
// `getInvitationPreview` is callable while signed-out (the RPC is granted
// to `anon`). `acceptInvitation` requires a session.

export async function getInvitationPreview(token) {
  if (!token || !isSupabaseConfigured()) return null
  const { data, error } = await supabase.rpc('get_invitation_preview', {
    invite_token: token,
  })
  if (error) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    orgName: row.org_name,
    email: row.invite_email,
    role: row.invite_role,
    expiresAt: row.expires_at,
    status: row.status,
  }
}

export async function acceptInvitation(token) {
  if (!token) throw new Error('acceptInvitation: token is required')
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  await requireUser()

  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) throw new Error('Not signed in')

  const res = await fetch('/api/invitations/accept', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error || 'Could not accept invitation')
  }
  return body.orgId
}
