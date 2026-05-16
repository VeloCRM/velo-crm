/**
 * Velo CRM — prescriptions data layer.
 *
 * Targets the schema added in commit 1 (PR #2):
 *   - prescriptions       — parent: header + audit + GHL import keys
 *   - prescription_items  — child: line items, denormalized org_id, ON DELETE CASCADE
 *
 * Per-doctor prescription pad templates (used by the print component in
 * commit 3) are uploaded via PR #17 helpers in src/lib/database.js:
 *   uploadPrescriptionTemplate / getPrescriptionTemplateSignedUrl.
 *
 * Every helper:
 *   - calls requireUser() — throws if not authenticated,
 *   - resolves the caller's org_id via getCurrentOrgId() and pins it on
 *     every query for defense in depth on top of RLS,
 *   - sanitizes user-supplied text fields BEFORE any DB write,
 *   - calls logAuditEvent on every successful mutation (read-only helpers
 *     are silent; print intent has its own dedicated helper).
 *
 * Shape convention: snake_case in and out. Matches src/lib/dental.js and the
 * raw Supabase wire shape consumed by DentalTabs.jsx. No camelCase mappers.
 *
 * Atomicity for createPrescription mirrors createTreatmentPlan
 * (src/lib/dental.js:338): sanitize everything first, parent insert, items
 * batch, best-effort orphan-parent rollback if items fail. updatePrescription
 * extends this discipline to wholesale-item-replace with a previous-items
 * snapshot for recovery.
 */

import { supabase } from './supabase'
import { sanitizeText, sanitizeNotes } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'


// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Defense-in-depth check: ensures the proposed doctor_id refers to a profile
 * with role='doctor' in the caller's org. The schema trigger
 * (enforce_prescription_doctor_role at schema.sql:1789) is the authoritative
 * gate; this fast-fail surfaces a clean message earlier and avoids leaking
 * SQL internals via the trigger's RAISE EXCEPTION text.
 */
async function assertDoctorInOrg(doctorId, orgId) {
  if (!doctorId) throw new Error('doctor_id is required')
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', doctorId)
    .eq('role', 'doctor')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error('Selected user is not a doctor in this clinic')
  }
}

/**
 * Resolve auth.uid() for created_by / updated_by audit columns. Defensive
 * null-safety; requireUser() has already ensured a session by the time this
 * runs in normal flows.
 */
async function currentUserId() {
  const result = await supabase.auth.getUser()
  return result.data.user?.id ?? null
}

/**
 * Sanitize one item row, stamping org_id + prescription_id + sort_order.
 * `idx` is used as the default sort_order when the caller doesn't provide one.
 * prescription_id is filled by the caller after the parent insert returns.
 */
function sanitizeItem(it, idx, prescriptionId, orgId) {
  return {
    org_id:          orgId,
    prescription_id: prescriptionId,
    drug_name:       sanitizeText(String(it.drug_name || ''), 200),
    dosage:          it.dosage       ? sanitizeText(String(it.dosage), 64)    : null,
    frequency:       it.frequency    ? sanitizeText(String(it.frequency), 64) : null,
    duration:        it.duration     ? sanitizeText(String(it.duration), 64)  : null,
    instructions:    it.instructions ? sanitizeNotes(String(it.instructions)) : null,
    sort_order:      Number.isInteger(it.sort_order) ? it.sort_order : idx,
  }
}


// ─── createPrescription ────────────────────────────────────────────────────

/**
 * Create a prescription with N items.
 *
 * Atomicity mirrors createTreatmentPlan: validate and sanitize everything
 * BEFORE any DB write, then parent insert, then items batch. On items
 * failure, best-effort delete the orphan parent so the table isn't left
 * with a header pointing to no medications. If rollback itself fails, the
 * original items error is surfaced — masking it would hide the actionable
 * problem.
 *
 * @param {string} patientId UUID of the patient (required)
 * @param {object} input
 * @param {string}  input.doctor_id              UUID; must be role='doctor' in current org
 * @param {string} [input.issued_at]             ISO timestamptz; defaults to now()
 * @param {string} [input.general_instructions]  Free-text overall guidance
 * @param {string} [input.external_id]           GHL/external import id; null for native
 * @param {string} [input.external_source]       e.g. 'ghl'; null for native
 * @param {Array}   input.items                  At least one item with drug_name
 * @returns {Promise<string>} New prescription UUID. Caller reloads via
 *                            fetchPrescriptionsForPatient.
 */
