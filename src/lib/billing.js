/**
 * Velo CRM — Billing & Collections data layer (V1.5 Slice 2).
 *
 * Backs the append-only charges/payments ledger shipped in
 * scripts/billing-charges-payments-migration.sql (live on staging). Mirrors the
 * conventions in database.js: requireUser → getCurrentOrgId → sanitize → insert
 * → logAuditEvent → return a mapped object, with `.eq('org_id', orgId)` on every
 * query for defense in depth on top of RLS.
 *
 * Integrity model (design §2–§5):
 *   - Balance is DERIVED, never stored: owed(patient, CUR) =
 *     Σ(active charges) − Σ(active payments), per currency, never blended.
 *   - Append-only. No UPDATE/DELETE (revoked at the DB). A wrong charge/payment
 *     is corrected by APPENDING a void/reversal row that references the original.
 *   - "active" row = a positive row (kind 'charge'/'payment') whose id is NOT
 *     referenced by any reverses_id; void/reversal rows never count as positive.
 *     This matches the SQL proven in the Slice 1 dry-run.
 *   - Corrections (void/reversal) are OPERATOR-ONLY. The RLS `is_operator()`
 *     INSERT policy is the real gate; requireOperator() here is defense in depth.
 *
 * Operator/impersonation note: reversePayment/voidCharge stamp org_id from
 * getCurrentOrgId(), which returns the EFFECTIVE (impersonated) org — not the
 * operator's own profile org. Because charges.created_by / payments.recorded_by
 * FK to `profiles` (clinic members) and operators have no profiles row, the
 * correction rows mirror the ORIGINAL row's creator; the true actor (the
 * operator) is recorded in audit_log via logAuditEvent's impersonation context.
 */

import { supabase } from './supabase'
import { sanitizeText, sanitizeNotes, toSafeNumber } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'
import { insertPayment } from './database'

const DESCRIPTION_MAX = 500

// ─── Mappers (snake_case row → camelCase; include the ledger columns) ────────

function mapCharge(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
    treatmentPlanItemId: row.treatment_plan_item_id || null,
    doctorId: row.doctor_id,
    kind: row.kind,
    reversesId: row.reverses_id || null,
    description: row.description || '',
    amountMinor: row.amount_minor != null ? Number(row.amount_minor) : 0,
    currency: row.currency,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  }
}

// Superset of database.js mapPayment — also surfaces the new ledger columns
// (kind / reversesId / chargeId) that the plain mapPayment omits.
function mapBillingPayment(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
    kind: row.kind,
    reversesId: row.reverses_id || null,
    chargeId: row.charge_id || null,
    treatmentPlanId: row.treatment_plan_id || null,
    amountMinor: row.amount_minor != null ? Number(row.amount_minor) : 0,
    currency: row.currency,
    method: row.method,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  }
}

// ─── Shared internals ────────────────────────────────────────────────────────

async function authUserId() {
  return (await supabase.auth.getUser()).data.user?.id
}

/**
 * Defense-in-depth operator gate. The RLS `is_operator()` INSERT policy is the
 * real boundary; this gives a clear client-side error before the round-trip.
 * Backed by the `operators` self-select (RLS: operators_self_select).
 */
async function requireOperator(fnName) {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('operators')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(`${fnName}: could not verify operator status: ${error.message}`)
  if (!data) throw new Error(`${fnName}: operator privilege required (corrections are SupCod3-only)`)
  return user
}

/**
 * Active rows per design §4: keep positive rows (kind === positiveKind) whose id
 * is NOT referenced by any reverses_id. void/reversal rows (kind !== positiveKind)
 * are dropped, and any positive row they reverse is dropped too.
 */
function activeRows(rows, positiveKind) {
  const reversed = new Set()
  for (const r of rows) if (r.reverses_id) reversed.add(r.reverses_id)
  return rows.filter(r => r.kind === positiveKind && !reversed.has(r.id))
}

/**
 * owed(CUR) = Σ(active charges) − Σ(active payments), grouped by currency.
 * Currencies with no activity are absent from the result (never blended).
 * A value may be 0 (settled) or negative (patient credit / overpaid).
 */
function owedByCurrency(charges, payments) {
  const owed = {}
  for (const c of activeRows(charges, 'charge')) {
    owed[c.currency] = (owed[c.currency] || 0) + Number(c.amount_minor || 0)
  }
  for (const p of activeRows(payments, 'payment')) {
    owed[p.currency] = (owed[p.currency] || 0) - Number(p.amount_minor || 0)
  }
  return owed
}

