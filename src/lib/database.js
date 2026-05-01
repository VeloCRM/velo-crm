import { supabase, isSupabaseConfigured } from './supabase'

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
  } catch {}
  return { bio: notesStr, timeline: [], documents: [] }
}

// ─── Contacts ───────────────────────────────────────────────────────────────

// Supabase caps rows at 1000 per request — paginate with .range() + exact count.
// Page size is intentionally small so the initial load is fast; callers use
// the Load More UI to pull the next page.
export const CONTACTS_PAGE_SIZE = 100

export async function fetchContacts(offset = 0, limit = CONTACTS_PAGE_SIZE) {
  const { data, error, count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data || []).map(mapContact)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function insertContact(c, orgId) {
  if (!orgId) throw new Error('insertContact: orgId is required')
  const userId = (await supabase.auth.getUser()).data.user?.id
  const notesJson = JSON.stringify({ bio: c.notes || '', timeline: [], documents: [] })
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      user_id: userId,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      city: c.city || '',
      category: c.category || 'prospect',
      status: c.status || 'lead',
      tags: c.tags || [],
      source: c.source || 'inbound',
      notes: notesJson,
    })
    .select()
    .single()
  if (error) throw error
  return mapContact(data)
}

export async function patchContact(id, updates) {
  const patch = {}
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.email !== undefined) patch.email = updates.email
  if (updates.phone !== undefined) patch.phone = updates.phone
  if (updates.company !== undefined) patch.company = updates.company
  if (updates.city !== undefined) patch.city = updates.city
  if (updates.category !== undefined) patch.category = updates.category
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.tags !== undefined) patch.tags = updates.tags
  if (updates.source !== undefined) patch.source = updates.source
  if (updates.notes !== undefined) patch.notes = updates.notes
  if (updates._rawNotes !== undefined) patch.notes = updates._rawNotes

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapContact(data)
}

export async function removeContact(id) {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}

// ─── Contact Notes (timeline) ──────────────────────────────────────────────

export async function addContactNote(contactId, note) {
  const { data: current, error: fetchErr } = await supabase
    .from('contacts').select('notes').eq('id', contactId).single()
  if (fetchErr) throw fetchErr
  const parsed = parseNotesJson(current.notes)
  parsed.timeline.push(note)
  const { data, error } = await supabase
    .from('contacts')
    .update({ notes: JSON.stringify(parsed) })
    .eq('id', contactId).select().single()
  if (error) throw error
  return mapContact(data)
}

// ─── Contact Documents (Supabase Storage) ──────────────────────────────────

