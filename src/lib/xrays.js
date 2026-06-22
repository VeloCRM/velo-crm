/**
 * Velo CRM — X-ray data layer (PR-A, backend).
 *
 * Per-patient radiographic images stored in the private `patient-xrays` Storage
 * bucket, one `public.xrays` row per file with clinical metadata (type / date /
 * teeth / optional treatment link / notes / batch). Mirrors src/lib/documents.js
 * but adds metadata + a client-generated thumbnail, and writes are doctor/owner
 * only (receptionists read-only — enforced by table + bucket RLS; this layer
 * surfaces a clear error on denial).
 *
 * Storage path: {org_id}/{patient_id}/{xray_id}.{ext}
 *   - {xray_id} is a client-generated crypto.randomUUID() chosen BEFORE the row
 *     insert so the path never depends on the server-generated row id.
 *   - segment 1 (org) drives the bucket RLS guard; segment 2 (patient) groups.
 *     See scripts/xray-module-migration.sql.
 *
 * Every helper: requireUser() → resolve org_id (pinned on every query for
 * defense in depth on top of RLS) → sanitize/validate input → mutate →
 * logAuditEvent. snake_case in and out (matches documents.js / dental.js).
 */

import { supabase } from './supabase'
import { sanitizeText, sanitizeNotes } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { isValidFdiTooth } from './dental'

const BUCKET = 'patient-xrays'

// Authoritative gate is the bucket's allowed-MIME list; this fast-fails before
// the round-trip. JPEG/PNG/WebP for V1 (DICOM/CBCT files deferred to V2.1 — the
// 'cbct' xray_type is just a label on a raster export).
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — must match the bucket's file_size_limit
const XRAY_TYPES = new Set(['bitewing', 'periapical', 'panoramic', 'occlusal', 'cbct', 'other'])
const MAX_TEETH = 32 // permanent dentition

// Thumbnail tuning: ~200px longest edge, JPEG q0.6 → ~5-15 KB base64.
const THUMB_MAX_DIM = 200
const THUMB_QUALITY = 0.6


// ─── Internal helpers ──────────────────────────────────────────────────────

async function currentUserId() {
  const result = await supabase.auth.getUser()
  return result.data.user?.id ?? null
}

/** Safe storage-path extension: purely-alphabetic from the filename, else MIME. */
function deriveExt(fileName, mimeType) {
  const dot = String(fileName || '').lastIndexOf('.')
  if (dot > -1 && dot < fileName.length - 1) {
    const raw = fileName.slice(dot + 1).toLowerCase()
    if (/^[a-z]+$/i.test(raw)) return raw
  }
  return MIME_EXT[mimeType] || ''
}

/** Display-only filename: strip path separators + HTML, cap length. */
function sanitizeFileName(fileName) {
  const noSep = String(fileName || '').replace(/[/\\]+/g, '_')
  const clean = sanitizeText(noSep, 255).trim()
  return clean || 'xray'
}

/** Validate xray_type against the schema enum; throw on mismatch. */
function assertXrayType(t) {
  const safe = sanitizeText(String(t || ''), 20).toLowerCase()
  if (!XRAY_TYPES.has(safe)) throw new Error(`Unsupported xray_type "${t}".`)
  return safe
}

/**
 * Normalize teeth_shown to an array of canonical FDI code strings (e.g. '16').
 * Requires a plain two-digit string AND a valid FDI code — this rejects inputs
 * like '16.0' / '0x10' / '+16' that Number()-based validation would accept but
 * which would persist as junk that never matches a bare '16'. De-dupes + caps.
 */
function normalizeTeeth(teeth) {
  if (teeth == null) return []
  if (!Array.isArray(teeth)) throw new Error('teeth_shown must be an array of FDI codes.')
  const out = []
  for (const t of teeth) {
    const code = String(t).trim()
    if (!code) continue
    if (!/^\d{2}$/.test(code) || !isValidFdiTooth(code)) {
      throw new Error(`Invalid FDI tooth code "${t}" in teeth_shown (use 11-18, 21-28, 31-38, 41-48).`)
    }
    if (!out.includes(code)) out.push(code)
  }
  if (out.length > MAX_TEETH) throw new Error('teeth_shown exceeds 32 entries.')
  return out
}

