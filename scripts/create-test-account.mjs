#!/usr/bin/env node
/**
 * Velo CRM — Create a test account for a doctor
 *
 * Creates a Supabase auth user + profile for testing.
 *
 * Usage:
 *   node scripts/create-test-account.mjs \
 *     --supabase-url=https://xxx.supabase.co \
 *     --supabase-key=YOUR_SERVICE_ROLE_KEY \
 *     --email=doctor@clinic.com \
 *     --password=TempPass123! \
 *     --name="Dr Hawkar"
 */

import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )
  const supabaseUrl = args['supabase-url'] || process.env.SUPABASE_URL
  const supabaseKey = args['supabase-key'] || process.env.SUPABASE_SERVICE_KEY
  const email = args['email']
  const password = args['password']
  const name = args['name'] || 'Test User'

  if (!supabaseUrl || !supabaseKey || !email || !password) {
    console.error(`
  Usage:
    node scripts/create-test-account.mjs \\
      --supabase-url=https://xxx.supabase.co \\
      --supabase-key=YOUR_SERVICE_ROLE_KEY \\
      --email=doctor@clinic.com \\
      --password=SecurePass123! \\
      --name="Dr Hawkar"
`)
    process.exit(1)
  }
  return { supabaseUrl, supabaseKey, email, password, name }
}

async function main() {
  const config = getConfig()
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  console.log()
  console.log('=== Creating Velo CRM Test Account ===')
  console.log()

  // 1. Create auth user
  console.log('1. Creating auth user:', config.email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    user_metadata: { full_name: config.name },
  })

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      console.log('   User already exists — fetching...')
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users.find(u => u.email === config.email)
      if (existing) {
        console.log('   Found user ID:', existing.id)
        console.log()
        console.log('=== Account Ready ===')
        console.log('Email:    ', config.email)
        console.log('Password: ', config.password)
        console.log('User ID:  ', existing.id)
        console.log()
        console.log('The doctor can now log in at your Velo CRM URL.')
        return
      }
    }
    console.error('   Error:', authError.message)
    process.exit(1)
  }

  const userId = authData.user.id
  console.log('   Created! User ID:', userId)

  // 2. Check if profile was auto-created by trigger
  console.log('2. Checking profile...')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (profile) {
    console.log('   Profile exists (auto-created by trigger)')
    // Update with full name and admin role
    await supabase.from('profiles').update({
      full_name: config.name,
      role: 'admin',
    }).eq('id', userId)
    console.log('   Updated role to admin')
  } else {
    console.log('   Creating profile...')
    await supabase.from('profiles').insert({
      id: userId,
      email: config.email,
      full_name: config.name,
      role: 'admin',
    })
    console.log('   Profile created')
  }

  console.log()
  console.log('=== Account Ready ===')
  console.log()
  console.log('  Email:     ', config.email)
  console.log('  Password:  ', config.password)
  console.log('  Name:      ', config.name)
  console.log('  User ID:   ', userId)
  console.log('  Role:       admin')
  console.log()
  console.log('The doctor can log in at your Velo CRM URL:')
  console.log('  https://velo-crm-coral.vercel.app')
  console.log()
  console.log('To import this doctor\'s patients, run:')
  console.log(`  node scripts/velo-import.mjs --supabase-url=... --supabase-key=... --user-id=${userId} --doctor=${config.name.toLowerCase().includes('hawkar') ? 'hawkar' : 'saif'}`)
  console.log()
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1) })
