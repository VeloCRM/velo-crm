#!/usr/bin/env node
/**
 * dryrun-scale-fixes-PROD.mjs — PRODUCTION dry-run of the scale fixes. Applies both
 * SQL files (STRIPPED of full-line comments) inside BEGIN … [VERIFY] … ROLLBACK over
 * a raw `pg` connection — NOTHING PERSISTS. The "does it apply cleanly to prod + are
 * the grants right + do the numbers reconcile on REAL data + is the view RLS-safe"
 * rehearsal before the real human-runs-it apply.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *
 * We STRIP full-line comments (drops the commented pg_trgm block + the reconciliation
 * probe) so only executable DDL runs inside OUR controlling txn. Neither scale file
 * carries its own BEGIN;/COMMIT; — but we HARD-ABORT if one survives the strip anyway,
 * since a file COMMIT would COMMIT TO PROD.
 *
 * VERIFY (in-transaction, before ROLLBACK):
 *   1. all 8 scale indexes would exist.
 *   2. patient_outstanding_balances view would exist + reloptions security_invoker on.
 *   3. authenticated has SELECT and ONLY SELECT; anon has NO grant.
 *   4. RECONCILIATION on REAL prod data (Le Royal et al.): read the view's Σ owed per
 *      (org, currency) and assert it is (a) >= 0 and (b) >= finance_ledger_totals'
 *      net `outstanding` for the same (org, currency) — gross-to-collect can only be
 *      >= net, because net absorbs patient credits the worklist excludes.
 *   5. TENANT ISOLATION on REAL prod data (best-effort, mirrors the per-doctor pair):
 *      simulate an owner (SET ROLE authenticated + JWT-claim GUC) of an org that has
 *      owed rows and confirm the security_invoker view returns ONLY their org.
 *   (4)/(5) SKIP if prod has no owed rows yet — nothing to reconcile or leak.
 *
 * We do NOT seed anything on prod (even rolled back). (4)/(5) only READ existing rows
 * and impersonate an existing user's RLS identity inside the aborted txn.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-scale-fixes-PROD.mjs
 *
 * Exit 0 iff every executed assertion passed. The transaction is ALWAYS rolled back.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'

// ── Connection guard (INVERTED: require PROD, reject STAGING) ──────────────────
const DB_URL = process.env.PROD_DB_URL
if (!DB_URL) {
  console.error('Set PROD_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres')
  process.exit(1)
}
if (!DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL does not contain the production ref (${PROD_REF}).`)
  console.error('This runner is the PRODUCTION dry-run — point it at production only.')
  process.exit(1)
}
if (DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL contains the staging ref (${STAGING_REF}).`)
  process.exit(1)
}

// ── Load both files, STRIP full-line comments, HARD-ABORT on any BEGIN;/COMMIT; ─
function stripSql(sql) {
  return sql.split('\n').filter((l) => { const t = l.trim(); return t && !t.startsWith('--') }).join('\n')
}
function loadStripped(name) {
  const p = path.join(__dirname, '..', 'scripts', name)
  if (!fs.existsSync(p)) { console.error(`SQL not found at ${p}`); process.exit(1) }
  const sql = stripSql(fs.readFileSync(p, 'utf8'))
  if (/^\s*BEGIN;\s*$/m.test(sql) || /^\s*COMMIT;\s*$/m.test(sql)) {
    console.error(`ABORT: a standalone BEGIN;/COMMIT; survived the strip in ${name} — refusing to run inside the dry-run txn (could COMMIT TO PROD).`)
    process.exit(1)
  }
  return sql
}
const indexSql = loadStripped('scale-indexes-migration.sql')          // 1st — indexes
const viewSql = loadStripped('patient-outstanding-balances-view.sql') // 2nd — view

const EXPECTED_INDEXES = [
  'appointments_org_scheduled_idx',
  'appointments_org_patient_idx',
  'charges_org_created_idx',
  'charges_reverses_idx',
  'payments_org_recorded_idx',
  'payments_reverses_idx',
  'treatment_plans_org_patient_idx',
  'treatment_plan_items_plan_idx',
]

const u = new URL(DB_URL)
const client = new Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
})

// ── Harness ───────────────────────────────────────────────────────────────────
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}
function skip(name, reason) {
  console.log(`⊘ SKIP  ${name}${reason ? '  — ' + reason : ''}`)
}

async function schemaVerify() {
  // 1. all 8 indexes
  const ri = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)`, [EXPECTED_INDEXES])
  const present = new Set(ri.rows.map((r) => r.indexname))
  for (const name of EXPECTED_INDEXES) check(`1. index would exist: ${name}`, present.has(name))
  check('1. all 8 scale indexes present', present.size === EXPECTED_INDEXES.length, `${present.size}/8`)

  // 2. view exists + security_invoker on (accept true|on — PG stores our `= true`)
  const r1 = await client.query(
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='patient_outstanding_balances' AND c.relkind='v'`)
  const opts = r1.rows[0]?.reloptions || null
  check('2. patient_outstanding_balances view would exist', r1.rows.length === 1)
  check('2. reloptions contains security_invoker on (RLS safety)',
    Array.isArray(opts) && (opts.includes('security_invoker=on') || opts.includes('security_invoker=true')),
    `reloptions=${opts ? '{' + opts.join(',') + '}' : 'NULL'}`)

  // 3. grants: authenticated = SELECT only; anon none
  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='patient_outstanding_balances'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`)
  const authPrivs = r2.rows.filter((r) => r.grantee === 'authenticated').map((r) => r.privilege_type).sort()
  const anonAny = r2.rows.some((r) => r.grantee === 'anon')
  check('3a. authenticated has SELECT ONLY (no INSERT/UPDATE/DELETE)',
    authPrivs.length === 1 && authPrivs[0] === 'SELECT', `authenticated=[${authPrivs.join(', ')}]`)
  check('3b. anon has NO grant on the view', !anonAny,
    r2.rows.filter((r) => r.grantee === 'anon').map((r) => r.privilege_type).join(', ') || '(none)')
}

// Reconciliation + tenant isolation on REAL prod rows.
async function realDataVerify() {
  // As postgres (RLS bypassed): view gross Σ owed per (org,currency) vs the net view.
  const grossRows = (await client.query(
    `SELECT org_id::text AS org_id, currency::text AS currency, SUM(owed)::bigint AS gross
       FROM public.patient_outstanding_balances GROUP BY org_id, currency`)).rows
  const netRows = (await client.query(
    `SELECT org_id::text AS org_id, currency::text AS currency, outstanding::bigint AS net
       FROM public.finance_ledger_totals`)).rows

  if (grossRows.length === 0 && netRows.length === 0) {
    skip('4. reconciliation (real prod data)', 'no charges/payments on prod yet — nothing to reconcile; proven on staging')
    skip('5. tenant isolation (real prod data)', 'no owed rows on prod yet — nothing to leak; proven on staging')
    return
  }

  const grossMap = new Map(grossRows.map((r) => [`${r.org_id}|${r.currency}`, Number(r.gross)]))
  const netMap = new Map(netRows.map((r) => [`${r.org_id}|${r.currency}`, Number(r.net)]))
  const keys = [...new Set([...grossMap.keys(), ...netMap.keys()])].sort()
  let allNonNeg = true, allGteNet = true
  for (const k of keys) {
    const g = grossMap.get(k) || 0
    const n = netMap.get(k) || 0
    if (g < 0) allNonNeg = false
    if (g < n) allGteNet = false
  }
  check('4a. view Σ owed per (org,currency) is >= 0', allNonNeg)
  check('4b. gross-to-collect >= net outstanding per (org,currency) (net absorbs credits)', allGteNet)
  console.log('    reconciliation detail (real prod data — org|currency: gross / net):')
  for (const k of keys) console.log(`      ${k}: gross=${grossMap.get(k) || 0}  net=${netMap.get(k) || 0}`)

  // 5. TENANT ISOLATION — simulate an owner of an org that has owed rows.
  const owedOrgs = [...new Set(grossRows.map((r) => r.org_id))]
  if (owedOrgs.length === 0) { skip('5. tenant isolation (real prod data)', 'no org has owed rows'); return }
  const prof = (await client.query(
    `SELECT p.id::text AS id, p.org_id::text AS org_id FROM public.profiles p
      WHERE p.org_id = ANY($1::uuid[]) AND p.role='owner' LIMIT 1`, [owedOrgs])).rows[0]
  if (!prof) { skip('5. tenant isolation (real prod data)', 'no OWNER profile in an org with owed rows'); return }

  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: prof.id, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prof.id])
  await client.query('SET ROLE authenticated')
  try {
    const uid = (await client.query(`SELECT auth.uid()::text AS uid`)).rows[0].uid
    const oid = (await client.query(`SELECT public.current_org_id()::text AS oid`)).rows[0].oid
    check('5a. RLS sim: auth.uid()/current_org_id() resolve to the chosen owner/org',
      uid === prof.id && oid === prof.org_id, `uid=${uid} org=${oid}`)
    const seenOrgs = (await client.query(
      `SELECT DISTINCT org_id::text AS org_id FROM public.patient_outstanding_balances`)).rows.map((r) => r.org_id)
    const onlyOwn = seenOrgs.every((o) => o === prof.org_id)
    check(`5b. TENANT ISOLATION: owner sees ONLY their org (${owedOrgs.length} org(s) have owed rows)`,
      onlyOwn, `member org=${prof.org_id} view orgs=[${seenOrgs.join(', ')}]`)
  } finally {
    await client.query('RESET ROLE').catch(() => {})
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — scale indexes + patient_outstanding_balances view (${u.hostname})\n${'='.repeat(74)}`)
  await client.query('BEGIN')

  await client.query(indexSql) // CREATE INDEX IF NOT EXISTS ×8 (uncommitted)
  console.log('✓ index DDL applied (uncommitted)')
  await client.query(viewSql)  // CREATE OR REPLACE VIEW + REVOKE/GRANT (uncommitted)
  console.log('✓ view DDL applied (uncommitted)\n')

  await schemaVerify()
  await realDataVerify()
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('RESET ROLE') } catch { /* ignore */ }
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(74)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — production UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: both files apply to production, all 8 indexes present, the view is')
  console.log('security_invoker (RLS-safe) + SELECT-only for authenticated + no anon grant, and on real')
  console.log('data gross-to-collect >= net outstanding per (org,currency). Nothing persisted.')
}
console.log('\nRun command (PowerShell):')
console.log("  $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'")
console.log('  node scratchpad/dryrun-scale-fixes-PROD.mjs')
process.exit(failed.length || runError ? 1 : 0)
