import { supabase } from './supabase'
import { todayLocal } from './date'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, sanitizeNotes, LIMITS, toSafeNumber } from './sanitize'

// ─── Constants ──────────────────────────────────────────────────────────────

const XRAY_BUCKET = 'dental-xrays'

// 1 hour. Matches getDocumentSignedUrl precedent in database.js. Doctor
// consultations routinely run 30+ minutes; shorter TTLs (e.g. 300s) cause
// signed URLs to expire mid-review. 1800 (30 min) is the safe lower bound
// if security tightening is desired later.
const XRAY_SIGNED_URL_TTL_SEC = 3600

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/dicom': 'dcm',
}


// ─── Internal helpers ───────────────────────────────────────────────────────

async function currentUserId() {
  const user = await requireUser()
  return user.id
}

// Caller-supplied orgId must match the session's resolved org_id. Without
// this, an attacker could pass another org's id to a helper that uses it in
// the INSERT payload and bypass tenant separation. RLS catches this too,
// but defense in depth.
async function assertOrgScope(orgId, fnName) {
  if (!orgId) throw new Error(`${fnName}: orgId is required`)
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error(`${fnName}: org_id mismatch with current session`)
  }
  return orgId
}

// Derive a file extension from (1) the filename, (2) the MIME type, or
// (3) fall back to 'jpg'. The alphabetic-only regex on the filename branch
// rejects "extensions" like "27" from filenames such as "Patient_2026.04.27".
// The extension is informational; RLS only cares about path segment 1 (org).
function deriveExt(file) {
  const fromName = (file.name || '').split('.').pop()
  if (fromName && fromName !== file.name && fromName.length <= 5 && /^[a-z]+$/i.test(fromName)) {
    return fromName.toLowerCase()
  }
  if (file.type && MIME_EXT[file.type]) return MIME_EXT[file.type]
  return 'jpg'
}


// ─── Contact-level dental data (single fetch, parallel sub-queries) ────────

export async function fetchContactDental(orgId, contactId) {
  await requireUser()
  await assertOrgScope(orgId, 'fetchContactDental')
  if (!contactId) throw new Error('fetchContactDental: contactId is required')

  const [contactRes, treatmentsRes, prescriptionsRes, xraysRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('medical_history, dental_chart')
      .eq('id', contactId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('treatments')
      .select('*')
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    supabase
      .from('prescriptions')
      .select('*')
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .order('prescribed_date', { ascending: false }),
    supabase
      .from('xrays')
      .select('*')
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .order('taken_date', { ascending: false }),
  ])
  if (contactRes.error) throw contactRes.error
  if (treatmentsRes.error) throw treatmentsRes.error
  if (prescriptionsRes.error) throw prescriptionsRes.error
  if (xraysRes.error) throw xraysRes.error

  // Pre-fetch signed URLs in parallel. Best-effort: a failed signed-URL
  // generation yields signedUrl=null so the rest of the batch still loads.
  // The UI handles null with a placeholder.
  const xraysWithUrls = await Promise.all(
    (xraysRes.data || []).map(async (row) => {
      const mapped = mapXray(row)
      try {
        mapped.signedUrl = await getXraySignedUrl(mapped.storagePath)
      } catch {
        mapped.signedUrl = null
      }
      return mapped
    })
  )

  return {
    medicalHistory: contactRes.data?.medical_history || {},
    dentalChart: contactRes.data?.dental_chart || {},
    treatments: (treatmentsRes.data || []).map(mapTreatment),
    prescriptions: (prescriptionsRes.data || []).map(mapPrescription),
    xrays: xraysWithUrls,
  }
}


// ─── Contact JSONB blob updates ─────────────────────────────────────────────

export async function updateMedicalHistory(contactId, history) {
  if (!contactId) throw new Error('updateMedicalHistory: contactId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('contacts')
    .update({ medical_history: history })
    .eq('id', contactId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'contact.medical_history_update',
    entityType: 'contact',
    entityId: contactId,
  })
}

export async function updateDentalChart(contactId, teeth) {
  if (!contactId) throw new Error('updateDentalChart: contactId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('contacts')
    .update({ dental_chart: teeth })
    .eq('id', contactId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'contact.dental_chart_update',
    entityType: 'contact',
    entityId: contactId,
  })
}


// ─── Treatments ─────────────────────────────────────────────────────────────

export async function addTreatment(orgId, contactId, t) {
  await requireUser()
  await assertOrgScope(orgId, 'addTreatment')
  if (!contactId) throw new Error('addTreatment: contactId is required')

  const userId = await currentUserId()
  const sanitized = {
    procedure: sanitizeText(t.procedure || '', 200),
    tooth: sanitizeText(t.tooth || '', 16),
    cost: Math.max(0, toSafeNumber(t.cost, 0)),
    currency: sanitizeText(t.currency || 'IQD', 8),
    status: sanitizeText(t.status || 'planned', 32),
    treatment_date: t.treatmentDate || null,
    notes: sanitizeNotes(t.notes || ''),
  }

  const { data, error } = await supabase
    .from('treatments')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      ...sanitized,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment.create',
    entityType: 'treatment',
    entityId: data?.id || null,
  })

  return mapTreatment(data)
}

