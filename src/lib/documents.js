/**
 * Velo CRM — documents data layer (PR #4, Path A).
 *
 * Per-patient file attachments (PDF / image / Office / plain text) stored in
 * the private `patient-documents` Storage bucket, with one `public.documents`
 * row per file. Flat shape — no parent/child (unlike prescriptions).
 *
 * Storage path: {org_id}/{patient_id}/{document_id}.{ext}
 *   - {document_id} is a client-generated crypto.randomUUID() chosen BEFORE the
 *     row insert (so the path can't depend on the server-generated row id).
 *   - The org segment (1) drives the bucket RLS guard; patient segment (2) is
 *     grouping only. See scripts/patient-documents-bucket.sql.
 *
 * Every helper:
 *   - calls requireUser() — throws if not authenticated,
 *   - resolves the caller's org_id via getCurrentOrgId() and pins it on every
 *     query for defense in depth on top of RLS,
 *   - sanitizes user-supplied text BEFORE any DB write,
 *   - calls logAuditEvent on every successful mutation (read-only list-load is
 *     silent; signed-URL generation logs document.view as the access-intent
 *     signal).
 *
 * Shape convention: snake_case in and out. Matches src/lib/dental.js and
 * src/lib/prescriptions.js. No camelCase mappers.
 */

import { supabase } from './supabase'
import { sanitizeText } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'

const BUCKET = 'patient-documents'

// Allowed MIME types. The bucket's allowed-MIME list is the authoritative gate;
// this client-side check fast-fails with a clear message before the round-trip.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

// Fallback extension per MIME, used when the original filename carries no clean
// alphabetic extension (deriveExt rejects e.g. "file", "report.v2").
const MIME_EXT = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
}

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB


// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Resolve auth.uid() for the uploaded_by audit column. requireUser() has
 * already ensured a session by the time this runs in normal flows.
 */
async function currentUserId() {
  const result = await supabase.auth.getUser()
  return result.data.user?.id ?? null
}

/**
 * Extract a safe storage-path extension from the original filename.
 *
 * Takes the substring after the last dot, lowercases it, and accepts it ONLY
 * if it is purely alphabetic (/^[a-z]+$/i) — this rejects path-injection
 * attempts and junk "extensions" like "tar.gz "/"v2". When the filename has no
 * clean extension, falls back to the MIME-derived extension. Returns '' only
 * when both sources fail (caller defaults to 'bin').
 */
function deriveExt(fileName, mimeType) {
  const dot = String(fileName || '').lastIndexOf('.')
  if (dot > -1 && dot < fileName.length - 1) {
    const raw = fileName.slice(dot + 1).toLowerCase()
    if (/^[a-z]+$/i.test(raw)) return raw
  }
  return MIME_EXT[mimeType] || ''
}

/**
 * Sanitize the original filename for the stored `file_name` display column.
 * Strips HTML, collapses path separators, and caps length. This value is
 * display-only — the storage path uses a UUID, so a hostile filename can't
 * affect where the blob lands.
 */
function sanitizeFileName(fileName) {
  const noSep = String(fileName || '').replace(/[/\\]+/g, '_')
  const clean = sanitizeText(noSep, 255).trim()
  return clean || 'document'
}


// ─── uploadDocument ─────────────────────────────────────────────────────────

/**
 * Upload a file for a patient.
 *
 * Order: validate → upload to Storage FIRST → insert the row. On row-insert
 * failure, best-effort remove the just-uploaded object so no ghost blob is
 * left in the bucket (a ghost blob is invisible to the UI and wastes quota; a
 * ghost row would 404 on View). The UUID basename means a retry never
 * collides with a prior attempt.
 *
 * @param {string} patientId UUID of the patient (required)
 * @param {File}   file      Browser File object (required)
 * @returns {Promise<object>} The inserted documents row (snake_case).
 */
