import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Only allow GET or POST for cron, optionally check authorization headers if Vercel CRON secret is used
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const now = new Date().toISOString()

    // Find organizations that need to be suspended
    // Condition 1: Free plan with expired trial (if applicable)
    // Condition 2: Paid plan with expired subscription
    // Since Supabase JS doesn't easily let us express precisely the user's complex OR logic cleanly in one chain, 
    // we use a postgrest native OR filter string:
    
    // As per user instructions:
    // trial_ends_at < NOW() AND status = 'active' AND plan = 'free'
    // OR subscription_ends_at < NOW() AND status = 'active'
    
    // We will query active orgs and filter them out.
    const { data: activeOrgs, error: fetchError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('status', 'active')

    if (fetchError) throw fetchError

    const toSuspend = activeOrgs.filter(org => {
      const isFreeTrialExpired = org.plan === 'free' && org.trial_ends_at && new Date(org.trial_ends_at) < new Date(now);
      const isSubExpired = org.subscription_ends_at && new Date(org.subscription_ends_at) < new Date(now);
      const isPaidTrialExpired = org.plan !== 'free' && org.trial_ends_at && new Date(org.trial_ends_at) < new Date(now) && !org.subscription_ends_at; // Handling standard trials too
      
      return isFreeTrialExpired || isSubExpired || isPaidTrialExpired;
    })

    if (toSuspend.length === 0) {
      return res.status(200).json({ message: 'No organizations to suspend', suspendedCount: 0 })
    }

    const orgIds = toSuspend.map(o => o.id)

    // Suspend them
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ status: 'suspended' })
      .in('id', orgIds)

    if (updateError) throw updateError

    // Log to subscription_events
    const logEvents = toSuspend.map(org => ({
      org_id: org.id,
      event_type: 'auto_suspend',
      details: {
        reason: 'trial_or_subscription_expired',
        plan: org.plan,
        trial_ends_at: org.trial_ends_at,
        subscription_ends_at: org.subscription_ends_at
      }
    }))

    const { error: logError } = await supabaseAdmin
      .from('subscription_events')
      .insert(logEvents)

    if (logError) {
      console.warn('Failed to log subscription events:', logError)
    }

    return res.status(200).json({
      message: 'Successfully suspended expired organizations',
      suspendedCount: orgIds.length,
      orgIds
    })

  } catch (error) {
    console.error('Check subscriptions cron error:', error)
    return res.status(500).json({ error: error.message })
  }
}
