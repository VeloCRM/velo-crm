/**
 * Velo CRM — core data-access helpers.
 *
 * Every helper here:
 *   - calls requireUser() (throws if not authenticated),
 *   - resolves the caller's org_id via getCurrentOrgId() and pins it on
 *     every query as `.eq('org_id', orgId)` for defense in depth on top of
 *     RLS,
 *   - sanitizes user-supplied text fields BEFORE the supabase call,
 *   - calls logAuditEvent on every successful mutation. Audit-log failures
 *     bubble up — never swallowed.
 *
 * JSON-column updates (contacts.notes timeline / documents) go through
 * server-side Postgres functions added in src/lib/schema.sql so the read-
 * modify-write race is fixed atomically with row locks.
 */

import { supabase } from './supabase'
import {
  sanitizeContact,
  sanitizeText,
  sanitizeName,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNotes,
  sanitizeTags,
  LIMITS,
  toSafeNumber,
} from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'

// ─── Notes JSON helpers ────────────────────────────────────────────────────
// Notes field stores JSON: { bio: "", timeline: [...], documents: [...] }
// Legacy contacts may have plain text — handle both.

function parseNotesJson(notesStr) {
  if (!notesStr) return { bio: '', timeline: [], documents: [] }
  try {
    const parsed = JSON.parse(notesStr)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.timeline)) {
      return { bio: parsed.bio || '', timeline: parsed.timeline, documents: parsed.documents || [] }
    }
  } catch {
    // Plain-text legacy fallback
  }
  return { bio: notesStr, timeline: [], documents: [] }
}


// ─── Contacts ───────────────────────────────────────────────────────────────

// Supabase caps rows at 1000 per request — paginate with .range() + exact count.
// Page size is intentionally small so the initial load is fast; callers use
// the Load More UI to pull the next page.
export const CONTACTS_PAGE_SIZE = 100

export async function fetchContacts(offset = 0, limit = CONTACTS_PAGE_SIZE) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error, count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data || []).map(mapContact)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function insertContact(c, orgId) {
  await requireUser()
  if (!orgId) throw new Error('insertContact: orgId is required')
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertContact: org_id mismatch with current session')
  }

  const sanitized = sanitizeContact(c || {})
  const userId = (await supabase.auth.getUser()).data.user?.id
  const notesJson = JSON.stringify({ bio: sanitized.notes || '', timeline: [], documents: [] })

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      user_id: userId,
      name: sanitized.name,
      email: sanitized.email || '',
      phone: sanitized.phone || '',
      company: sanitized.company || '',
      city: sanitized.city || '',
      category: sanitizeText(c.category || 'prospect', 32),
      status: sanitizeText(c.status || 'lead', 32),
      tags: sanitized.tags,
      source: sanitizeText(c.source || 'inbound', 32),
      notes: notesJson,
    })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'contact.create',
    entityType: 'contact',
    entityId: data?.id || null,
  })

  return mapContact(data)
}

export async function patchContact(id, updates) {
  if (!id) throw new Error('patchContact: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = {}
  if (updates.name !== undefined) patch.name = sanitizeName(updates.name)
  if (updates.email !== undefined) patch.email = sanitizeEmail(updates.email)
  if (updates.phone !== undefined) patch.phone = sanitizePhone(updates.phone)
  if (updates.company !== undefined) patch.company = sanitizeText(updates.company, 100)
  if (updates.city !== undefined) patch.city = sanitizeText(updates.city, 100)
  if (updates.category !== undefined) patch.category = sanitizeText(updates.category, 32)
  if (updates.status !== undefined) patch.status = sanitizeText(updates.status, 32)
  if (updates.tags !== undefined) patch.tags = sanitizeTags(updates.tags)
  if (updates.source !== undefined) patch.source = sanitizeText(updates.source, 32)
  if (updates.notes !== undefined) patch.notes = sanitizeNotes(updates.notes)
  if (updates._rawNotes !== undefined) patch.notes = updates._rawNotes // pre-built JSON blob

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'contact.update',
    entityType: 'contact',
    entityId: id,
    payload: { fields: Object.keys(patch) },
  })

  return mapContact(data)
}

export async function removeContact(id) {
  if (!id) throw new Error('removeContact: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'contact.delete',
    entityType: 'contact',
    entityId: id,
  })
}

// ─── Contact Notes (timeline) ──────────────────────────────────────────────
// Atomic via the `contact_append_timeline` Postgres function (Phase 6
// migration). The function takes a row lock, parses the JSON text column,
// appends to the timeline array, and writes back — all in one transaction.
// The previous client-side read-modify-write was a last-write-wins race.

