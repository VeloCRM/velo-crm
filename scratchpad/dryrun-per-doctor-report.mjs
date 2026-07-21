#!/usr/bin/env node
/**
 * dryrun-per-doctor-report.mjs — transactional (BEGIN…ROLLBACK) proof of the
 * per_doctor_production RPC against the STAGING charges ledger, over a raw `pg`
 * connection. Mirrors scripts/dryrun-billing-slice2.mjs (discrete-field pg conn,
 * prod-ref abort guard, self-seed org→auth.users→profile→patient, BEGIN…ROLLBACK),
 * and ADDS an RLS simulation (SET LOCAL ROLE authenticated + request.jwt.claims
 * GUC) so the security_invoker tenant-isolation guarantee is actually exercised —
 * a superuser-only run would silently bypass RLS and prove nothing about the leak.
 *
 * The RPC DDL under test is LOADED FROM scripts/per-doctor-production-report.sql
 * (its outer BEGIN;/COMMIT; stripped so it runs inside THIS runner's transaction).
 * The path is resolved RELATIVE TO THIS FILE (import.meta.url), so it works
 * regardless of the current working directory. Single source of truth: the file
 * that ships is exactly what is verified here.
 *
 * ACTIVE-ROW RULE (matches finance-ledger-totals.sql / billing.js): a charge
 * counts only while its id is not referenced by any void row's reverses_id.
 *
 * ── Run (from the repo root, STAGING_DB_URL set, direct connection on 5432) ────
 *   node scratchpad/dryrun-per-doctor-report.mjs
 *   (expects STAGING_DB_URL=postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres)
 *
 * Refuses to run against the production ref. Exit 0 iff every assertion passes,
 * else 1. The transaction is ALWAYS rolled back — nothing persists on staging.
 */
import pkg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const { Client } = pkg

const PROD_REF = 'aajwuwjxpmmqcwhiynla'
// Resolve the shipped SQL relative to THIS runner (…/scratchpad → …/scripts).
const SQL_PATH = fileURLToPath(new URL('../scripts/per-doctor-production-report.sql', import.meta.url))

