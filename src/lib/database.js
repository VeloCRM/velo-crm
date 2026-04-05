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

export async function fetchContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapContact)
}

export async function insertContact(c) {
  const userId = (await supabase.auth.getUser()).data.user?.id
  const notesJson = JSON.stringify({ bio: c.notes || '', timeline: [], documents: [] })
  const { data, error } = await supabase
    .from('contacts')
    .insert({
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


// ─── Deals ──────────────────────────────────────────────────────────────────

export async function fetchDeals() {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapDeal)
}

export async function insertDeal(d, contacts) {
  const userId = (await supabase.auth.getUser()).data.user?.id
  const contact = contacts?.find(c => c.id === d.contactId)
  const { data, error } = await supabase
    .from('deals')
    .insert({
      user_id: userId,
      contact_id: d.contactId || null,
      title: d.name || d.title || '',
      value: Number(d.value) || 0,
      stage: d.stage || 'lead',
      probability: Number(d.probability) || 20,
      close_date: d.closeDate || null,
      notes: d.notes || '',
    })
    .select()
    .single()
  if (error) throw error
  return mapDeal(data, contact)
}

export async function patchDeal(id, updates) {
  const patch = {}
  if (updates.name !== undefined || updates.title !== undefined) patch.title = updates.name || updates.title
  if (updates.value !== undefined) patch.value = Number(updates.value) || 0
  if (updates.stage !== undefined) patch.stage = updates.stage
  if (updates.probability !== undefined) patch.probability = Number(updates.probability) || 0
  if (updates.closeDate !== undefined) patch.close_date = updates.closeDate
  if (updates.notes !== undefined) patch.notes = updates.notes
  if (updates.contactId !== undefined) patch.contact_id = updates.contactId

  const { data, error } = await supabase
    .from('deals')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapDeal(data)
}

export async function removeDeal(id) {
  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) throw error
}

function mapDeal(row, contact) {
  return {
    id: row.id,
    name: row.title,
    contactId: row.contact_id,
    contact: contact?.name || '',
    company: contact?.company || '',
    value: Number(row.value) || 0,
    stage: row.stage,
    probability: row.probability,
    closeDate: row.close_date || '',
    createdAt: row.created_at?.slice(0, 10) || '',
    notes: row.notes,
  }
}


// ─── Tickets ────────────────────────────────────────────────────────────────

export async function fetchTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_comments(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapTicket)
}

export async function insertTicket(tk, contacts) {
  const userId = (await supabase.auth.getUser()).data.user?.id
  const contact = contacts?.find(c => c.id === tk.contactId)

  // Generate ticket number
  const { data: existing } = await supabase
    .from('tickets')
    .select('ticket_number')
    .order('created_at', { ascending: false })
    .limit(1)
  const lastNum = existing?.[0]?.ticket_number
    ? parseInt(existing[0].ticket_number.replace('VLO-', ''))
    : 0
  const ticketNumber = 'VLO-' + String(lastNum + 1).padStart(3, '0')

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      user_id: userId,
      contact_id: tk.contactId || null,
      ticket_number: ticketNumber,
      subject: tk.subject || '',
      description: tk.description || '',
      priority: tk.priority || 'medium',
      status: tk.status || 'open',
      department: tk.department || 'support',
      assigned_to: tk.assignee || '',
      conversation_id: tk.conversationId || null,
    })
    .select()
    .single()
  if (error) throw error

  // Insert "created" timeline entry
  await supabase.from('ticket_comments').insert({
    ticket_id: data.id,
    user_id: userId,
    type: 'created',
    content: 'Ticket created',
    author_name: 'Admin User',
  })

  return mapTicket({ ...data, ticket_comments: [], _contactName: contact?.name, _company: contact?.company })
}

export async function patchTicket(id, updates) {
  const patch = {}
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.priority !== undefined) patch.priority = updates.priority
  if (updates.assignee !== undefined) patch.assigned_to = updates.assignee
  if (updates.department !== undefined) patch.department = updates.department
  if (updates.subject !== undefined) patch.subject = updates.subject
  if (updates.description !== undefined) patch.description = updates.description

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('tickets').update(patch).eq('id', id)
    if (error) throw error
  }

  // Insert timeline entries if provided
  if (updates.timeline) {
    const userId = (await supabase.auth.getUser()).data.user?.id
    const newEntries = updates.timeline.filter(e => e._new)
    for (const entry of newEntries) {
      await supabase.from('ticket_comments').insert({
        ticket_id: id,
        user_id: userId,
        type: entry.type || 'comment',
        content: entry.text,
        author_name: entry.author || 'Admin User',
      })
    }
  }

  // Re-fetch the ticket with comments
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_comments(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return mapTicket(data)
}

function mapTicket(row) {
  const comments = (row.ticket_comments || []).sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  )
  return {
    id: row.id,
    ticketId: row.ticket_number,
    subject: row.subject,
    description: row.description,
    contactId: row.contact_id,
    contactName: row._contactName || '',
    company: row._company || '',
    priority: row.priority,
    status: row.status,
    department: row.department,
    assignee: row.assigned_to,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    timeline: comments.map(c => ({
      id: c.id,
      type: c.type,
      text: c.content,
      author: c.author_name,
      date: c.created_at,
    })),
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


// ─── Hydrate references ─────────────────────────────────────────────────────
// After fetching all data, fill in contact names on deals & tickets

export function hydrateReferences(contacts, deals, tickets) {
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]))
  const hydratedDeals = deals.map(d => ({
    ...d,
    contact: contactMap[d.contactId]?.name || '',
    company: contactMap[d.contactId]?.company || '',
  }))
  const hydratedTickets = tickets.map(tk => ({
    ...tk,
    contactName: contactMap[tk.contactId]?.name || tk.contactName || '',
    company: contactMap[tk.contactId]?.company || tk.company || '',
  }))
  return { contacts, deals: hydratedDeals, tickets: hydratedTickets }
}