/** Local YYYY-MM-DD — avoids the UTC off-by-one toISOString() causes near midnight. */
function toYmdLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize a date input (a Date instance or a 'YYYY-MM-DD' string) → 'YYYY-MM-DD'. */
function normalizeDate(d) {
  if (!d) return toYmdLocal(new Date())
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date_taken (invalid Date).')
    return toYmdLocal(d)
  }
  const s = String(d).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid date_taken "${d}" (expected YYYY-MM-DD).`)
  return s
}

const MAX_THUMB_BYTES = 64 * 1024 // generated thumb is ~5-15 KB; cap well above to bound row size

/**
 * Accept only a small base64 JPEG/PNG data URL — exactly what generateThumbnail
 * emits. Anything else (wrong type, junk string, oversized blob) → null, keeping
 * this the only field NOT written verbatim and bounding row/response size.
 */
function sanitizeThumbnail(dataUrl) {
  if (!dataUrl) return null
  const s = String(dataUrl)
  if (s.length > MAX_THUMB_BYTES) return null
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s)) return null
  return s
}

// Columns selected for the grid/lightbox, with the uploader embedded (uploaded_by
// → profiles(id), so PostgREST can embed it directly — unlike documents).
const SELECT_COLS =
  'id, org_id, patient_id, treatment_plan_id, file_name, storage_path, mime_type, file_size, ' +
  'thumbnail_data_url, xray_type, date_taken, teeth_shown, notes, batch_id, uploaded_by, ' +
  'created_at, updated_at, uploader:uploaded_by(id, full_name)'


// ─── generateThumbnail (client-side, EXIF-aware) ─────────────────────────────

/**
 * Produce a small base64 JPEG data URL (~200px longest edge) for the grid.
 * Uses createImageBitmap with imageOrientation:'from-image' so EXIF-rotated
 * phone photos render upright. Caller-facing helper for the upload UI (PR-B):
 * it may throw on a corrupt/oversized decode — callers should treat the
 * thumbnail as optional and upload with null on failure.
 */
export async function generateThumbnail(file) {
  if (!file) throw new Error('generateThumbnail: file is required')
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file) // older browsers: no orientation option
  }
  try {
    const scale = Math.min(1, THUMB_MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('generateThumbnail: 2D canvas context unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', THUMB_QUALITY)
  } finally {
    bitmap.close?.()
  }
}


// ─── uploadXray ──────────────────────────────────────────────────────────────

/**
 * Upload one X-ray. Order: validate → upload blob FIRST → insert row; on
 * row-insert failure, best-effort remove the orphaned blob. Throws on any
 * failure so a batch caller can record a per-file result and offer retry.
 *
 * @param {object} args
 * @param {string} args.patientId
 * @param {File}   args.file
 * @param {object} [args.metadata] { xray_type, date_taken, teeth_shown, notes, treatment_plan_id }
 * @param {string} [args.thumbnailDataUrl] base64 from generateThumbnail (optional)
 * @param {string} [args.batchId] shared uuid for a multi-file upload (optional)
 * @returns {Promise<object>} the inserted xrays row (snake_case, uploader embedded)
 */
export async function uploadXray({ patientId, file, metadata = {}, thumbnailDataUrl = null, batchId = null }) {
  if (!patientId) throw new Error('uploadXray: patientId is required')
  if (!file) throw new Error('uploadXray: file is required')
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Unsupported file type. X-rays must be JPG, PNG, or WebP.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File exceeds the 25 MB limit.')
  }

  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await currentUserId()

  // Validate metadata BEFORE touching Storage so a bad field doesn't leave a blob.
  const xrayType = assertXrayType(metadata.xray_type)
  const dateTaken = normalizeDate(metadata.date_taken)
  const teeth = normalizeTeeth(metadata.teeth_shown)
  const notes = metadata.notes ? sanitizeNotes(metadata.notes) : null
  const treatmentPlanId = metadata.treatment_plan_id || null

  const xrayId = crypto.randomUUID()
  const ext = deriveExt(file.name, file.type) || 'jpg'
  const storagePath = `${orgId}/${patientId}/${xrayId}.${ext}`

  // Step 1: upload the blob (upsert:false → a UUID collision errors, not silently overwrites).
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type })
  if (upErr) throw upErr

  // Step 2: insert the row; on failure drop the orphaned blob.
  const { data: row, error: rowErr } = await supabase
    .from('xrays')
    .insert({
      org_id: orgId,
      patient_id: patientId,
      treatment_plan_id: treatmentPlanId,
      file_name: sanitizeFileName(file.name),
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: Number.isFinite(file.size) ? file.size : null,
      thumbnail_data_url: sanitizeThumbnail(thumbnailDataUrl),
      xray_type: xrayType,
      date_taken: dateTaken,
      teeth_shown: teeth,
      notes,
      batch_id: batchId || null,
      uploaded_by: userId,
    })
    .select(SELECT_COLS)
    .single()

  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    throw rowErr
  }

  await logAuditEvent({
    orgId,
    action: 'xray.upload',
    entityType: 'xray',
    entityId: row.id,
    payload: { patient_id: patientId, xray_type: xrayType, batch_id: batchId || null },
  })

  return row
}


// ─── fetchXrays ──────────────────────────────────────────────────────────────

/** Patient's X-rays, newest-taken first (created_at as a stable tiebreaker). */
export async function fetchXrays(patientId) {
  if (!patientId) throw new Error('fetchXrays: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('xrays')
    .select(SELECT_COLS)
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('date_taken', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}


// ─── fetchXraysByBatch ───────────────────────────────────────────────────────

/** All X-rays sharing a batch_id (org-scoped) — for batch-upload retry/review. */
export async function fetchXraysByBatch(batchId) {
  if (!batchId) throw new Error('fetchXraysByBatch: batchId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('xrays')
    .select(SELECT_COLS)
    .eq('org_id', orgId)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}


// ─── updateXray (metadata edit) ──────────────────────────────────────────────

/**
 * Edit an X-ray's metadata (the image blob is immutable — replace = delete +
 * re-upload). Only known fields are accepted; each is validated. updated_at is
 * set here (no DB trigger relied upon).
 */
export async function updateXray(xrayId, updates = {}) {
  if (!xrayId) throw new Error('updateXray: xrayId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = { updated_at: new Date().toISOString() }
  if (updates.xray_type !== undefined) patch.xray_type = assertXrayType(updates.xray_type)
  if (updates.date_taken !== undefined) patch.date_taken = normalizeDate(updates.date_taken)
  if (updates.teeth_shown !== undefined) patch.teeth_shown = normalizeTeeth(updates.teeth_shown)
  if (updates.notes !== undefined) patch.notes = updates.notes ? sanitizeNotes(updates.notes) : null
  if (updates.treatment_plan_id !== undefined) patch.treatment_plan_id = updates.treatment_plan_id || null

  // patch always carries updated_at; if that's the ONLY key, no real edit was
  // requested — avoid a no-op write + a meaningless audit row.
  if (Object.keys(patch).length === 1) {
    throw new Error('updateXray: no editable fields provided')
  }

  const { data: row, error } = await supabase
    .from('xrays')
    .update(patch)
    .eq('id', xrayId)
    .eq('org_id', orgId)
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'xray.update',
    entityType: 'xray',
    entityId: xrayId,
    payload: { fields: Object.keys(patch).filter(k => k !== 'updated_at') },
  })

  return row
}


// ─── deleteXray ──────────────────────────────────────────────────────────────

/**
 * Delete an X-ray. Removes the row FIRST (authoritative — no ghost row that
 * 404s the lightbox), then best-effort removes the Storage object. A failed
 * blob removal is logged but does NOT block (leaves a quota-wasting orphan,
 * preferable to a dangling row).
 */
export async function deleteXray(xrayId) {
  if (!xrayId) throw new Error('deleteXray: xrayId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: row, error: fErr } = await supabase
    .from('xrays')
    .select('id, storage_path')
    .eq('id', xrayId)
    .eq('org_id', orgId)
    .single()
  if (fErr) throw fErr

  const { error: dErr } = await supabase
    .from('xrays')
    .delete()
    .eq('id', xrayId)
    .eq('org_id', orgId)
  if (dErr) throw dErr

  let blobRemoved = true
  if (row?.storage_path) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([row.storage_path])
    if (sErr) {
      blobRemoved = false
      console.warn('[xrays] orphaned blob not removed:', row.storage_path, sErr)
    }
  }

  await logAuditEvent({
    orgId,
    action: 'xray.delete',
    entityType: 'xray',
    entityId: xrayId,
    payload: { blob_removed: blobRemoved }, // trace orphan-blob leaks via audit_log
  })
}


// ─── getXraySignedUrl ────────────────────────────────────────────────────────

/**
 * 1-hour signed URL for the X-ray's full-size object (lightbox). Takes the
 * xrayId (not a raw path) so the org-scoped row lookup re-validates access and
 * an xray.view audit event is logged — mirrors getDocumentSignedUrl.
 */
export async function getXraySignedUrl(xrayId, expiresIn = 3600) {
  if (!xrayId) throw new Error('getXraySignedUrl: xrayId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: row, error } = await supabase
    .from('xrays')
    .select('id, storage_path, file_name')
    .eq('id', xrayId)
    .eq('org_id', orgId)
    .single()
  if (error) throw error

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, expiresIn)
  if (sErr) throw sErr

  await logAuditEvent({
    orgId,
    action: 'xray.view',
    entityType: 'xray',
    entityId: row.id,
  })

  return { url: signed?.signedUrl || null, fileName: row.file_name }
}
