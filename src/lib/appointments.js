/**
 * Velo CRM — appointments helpers (new schema).
 *
 * Schema columns (src/lib/schema.sql):
 *   id, org_id, patient_id, doctor_id, type, status, scheduled_at,
 *   duration_minutes, chair_id, notes, created_at, updated_at.
 *
 * Type enum:   checkup | cleaning | filling | extraction | root_canal |
 *              crown | whitening | consultation | emergency
 * Status enum: scheduled | confirmed | in_progress | completed | no_show |
 *              cancelled
 *
 * Legacy columns (title, appointment_date, appointment_time, contact_id,
 * created_by) are gone. Helpers reject them with a clear error if a caller
 * passes them so we get loud failures during the page-layer migration
 * rather than silent nulls.
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, sanitizeNotes, toSafeNumber } from './sanitize'

const APPOINTMENT_TYPES = new Set([
  'checkup', 'cleaning', 'filling', 'extraction', 'root_canal',
  'crown', 'whitening', 'consultation', 'emergency',
])
const APPOINTMENT_STATUSES = new Set([
  'scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled',
])

const LEGACY_FIELDS = new Set([
  'title', 'appointment_date', 'appointment_time', 'contact_id', 'created_by',
])

function rejectLegacyFields(payload) {
  for (const k of Object.keys(payload || {})) {
    if (LEGACY_FIELDS.has(k)) {
      throw new Error(
        `appointments helpers reject legacy field "${k}". ` +
        `Use scheduled_at (timestamptz) and patient_id instead.`
      )
    }
  }
}

function sanitizeAppointmentPayload(p) {
  rejectLegacyFields(p)

  const out = {}
  if (p.patient_id !== undefined || p.patientId !== undefined) {
    out.patient_id = p.patient_id ?? p.patientId
  }
  if (p.doctor_id !== undefined || p.doctorId !== undefined) {
    out.doctor_id = p.doctor_id ?? p.doctorId ?? null
  }
  if (p.type !== undefined) {
    const t = sanitizeText(p.type, 32).toLowerCase()
    if (!APPOINTMENT_TYPES.has(t)) {
      throw new Error(`appointments: unsupported type "${p.type}"`)
    }
    out.type = t
  }
  if (p.status !== undefined) {
    const s = sanitizeText(p.status, 32).toLowerCase()
    if (!APPOINTMENT_STATUSES.has(s)) {
      throw new Error(`appointments: unsupported status "${p.status}"`)
    }
    out.status = s
  }
  if (p.scheduled_at !== undefined || p.scheduledAt !== undefined) {
    out.scheduled_at = p.scheduled_at ?? p.scheduledAt
  }
  if (p.duration_minutes !== undefined || p.durationMinutes !== undefined) {
    out.duration_minutes = Math.max(1, toSafeNumber(p.duration_minutes ?? p.durationMinutes, 30))
  }
  if (p.chair_id !== undefined || p.chairId !== undefined) {
    out.chair_id = p.chair_id ?? p.chairId ?? null
  }
  if (p.notes !== undefined) {
    out.notes = p.notes ? sanitizeNotes(p.notes) : null
  }
  return out
}

/**
 * Fetch appointments whose `scheduled_at` falls in [start, end].
 * Both arguments are ISO timestamps (timestamptz). Defense-in-depth scoped
 * to caller's org. Joined with the patient row.
 */
export async function listAppointmentsBetween(startTs, endTs) {
  if (!startTs || !endTs) {
    throw new Error('listAppointmentsBetween: startTs and endTs are required (ISO timestamps)')
  }
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, org_id, patient_id, doctor_id, type, status, scheduled_at, duration_minutes, chair_id, notes, created_at, updated_at, patients:patient_id(id, full_name, phone)')
    .eq('org_id', orgId)
    .gte('scheduled_at', startTs)
    .lte('scheduled_at', endTs)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function updateAppointmentStatus(id, status) {
  if (!id) throw new Error('updateAppointmentStatus: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const safeStatus = sanitizeText(status || '', 32).toLowerCase()
  if (!APPOINTMENT_STATUSES.has(safeStatus)) {
    throw new Error(`updateAppointmentStatus: unsupported status "${status}"`)
  }

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

/**
 * Insert or update an appointment. Caller may pass `id` to update.
 *
 * Legacy fields (title, appointment_date, appointment_time, contact_id,
 * created_by) are rejected — pass scheduled_at + patient_id instead.
 */
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

  // Insert path: enforce required fields per the new-schema constraints.
  if (!sanitized.patient_id) {
    throw new Error('upsertAppointment: patient_id is required for inserts')
  }
  if (!sanitized.scheduled_at) {
    throw new Error('upsertAppointment: scheduled_at is required for inserts')
  }
  if (!sanitized.type) {
    throw new Error('upsertAppointment: type is required for inserts')
  }

  // Test-account cap. Imported lazily to avoid a circular dep with
  // database.js (which imports auth_session/audit, both already loaded).
  const { assertTestAccountLimit } = await import('./database')
  await assertTestAccountLimit(orgId, 'appointments')

  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...sanitized, org_id: orgId })
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
 * List every appointment for a single patient, newest scheduled_at first.
 * Used by the patient profile's Appointments tab.
 */
export async function listAppointmentsForPatient(patientId) {
  if (!patientId) throw new Error('listAppointmentsForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, org_id, patient_id, doctor_id, type, status, scheduled_at, duration_minutes, chair_id, notes, created_at')
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('scheduled_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Search patients by name or phone within the caller's org. Used by the
 * AddAppointmentModal patient picker. Returns up to 10 rows.
 */
export async function searchPatientsForAppointment(query) {
  if (!query || query.length < 2) return []
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safeQuery = sanitizeText(query, 100)
  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name, phone')
    .eq('org_id', orgId)
    .or(`full_name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
    .limit(10)
  if (error) throw error
  return data || []
}
