import { supabase } from './supabase'
import { todayLocal } from './date'

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
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
  const [contactRes, treatmentsRes, prescriptionsRes, xraysRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('medical_history, dental_chart')
      .eq('id', contactId)
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
  // generation logs a warning and yields signedUrl=null so the rest of the
  // batch still loads. UI handles null with a placeholder (Commit 5 scope).
  const xraysWithUrls = await Promise.all(
    (xraysRes.data || []).map(async (row) => {
      const mapped = mapXray(row)
      try {
        mapped.signedUrl = await getXraySignedUrl(mapped.storagePath)
      } catch (err) {
        console.warn('X-ray signed URL gen failed:', mapped.id, err)
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
  const { error } = await supabase
    .from('contacts')
    .update({ medical_history: history })
    .eq('id', contactId)
  if (error) throw error
}

export async function updateDentalChart(contactId, teeth) {
  const { error } = await supabase
    .from('contacts')
    .update({ dental_chart: teeth })
    .eq('id', contactId)
  if (error) throw error
}


// ─── Treatments ─────────────────────────────────────────────────────────────

export async function addTreatment(orgId, contactId, t) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('treatments')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      procedure: t.procedure,
      tooth: t.tooth || '',
      cost: Number(t.cost) || 0,
      currency: t.currency || 'IQD',
      status: t.status || 'planned',
      treatment_date: t.treatmentDate || null,
      notes: t.notes || '',
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  return mapTreatment(data)
}

export async function updateTreatment(id, updates) {
  const patch = {}
  if (updates.procedure !== undefined) patch.procedure = updates.procedure
  if (updates.tooth !== undefined) patch.tooth = updates.tooth
  if (updates.cost !== undefined) patch.cost = Number(updates.cost) || 0
  if (updates.currency !== undefined) patch.currency = updates.currency
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.treatmentDate !== undefined) patch.treatment_date = updates.treatmentDate || null
  if (updates.notes !== undefined) patch.notes = updates.notes

  const { data, error } = await supabase
    .from('treatments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapTreatment(data)
}

export async function deleteTreatment(id) {
  const { error } = await supabase.from('treatments').delete().eq('id', id)
  if (error) throw error
}


// ─── Prescriptions ──────────────────────────────────────────────────────────

export async function addPrescription(orgId, contactId, rx) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      medication: rx.medication,
      dosage: rx.dosage || '',
      duration: rx.duration || '',
      notes: rx.notes || '',
      prescribed_date: rx.prescribedDate || todayLocal(),
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  return mapPrescription(data)
}

export async function deletePrescription(id) {
  const { error } = await supabase.from('prescriptions').delete().eq('id', id)
  if (error) throw error
}


// ─── X-rays (Storage + DB metadata coordination) ────────────────────────────

export async function uploadXray(orgId, contactId, file, meta = {}) {
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
      file_name: file.name || `xray-${xrayId}.${ext}`,
      storage_path: storagePath,
      mime_type: file.type || 'image/jpeg',
      size_bytes: file.size || 0,
      taken_date: meta.takenDate || todayLocal(),
      notes: meta.notes || '',
      created_by: userId,
    })
    .select()
    .single()
  if (insertErr) {
    // Best-effort cleanup of the orphaned blob; warn (not throw) on cleanup
    // failure so the caller still sees the original insert failure.
    try {
      await supabase.storage.from(XRAY_BUCKET).remove([storagePath])
    } catch (cleanupErr) {
      console.warn('X-ray storage cleanup failed after insert failure:', storagePath, cleanupErr)
    }
    throw insertErr
  }

  // 3. Generate a signed URL so the UI can render the just-uploaded image
  // without waiting for the next fetchContactDental.
  const signedUrl = await getXraySignedUrl(storagePath)
  return { ...mapXray(data), signedUrl }
}

export async function deleteXray(id, storagePath) {
  // Storage-first. If storage fails, the DB row stays — caller retries.
  // Prevents the "ghost row pointing at a deleted file" failure mode.
  const { error: storageErr } = await supabase.storage
    .from(XRAY_BUCKET)
    .remove([storagePath])
  if (storageErr) throw storageErr

  const { error: dbErr } = await supabase.from('xrays').delete().eq('id', id)
  if (dbErr) throw dbErr
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
