#!/usr/bin/env node
/**
 * dryrun-billing-slice2.mjs — transactional (BEGIN…ROLLBACK) proof of the V1.5
 * Slice 2 billing LOGIC against the staging charges/payments ledger, over a raw
 * `pg` connection. No auth, no RLS: connects as the direct `postgres` role
 * (superuser bypasses RLS) and mirrors the EXACT SQL that src/lib/billing.js's
 * functions run — the inserts + the active-row balance query — then asserts the
 * full lifecycle. Everything runs inside one transaction and is ROLLED BACK, so
 * nothing persists on staging.
 *
 * Note: there was no pre-existing `dryrun-billing-slice1.mjs` in the repo to
 * extend — this implements the machinery it describes (discrete-field pg
 * connection, prod-ref abort guard, self-seed org→auth.users→profile→patient,
 * BEGIN…ROLLBACK) from scratch, matching the Slice-1 "active row" rule.
 *
 * ACTIVE-ROW RULE (must match billing.js activeRows/owedByCurrency exactly):
 *   A positive row (kind 'charge'/'payment') counts toward owed ONLY while its
 *   id is NOT referenced by any reverses_id. void/reversal rows never count as
 *   positive. owed(CUR) = Σ(active charges) − Σ(active payments), per currency,
 *   never blended. A currency with no active rows is ABSENT from the result.
 *
 * ── Run (PowerShell, STAGING_DB_URL set, direct connection on 5432) ───────────
 *   node scripts/dryrun-billing-slice2.mjs
 *   (expects STAGING_DB_URL=postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres)
 *
 * Refuses to run against the production ref (aajwuwjxpmmqcwhiynla). Exit 0 iff
 * every assertion passes, else 1. The transaction is always rolled back.
 */
import pkg from 'pg'
const { Client } = pkg

const PROD_REF = 'aajwuwjxpmmqcwhiynla'

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
async function expectReject(name, fn, matchStr) {
  try {
    await fn()
    check(name, false, 'expected a rejection, but it succeeded')
  } catch (e) {
    const msg = e?.message || String(e)
    const ok = !matchStr || msg.includes(matchStr)
    check(name, ok, ok ? `rejected: ${msg}` : `rejected, but not with "${matchStr}": ${msg}`)
  }
}
function balancesEqual(actual, expected) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  for (const k of keys) if (Number(actual[k] || 0) !== Number(expected[k] || 0)) return false
  return true
}

// ── SQL mirrors of billing.js ─────────────────────────────────────────────────

// getPatientBalance = activeRows + owedByCurrency, expressed in one query.
async function getPatientBalance(patientId) {
  const { rows } = await client.query(
    `WITH ac AS (
       SELECT currency, amount_minor FROM charges c
        WHERE c.patient_id = $1 AND c.kind = 'charge'
          AND NOT EXISTS (SELECT 1 FROM charges r WHERE r.reverses_id = c.id)),
     ap AS (
       SELECT currency, amount_minor FROM payments p
        WHERE p.patient_id = $1 AND p.kind = 'payment'
          AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id = p.id)),
     owed AS (
       SELECT currency, SUM(amount_minor) AS amt FROM ac GROUP BY currency
       UNION ALL
       SELECT currency, -SUM(amount_minor)      FROM ap GROUP BY currency)
     SELECT currency, SUM(amt)::bigint AS owed FROM owed GROUP BY currency`,
    [patientId],
  )
  const m = {}
  for (const r of rows) m[r.currency] = Number(r.owed)
  return m
}

// getOutstandingCollections filter: patient present iff any currency owed > 0.
async function isOnWorklist(orgId, patientId) {
  const { rows } = await client.query(
    `WITH ac AS (
       SELECT patient_id, currency, amount_minor FROM charges c
        WHERE c.org_id = $1 AND c.kind = 'charge'
          AND NOT EXISTS (SELECT 1 FROM charges r WHERE r.reverses_id = c.id)),
     ap AS (
       SELECT patient_id, currency, amount_minor FROM payments p
        WHERE p.org_id = $1 AND p.kind = 'payment'
          AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id = p.id)),
     owed AS (
       SELECT patient_id, currency, SUM(amount_minor) AS amt FROM ac GROUP BY patient_id, currency
       UNION ALL
       SELECT patient_id, currency, -SUM(amount_minor)      FROM ap GROUP BY patient_id, currency),
     bal AS (SELECT patient_id, currency, SUM(amt) AS owed FROM owed GROUP BY patient_id, currency)
     SELECT patient_id FROM bal GROUP BY patient_id
      HAVING SUM(CASE WHEN owed > 0 THEN 1 ELSE 0 END) > 0`,
    [orgId],
  )
  return rows.some((r) => r.patient_id === patientId)
}

