#!/usr/bin/env node
/**
 * dryrun-finance-totals.mjs — STAGING dry-run of the finance_ledger_totals view
 * (scripts/finance-ledger-totals.sql). Creates the view + seeds a two-org ledger
 * inside BEGIN … [VERIFY] … ROLLBACK over a raw `pg` connection — NOTHING PERSISTS.
 *
 * Mirrors the category dry-run: discrete-field pg connection, require-staging /
 * reject-prod guard, self-seed, everything rolled back. The view file has NO own
 * BEGIN/COMMIT (it is CREATE OR REPLACE VIEW + GRANTs), so it runs verbatim inside
 * OUR controlling transaction — we HARD-ABORT if a stray COMMIT; is ever added.
 *
 * ⚠️ TARGETS STAGING. Guard:
 *     - ABORT unless STAGING_DB_URL contains the staging ref (dujnbboyeugrisgewnqu).
 *     - ABORT if it contains the production ref (aajwuwjxpmmqcwhiynla).
 *
 * The view is WITH (security_invoker = on), so its RLS behaviour depends on the
 * QUERYING role. We connect as the direct `postgres` superuser (bypasses RLS) for
 * schema checks + seeding + the arithmetic check, then SET ROLE authenticated and
 * set the Supabase JWT-claim GUC so auth.uid() → the seeded org-1 user and
 * current_org_id() → org 1. That is the only way to exercise the real multi-tenant
 * RLS path — the leak test (#4) is meaningless as a superuser.
 *
 * VERIFY (in-transaction, before ROLLBACK):
 *   1. view exists; reloptions contains security_invoker=on  (RLS-safety switch).
 *   2. grants: authenticated has SELECT; anon has NONE.
 *   3. functional (as postgres, filtered to org 1): per-currency billed/collected/
 *      outstanding correct; the reversed payment + voided charge are EXCLUDED
 *      (active-row rule); outstanding == Σ per-patient active-row math per currency;
 *      IQD and USD never blend.
 *   4. TENANT ISOLATION (as authenticated org-1 member): the view returns ONLY
 *      org 1's rows — org 2's distinctive figure never appears — while as postgres
 *      (RLS bypassed) org 2 IS present, proving RLS hid it, not that it was missing.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-finance-totals.mjs
 *
 * Exit 0 iff every assertion passes. The transaction is ALWAYS rolled back.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'

// ── Connection guard ──────────────────────────────────────────────────────────
const DB_URL = process.env.STAGING_DB_URL
if (!DB_URL) {
  console.error('Set STAGING_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres')
  process.exit(1)
}
if (!DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL does not contain the staging ref (${STAGING_REF}).`)
  process.exit(1)
}
if (DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL contains the production ref (${PROD_REF}).`)
  process.exit(1)
}

// ── Load the view DDL (runs verbatim — no own transaction) ────────────────────
const sqlPath = path.join(__dirname, '..', 'scripts', 'finance-ledger-totals.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`View SQL not found at ${sqlPath}`)
  process.exit(1)
}
const viewSql = fs.readFileSync(sqlPath, 'utf8')
// Defensive: this file must NOT carry its own transaction control (it would either
// break our controlling txn or, on COMMIT, persist). Abort if that ever changes.
if (/^\s*BEGIN;\s*$/m.test(viewSql) || /^\s*COMMIT;\s*$/m.test(viewSql)) {
  console.error('ABORT: finance-ledger-totals.sql contains a standalone BEGIN;/COMMIT; — refusing to run inside the dry-run txn.')
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

// ── Assertion harness ─────────────────────────────────────────────────────────
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}
function rowsToMap(rows) {
  const m = {}
  for (const r of rows) {
    m[r.currency] = {
      billed: Number(r.billed),
      collected: Number(r.collected),
      outstanding: Number(r.outstanding),
    }
  }
  return m
}
function eqTotals(actual, expected) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  for (const k of keys) {
    const a = actual[k] || {}, e = expected[k] || {}
    if (Number(a.billed || 0) !== Number(e.billed || 0)) return false
    if (Number(a.collected || 0) !== Number(e.collected || 0)) return false
    if (Number(a.outstanding || 0) !== Number(e.outstanding || 0)) return false
  }
  return true
}

// ── Seed helpers (as postgres → RLS bypassed; only FK targets must exist) ─────
async function seedOrg(tag) {
  const rand = Math.random().toString(36).slice(2, 10)
  const org = (await client.query(
    `INSERT INTO orgs (name, slug) VALUES ($1,$2) RETURNING id`,
    [`FIN ${tag} ${rand}`, `fin-${tag}-${rand}`],
  )).rows[0].id
  const user = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`fin-${tag}-${rand}@example.test`],
  )).rows[0].id
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name)
     VALUES ($1,$2,'doctor',$3) ON CONFLICT (id) DO NOTHING`,
    [user, org, `Fin ${tag} Doctor`],
  )
  const patient = (await client.query(
    `INSERT INTO patients (org_id, full_name, phone) VALUES ($1,$2,$3) RETURNING id`,
    [org, `FIN ${tag} PATIENT ${rand}`, '+9647000000002'],
  )).rows[0].id
  return { org, user, patient }
}
async function addCharge({ org, patient, user }, amount, currency) {
  return (await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, description, amount_minor, currency, created_by)
     VALUES ($1,$2,$3,'charge','seed charge',$4,$5,$3) RETURNING id`,
    [org, patient, user, amount, currency],
  )).rows[0].id
}
async function voidCharge({ org, patient, user }, chargeId, amount, currency) {
  await client.query(
    `INSERT INTO charges (org_id, patient_id, treatment_plan_item_id, doctor_id, kind, reverses_id, description, amount_minor, currency, created_by)
     VALUES ($1,$2,NULL,$3,'void',$4,'seed void',$5,$6,$3)`,
    [org, patient, user, chargeId, amount, currency],
  )
}
async function addPayment({ org, patient, user }, amount, currency) {
  return (await client.query(
    `INSERT INTO payments (org_id, patient_id, amount_minor, currency, method, recorded_by, kind)
     VALUES ($1,$2,$3,$4,'cash',$5,'payment') RETURNING id`,
    [org, patient, amount, currency, user],
  )).rows[0].id
}
async function reversePayment({ org, patient, user }, paymentId, amount, currency) {
  await client.query(
    `INSERT INTO payments (org_id, patient_id, kind, reverses_id, amount_minor, currency, method, recorded_by)
     VALUES ($1,$2,'reversal',$3,$4,$5,'cash',$6)`,
    [org, patient, paymentId, amount, currency, user],
  )
}

// ── Expected org-1 totals (from the seed below) ───────────────────────────────
// IQD: charge 100000 active; charge 30000 VOIDED → excluded. payment 40000 active;
//      payment 25000 REVERSED → excluded.  billed 100000, collected 40000, out 60000.
// USD: charge 50000 active; payment 20000 active.  billed 50000, collected 20000, out 30000.
const EXP_ORG1 = {
  IQD: { billed: 100000, collected: 40000, outstanding: 60000 },
  USD: { billed: 50000, collected: 20000, outstanding: 30000 },
}
const ORG2_DISTINCT = 999999 // a figure that can't collide with org-1's numbers

async function schemaVerify() {
  // 1. view exists + security_invoker=on
  const r1 = await client.query(
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='finance_ledger_totals' AND c.relkind='v'`,
  )
  const opts = r1.rows[0]?.reloptions || null
  check('1. finance_ledger_totals view exists', r1.rows.length === 1)
  check('1b. reloptions contains security_invoker=on (RLS safety)',
    Array.isArray(opts) && opts.includes('security_invoker=on'), `reloptions=${opts ? '{' + opts.join(',') + '}' : 'NULL'}`)

  // 2. grants: authenticated SELECT, anon none
  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='finance_ledger_totals'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`,
  )
  const authPrivs = r2.rows.filter(r => r.grantee === 'authenticated').map(r => r.privilege_type).sort()
  const anonAny = r2.rows.some(r => r.grantee === 'anon')
  check('2. authenticated has SELECT ONLY on the view (no INSERT/UPDATE/DELETE)',
    authPrivs.length === 1 && authPrivs[0] === 'SELECT', `authenticated=[${authPrivs.join(', ')}]`)
  check('2b. anon has NO grant on the view', !anonAny,
    r2.rows.map(r => `${r.grantee}:${r.privilege_type}`).join(', ') || '(none)')
}

async function functionalVerify(org1) {
  // As postgres, filter to org 1 → checks the aggregation math directly.
  const viewRows = (await client.query(
    `SELECT currency, billed, collected, outstanding FROM public.finance_ledger_totals
      WHERE org_id = $1 ORDER BY currency`, [org1],
  )).rows
  const got = rowsToMap(viewRows)
  check('3a. org-1 per-currency billed/collected/outstanding correct (voided charge + reversed payment EXCLUDED)',
    eqTotals(got, EXP_ORG1), JSON.stringify(got))
  check('3b. IQD and USD are separate rows (never blended)',
    'IQD' in got && 'USD' in got && Object.keys(got).length === 2, `currencies=[${Object.keys(got).join(', ')}]`)

  // outstanding == Σ per-patient active-row math (the proven reconciliation query), org 1.
  const recon = (await client.query(
    `WITH ac AS (
       SELECT currency, amount_minor FROM charges c
        WHERE c.org_id=$1 AND c.kind='charge'
          AND NOT EXISTS (SELECT 1 FROM charges r WHERE r.reverses_id=c.id)),
     ap AS (
       SELECT currency, amount_minor FROM payments p
        WHERE p.org_id=$1 AND p.kind='payment'
          AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id=p.id)),
     net AS (
       SELECT currency, SUM(amount_minor) amt FROM ac GROUP BY currency
       UNION ALL SELECT currency, -SUM(amount_minor) FROM ap GROUP BY currency)
     SELECT currency, SUM(amt)::bigint AS owed FROM net GROUP BY currency ORDER BY currency`,
    [org1],
  )).rows
  const reconMap = Object.fromEntries(recon.map(r => [r.currency, Number(r.owed)]))
  const outMap = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.outstanding]))
  const reconOk = ['IQD', 'USD'].every(c => Number(reconMap[c] || 0) === Number(outMap[c] || 0))
  check('3c. view outstanding == Σ per-patient balance math, per currency',
    reconOk, `view=${JSON.stringify(outMap)} recon=${JSON.stringify(reconMap)}`)
}

async function isolationVerify(org1, org2, user1) {
  // Baseline (postgres, RLS bypassed): org 2 IS present in the view — proving the
  // row exists, so a later absence under RLS is RLS hiding it (not missing data).
  const org2AsSuper = (await client.query(
    `SELECT count(*)::int AS n FROM public.finance_ledger_totals WHERE org_id = $1`, [org2],
  )).rows[0].n
  check('4a. baseline: org-2 rows exist in the view when RLS is bypassed (postgres)', org2AsSuper > 0, `org2 rows=${org2AsSuper}`)

  // Simulate an authenticated org-1 member: set the Supabase JWT claim GUC (txn-local)
  // so auth.uid() → user1, then SET ROLE authenticated so RLS actually applies.
  const claims = JSON.stringify({ sub: user1, role: 'authenticated' })
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user1]) // older auth.uid() variant
  await client.query('SET ROLE authenticated')
  try {
    // Sanity: the RLS identity resolves as intended.
    const uid = (await client.query(`SELECT auth.uid()::text AS uid`)).rows[0].uid
    check('4b. RLS sim: auth.uid() resolves to the seeded org-1 user', uid === user1, `auth.uid()=${uid}`)
    const oid = (await client.query(`SELECT public.current_org_id()::text AS oid`)).rows[0].oid
    check('4c. RLS sim: current_org_id() resolves to org 1', oid === org1, `current_org_id()=${oid}`)

    // The leak test: as org-1 member, the view must return ONLY org 1.
    const seen = (await client.query(
      `SELECT org_id::text AS org_id, currency, billed, collected, outstanding
         FROM public.finance_ledger_totals ORDER BY currency`,
    )).rows
    const allOrg1 = seen.length > 0 && seen.every(r => r.org_id === org1)
    const org2Leaked = seen.some(r => r.org_id === org2 || Number(r.billed) === ORG2_DISTINCT)
    check('4d. TENANT ISOLATION: org-1 member sees ONLY org-1 rows (org-2 absent)',
      allOrg1 && !org2Leaked, `rows=${seen.length} orgs=[${[...new Set(seen.map(r => r.org_id))].join(', ')}] org2Leaked=${org2Leaked}`)

    // And the org-1 numbers under RLS still match expected (not inflated by a leak).
    const gotRls = rowsToMap(seen)
    check('4e. org-1 totals under RLS match expected (no cross-org inflation)',
      eqTotals(gotRls, EXP_ORG1), JSON.stringify(gotRls))
  } finally {
    await client.query('RESET ROLE').catch(() => {})
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nSTAGING dry-run — finance_ledger_totals view (${u.hostname})\n${'='.repeat(72)}`)
  await client.query('BEGIN')

  await client.query(viewSql) // CREATE OR REPLACE VIEW + GRANTs, verbatim
  console.log('✓ view DDL applied (uncommitted)\n')

  await schemaVerify()

  // ── Seed org 1 (two currencies, one voided charge, one reversed payment) ──
  const org1 = await seedOrg('ORG1')
  const cIqd = await addCharge(org1, 100000, 'IQD')        // active
  const cVoid = await addCharge(org1, 30000, 'IQD')        // will be voided
  await voidCharge(org1, cVoid, 30000, 'IQD')
  await addCharge(org1, 50000, 'USD')                       // active
  await addPayment(org1, 40000, 'IQD')                     // active
  const pRev = await addPayment(org1, 25000, 'IQD')        // will be reversed
  await reversePayment(org1, pRev, 25000, 'IQD')
  await addPayment(org1, 20000, 'USD')                     // active
  void cIqd

  // ── Seed org 2 (isolation) with a distinctive figure ──
  const org2 = await seedOrg('ORG2')
  await addCharge(org2, ORG2_DISTINCT, 'IQD')
  console.log(`\nseeded (rolled back): org1=${org1.org} org2=${org2.org}\n`)

  await functionalVerify(org1.org)
  await isolationVerify(org1.org, org2.org, org1.user)
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('RESET ROLE') } catch { /* ignore */ }
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(72)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — staging UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the view is security_invoker (RLS-safe), grants are correct, the')
  console.log('active-row totals reconcile with per-patient balances, currencies never blend, and')
  console.log('an org-1 member cannot see org-2 totals. Nothing persisted — real apply is separate.')
}
process.exit(failed.length || runError ? 1 : 0)
