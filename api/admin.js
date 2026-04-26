import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Initialize service role client safely ONLY on backend
let supabaseAdmin = null
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfiguration: missing Supabase credentials' })

  try {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'Missing auth header' })
    const token = authHeader.replace('Bearer ', '')

    // Verify user using standard client logic
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

    // Check if user is super admin
    const { data: profile } = await supabaseAdmin.from('profiles').select('is_super_admin').eq('id', user.id).single()
    if (!profile?.is_super_admin) {
      return res.status(403).json({ error: 'Forbidden. Super admin only.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { action, payload } = body

    if (action === 'deleteOrg') {
      const { id } = payload
      const { error } = await supabaseAdmin.from('organizations').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (action === 'updateOrgStatus') {
      const { id, status } = payload
      const { error } = await supabaseAdmin.from('organizations').update({ status }).eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (action === 'updateOrgPlan') {
      const { id, plan } = payload
      const { error } = await supabaseAdmin.from('organizations').update({ plan }).eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (action === 'createOrg') {
      const { name, industry, plan, admin_email } = payload
      
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)

      const { data: org, error } = await supabaseAdmin.from('organizations').insert({
        name, industry, plan, status: 'active',
        trial_ends_at: plan !== 'free' ? trialEndsAt.toISOString() : null
      }).select().single()
      
      if (error) throw error
      
      if (admin_email) {
        await supabaseAdmin.from('profiles').insert({
          email: admin_email, org_id: org.id, role: 'admin'
        })
      }

      if (plan !== 'free') {
        const planPrices = { starter: 29, pro: 79, enterprise: 199 }
        await supabaseAdmin.from('invoices').insert({
          org_id: org.id, amount: planPrices[plan] || 0, plan, status: 'pending',
          issue_date: new Date().toISOString(), due_date: trialEndsAt.toISOString(),
          notes: 'First invoice (14-day trial)'
        })
      }
      return res.status(200).json({ success: true, org })
    }

    return res.status(400).json({ error: 'Unknown action' })

  } catch (error) {
    console.error('Admin API error:', error)
    return res.status(500).json({ error: error.message })
  }
}
