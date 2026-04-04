/**
 * Vercel Serverless Function — WhatsApp Cloud API Webhook
 * Endpoint: /api/webhooks/whatsapp
 *
 * Handles:
 * - GET: Webhook verification (Meta sends verify_token challenge)
 * - POST: Incoming messages from WhatsApp Cloud API
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')

  // GET = webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    // Verify against any org's webhook secret
    if (mode === 'subscribe' && token) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('whatsapp_webhook_secret', token)
        .single()

      if (org) {
        return res.status(200).send(challenge)
      }
    }
    return res.status(403).send('Verification failed')
  }

  // POST = incoming message
  if (req.method === 'POST') {
    try {
      const body = req.body

      if (body.object !== 'whatsapp_business_account') {
        return res.status(200).json({ status: 'ignored' })
      }

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue

          const value = change.value
          const phoneNumberId = value.metadata?.phone_number_id
          const messages = value.messages || []
          const contacts = value.contacts || []

          // Find org by phone number ID
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('whatsapp_phone_id', phoneNumberId)
            .single()

          if (!org) continue

          for (const msg of messages) {
            const senderPhone = msg.from
            const contactInfo = contacts.find(c => c.wa_id === senderPhone)
            const contactName = contactInfo?.profile?.name || senderPhone
            const text = msg.text?.body || msg.caption || `[${msg.type}]`

            // Find or create conversation
            let { data: conv } = await supabase
              .from('conversations')
              .select('id, user_id')
              .eq('org_id', org.id)
              .eq('channel', 'whatsapp')
              .eq('contact_name', contactName)
              .single()

            if (!conv) {
              // Get any admin user from this org
              const { data: admin } = await supabase
                .from('profiles')
                .select('id')
                .eq('org_id', org.id)
                .eq('role', 'admin')
                .limit(1)
                .single()

              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  org_id: org.id,
                  user_id: admin?.id,
                  channel: 'whatsapp',
                  contact_name: contactName,
                  company: '',
                  last_message: text,
                  last_time: new Date().toISOString(),
                  unread_count: 1,
                  status: 'online',
                })
                .select()
                .single()
              conv = newConv
            } else {
              await supabase
                .from('conversations')
                .update({
                  last_message: text,
                  last_time: new Date().toISOString(),
                  unread_count: supabase.rpc ? 1 : 1, // increment
                  status: 'online',
                })
                .eq('id', conv.id)
            }

            // Insert message
            if (conv) {
              await supabase.from('messages').insert({
                conversation_id: conv.id,
                org_id: org.id,
                sender: 'them',
                content: text,
              })
            }
          }
        }
      }

      return res.status(200).json({ status: 'ok' })
    } catch (err) {
      console.error('WhatsApp webhook error:', err)
      return res.status(200).json({ status: 'error', message: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
