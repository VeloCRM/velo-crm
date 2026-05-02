/**
 * Velo CRM — dental helpers (new schema).
 *
 * Backs the three patient-profile dental tabs:
 *   - Medical History (jsonb on patients.medical_history)
 *   - Allergies      (jsonb array on patients.allergies)
 *   - Dental Chart   (rows in dental_chart_entries)
 *   - Treatment Plan (rows in treatment_plans + treatment_plan_items)
 *
 * Same Phase 6 rigor as every other lib helper:
 *   - requireUser() / getCurrentOrgId() at the top of every public fn,
 *   - defense-in-depth `.eq('org_id', orgId)` on every query (RLS is the
 *     real boundary; this is a second wall),
 *   - sanitize user-supplied text/numbers BEFORE the supabase call,
 *   - logAuditEvent() on every successful mutation,
 *   - throw on any failure — no console.warn-and-swallow.
 *
 * Schema notes (src/lib/schema.sql is the source of truth):
 *   - tooth_number uses FDI two-digit notation (11..48). Quadrant 1 = upper
 *     right, 2 = upper left, 3 = lower left, 4 = lower right. The position
 *     digit is 1..8, so 19/20/29/30/39/40 are not valid FDI codes even
 *     though the schema CHECK is `BETWEEN 11 AND 48`. We reject those at
 *     the helper layer so a clear error fires before the round-trip.
 *   - finding enum: cavity, restoration, missing, crown, bridge, implant,
 *                   root_canal_done, healthy.
 *   - treatment_plan_status:    proposed, accepted, in_progress, completed, declined.
 *   - treatment_plan_item_status: pending, in_progress, completed, skipped.
 *   - currency on plans + items: 3-letter ISO (USD/IQD).
 */

import { supabase } from './supabase'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { sanitizeText, sanitizeNotes, toSafeNumber } from './sanitize'

// ─── Enum allow-lists ──────────────────────────────────────────────────────
// Mirrors the schema enums exactly. Any input that doesn't match throws so we
// never write invalid rows.
const DENTAL_FINDINGS = new Set([
  'cavity', 'restoration', 'missing', 'crown', 'bridge', 'implant',
  'root_canal_done', 'healthy',
])
const TOOTH_SURFACES = new Set([
  'mesial', 'distal', 'buccal', 'lingual', 'occlusal',
])
const PLAN_STATUSES = new Set([
  'proposed', 'accepted', 'in_progress', 'completed', 'declined',
])
const ITEM_STATUSES = new Set([
  'pending', 'in_progress', 'completed', 'skipped',
])
const CURRENCIES = new Set(['USD', 'IQD'])

// Valid FDI codes: quadrant ∈ {1,2,3,4}, position ∈ {1..8}. We accept only
// the 32 permanent-dentition codes (no primary 51..85 yet — add when needed).
function assertToothNumber(n) {
  const num = Number(n)
  if (!Number.isInteger(num)) {
    throw new Error(`tooth_number must be an integer FDI code, got "${n}"`)
  }
  const quadrant = Math.floor(num / 10)
  const position = num % 10
  if (quadrant < 1 || quadrant > 4 || position < 1 || position > 8) {
    throw new Error(`tooth_number must be a valid FDI code (11-18, 21-28, 31-38, 41-48), got "${n}"`)
  }
  return num
}

/** Public version of the FDI validator, for client-side form feedback. */
export function isValidFdiTooth(n) {
  const num = Number(n)
  if (!Number.isInteger(num)) return false
  const q = Math.floor(num / 10)
  const p = num % 10
  return q >= 1 && q <= 4 && p >= 1 && p <= 8
}

function assertSurface(s) {
  if (s == null || s === '') return null
  const safe = sanitizeText(String(s), 16).toLowerCase()
  if (!TOOTH_SURFACES.has(safe)) {
    throw new Error(`surface must be one of mesial/distal/buccal/lingual/occlusal, got "${s}"`)
  }
  return safe
}

function assertFinding(f) {
  const safe = sanitizeText(String(f || ''), 32).toLowerCase()
  if (!DENTAL_FINDINGS.has(safe)) {
    throw new Error(`unsupported dental finding "${f}"`)
  }
  return safe
}

function assertPlanStatus(s) {
  const safe = sanitizeText(String(s || ''), 32).toLowerCase()
  if (!PLAN_STATUSES.has(safe)) {
    throw new Error(`unsupported treatment_plan status "${s}"`)
  }
  return safe
}

function assertItemStatus(s) {
  const safe = sanitizeText(String(s || ''), 32).toLowerCase()
  if (!ITEM_STATUSES.has(safe)) {
    throw new Error(`unsupported treatment_plan_item status "${s}"`)
  }
  return safe
}

function assertCurrency(c) {
  const safe = sanitizeText(String(c || ''), 8).toUpperCase()
  if (!CURRENCIES.has(safe)) {
    throw new Error(`unsupported currency "${c}"`)
  }
  return safe
}


