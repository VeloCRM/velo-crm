#!/usr/bin/env node
/**
 * apply-audit-append-only-PROD.mjs — REAL PRODUCTION APPLY of the audit_log append-only
 * lock (scripts/audit-log-append-only-migration.sql). Runs the file VERBATIM — its own
 * BEGIN…COMMIT means this COMMITS to PRODUCTION — then runs the SELECT-only VERIFY.
 *
 * ⚠️⚠️ THIS PERSISTS TO PRODUCTION. Not a dry-run. Run the PROD dry-run
 *      (scratchpad/dryrun-audit-append-only-PROD.mjs) FIRST and confirm it is clean.
 *
 * Guards (INVERTED):
 *   - ABORT unless PROD_DB_URL contains the production ref (aajwuwjxpmmqcwhiynla).
 *   - ABORT if it contains the staging ref (dujnbboyeugrisgewnqu).
 *   - REQUIRES the `--confirm` flag.
 *
 * Atomicity: single BEGIN…COMMIT. On any error nothing commits (ROLLBACK the aborted
 * state, report, skip VERIFY). Idempotent (REVOKE no-op / DROP POLICY IF EXISTS /
 * CREATE INDEX IF NOT EXISTS), so a re-run after a partial failure is safe.
 *
 * VERIFY (post-commit, read-only): authenticated grants = {INSERT, SELECT}; anon none;
 * no UPDATE/DELETE policies (INSERT + SELECT kept); idx_audit_log_org_created exists.
 * (Functional append-only behaviour was proven by the staging dry-run's SET ROLE sim.)
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:PROD_DB_URL='postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres'
 *   node scratchpad/apply-audit-append-only-PROD.mjs --confirm
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

if (!process.argv.includes('--confirm')) {
  console.error('REFUSING TO RUN: this APPLIES + COMMITS the audit_log append-only lock to PRODUCTION.')
  console.error('Re-run with the explicit flag once the PROD dry-run is clean:')
  console.error('  node scratchpad/apply-audit-append-only-PROD.mjs --confirm')
  process.exit(1)
}

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

const migPath = path.join(__dirname, '..', 'scripts', 'audit-log-append-only-migration.sql')
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
  check('1. authenticated grants on audit_log = {INSERT, SELECT} only',
    g.length === 2 && g.includes('INSERT') && g.includes('SELECT') && !g.includes('UPDATE') && !g.includes('DELETE'),
    `[${g.join(', ')}]`)

  const anon = (await client.query(
    `SELECT count(*)::int AS n FROM information_schema.role_table_grants
      WHERE grantee='anon' AND table_schema='public' AND table_name='audit_log'`,
  )).rows[0].n
  check('2. anon has NO grants on audit_log', anon === 0, `anon grants=${anon}`)

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
  check('4. idx_audit_log_org_created exists', idx === 1)
}

let applied = false
let runError = null
try {
  await client.connect()
  console.log(`\n⚠️  PRODUCTION APPLY — audit_log append-only lock (${u.hostname})\n${'='.repeat(70)}`)
  console.log('running migration VERBATIM (its own BEGIN…COMMIT → real commit)…\n')

  await client.query(migSql)
  applied = true
  console.log('✓ migration COMMITTED to production.\n')

  await verify()
} catch (e) {
  runError = e
  await client.query('ROLLBACK').catch(() => {})
  check('migration committed without error', false, e?.message || String(e))
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(70)}`)
if (applied) {
  console.log(`APPLIED to production. ${results.length - failed.length}/${results.length} VERIFY checks passed.`)
} else {
  console.log('NOT APPLIED — the migration errored before COMMIT; production is UNCHANGED.')
}
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nError: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
