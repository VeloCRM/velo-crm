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
import { requireUser, getImpersonationContext } from './auth_session'

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