// ─── 1. createCharge ─────────────────────────────────────────────────────────

/**
 * Record what was billed. Clinic-side; RLS requires the caller be doctor/owner
 * in-org and stamps created_by = auth.uid().
 */
export async function createCharge(c) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = await authUserId()

  const patientId = c.patient_id || c.patientId
  const doctorId = c.doctor_id || c.doctorId
  if (!patientId) throw new Error('createCharge: patient_id is required')
  if (!doctorId) throw new Error('createCharge: doctor_id is required')
  const description = sanitizeText(c.description || '', DESCRIPTION_MAX)
  if (!description) throw new Error('createCharge: description is required')

  const sanitized = {
    patient_id: patientId,
    treatment_plan_item_id: c.treatment_plan_item_id || c.treatmentPlanItemId || null,
    doctor_id: doctorId,
    kind: 'charge',
    description,
    amount_minor: Math.max(1, toSafeNumber(c.amount_minor ?? c.amountMinor, 0)),
    currency: sanitizeText(c.currency || 'IQD', 8),
  }

  const { data, error } = await supabase
    .from('charges')
    .insert({ ...sanitized, org_id: orgId, created_by: userId })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'charge.create',
    entityType: 'charge',
    entityId: data?.id || null,
    payload: {
      amount_minor: sanitized.amount_minor,
      currency: sanitized.currency,
      doctor_id: doctorId,
      patient_id: patientId,
    },
  })

  return mapCharge(data)
}

// ─── 2. recordPayment ────────────────────────────────────────────────────────

/**
 * Record a collection. Canonical name for the ledger; delegates to
 * database.js insertPayment, which now stamps kind='payment' explicitly and
 * preserves sanitizePaymentMethod (real enum: cash/fib/zaincash/asia_hawala/
 * card/other), recorded_by = auth.uid(), and audit 'payment.create'.
 * insertPayment stays exported so existing callers keep working.
 */
export async function recordPayment(p) {
  return insertPayment(p)
}

// ─── 3. reversePayment (operator-only) ───────────────────────────────────────

/**
 * Append a reversal that nets out a payment (reception keyed it wrong / refund).
 * Operator-only. Mirrors the original's amount/currency/patient. org_id comes
 * from getCurrentOrgId() (effective/impersonated org). recorded_by mirrors the
 * original's recorder (operators have no profiles row); the operator is captured
 * in audit_log.
 */
export async function reversePayment(paymentId, reason) {
  if (!paymentId) throw new Error('reversePayment: paymentId is required')
  await requireOperator('reversePayment')
  const orgId = await getCurrentOrgId()

  const { data: orig, error: lookupErr } = await supabase
    .from('payments')
    .select('id, patient_id, amount_minor, currency, method, recorded_by, kind')
    .eq('id', paymentId)
    .eq('org_id', orgId)
    .single()
  if (lookupErr) throw lookupErr
  if (orig.kind !== 'payment') {
    throw new Error(`reversePayment: can only reverse a payment row (got kind='${orig.kind}')`)
  }

  const row = {
    org_id: orgId,
    patient_id: orig.patient_id,
    kind: 'reversal',
    reverses_id: paymentId,
    amount_minor: Number(orig.amount_minor),
    currency: orig.currency,
    method: orig.method || 'other',
    recorded_by: orig.recorded_by || null,
    notes: reason ? sanitizeNotes(reason) : null,
  }

  const { data, error } = await supabase.from('payments').insert(row).select().single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'payment.reverse',
    entityType: 'payment',
    entityId: data?.id || null,
    payload: {
      reverses_id: paymentId,
      amount_minor: row.amount_minor,
      currency: row.currency,
      reason: reason || null,
    },
  })

  return mapBillingPayment(data)
}

// ─── 4. voidCharge (operator-only) ───────────────────────────────────────────

/**
 * Append a void that nets out a charge (doctor billed wrong / wrong patient).
 * Operator-only. Mirrors the original's amount/currency/patient/doctor.
 * created_by mirrors the original's creator (FK → profiles; operators have none);
 * the operator is captured in audit_log.
 */
