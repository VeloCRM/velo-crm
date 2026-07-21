#!/usr/bin/env node
/**
 * apply-charges-category.mjs — REAL STAGING APPLY of the Slice 4b category
 * migration. Runs scripts/billing-charges-category-migration.sql VERBATIM — the
 * file's own BEGIN … COMMIT means this COMMITS the schema change to STAGING —
 * then runs the SELECT-only VERIFY against the committed state.
 *
 * ⚠️ THIS PERSISTS TO STAGING. Not a dry-run. Run the dry-run
 *    (scratchpad/dryrun-charges-category.mjs) FIRST and confirm it is clean.
 *
 * Guards:
 *   - ABORT unless STAGING_DB_URL contains the staging ref (dujnbboyeugrisgewnqu).
 *   - ABORT if it contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - REQUIRES the `--confirm` flag, so a bare run cannot mutate staging by accident.
 *
 * Atomicity: the migration is a single BEGIN…COMMIT. If any statement errors, the
 * transaction aborts and NOTHING commits (we ROLLBACK the aborted state, report,
 * and skip VERIFY). The migration is idempotent (ADD COLUMN IF NOT EXISTS / a
 * guarded DO block for the CHECK / DROP NOT NULL is a no-op when already nullable),
 * so a re-run after a partial success is safe.
 *
 * VERIFY (post-commit, read-only) — same 5 schema checks as the dry-run:
 *   1. charges.category exists, NOT NULL, DEFAULT 'clinical', type text.
 *   2. charges_category_check allows clinical/product/consultation/other.
 *   3. charges.doctor_id is now NULLABLE.
 *   4. append-only lock intact: authenticated = SELECT+INSERT only on charges.
 *   5. every existing charges row backfilled to a valid category (0 bad).
 * (No functional inserts here — this is a real commit; we do not persist test rows.)
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/apply-charges-category.mjs --confirm
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
const CATEGORIES = ['clinical', 'product', 'consultation', 'other']

// ── Confirmation gate ─────────────────────────────────────────────────────────
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the Slice 4b category migration to STAGING.')
  console.error('Re-run with the explicit flag once the dry-run is clean:')
  console.error('  node scratchpad/apply-charges-category.mjs --confirm')
  process.exit(1)
}

// ── Connection: discrete fields from STAGING_DB_URL, SSL forced ───────────────
const DB_URL = process.env.STAGING_DB_URL
if (!DB_URL) {
  console.error('Set STAGING_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres')
  process.exit(1)
}
// Require STAGING, reject PROD.
if (!DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL does not contain the staging ref (${STAGING_REF}).`)
  process.exit(1)
}
if (DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL contains the production ref (${PROD_REF}).`)
  process.exit(1)
}

// ── Load migration VERBATIM (keep its own BEGIN…COMMIT) ───────────────────────
const migPath = path.join(__dirname, '..', 'scripts', 'billing-charges-category-migration.sql')
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
  // 1. category column shape
  const r1 = await client.query(
    `SELECT is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='charges' AND column_name='category'`,
  )
  const c = r1.rows[0]
  check('1. charges.category: exists, NOT NULL, default clinical, type text',
    !!c && c.is_nullable === 'NO' && /clinical/.test(c.column_default || '') && c.data_type === 'text',
    c ? `is_nullable=${c.is_nullable} default=${c.column_default} type=${c.data_type}` : 'column missing')

  // 2. CHECK constraint with the 4-value allow-list
  const r2 = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='charges_category_check'`,
  )
  const def = r2.rows[0]?.def || ''
  check('2. charges_category_check allows clinical/product/consultation/other',
    r2.rows.length === 1 && CATEGORIES.every((v) => def.includes(`'${v}'`)), def || 'constraint missing')

  // 3. doctor_id relaxed to nullable
  const r3 = await client.query(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='charges' AND column_name='doctor_id'`,
  )
  check('3. charges.doctor_id is now NULLABLE', r3.rows[0]?.is_nullable === 'YES',
    `is_nullable=${r3.rows[0]?.is_nullable}`)

  // 4. append-only lock untouched (authenticated: SELECT+INSERT only on charges)
  const r4 = await client.query(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee='authenticated' AND table_schema='public' AND table_name='charges'
      ORDER BY privilege_type`,
  )
  const g = r4.rows.map((r) => r.privilege_type)
  check('4. append-only intact: authenticated charges = SELECT+INSERT, NO UPDATE/DELETE',
    g.includes('SELECT') && g.includes('INSERT') && !g.includes('UPDATE') && !g.includes('DELETE'),
    `[${g.join(', ')}]`)

  // 5. every existing charges row backfilled to a valid category
  const r5 = await client.query(
    `SELECT count(*)::int AS bad FROM charges
      WHERE category IS NULL OR category NOT IN ('clinical','product','consultation','other')`,
  )
  check('5. all existing charges rows have a valid category (0 bad)',
    r5.rows[0].bad === 0, `bad=${r5.rows[0].bad}`)
}

// ── Run ───────────────────────────────────────────────────────────────────────
let applied = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  STAGING APPLY — Slice 4b charges.category migration (${u.hostname})\n${'='.repeat(70)}`)
  console.log('running migration VERBATIM (its own BEGIN…COMMIT → real commit)…\n')

  await client.query(migSql) // BEGIN…COMMIT inside the file → persists on success
  applied = true
  console.log('✓ migration COMMITTED to staging.\n')

  await verify()
} catch (e) {
  runError = e
  // A mid-migration failure leaves the file's transaction aborted (never COMMITted).
  await client.query('ROLLBACK').catch(() => {})
  check('migration committed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(70)}`)
if (applied) {
  console.log(`APPLIED to staging. ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else {
  console.log('NOT APPLIED — the migration errored before COMMIT; staging is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
