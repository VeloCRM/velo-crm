/**
 * Velo CRM — social_connections helpers (Growth module).
 *
 * One row per (org_id, platform). Replace-on-save semantics: a write deletes
 * any existing row for that platform+org and inserts the new one.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS, toSafeNumber } from './sanitize'

function sanitizeSocialConnection(c) {
  return {
    page_name: sanitizeText(c.page_name || '', LIMITS.name),
    profile_url: sanitizeText(c.profile_url || '', 512),
    followers_count: Math.max(0, toSafeNumber(c.followers_count, 0)),
    following_count: Math.max(0, toSafeNumber(c.following_count, 0)),
    posts_count: Math.max(0, toSafeNumber(c.posts_count, 0)),
    profile_pic_url: sanitizeText(c.profile_pic_url || '', 512),
    bio: sanitizeText(c.bio || '', LIMITS.notes),
    engagement_rate: Math.max(0, toSafeNumber(c.engagement_rate, 0)),
    notes: sanitizeText(c.notes || '', LIMITS.notes),
  }
}

export async function listSocialConnections() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('social_connections')
    .select('*')
    .eq('org_id', orgId)
  if (error) throw error
  return data || []
}

export async function upsertSocialConnection(platform, payload) {
  if (!platform) throw new Error('upsertSocialConnection: platform is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safePlatform = sanitizeText(platform, 32)
  const sanitized = sanitizeSocialConnection(payload || {})

  // Replace-on-save: delete the prior row for this platform+org first.
  const { error: delErr } = await supabase
    .from('social_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('platform', safePlatform)
  if (delErr) throw delErr

  const { data, error: insErr } = await supabase
    .from('social_connections')
    .insert({
      org_id: orgId,
      platform: safePlatform,
      ...sanitized,
      last_synced_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (insErr) throw insErr

  await logAuditEvent({
    orgId,
    action: 'social_connection.upsert',
    entityType: 'social_connection',
    entityId: data?.id || null,
    payload: { platform: safePlatform },
  })

  return data
}

export async function deleteSocialConnection(platform) {
  if (!platform) throw new Error('deleteSocialConnection: platform is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safePlatform = sanitizeText(platform, 32)

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
