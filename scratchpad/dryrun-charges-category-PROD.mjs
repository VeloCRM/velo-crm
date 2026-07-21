#!/usr/bin/env node
/**
 * dryrun-charges-category-PROD.mjs — PRODUCTION dry-run of the Slice 4b category
 * migration (scripts/billing-charges-category-migration.sql). Applies the full
 * migration body inside BEGIN … [schema VERIFY] … ROLLBACK over a raw `pg`
 * connection, then rolls back — NOTHING PERSISTS. The "does it apply cleanly to
 * prod + is the backfill safe on Le Royal's real charges" rehearsal before the
 * real human-runs-it apply.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *
 * ⚠️ The migration file ships with its OWN `BEGIN;` … `COMMIT;`. Left intact, that
 * COMMIT would PERSIST the DDL to production. This runner strips the file's
 * transaction-control statements so the body runs inside OUR controlling
 * transaction, and HARD-ABORTS if a standalone BEGIN;/COMMIT; survives the strip.
 * (The DO $$ ... BEGIN ... END$$ block's BEGIN has no trailing ';', so it is NOT
 * matched; the ROLLBACK section's BEGIN;/COMMIT; are '--' comments.) ADD COLUMN,
 * ALTER, and the guarded ADD CONSTRAINT are all transactional → ROLLBACK undoes them.
 *
 * SELECT-only VERIFY (in-transaction, before ROLLBACK) — what the real apply WOULD
 * produce. No functional inserts: we do NOT write test rows to production, even in
 * a rolled-back txn.
 *   1. charges.category exists, NOT NULL, DEFAULT 'clinical', type text.
 *   2. charges_category_check allows clinical/product/consultation/other.
 *   3. charges.doctor_id is now NULLABLE.
 *   4. append-only lock intact: authenticated = SELECT+INSERT only on charges.
 *   5. BACKFILL-SAFE: every EXISTING prod charges row (Le Royal + test) backfills to
 *      a valid category (0 bad) — proves NOT NULL DEFAULT 'clinical' is safe on live data.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-charges-category-PROD.mjs
 *
 * Exit 0 iff the migration applied cleanly AND every VERIFY assertion passed.
 * The transaction is ALWAYS rolled back — production is left unchanged.
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
const migPath = path.join(__dirname, '..', 'scripts', 'billing-charges-category-migration.sql')
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
  // 1. category column shape
  const r1 = await client.query(
    `SELECT is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='charges' AND column_name='category'`,
  )
  const c = r1.rows[0]
  check('1. charges.category would exist, NOT NULL, default clinical, type text',
    !!c && c.is_nullable === 'NO' && /clinical/.test(c.column_default || '') && c.data_type === 'text',
    c ? `is_nullable=${c.is_nullable} default=${c.column_default} type=${c.data_type}` : 'column missing')

  // 2. CHECK constraint with the 4-value allow-list
  const r2 = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='charges_category_check'`,
  )
  const def = r2.rows[0]?.def || ''
  check('2. charges_category_check would allow clinical/product/consultation/other',
    r2.rows.length === 1 && CATEGORIES.every((v) => def.includes(`'${v}'`)), def || 'constraint missing')

  // 3. doctor_id relaxed to nullable
  const r3 = await client.query(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='charges' AND column_name='doctor_id'`,
  )
  check('3. charges.doctor_id would be NULLABLE', r3.rows[0]?.is_nullable === 'YES',
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

  // 5. BACKFILL-SAFE against Le Royal's real charges rows
  const r5 = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (
              WHERE category IS NULL OR category NOT IN ('clinical','product','consultation','other')
            )::int AS bad
       FROM charges`,
  )
  check('5. backfill-safe: every existing prod charges row valid category (0 bad)',
    r5.rows[0].bad === 0, `total=${r5.rows[0].total} bad=${r5.rows[0].bad}`)
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — Slice 4b charges.category migration (${u.hostname})\n${'='.repeat(70)}`)
  console.log('migration BEGIN;/COMMIT; stripped; running body inside a dry-run transaction.\n')

  await client.query('BEGIN')
  await client.query(migSql) // apply the whole migration body (ADD COLUMN + CHECK + relax NOT NULL)
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
console.log(`\n${'='.repeat(70)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — production UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the category migration applies to production without error,')
  console.log('produces the expected schema (category + CHECK, nullable doctor_id), keeps the')
  console.log('append-only lock, and backfills every existing charge safely. Nothing persisted —')
  console.log('the real apply is a separate human step (apply-charges-category-PROD.mjs --confirm).')
}
process.exit(failed.length || runError ? 1 : 0)