export async function addContactNote(contactId, note) {
  if (!contactId) throw new Error('addContactNote: contactId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Sanitize the note text. id/author/date come from caller (server values).
  const sanitizedNote = {
    ...note,
    text: sanitizeText(note?.text || '', LIMITS.notes),
    author: sanitizeText(note?.author || '', LIMITS.name),
  }

  // Defense in depth: confirm the row is in the caller's org before mutating.
  const { data: target, error: lookupErr } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!target) throw new Error('addContactNote: contact not found in your org')

  const { error: rpcErr } = await supabase.rpc('contact_append_timeline', {
    p_contact_id: contactId,
    p_entry: sanitizedNote,
  })
  if (rpcErr) throw rpcErr

  // Re-fetch to return the up-to-date contact (the RPC returns the new notes
  // string but the caller wants the full mapped contact).
  const { data, error: refetchErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()
  if (refetchErr) throw refetchErr

  await logAuditEvent({
    orgId,
    action: 'contact.note_add',
    entityType: 'contact',
    entityId: contactId,
  })

  return mapContact(data)
}


// ─── Contact Documents (Supabase Storage) ──────────────────────────────────

export async function uploadContactDocument(contactId, file) {
  if (!contactId) throw new Error('uploadContactDocument: contactId is required')
  if (!file) throw new Error('uploadContactDocument: file is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: target, error: lookupErr } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!target) throw new Error('uploadContactDocument: contact not found in your org')

  const storagePath = `${contactId}/${Date.now()}_${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from('documents').upload(storagePath, file, { upsert: false })
  if (uploadErr) throw uploadErr

  const doc = {
    id: 'doc_' + Date.now(),
    name: sanitizeText(file.name || '', 200),
    size: (file.size / 1024).toFixed(1) + ' KB',
    path: storagePath,
    date: new Date().toLocaleDateString(),
  }

  const { error: rpcErr } = await supabase.rpc('contact_add_document', {
    p_contact_id: contactId,
    p_doc: doc,
  })
  if (rpcErr) throw rpcErr

  const { data, error: refetchErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()
  if (refetchErr) throw refetchErr

  await logAuditEvent({
    orgId,
    action: 'contact.document_upload',
    entityType: 'contact',
    entityId: contactId,
    payload: { docId: doc.id, name: doc.name },
  })

  return mapContact(data)
}

export async function removeContactDocument(contactId, docId, storagePath) {
  if (!contactId || !docId) throw new Error('removeContactDocument: contactId and docId are required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data: target, error: lookupErr } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!target) throw new Error('removeContactDocument: contact not found in your org')

  if (storagePath) {
    const { error: storageErr } = await supabase.storage
      .from('documents').remove([storagePath])
    if (storageErr) throw storageErr
  }

  const { error: rpcErr } = await supabase.rpc('contact_remove_document', {
    p_contact_id: contactId,
    p_doc_id: docId,
  })
  if (rpcErr) throw rpcErr

  const { data, error: refetchErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()
  if (refetchErr) throw refetchErr

  await logAuditEvent({
    orgId,
    action: 'contact.document_remove',
    entityType: 'contact',
    entityId: contactId,
    payload: { docId },
  })

  return mapContact(data)
}

export async function getDocumentSignedUrl(storagePath) {
  await requireUser()
  const { data, error } = await supabase.storage
    .from('documents').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

function mapContact(row) {
  const notes = parseNotesJson(row.notes)
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    city: row.city,
    category: row.category,
    status: row.status,
    tags: row.tags || [],
    source: row.source,
    notes: notes.bio,
    notesTimeline: notes.timeline,
    documents: notes.documents,
    _rawNotes: row.notes,
    createdAt: row.created_at?.slice(0, 10) || '',
    activityHistory: [],
  }
}


// ─── Payments ──────────────────────────────────────────────────────────────

export async function fetchPaymentsByContact(contactId) {
  if (!contactId) throw new Error('fetchPaymentsByContact: contactId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('payment_date', { ascending: false })
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

export async function fetchTeamMembers(orgId) {
  if (!orgId) return []
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('fetchTeamMembers: org_id mismatch with current session')
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('org_id', orgId)
  if (error) throw error
  return (data || []).map(p => ({
    id: p.id,
    name: p.full_name || p.email?.split('@')[0] || 'Team Member',
    email: p.email,
    role: p.role,
  }))
}

export async function insertPayment(p) {
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = (await supabase.auth.getUser()).data.user?.id

  const sanitized = {
    contact_id: p.contactId || null,
    amount: Math.max(0, toSafeNumber(p.amount, 0)),
    currency: sanitizeText(p.currency || 'IQD', 8),
    method: sanitizeText(p.method || 'cash', 32),
    status: sanitizeText(p.status || 'pending', 32),
    due_date: p.dueDate || null,
    payment_date: p.paymentDate || null,
    description: sanitizeText(p.description || '', LIMITS.notes),
    deal_id: p.dealId || null,
    source: sanitizeText(p.source || 'manual', 32),
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      ...sanitized,
      user_id: userId,
      org_id: orgId,
    })
    .select()
    .single()
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'payment.create',
    entityType: 'payment',
    entityId: data?.id || null,
    payload: { amount: sanitized.amount, currency: sanitized.currency, method: sanitized.method },
  })

  return mapPayment(data)
}

export async function patchPayment(id, updates) {
  if (!id) throw new Error('patchPayment: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const patch = {}
  if (updates.amount !== undefined) patch.amount = Math.max(0, toSafeNumber(updates.amount, 0))
  if (updates.currency !== undefined) patch.currency = sanitizeText(updates.currency, 8)
  if (updates.method !== undefined) patch.method = sanitizeText(updates.method, 32)
  if (updates.status !== undefined) patch.status = sanitizeText(updates.status, 32)
  if (updates.dueDate !== undefined) patch.due_date = updates.dueDate
  if (updates.paymentDate !== undefined) patch.payment_date = updates.paymentDate
  if (updates.description !== undefined) patch.description = sanitizeText(updates.description, LIMITS.notes)
  if (updates.dealId !== undefined) patch.deal_id = updates.dealId

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

function mapPayment(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    amount: Number(row.amount) || 0,
    currency: row.currency || 'IQD',
    method: row.method || 'cash',
    status: row.status || 'paid',
    dueDate: row.due_date || '',
    paymentDate: row.payment_date || '',
    description: row.description || '',
    dealId: row.deal_id || '',
    source: row.source || 'manual',
    createdAt: row.created_at,
  }
}


// ─── Audit Log ────────────────────────────────────────────────────────────
// `logAuditEvent` lives in src/lib/audit.js. The two read helpers here are
// thin wrappers that scope the query to the caller's org for defense in
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


// ─── Organizations ─────────────────────────────────────────────────────────

export async function fetchOrganizations() {
  // Operator-only path (operators can read all orgs via the per-table
  // operator policies). Clinic users see at most their own org.
  await requireUser()
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── Impersonation (Admin) ──────────────────────────────────────────────────

export async function fetchOrg(orgId) {
  if (!orgId) throw new Error('fetchOrg: orgId is required')
  await requireUser()
  const { data, error } = await supabase
    .from('organizations')
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

export async function fetchContactsForOrg(orgId, userIds, offset = 0, limit = CONTACTS_PAGE_SIZE) {
  if (!orgId) throw new Error('fetchContactsForOrg: orgId is required')
  await requireUser()
  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (!userIds?.length && orgId) {
    // org_id alone is enough; userIds was a transitional fallback
  } else if (userIds?.length) {
    query = query.in('user_id', userIds)
  }
  const { data, error, count } = await query
  if (error) throw error
  const rows = (data || []).map(mapContact)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function fetchPaymentsForOrg(userIds) {
  if (!userIds?.length) return []
  await requireUser()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}


// ─── Test Account Limits ───────────────────────────────────────────────────
// Test orgs (status='test') get a sandbox-sized cap on records and a hard
// block on org_secrets writes. Real clinic accounts (status='active') are
// unconstrained by these helpers.

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

/**
 * Read the org's status. Returns null if not signed in or org not found.
 * Used by the test-limit guards. Cheap query (single row, indexed PK).
 */
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

/**
 * Throws TestAccountLimitError if the org is in 'test' status and the named
 * collection is at or above its cap.
 */
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

// ── New-schema write helpers (Sprint 0+). Each one enforces test-account
// limits, sanitizes inputs, and audit-logs.

export async function insertPatient(patient, orgId) {
  if (!orgId) throw new Error('insertPatient: orgId is required')
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertPatient: org_id mismatch with current session')
  }
  await assertTestAccountLimit(orgId, 'patients')

  const sanitized = {
    full_name: sanitizeName(patient.full_name || patient.fullName || ''),
    phone: sanitizePhone(patient.phone || ''),
    email: patient.email ? sanitizeEmail(patient.email) : null,
    dob: patient.dob || null,
    gender: patient.gender ? sanitizeText(patient.gender, 32) : null,
    medical_history: patient.medical_history || patient.medicalHistory || {},
    allergies: patient.allergies || [],
  }

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

  return data
}

export async function insertAppointment(appt, orgId) {
  if (!orgId) throw new Error('insertAppointment: orgId is required')
  await requireUser()
  const myOrgId = await getCurrentOrgId()
  if (orgId !== myOrgId) {
    throw new Error('insertAppointment: org_id mismatch with current session')
  }
  await assertTestAccountLimit(orgId, 'appointments')

  const sanitized = {
    patient_id: appt.patient_id || appt.patientId,
    doctor_id: appt.doctor_id || appt.doctorId || null,
    type: sanitizeText(appt.type || '', 32),
    status: sanitizeText(appt.status || 'scheduled', 32),
    scheduled_at: appt.scheduled_at || appt.scheduledAt,
    duration_minutes: Math.max(1, toSafeNumber(appt.duration_minutes || appt.durationMinutes, 30)),
    chair_id: appt.chair_id || appt.chairId || null,
    notes: appt.notes ? sanitizeNotes(appt.notes) : null,
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({ org_id: orgId, ...sanitized })
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
 * Create a new clinic-user profile. Test orgs are capped at 1 profile (the
 * owner created by the test-account endpoint) — no team-member invites.
 */
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
    full_name: profile.full_name ? sanitizeName(profile.full_name) : (profile.fullName ? sanitizeName(profile.fullName) : null),
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

/**
 * Set / upsert an org-level secret. Refused for test orgs.
 */
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
