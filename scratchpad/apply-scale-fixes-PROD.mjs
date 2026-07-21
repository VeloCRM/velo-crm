#!/usr/bin/env node
/**
 * apply-scale-fixes-PROD.mjs — REAL PRODUCTION APPLY of the scale fixes. Runs two
 * files VERBATIM, in order: scripts/scale-indexes-migration.sql FIRST (the 8 indexes),
 * then scripts/patient-outstanding-balances-view.sql (the security_invoker view +
 * REVOKE/GRANT). Indexes before view, so the view's active-row anti-join is
 * index-backed. Neither file has its own BEGIN/COMMIT, so each runs in node-pg's
 * implicit transaction and COMMITS on success; the SELECT-only VERIFY then reads
 * committed state.
 *
 * ⚠️⚠️ THIS PERSISTS TO PRODUCTION. Not a dry-run. Run the PROD dry-run
 *      (scratchpad/dryrun-scale-fixes-PROD.mjs) FIRST and confirm it is clean.
 *
 * Guards (INVERTED — require PROD, reject STAGING):
 *   - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *   - REQUIRES the `--confirm` flag, so a bare run cannot mutate prod by accident.
 *
 * Atomicity: each file's multi-statement DDL runs in one implicit transaction — if a
 * statement errors, that file does not commit (we ROLLBACK the aborted state). The two
 * files commit independently (indexes, then view); a view failure leaves the committed
 * indexes in place (both are idempotent — CREATE INDEX IF NOT EXISTS / CREATE OR
 * REPLACE VIEW / REVOKE+GRANT — so a re-run is safe).
 *
 * VERIFY (post-commit, read-only — 13 checks):
 *   1. each of the 8 scale indexes exists (8) + all-8-present (1).
 *   2. patient_outstanding_balances view exists (1) + reloptions security_invoker on (1).
 *   3. authenticated has SELECT and ONLY SELECT (1).
 *   4. anon has NO grant on the view (1).
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/apply-scale-fixes-PROD.mjs --confirm
 *
 * Exit 0 iff both files committed AND every VERIFY assertion passed.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'

// ── Confirmation gate ─────────────────────────────────────────────────────────
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the scale indexes + view to PRODUCTION.')
  console.error('Re-run with the explicit flag once the PROD dry-run is clean:')
  console.error('  node scratchpad/apply-scale-fixes-PROD.mjs --confirm')
  process.exit(1)
}

// ── Connection guard (INVERTED: require PROD, reject STAGING) ──────────────────
const DB_URL = process.env.PROD_DB_URL
if (!DB_URL) {
  console.error('Set PROD_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres')
  process.exit(1)
}
if (!DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL does not contain the production ref (${PROD_REF}).`)
  process.exit(1)
}
if (DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL contains the staging ref (${STAGING_REF}).`)
  process.exit(1)
}

// ── Load both files VERBATIM, in apply order ──────────────────────────────────
function loadSql(name) {
  const p = path.join(__dirname, '..', 'scripts', name)
  if (!fs.existsSync(p)) { console.error(`SQL not found at ${p}`); process.exit(1) }
  return fs.readFileSync(p, 'utf8')
}
const indexSql = loadSql('scale-indexes-migration.sql')          // 1st — indexes
const viewSql = loadSql('patient-outstanding-balances-view.sql') // 2nd — view

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

// ── Assertion harness ─────────────────────────────────────────────────────────
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}

async function verify() {
  // 1. all 8 indexes exist (8 individual + 1 total = 9)
  const ri = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)`, [EXPECTED_INDEXES])
  const present = new Set(ri.rows.map((r) => r.indexname))
  for (const name of EXPECTED_INDEXES) check(`1. index exists: ${name}`, present.has(name))
  check('1. all 8 scale indexes present', present.size === EXPECTED_INDEXES.length, `${present.size}/8`)

  // 2. view exists + security_invoker on (accept true|on — PG stores our `= true`)  (2)
  const r1 = await client.query(
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='patient_outstanding_balances' AND c.relkind='v'`)
  const opts = r1.rows[0]?.reloptions || null
  check('2. patient_outstanding_balances view exists', r1.rows.length === 1)
  check('2. reloptions contains security_invoker on (RLS safety)',
    Array.isArray(opts) && (opts.includes('security_invoker=on') || opts.includes('security_invoker=true')),
    `reloptions=${opts ? '{' + opts.join(',') + '}' : 'NULL'}`)

  // 3 + 4. grants: authenticated = SELECT only; anon none  (2)
  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='patient_outstanding_balances'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`)
  const authPrivs = r2.rows.filter((r) => r.grantee === 'authenticated').map((r) => r.privilege_type).sort()
  const anonAny = r2.rows.some((r) => r.grantee === 'anon')
  check('3. authenticated has SELECT ONLY (no INSERT/UPDATE/DELETE)',
    authPrivs.length === 1 && authPrivs[0] === 'SELECT', `authenticated=[${authPrivs.join(', ')}]`)
  check('4. anon has NO grant on the view', !anonAny,
    r2.rows.filter((r) => r.grantee === 'anon').map((r) => r.privilege_type).join(', ') || '(none)')
}

// ── Run ───────────────────────────────────────────────────────────────────────
let appliedIndexes = false
let appliedView = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  PRODUCTION APPLY — scale indexes + patient_outstanding_balances view (${u.hostname})\n${'='.repeat(74)}`)

  console.log('1/2 running scale-indexes-migration.sql VERBATIM (implicit transaction → real commit)…')
  await client.query(indexSql)
  appliedIndexes = true
  console.log('✓ indexes COMMITTED to production.\n')

  console.log('2/2 running patient-outstanding-balances-view.sql VERBATIM (implicit transaction → real commit)…')
  await client.query(viewSql)
  appliedView = true
  console.log('✓ view COMMITTED to production.\n')

  await verify()
} catch (e) {
  runError = e
  await client.query('ROLLBACK').catch(() => {})
  check('apply completed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(74)}`)
if (appliedIndexes && appliedView) {
  console.log(`APPLIED to production (indexes + view). ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else if (appliedIndexes) {
  console.log('PARTIAL — indexes committed, but the VIEW SQL errored before commit. Indexes are idempotent; fix the view SQL and re-run.')
} else {
  console.log('NOT APPLIED — the index SQL errored before commit; production is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
console.log('\nRun command (PowerShell):')
console.log("  $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'")
console.log('  node scratchpad/apply-scale-fixes-PROD.mjs --confirm')
process.exit(failed.length || runError ? 1 : 0)
