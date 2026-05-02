/**
 * Vercel Serverless Function — WhatsApp Outbound Send
 * Endpoint: POST /api/whatsapp/send
 *
 * Body: { patientId: string, body: string }
 * Auth: Authorization: Bearer <supabase access_token>
 *
 * Flow:
 *   1. Verify caller's Supabase JWT.
 *   2. Resolve their org_id from profiles.
 *   3. Block if org.status === 'test' (test accounts cannot send real
 *      WhatsApp messages).
 *   4. Enforce 1000 messages/day per org (whatsapp_usage table).
 *   5. Look up patient phone within the same org.
 *   6. Pull whatsapp_token + whatsapp_phone_id from org_secrets.
 *   7. POST to graph.facebook.com.
 *   8. On success: persist outbound message + update conversation, return
 *      Meta's message id.
 *
 * Errors are sanitized — never raw upstream content.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const RATE_LIMIT_PER_DAY = 1000
const MAX_BODY_LENGTH = 4000
const META_GRAPH_VERSION = 'v20.0'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  // ── 1. Verify caller JWT ────────────────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid auth token' })
  }
  const userId = userData.user.id

  // ── 2. Resolve org_id ───────────────────────────────────────────────────
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single()
  if (profErr || !profile?.org_id) {
    return res.status(403).json({ error: 'No org membership' })
  }
  const orgId = profile.org_id

  // ── 3. Block test orgs ──────────────────────────────────────────────────
  const { data: org, error: orgErr } = await admin
    .from('orgs')
    .select('status')
    .eq('id', orgId)
    .single()
  if (orgErr || !org) return res.status(404).json({ error: 'Org not found' })
  if (org.status === 'test') {
    return res.status(403).json({
      error: 'Test accounts cannot send WhatsApp messages. Contact the operator for a real clinic account.',
    })
  }

  // ── 4. Rate limit (1000/day) ────────────────────────────────────────────
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: rateErr } = await admin
    .from('whatsapp_usage')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('sent_at', dayAgoIso)
  if (rateErr) {
    console.error('[whatsapp/send] rate-limit lookup failed:', rateErr)
    return res.status(500).json({ error: 'WhatsApp service unavailable' })
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return res.status(429).json({
      error: `Daily WhatsApp send limit reached (${RATE_LIMIT_PER_DAY}/day).`,
    })
  }

  // ── 5. Parse body ───────────────────────────────────────────────────────
  let body
  try {
    body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}')
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const patientId = body?.patientId
  const messageRaw = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!patientId || !messageRaw) {
    return res.status(400).json({ error: 'patientId and body required' })
  }
  if (messageRaw.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message body too long (max ${MAX_BODY_LENGTH} chars)` })
  }

  // ── 6. Resolve patient (must be in same org) ────────────────────────────
  const { data: patient, error: patErr } = await admin
    .from('patients')
    .select('id, phone')
    .eq('id', patientId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (patErr) {
    console.error('[whatsapp/send] patient lookup failed:', patErr)
    return res.status(500).json({ error: 'Internal error' })
  }
  if (!patient) return res.status(404).json({ error: 'Patient not found' })
  if (!patient.phone) return res.status(400).json({ error: 'Patient has no phone number' })

  // ── 7. Pull WhatsApp credentials ────────────────────────────────────────
  const { data: secrets, error: secErr } = await admin
    .from('org_secrets')
    .select('kind, value')
    .eq('org_id', orgId)
    .in('kind', ['whatsapp_token', 'whatsapp_phone_id'])
  if (secErr) {
    console.error('[whatsapp/send] secrets lookup failed:', secErr)
    return res.status(500).json({ error: 'Internal error' })
  }
  const tokenRow = secrets?.find(s => s.kind === 'whatsapp_token')
  const phoneIdRow = secrets?.find(s => s.kind === 'whatsapp_phone_id')
  if (!tokenRow?.value || !phoneIdRow?.value) {
    return res.status(503).json({ error: 'WhatsApp credentials not configured for this org' })
  }

  // ── 8. POST to Meta Graph ───────────────────────────────────────────────
  const toPhone = patient.phone.replace(/\D/g, '')
  if (!toPhone) return res.status(400).json({ error: 'Patient phone is not numeric' })

  let metaResp
  try {
    metaResp = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneIdRow.value)}/messages`,
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${tokenRow.value}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body: messageRaw },
        }),
      },
    )
  } catch (err) {
    console.error('[whatsapp/send] fetch failed:', err)
    return res.status(502).json({ error: 'WhatsApp service unreachable' })
  }

  if (!metaResp.ok) {
    const status = metaResp.status
    await metaResp.text().catch(() => '') // drain, never echo
    if (status === 401 || status === 403) {
      return res.status(500).json({ error: 'WhatsApp authentication failed' })
    }
    if (status === 429) {
      return res.status(429).json({ error: 'WhatsApp service is rate-limiting. Try again shortly.' })
    }
    if (status >= 400 && status < 500) {
      return res.status(400).json({ error: 'WhatsApp service rejected the request' })
    }
    return res.status(502).json({ error: 'WhatsApp service error' })
  }

  let metaData
  try { metaData = await metaResp.json() }
  catch {
    return res.status(502).json({ error: 'WhatsApp service returned invalid response' })
  }
  const whatsappMessageId = metaData?.messages?.[0]?.id || null

  // ── 9. Persist conversation + outbound message ──────────────────────────
  let convId
  try {
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('org_id', orgId)
      .eq('patient_id', patientId)
      .eq('channel', 'whatsapp')
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      convId = existing.id
      await admin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId)
    } else {
      const { data: created, error: cErr } = await admin
        .from('conversations')
        .insert({
          org_id: orgId,
          patient_id: patientId,
          channel: 'whatsapp',
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        })
        .select('id')
        .single()
      if (cErr) throw cErr
      convId = created.id
    }

    await admin.from('messages').insert({
      org_id: orgId,
      conversation_id: convId,
      direction: 'outbound',
      body: messageRaw,
      sent_at: new Date().toISOString(),
      whatsapp_message_id: whatsappMessageId,
    })
  } catch (err) {
    console.error('[whatsapp/send] persistence failed (message was sent to Meta):', err)
    // Message was sent successfully on Meta's side; report success to client
    // but log the persistence failure for operator follow-up.
  }

  // ── 10. Record usage ────────────────────────────────────────────────────
  const { error: usageErr } = await admin
    .from('whatsapp_usage')
    .insert({ org_id: orgId })
  if (usageErr) {
    console.error('[whatsapp/send] usage record failed:', usageErr)
  }

  return res.status(200).json({ ok: true, messageId: whatsappMessageId })
}