export async function uploadContactDocument(contactId, file) {
  const storagePath = `${contactId}/${Date.now()}_${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from('documents').upload(storagePath, file, { upsert: false })
  if (uploadErr) throw uploadErr

  const { data: current } = await supabase
    .from('contacts').select('notes').eq('id', contactId).single()
  const parsed = parseNotesJson(current?.notes)
  const doc = {
    id: 'doc_' + Date.now(),
    name: file.name,
    size: (file.size / 1024).toFixed(1) + ' KB',
    path: storagePath,
    date: new Date().toLocaleDateString(),
  }
  parsed.documents.push(doc)
  const { data, error } = await supabase
    .from('contacts')
    .update({ notes: JSON.stringify(parsed) })
    .eq('id', contactId).select().single()
  if (error) throw error
  return mapContact(data)
}

export async function removeContactDocument(contactId, docId, storagePath) {
  if (storagePath) await supabase.storage.from('documents').remove([storagePath])
  const { data: current } = await supabase
    .from('contacts').select('notes').eq('id', contactId).single()
  const parsed = parseNotesJson(current?.notes)
  parsed.documents = parsed.documents.filter(d => d.id !== docId)
  const { data, error } = await supabase
    .from('contacts')
    .update({ notes: JSON.stringify(parsed) })
    .eq('id', contactId).select().single()
  if (error) throw error
  return mapContact(data)
}

export async function getDocumentSignedUrl(storagePath) {
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
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('contact_id', contactId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}

export async function fetchAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapPayment)
}

export async function fetchTeamMembers(orgId) {
  if (!orgId) return []
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
  const userId = (await supabase.auth.getUser()).data.user?.id
  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      contact_id: p.contactId || null,
      amount: Number(p.amount) || 0,
      currency: p.currency || 'IQD',
      method: p.method || 'cash',
      status: p.status || 'pending',
      due_date: p.dueDate || null,
      payment_date: p.paymentDate || null,
      description: p.description || '',
      deal_id: p.dealId || null,
      source: p.source || 'manual',
    })
    .select()
    .single()
  if (error) throw error
  return mapPayment(data)
}

export async function patchPayment(id, updates) {
  const patch = {}
  if (updates.amount !== undefined) patch.amount = Number(updates.amount) || 0
  if (updates.currency !== undefined) patch.currency = updates.currency
  if (updates.method !== undefined) patch.method = updates.method
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.dueDate !== undefined) patch.due_date = updates.dueDate
  if (updates.paymentDate !== undefined) patch.payment_date = updates.paymentDate
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.dealId !== undefined) patch.deal_id = updates.dealId

  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapPayment(data)
}

export async function removePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) throw error
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

export async function logAuditEvent(action, entity, entityId, details) {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) return
    await supabase.from('audit_log').insert({
      user_id: userId,
      action,
      entity,
      entity_id: entityId || null,
      details: details || null,
    })
  } catch (err) {
    console.warn('Audit log error:', err)
  }
}

export async function fetchAuditLog(limit = 100) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}


// ─── Organizations ─────────────────────────────────────────────────────────

export async function fetchOrganizations() {
  const client = supabase
  const { data, error } = await client.from('organizations').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── Impersonation (Admin) ──────────────────────────────────────────────────

export async function fetchOrg(orgId) {
  const client = supabase
  const { data, error } = await client.from('organizations').select('*').eq('id', orgId).single()
  if (error) throw error
  return data
}

export async function fetchOrgUserIds(orgId) {
  const client = supabase
  const { data, error } = await client.from('profiles').select('id').eq('org_id', orgId)
  if (error) throw error
  return (data || []).map(p => p.id)
}

export async function fetchContactsForOrg(orgId, userIds, offset = 0, limit = CONTACTS_PAGE_SIZE) {
  const client = supabase
  let query = client
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (orgId) {
    query = query.eq('org_id', orgId)
  } else if (userIds?.length) {
    query = query.in('user_id', userIds)
  } else {
    return { rows: [], total: 0, hasMore: false }
  }
  const { data, error, count } = await query
  if (error) throw error
  const rows = (data || []).map(mapContact)
  const total = count ?? rows.length
  return { rows, total, hasMore: offset + rows.length < total }
}

export async function fetchPaymentsForOrg(userIds) {
  if (!userIds?.length) return []
  const client = supabase
  const { data, error } = await client
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
 * collection is at or above its cap. Caller passes one of:
 *   - 'patients'      (capped at 50)
 *   - 'appointments'  (capped at 100)
 *   - 'profiles'      (capped at 1)
 *
 * No-op for non-test orgs.
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
// limits before issuing the insert. Call sites are wired up incrementally
// as Phase 4+ migrates pages to the new schema.

export async function insertPatient(patient, orgId) {
  if (!orgId) throw new Error('insertPatient: orgId is required')
  await assertTestAccountLimit(orgId, 'patients')
  const { data, error } = await supabase
    .from('patients')
    .insert({
      org_id: orgId,
      full_name: patient.full_name || patient.fullName || '',
      phone: patient.phone || '',
      email: patient.email || null,
      dob: patient.dob || null,
      gender: patient.gender || null,
      medical_history: patient.medical_history || patient.medicalHistory || {},
      allergies: patient.allergies || [],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function insertAppointment(appt, orgId) {
  if (!orgId) throw new Error('insertAppointment: orgId is required')
  await assertTestAccountLimit(orgId, 'appointments')
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      org_id: orgId,
      patient_id: appt.patient_id || appt.patientId,
      doctor_id: appt.doctor_id || appt.doctorId || null,
      type: appt.type,
      status: appt.status || 'scheduled',
      scheduled_at: appt.scheduled_at || appt.scheduledAt,
      duration_minutes: appt.duration_minutes || appt.durationMinutes || 30,
      chair_id: appt.chair_id || appt.chairId || null,
      notes: appt.notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Create a new clinic-user profile. Test orgs are capped at 1 profile (the
 * owner created by the test-account endpoint) — no team-member invites.
 *
 * Real onboarding goes through a SECURITY DEFINER RPC; this helper is for
 * operator-side or RPC-internal use after the limit check.
 */
export async function insertProfile(profile, orgId) {
  if (!orgId) throw new Error('insertProfile: orgId is required')
  await assertTestAccountLimit(orgId, 'profiles')
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: profile.id,
      org_id: orgId,
      role: profile.role || 'assistant',
      full_name: profile.full_name || profile.fullName || null,
      avatar_url: profile.avatar_url || profile.avatarUrl || null,
      locale: profile.locale || 'en',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Set / upsert an org-level secret. Operator-only at the RLS layer; this
 * helper additionally refuses to write secrets for test orgs at the
 * application layer, so even an operator acting on a test org cannot wire
 * up real WhatsApp / Anthropic credentials.
 */
export async function setOrgSecret(orgId, kind, value) {
  if (!orgId) throw new Error('setOrgSecret: orgId is required')
  const status = await fetchOrgStatus(orgId)
  if (status === 'test') {
    throw new Error('Refusing to write org_secrets for a test org. Promote the org to "active" first.')
  }
  const { data, error } = await supabase
    .from('org_secrets')
    .upsert({ org_id: orgId, kind, value }, { onConflict: 'org_id,kind' })
    .select()
    .single()
  if (error) throw error
  return data
}