export async function updateTreatment(id, updates) {
  if (!id) throw new Error('updateTreatment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = {}
  if (updates.procedure !== undefined) patch.procedure = sanitizeText(updates.procedure, 200)
  if (updates.tooth !== undefined) patch.tooth = sanitizeText(updates.tooth, 16)
  if (updates.cost !== undefined) patch.cost = Math.max(0, toSafeNumber(updates.cost, 0))
  if (updates.currency !== undefined) patch.currency = sanitizeText(updates.currency, 8)
  if (updates.status !== undefined) patch.status = sanitizeText(updates.status, 32)
  if (updates.treatmentDate !== undefined) patch.treatment_date = updates.treatmentDate || null
  if (updates.notes !== undefined) patch.notes = sanitizeNotes(updates.notes)

  const { data, error } = await supabase
    .from('treatments')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment.update',
    entityType: 'treatment',
    entityId: id,
    payload: { fields: Object.keys(patch) },
  })

  return mapTreatment(data)
}

export async function deleteTreatment(id) {
  if (!id) throw new Error('deleteTreatment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('treatments')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment.delete',
    entityType: 'treatment',
    entityId: id,
  })
}


// ─── Prescriptions ──────────────────────────────────────────────────────────

export async function addPrescription(orgId, contactId, rx) {
  await requireUser()
  await assertOrgScope(orgId, 'addPrescription')
  if (!contactId) throw new Error('addPrescription: contactId is required')

  const userId = await currentUserId()
  const sanitized = {
    medication: sanitizeText(rx.medication || '', 200),
    dosage: sanitizeText(rx.dosage || '', 64),
    duration: sanitizeText(rx.duration || '', 64),
    notes: sanitizeNotes(rx.notes || ''),
    prescribed_date: rx.prescribedDate || todayLocal(),
  }

  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      ...sanitized,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'prescription.create',
    entityType: 'prescription',
    entityId: data?.id || null,
  })

  return mapPrescription(data)
}

export async function deletePrescription(id) {
  if (!id) throw new Error('deletePrescription: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('prescriptions')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'prescription.delete',
    entityType: 'prescription',
    entityId: id,
  })
}


// ─── X-rays (Storage + DB metadata coordination) ────────────────────────────

export async function uploadXray(orgId, contactId, file, meta = {}) {
  await requireUser()
  await assertOrgScope(orgId, 'uploadXray')
  if (!contactId) throw new Error('uploadXray: contactId is required')
  if (!file) throw new Error('uploadXray: file is required')

  const userId = await currentUserId()
  const xrayId = crypto.randomUUID()
  const ext = deriveExt(file)
  const storagePath = `${orgId}/${contactId}/${xrayId}.${ext}`

  // 1. Upload to Storage. If this fails, no DB row is created.
  const { error: uploadErr } = await supabase.storage
    .from(XRAY_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })
  if (uploadErr) throw uploadErr

  // 2. Insert metadata row using the SAME UUID for the DB PK and the
  // storage path segment 3 (one xray = one row = one file).
  const { data, error: insertErr } = await supabase
    .from('xrays')
    .insert({
      id: xrayId,
      org_id: orgId,
      contact_id: contactId,
      file_name: sanitizeText(file.name || `xray-${xrayId}.${ext}`, 200),
      storage_path: storagePath,
      mime_type: file.type || 'image/jpeg',
      size_bytes: Math.max(0, toSafeNumber(file.size, 0)),
      taken_date: meta.takenDate || todayLocal(),
      notes: sanitizeNotes(meta.notes || ''),
      created_by: userId,
    })
    .select()
    .single()
  if (insertErr) {
    // Best-effort cleanup of the orphaned blob. The original insert failure
    // is what the caller cares about; a cleanup failure here would be
    // reported on top of the real one and just confuse the toast pipeline.
    await supabase.storage.from(XRAY_BUCKET).remove([storagePath]).catch(() => null)
    throw insertErr
  }

  await logAuditEvent({
    orgId,
    action: 'xray.upload',
    entityType: 'xray',
    entityId: xrayId,
    payload: { fileName: data.file_name },
  })

  // 3. Generate a signed URL so the UI can render the just-uploaded image
  // without waiting for the next fetchContactDental.
  const signedUrl = await getXraySignedUrl(storagePath)
  return { ...mapXray(data), signedUrl }
}

export async function deleteXray(id, storagePath) {
  if (!id) throw new Error('deleteXray: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Storage-first. If storage fails, the DB row stays — caller retries.
  // Prevents the "ghost row pointing at a deleted file" failure mode.
  const { error: storageErr } = await supabase.storage
    .from(XRAY_BUCKET)
    .remove([storagePath])
  if (storageErr) throw storageErr

  const { error: dbErr } = await supabase
    .from('xrays')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (dbErr) throw dbErr

  await logAuditEvent({
    orgId,
    action: 'xray.delete',
    entityType: 'xray',
    entityId: id,
  })
}

export async function getXraySignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from(XRAY_BUCKET)
    .createSignedUrl(storagePath, XRAY_SIGNED_URL_TTL_SEC)
  if (error) throw error
  return data.signedUrl
}


// ─── Mappers (DB rows → UI objects, table-specific date field names) ───────

function mapTreatment(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    procedure: row.procedure,
    tooth: row.tooth || '',
    cost: Number(row.cost) || 0,
    currency: row.currency || 'IQD',
    status: row.status,
    treatmentDate: row.treatment_date || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPrescription(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    medication: row.medication,
    dosage: row.dosage || '',
    duration: row.duration || '',
    notes: row.notes || '',
    prescribedDate: row.prescribed_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapXray(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    takenDate: row.taken_date || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
