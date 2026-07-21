#!/usr/bin/env node
/**
 * dryrun-audit-append-only.mjs — STAGING dry-run of the audit_log append-only lock
 * (scripts/audit-log-append-only-migration.sql). Applies the migration body inside
 * BEGIN … [VERIFY] … ROLLBACK over a raw `pg` connection — NOTHING PERSISTS.
 *
 * Mirrors dryrun-charges-category.mjs (strip the file's own BEGIN/COMMIT, run the body
 * in our controlling txn, hard-abort if a stray BEGIN;/COMMIT; survives) + the
 * finance-totals runner's RLS simulation (SET ROLE authenticated + JWT-claim GUC) so
 * the append-only lock is proven against a REAL authenticated identity — the only way
 * the "UPDATE/DELETE rejected" asserts mean anything (as the postgres superuser the
 * grants/RLS are bypassed).
 *
 * ⚠️ TARGETS STAGING. Guard: require dujnbboyeugrisgewnqu, reject aajwuwjxpmmqcwhiynla.
 *
 * SCHEMA VERIFY (as postgres):
 *   1. authenticated grants on audit_log = {INSERT, SELECT} only (no UPDATE/DELETE).
 *   2. anon has NO grants.
 *   3. NO UPDATE/DELETE policies remain; the INSERT + SELECT policies still exist.
 *   4. idx_audit_log_org_created exists.
 *
 * FUNCTIONAL VERIFY (SET ROLE authenticated + JWT-claim GUC; the important part):
 *   as a clinic MEMBER (profile in the org):
 *     • INSERT into audit_log (own org)  → SUCCEEDS  (logging keeps working)
 *     • SELECT own-org rows              → SUCCEEDS  (they can read their log)
 *     • UPDATE audit_log                 → REJECTED  (the lock; permission denied)
 *     • DELETE FROM audit_log            → REJECTED  (the lock)
 *   as an OPERATOR (is_operator() = true — nobody is exempt):
 *     • INSERT                           → SUCCEEDS  (operator writes still work)
 *     • UPDATE / DELETE                  → REJECTED  (grant revoked for `authenticated`)
 *   Rejection asserts run inside SAVEPOINTs (a permission error aborts the subtxn).
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-audit-append-only.mjs
 *
 * Exit 0 iff every assertion passes. The transaction is ALWAYS rolled back.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'

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

// ── Load migration + neutralize its transaction control ───────────────────────
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

// ── Harness ───────────────────────────────────────────────────────────────────
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}
async function expectOk(name, fn) {
  try { await fn(); check(name, true) }
  catch (e) { check(name, false, `unexpected error: ${e?.message || String(e)}`) }
}
// DB-level rejection test, contained in a SAVEPOINT so the aborted subtxn doesn't
// poison the outer transaction. Matches 'permission denied' by default.
async function expectReject(name, sql, params, matchStr = 'permission denied') {
  await client.query('SAVEPOINT sp')
  try {
    await client.query(sql, params)
    check(name, false, 'expected a rejection, but it succeeded')
    await client.query('RELEASE SAVEPOINT sp')
  } catch (e) {
    const msg = e?.message || String(e)
    const ok = !matchStr || msg.includes(matchStr)
    check(name, ok, ok ? `rejected: ${msg}` : `rejected, but not "${matchStr}": ${msg}`)
    await client.query('ROLLBACK TO SAVEPOINT sp')
  }
}

// ── RLS identity simulation (txn-local JWT claim + SET ROLE authenticated) ────
async function asAuthenticated(userId, fn) {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId])
  await client.query('SET ROLE authenticated')
  try { await fn() } finally { await client.query('RESET ROLE').catch(() => {}) }
}

// ── Schema VERIFY (as postgres) ───────────────────────────────────────────────
async function schemaVerify() {
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
  const noMutate = !cmap.UPDATE && !cmap.DELETE
  const keptRW = (cmap.INSERT || 0) >= 2 && (cmap.SELECT || 0) >= 2
  check('3. no UPDATE/DELETE policies remain; INSERT + SELECT policies still exist',
    noMutate && keptRW, pol.map(r => `${r.cmd}×${r.n}`).join('  '))

  const idx = (await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='audit_log'
      AND indexname='idx_audit_log_org_created'`,
  )).rowCount
  check('4. idx_audit_log_org_created exists', idx === 1)
}

// ── Seed: org → member (profile) + operator + one pre-existing audit row ──────
async function seed() {
  const rand = Math.random().toString(36).slice(2, 10)
  const org = (await client.query(
    `INSERT INTO orgs (name, slug) VALUES ($1,$2) RETURNING id`, [`AUD ${rand}`, `aud-${rand}`],
  )).rows[0].id
  const member = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`, [`aud-member-${rand}@example.test`],
  )).rows[0].id
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name) VALUES ($1,$2,'owner','Aud Member') ON CONFLICT (id) DO NOTHING`,
    [member, org],
  )
  const operator = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`, [`aud-op-${rand}@example.test`],
  )).rows[0].id
  await client.query(`INSERT INTO operators (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [operator])
  // A pre-existing audit row to attempt UPDATE/DELETE against (seeded as postgres).
  await client.query(
    `INSERT INTO audit_log (org_id, acting_user_id, action, entity_type)
     VALUES ($1,$2,'seed.event','seed')`, [org, member],
  )
  return { org, member, operator }
}

// ── Run ───────────────────────────────────────────────────────────────────────
let runError = null
try {
  await client.connect()
  console.log(`\nSTAGING dry-run — audit_log append-only lock (${u.hostname})\n${'='.repeat(70)}`)
  await client.query('BEGIN')

  await client.query(migSql) // REVOKE + DROP POLICY + CREATE INDEX (uncommitted)
  console.log('✓ migration body applied (uncommitted)\n')

  await schemaVerify()

  const { org, member, operator } = await seed()
  console.log(`\nseeded (rolled back): org=${org} member=${member} operator=${operator}\n`)

  // ── clinic MEMBER ──
  await asAuthenticated(member, async () => {
    const uid = (await client.query(`SELECT auth.uid()::text AS uid`)).rows[0].uid
    const oid = (await client.query(`SELECT public.current_org_id()::text AS oid`)).rows[0].oid
    check('5a. RLS sim: member auth.uid()/current_org_id() resolve', uid === member && oid === org, `uid=${uid} org=${oid}`)

    await expectOk('5b. MEMBER INSERT into audit_log (own org) SUCCEEDS', () => client.query(
      `INSERT INTO audit_log (org_id, acting_user_id, action, entity_type) VALUES ($1,$2,'member.test','seed')`, [org, member]))

    const seen = (await client.query(`SELECT count(*)::int AS n FROM audit_log`)).rows[0].n
    check('5c. MEMBER SELECT own-org rows SUCCEEDS (rows visible)', seen >= 1, `visible rows=${seen}`)

    await expectReject('5d. MEMBER UPDATE audit_log is REJECTED (the lock)',
      `UPDATE audit_log SET payload='{"x":1}'::jsonb WHERE org_id=$1`, [org])
    await expectReject('5e. MEMBER DELETE FROM audit_log is REJECTED (the lock)',
      `DELETE FROM audit_log WHERE org_id=$1`, [org])
  })

  // ── OPERATOR (nobody is exempt) ──
  await asAuthenticated(operator, async () => {
    const isOp = (await client.query(`SELECT public.is_operator() AS b`)).rows[0].b
    check('6a. RLS sim: operator is_operator() = true', isOp === true, `is_operator=${isOp}`)

    await expectOk('6b. OPERATOR INSERT into audit_log SUCCEEDS (writes still work)', () => client.query(
      `INSERT INTO audit_log (org_id, acting_user_id, action, entity_type) VALUES ($1,$2,'op.test','seed')`, [org, operator]))

    await expectReject('6c. OPERATOR UPDATE audit_log is REJECTED (nobody is exempt)',
      `UPDATE audit_log SET payload='{"x":1}'::jsonb WHERE org_id=$1`, [org])
    await expectReject('6d. OPERATOR DELETE FROM audit_log is REJECTED (nobody is exempt)',
      `DELETE FROM audit_log WHERE org_id=$1`, [org])
  })
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('RESET ROLE') } catch { /* ignore */ }
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(70)}\n${results.length - failed.length}/${results.length} checks passed. (transaction ROLLED BACK — staging UNCHANGED)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
if (!failed.length && !runError) {
  console.log('\nDRY-RUN CLEAN: audit_log is INSERT+SELECT only. Logging + reads still work for')
  console.log('members and operators; UPDATE/DELETE are rejected for BOTH — the log is append-only.')
  console.log('Nothing persisted — the real apply is a separate human step.')
}
process.exit(failed.length || runError ? 1 : 0)
