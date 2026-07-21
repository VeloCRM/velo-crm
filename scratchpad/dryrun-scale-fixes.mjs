#!/usr/bin/env node
/**
 * dryrun-scale-fixes.mjs — transactional (BEGIN…VERIFY…ROLLBACK) proof of the
 * scale fixes against the STAGING clone, over a raw `pg` connection. Mirrors
 * dryrun-billing-slice2.mjs (discrete-field connection from STAGING_DB_URL, prod-ref
 * abort guard, self-seed, one txn rolled back at the end) and adds an RLS SIMULATION
 * (SET LOCAL ROLE authenticated + request.jwt.claims GUC) to prove tenant isolation
 * through the security_invoker view — the leak test.
 *
 * Everything runs inside ONE transaction and is ROLLED BACK: the DDL (indexes +
 * view), the seed, and every assertion. Nothing persists on staging.
 *
 * WHAT IT PROVES
 *   1. scale-indexes-migration.sql applies → all 8 indexes exist.
 *   2. patient-outstanding-balances-view.sql applies → security_invoker=on,
 *      authenticated=[SELECT] only, anon has no privilege.
 *   3. Seed: org-A (P1 owes IQD w/ a reversed payment + voided charge in history;
 *      P2 owes BOTH currencies; P3 holds a CREDIT) and org-B (P4 owes).
 *   4a. RECONCILIATION — the CURRENT billing.js getOutstandingCollections reduce,
 *       replicated here in JS over the same rows, returns IDENTICAL results to the
 *       view: same patients, same per-currency owed, P3 absent from both,
 *       latest_charge_at matching.
 *   4b. Voids/reversals excluded from owed — P1's number (75000 IQD) proves it.
 *   4c. TENANT ISOLATION — as an org-A member (RLS sim) the view returns ONLY org-A
 *       rows; org-B's owing patient never appears.
 *
 * ── Run (PowerShell; STAGING_DB_URL set; direct connection on 5432) ───────────
 *   $env:STAGING_DB_URL="postgresql://postgres:<pwd>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres"
 *   node scratchpad/dryrun-scale-fixes.mjs
 *
 * Refuses to run against the production ref (aajwuwjxpmmqcwhiynla). Exit 0 iff every
 * assertion passes, else 1. The transaction is ALWAYS rolled back.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const SCRIPTS = path.join(__dirname, '..', 'scripts')

// ── Config: STAGING_DB_URL from env, falling back to scripts/.env.staging.local ─
function loadEnvFile(fileName, key) {
  const p = path.join(SCRIPTS, fileName)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && m[1] === key && !process.env[key]) process.env[key] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}
loadEnvFile('.env.staging.local', 'STAGING_DB_URL')
loadEnvFile('.env.local', 'STAGING_DB_URL')

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

// Strip full-line comments + blank lines so the commented pg_trgm block and the
// reconciliation probe don't execute. Inline `-- …` comments are left intact
// (Postgres parses them to end-of-line).
function stripSql(sql) {
  return sql.split('\n').filter((l) => { const t = l.trim(); return t && !t.startsWith('--') }).join('\n')
}
function readSql(name) { return stripSql(fs.readFileSync(path.join(SCRIPTS, name), 'utf8')) }

// ── The 8 indexes the migration must create ─────────────────────────────────────
const EXPECTED_INDEXES = [
  'appointments_org_scheduled_idx',
  'appointments_org_patient_idx',
  'charges_org_created_idx',
  'charges_reverses_idx',
  'payments_org_recorded_idx',
  'payments_reverses_idx',
  'treatment_plans_org_patient_idx',
  'treatment_plan_items_plan_idx',
]

// ── EXACT replication of billing.js getOutstandingCollections (the JS reduce) ────
// activeRows: keep positive rows whose id is NOT referenced by any reverses_id.
function jsActiveRows(rows, positiveKind) {
  const reversed = new Set()
  for (const r of rows) if (r.reverses_id) reversed.add(r.reverses_id)
  return rows.filter((r) => r.kind === positiveKind && !reversed.has(r.id))
}
function jsGetOutstanding(charges, payments) {
  const byPatient = new Map()
  const bucket = (pid) => { if (!byPatient.has(pid)) byPatient.set(pid, { charges: [], payments: [] }); return byPatient.get(pid) }
  for (const c of charges) bucket(c.patient_id).charges.push(c)
  for (const p of payments) bucket(p.patient_id).payments.push(p)
  const owing = []
  for (const [patientId, { charges, payments }] of byPatient) {
    const owed = {}
    for (const c of jsActiveRows(charges, 'charge')) owed[c.currency] = (owed[c.currency] || 0) + Number(c.amount_minor || 0)
    for (const p of jsActiveRows(payments, 'payment')) owed[p.currency] = (owed[p.currency] || 0) - Number(p.amount_minor || 0)
    if (!Object.values(owed).some((v) => v > 0)) continue
    const latest = jsActiveRows(charges, 'charge')
      .reduce((max, c) => (!max || c.created_at > max) ? c.created_at : max, null)
    owing.push({ patientId, balances: owed, latestChargeAt: latest })
  }
  return owing
}
// Compare only the positive per-currency balances (what both the worklist and the
// view surface). Returns true iff identical.
function positiveOnly(bal) {
  const o = {}
  for (const [k, v] of Object.entries(bal)) if (Number(v) > 0) o[k] = Number(v)
  return o
}
function mapsEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (Number(a[k] || 0) !== Number(b[k] || 0)) return false
  return true
}
const epoch = (d) => (d == null ? null : new Date(d).getTime())

// ── Seed helpers (superuser; RLS bypassed for setup) ────────────────────────────
async function insertOrg(label) {
  const rand = Math.random().toString(36).slice(2, 10)
  return (await client.query(`INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id`,
    [`SCALE ${label} ${rand}`, `scale-${label}-${rand}`])).rows[0].id
}
async function insertMember(orgId, label) {
  const rand = Math.random().toString(36).slice(2, 10)
  const id = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role) VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`scale-${label}-${rand}@example.test`])).rows[0].id
  // Tolerate a possible auth→profile trigger; force org_id to ours either way.
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name) VALUES ($1, $2, 'owner', $3)
     ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id`,
    [id, orgId, `Scale ${label}`])
  return id
}
async function insertPatient(orgId, name) {
  return (await client.query(`INSERT INTO patients (org_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, name, '+9647000000000'])).rows[0].id
}
async function insertCharge(orgId, patientId, byId, kind, reversesId, desc, amount, currency, createdAt) {
  return (await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, reverses_id, description, amount_minor, currency, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9) RETURNING id`,
    [orgId, patientId, byId, kind, reversesId, desc, amount, currency, createdAt])).rows[0].id
}
async function insertPayment(orgId, patientId, byId, kind, reversesId, amount, currency) {
  return (await client.query(
    `INSERT INTO payments (org_id, patient_id, kind, reverses_id, amount_minor, currency, method, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'cash', $7) RETURNING id`,
    [orgId, patientId, kind, reversesId, amount, currency, byId])).rows[0].id
}

async function seed() {
  const orgA = await insertOrg('A')
  const orgB = await insertOrg('B')
  const memberA = await insertMember(orgA, 'A')
  const memberB = await insertMember(orgB, 'B')

  // P1 — owes IQD, with a reversed payment AND a voided charge in history.
  const P1 = await insertPatient(orgA, 'SCALE P1 owes-IQD')
  await insertCharge(orgA, P1, memberA, 'charge', null, 'Crown', 100000, 'IQD', '2026-03-01T00:00:00Z') // active
  const c1b = await insertCharge(orgA, P1, memberA, 'charge', null, 'Filling', 30000, 'IQD', '2026-06-01T00:00:00Z') // LATER, will be voided
  await insertCharge(orgA, P1, memberA, 'void', c1b, 'Voided filling', 30000, 'IQD', '2026-06-02T00:00:00Z')
  const pay1a = await insertPayment(orgA, P1, memberA, 'payment', null, 40000, 'IQD') // will be reversed
  await insertPayment(orgA, P1, memberA, 'reversal', pay1a, 40000, 'IQD')
  await insertPayment(orgA, P1, memberA, 'payment', null, 25000, 'IQD') // active
  // Net IQD = 100000 (active charge) − 25000 (active pay) = 75000. latest = 2026-03-01
  // (the LATER 30000 charge is voided → must not set latest).

  // P2 — owes in BOTH currencies.
  const P2 = await insertPatient(orgA, 'SCALE P2 owes-both')
  await insertCharge(orgA, P2, memberA, 'charge', null, 'IQD work', 60000, 'IQD', '2026-04-01T00:00:00Z')
  await insertPayment(orgA, P2, memberA, 'payment', null, 20000, 'IQD')
  await insertCharge(orgA, P2, memberA, 'charge', null, 'USD work', 5000, 'USD', '2026-04-15T00:00:00Z')
  // Net {IQD: 40000, USD: 5000}. latest = 2026-04-15.

  // P3 — CREDIT (paid more than charged) → excluded from worklist AND view.
  const P3 = await insertPatient(orgA, 'SCALE P3 credit')
  await insertCharge(orgA, P3, memberA, 'charge', null, 'Small', 10000, 'IQD', '2026-02-01T00:00:00Z')
  await insertPayment(orgA, P3, memberA, 'payment', null, 15000, 'IQD')
  // Net IQD = −5000 (credit).

  // org-B — one owing patient; must never leak to an org-A member.
  const P4 = await insertPatient(orgB, 'SCALE P4 orgB owes')
  await insertCharge(orgB, P4, memberB, 'charge', null, 'OrgB work', 90000, 'IQD', '2026-05-01T00:00:00Z')

  return { orgA, orgB, memberA, P1, P2, P3, P4 }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nVelo scale-fixes — dry-run (${u.hostname})\n${'='.repeat(66)}`)
  await client.query('BEGIN')

  // 1. Apply the index migration → assert all 8 exist.
  await client.query(readSql('scale-indexes-migration.sql'))
  const { rows: idxRows } = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)`, [EXPECTED_INDEXES])
  const present = new Set(idxRows.map((r) => r.indexname))
  for (const name of EXPECTED_INDEXES) check(`1. index exists: ${name}`, present.has(name))
  check('1. all 8 scale indexes present', present.size === EXPECTED_INDEXES.length, `${present.size}/8`)

  // 2. Apply the view → assert security_invoker + grants.
  await client.query(readSql('patient-outstanding-balances-view.sql'))
  const { rows: optRows } = await client.query(
    `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='patient_outstanding_balances'`)
  const reloptions = optRows[0]?.reloptions || []
  check('2. view is security_invoker=on', reloptions.includes('security_invoker=true'), JSON.stringify(reloptions))

  const { rows: grantRows } = await client.query(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='patient_outstanding_balances'`)
  const byGrantee = {}
  for (const g of grantRows) (byGrantee[g.grantee] ||= new Set()).add(g.privilege_type)
  const authPrivs = [...(byGrantee['authenticated'] || [])].sort()
  check('2. authenticated = [SELECT] only',
    authPrivs.length === 1 && authPrivs[0] === 'SELECT', `authenticated=[${authPrivs.join(',')}]`)
  check('2. anon has no privilege', !byGrantee['anon'], byGrantee['anon'] ? [...byGrantee['anon']].join(',') : 'none')

  // 3. Seed.
  const { orgA, memberA, P1, P2, P3, P4 } = await seed()
  console.log(`\nseeded (rolled back): orgA=${orgA}  P1=${P1} P2=${P2} P3=${P3}  |  P4(orgB)=${P4}\n`)

  // Pull org-A rows for the JS replication (superuser sees all).
  const chA = (await client.query(
    `SELECT id, patient_id, kind, reverses_id, amount_minor, currency, created_at FROM charges WHERE org_id=$1`, [orgA])).rows
  const pmA = (await client.query(
    `SELECT id, patient_id, kind, reverses_id, amount_minor, currency FROM payments WHERE org_id=$1`, [orgA])).rows

  // 4a. RECONCILIATION — JS reduce vs the view, over identical data.
  const jsWorklist = jsGetOutstanding(chA, pmA)
  const jsMap = new Map(jsWorklist.map((w) => [w.patientId, { owed: positiveOnly(w.balances), latest: epoch(w.latestChargeAt) }]))

  const viewRows = (await client.query(
    `SELECT patient_id, currency, owed, latest_charge_at FROM patient_outstanding_balances WHERE org_id=$1`, [orgA])).rows
  const viewMap = new Map()
  for (const r of viewRows) {
    const e = viewMap.get(r.patient_id) || { owed: {}, latest: epoch(r.latest_charge_at) }
    e.owed[r.currency] = Number(r.owed)
    e.latest = epoch(r.latest_charge_at)
    viewMap.set(r.patient_id, e)
  }

  const samePatients = jsMap.size === viewMap.size && [...jsMap.keys()].every((k) => viewMap.has(k))
  check('4a. same patient set (JS reduce == view)', samePatients,
    `js=[${[...jsMap.keys()].length}] view=[${[...viewMap.keys()].length}]`)
  let owedMatch = true, latestMatch = true
  for (const [pid, js] of jsMap) {
    const v = viewMap.get(pid) || { owed: {}, latest: null }
    if (!mapsEqual(js.owed, v.owed)) owedMatch = false
    if (js.latest !== v.latest) latestMatch = false
  }
  check('4a. per-currency owed identical (JS == view)', samePatients && owedMatch)
  check('4a. latest_charge_at identical (JS == view)', samePatients && latestMatch)
  check('4a. P3 (credit) absent from BOTH', !jsMap.has(P3) && !viewMap.has(P3))

  // 4b. Voids/reversals excluded — P1 proves it (75000, not 105000/35000), and the
  //     voided LATER charge does not set latest_charge_at (stays 2026-03-01).
  const p1 = viewMap.get(P1)
  check('4b. P1 owed = {IQD:75000} (void + reversal excluded)',
    !!p1 && mapsEqual(p1.owed, { IQD: 75000 }), p1 ? JSON.stringify(p1.owed) : 'P1 absent')
  check('4b. P1 latest_charge_at = 2026-03-01 (voided later charge ignored)',
    !!p1 && p1.latest === Date.parse('2026-03-01T00:00:00Z'),
    p1 ? new Date(p1.latest).toISOString() : 'P1 absent')

  // 4c. TENANT ISOLATION via RLS sim: as an org-A member, the view returns ONLY
  //     org-A rows; org-B's P4 never appears.
  const claims = JSON.stringify({ sub: memberA, role: 'authenticated' })
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [memberA]) // cover both auth.uid() variants
  await client.query(`SET LOCAL ROLE authenticated`)
  const rlsRows = (await client.query(
    `SELECT org_id::text AS org_id, patient_id::text AS patient_id FROM patient_outstanding_balances`)).rows
  await client.query(`RESET ROLE`)

  const allOrgA = rlsRows.length > 0 && rlsRows.every((r) => r.org_id === orgA)
  const seesExpected = new Set(rlsRows.map((r) => r.patient_id))
  check('4c. RLS: org-A member sees ONLY org-A rows', allOrgA, `${rlsRows.length} rows`)
  check('4c. RLS: org-A member sees P1 + P2 (not P3)',
    seesExpected.has(P1) && seesExpected.has(P2) && !seesExpected.has(P3))
  check('4c. RLS LEAK TEST: org-B P4 never appears', !seesExpected.has(P4))
}

let runError = null
try {
  await client.connect()
  await main()
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('RESET ROLE') } catch { /* ignore */ }
  try { await client.query('ROLLBACK') } catch { /* connection may be gone */ }
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(66)}\n${results.length - failed.length}/${results.length} assertions passed. (transaction ROLLED BACK — nothing persisted)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
console.log('\nRun command (PowerShell):')
console.log('  $env:STAGING_DB_URL="postgresql://postgres:<pwd>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres"; node scratchpad/dryrun-scale-fixes.mjs')
process.exit(failed.length || runError ? 1 : 0)
