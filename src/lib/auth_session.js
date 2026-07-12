/**
 * Velo CRM — auth session helpers used by every src/lib/ helper.
 *
 * Two responsibilities:
 *
 * 1. Single point of truth for the caller's identity. Every tenant-scoped
 *    helper must:
 *      - confirm the request is authenticated (`requireUser`),
 *      - resolve the caller's org_id (`getCurrentOrgId`).
 *    The org_id is then passed to an explicit `.eq('org_id', orgId)` filter
 *    in every query — defense in depth on top of RLS.
 *
 * 2. Operator impersonation context. When an operator is acting on a sub-
 *    account, the audit log needs both ids. `getImpersonationContext()`
 *    pulls the active impersonation from localStorage (set by the operator
 *    UI) so audit.js can fill `effective_user_id`.
 *
 * The org_id is cached per-session in a module-level variable. Sign-out
 * MUST call `clearOrgIdCache()`.
 */

import { supabase } from './supabase'

let _orgIdCache = { userId: null, orgId: null }
// In-flight profiles.org_id fetch, so concurrent callers for the same user share one
// request instead of each hitting the DB before the cache is populated.
let _orgIdInflight = null

/**
 * Read the current user from the LOCAL session — no network. supabase.auth
 * getSession() reads the in-memory / localStorage session and only round-trips
 * to the auth server when the access token is expired and needs a refresh (not
 * on the hot path). Contrast getUser(), which ALWAYS makes a network call.
 *
 * Security is unchanged: the client knowing its own user id locally grants
 * nothing. Every real query sends the signed JWT and RLS evaluates auth.uid()
 * from the server-verified token — a forged local session produces an invalid
 * JWT that PostgREST rejects. The old getUser() pre-check was a redundant extra
 * round-trip re-validating a token that every subsequent query re-validates anyway.
 */
async function sessionUser() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

/**
 * Resolve the currently authenticated Supabase user (local session read). Throws
 * if there is no session — including the token-expired-and-unrefreshable case,
 * where getSession() yields null (treated as unauthenticated, same as before).
 * Callers shouldn't catch — let the failure bubble to the toast pipeline.
 */
export async function requireUser() {
  if (!supabase) throw new Error('Not authenticated (Supabase is not configured)')
  const user = await sessionUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

/**
 * Best-effort current user lookup (local session read). Returns null when not
 * signed in instead of throwing. Use only for read paths that are OK with no-op
 * fallbacks (most read paths should still call requireUser).
 */
export async function getCurrentUser() {
  try {
    return await sessionUser()
  } catch {
    return null
  }
}

/**
 * The current user's id from the LOCAL session, or null. Convenience for the many
 * "stamp created_by / recorded_by" helpers that only need the id — no network.
 */
export async function getSessionUserId() {
  const user = await sessionUser()
  return user?.id ?? null
}

/**
 * Resolve the caller's org_id from `profiles`. Throws on missing profile or
 * missing org membership. Cached per-session.
 */
export async function getCurrentOrgId() {
  // Resolve the session ONCE here (local read) rather than delegating to
  // requireUser() — callers already pair requireUser() + getCurrentOrgId(), so
  // this avoids a second nested session read on every lib call.
  const user = await sessionUser()
  if (!user) throw new Error('Not authenticated')
  // Operator impersonation: when an operator is acting on a tenant, the
  // effective org context comes from the impersonation record, not from
  // profiles.org_id (operators don't belong to a clinic org). Bypass cache —
  // getImpersonationContext is a sync localStorage read.
  const imp = getImpersonationContext()
  if (imp?.orgId) return imp.orgId
  if (_orgIdCache.userId === user.id && _orgIdCache.orgId) {
    return _orgIdCache.orgId
  }
  // Dedupe concurrent resolves for the same user — a patient page fires many
  // org-scoped reads at once; without this each would fetch profiles.org_id before
  // the cache is populated. Share one in-flight request.
  if (_orgIdInflight && _orgIdInflight.userId === user.id) return _orgIdInflight.promise
  const promise = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw new Error(`Could not resolve org: ${error.message}`)
    if (!data?.org_id) throw new Error('No org membership for current user')
    _orgIdCache = { userId: user.id, orgId: data.org_id }
    return data.org_id
  })()
  _orgIdInflight = { userId: user.id, promise }
  try {
    return await promise
  } finally {
    if (_orgIdInflight?.promise === promise) _orgIdInflight = null
  }
}

/**
 * Drop the cached org_id. Call from sign-out and from impersonation toggles
 * so the next helper call re-fetches.
 */
export function clearOrgIdCache() {
  _orgIdCache = { userId: null, orgId: null }
  _orgIdInflight = null
}

/**
 * Read the active impersonation context (set by the operator UI in
 * localStorage). Returns null when not impersonating. Shape:
 *   { orgId: string, orgName: string, effectiveUserId?: string }
 */
export function getImpersonationContext() {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('velo_impersonating')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.orgId) return null
    return parsed
  } catch {
    return null
  }
}
