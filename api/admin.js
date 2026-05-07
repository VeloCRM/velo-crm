import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

let supabaseAdmin = null
if (supabaseUrl && serviceKey) {
  supabaseAdmin = createClient(supabaseUrl, serviceKey)
}

const VALID_STATUSES = ['active', 'suspended', 'deleted']
const EMAIL_RE = /\S+@\S+\.\S+/

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server misconfiguration: missing service role key' })
    }

    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return res.status(401).json({ error: 'Invalid auth token' })
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token' })
    }

    const { data: op } = await supabaseAdmin
      .from('operators')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!op) {
      return res.status(403).json({ error: 'Not an operator' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { action } = body
    const payload = body.payload || {}

    if (action === 'createOrg') {
      const rawName = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (!rawName) {
        return res.status(400).json({ error: 'Organization name is required' })
      }
      const slug =
        rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
        `org-${Date.now().toString(36)}`

      const { data: org, error: insertErr } = await supabaseAdmin
        .from('orgs')
        .insert({
          name: rawName,
          slug,
          locale: 'en',
          currency: 'IQD',
          timezone: 'Asia/Baghdad',
          status: 'active',
        })
        .select()
        .single()
      if (insertErr) throw insertErr

      let invite = null
      const adminEmailRaw = typeof payload.admin_email === 'string' ? payload.admin_email.trim() : ''
      if (adminEmailRaw && EMAIL_RE.test(adminEmailRaw)) {
        const inviteToken = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const { error: inviteErr } = await supabaseAdmin
          .from('invitations')
          .insert({
            org_id: org.id,
            email: adminEmailRaw.toLowerCase(),
            role: 'owner',
            token: inviteToken,
            status: 'pending',
            expires_at: expiresAt,
            invited_by: user.id,
          })
        if (inviteErr) {
          console.warn('Invitation insert failed (non-blocking):', inviteErr.message)
        } else {
          const xfp = req.headers['x-forwarded-proto']
          const proto = (Array.isArray(xfp) ? xfp[0] : xfp || '').toString().split(',')[0].trim() || 'http'
          const host = req.headers.host || ''
          const origin = process.env.PUBLIC_APP_URL || `${proto}://${host}`
          invite = { token: inviteToken, url: `${origin}/join?token=${inviteToken}` }
        }
      }

      return res.status(200).json({ ok: true, org, invite })
    }

    if (action === 'updateOrgStatus') {
      const { id, status } = payload
      if (!id) return res.status(400).json({ error: 'id is required' })
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` })
      }
      const { data: org, error } = await supabaseAdmin
        .from('orgs')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, org })
    }

    if (action === 'deleteOrg') {
      const { id } = payload
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error } = await supabaseAdmin.from('orgs').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true, deleted: id })
    }

    if (action === 'updateOrgPlan') {
      return res.status(410).json({ error: 'updateOrgPlan no longer supported — orgs schema has no plan column' })
    }

    return res.status(400).json({ error: 'Unknown action: ' + (action ?? '<missing>') })
  } catch (err) {
    console.error('admin endpoint error:', err)
    return res.status(500).json({ error: err?.message || 'Internal error' })
  }
}
