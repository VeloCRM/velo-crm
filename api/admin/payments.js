/**
 * Vercel Serverless Function — Admin Payments (bypasses RLS)
 * Endpoint: GET /api/admin/payments
 *
 * Returns all payments across all orgs with org names and contact names.
 * Protected: requires valid Supabase auth token from a super admin user.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  // Validate auth token from request
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    // Verify the user's token using the anon key (or service key as fallback)
    const supabaseAuth = createClient(supabaseUrl, anonKey || serviceKey)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token' })
    }

    // Use service key to bypass RLS and check super admin status
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_super_admin) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Fetch all payments with org and contact info
    const [paymentsRes, profilesRes, orgsRes, contactsRes] = await Promise.all([
      supabaseAdmin.from('payments').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('profiles').select('id, org_id'),
      supabaseAdmin.from('organizations').select('id, name'),
      supabaseAdmin.from('contacts').select('id, name'),
    ])

    if (paymentsRes.error) {
      return res.status(500).json({ error: paymentsRes.error.message })
    }

    const profileMap = Object.fromEntries(
      (profilesRes.data || []).filter(p => p.org_id).map(p => [p.id, p.org_id])
    )
    const orgMap = Object.fromEntries(
      (orgsRes.data || []).map(o => [o.id, o.name])
    )
    const contactMap = Object.fromEntries(
      (contactsRes.data || []).map(c => [c.id, c.name])
    )

    const payments = (paymentsRes.data || []).map(row => ({
      id: row.id,
      contactId: row.contact_id,
      contactName: contactMap[row.contact_id] || '',
      amount: Number(row.amount) || 0,
      currency: row.currency || 'IQD',
      method: row.method || 'cash',
      status: row.status || 'paid',
      dueDate: row.due_date || '',
      paymentDate: row.payment_date || '',
      description: row.description || '',
      dealId: row.deal_id || '',
      source: row.source || 'manual',
      createdAt: row.created_at,
      orgId: profileMap[row.user_id] || null,
      orgName: orgMap[profileMap[row.user_id]] || 'Unassigned',
    }))

    return res.status(200).json({ payments })
  } catch (err) {
    console.error('Admin payments error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
