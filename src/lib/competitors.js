/**
 * Velo CRM — competitor tracking helpers (Growth module).
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeCompetitor(c) {
  return {
    name: sanitizeText(c.name || '', LIMITS.name),
    website: sanitizeText(c.website || '', 256),
    industry: sanitizeText(c.industry || '', 100),
    instagram_handle: sanitizeText(c.instagram_handle || '', 64),
    google_maps_url: sanitizeText(c.google_maps_url || '', 512),
    location: sanitizeText(c.location || '', 200),
    notes: sanitizeText(c.notes || '', LIMITS.notes),
  }
}

export async function listCompetitors() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function insertCompetitor(competitor) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const payload = { ...sanitizeCompetitor(competitor), org_id: orgId }

  const { data, error } = await supabase
    .from('competitors')
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'competitor.create',
    entityType: 'competitor',
    entityId: data?.id || null,
  })
  return data
}

export async function deleteCompetitor(id) {
  if (!id) throw new Error('deleteCompetitor: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('competitors')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'competitor.delete',
    entityType: 'competitor',
    entityId: id,
  })
}