// ── Connection: discrete fields parsed from STAGING_DB_URL, SSL forced ────────
const DB_URL = process.env.STAGING_DB_URL
if (!DB_URL) {
  console.error('Set STAGING_DB_URL, e.g.\n  postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres')
  process.exit(1)
}
if (DB_URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_DB_URL points at the production ref (${PROD_REF}).`)
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

// ── RLS simulation: run fn as a clinic user (authenticated + JWT sub GUC) ──────
// SET LOCAL + set_config(..., true) are transaction-local, so RESET restores the
// superuser context for the next seed/assert and everything unwinds on ROLLBACK.
async function asUser(userId, fn) {
  await client.query('SET LOCAL ROLE authenticated')
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  try {
    return await fn()
  } finally {
    await client.query('RESET ROLE')
  }
}

// Call the RPC and return rows mapped to camelCase — mirrors lib/billing.js
// fetchPerDoctorProduction so the assertions read r.doctorId / r.orgId (NOT the raw
// snake_case columns; reading r.doctorId off snake rows was the 5/8 failure).
async function callRpc(pFrom = null, pTo = null) {
  const { rows } = await client.query(
    'SELECT org_id, doctor_id, doctor_name, currency::text AS currency, produced::bigint AS produced '
    + 'FROM public.per_doctor_production($1, $2)',
    [pFrom, pTo],
  )
  return rows.map(r => ({
    orgId: r.org_id,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    currency: r.currency,
    produced: Number(r.produced),
  }))
}

// Null-safe short-id for log output — a NULL doctor_id (the "other income" bucket)
// must never crash the display formatting with .slice on undefined/null.
const sid = v => (v ? String(v).slice(0, 8) : 'NULL')

// ── Seed helpers (all inside the txn, superuser → RLS bypassed for seeding) ────
const rand = () => Math.random().toString(36).slice(2, 10)

async function mkOrg(label) {
  const r = rand()
  return (await client.query(
    'INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id',
    [`PDP ${label} ${r}`, `pdp-${label}-${r}`],
  )).rows[0].id
}
async function mkMember(orgId, role, name) {
  const r = rand()
  const uid = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`pdp-${r}@example.test`],
  )).rows[0].id
  // Tolerate a possible auth→profile trigger; force the intended org/role/name.
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, role = EXCLUDED.role, full_name = EXCLUDED.full_name`,
    [uid, orgId, role, name],
  )
  return uid
}
async function mkPatient(orgId) {
  return (await client.query(
    'INSERT INTO patients (org_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id',
    [orgId, `PDP Patient ${rand()}`, '+9647000000000'],
  )).rows[0].id
}
// doctorId may be null (non-clinical). createdBy must be a real profile. createdAt optional.
async function mkCharge(orgId, patientId, doctorId, amount, currency, category, createdBy, createdAt = null) {
  const { rows } = await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, category, description,
                          amount_minor, currency, created_by, created_at)
     VALUES ($1, $2, $3, 'charge', $4, 'dry-run', $5, $6, $7, COALESCE($8::timestamptz, now()))
     RETURNING id`,
    [orgId, patientId, doctorId, category, amount, currency, createdBy, createdAt],
  )
  return rows[0].id
}
async function voidChg(orgId, chargeId) {
  const o = (await client.query(
    'SELECT patient_id, doctor_id, amount_minor, currency, created_by FROM charges WHERE id = $1 AND org_id = $2',
    [chargeId, orgId],
  )).rows[0]
  await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, reverses_id, category, description,
                          amount_minor, currency, created_by)
     VALUES ($1, $2, $3, 'void', $4, 'clinical', 'void', $5, $6, $7)`,
    [orgId, o.patient_id, o.doctor_id, chargeId, o.amount_minor, o.currency, o.created_by],
  )
}
// An operator has a row in `operators` and NO profiles row (a distinct trust tier).
async function mkOperator() {
  const uid = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`pdp-op-${rand()}@example.test`],
  )).rows[0].id
  await client.query('INSERT INTO operators (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [uid])
  return uid
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nper_doctor_production — staging dry-run (${u.hostname})\n${'='.repeat(66)}`)
  await client.query('BEGIN')

  // Install the RPC exactly as shipped (strip the file's own BEGIN;/COMMIT; so it
  // runs inside this rolled-back txn; the trailing VERIFY/ROLLBACK are comments).
  const ddl = readFileSync(SQL_PATH, 'utf8')
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*COMMIT;\s*$/m, '')
  await client.query(ddl)
  console.log(`installed RPC from ${SQL_PATH} (rolled back at end)\n`)

  // ── Seed: Org A (owner + two doctors + a receptionist) ──────────────────────
  const orgA = await mkOrg('A')
  const userA = await mkMember(orgA, 'owner', 'Owner A')        // owner caller
  const docA1 = await mkMember(orgA, 'doctor', 'Dr A-One')
  const docA2 = await mkMember(orgA, 'doctor', 'Dr A-Two')      // date-window doctor
  const recA  = await mkMember(orgA, 'receptionist', 'Reception A')
  const patA  = await mkPatient(orgA)

  // Active clinical + a to-be-voided clinical + a NULL-doctor non-clinical charge.
  await mkCharge(orgA, patA, docA1, 100000, 'IQD', 'clinical', docA1)          // active
  const voided = await mkCharge(orgA, patA, docA1, 30000, 'IQD', 'clinical', docA1) // will be voided
  await voidChg(orgA, voided)
  await mkCharge(orgA, patA, null, 25000, 'IQD', 'product', userA)             // NULL-doctor bucket

  // Date-window charges (USD, isolate by currency): one in-window (Jan 2020), one out (Mar 2020).
  await mkCharge(orgA, patA, docA2, 100000, 'USD', 'clinical', docA2, '2020-01-15T10:00:00Z')
  await mkCharge(orgA, patA, docA2, 50000,  'USD', 'clinical', docA2, '2020-03-15T10:00:00Z')

  // ── Seed: Org B (must never be visible to a member of Org A) ─────────────────
  const orgB = await mkOrg('B')
  const docB = await mkMember(orgB, 'doctor', 'Dr B')
  const patB = await mkPatient(orgB)
  await mkCharge(orgB, patB, docB, 999999, 'IQD', 'clinical', docB)

  // ── 1. SECURITY INVOKER (not definer) ───────────────────────────────────────
  const sec = (await client.query(
    "SELECT prosecdef FROM pg_proc WHERE proname = 'per_doctor_production'",
  )).rows
  check('1. Function is SECURITY INVOKER (prosecdef=false)',
    sec.length === 1 && sec[0].prosecdef === false, `prosecdef=${sec[0]?.prosecdef}`)

  // ── 2. Grants: authenticated EXECUTE, anon none ─────────────────────────────
  const grants = (await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public' AND routine_name = 'per_doctor_production'`,
  )).rows
  check('2a. authenticated has EXECUTE',
    grants.some(g => g.grantee === 'authenticated' && g.privilege_type === 'EXECUTE'))
  check('2b. anon has NO grant',
    !grants.some(g => g.grantee === 'anon'),
    grants.filter(g => g.grantee === 'anon').map(g => g.privilege_type).join(',') || 'none')

  // ── 3 (a). OWNER sees ALL doctors + the NULL-doctor bucket ──────────────────
  const ownerView = await asUser(userA, () => callRpc(null, null))
  const ownerDocs = new Set(ownerView.map(r => r.doctorId))
  check('3. OWNER sees all doctors + NULL bucket (docA1, docA2, other-income all present)',
    ownerDocs.has(docA1) && ownerDocs.has(docA2) && ownerView.some(r => r.doctorId === null),
    `doctorIds=${JSON.stringify([...ownerDocs].map(sid))}`)

  // ── 4 (d). RECONCILIATION for the OWNER's view: Σ produced == billed ────────
  const recon = await asUser(userA, async () => {
    const pd = await callRpc(null, null)
    const byCur = {}
    for (const r of pd) byCur[r.currency] = (byCur[r.currency] || 0) + r.produced
    const billed = (await client.query(
      'SELECT currency::text AS currency, billed::bigint AS billed FROM public.finance_ledger_totals',
    )).rows
    return { byCur, billed }
  })
  const billedMap = Object.fromEntries(recon.billed.map(r => [r.currency, Number(r.billed)]))
  const curKeys = new Set([...Object.keys(recon.byCur), ...Object.keys(billedMap)])
  let reconOk = curKeys.size > 0
  for (const c of curKeys) if ((recon.byCur[c] || 0) !== (billedMap[c] || 0)) reconOk = false
  check('4. RECONCILIATION (owner view): Σ produced == finance_ledger_totals.billed per currency',
    reconOk, `produced=${JSON.stringify(recon.byCur)} billed=${JSON.stringify(billedMap)}`)

  // ── 5 (b). DOCTOR sees ONLY their own rows (no other doctor, no NULL bucket) ─
  const docView = await asUser(docA1, () => callRpc(null, null))
  const onlyOwn = docView.length > 0
    && docView.every(r => r.doctorId === docA1)
    && !docView.some(r => r.doctorId === docA2)
    && !docView.some(r => r.doctorId === null)
  const docA1Iqd = docView.find(r => r.currency === 'IQD')?.produced ?? null
  check('5. DOCTOR sees ONLY own rows (docA2 absent, NULL bucket absent, own IQD=100000 w/ void excluded)',
    onlyOwn && docA1Iqd === 100000, `rows=${JSON.stringify(docView.map(r => ({ d: sid(r.doctorId), c: r.currency, p: r.produced })))}`)

  // ── 6 (c). RECEPTIONIST → zero rows ─────────────────────────────────────────
  const recView = await asUser(recA, () => callRpc(null, null))
  check('6. RECEPTIONIST sees ZERO rows', recView.length === 0, `rowCount=${recView.length}`)

  // ── 7 (e). TENANT ISOLATION — owner in Org A sees ONLY Org A ────────────────
  const isoOrgs = [...new Set(ownerView.map(r => r.orgId))]
  check('7. TENANT ISOLATION: owner in Org A sees ONLY Org A (never Org B)',
    isoOrgs.length === 1 && isoOrgs[0] === orgA, `orgIds=${JSON.stringify(isoOrgs.map(sid))}`)

  // ── 8 (f). OPERATOR = owner-equivalent across the orgs RLS exposes ──────────
  // Confirms operators (a separate trust tier) legitimately see all orgs, while
  // clinic-member isolation (5–7) is enforced independently. Best-effort seed.
  let opUser = null
  try { opUser = await mkOperator() } catch { opUser = null }
  if (opUser) {
    const opView = await asUser(opUser, () => callRpc(null, null))
    const opOrgs = new Set(opView.map(r => r.orgId))
    check('8. OPERATOR sees all orgs (owner-equiv cross-org; member isolation still holds via 5–7)',
      opOrgs.has(orgA) && opOrgs.has(orgB), `orgIds=${JSON.stringify([...opOrgs].map(sid))}`)
  } else {
    console.log('⊘ SKIP  8. OPERATOR cross-org — could not seed an operators row')
  }

  // ── 9. Date window — bounded owner call returns only in-range charges ───────
  const windowed = await asUser(userA, async () => {
    const inWin = await callRpc('2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z') // Jan only
    const allTime = await callRpc(null, null)
    return {
      winUsd: inWin.find(r => r.doctorId === docA2 && r.currency === 'USD')?.produced ?? null,
      allUsd: allTime.find(r => r.doctorId === docA2 && r.currency === 'USD')?.produced ?? null,
      winHasRecent: inWin.some(r => r.currency === 'IQD'), // recent "now" charges are out of range
    }
  })
  check('9. Date window (owner): Dr A-Two USD in Jan-2020 = 100000 (Mar charge & recent rows excluded)',
    windowed.winUsd === 100000 && windowed.allUsd === 150000 && windowed.winHasRecent === false,
    `winUSD=${windowed.winUsd} allUSD=${windowed.allUsd} winHasRecentIQD=${windowed.winHasRecent}`)

  void patB; void docB
}

let runError = null
try {
  await client.connect()
  await main()
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(66)}\n${results.length - failed.length}/${results.length} assertions passed. (transaction ROLLED BACK — nothing persisted)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map(f => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
