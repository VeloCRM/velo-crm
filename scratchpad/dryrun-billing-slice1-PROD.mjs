#!/usr/bin/env node
/**
 * dryrun-billing-slice1-PROD.mjs — PRODUCTION dry-run of the Slice 1 billing
 * migration (scripts/billing-charges-payments-migration.sql). Applies the full
 * migration body inside BEGIN … [schema VERIFY] … ROLLBACK over a raw `pg`
 * connection, then rolls back — NOTHING PERSISTS. This is the "does it apply
 * cleanly to prod" rehearsal before the real human-runs-it apply.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu) — reject staging.
 *
 * ⚠️ The migration file ships with its OWN `BEGIN;` … `COMMIT;`. Left intact, that
 * COMMIT would PERSIST the DDL to production. This runner strips the file's
 * transaction-control statements so the body runs inside OUR controlling
 * transaction, and HARD-ABORTS if a standalone BEGIN;/COMMIT; survives the strip.
 * Grants, ALTERs, CREATE POLICY, and CREATE TABLE are all transactional in
 * Postgres, so ROLLBACK fully undoes them.
 *
 * VERIFY (run in-transaction, before ROLLBACK) — reports what the real apply
 * WOULD produce:
 *   1. charges table would exist.
 *   2. payments would gain kind / reverses_id / charge_id.
 *   3. the 7 new constraints would exist.
 *   4. append-only lock: authenticated would have SELECT+INSERT only (NO
 *      UPDATE/DELETE) on payments AND charges.
 *   5. no UPDATE/DELETE RLS policy on either table.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-billing-slice1-PROD.mjs
 *
 * Exit 0 iff the migration applied cleanly AND every VERIFY assertion passed.
 * The transaction is always rolled back.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'

// ── Connection: discrete fields from PROD_DB_URL, SSL forced ──────────────────
const DB_URL = process.env.PROD_DB_URL
if (!DB_URL) {
  console.error('Set PROD_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres')
  process.exit(1)
}
// INVERTED guard: require PROD, reject STAGING.
if (!DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL does not contain the production ref (${PROD_REF}).`)
  console.error('This runner is the PRODUCTION dry-run — point it at production only.')
  process.exit(1)
}
if (DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: PROD_DB_URL contains the staging ref (${STAGING_REF}).`)
  console.error('This is the PROD dry-run; use the staging runners for staging.')
  process.exit(1)
}

// ── Load migration + neutralize its transaction control ───────────────────────
const migPath = path.join(__dirname, '..', 'scripts', 'billing-charges-payments-migration.sql')
if (!fs.existsSync(migPath)) {
  console.error(`Migration not found at ${migPath}`)
  process.exit(1)
}
const original = fs.readFileSync(migPath, 'utf8')
const migSql = original
  .replace(/^BEGIN;[ \t]*$/m, '-- [transaction BEGIN stripped: controlled by dry-run]')
  .replace(/^COMMIT;[ \t]*$/m, '-- [transaction COMMIT stripped: dry-run rolls back]')

// HARD SAFETY NET — refuse to touch prod if strip didn't take. A surviving
// COMMIT; would persist the DDL; a surviving BEGIN; would break our transaction.
if (migSql === original) {
  console.error('ABORT: migration BEGIN;/COMMIT; markers not found (file changed?) — refusing to run.')
  process.exit(1)
}
if (/^BEGIN;[ \t]*$/m.test(migSql) || /^COMMIT;[ \t]*$/m.test(migSql)) {
  console.error('ABORT: a standalone BEGIN;/COMMIT; survived stripping — refusing to run to avoid persisting to PRODUCTION.')
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

async function verify() {
  // 1. charges exists
  const r1 = await client.query(`SELECT to_regclass('public.charges') AS reg`)
  check('1. charges table would exist', r1.rows[0].reg !== null, String(r1.rows[0].reg))

  // 2. payments new ledger columns
  const r2 = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments'
        AND column_name IN ('kind','reverses_id','charge_id') ORDER BY column_name`,
  )
  const cols = r2.rows.map((r) => r.column_name)
  check('2. payments would gain kind/reverses_id/charge_id',
    ['charge_id', 'kind', 'reverses_id'].every((c) => cols.includes(c)), `[${cols.join(', ')}]`)

  // 3. new constraints
  const wanted = ['payments_kind_check', 'payments_reverses_shape', 'payments_reverses_fkey',
    'payments_charge_fkey', 'charges_kind_check', 'charges_amount_check', 'charges_reverses_shape']
  const r3 = await client.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1)`, [wanted])
  const got = r3.rows.map((r) => r.conname)
  const missing = wanted.filter((c) => !got.includes(c))
  check('3. all 7 new constraints would exist', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${got.length}/7`)

  // 4. append-only lock — authenticated grants
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

  // 5. policy inventory — no UPDATE/DELETE policy on either table
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
let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — Slice 1 billing migration (${u.hostname})\n${'='.repeat(66)}`)
  console.log('migration BEGIN;/COMMIT; stripped; running body inside a dry-run transaction.\n')

  await client.query('BEGIN')
  await client.query(migSql) // apply the whole migration body (multi-statement DDL)
  console.log('✓ migration body applied without error (uncommitted)\n')

  await verify()
} catch (e) {
  runError = e
  check('migration applied + verified without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(66)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — production UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the migration applies to production without error and produces')
  console.log('the expected schema + append-only lock. Nothing was persisted — the real apply')
  console.log('is a separate human step (run the committed migration file, which COMMITs).')
}
process.exit(failed.length || runError ? 1 : 0)
