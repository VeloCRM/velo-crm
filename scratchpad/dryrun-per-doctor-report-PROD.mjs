#!/usr/bin/env node
/**
 * dryrun-per-doctor-report-PROD.mjs — PRODUCTION dry-run of the per_doctor_production
 * RPC (scripts/per-doctor-production-report.sql). Installs the function DDL inside
 * BEGIN … [VERIFY] … ROLLBACK over a raw `pg` connection — NOTHING PERSISTS. The
 * "does it apply cleanly to prod + do the numbers reconcile on REAL data + is it
 * RLS-safe" rehearsal before the real human-runs-it apply.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *
 * ⚠️ CRITICAL DIFFERENCE vs the finance PROD dry-run: the per-doctor SQL file has
 *    its OWN `BEGIN; … COMMIT;` (for the human-run apply). We must NOT run that
 *    verbatim inside our controlling txn — the file's COMMIT would COMMIT TO PROD.
 *    So we STRIP the standalone BEGIN;/COMMIT; and run the DDL uncommitted inside
 *    OUR BEGIN…ROLLBACK, then HARD-ABORT if any BEGIN;/COMMIT; survives the strip.
 *
 * VERIFY (in-transaction, before ROLLBACK):
 *   1. per_doctor_production function would exist.
 *   2. prosecdef = false (SECURITY INVOKER — the multi-tenant RLS safety switch).
 *   3. authenticated has EXECUTE; anon has NO grant.
 *   4. RECONCILIATION on REAL prod data: simulate a real member (SET ROLE
 *      authenticated + JWT-claim GUC) of an org that actually has active charges,
 *      and confirm Σ produced (all buckets, incl. NULL-doctor) == that org's
 *      finance_ledger_totals.billed, per currency. The honesty check on real rows.
 *   5. TENANT ISOLATION on REAL prod data (best-effort): if ≥2 orgs have active
 *      charges, confirm the simulated member's RPC returns ONLY their org.
 *   (4)/(5) SKIP if prod has no org with active charges yet — nothing to reconcile
 *   or leak; the guarantees were proven on staging with seeded multi-org data.
 *
 * We do NOT seed anything on prod (even rolled back). (4)/(5) only READ existing
 * rows and impersonate an existing user's RLS identity inside the aborted txn.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-per-doctor-report-PROD.mjs
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

// ── Load the RPC DDL and STRIP its own BEGIN;/COMMIT; (must run in OUR txn) ────
const sqlPath = path.join(__dirname, '..', 'scripts', 'per-doctor-production-report.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`RPC SQL not found at ${sqlPath}`)
  process.exit(1)
}
const rpcDdl = fs.readFileSync(sqlPath, 'utf8')
  .replace(/^\s*BEGIN;\s*$/m, '')
  .replace(/^\s*COMMIT;\s*$/m, '')
if (/^\s*BEGIN;\s*$/m.test(rpcDdl) || /^\s*COMMIT;\s*$/m.test(rpcDdl)) {
  console.error('ABORT: a standalone BEGIN;/COMMIT; survived the strip — refusing to run inside the dry-run txn (could COMMIT TO PROD).')
  process.exit(1)
}

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
  const r1 = await client.query(
    `SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='per_doctor_production'`,
  )
  check('1. per_doctor_production function would exist', r1.rows.length === 1)
  check('2. prosecdef = false (SECURITY INVOKER — RLS safety)',
    r1.rows.length === 1 && r1.rows[0].prosecdef === false, `prosecdef=${r1.rows[0]?.prosecdef}`)

  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_routine_grants
      WHERE routine_schema='public' AND routine_name='per_doctor_production'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`,
  )
  const authHasExec = r2.rows.some(r => r.grantee === 'authenticated' && r.privilege_type === 'EXECUTE')
  const anonAny = r2.rows.some(r => r.grantee === 'anon')
  check('3a. authenticated has EXECUTE', authHasExec,
    r2.rows.filter(r => r.grantee === 'authenticated').map(r => r.privilege_type).join(', ') || '(none)')
  check('3b. anon has NO grant on the function', !anonAny,
    r2.rows.filter(r => r.grantee === 'anon').map(r => r.privilege_type).join(', ') || '(none)')
}

// Reconciliation + tenant isolation on REAL prod rows, via an existing member's RLS.
async function realDataVerify() {
  // Baseline as postgres (RLS bypassed): which orgs have ACTIVE charges? (billed side)
  const orgsWithCharges = (await client.query(
    `SELECT DISTINCT c.org_id::text AS org_id
       FROM public.charges c
      WHERE c.kind='charge'
        AND NOT EXISTS (SELECT 1 FROM public.charges r WHERE r.reverses_id = c.id)`,
  )).rows.map(r => r.org_id)
  const nCharged = orgsWithCharges.length

  if (nCharged < 1) {
    skip('4. reconciliation (real prod data)', 'no org has active charges yet — nothing to reconcile; proven on staging')
    skip('5. tenant isolation (real prod data)', 'no org has active charges yet — nothing to leak; proven on staging')
    return
  }

  // Pick an OWNER in an org that HAS active charges. This MUST be an owner: after the
  // visibility change a DOCTOR sees only their own rows, so Σ produced would be a
  // subset of billed and reconciliation would (correctly) not hold for them. Owners
  // (and operators) are the only callers whose Σ produced == billed.
  const prof = (await client.query(
    `SELECT p.id::text AS id, p.org_id::text AS org_id
       FROM public.profiles p
      WHERE p.org_id = ANY($1::uuid[]) AND p.role = 'owner'
      LIMIT 1`,
    [orgsWithCharges],
  )).rows[0]
  if (!prof) {
    skip('4. reconciliation (real prod data)', 'no OWNER profile in an org with active charges — reconciliation is owner-only')
    skip('5. tenant isolation (real prod data)', 'no OWNER profile in an org with active charges')
    return
  }

  // Simulate that member: JWT-claim GUCs (txn-local) so auth.uid() → them, then
  // SET ROLE authenticated so RLS actually applies to the RPC + view scans.
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: prof.id, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prof.id])
  await client.query('SET ROLE authenticated')
  try {
    const uid = (await client.query(`SELECT auth.uid()::text AS uid`)).rows[0].uid
    const oid = (await client.query(`SELECT public.current_org_id()::text AS oid`)).rows[0].oid
    check('4a. RLS sim: auth.uid()/current_org_id() resolve to the chosen member/org',
      uid === prof.id && oid === prof.org_id, `uid=${uid} org=${oid}`)

    // 4b. RECONCILIATION — Σ produced (all buckets) == billed, per currency (this org).
    const pd = (await client.query(
      'SELECT currency::text AS currency, SUM(produced)::bigint AS s '
      + 'FROM public.per_doctor_production(NULL, NULL) GROUP BY currency',
    )).rows
    const billed = (await client.query(
      'SELECT currency::text AS currency, billed::bigint AS billed FROM public.finance_ledger_totals',
    )).rows
    const pdMap = Object.fromEntries(pd.map(r => [r.currency, Number(r.s)]))
    const bMap = Object.fromEntries(billed.map(r => [r.currency, Number(r.billed)]))
    const curs = new Set([...Object.keys(pdMap), ...Object.keys(bMap)])
    let reconOk = curs.size > 0
    for (const c of curs) if ((pdMap[c] || 0) !== (bMap[c] || 0)) reconOk = false
    check('4b. RECONCILIATION: Σ produced == finance_ledger_totals.billed per currency (real prod org)',
      reconOk, `produced=${JSON.stringify(pdMap)} billed=${JSON.stringify(bMap)}`)

    // 5. TENANT ISOLATION — the RPC returns only this member's org.
    const seenOrgs = (await client.query(
      `SELECT DISTINCT org_id::text AS org_id FROM public.per_doctor_production(NULL, NULL)`,
    )).rows.map(r => r.org_id)
    const onlyOwn = seenOrgs.every(o => o === prof.org_id)
    if (nCharged < 2) {
      // Still assert no foreign org appears, but note the baseline was single-org.
      check(`5. TENANT ISOLATION: member sees ONLY their org (baseline had ${nCharged} charged org)`,
        onlyOwn, `member org=${prof.org_id} rpc orgs=[${seenOrgs.join(', ')}]`)
    } else {
      check(`5. TENANT ISOLATION: member sees ONLY their org (baseline had ${nCharged} charged orgs — real leak test)`,
        onlyOwn && seenOrgs.length <= 1, `member org=${prof.org_id} rpc orgs=[${seenOrgs.join(', ')}]`)
    }
  } finally {
    await client.query('RESET ROLE').catch(() => {})
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — per_doctor_production function (${u.hostname})\n${'='.repeat(72)}`)
  await client.query('BEGIN')

  await client.query(rpcDdl) // CREATE OR REPLACE FUNCTION + REVOKE/GRANT (uncommitted)
  console.log('✓ RPC DDL applied (uncommitted, BEGIN/COMMIT stripped)\n')

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

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(72)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — production UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the function applies to production, is security_invoker (RLS-safe),')
  console.log('grants EXECUTE-only to authenticated, reconciles Σ produced == billed on real data,')
  console.log('and a member sees only their org. Nothing persisted — the real apply is a separate step.')
}
process.exit(failed.length || runError ? 1 : 0)
