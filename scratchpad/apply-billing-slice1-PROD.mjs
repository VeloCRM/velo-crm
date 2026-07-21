#!/usr/bin/env node
/**
 * apply-billing-slice1-PROD.mjs — REAL PRODUCTION APPLY of the Slice 1 billing
 * migration. Runs scripts/billing-charges-payments-migration.sql VERBATIM — the
 * file's own BEGIN … COMMIT means this COMMITS the schema change to production —
 * then runs the SELECT-only VERIFY against the committed state.
 *
 * ⚠️⚠️ THIS PERSISTS TO PRODUCTION. Not a dry-run. Run the dry-run
 *      (scratchpad/dryrun-billing-slice1-PROD.mjs) FIRST and confirm it is clean.
 *
 * Guards (same inverted logic as the prod dry-run):
 *   - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *   - REQUIRES the `--confirm` flag, so a bare run cannot mutate prod by accident.
 *
 * Atomicity: the migration is a single BEGIN…COMMIT. If any statement errors, the
 * transaction aborts and NOTHING commits (we ROLLBACK the aborted state, report,
 * and skip VERIFY). The migration is idempotent (IF NOT EXISTS / guarded DO
 * blocks / DROP POLICY IF EXISTS), so a re-run after a partial success is safe.
 *
 * VERIFY (post-commit, read-only) — the same 5 checks as the dry-run:
 *   1. charges exists · 2. payments has kind/reverses_id/charge_id ·
 *   3. 7 new constraints · 4. append-only lock (authenticated SELECT+INSERT only)
 *   · 5. no UPDATE/DELETE RLS policy.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/apply-billing-slice1-PROD.mjs --confirm
 *
 * Exit 0 iff the migration committed AND every VERIFY assertion passed.
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
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the Slice 1 migration to PRODUCTION.')
  console.error('Re-run with the explicit flag once the dry-run is clean:')
  console.error('  node scratchpad/apply-billing-slice1-PROD.mjs --confirm')
  process.exit(1)
}

// ── Connection: discrete fields from PROD_DB_URL, SSL forced ──────────────────
const DB_URL = process.env.PROD_DB_URL
if (!DB_URL) {
  console.error('Set PROD_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres')
  process.exit(1)
}
// INVERTED guard: require PROD, reject STAGING.
if (!DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL does not contain the production ref (${PROD_REF}).`)
  process.exit(1)
}
if (DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL contains the staging ref (${STAGING_REF}).`)
  process.exit(1)
}

// ── Load migration VERBATIM (keep its own BEGIN…COMMIT) ───────────────────────
const migPath = path.join(__dirname, '..', 'scripts', 'billing-charges-payments-migration.sql')
if (!fs.existsSync(migPath)) {
  console.error(`Migration not found at ${migPath}`)
  process.exit(1)
}
const migSql = fs.readFileSync(migPath, 'utf8')

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
  const r1 = await client.query(`SELECT to_regclass('public.charges') AS reg`)
  check('1. charges table exists', r1.rows[0].reg !== null, String(r1.rows[0].reg))

  const r2 = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments'
        AND column_name IN ('kind','reverses_id','charge_id') ORDER BY column_name`,
  )
  const cols = r2.rows.map((r) => r.column_name)
  check('2. payments has kind/reverses_id/charge_id',
    ['charge_id', 'kind', 'reverses_id'].every((c) => cols.includes(c)), `[${cols.join(', ')}]`)

  const wanted = ['payments_kind_check', 'payments_reverses_shape', 'payments_reverses_fkey',
    'payments_charge_fkey', 'charges_kind_check', 'charges_amount_check', 'charges_reverses_shape']
  const r3 = await client.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1)`, [wanted])
  const got = r3.rows.map((r) => r.conname)
  const missing = wanted.filter((c) => !got.includes(c))
  check('3. all 7 new constraints exist', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${got.length}/7`)

  const r4 = await client.query(
    `SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='authenticated' AND table_schema='public'
        AND table_name IN ('payments','charges')
      ORDER BY table_name, privilege_type`,
  )
  const grants = {}
  for (const row of r4.rows) (grants[row.table_name] ||= []).push(row.privilege_type)
  const lockOk = (t) => {
    const g = grants[t] || []
    return g.includes('SELECT') && g.includes('INSERT') && !g.includes('UPDATE') && !g.includes('DELETE')
  }
  check('4a. append-only: authenticated payments = SELECT+INSERT, NO UPDATE/DELETE',
    lockOk('payments'), `[${(grants.payments || []).join(', ')}]`)
  check('4b. append-only: authenticated charges = SELECT+INSERT, NO UPDATE/DELETE',
    lockOk('charges'), `[${(grants.charges || []).join(', ')}]`)

  const r5 = await client.query(
    `SELECT tablename, cmd, count(*)::int AS n FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('payments','charges')
      GROUP BY tablename, cmd ORDER BY tablename, cmd`,
  )
  const badPolicies = r5.rows.filter((r) => r.cmd === 'UPDATE' || r.cmd === 'DELETE')
  check('5. no UPDATE/DELETE RLS policy on payments/charges', badPolicies.length === 0,
    r5.rows.map((r) => `${r.tablename}:${r.cmd}×${r.n}`).join('  '))
}

// ── Run ───────────────────────────────────────────────────────────────────────
let applied = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  PRODUCTION APPLY — Slice 1 billing migration (${u.hostname})\n${'='.repeat(66)}`)
  console.log('running migration VERBATIM (its own BEGIN…COMMIT → real commit)…\n')

  await client.query(migSql) // BEGIN…COMMIT inside the file → persists on success
  applied = true
  console.log('✓ migration COMMITTED to production.\n')

  await verify()
} catch (e) {
  runError = e
  // A mid-migration failure leaves the file's transaction aborted (never COMMITted).
  // Clear the aborted state; nothing persisted.
  await client.query('ROLLBACK').catch(() => {})
  check('migration committed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(66)}`)
if (applied) {
  console.log(`APPLIED to production. ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else {
  console.log('NOT APPLIED — the migration errored before COMMIT; production is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