export async function createPrescription(patientId, input = {}) {
  if (!patientId) throw new Error('createPrescription: patientId is required')
  const {
    doctor_id,
    issued_at,
    general_instructions,
    external_id,
    external_source,
    items,
  } = input

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('createPrescription: at least one item is required')
  }

  await requireUser()
  const orgId = await getCurrentOrgId()
  await assertDoctorInOrg(doctor_id, orgId)
  const userId = await currentUserId()

  // Sanitize items first so we abort BEFORE writing the parent if any item is bad.
  // org_id is stamped now; prescription_id is stamped after parent insert.
  const safeItems = items.map((it, idx) =>
    sanitizeItem(it, idx, /* prescriptionId */ null, orgId)
  )
  for (const it of safeItems) {
    if (!it.drug_name) {
      throw new Error('createPrescription: every item needs a drug_name')
    }
  }

  // Step 1: insert the prescription header.
  const { data: parent, error: parentErr } = await supabase
    .from('prescriptions')
    .insert({
      org_id:               orgId,
      patient_id:           patientId,
      doctor_id,
      issued_at:            issued_at || new Date().toISOString(),
      general_instructions: general_instructions ? sanitizeNotes(String(general_instructions)) : null,
      created_by:           userId,
      external_id:          external_id     || null,
      external_source:      external_source || null,
    })
    .select('id')
    .single()
  if (parentErr) throw parentErr

  // Step 2: stamp prescription_id and batch-insert items.
  const itemRows = safeItems.map(it => ({ ...it, prescription_id: parent.id }))
  const { error: itemsErr } = await supabase
    .from('prescription_items')
    .insert(itemRows)
  if (itemsErr) {
    // Best-effort rollback: drop the orphan parent. RLS lets us delete a row
    // we just inserted. If rollback itself fails, surface the original error.
    await supabase
      .from('prescriptions')
      .delete()
      .eq('id', parent.id)
      .eq('org_id', orgId)
    throw itemsErr
  }

  await logAuditEvent({
    orgId,
    action:     'prescription.create',
    entityType: 'prescription',
    entityId:   parent.id,
    payload: {
      patient_id:  patientId,
      doctor_id,
      item_count:  safeItems.length,
      is_imported: Boolean(external_id),
    },
  })

  return parent.id
}


// ─── fetchPrescriptionsForPatient ──────────────────────────────────────────

/**
 * Returns the patient's prescriptions, most-recently-issued first, with
 * items and doctor name joined.
 *
 * Sort key is issued_at (clinical date), NOT created_at — backdated entries
 * land in their clinical position rather than at the bottom.
 *
 * Items are sorted by sort_order ASC in JS (Supabase REST doesn't honor a
 * nested ORDER BY through embedded selects).
 */
