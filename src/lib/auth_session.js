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

/**
 * Resolve the currently authenticated Supabase user. Throws if no session
 * (callers shouldn't catch — let the failure bubble to the toast pipeline).
 */
export async function requireUser() {
  if (!supabase) throw new Error('Not authenticated (Supabase is not configured)')
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw new Error(`Not authenticated: ${error.message}`)
  if (!user) throw new Error('Not authenticated')
  return user
}

/**
 * Best-effort current user lookup. Returns null when not signed in instead
 * of throwing. Use only for read paths that are OK with no-op fallbacks
 * (most read paths should still call requireUser).
 */
export async function getCurrentUser() {
  if (!supabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user || null
  } catch {
    return null
  }
}

/**
 * Resolve the caller's org_id from `profiles`. Throws on missing profile or
 * missing org membership. Cached per-session.
 */
export async function getCurrentOrgId() {
  const user = await requireUser()
  if (_orgIdCache.userId === user.id && _orgIdCache.orgId) {
    return _orgIdCache.orgId
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(`Could not resolve org: ${error.message}`)
  if (!data?.org_id) throw new Error('No org membership for current user')
  _orgIdCache = { userId: user.id, orgId: data.org_id }
  return data.org_id
}

/**
 * Drop the cached org_id. Call from sign-out and from impersonation toggles
 * so the next helper call re-fetches.
 */
export function clearOrgIdCache() {
  _orgIdCache = { userId: null, orgId: null }
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