async function createCharge(orgId, patientId, doctorId, description, amountMinor, currency) {
  const { rows } = await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, description, amount_minor, currency, created_by)
     VALUES ($1, $2, $3, 'charge', $4, $5, $6, $3) RETURNING id`,
    [orgId, patientId, doctorId, description, amountMinor, currency],
  )
  return rows[0].id
}

async function recordPayment(orgId, patientId, doctorId, amountMinor, currency) {
  const { rows } = await client.query(
    `INSERT INTO payments (org_id, patient_id, amount_minor, currency, method, recorded_by, kind)
     VALUES ($1, $2, $3, $4, 'cash', $5, 'payment') RETURNING id`,
    [orgId, patientId, amountMinor, currency, doctorId],
  )
  return rows[0].id
}

// Mirrors billing.js reversePayment: look up the original, GUARD kind==='payment',
// then append a reversal mirroring the original.
async function reversePayment(orgId, paymentId) {
  const { rows } = await client.query(
    `SELECT patient_id, amount_minor, currency, method, recorded_by, kind
       FROM payments WHERE id = $1 AND org_id = $2`,
    [paymentId, orgId],
  )
  if (!rows.length) throw new Error('reversePayment: original payment not found')
  const o = rows[0]
  if (o.kind !== 'payment') throw new Error(`reversePayment: can only reverse a payment row (got kind='${o.kind}')`)
  const ins = await client.query(
    `INSERT INTO payments (org_id, patient_id, kind, reverses_id, amount_minor, currency, method, recorded_by)
     VALUES ($1, $2, 'reversal', $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, o.patient_id, paymentId, o.amount_minor, o.currency, o.method || 'other', o.recorded_by],
  )
  return ins.rows[0].id
}

// Mirrors billing.js voidCharge: look up the original, GUARD kind==='charge',
// then append a void mirroring the original.
async function voidCharge(orgId, chargeId) {
  const { rows } = await client.query(
    `SELECT patient_id, doctor_id, amount_minor, currency, created_by, kind
       FROM charges WHERE id = $1 AND org_id = $2`,
    [chargeId, orgId],
  )
  if (!rows.length) throw new Error('voidCharge: original charge not found')
  const o = rows[0]
  if (o.kind !== 'charge') throw new Error(`voidCharge: can only void a charge row (got kind='${o.kind}')`)
  const ins = await client.query(
    `INSERT INTO charges (org_id, patient_id, treatment_plan_item_id, doctor_id, kind, reverses_id, description, amount_minor, currency, created_by)
     VALUES ($1, $2, NULL, $3, 'void', $4, 'Voided charge', $5, $6, $7) RETURNING id`,
    [orgId, o.patient_id, o.doctor_id, chargeId, o.amount_minor, o.currency, o.created_by],
  )
  return ins.rows[0].id
}

// ── Seed (inside the txn): org → auth.users → profile → patient ───────────────
async function seed() {
  const rand = Math.random().toString(36).slice(2, 10)
  const org = (await client.query(
    `INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id`,
    [`VERIFY ORG ${rand}`, `verify-${rand}`],
  )).rows[0].id
  const doctor = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`,
    [`verify-${rand}@example.test`],
  )).rows[0].id
  // Tolerate a possible auth→profile trigger; role is irrelevant to the balance
  // logic (RLS is bypassed here), only the FK target must exist.
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name)
     VALUES ($1, $2, 'doctor', 'Verify Doctor') ON CONFLICT (id) DO NOTHING`,
    [doctor, org],
  )
  const patient = (await client.query(
    `INSERT INTO patients (org_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [org, `VERIFY PATIENT ${rand}`, '+9647000000000'],
  )).rows[0].id
  return { org, doctor, patient }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nVelo billing Slice 2 — logic dry-run (${u.hostname})\n${'='.repeat(64)}`)
  await client.query('BEGIN')

  const { org, doctor, patient } = await seed()
  console.log(`seeded (rolled back at end): org=${org} patient=${patient}\n`)

  const c1 = await createCharge(org, patient, doctor, 'Crown', 100000, 'IQD')
  check('1. createCharge 100000 IQD → {IQD:100000}', balancesEqual(await getPatientBalance(patient), { IQD: 100000 }))

  const p1 = await recordPayment(org, patient, doctor, 40000, 'IQD')
  check('2. recordPayment 40000 IQD → {IQD:60000}', balancesEqual(await getPatientBalance(patient), { IQD: 60000 }))

  const c2 = await createCharge(org, patient, doctor, 'Whitening', 50000, 'USD')
  const b3 = await getPatientBalance(patient)
  check('3. createCharge 50000 USD → {IQD:60000, USD:50000} (separate, not blended)', balancesEqual(b3, { IQD: 60000, USD: 50000 }))

  const r1 = await reversePayment(org, p1)
  check('4. reversePayment(40000) → {IQD:100000, USD:50000} (payment undone)', balancesEqual(await getPatientBalance(patient), { IQD: 100000, USD: 50000 }))

  const v1 = await voidCharge(org, c1)
  const b5 = await getPatientBalance(patient)
  check('5. voidCharge(IQD charge) → IQD drops out → {USD:50000}', balancesEqual(b5, { USD: 50000 }) && !('IQD' in b5), JSON.stringify(b5))

  check('6a. worklist INCLUDES patient while owed>0 (USD:50000)', await isOnWorklist(org, patient))

  const v2 = await voidCharge(org, c2) // settle everything → owed 0 in every currency
  const b6 = await getPatientBalance(patient)
  check('6b. after voiding all charges (owed 0) → worklist EXCLUDES patient',
    !(await isOnWorklist(org, patient)) && Object.values(b6).every((v) => v <= 0), JSON.stringify(b6))

  await expectReject('7a. reversing a reversal row is rejected', () => reversePayment(org, r1), "kind='reversal'")
  await expectReject('7b. voiding a void row is rejected', () => voidCharge(org, v1), "kind='void'")

  void v2 // silence unused-var lint; the void's effect is asserted in 6b
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

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(64)}\n${results.length - failed.length}/${results.length} assertions passed. (transaction ROLLED BACK — nothing persisted)`)
if (failed.length) console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