export async function uploadDocument(patientId, file) {
  if (!patientId) throw new Error('uploadDocument: patientId is required')
  if (!file) throw new Error('uploadDocument: file is required')

  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Unsupported file type. Allowed: PDF, JPG, PNG, Word, Excel, and plain text.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File exceeds the 25 MB limit.')
  }

  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await currentUserId()

  const documentId = crypto.randomUUID()
  const ext = deriveExt(file.name, file.type) || 'bin'
  const storagePath = `${orgId}/${patientId}/${documentId}.${ext}`

  // Step 1: upload the blob. upsert:false so a UUID collision (astronomically
  // unlikely) surfaces as an error rather than silently overwriting.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type })
  if (upErr) throw upErr

  // Step 2: insert the row. On failure, drop the orphaned blob.
  const { data: row, error: rowErr } = await supabase
    .from('documents')
    .insert({
      org_id:       orgId,
      patient_id:   patientId,
      file_name:    sanitizeFileName(file.name),
      storage_path: storagePath,
      mime_type:    file.type || null,
      file_size:    Number.isFinite(file.size) ? file.size : null,
      uploaded_by:  userId,
    })
    .select('*')
    .single()

  if (rowErr) {
    // Best-effort cleanup of the orphaned object. Surface the original row
    // error regardless — don't mask it behind a cleanup failure.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    throw rowErr
  }

  await logAuditEvent({
    orgId,
    action:     'document.upload',
    entityType: 'document',
    entityId:   row.id,
    payload: {
      patient_id: patientId,
      mime_type:  row.mime_type,
      file_size:  row.file_size,
    },
  })

  return row
}


// ─── fetchDocumentsForPatient ────────────────────────────────────────────────

/**
 * Return the patient's documents, most-recently-uploaded first.
 *
 * uploaded_by is a FK to auth.users (not profiles), so the uploader's name
 * can't be PostgREST-embedded directly. We resolve names in a single follow-up
 * query against profiles (whose id == auth.users.id) and attach an `uploader`
 * field ({ id, full_name }) to each row. Rows whose uploader is unresolved
 * (deleted account → NULL, or not in this org) get uploader: null.
 */
export async function fetchDocumentsForPatient(patientId) {
  if (!patientId) throw new Error('fetchDocumentsForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('documents')
    .select('id, org_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, created_at, external_id, external_source')
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = data || []
  const uploaderIds = [...new Set(rows.map(r => r.uploaded_by).filter(Boolean))]

  let nameById = {}
  if (uploaderIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', orgId)
      .in('id', uploaderIds)
    if (pErr) throw pErr
    nameById = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))
  }

  return rows.map(r => ({
    ...r,
    uploader: r.uploaded_by
      ? { id: r.uploaded_by, full_name: nameById[r.uploaded_by] || null }
      : null,
  }))
}


// ─── getDocumentSignedUrl ─────────────────────────────────────────────────────

/**
 * Return a 1-hour signed URL for the document's stored object. Used for both
 * View (open in new tab) and Download. Logs document.view — generating the URL
 * is the unambiguous access-intent signal (a PHI-access event clinics may need
 * to trace).
 */
export async function getDocumentSignedUrl(id) {
  if (!id) throw new Error('getDocumentSignedUrl: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: row, error } = await supabase
    .from('documents')
    .select('id, storage_path, file_name')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()
  if (error) throw error

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 3600)
  if (sErr) throw sErr

  await logAuditEvent({
    orgId,
    action:     'document.view',
    entityType: 'document',
    entityId:   row.id,
  })

  return { url: signed?.signedUrl || null, fileName: row.file_name }
}


// ─── deleteDocument ───────────────────────────────────────────────────────────

/**
 * Delete a document. Removes the Storage object FIRST; only if that succeeds
 * does it delete the row. A failed storage delete leaves the row intact so the
 * user still sees the document and can retry — preferable to a ghost row that
 * 404s on View.
 */
export async function deleteDocument(id) {
  if (!id) throw new Error('deleteDocument: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: row, error: fErr } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()
  if (fErr) throw fErr

  const { error: sErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path])
  if (sErr) throw sErr

  const { error: dErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (dErr) throw dErr

  await logAuditEvent({
    orgId,
    action:     'document.delete',
    entityType: 'document',
    entityId:   id,
  })
}
