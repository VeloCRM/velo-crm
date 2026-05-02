/**
 * Velo CRM — social_connections helpers (Social Monitor).
 *
 * One row per (org_id, platform). Numbers are entered manually by the
 * operator in the SocialMonitor page — there's no automated sync yet
 * (manual sync first, automated sync later).
 *
 * The helpers don't gate by operator role themselves; RLS allows any
 * org member to write, and the page-layer uses useIsOperator() to hide
 * the edit/add UI from non-operators. That's defense in depth + UX —
 * the database treats all org members as equal contributors.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, sanitizeNotes, LIMITS, toSafeNumber } from './sanitize'

const PLATFORMS = new Set([
  'instagram', 'facebook', 'tiktok', 'google_maps', 'youtube', 'twitter',
])

function sanitizePlatform(p) {
  const safe = sanitizeText(p || '', 32).toLowerCase()
  if (!PLATFORMS.has(safe)) {
    throw new Error(`social_connections: unsupported platform "${p}"`)
  }
  return safe
}

function sanitizeFields(fields) {
  const out = {}
  if (fields.page_name !== undefined) {
    out.page_name = fields.page_name ? sanitizeText(fields.page_name, LIMITS.name) : null
  }
  if (fields.profile_url !== undefined) {
    out.profile_url = fields.profile_url ? sanitizeText(fields.profile_url, 512) : null
  }
  if (fields.profile_pic_url !== undefined) {
    out.profile_pic_url = fields.profile_pic_url ? sanitizeText(fields.profile_pic_url, 512) : null
  }
  if (fields.followers_count !== undefined) {
    out.followers_count = Math.max(0, toSafeNumber(fields.followers_count, 0))
  }
  if (fields.following_count !== undefined) {
    out.following_count = Math.max(0, toSafeNumber(fields.following_count, 0))
  }
  if (fields.posts_count !== undefined) {
    out.posts_count = Math.max(0, toSafeNumber(fields.posts_count, 0))
  }
  if (fields.engagement_rate !== undefined) {
    // numeric(5,2) — clamp at the schema bounds
    const n = toSafeNumber(fields.engagement_rate, 0)
    out.engagement_rate = Math.max(0, Math.min(999.99, n))
  }
  if (fields.bio !== undefined) {
    out.bio = fields.bio ? sanitizeNotes(fields.bio) : null
  }
  if (fields.notes !== undefined) {
    out.notes = fields.notes ? sanitizeNotes(fields.notes) : null
  }
  return out
}

/**
 * List every social connection for the caller's org, sorted by platform
 * for stable card ordering in the UI.
 */
export async function listSocialConnections() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('social_connections')
    .select('id, org_id, platform, page_name, profile_url, profile_pic_url, followers_count, following_count, posts_count, engagement_rate, bio, notes, last_synced_at, created_at, updated_at')
    .eq('org_id', orgId)
    .order('platform', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Insert or update a connection by (org_id, platform). Stamps
 * `last_synced_at = now()` on every write so the UI's "Last synced N
 * minutes ago" reflects the operator's last manual update.
 */
export async function upsertSocialConnection(platform, fields) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safePlatform = sanitizePlatform(platform)
  const sanitized = sanitizeFields(fields || {})

  const row = {
    org_id: orgId,
    platform: safePlatform,
    ...sanitized,
    last_synced_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('social_connections')
    .upsert(row, { onConflict: 'org_id,platform' })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'social_connection.upsert',
    entityType: 'social_connection',
    entityId: data?.id || null,
    payload: { platform: safePlatform, fields: Object.keys(sanitized) },
  })

  return data
}

/**
 * Delete the connection for a given platform within the caller's org.
 */
export async function deleteSocialConnection(platform) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safePlatform = sanitizePlatform(platform)

  const { error } = await supabase
    .from('social_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('platform', safePlatform)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'social_connection.delete',
    entityType: 'social_connection',
    entityId: null,
    payload: { platform: safePlatform },
  })
}
