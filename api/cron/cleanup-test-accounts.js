/**
 * Vercel Cron Function — Cleanup Test Accounts
 * Endpoint: GET /api/cron/cleanup-test-accounts
 * Schedule: vercel.json — daily at 03:00 UTC.
 *
 * Deletes orgs with status='test' older than 14 days. The org_id foreign keys
 * have ON DELETE CASCADE so all tenant rows go with them.
 *
 * Auth: requires `Authorization: Bearer ${process.env.CRON_SECRET}`. Vercel
 * automatically sets this header on cron-triggered requests when CRON_SECRET
 * is configured as an env var. Manual calls must include it explicitly.
 * No fallback. Missing or wrong secret returns 401.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const TEST_ACCOUNT_TTL_DAYS = 14

export default async function handler(req, res) {
  // Auth gate — strict. No fallback if CRON_SECRET is unset.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' })
  }
  const authHeader = req.headers.authorization || ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const cutoffMs = Date.now() - TEST_ACCOUNT_TTL_DAYS * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  try {
    // Collect the affected user_ids first so we can also tear down the auth
    // accounts. Profiles cascade-delete with the org, but auth.users do not.
    const { data: expiredOrgs, error: selErr } = await admin
      .from('orgs')
      .select('id')
      .eq('status', 'test')
      .lt('created_at', cutoffIso)
    if (selErr) throw new Error(`select expired orgs: ${selErr.message}`)

    const expiredOrgIds = (expiredOrgs || []).map(o => o.id)

    let userIds = []
    if (expiredOrgIds.length > 0) {
      const { data: profiles, error: pErr } = await admin
        .from('profiles')
        .select('id')
        .in('org_id', expiredOrgIds)
      if (pErr) throw new Error(`select expired profiles: ${pErr.message}`)
      userIds = (profiles || []).map(p => p.id)
    }

    // Delete the orgs (CASCADE handles all tenant rows)
    let orgsDeleted = 0
    if (expiredOrgIds.length > 0) {
      const { error: delErr, count } = await admin
        .from('orgs')
        .delete({ count: 'exact' })
        .in('id', expiredOrgIds)
      if (delErr) throw new Error(`delete orgs: ${delErr.message}`)
      orgsDeleted = count ?? expiredOrgIds.length
    }

    // Delete the auth users (best-effort; failures are logged but non-fatal
    // because the tenant data is already gone).
    let authDeleted = 0
    const authErrors = []
    for (const uid of userIds) {
      const { error: aErr } = await admin.auth.admin.deleteUser(uid)
      if (aErr) authErrors.push({ user_id: uid, error: aErr.message })
      else authDeleted++
    }

    return res.status(200).json({
      ok: true,
      cutoff: cutoffIso,
      orgs_deleted: orgsDeleted,
      auth_users_deleted: authDeleted,
      auth_errors: authErrors,
    })
  } catch (err) {
    console.error('[cleanup-test-accounts] failed:', err)
    return res.status(500).json({ error: 'Cleanup failed', detail: err.message })
  }
}
