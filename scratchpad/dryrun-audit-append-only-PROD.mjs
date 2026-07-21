#!/usr/bin/env node
/**
 * dryrun-audit-append-only-PROD.mjs — PRODUCTION dry-run of the audit_log append-only
 * lock (scripts/audit-log-append-only-migration.sql). Applies the migration body inside
 * BEGIN … [schema VERIFY] … ROLLBACK over a raw `pg` connection — NOTHING PERSISTS.
 *
 * ⚠️ TARGETS PRODUCTION. Guard is INVERTED vs the staging runners:
 *     - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *     - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *
 * The migration ships with its OWN BEGIN;…COMMIT; — left intact the COMMIT would PERSIST
 * to production. This runner strips those, runs the body inside OUR controlling txn, and
 * HARD-ABORTS if a standalone BEGIN;/COMMIT; survives the strip. REVOKE / DROP POLICY /
 * CREATE INDEX are all transactional → ROLLBACK fully undoes them.
 *
 * SELECT-only VERIFY (in-transaction, before ROLLBACK) — what the real apply WOULD do:
 *   1. authenticated grants on audit_log = {INSERT, SELECT} only.
 *   2. anon has NO grants.
 *   3. no UPDATE/DELETE policies remain; INSERT + SELECT policies still exist.
 *   4. idx_audit_log_org_created exists.
 * No seeding / no SET ROLE simulation on prod — the functional append-only behaviour
 * (UPDATE/DELETE rejected for members AND operators) was proven by the staging dry-run.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-audit-append-only-PROD.mjs
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

const migPath = path.join(__dirname, '..', 'scripts', 'audit-log-append-only-migration.sql')
if (!fs.existsSync(migPath)) {
  console.error(`Migration not found at ${migPath}`)
  process.exit(1)
}
const original = fs.readFileSync(migPath, 'utf8')
const migSql = original
  .replace(/^BEGIN;[ \t]*$/m, '-- [transaction BEGIN stripped: controlled by dry-run]')
  .replace(/^COMMIT;[ \t]*$/m, '-- [transaction COMMIT stripped: dry-run rolls back]')
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

const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}

async function verify() {
  const g = (await client.query(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee='authenticated' AND table_schema='public' AND table_name='audit_log'
      ORDER BY privilege_type`,
  )).rows.map(r => r.privilege_type)
  check('1. authenticated grants on audit_log would be {INSERT, SELECT} only',
    g.length === 2 && g.includes('INSERT') && g.includes('SELECT') && !g.includes('UPDATE') && !g.includes('DELETE'),
    `[${g.join(', ')}]`)

  const anon = (await client.query(
    `SELECT count(*)::int AS n FROM information_schema.role_table_grants
      WHERE grantee='anon' AND table_schema='public' AND table_name='audit_log'`,
  )).rows[0].n
  check('2. anon would have NO grants on audit_log', anon === 0, `anon grants=${anon}`)

  const pol = (await client.query(
    `SELECT cmd, count(*)::int AS n FROM pg_policies
      WHERE schemaname='public' AND tablename='audit_log' GROUP BY cmd`,
  )).rows
  const cmap = Object.fromEntries(pol.map(r => [r.cmd, r.n]))
  check('3. no UPDATE/DELETE policies remain; INSERT + SELECT policies still exist',
    !cmap.UPDATE && !cmap.DELETE && (cmap.INSERT || 0) >= 2 && (cmap.SELECT || 0) >= 2,
    pol.map(r => `${r.cmd}×${r.n}`).join('  '))

  const idx = (await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='audit_log'
      AND indexname='idx_audit_log_org_created'`,
  )).rowCount
  check('4. idx_audit_log_org_created would exist', idx === 1)
}

let runError = null
try {
  await client.connect()
  console.log(`\nPRODUCTION dry-run — audit_log append-only lock (${u.hostname})\n${'='.repeat(70)}`)
  console.log('migration BEGIN;/COMMIT; stripped; running body inside a dry-run transaction.\n')

  await client.query('BEGIN')
  await client.query(migSql)
  console.log('✓ migration body applied without error (uncommitted)\n')

  await verify()
} catch (e) {
  runError = e
  check('migration applied + verified without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(70)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — production UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: the append-only lock applies to production and produces the')
  console.log('expected grants/policies/index. Nothing persisted — the real apply is a')
  console.log('separate human step (apply-audit-append-only-PROD.mjs --confirm).')
}
process.exit(failed.length || runError ? 1 : 0)
