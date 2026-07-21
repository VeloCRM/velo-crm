#!/usr/bin/env node
/**
 * apply-finance-totals-PROD.mjs — REAL PRODUCTION APPLY of the finance_ledger_totals
 * view (scripts/finance-ledger-totals.sql). Runs the file VERBATIM. The file is a
 * CREATE OR REPLACE VIEW + REVOKE/GRANT batch with NO own BEGIN/COMMIT, so it runs
 * in node-pg's implicit transaction and COMMITS on success — then the SELECT-only
 * VERIFY reads the committed state.
 *
 * ⚠️⚠️ THIS PERSISTS TO PRODUCTION. Not a dry-run. Run the PROD dry-run
 *      (scratchpad/dryrun-finance-totals-PROD.mjs) FIRST and confirm it is clean.
 *
 * Guards (INVERTED — same as apply-charges-category-PROD.mjs):
 *   - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *   - REQUIRES the `--confirm` flag, so a bare run cannot mutate prod by accident.
 *
 * Atomicity: multi-statement DDL runs in one implicit transaction — if any
 * statement errors, nothing commits (we ROLLBACK the aborted state, report, skip
 * VERIFY). Idempotent: CREATE OR REPLACE + REVOKE/GRANT are safe to re-run.
 *
 * VERIFY (post-commit, read-only):
 *   1. finance_ledger_totals view exists.
 *   2. reloptions contains security_invoker=on (the multi-tenant RLS safety switch).
 *   3. authenticated has SELECT and ONLY SELECT (no INSERT/UPDATE/DELETE).
 *   4. anon has NO grant on the view.
 * (No seeding/RLS sim — a real commit does not create test rows; the active-row
 * totals + tenant isolation were proven by the staging + prod dry-runs.)
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/apply-finance-totals-PROD.mjs --confirm
 *
 * Exit 0 iff the view committed AND every VERIFY assertion passed.
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
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the finance_ledger_totals view to PRODUCTION.')
  console.error('Re-run with the explicit flag once the PROD dry-run is clean:')
  console.error('  node scratchpad/apply-finance-totals-PROD.mjs --confirm')
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

// ── Load the view DDL VERBATIM ────────────────────────────────────────────────
const sqlPath = path.join(__dirname, '..', 'scripts', 'finance-ledger-totals.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`View SQL not found at ${sqlPath}`)
  process.exit(1)
}
const viewSql = fs.readFileSync(sqlPath, 'utf8')

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

async function verify() {
  const r1 = await client.query(
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='finance_ledger_totals' AND c.relkind='v'`,
  )
  const opts = r1.rows[0]?.reloptions || null
  check('1. finance_ledger_totals view exists', r1.rows.length === 1)
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

// ── Run ───────────────────────────────────────────────────────────────────────
let applied = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  PRODUCTION APPLY — finance_ledger_totals view (${u.hostname})\n${'='.repeat(70)}`)
  console.log('running view SQL VERBATIM (implicit transaction → real commit)…\n')

  await client.query(viewSql) // CREATE OR REPLACE VIEW + REVOKE/GRANT → commits on success
  applied = true
  console.log('✓ view COMMITTED to production.\n')

  await verify()
} catch (e) {
  runError = e
  await client.query('ROLLBACK').catch(() => {})
  check('view committed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(70)}`)
if (applied) {
  console.log(`APPLIED to production. ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else {
  console.log('NOT APPLIED — the view SQL errored before commit; production is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
