/**
 * Velo CRM — core data-access helpers (new schema).
 *
 * Targets the post-Sprint-0 dental schema declared in src/lib/schema.sql:
 * patients, appointments, payments, treatment_plans, profiles, orgs,
 * audit_log, org_secrets, etc. The legacy tables (contacts, organizations,
 * deals, items, treatments, prescriptions, xrays, agency_settings, etc.)
 * are gone.
 *
 * Every helper:
 *   - calls requireUser() (throws if not authenticated),
 *   - resolves the caller's org_id via getCurrentOrgId() and pins it on
 *     every query as `.eq('org_id', orgId)` for defense in depth on top of
 *     RLS,
 *   - sanitizes user-supplied text fields BEFORE the supabase call,
 *   - calls logAuditEvent on every successful mutation.
 */

import { supabase } from './supabase'
import {
  sanitizeText,
  sanitizeName,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNotes,
  LIMITS,
  toSafeNumber,
} from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'


// ─── Patients ──────────────────────────────────────────────────────────────
// Replaces the legacy `contacts` table. Money / status / tags / category /
// company / source columns from the old contacts shape do not exist on
// patients — they were never patient-level concepts.

export const PATIENTS_PAGE_SIZE = 100

function mapPatient(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email || '',
    dob: row.dob || '',
    gender: row.gender || null,
    medicalHistory: row.medical_history || {},
    allergies: row.allergies || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sanitizePatient(p) {
  return {
    full_name: sanitizeName(p.full_name || p.fullName || ''),
    phone: sanitizePhone(p.phone || ''),
    email: p.email ? sanitizeEmail(p.email) : null,
    dob: p.dob || null,
    gender: p.gender ? sanitizeText(p.gender, 32) : null,
    medical_history: p.medical_history || p.medicalHistory || {},
    allergies: p.allergies || [],
  }
}

export async function fetchPatients(offset = 0, limit = PATIENTS_PAGE_SIZE) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error, count } = await supabase
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data || []).map(mapPatient)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function insertPatient(patient, orgId) {
  if (!orgId) throw new Error('insertPatient: orgId is required')
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertPatient: org_id mismatch with current session')
  }
  await assertTestAccountLimit(orgId, 'patients')

  const sanitized = sanitizePatient(patient)

  const { data, error } = await supabase
    .from('patients')
    .insert({ org_id: orgId, ...sanitized })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'patient.create',
    entityType: 'patient',
    entityId: data?.id || null,
  })

  return mapPatient(data)
}

export async function patchPatient(id, updates) {
  if (!id) throw new Error('patchPatient: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = {}
  if (updates.full_name !== undefined || updates.fullName !== undefined) {
    patch.full_name = sanitizeName(updates.full_name ?? updates.fullName ?? '')
  }
  if (updates.phone !== undefined) patch.phone = sanitizePhone(updates.phone)
  if (updates.email !== undefined) patch.email = updates.email ? sanitizeEmail(updates.email) : null
  if (updates.dob !== undefined) patch.dob = updates.dob || null
  if (updates.gender !== undefined) patch.gender = updates.gender ? sanitizeText(updates.gender, 32) : null
  if (updates.medical_history !== undefined) patch.medical_history = updates.medical_history
  if (updates.medicalHistory !== undefined) patch.medical_history = updates.medicalHistory
  if (updates.allergies !== undefined) patch.allergies = updates.allergies

  const { data, error } = await supabase
    .from('patients')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'patient.update',
    entityType: 'patient',
    entityId: id,
    payload: { fields: Object.keys(patch) },
  })

  return mapPatient(data)
}

export async function removePatient(id) {
  if (!id) throw new Error('removePatient: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'patient.delete',
    entityType: 'patient',
    entityId: id,
  })
}


// ─── Payments ──────────────────────────────────────────────────────────────
// New schema columns: org_id, patient_id, treatment_plan_id (nullable),
// amount_minor (BIGINT), currency, method, recorded_at, recorded_by, notes.
// No status, no deal_id, no source.

const PAYMENT_METHODS = new Set(['cash', 'fib', 'zaincash', 'asia_hawala', 'card', 'other'])

