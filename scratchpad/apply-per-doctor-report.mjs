#!/usr/bin/env node
/**
 * apply-per-doctor-report.mjs — REAL STAGING APPLY of the per_doctor_production
 * RPC (scripts/per-doctor-production-report.sql). Runs the file VERBATIM. Unlike
 * the finance view file, this file has its OWN `BEGIN; … COMMIT;` wrapping the
 * CREATE OR REPLACE FUNCTION + REVOKE/GRANT batch, so it is one explicit
 * transaction that COMMITS at its COMMIT — then the SELECT-only VERIFY reads the
 * committed state.
 *
 * ⚠️ THIS PERSISTS TO STAGING. Not a dry-run. Run the dry-run
 *    (scratchpad/dryrun-per-doctor-report.mjs) FIRST and confirm 7/7.
 *
 * Guards:
 *   - ABORT unless STAGING_DB_URL contains the staging ref (dujnbboyeugrisgewnqu).
 *   - ABORT if it contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - REQUIRES the `--confirm` flag, so a bare run cannot mutate staging by accident.
 *
 * Atomicity: the file's explicit BEGIN…COMMIT is one transaction — if any statement
 * errors before COMMIT, nothing commits (we ROLLBACK the aborted state, report, skip
 * VERIFY). Idempotent: CREATE OR REPLACE + REVOKE/GRANT are safe to re-run.
 *
 * VERIFY (post-commit, read-only):
 *   1. per_doctor_production function exists.
 *   2. prosecdef = false (SECURITY INVOKER — the multi-tenant RLS safety switch).
 *   3. authenticated has EXECUTE.
 *   4. anon has NO grant on the function.
 * (No functional/RLS seeding here — a real commit does not create test rows; the
 * reconciliation + tenant-isolation behaviour were proven by the dry-run.)
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/apply-per-doctor-report.mjs --confirm
 *
 * Exit 0 iff the function committed AND every VERIFY assertion passed.
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
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the per_doctor_production function to STAGING.')
  console.error('Re-run with the explicit flag once the dry-run is clean:')
  console.error('  node scratchpad/apply-per-doctor-report.mjs --confirm')
  process.exit(1)
}

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

// ── Load the RPC DDL VERBATIM (its own BEGIN…COMMIT commits it) ────────────────
const sqlPath = path.join(__dirname, '..', 'scripts', 'per-doctor-production-report.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`RPC SQL not found at ${sqlPath}`)
  process.exit(1)
}
const rpcSql = fs.readFileSync(sqlPath, 'utf8')

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
  // 1 + 2. function exists + SECURITY INVOKER (prosecdef=false)
  const r1 = await client.query(
    `SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='per_doctor_production'`,
  )
  check('1. per_doctor_production function exists', r1.rows.length === 1)
  check('2. prosecdef = false (SECURITY INVOKER — RLS safety)',
    r1.rows.length === 1 && r1.rows[0].prosecdef === false, `prosecdef=${r1.rows[0]?.prosecdef}`)

  // 3 + 4. grants: authenticated has EXECUTE; anon none
  const r2 = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_routine_grants
      WHERE routine_schema='public' AND routine_name='per_doctor_production'
        AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type`,
  )
  const authHasExec = r2.rows.some(r => r.grantee === 'authenticated' && r.privilege_type === 'EXECUTE')
  const anonAny = r2.rows.some(r => r.grantee === 'anon')
  check('3. authenticated has EXECUTE', authHasExec,
    r2.rows.filter(r => r.grantee === 'authenticated').map(r => r.privilege_type).join(', ') || '(none)')
  check('4. anon has NO grant on the function', !anonAny,
    r2.rows.filter(r => r.grantee === 'anon').map(r => r.privilege_type).join(', ') || '(none)')
}

// ── Run ───────────────────────────────────────────────────────────────────────
let applied = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  STAGING APPLY — per_doctor_production function (${u.hostname})\n${'='.repeat(70)}`)
  console.log('running RPC SQL VERBATIM (its own BEGIN…COMMIT → real commit)…\n')

  await client.query(rpcSql) // CREATE OR REPLACE FUNCTION + REVOKE/GRANT, wrapped in BEGIN…COMMIT
  applied = true
  console.log('✓ function COMMITTED to staging.\n')

  await verify()
} catch (e) {
  runError = e
  // A mid-batch failure aborts the transaction before COMMIT (never committed).
  await client.query('ROLLBACK').catch(() => {})
  check('function committed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(70)}`)
if (applied) {
  console.log(`APPLIED to staging. ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else {
  console.log('NOT APPLIED — the RPC SQL errored before COMMIT; staging is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
