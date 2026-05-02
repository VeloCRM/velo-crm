/**
 * Vercel Serverless Function — Operator Set Secret
 * Endpoint: POST /api/operator/set-secret
 *
 * Body: { orgId: string, kind: SecretKind, value: string }
 * Auth: Authorization: Bearer <supabase access_token>  (must be an operator)
 *
 * Flow:
 *   1. Verify Supabase JWT.
 *   2. Confirm caller is in the `operators` table (service-role lookup).
 *   3. Validate orgId/kind/value.
 *   4. Refuse for orgs with status='test'.
 *   5. Upsert org_secrets (org_id, kind) -> value.
 *   6. Insert audit_log row with acting_user_id = operator, effective = null,
 *      payload = { kind } (NEVER the value).
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ALLOWED_KINDS = new Set([
  'whatsapp_token',
  'whatsapp_phone_id',
  'whatsapp_app_secret',
  'whatsapp_webhook_secret',
  'gmail_refresh_token',
  'anthropic_key',
])

const MAX_VALUE_LENGTH = 4096

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  // 1. JWT
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

  // 2. Operator check (service role bypasses RLS)
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: opRow, error: opErr } = await admin
    .from('operators')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (opErr) {
    console.error('[operator/set-secret] op check failed:', opErr)
    return res.status(500).json({ error: 'Internal error' })
  }
  if (!opRow) return res.status(403).json({ error: 'Not an operator' })

  // 3. Body
  let body
  try {
    body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}')
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const orgId = body?.orgId
  const kind = body?.kind
  const value = typeof body?.value === 'string' ? body.value.trim() : ''

  if (!orgId || !kind || !value) {
    return res.status(400).json({ error: 'orgId, kind, and value are required' })
  }
  if (!ALLOWED_KINDS.has(kind)) {
    return res.status(400).json({ error: 'Unsupported secret kind' })
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return res.status(400).json({ error: 'Secret value is too long' })
  }

  // 4. Refuse for test orgs (consistent with database.js setOrgSecret)
  const { data: org, error: orgErr } = await admin
    .from('orgs')
    .select('status')
    .eq('id', orgId)
    .single()
  if (orgErr || !org) return res.status(404).json({ error: 'Org not found' })
  if (org.status === 'test') {
    return res.status(403).json({
      error: 'Refusing to write secrets for a test org. Promote the org to active first.',
    })
  }

  // 5. Upsert
  const { error: upsertErr } = await admin
    .from('org_secrets')
    .upsert({ org_id: orgId, kind, value }, { onConflict: 'org_id,kind' })
  if (upsertErr) {
    console.error('[operator/set-secret] upsert failed:', upsertErr)
    return res.status(500).json({ error: 'Failed to save secret' })
  }

  // 6. Audit log — NEVER store the secret value
  const { error: auditErr } = await admin.from('audit_log').insert({
    org_id: orgId,
    acting_user_id: userId,
    effective_user_id: null,
    action: 'set_secret',
    entity_type: 'org_secret',
    entity_id: null,
    payload: { kind },
  })
  if (auditErr) {
    console.error('[operator/set-secret] audit log failed:', auditErr)
    // Non-fatal — the write succeeded.
  }

  return res.status(200).json({ ok: true })
}