export async function voidCharge(chargeId, reason) {
  if (!chargeId) throw new Error('voidCharge: chargeId is required')
  await requireOperator('voidCharge')
  const orgId = await getCurrentOrgId()

  const { data: orig, error: lookupErr } = await supabase
    .from('charges')
    .select('id, patient_id, doctor_id, amount_minor, currency, created_by, kind')
    .eq('id', chargeId)
    .eq('org_id', orgId)
    .single()
  if (lookupErr) throw lookupErr
  if (orig.kind !== 'charge') {
    throw new Error(`voidCharge: can only void a charge row (got kind='${orig.kind}')`)
  }

  const row = {
    org_id: orgId,
    patient_id: orig.patient_id,
    treatment_plan_item_id: null,
    doctor_id: orig.doctor_id,
    kind: 'void',
    reverses_id: chargeId,
    description: reason ? sanitizeText(reason, DESCRIPTION_MAX) : 'Voided charge',
    amount_minor: Number(orig.amount_minor),
    currency: orig.currency,
    created_by: orig.created_by,
  }

  const { data, error } = await supabase.from('charges').insert(row).select().single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'charge.void',
    entityType: 'charge',
    entityId: data?.id || null,
    payload: {
      reverses_id: chargeId,
      amount_minor: row.amount_minor,
      currency: row.currency,
      reason: reason || null,
    },
  })

  return mapCharge(data)
}

// ─── 5. getPatientBalance ────────────────────────────────────────────────────

/**
 * Per-currency owed for one patient. Returns e.g. { IQD: 60000, USD: 50000 }.
 * Currencies with no activity are omitted; values may be 0 (settled) or
 * negative (credit). Never blends currencies.
 */
export async function getPatientBalance(patientId) {
  if (!patientId) throw new Error('getPatientBalance: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const [chRes, pmRes] = await Promise.all([
    supabase.from('charges')
      .select('id, kind, reverses_id, amount_minor, currency')
      .eq('org_id', orgId).eq('patient_id', patientId),
    supabase.from('payments')
      .select('id, kind, reverses_id, amount_minor, currency')
      .eq('org_id', orgId).eq('patient_id', patientId),
  ])
  if (chRes.error) throw chRes.error
  if (pmRes.error) throw pmRes.error

  return owedByCurrency(chRes.data || [], pmRes.data || [])
}

// ─── 6. getOutstandingCollections ────────────────────────────────────────────

/**
 * Reception worklist: every patient in the org who owes > 0 in any currency,
 * newest charge first. Returns
 *   [{ patientId, fullName, phone, balances: { IQD, USD }, latestChargeAt }]
 *
 * NOTE (scale): aggregates the org's ledger client-side. Fine at clinic scale
 * (thousands of patients, sparse payments); revisit as an RPC / SQL view if a
 * single org's ledger grows large.
 */
export async function getOutstandingCollections() {
  await requireUser()
  const orgId = await getCurrentOrgId()

  const [chRes, pmRes] = await Promise.all([
    supabase.from('charges')
      .select('id, patient_id, kind, reverses_id, amount_minor, currency, created_at')
      .eq('org_id', orgId),
    supabase.from('payments')
      .select('id, patient_id, kind, reverses_id, amount_minor, currency')
      .eq('org_id', orgId),
  ])
  if (chRes.error) throw chRes.error
  if (pmRes.error) throw pmRes.error

  const byPatient = new Map()
  const bucket = (pid) => {
    if (!byPatient.has(pid)) byPatient.set(pid, { charges: [], payments: [] })
    return byPatient.get(pid)
  }
  for (const c of chRes.data || []) bucket(c.patient_id).charges.push(c)
  for (const p of pmRes.data || []) bucket(p.patient_id).payments.push(p)

  const owing = []
  for (const [patientId, { charges, payments }] of byPatient) {
    const balances = owedByCurrency(charges, payments)
    if (!Object.values(balances).some(v => v > 0)) continue
    const latestChargeAt = activeRows(charges, 'charge')
      .reduce((max, c) => (!max || c.created_at > max) ? c.created_at : max, null)
    owing.push({ patientId, balances, latestChargeAt })
  }
  if (owing.length === 0) return []

  const { data: pts, error: ptErr } = await supabase
    .from('patients')
    .select('id, full_name, phone')
    .in('id', owing.map(o => o.patientId))
    .eq('org_id', orgId)
  if (ptErr) throw ptErr
  const pmap = new Map((pts || []).map(p => [p.id, p]))

  return owing
    .map(o => ({
      patientId: o.patientId,
      fullName: pmap.get(o.patientId)?.full_name || '',
      phone: pmap.get(o.patientId)?.phone || '',
      balances: o.balances,
      latestChargeAt: o.latestChargeAt,
    }))
    .sort((a, b) => (b.latestChargeAt || '').localeCompare(a.latestChargeAt || ''))
}
