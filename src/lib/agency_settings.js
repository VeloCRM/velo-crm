/**
 * Velo CRM — agency_settings helpers.
 *
 * The `agency_settings` table holds cross-org operator-managed values
 * (legacy schema). Phase 4 moved the Anthropic key off this table to the
 * server-side ANTHROPIC_API_KEY env var; the remaining values are operator-
 * level config that hasn't been retargeted yet.
 *
 * RLS lets operators read/write; clinic users only read. Mutations are
 * operator-only and audit-logged at the org_id 'operator-global' bucket
 * (we don't have an operator-scope audit yet, so we use the caller's
 * resolved org_id when available).
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText } from './sanitize'

/**
 * Read a single agency_settings row by key.
 */
export async function fetchAgencySetting(key) {
  await requireUser()
  if (!key) throw new Error('fetchAgencySetting: key is required')
  const safeKey = sanitizeText(key, 64)
  const { data, error } = await supabase
    .from('agency_settings')
    .select('value, updated_at')
    .eq('key', safeKey)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Read every agency_settings row.
 */
export async function fetchAllAgencySettings() {
  await requireUser()
  const { data, error } = await supabase
    .from('agency_settings')
    .select('*')
  if (error) throw error
  return data || []
}

/**
 * Upsert a single agency_settings entry. Operator-only.
 */
export async function upsertAgencySetting(key, value) {
  await requireUser()
  if (!key) throw new Error('upsertAgencySetting: key is required')
  const safeKey = sanitizeText(key, 64)
  // Values for keys like 'anthropic_api_key' are tokens; do not strip-html
  // them — they're not user-visible content. Just length-cap.
  const safeValue = typeof value === 'string' ? value.slice(0, 4096) : ''

  const { error } = await supabase
    .from('agency_settings')
    .upsert(
      { key: safeKey, value: safeValue, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) throw error

  // Best-effort audit. If the operator has no resolved org_id (operator
  // accounts often don't), we skip audit-logging — the operator-level audit
  // path is /api/operator/* which handles its own logging.
  try {
    const orgId = await getCurrentOrgId().catch(() => null)
    if (orgId) {
      await logAuditEvent({
        orgId,
        action: 'agency_settings.upsert',
        entityType: 'agency_setting',
        entityId: null,
        payload: { key: safeKey },
      })
    }
  } catch {
    // Resolution failure here is acceptable — the upsert itself succeeded.
  }
}