function mapPayment(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
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

function sanitizePaymentMethod(m) {
  const safe = sanitizeText(m || 'cash', 32).toLowerCase()
  return PAYMENT_METHODS.has(safe) ? safe : 'other'
}

export async function fetchPaymentsByPatient(patientId) {
  if (!patientId) throw new Error('fetchPaymentsByPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}

export async function fetchAllPayments() {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}

/**
 * FinancePage helper. Returns payments joined with patient (full_name, phone)
 * and treatment plan (notes, status) for the current org, supporting:
 *
 *   from, to       - ISO strings filtering on payments.recorded_at
 *   patientQuery   - ILIKE filter on patient.full_name (server-side join filter)
 *   method         - exact match on payments.method (payment_method enum)
 *   limit          - row cap (default 100)
 *
 * Each row keeps the raw schema shape (snake_case) so the page can pass
 * amount_minor straight into formatMoney without remapping.
 */
export async function fetchPaymentsWithJoins({ from, to, method, limit = 100 } = {}) {
  await requireUser()
  const orgId = await getCurrentOrgId()

  let q = supabase
    .from('payments')
    .select(`
      id, amount_minor, currency, method, recorded_at, notes, treatment_plan_id, patient_id,
      patient:patient_id ( id, full_name, phone ),
      plan:treatment_plan_id ( id, status, notes )
    `)
    .eq('org_id', orgId)
    .order('recorded_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (from) q = q.gte('recorded_at', from)
  if (to)   q = q.lte('recorded_at', to)
  if (method) {
    const safeMethod = sanitizeText(String(method), 32).toLowerCase()
    if (PAYMENT_METHODS.has(safeMethod)) q = q.eq('method', safeMethod)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function insertPayment(p) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = (await supabase.auth.getUser()).data.user?.id

  if (!p.patient_id && !p.patientId) {
    throw new Error('insertPayment: patient_id is required')
  }

  const sanitized = {
    patient_id: p.patient_id || p.patientId,
    treatment_plan_id: p.treatment_plan_id || p.treatmentPlanId || null,
    amount_minor: Math.max(1, toSafeNumber(p.amount_minor ?? p.amountMinor, 0)),
    currency: sanitizeText(p.currency || 'IQD', 8),
    method: sanitizePaymentMethod(p.method),
    recorded_at: p.recorded_at || p.recordedAt || new Date().toISOString(),
    notes: p.notes ? sanitizeNotes(p.notes) : null,
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({ ...sanitized, org_id: orgId, recorded_by: userId })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'payment.create',
    entityType: 'payment',
    entityId: data?.id || null,
    payload: { amount_minor: sanitized.amount_minor, currency: sanitized.currency, method: sanitized.method },
  })

  return mapPayment(data)
}

export async function patchPayment(id, updates) {
  if (!id) throw new Error('patchPayment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = {}
  if (updates.amount_minor !== undefined || updates.amountMinor !== undefined) {
    patch.amount_minor = Math.max(1, toSafeNumber(updates.amount_minor ?? updates.amountMinor, 0))
  }
  if (updates.currency !== undefined) patch.currency = sanitizeText(updates.currency, 8)
  if (updates.method !== undefined) patch.method = sanitizePaymentMethod(updates.method)
  if (updates.recorded_at !== undefined || updates.recordedAt !== undefined) {
    patch.recorded_at = updates.recorded_at ?? updates.recordedAt
  }
  if (updates.treatment_plan_id !== undefined || updates.treatmentPlanId !== undefined) {
    patch.treatment_plan_id = updates.treatment_plan_id ?? updates.treatmentPlanId ?? null
  }
  if (updates.notes !== undefined) patch.notes = updates.notes ? sanitizeNotes(updates.notes) : null

  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'payment.update',
    entityType: 'payment',
    entityId: id,
    payload: { fields: Object.keys(patch) },
  })

  return mapPayment(data)
}

export async function removePayment(id) {
  if (!id) throw new Error('removePayment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'payment.delete',
    entityType: 'payment',
    entityId: id,
  })
}


// ─── Audit Log ────────────────────────────────────────────────────────────
// `logAuditEvent` lives in src/lib/audit.js. The read helper here is a
// thin wrapper that scopes the query to the caller's org for defense in
// depth.

export async function fetchAuditLog(limit = 100) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}


// ─── Organizations (orgs) ──────────────────────────────────────────────────

export async function fetchOrganizations() {
  // Operator-only path (operators can read all orgs via the per-table
  // operator policies). Clinic users see at most their own org.
  await requireUser()
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchOrg(orgId) {
  if (!orgId) throw new Error('fetchOrg: orgId is required')
  await requireUser()
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', orgId)
    .single()
  if (error) throw error
  return data
}

export async function fetchOrgUserIds(orgId) {
  if (!orgId) throw new Error('fetchOrgUserIds: orgId is required')
  await requireUser()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
  if (error) throw error
  return (data || []).map(p => p.id)
}

// Operator-impersonation path: read every patient/payment row in a given
// org. RLS still applies — only operators can pull foreign org data.

export async function fetchPatientsForOrg(orgId, offset = 0, limit = PATIENTS_PAGE_SIZE) {
  if (!orgId) throw new Error('fetchPatientsForOrg: orgId is required')
  await requireUser()
  const { data, error, count } = await supabase
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data || []).map(mapPatient)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function fetchPaymentsForOrg(orgId) {
  if (!orgId) throw new Error('fetchPaymentsForOrg: orgId is required')
  await requireUser()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}


// ─── Profiles (team members) ───────────────────────────────────────────────
// New profiles columns: id, org_id, role, full_name, avatar_url, locale.
// No email, color, specialization, phone, is_active.

export async function fetchTeamMembers(orgId) {
  if (!orgId) return []
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('fetchTeamMembers: org_id mismatch with current session')
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('org_id', orgId)
  if (error) throw error
  return (data || []).map(p => ({
    id: p.id,
    name: p.full_name || 'Team Member',
    role: p.role,
  }))
}


// ─── Test Account Limits ───────────────────────────────────────────────────
// Test orgs (status='test') get a sandbox-sized cap on records and a hard
// block on org_secrets writes.

export const TEST_ACCOUNT_LIMITS = {
  patients: 50,
  appointments: 100,
  profiles: 1,
}

export class TestAccountLimitError extends Error {
  constructor(kind, max) {
    super(`Test account limit reached: ${kind} cap is ${max}. Contact the operator for a real clinic account.`)
    this.name = 'TestAccountLimitError'
    this.kind = kind
    this.max = max
  }
}

export async function fetchOrgStatus(orgId) {
  if (!orgId) return null
  const { data, error } = await supabase
    .from('orgs')
    .select('status')
    .eq('id', orgId)
    .maybeSingle()
  if (error) return null
  return data?.status || null
}

export async function assertTestAccountLimit(orgId, kind) {
  const max = TEST_ACCOUNT_LIMITS[kind]
  if (max === undefined) {
    throw new Error(`assertTestAccountLimit: unknown kind "${kind}"`)
  }
  const status = await fetchOrgStatus(orgId)
  if (status !== 'test') return // non-test orgs: unlimited

  const { count, error } = await supabase
    .from(kind)
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw error
  if ((count ?? 0) >= max) {
    throw new TestAccountLimitError(kind, max)
  }
}


// ─── Profiles INSERT (operator-side) ───────────────────────────────────────
// Test orgs are capped at 1 profile (the owner created by the test-account
// endpoint). Real onboarding goes through a SECURITY DEFINER RPC.

export async function insertProfile(profile, orgId) {
  if (!orgId) throw new Error('insertProfile: orgId is required')
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertProfile: org_id mismatch with current session')
  }
  await assertTestAccountLimit(orgId, 'profiles')

  const sanitized = {
    id: profile.id,
    role: sanitizeText(profile.role || 'assistant', 32),
    full_name: profile.full_name
      ? sanitizeName(profile.full_name)
      : (profile.fullName ? sanitizeName(profile.fullName) : null),
    avatar_url: profile.avatar_url || profile.avatarUrl || null,
    locale: sanitizeText(profile.locale || 'en', 8),
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ org_id: orgId, ...sanitized })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'profile.create',
    entityType: 'profile',
    entityId: data?.id || null,
    payload: { role: sanitized.role },
  })

  return data
}


// ─── Org Secrets ───────────────────────────────────────────────────────────
// Operator-only at the RLS layer; this helper additionally refuses to write
// secrets for test orgs.

export async function setOrgSecret(orgId, kind, value) {
  if (!orgId) throw new Error('setOrgSecret: orgId is required')
  await requireUser()
  const status = await fetchOrgStatus(orgId)
  if (status === 'test') {
    throw new Error('Refusing to write org_secrets for a test org. Promote the org to "active" first.')
  }
  const safeKind = sanitizeText(kind || '', 64)
  const safeValue = typeof value === 'string' ? value.slice(0, 4096) : ''

  const { data, error } = await supabase
    .from('org_secrets')
    .upsert({ org_id: orgId, kind: safeKind, value: safeValue }, { onConflict: 'org_id,kind' })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'org_secret.set',
    entityType: 'org_secret',
    entityId: data?.id || null,
    payload: { kind: safeKind },
  })

  return data
}