export async function fetchPrescriptionsForPatient(patientId) {
  if (!patientId) throw new Error('fetchPrescriptionsForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      id, patient_id, doctor_id, issued_at, general_instructions,
      created_by, created_at, updated_at, updated_by,
      external_id, external_source,
      doctor:doctor_id(id, full_name),
      prescription_items(id, drug_name, dosage, frequency, duration, instructions, sort_order)
    `)
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('issued_at', { ascending: false })
  if (error) throw error

  return (data || []).map(p => ({
    ...p,
    prescription_items: (p.prescription_items || []).slice().sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    ),
  }))
}


// ─── updatePrescription ────────────────────────────────────────────────────

/**
 * Edit-in-place: patch the header + optionally wholesale-replace items.
 *
 * Items handling: snapshot existing items → delete → batch-insert new set.
 * If insert fails, attempt to re-insert the snapshot for recovery. If the
 * recovery itself fails, throw a fat error containing previousItems JSON so
 * manual recovery is possible. If recovery succeeds, surface the original
 * insert error (mirrors createTreatmentPlan's "don't mask" discipline).
 *
 * updated_at + updated_by are always set, even when only items changed —
 * the BEFORE UPDATE trigger maintains updated_at as a backstop, but setting
 * explicitly keeps the audit columns paired.
 *
 * @param {string} id    UUID of the prescription
 * @param {object} patch Partial header + optional items[] for wholesale replace
 */
export async function updatePrescription(id, patch = {}) {
  if (!id) throw new Error('updatePrescription: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await currentUserId()

  // Validate doctor_id BEFORE any write — fast-fail UX.
  if (patch.doctor_id !== undefined && patch.doctor_id !== null) {
    await assertDoctorInOrg(patch.doctor_id, orgId)
  }

  // Build the parent patch. Always include updated_at + updated_by.
  const parentPatch = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
  if (patch.doctor_id !== undefined) parentPatch.doctor_id = patch.doctor_id
  if (patch.issued_at !== undefined) parentPatch.issued_at = patch.issued_at
  if (patch.general_instructions !== undefined) {
    parentPatch.general_instructions = patch.general_instructions
      ? sanitizeNotes(String(patch.general_instructions))
      : null
  }
  if (patch.external_id     !== undefined) parentPatch.external_id     = patch.external_id     || null
  if (patch.external_source !== undefined) parentPatch.external_source = patch.external_source || null

  const { error: parentErr } = await supabase
    .from('prescriptions')
    .update(parentPatch)
    .eq('id', id)
    .eq('org_id', orgId)
  if (parentErr) throw parentErr

  // Wholesale-replace items if the patch includes an items array.
  let itemsReplaced = false
  if (Array.isArray(patch.items)) {
    itemsReplaced = true

    // Sanitize the new set BEFORE touching the DB so a bad row aborts early.
    const safeItems = patch.items.map((it, idx) => sanitizeItem(it, idx, id, orgId))
    for (const it of safeItems) {
      if (!it.drug_name) {
        throw new Error('updatePrescription: every item needs a drug_name')
      }
    }

    // Snapshot existing items (full row shape) for rollback potential.
    const { data: previousItems, error: snapErr } = await supabase
      .from('prescription_items')
      .select('*')
      .eq('prescription_id', id)
      .eq('org_id', orgId)
    if (snapErr) throw snapErr

    // Delete the current set.
    const { error: delErr } = await supabase
      .from('prescription_items')
      .delete()
      .eq('prescription_id', id)
      .eq('org_id', orgId)
    if (delErr) throw delErr

    // Insert the new set.
    if (safeItems.length > 0) {
      const { error: insErr } = await supabase
        .from('prescription_items')
        .insert(safeItems)

      if (insErr) {
        // Recovery: re-INSERT the previous items so the prescription isn't
        // left with zero items. Strip auto-managed columns (id, created_at)
        // so Postgres regenerates them.
        const rollbackRows = (previousItems || []).map(p => {
          const { id: _id, created_at: _ca, ...rest } = p
          return rest
        })

        if (rollbackRows.length > 0) {
          const { error: rollErr } = await supabase
            .from('prescription_items')
            .insert(rollbackRows)

          if (rollErr) {
            // Recovery failed too — surface a fat error that carries the
            // lost data inline so manual recovery is possible.
            const err = new Error(
              'updatePrescription: items insert failed AND rollback failed. ' +
              `Original error: ${insErr.message}. ` +
              `Rollback error: ${rollErr.message}. ` +
              `Previous items (manual recovery): ${JSON.stringify(previousItems)}`
            )
            err.cause = insErr
            throw err
          }
        }
        // Recovery succeeded (or there were no previous items to restore).
        // Surface the original insert error — don't mask.
        throw insErr
      }
    }
  }

  await logAuditEvent({
    orgId,
    action:     'prescription.update',
    entityType: 'prescription',
    entityId:   id,
    payload: {
      fields:         Object.keys(parentPatch).filter(k => k !== 'updated_at' && k !== 'updated_by'),
      items_replaced: itemsReplaced,
    },
  })
}


// ─── deletePrescription ────────────────────────────────────────────────────

/**
 * Delete a prescription. The FK on prescription_items has ON DELETE CASCADE
 * so child items are removed automatically.
 */
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
    action:     'prescription.delete',
    entityType: 'prescription',
    entityId:   id,
  })
}


// ─── fetchPrescriptionForPrint ─────────────────────────────────────────────

/**
 * Single-shot fetch for the print component. Embeds items + doctor (with
 * prescription_template_url for the overlay background) + patient (full_name,
 * dob, gender for the print header).
 *
 * Does NOT log an audit event. The print intent is captured by
 * logPrescriptionPrint, fired separately when the user clicks Print inside
 * the preview modal — fetch is data loading, not print intent.
 *
 * Returns null if the prescription doesn't exist (or is invisible due to RLS).
 */
export async function fetchPrescriptionForPrint(id) {
  if (!id) throw new Error('fetchPrescriptionForPrint: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      id, patient_id, doctor_id, issued_at, general_instructions,
      created_at, updated_at,
      doctor:doctor_id(id, full_name, prescription_template_url),
      patient:patient_id(id, full_name, dob, gender),
      prescription_items(id, drug_name, dosage, frequency, duration, instructions, sort_order)
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    ...data,
    prescription_items: (data.prescription_items || []).slice().sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    ),
  }
}


// ─── logPrescriptionPrint ──────────────────────────────────────────────────

/**
 * Dedicated audit helper for print intent. Called from the print preview
 * modal's "Print" button onClick at the moment window.print() is invoked.
 * Separating this from fetchPrescriptionForPrint avoids logging cancelled-
 * print noise (user opens preview, decides not to print).
 *
 * Idempotency: repeated print clicks log repeated events. Intentional — each
 * click IS a separate print attempt.
 */
export async function logPrescriptionPrint(id) {
  if (!id) throw new Error('logPrescriptionPrint: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  await logAuditEvent({
    orgId,
    action:     'prescription.print',
    entityType: 'prescription',
    entityId:   id,
  })
}
