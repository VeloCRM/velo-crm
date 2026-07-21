#!/usr/bin/env node
/**
 * dryrun-finance-totals-PROD.mjs — PRODUCTION dry-run of the finance_ledger_totals
 * view (scripts/finance-ledger-totals.sql). Runs the view DDL inside BEGIN …
 * [VERIFY] … ROLLBACK over a raw `pg` connection — NOTHING PERSISTS. The "does it
 * apply cleanly to prod + is it RLS-safe on real data" rehearsal before the real
 * human-runs-it apply.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *
 * The view file is CREATE OR REPLACE VIEW + REVOKE/GRANT with NO own BEGIN/COMMIT,
 * so it runs verbatim inside OUR controlling transaction. We HARD-ABORT if a stray
 * BEGIN;/COMMIT; is ever added (it would break our txn or persist to prod).
 *
 * VERIFY (in-transaction, before ROLLBACK):
 *   1. finance_ledger_totals view would exist.
 *   2. reloptions contains security_invoker=on (the multi-tenant RLS safety switch).
 *   3. authenticated has SELECT and ONLY SELECT (no INSERT/UPDATE/DELETE).
 *   4. anon has NO grant.
 *   5. TENANT ISOLATION on REAL prod data (best-effort, read-only): simulate a real
 *      member (SET ROLE authenticated + JWT-claim GUC) of an org that actually has
 *      ledger rows, and confirm the view returns ONLY that org — no other org's rows.
 *      If <2 orgs have ledger data yet, this is SKIPPED (nothing to leak); the
 *      security_invoker guarantee is a property of the view DDL and was proven on
 *      staging with seeded multi-org data.
 *
 * We do NOT seed anything on prod (even rolled back). The isolation check only READS
 * existing rows and impersonates an existing user's RLS identity inside the aborted
 * transaction.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-finance-totals-PROD.mjs
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

// ── Load the view DDL (runs verbatim — no own transaction) ────────────────────
const sqlPath = path.join(__dirname, '..', 'scripts', 'finance-ledger-totals.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`View SQL not found at ${sqlPath}`)
  process.exit(1)
}
const viewSql = fs.readFileSync(sqlPath, 'utf8')
if (/^\s*BEGIN;\s*$/m.test(viewSql) || /^\s*COMMIT;\s*$/m.test(viewSql)) {
  console.error('ABORT: finance-ledger-totals.sql contains a standalone BEGIN;/COMMIT; — refusing to run inside the dry-run txn (could persist to PROD).')
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
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='finance_ledger_totals' AND c.relkind='v'`,
  )
  const opts = r1.rows[0]?.reloptions || null
  check('1. finance_ledger_totals view would exist', r1.rows.length === 1)
  check('2. reloptions contains security_invoker=on (RLS safety)',
    Array.isArray(opts) && opts.includes('security_invoker=on'), `reloptions=${opts ? '{' + opts.join(',') + '}' : 'NULL'}`)

  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='finance_ledger_totals'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`,
  )
  const authPrivs = r2.rows.filter(r => r.grantee === 'authenticated').map(r => r.privilege_type).sort()
  const anonAny = r2.rows.some(r => r.grantee === 'anon')
  check('3. authenticated has SELECT ONLY (no INSERT/UPDATE/DELETE)',
    authPrivs.length === 1 && authPrivs[0] === 'SELECT', `authenticated=[${authPrivs.join(', ')}]`)
  check('4. anon has NO grant on the view', !anonAny,
    r2.rows.map(r => `${r.grantee}:${r.privilege_type}`).join(', ') || '(none)')
}

async function isolationVerify() {
  // Baseline as postgres (RLS bypassed): how many orgs have ledger rows?
  const orgs = (await client.query(
    `SELECT DISTINCT org_id::text AS org_id FROM public.finance_ledger_totals`,
  )).rows.map(r => r.org_id)
  const baseline = orgs.length

  if (baseline < 2) {
    skip('5. tenant isolation (real prod data)',
      `only ${baseline} org(s) have ledger rows — nothing to leak yet; security_invoker proven on staging`)
    return
  }

  // Pick a real clinic member in an org that has ledger rows (operators have no
  // profiles row, so any profile here is a clinic member → RLS scopes to their org).
  const prof = (await client.query(
    `SELECT p.id::text AS id, p.org_id::text AS org_id
       FROM public.profiles p
      WHERE p.org_id IN (SELECT DISTINCT org_id FROM public.finance_ledger_totals)
      LIMIT 1`,
  )).rows[0]
  if (!prof) {
    skip('5. tenant isolation (real prod data)', 'no profile found in an org with ledger rows')
    return
  }

  // Simulate that member: JWT-claim GUC (txn-local) so auth.uid() → them, then
  // SET ROLE authenticated so RLS actually applies.
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: prof.id, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prof.id])
  await client.query('SET ROLE authenticated')
  try {
    const uid = (await client.query(`SELECT auth.uid()::text AS uid`)).rows[0].uid
    const oid = (await client.query(`SELECT public.current_org_id()::text AS oid`)).rows[0].oid
    check('5a. RLS sim: auth.uid()/current_org_id() resolve to the seeded member/org',
      uid === prof.id && oid === prof.org_id, `uid=${uid} org=${oid}`)

    const seenOrgs = (await client.query(
      `SELECT DISTINCT org_id::text AS org_id FROM public.finance_ledger_totals`,
    )).rows.map(r => r.org_id)
    const onlyOwn = seenOrgs.length === 1 && seenOrgs[0] === prof.org_id
    check(`5b. TENANT ISOLATION: member sees ONLY their org (baseline had ${baseline} orgs)`,
      onlyOwn, `member org=${prof.org_id} view orgs=[${seenOrgs.join(', ')}]`)
  } finally {
    await client.query('RESET ROLE').catch(() => {})
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — finance_ledger_totals view (${u.hostname})\n${'='.repeat(72)}`)
  await client.query('BEGIN')

  await client.query(viewSql) // CREATE OR REPLACE VIEW + REVOKE/GRANT (uncommitted)
  console.log('✓ view DDL applied (uncommitted)\n')

  await schemaVerify()
  await isolationVerify()
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
  console.log('\nDRY-RUN CLEAN: the view applies to production, is security_invoker (RLS-safe),')
  console.log('grants SELECT-only to authenticated, and (where prod has ≥2 orgs with ledger data)')
  console.log('a member sees only their org. Nothing persisted — the real apply is a separate step.')
}
process.exit(failed.length || runError ? 1 : 0)
