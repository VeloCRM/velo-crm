/**
 * Vercel Serverless Function — Accept Invitation
 * Endpoint: POST /api/invitations/accept
 *
 * Body: { token: string }
 * Auth: Authorization: Bearer <supabase access_token>
 *
 * Calls the SECURITY DEFINER `accept_invitation(invite_token)` RPC using a
 * Supabase client authenticated as the invitee. The RPC creates the
 * profile, marks the invitation accepted, writes an audit row — all in
 * one transaction.
 *
 * The RPC raises specific exceptions; we map them to user-friendly
 * messages so the client doesn't see raw Postgres error text.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

function mapAcceptError(rawMessage) {
  const m = String(rawMessage || '')
  if (m.includes('Invitation not found')) return 'This invitation link is invalid.'
  if (m.includes('Invitation expired')) {
    return 'This invitation has expired. Ask the clinic owner for a new one.'
  }
  if (m.match(/Invitation is (revoked|accepted|expired)/)) {
    return 'This invitation is no longer valid.'
  }
  if (m.includes('Invitation email does not match signed-in user')) {
    return 'Sign in with the email address the invitation was sent to.'
  }
  if (m.includes('User already belongs to an organization')) {
    return "You're already part of a clinic. Sign out first to accept a new invitation."
  }
  if (m.includes('Cannot accept invitations for test accounts')) {
    return 'This invitation is for a test clinic. Test clinics are limited to one user.'
  }
  if (m.includes('Not authenticated')) return 'Please sign in to accept the invitation.'
  return 'Could not accept invitation.'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const accessToken = authHeader.slice('Bearer '.length).trim()
  if (!accessToken) return res.status(401).json({ error: 'Missing auth token' })

  // Build a Supabase client that runs the RPC as the caller (so SECURITY
  // DEFINER's auth.uid() resolves to the invitee).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Confirm the JWT is real — getUser() will reject expired/forged tokens.
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid auth token' })
  }

  let body
  try {
    body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}')
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const inviteToken = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!inviteToken) return res.status(400).json({ error: 'token is required' })

  const { data, error } = await userClient.rpc('accept_invitation', {
    invite_token: inviteToken,
  })

  if (error) {
    console.error('[invitations/accept] rpc failed:', error.message)
    return res.status(400).json({ error: mapAcceptError(error.message) })
  }

  return res.status(200).json({ ok: true, orgId: data || null })
}
