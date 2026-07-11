/**
 * Velo CRM — audit log writer.
 *
 * Every mutation helper in src/lib/ MUST call logAuditEvent before
 * returning success. The function:
 *
 *   - resolves acting_user_id from auth.uid(),
 *   - resolves effective_user_id from operator-impersonation context (the
 *     clinic user being acted as, when an operator is impersonating),
 *   - inserts into audit_log,
 *   - throws on failure. Callers must NOT swallow — the toast pipeline
 *     surfaces the error. Silent audit gaps are unacceptable.
 *
 * Schema target: src/lib/schema.sql (Phase 2). Columns:
 *   org_id, acting_user_id, effective_user_id, action, entity_type,
 *   entity_id, payload (jsonb), created_at.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId, getImpersonationContext } from './auth_session'

/**
 * Listeners notified on audit failures. The toast pipeline subscribes from
 * App.jsx so users see audit-write failures, not just helpers' final errors.
 */
const _failureListeners = new Set()

/**
 * Subscribe to audit-write failures. Returns an unsubscribe function.
 * @param {(err: Error, ctx: object) => void} fn
 */
export function onAuditFailure(fn) {
  _failureListeners.add(fn)
  return () => _failureListeners.delete(fn)
}

function notifyAuditFailure(err, ctx) {
  for (const fn of _failureListeners) {
    try { fn(err, ctx) } catch { /* listener errors are non-fatal */ }
  }
}

/**
 * Insert an audit_log row.
 *
 * @param {object} args
 * @param {string} args.orgId       - tenant the action affected (required)
 * @param {string} args.action      - short verb, e.g. 'patient.create'
 * @param {string} args.entityType  - e.g. 'patient', 'appointment'
 * @param {string} [args.entityId]  - uuid of the affected row
 * @param {object} [args.payload]   - small JSON describing the change
 *                                   (NEVER include secrets)
 * @returns {Promise<void>}
 * @throws on auth failure or DB insert failure
 */
export async function logAuditEvent({ orgId, action, entityType, entityId = null, payload = null }) {
  if (!orgId) throw new Error('logAuditEvent: orgId is required')
  if (!action) throw new Error('logAuditEvent: action is required')
  if (!entityType) throw new Error('logAuditEvent: entityType is required')

  const user = await requireUser()
  const impersonation = getImpersonationContext()

  // When an operator impersonates a clinic user, acting = operator,
  // effective = the clinic user being acted as. When there's no impersonation,
  // effective is null.
  const actingUserId = user.id
  const effectiveUserId = impersonation?.effectiveUserId || null

  const row = {
    org_id: orgId,
    acting_user_id: actingUserId,
    effective_user_id: effectiveUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload: payload || {},
  }

  const { error } = await supabase.from('audit_log').insert(row)
  if (error) {
    const wrapped = new Error(`audit log write failed: ${error.message}`)
    notifyAuditFailure(wrapped, { action, entityType, entityId, orgId })
    throw wrapped
  }
}

// ─── Reads (Activity Log UI) ─────────────────────────────────────────────────

function mapAuditRow(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    actingUserId: row.acting_user_id || null,
    effectiveUserId: row.effective_user_id || null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || null,
    payload: row.payload || {},
    createdAt: row.created_at,
  }
}

/**
 * Read the org's audit log, newest first. Org-scoped by RLS (audit_log_select_own_org);
 * the explicit .eq('org_id', …) is defense in depth and lets the planner use
 * idx_audit_log_org_created (org_id, created_at DESC). All filters optional.
 *
 * @param {object} [opts]
 * @param {string} [opts.from]        - ISO lower bound on created_at
 * @param {string} [opts.to]          - ISO upper bound on created_at
 * @param {string} [opts.action]      - exact action match (e.g. 'payment.create')
 * @param {string} [opts.entityType]  - exact entity_type match
 * @param {string} [opts.actorId]     - exact acting_user_id match
 * @param {number} [opts.limit=100]   - clamped to 1..500
 * @returns {Promise<object[]>} mapped camelCase rows
 */
export async function fetchAuditLog({ from, to, action, entityType, actorId, limit = 100 } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  let q = supabase
    .from('audit_log')
    .select('id, org_id, acting_user_id, effective_user_id, action, entity_type, entity_id, payload, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)))
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)
  if (action) q = q.eq('action', action)
  if (entityType) q = q.eq('entity_type', entityType)
  if (actorId) q = q.eq('acting_user_id', actorId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(mapAuditRow)
}

/**
 * Resolve a set of actor ids → display info. Clinic users come from profiles
 * (readable in-org via profiles_select_own_org). Any id NOT found is an OPERATOR:
 * in an org-scoped log, a non-member actor is the agency (SupCod3) — operators have
 * no client-readable profile/operators row. Returns { [id]: { name, role, isOperator } }.
 * (null ids are dropped here; the UI renders them via describeActor as 'Removed user'.)
 */
export async function resolveActors(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  const map = {}
  if (unique.length === 0) return map
  await requireUser()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', unique)
  if (error) throw error
  for (const p of data || []) {
    map[p.id] = { name: p.full_name || 'Unknown', role: p.role || null, isOperator: false }
  }
  for (const id of unique) {
    if (!map[id]) map[id] = { name: 'SupCod3', role: null, isOperator: true }
  }
  return map
}

/**
 * UI-facing resolver for a single actor id against a resolveActors() map. Handles the
 * three render cases: a clinic member, the operator (SupCod3), and a null id (the auth
 * user was deleted — acting_user_id FK is ON DELETE SET NULL) → 'Removed user'.
 */
export function describeActor(id, actorMap, isRTL = false) {
  if (!id) return { name: isRTL ? 'مستخدم محذوف' : 'Removed user', role: null, isOperator: false, removed: true }
  return actorMap?.[id] || { name: 'SupCod3', role: null, isOperator: true }
}
