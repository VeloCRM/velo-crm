#!/usr/bin/env node
/**
 * role-distribution-check.mjs — READ-ONLY production check of profile roles.
 *
 * Answers two questions for the V1.5 role work:
 *   1. Distribution of profiles.role (count by role, desc).
 *   2. Are role='assistant' rows real users or incidental defaults?
 *      (profiles.role DEFAULTs to 'assistant', so a count alone is ambiguous.)
 *
 * Read-only: SELECT only, no writes. Needs the SERVICE-ROLE key to see across
 * all orgs (anon key is RLS-limited to the caller's org).
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/role-distribution-check.mjs
 * or (auto-reads .env.local if those vars aren't already exported):
 *   node scripts/role-distribution-check.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve creds from env, falling back to a manual parse of .env.local.
function fromEnvFile(keys) {
  const out = {}
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && keys.includes(m[1])) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const fileVars = fromEnvFile([
  'SUPABASE_URL', 'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
])
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fileVars.SUPABASE_URL || fileVars.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || fileVars.SUPABASE_SERVICE_ROLE_KEY || fileVars.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.error('Missing Supabase URL or SERVICE-ROLE key. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or put them in .env.local).')
  console.error('Note: the anon key will NOT work — it is RLS-limited to one org.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// ── 1. Role distribution ────────────────────────────────────────────────────
const { data: roles, error: e1 } = await supabase.from('profiles').select('role')
if (e1) { console.error('Query 1 failed:', e1.message); process.exit(1) }

const counts = {}
for (const r of roles) counts[r.role] = (counts[r.role] || 0) + 1
const dist = Object.entries(counts).sort((a, b) => b[1] - a[1])

console.log('\n=== Role distribution (count by role, desc) ===')
console.log('role           | n')
console.log('---------------+-----')
for (const [role, n] of dist) console.log(`${String(role).padEnd(14)} | ${n}`)
console.log(`(total profiles: ${roles.length})`)

// ── 2. Assistant rows — real users or defaults? ─────────────────────────────
const { data: assistants, error: e2 } = await supabase
  .from('profiles')
  .select('id, full_name, org_id, created_at, orgs(name)')
  .eq('role', 'assistant')
  .order('created_at', { ascending: true })
if (e2) { console.error('Query 2 failed:', e2.message); process.exit(1) }

console.log(`\n=== assistant rows (${assistants.length}) ===`)
if (assistants.length === 0) {
  console.log('(none)')
} else {
  for (const a of assistants) {
    console.log(`${a.created_at}  ${(a.full_name || '(no name)').padEnd(24)}  org=${a.orgs?.name || a.org_id}  id=${a.id}`)
  }
}
console.log('')
