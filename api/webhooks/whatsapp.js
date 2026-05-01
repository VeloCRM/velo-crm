/**
 * Vercel Serverless Function — WhatsApp Cloud API Webhook
 * Endpoint: /api/webhooks/whatsapp
 *
 * Inbound messages from Meta. The body is read raw (Vercel's bodyParser is
 * disabled) so we can verify the X-Hub-Signature-256 HMAC over the exact
 * bytes Meta signed.
 *
 * Security model:
 *   - GET verification: hub.verify_token must match an org's
 *     org_secrets.whatsapp_webhook_secret.
 *   - POST messages: lookup the org by phone_number_id, fetch that org's
 *     whatsapp_app_secret, recompute the HMAC, compare via
 *     crypto.timingSafeEqual. No persistence happens until the signature is
 *     confirmed.
 *   - Server-to-server only: no CORS headers.
 *   - Errors return generic strings — never internal detail.
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY

// Hard fail at module load — there is no anon-key fallback.
if (!serviceKey) {
  throw new Error('[whatsapp webhook] SUPABASE_SERVICE_ROLE_KEY is required at module load')
}
if (!supabaseUrl) {
  throw new Error('[whatsapp webhook] SUPABASE_URL is required at module load')
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MAX_STORED_BODY_BYTES = 4 * 1024 // cap stored message body at 4 KB

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

function truncateBody(text) {
  if (typeof text !== 'string') return { body: '', truncated: false }
  const buf = Buffer.from(text, 'utf8')
  if (buf.length <= MAX_STORED_BODY_BYTES) return { body: text, truncated: false }
  // Slicing may chop a multi-byte char; toString tolerates that.
  const truncated = buf.subarray(0, MAX_STORED_BODY_BYTES).toString('utf8')
  return { body: truncated, truncated: true }
}

function timingSafeStringEq(a, b) {
  const bufA = Buffer.from(String(a), 'utf8')
  const bufB = Buffer.from(String(b), 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function extractPhoneNumberId(payload) {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.metadata?.phone_number_id
      if (id) return id
    }
  }
  return null
}

export default async function handler(req, res) {
  // ── GET — webhook verification challenge ────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode']
    const verifyToken = req.query?.['hub.verify_token']
    const challenge = req.query?.['hub.challenge']
    if (mode !== 'subscribe' || !verifyToken) {
      return res.status(403).send('Verification failed')
    }
    try {
      const { data } = await admin
        .from('org_secrets')
        .select('id')
        .eq('kind', 'whatsapp_webhook_secret')
        .eq('value', verifyToken)
        .limit(1)
        .maybeSingle()
      if (!data) return res.status(403).send('Verification failed')
      return res.status(200).send(challenge ?? '')
    } catch (err) {
      console.error('[whatsapp webhook] GET lookup failed:', err)
      return res.status(500).send('Internal error')
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── POST — inbound messages ──────────────────────────────────────────────
  const signature = req.headers['x-hub-signature-256']
  if (!signature) return res.status(403).json({ error: 'Forbidden' })

  let rawBody
  try { rawBody = await readRawBody(req) }
  catch (err) {
    console.error('[whatsapp webhook] body read failed:', err)
    return res.status(400).json({ error: 'Bad request' })
  }

  // Parse to find phone_number_id WITHOUT trusting the contents yet.
  let payload
  try { payload = JSON.parse(rawBody.toString('utf8')) }
  catch { return res.status(400).json({ error: 'Bad request' }) }

  if (payload?.object !== 'whatsapp_business_account') {
    return res.status(404).json({ error: 'Not found' })
  }

  const phoneNumberId = extractPhoneNumberId(payload)
  if (!phoneNumberId) return res.status(404).json({ error: 'Not found' })

  // Resolve org by phone_number_id
  let orgId
  try {
    const { data, error } = await admin
      .from('org_secrets')
      .select('org_id')
      .eq('kind', 'whatsapp_phone_id')
      .eq('value', phoneNumberId)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data?.org_id) return res.status(404).json({ error: 'Not found' })
    orgId = data.org_id
  } catch (err) {
    console.error('[whatsapp webhook] phone_id lookup failed:', err)
    return res.status(500).json({ error: 'Internal error' })
  }

  // Fetch this org's app_secret
  let appSecret
  try {
    const { data, error } = await admin
      .from('org_secrets')
      .select('value')
      .eq('org_id', orgId)
      .eq('kind', 'whatsapp_app_secret')
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data?.value) return res.status(403).json({ error: 'Forbidden' })
    appSecret = data.value
  } catch (err) {
    console.error('[whatsapp webhook] app_secret lookup failed:', err)
    return res.status(500).json({ error: 'Internal error' })
  }

  // HMAC verify over the exact raw bytes
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')
  if (!timingSafeStringEq(expected, signature)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // ── Verified. Persist messages. ─────────────────────────────────────────
  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue
        const value = change.value || {}
        const messages = value.messages || []
        const waContacts = value.contacts || []

        for (const msg of messages) {
          const senderPhone = msg?.from
          if (!senderPhone) continue

          const contactInfo = waContacts.find(c => c.wa_id === senderPhone)
          const contactName = contactInfo?.profile?.name || senderPhone
          const rawText = msg?.text?.body || msg?.caption || `[${msg?.type || 'unknown'}]`
          const { body: text, truncated } = truncateBody(rawText)
          if (truncated) {
            console.warn(`[whatsapp webhook] truncated body from ${senderPhone} (${rawText.length} bytes)`)
          }

          // Try to match a patient by phone in this org. Meta gives the phone
          // without a leading "+"; clinics may store either format.
          const phoneWithPlus = '+' + senderPhone.replace(/\D/g, '')
          const { data: patient } = await admin
            .from('patients')
            .select('id')
            .eq('org_id', orgId)
            .or(`phone.eq.${phoneWithPlus},phone.eq.${senderPhone}`)
            .limit(1)
            .maybeSingle()
          if (!patient) {
            console.warn(`[whatsapp webhook] no patient match for ${senderPhone} in org ${orgId} (sender ${contactName})`)
            continue
          }

          // Find or create the WhatsApp conversation for this patient
          let convId
          {
            const { data: existing } = await admin
              .from('conversations')
              .select('id')
              .eq('org_id', orgId)
              .eq('patient_id', patient.id)
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
              const { data: created, error: convErr } = await admin
                .from('conversations')
                .insert({
                  org_id: orgId,
                  patient_id: patient.id,
                  channel: 'whatsapp',
                  last_message_at: new Date().toISOString(),
                  unread_count: 1,
                })
                .select('id')
                .single()
              if (convErr) throw convErr
              convId = created.id
            }
          }

          await admin.from('messages').insert({
            org_id: orgId,
            conversation_id: convId,
            direction: 'inbound',
            body: text,
            sent_at: new Date().toISOString(),
            whatsapp_message_id: msg?.id || null,
          })
        }
      }
    }

    return res.status(200).json({ status: 'ok' })
  } catch (err) {
    console.error('[whatsapp webhook] processing error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
