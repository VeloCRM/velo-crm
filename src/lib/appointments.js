/**
 * Velo CRM — appointments helpers.
 *
 * Targets the legacy `appointments` schema (appointment_date, appointment_
 * time, contact_id) so current pages keep working. The new-schema helper
 * insertAppointment in database.js targets the new `appointments` table
 * (scheduled_at, patient_id, ...) and lives there.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, LIMITS } from './sanitize'

function sanitizeAppointmentPayload(p) {
  const out = { ...p }
  if (out.title !== undefined) out.title = sanitizeText(out.title, 200)
  if (out.notes !== undefined) out.notes = sanitizeText(out.notes, LIMITS.notes)
  if (out.type !== undefined) out.type = sanitizeText(out.type, 32)
  if (out.status !== undefined) out.status = sanitizeText(out.status, 32)
  if (out.duration_minutes !== undefined) out.duration_minutes = Number(out.duration_minutes) || 30
  return out
}

/**
 * Fetch appointments for a date range, joined with the patient row.
 * Inclusive on both ends. Defense-in-depth scoped to caller's org.
 */
export async function listAppointmentsBetween(startDate, endDate) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('appointments')
    .select('*, contacts:contact_id(id, name, phone)')
    .eq('org_id', orgId)
    .gte('appointment_date', startDate)
    .lte('appointment_date', endDate)
    .order('appointment_time', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Update only the status of a single appointment. The org filter applies
 * at the WHERE clause for defense in depth.
 */
export async function updateAppointmentStatus(id, status) {
  if (!id) throw new Error('updateAppointmentStatus: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safeStatus = sanitizeText(status || '', 32)
  if (!safeStatus) throw new Error('updateAppointmentStatus: status is required')

  const { error } = await supabase
    .from('appointments')
    .update({ status: safeStatus })
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'appointment.status_change',
    entityType: 'appointment',
    entityId: id,
    payload: { status: safeStatus },
  })
}

export async function deleteAppointment(id) {
  if (!id) throw new Error('deleteAppointment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'appointment.delete',
    entityType: 'appointment',
    entityId: id,
  })
}

export async function upsertAppointment({ id, ...payload }) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const sanitized = sanitizeAppointmentPayload(payload)

  if (id) {
    const { data, error } = await supabase
      .from('appointments')
      .update(sanitized)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()
    if (error) throw error
    await logAuditEvent({
      orgId,
      action: 'appointment.update',
      entityType: 'appointment',
      entityId: id,
      payload: { fields: Object.keys(sanitized) },
    })
    return data
  }

  const insertPayload = { ...sanitized, org_id: orgId }
  const { data, error } = await supabase
    .from('appointments')
    .insert(insertPayload)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'appointment.create',
    entityType: 'appointment',
    entityId: data?.id || null,
  })

  return data
}

/**
 * Search legacy contacts by name or phone within the caller's org. Used by
 * the AddAppointmentModal patient picker. Returns up to 10 rows.
 */
export async function searchContactsForAppointment(query) {
  if (!query || query.length < 2) return []
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safeQuery = sanitizeText(query, 100)
  // PostgREST OR + ILIKE pattern. The query is sanitized text-strip; the
  // wildcard chars come from us, not the user.
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('org_id', orgId)
    .or(`name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
    .limit(10)
  if (error) throw error
  return data || []
}
