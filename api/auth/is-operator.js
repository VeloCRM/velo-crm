/**
 * Vercel Serverless Function — Operator identity probe.
 * Endpoint: GET /api/auth/is-operator
 *
 * Body: none
 * Auth: Authorization: Bearer <supabase access_token>
 *
 * Returns: { isOperator: boolean }
 *
 * Verifies the caller's Supabase JWT, then looks up the operators table
 * with the service role key. Used by src/contexts/OperatorContext to
 * populate the session-wide isOperator flag exactly once per sign-in.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin
    .from('operators')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (error) {
    console.error('[auth/is-operator] lookup failed:', error)
    return res.status(500).json({ error: 'Internal error' })
  }

  return res.status(200).json({ isOperator: !!data })
}
