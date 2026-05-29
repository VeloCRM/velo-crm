/**
 * Velo CRM — notes data layer (PR #5, Path A).
 *
 * Per-patient clinical notes — short free-text entries (optional title,
 * pinnable). Flat table, one `public.notes` row per note. No Storage, no
 * parent/child (unlike prescriptions), no trigger.
 *
 * Every helper:
 *   - calls requireUser() — throws if not authenticated,
 *   - resolves the caller's org_id via getCurrentOrgId() and pins it on every
 *     query for defense in depth on top of RLS,
 *   - sanitizes user-supplied text BEFORE any DB write,
 *   - calls logAuditEvent on every successful mutation (read-only list-load is
 *     silent).
 *
 * Shape convention: snake_case in and out. Matches src/lib/dental.js,
 * src/lib/prescriptions.js, and src/lib/documents.js. No camelCase mappers.
 */

import { supabase } from './supabase'
import { sanitizeText, sanitizeNotes } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'

const TITLE_MAX = 200


// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Resolve auth.uid() for created_by / updated_by audit columns. requireUser()
 * has already ensured a session by the time this runs in normal flows.
 */
async function currentUserId() {
  const result = await supabase.auth.getUser()
  return result.data.user?.id ?? null
}


// ─── createNote ──────────────────────────────────────────────────────────────

/**
 * Create a note for a patient. `body` is required (throws if empty after
 * trim). `title` and `pinned` are optional.
 *
 * @param {string} patientId UUID of the patient (required)
 * @param {object} input
 * @param {string}  input.body    Required free-text (sanitized, 5000-char cap)
 * @param {string} [input.title]  Optional title (sanitized, 200-char cap)
 * @param {boolean}[input.pinned] Optional; defaults to false
 * @returns {Promise<object>} The inserted note row (snake_case).
 */
export async function createNote(patientId, input = {}) {
  if (!patientId) throw new Error('createNote: patientId is required')

  const body = sanitizeNotes(String(input.body || ''))
  if (!body.trim()) throw new Error('createNote: body is required')

  const title = input.title ? sanitizeText(String(input.title), TITLE_MAX) : null
  const pinned = Boolean(input.pinned)

  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await currentUserId()

  const { data: row, error } = await supabase
    .from('notes')
    .insert({
      org_id:     orgId,
      patient_id: patientId,
      body,
      title,
      pinned,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action:     'note.create',
    entityType: 'note',
    entityId:   row.id,
    payload: {
      patient_id: patientId,
      has_title:  Boolean(title),
      pinned,
    },
  })

  return row
}


// ─── fetchNotesForPatient ──────────────────────────────────────────────────

/**
 * Return the patient's notes, pinned first then newest-first within each
 * group (pinned DESC, created_at DESC). Backed by notes_pinned_idx. No audit
 * (passive load).
 */
export async function fetchNotesForPatient(patientId) {
  if (!patientId) throw new Error('fetchNotesForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('notes')
    .select('id, org_id, patient_id, body, title, pinned, created_by, created_at, updated_at, updated_by, external_id, external_source, external_user_id')
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  return data || []
}


// ─── updateNote ──────────────────────────────────────────────────────────────

/**
 * Partial patch of a note. Any of body / title / pinned may be supplied;
 * updated_at + updated_by are always set. body/title are sanitized when
 * present. A body patch that is empty after trim is rejected (a note must
 * always have a body).
 *
 * @param {string} id    UUID of the note
 * @param {object} patch { body?, title?, pinned? }
 * @returns {Promise<object>} The updated note row (snake_case).
 */
export async function updateNote(id, patch = {}) {
  if (!id) throw new Error('updateNote: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await currentUserId()

  const update = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
  const changed = []

  if (patch.body !== undefined) {
    const body = sanitizeNotes(String(patch.body || ''))
    if (!body.trim()) throw new Error('updateNote: body cannot be empty')
    update.body = body
    changed.push('body')
  }
  if (patch.title !== undefined) {
    update.title = patch.title ? sanitizeText(String(patch.title), TITLE_MAX) : null
    changed.push('title')
  }
  if (patch.pinned !== undefined) {
    update.pinned = Boolean(patch.pinned)
    changed.push('pinned')
  }

  const { data: row, error } = await supabase
    .from('notes')
    .update(update)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action:     'note.update',
    entityType: 'note',
    entityId:   id,
    payload: { fields: changed },
  })

  return row
}


// ─── deleteNote ──────────────────────────────────────────────────────────────

/**
 * Delete a note. Single-row delete — no child rows or storage objects.
 */
export async function deleteNote(id) {
  if (!id) throw new Error('deleteNote: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action:     'note.delete',
    entityType: 'note',
    entityId:   id,
  })
}
