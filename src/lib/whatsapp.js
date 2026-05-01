/**
 * Velo CRM — WhatsApp client wrapper.
 *
 * Calls the server proxy at POST /api/whatsapp/send. The WhatsApp credentials
 * (token, phone_number_id, app_secret, webhook_secret) live in org_secrets,
 * which is operator-only at the RLS layer. The browser never sees them.
 */

import { supabase } from './supabase'

async function getAccessToken() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not signed in')
  return session.access_token
}

/**
 * Send a WhatsApp text message to a patient.
 *
 * @param {string} _orgId — accepted for callsite ergonomics; the server resolves
 *                          the caller's org from their JWT.
 * @param {string} patientId
 * @param {string} body — message text (1-4000 chars)
 * @returns {Promise<{ ok: true, messageId: string|null }>}
 */
export async function sendWhatsAppMessage(_orgId, patientId, body) {
  const token = await getAccessToken()
  const res = await fetch('/api/whatsapp/send', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ patientId, body }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `WhatsApp send failed (${res.status})`)
  }

  return res.json()
}
