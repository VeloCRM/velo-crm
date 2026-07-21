#!/usr/bin/env node
/**
 * dryrun-charges-category.mjs — STAGING dry-run of the Slice 4b category migration
 * (scripts/billing-charges-category-migration.sql). Applies the migration body
 * inside BEGIN … [schema VERIFY + functional asserts] … ROLLBACK over a raw `pg`
 * connection, then rolls back — NOTHING PERSISTS. Rehearses "does it apply cleanly
 * + behave as intended" before the human-runs-it prod apply.
 *
 * Same machinery as the Slice-1 dry-run that worked: discrete-field pg connection,
 * strip the migration's own BEGIN;/COMMIT; so its body runs inside OUR controlling
 * transaction, hard-abort if a standalone BEGIN;/COMMIT; survives the strip. Adds
 * the Slice-2 self-seed (org→auth.users→profile→patient) for the functional checks.
 *
 * ⚠️ TARGETS STAGING. Guard:
 *     - ABORT unless STAGING_DB_URL contains the staging ref (dujnbboyeugrisgewnqu).
 *     - ABORT if it contains the production ref (aajwuwjxpmmqcwhiynla).
 *   Connects as the direct `postgres` role (superuser → bypasses RLS), so the
 *   functional inserts exercise the DB's own permissiveness (nullable doctor_id +
 *   the category CHECK), NOT the RLS role gate.
 *
 * VERIFY (in-transaction, before ROLLBACK) — what the real apply WOULD produce:
 *   1. charges.category exists, NOT NULL, DEFAULT 'clinical', type text.
 *   2. charges_category_check allows clinical/product/consultation/other.
 *   3. charges.doctor_id is now NULLABLE.
 *   4. append-only lock still intact: authenticated has SELECT+INSERT only on
 *      charges (NO UPDATE/DELETE) — this migration must not have loosened it.
 *   5. every pre-existing charges row backfills to a valid category (0 bad),
 *      proving the NOT NULL DEFAULT 'clinical' backfill is safe on live data.
 *
 * FUNCTIONAL (in-transaction, self-seeded, before ROLLBACK):
 *   F1. INSERT a 'clinical' charge WITH a doctor            → succeeds.
 *   F2. INSERT a 'product'  charge WITHOUT a doctor (NULL)  → succeeds (permissive).
 *   F3. INSERT a charge with category='bogus'              → rejected by the CHECK.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-charges-category.mjs
 *
 * Exit 0 iff the migration applied cleanly AND every assertion passed. The
 * transaction is ALWAYS rolled back — staging is left unchanged.
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

// ── Connection: discrete fields from STAGING_DB_URL, SSL forced ───────────────
const DB_URL = process.env.STAGING_DB_URL
if (!DB_URL) {
  console.error('Set STAGING_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres')
  process.exit(1)
}
// Require STAGING, reject PROD.
if (!DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL does not contain the staging ref (${STAGING_REF}).`)
  console.error('This runner is the STAGING dry-run — point it at staging only.')
  process.exit(1)
}
if (DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL contains the production ref (${PROD_REF}).`)
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

// HARD SAFETY NET — the strip must have taken, and no standalone BEGIN;/COMMIT;
// may survive (the DO $$ ... BEGIN ... END$$ block's BEGIN has no trailing ';',
// so it is NOT matched; the ROLLBACK section's BEGIN;/COMMIT; are '--' comments).
if (migSql === original) {
  console.error('ABORT: migration BEGIN;/COMMIT; markers not found (file changed?) — refusing to run.')
  process.exit(1)
}
if (/^BEGIN;[ \t]*$/m.test(migSql) || /^COMMIT;[ \t]*$/m.test(migSql)) {
  console.error('ABORT: a standalone BEGIN;/COMMIT; survived stripping — refusing to run.')
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
async function expectSucceed(name, fn) {
  try {
    await fn()
    check(name, true)
  } catch (e) {
    check(name, false, `unexpected rejection: ${e?.message || String(e)}`)
  }
}
// DB-level rejection test, contained in a SAVEPOINT so the constraint violation
// (which aborts the current subtransaction) does not poison the outer txn.
async function expectRejectAtDB(name, sql, params, matchStr) {
  await client.query('SAVEPOINT sp_reject')
  try {
    await client.query(sql, params)
    check(name, false, 'expected a CHECK rejection, but the insert succeeded')
    await client.query('RELEASE SAVEPOINT sp_reject')
  } catch (e) {
    const msg = e?.message || String(e)
    const ok = !matchStr || msg.includes(matchStr)
    check(name, ok, ok ? `rejected: ${msg}` : `rejected, but not with "${matchStr}": ${msg}`)
    await client.query('ROLLBACK TO SAVEPOINT sp_reject')
  }
}

// ── Schema VERIFY (post-apply, in-transaction) ────────────────────────────────
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

  // 5. every pre-existing charges row backfilled to a valid category
  const r5 = await client.query(
    `SELECT count(*)::int AS bad FROM charges
      WHERE category IS NULL OR category NOT IN ('clinical','product','consultation','other')`,
  )
  check('5. all pre-existing charges rows backfill to a valid category (0 bad)',
    r5.rows[0].bad === 0, `bad=${r5.rows[0].bad}`)
}

// ── Self-seed (in-transaction): org → auth.users → profile → patient ──────────
async function seed() {
  const rand = Math.random().toString(36).slice(2, 10)
  const org = (await client.query(
    `INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id`,
    [`CAT VERIFY ORG ${rand}`, `cat-verify-${rand}`],
  )).rows[0].id
  const doctor = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`cat-verify-${rand}@example.test`],
  )).rows[0].id
  // Tolerate a possible auth→profile trigger; only the FK target must exist.
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name)
     VALUES ($1, $2, 'doctor', 'Cat Verify Doctor') ON CONFLICT (id) DO NOTHING`,
    [doctor, org],
  )
  const patient = (await client.query(
    `INSERT INTO patients (org_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [org, `CAT VERIFY PATIENT ${rand}`, '+9647000000001'],
  )).rows[0].id
  return { org, doctor, patient }
}

// ── Functional assertions (post-apply, self-seeded) ───────────────────────────
const INSERT_COLS =
  'org_id, patient_id, doctor_id, kind, category, description, amount_minor, currency, created_by'

async function functional({ org, doctor, patient }) {
  // F1. clinical WITH doctor → succeeds
  await expectSucceed('F1. clinical charge WITH doctor inserts', () => client.query(
    `INSERT INTO charges (${INSERT_COLS})
     VALUES ($1, $2, $3, 'charge', 'clinical', 'Clinical w/ doctor', 100000, 'IQD', $3)`,
    [org, patient, doctor]))

  // F2. product WITHOUT doctor (doctor_id NULL) → succeeds (created_by still a real user)
  await expectSucceed('F2. product charge WITHOUT doctor (doctor_id NULL) inserts', () => client.query(
    `INSERT INTO charges (${INSERT_COLS})
     VALUES ($1, $2, NULL, 'charge', 'product', 'Product no doctor', 25000, 'IQD', $3)`,
    [org, patient, doctor]))

  // F3. invalid category → rejected by charges_category_check
  await expectRejectAtDB("F3. invalid category 'bogus' rejected by charges_category_check",
    `INSERT INTO charges (${INSERT_COLS})
     VALUES ($1, $2, $3, 'charge', 'bogus', 'Bad category', 5000, 'IQD', $3)`,
    [org, patient, doctor], 'charges_category_check')
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nSTAGING dry-run — Slice 4b charges.category migration (${u.hostname})\n${'='.repeat(70)}`)
  console.log('migration BEGIN;/COMMIT; stripped; running body inside a dry-run transaction.\n')

  await client.query('BEGIN')
  await client.query(migSql) // apply the whole migration body (ADD COLUMN + CHECK + relax NOT NULL)
  console.log('✓ migration body applied without error (uncommitted)\n')

  await verify()

  const seeded = await seed()
  console.log(`\nseeded (rolled back at end): org=${seeded.org} patient=${seeded.patient}\n`)
  await functional(seeded)
} catch (e) {
  runError = e
  check('migration applied + verified without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(70)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — staging UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the category migration applies to staging without error, adds')
  console.log('category (NOT NULL default clinical) + the CHECK, relaxes doctor_id to nullable,')
  console.log('keeps the append-only lock, and behaves permissively (no-doctor charge OK, bad')
  console.log('category rejected). Nothing persisted — the real apply is a separate human step.')
}
process.exit(failed.length || runError ? 1 : 0)
