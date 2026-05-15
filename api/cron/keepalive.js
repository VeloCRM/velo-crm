/**
 * Vercel Cron Function — Supabase Keepalive Heartbeat
 * Endpoint: GET /api/cron/keepalive
 * Schedule: vercel.json — daily at 04:00 UTC.
 *
 * Purpose: register a daily query against Supabase so the free-tier
 * auto-pause activity timer never trips. Independent of the cleanup
 * cron — if cleanup breaks (e.g., key rotation, env-var drift), the
 * heartbeat still touches the DB and keeps the project alive.
 *
 * Auth: requires `Authorization: Bearer ${process.env.CRON_SECRET}`,
 * same pattern as cleanup-test-accounts.js. Mirrors env var names so
 * a single set of secrets covers both crons.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
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

  try {
    const { data, error } = await admin.from('orgs').select('id').limit(1)
    if (error) {
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      rowCount: data?.length ?? 0,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