// ═══════════════════════════════════════════════════════════════════════════
// MEDICAL HISTORY  (patients.medical_history jsonb)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read the medical_history blob for a patient. Returns the jsonb object,
 * defaulting to {} when absent.
 */
export async function fetchPatientMedicalHistory(patientId) {
  if (!patientId) throw new Error('fetchPatientMedicalHistory: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('patients')
    .select('medical_history')
    .eq('id', patientId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Patient not found in your org')
  return data.medical_history || {}
}

/**
 * Write the medical_history blob. Caller is responsible for shape; we don't
 * lock the JSON schema yet (the form layer already constrains it).
 */
export async function updatePatientMedicalHistory(patientId, history) {
  if (!patientId) throw new Error('updatePatientMedicalHistory: patientId is required')
  if (history == null || typeof history !== 'object' || Array.isArray(history)) {
    throw new Error('updatePatientMedicalHistory: history must be an object')
  }
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('patients')
    .update({ medical_history: history })
    .eq('id', patientId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'patient.medical_history_update',
    entityType: 'patient',
    entityId: patientId,
    payload: { keys: Object.keys(history) },
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// ALLERGIES  (patients.allergies jsonb array)
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchPatientAllergies(patientId) {
  if (!patientId) throw new Error('fetchPatientAllergies: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('patients')
    .select('allergies')
    .eq('id', patientId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Patient not found in your org')
  return Array.isArray(data.allergies) ? data.allergies : []
}

export async function updatePatientAllergies(patientId, allergiesArray) {
  if (!patientId) throw new Error('updatePatientAllergies: patientId is required')
  if (!Array.isArray(allergiesArray)) {
    throw new Error('updatePatientAllergies: allergies must be an array')
  }
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Sanitize each allergy string; drop empties; cap length per item.
  const safe = allergiesArray
    .map(a => sanitizeText(String(a || ''), 80).trim())
    .filter(Boolean)
    .slice(0, 64) // sanity cap

  const { error } = await supabase
    .from('patients')
    .update({ allergies: safe })
    .eq('id', patientId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'patient.allergies_update',
    entityType: 'patient',
    entityId: patientId,
    payload: { count: safe.length },
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// DENTAL CHART ENTRIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List every chart entry for a patient, newest first. Includes the recorder's
 * profile join so the UI can show "by Dr. X" without a second query.
 */
export async function fetchDentalChartEntries(patientId) {
  if (!patientId) throw new Error('fetchDentalChartEntries: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('dental_chart_entries')
    .select('id, tooth_number, surface, finding, notes, recorded_at, recorded_by, recorder:recorded_by(id, full_name)')
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addDentalChartEntry(patientId, { tooth_number, surface = null, finding, notes = null }) {
  if (!patientId) throw new Error('addDentalChartEntry: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = (await supabase.auth.getUser()).data.user?.id || null

  const safe = {
    org_id: orgId,
    patient_id: patientId,
    tooth_number: assertToothNumber(tooth_number),
    surface: assertSurface(surface),
    finding: assertFinding(finding),
    notes: notes ? sanitizeNotes(notes) : null,
    recorded_by: userId,
  }

  const { data, error } = await supabase
    .from('dental_chart_entries')
    .insert(safe)
    .select('id, tooth_number, surface, finding, notes, recorded_at, recorded_by, recorder:recorded_by(id, full_name)')
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'dental_chart.add',
    entityType: 'dental_chart_entry',
    entityId: data?.id || null,
    payload: { patient_id: patientId, tooth_number: safe.tooth_number, finding: safe.finding },
  })

  return data
}

export async function removeDentalChartEntry(entryId) {
  if (!entryId) throw new Error('removeDentalChartEntry: entryId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('dental_chart_entries')
    .delete()
    .eq('id', entryId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'dental_chart.remove',
    entityType: 'dental_chart_entry',
    entityId: entryId,
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT PLANS + ITEMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List every treatment plan for a patient, with nested items. Newest plan first.
 */
export async function fetchTreatmentPlansForPatient(patientId) {
  if (!patientId) throw new Error('fetchTreatmentPlansForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('treatment_plans')
    .select(`
      id, patient_id, doctor_id, status, total_amount_minor, currency, notes,
      created_at, updated_at,
      doctor:doctor_id(id, full_name),
      treatment_plan_items(id, tooth_number, surface, procedure_code, procedure_label,
                           amount_minor, currency, status, sequence)
    `)
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  // Sort items by sequence within each plan; the nested join doesn't honor
  // an inner ORDER BY through the Supabase REST layer.
  return (data || []).map(plan => ({
    ...plan,
    treatment_plan_items: (plan.treatment_plan_items || []).slice().sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0)
    ),
  }))
}

/**
 * Create a new treatment plan with its items in a single round-trip per table.
 *
 * items shape: [{ tooth_number, surface?, procedure_code?, procedure_label,
 *                  amount_minor, status?, sequence? }]
 */
export async function createTreatmentPlan(patientId, { doctor_id = null, status = 'proposed', currency, notes = null, items = [] } = {}) {
  if (!patientId) throw new Error('createTreatmentPlan: patientId is required')
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('createTreatmentPlan: at least one item is required')
  }
  await requireUser()
  const orgId = await getCurrentOrgId()

  const safeCurrency = assertCurrency(currency)
  const safeStatus = assertPlanStatus(status)

  // Sanitize items first so we abort before writing the plan if any item is bad.
  const safeItems = items.map((it, idx) => {
    const amountMinor = Math.max(0, toSafeNumber(it.amount_minor ?? it.amountMinor, 0))
    return {
      org_id: orgId,
      tooth_number: it.tooth_number != null ? assertToothNumber(it.tooth_number) : null,
      surface: assertSurface(it.surface),
      procedure_code: sanitizeText(String(it.procedure_code || it.procedure_label || ''), 64) || 'custom',
      procedure_label: sanitizeText(String(it.procedure_label || ''), 200),
      amount_minor: amountMinor,
      currency: safeCurrency,
      status: it.status ? assertItemStatus(it.status) : 'pending',
      sequence: Number.isInteger(it.sequence) ? it.sequence : idx,
    }
  })

  // Validate that every item has a label — empty plans are nonsense.
  for (const it of safeItems) {
    if (!it.procedure_label) {
      throw new Error('createTreatmentPlan: every item needs a procedure_label')
    }
  }

  const totalMinor = safeItems.reduce((s, it) => s + Number(it.amount_minor || 0), 0)

  // Step 1: insert the plan header.
  const { data: plan, error: planErr } = await supabase
    .from('treatment_plans')
    .insert({
      org_id: orgId,
      patient_id: patientId,
      doctor_id: doctor_id || null,
      status: safeStatus,
      total_amount_minor: totalMinor,
      currency: safeCurrency,
      notes: notes ? sanitizeNotes(notes) : null,
    })
    .select('id')
    .single()
  if (planErr) throw planErr

  // Step 2: insert items in batch with the new plan_id.
  const itemRows = safeItems.map(it => ({ ...it, treatment_plan_id: plan.id }))
  const { error: itemsErr } = await supabase
    .from('treatment_plan_items')
    .insert(itemRows)
  if (itemsErr) {
    // Best-effort rollback: drop the orphan plan header. RLS lets us delete
    // a row we just created; if the rollback itself fails we surface the
    // original error.
    await supabase.from('treatment_plans').delete().eq('id', plan.id).eq('org_id', orgId)
    throw itemsErr
  }

  await logAuditEvent({
    orgId,
    action: 'treatment_plan.create',
    entityType: 'treatment_plan',
    entityId: plan.id,
    payload: {
      patient_id: patientId,
      itemCount: safeItems.length,
      totalAmountMinor: totalMinor,
      currency: safeCurrency,
    },
  })

  return plan.id
}

export async function updateTreatmentPlanStatus(planId, status) {
  if (!planId) throw new Error('updateTreatmentPlanStatus: planId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safeStatus = assertPlanStatus(status)

  const { error } = await supabase
    .from('treatment_plans')
    .update({ status: safeStatus })
    .eq('id', planId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment_plan.status_change',
    entityType: 'treatment_plan',
    entityId: planId,
    payload: { status: safeStatus },
  })
}

export async function removeTreatmentPlan(planId) {
  if (!planId) throw new Error('removeTreatmentPlan: planId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('treatment_plans')
    .delete()
    .eq('id', planId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment_plan.remove',
    entityType: 'treatment_plan',
    entityId: planId,
  })
}

/**
 * Update a single line-item's status. The row's parent plan must belong to the
 * caller's org — we verify that explicitly (defense in depth above the cross-
 * table RLS join).
 */
export async function updateTreatmentPlanItemStatus(itemId, status) {
  if (!itemId) throw new Error('updateTreatmentPlanItemStatus: itemId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const safeStatus = assertItemStatus(status)

  // Defense-in-depth lookup: confirm the item belongs to a plan in this org.
  const { data: item, error: lookupErr } = await supabase
    .from('treatment_plan_items')
    .select('id, treatment_plan_id, org_id')
    .eq('id', itemId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!item) throw new Error('Treatment plan item not found in your org')

  const { error } = await supabase
    .from('treatment_plan_items')
    .update({ status: safeStatus })
    .eq('id', itemId)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'treatment_plan_item.status_change',
    entityType: 'treatment_plan_item',
    entityId: itemId,
    payload: { status: safeStatus, treatment_plan_id: item.treatment_plan_id },
  })
}
