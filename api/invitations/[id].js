/**
 * Vercel Serverless Function — Revoke Invitation
 * Endpoint: DELETE /api/invitations/:id   (Vercel dynamic route)
 *
 * Auth: Authorization: Bearer <supabase access_token>
 *       Caller must be owner of the invitation's org, OR an operator.
 *
 * "Soft delete" — sets status='revoked' rather than DELETE so the audit
 * trail and accepted-by lookups remain consistent.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

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

  // Vercel passes the dynamic segment via req.query.id
  const invitationId = String(req.query?.id || '').trim()
  if (!invitationId) return res.status(400).json({ error: 'Invitation id is required' })

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Look up the invitation and the caller's profile in parallel.
  const [invRes, profileRes, opRes] = await Promise.all([
    admin
      .from('invitations')
      .select('id, org_id, status')
      .eq('id', invitationId)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('org_id, role')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('operators')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (invRes.error) {
    console.error('[invitations/delete] invitation lookup failed:', invRes.error)
    return res.status(500).json({ error: 'Internal error' })
  }
  if (!invRes.data) return res.status(404).json({ error: 'Invitation not found' })

  if (profileRes.error) {
    console.error('[invitations/delete] profile lookup failed:', profileRes.error)
    return res.status(500).json({ error: 'Internal error' })
  }

  const isOperator = !!opRes.data
  const isOwnerOfOrg =
    profileRes.data?.role === 'owner' &&
    profileRes.data?.org_id === invRes.data.org_id

  if (!isOperator && !isOwnerOfOrg) {
    return res.status(403).json({ error: 'Not authorized to revoke this invitation' })
  }

  // Defense in depth: filter by both id AND org_id.
  const { error: updErr } = await admin
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('org_id', invRes.data.org_id)
  if (updErr) {
    console.error('[invitations/delete] revoke failed:', updErr)
    return res.status(500).json({ error: 'Failed to revoke invitation' })
  }

  // Audit log
  const { error: auditErr } = await admin.from('audit_log').insert({
    org_id: invRes.data.org_id,
    acting_user_id: userId,
    effective_user_id: null,
    action: 'invitation.revoke',
    entity_type: 'invitation',
    entity_id: invitationId,
    payload: { source: isOperator ? 'operator' : 'owner' },
  })
  if (auditErr) {
    console.error('[invitations/delete] audit log failed:', auditErr)
  }

  return res.status(200).json({ ok: true })
}
