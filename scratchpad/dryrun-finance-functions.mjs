#!/usr/bin/env node
/**
 * dryrun-finance-functions.mjs — transactional (BEGIN…ROLLBACK) proof of the three
 * new billing.js Finance reads (getClinicLedgerTotals / fetchAllCharges /
 * fetchAllPayments) against the STAGING ledger, over a raw `pg` connection. Connects
 * as the direct `postgres` role (superuser bypasses RLS) and mirrors the EXACT SQL
 * each function runs — the finance_ledger_totals view query and the org-scoped joined
 * selects — then asserts the full behaviour. Everything is ROLLED BACK; nothing persists.
 *
 * The finance_ledger_totals view is already live on staging (sub-slice 1 apply); this
 * runner only READS it (plus seeds base rows the view aggregates within the txn).
 * getClinicLedgerTotals runs no WHERE (RLS scopes it); as superuser we add
 * WHERE org_id = <seeded> to reproduce exactly the rows RLS would return for that org.
 *
 * ACTIVE-ROW RULE (must match billing.js activeRows/owedByCurrency + the view):
 *   positive row counts only while its id is NOT referenced by any reverses_id;
 *   void/reversal rows never count positive. billed=Σ active charges,
 *   collected=Σ active payments, outstanding=billed−collected, per currency.
 *
 * ── Run (PowerShell, STAGING_DB_URL set, direct connection on 5432) ───────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   node scratchpad/dryrun-finance-functions.mjs
 *
 * Require-staging / reject-prod guard. Exit 0 iff every assertion passes. Always ROLLBACK.
 */
import pkg from 'pg'
const { Client } = pkg

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
function eqTotals(actual, expected) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  for (const k of keys) {
    const a = actual[k] || {}, e = expected[k] || {}
    if (Number(a.billed || 0) !== Number(e.billed || 0)) return false
    if (Number(a.collected || 0) !== Number(e.collected || 0)) return false
    if (Number(a.outstanding || 0) !== Number(e.outstanding || 0)) return false
  }
  return true
}
function isStrictlyDesc(arr) {
  for (let i = 0; i < arr.length - 1; i++) if (!(arr[i] > arr[i + 1])) return false
  return true
}

// Distinct, increasing timestamps — within one txn now() is constant, so we set
// created_at/recorded_at explicitly to make newest-first ordering testable.
const BASE = Date.now() - 1000 * 60 * 60 // 1h ago
let _tickC = 0, _tickP = 0
const nextChargeTs = () => new Date(BASE + (++_tickC) * 60000).toISOString()
const nextPayTs = () => new Date(BASE + (++_tickP) * 60000).toISOString()

// ── Seed helpers (as postgres → RLS bypassed; only FK targets must exist) ─────
async function seedOrg(tag) {
  const rand = Math.random().toString(36).slice(2, 10)
  const org = (await client.query(
    `INSERT INTO orgs (name, slug) VALUES ($1,$2) RETURNING id`, [`FINF ${tag} ${rand}`, `finf-${tag}-${rand}`],
  )).rows[0].id
  const user = (await client.query(
    `INSERT INTO auth.users (id, email, aud, role)
     VALUES (gen_random_uuid(), $1, 'authenticated', 'authenticated') RETURNING id`, [`finf-${tag}-${rand}@example.test`],
  )).rows[0].id
  await client.query(
    `INSERT INTO profiles (id, org_id, role, full_name) VALUES ($1,$2,'doctor',$3) ON CONFLICT (id) DO NOTHING`,
    [user, org, `Finf ${tag} Doctor`],
  )
  const patientName = `FINF ${tag} PATIENT ${rand}`
  const patient = (await client.query(
    `INSERT INTO patients (org_id, full_name, phone) VALUES ($1,$2,$3) RETURNING id`, [org, patientName, '+9647000000003'],
  )).rows[0].id
  return { org, user, patient, patientName }
}
async function addCharge({ org, patient, user }, amount, currency, { category = 'clinical', doctorId = user } = {}) {
  return (await client.query(
    `INSERT INTO charges (org_id, patient_id, doctor_id, kind, category, description, amount_minor, currency, created_by, created_at)
     VALUES ($1,$2,$3,'charge',$4,'seed charge',$5,$6,$7,$8) RETURNING id`,
    [org, patient, doctorId, category, amount, currency, user, nextChargeTs()],
  )).rows[0].id
}
async function voidCharge({ org, patient, user }, chargeId, amount, currency) {
  await client.query(
    `INSERT INTO charges (org_id, patient_id, treatment_plan_item_id, doctor_id, kind, category, reverses_id, description, amount_minor, currency, created_by, created_at)
     VALUES ($1,$2,NULL,$3,'void','clinical',$4,'seed void',$5,$6,$3,$7)`,
    [org, patient, user, chargeId, amount, currency, nextChargeTs()],
  )
}
async function addPayment({ org, patient, user }, amount, currency) {
  return (await client.query(
    `INSERT INTO payments (org_id, patient_id, amount_minor, currency, method, recorded_by, kind, recorded_at)
     VALUES ($1,$2,$3,$4,'cash',$5,'payment',$6) RETURNING id`,
    [org, patient, amount, currency, user, nextPayTs()],
  )).rows[0].id
}
async function reversePayment({ org, patient, user }, paymentId, amount, currency) {
  await client.query(
    `INSERT INTO payments (org_id, patient_id, kind, reverses_id, amount_minor, currency, method, recorded_by, recorded_at)
     VALUES ($1,$2,'reversal',$3,$4,$5,'cash',$6,$7)`,
    [org, patient, paymentId, amount, currency, user, nextPayTs()],
  )
}

// ── Mirrors of the three billing.js functions ────────────────────────────────
// getClinicLedgerTotals: SELECT currency,billed,collected,outstanding FROM the view.
// (fn has no WHERE — RLS scopes it; as superuser we add org_id to get the same rows.)
async function clinicTotals(org) {
  const rows = (await client.query(
    `SELECT currency, billed, collected, outstanding
       FROM public.finance_ledger_totals WHERE org_id = $1 ORDER BY currency`, [org],
  )).rows
  const out = {}
  for (const r of rows) out[r.currency] = { billed: Number(r.billed), collected: Number(r.collected), outstanding: Number(r.outstanding) }
  return out
}
// fetchAllCharges: *, patient join, doctor join · WHERE org_id · ORDER created_at DESC · LIMIT.
async function fetchAllCharges(org) {
  return (await client.query(
    `SELECT c.id, c.kind, c.reverses_id, c.category, c.amount_minor, c.currency, c.created_at,
            pt.full_name AS patient_name, dr.full_name AS doctor_name
       FROM charges c
       LEFT JOIN patients pt ON pt.id = c.patient_id
       LEFT JOIN profiles dr ON dr.id = c.doctor_id
      WHERE c.org_id = $1 ORDER BY c.created_at DESC LIMIT 500`, [org],
  )).rows
}
// fetchAllPayments: *, patient join · WHERE org_id · ORDER recorded_at DESC · LIMIT.
async function fetchAllPayments(org) {
  return (await client.query(
    `SELECT p.id, p.kind, p.reverses_id, p.amount_minor, p.currency, p.method, p.recorded_at,
            pt.full_name AS patient_name
       FROM payments p LEFT JOIN patients pt ON pt.id = p.patient_id
      WHERE p.org_id = $1 ORDER BY p.recorded_at DESC LIMIT 500`, [org],
  )).rows
}
// Re-net the fetched rows by the active-row rule — the SECOND, independent path to
// the same totals (cross-check #4).
function reconcile(charges, payments) {
  const revC = new Set(charges.filter(r => r.reverses_id).map(r => r.reverses_id))
  const revP = new Set(payments.filter(r => r.reverses_id).map(r => r.reverses_id))
  const out = {}
  const slot = (cur) => (out[cur] ||= { billed: 0, collected: 0, outstanding: 0 })
  for (const c of charges) if (c.kind === 'charge' && !revC.has(c.id)) slot(c.currency).billed += Number(c.amount_minor)
  for (const p of payments) if (p.kind === 'payment' && !revP.has(p.id)) slot(p.currency).collected += Number(p.amount_minor)
  for (const cur of Object.keys(out)) out[cur].outstanding = out[cur].billed - out[cur].collected
  return out
}

// IQD: charge 100000 active; charge 30000 VOIDED. payment 40000 active; payment 25000 REVERSED.
// USD: charge 50000 (product, no doctor) active; payment 20000 active.
const EXP = {
  IQD: { billed: 100000, collected: 40000, outstanding: 60000 },
  USD: { billed: 50000, collected: 20000, outstanding: 30000 },
}

async function main() {
  console.log(`\nFinance functions dry-run — 3 billing.js reads (${u.hostname})\n${'='.repeat(66)}`)
  await client.query('BEGIN')

  const org1 = await seedOrg('ORG1')
  await addCharge(org1, 100000, 'IQD')                                  // active
  const cVoid = await addCharge(org1, 30000, 'IQD')                     // will be voided
  await voidCharge(org1, cVoid, 30000, 'IQD')
  await addCharge(org1, 50000, 'USD', { category: 'product', doctorId: null }) // active, non-clinical
  await addPayment(org1, 40000, 'IQD')                                  // active
  const pRev = await addPayment(org1, 25000, 'IQD')                     // will be reversed
  await reversePayment(org1, pRev, 25000, 'IQD')
  await addPayment(org1, 20000, 'USD')                                  // active
  console.log(`seeded (rolled back): org=${org1.org} patient="${org1.patientName}"\n`)

  // ── 1. getClinicLedgerTotals ──
  const tot = await clinicTotals(org1.org)
  check('1. getClinicLedgerTotals: per-currency billed/collected/outstanding correct', eqTotals(tot, EXP), JSON.stringify(tot))
  check('1b. voided charge EXCLUDED from billed (IQD 100000, not 130000)', tot.IQD?.billed === 100000, `IQD.billed=${tot.IQD?.billed}`)
  check('1c. reversed payment EXCLUDED from collected (IQD 40000, not 65000)', tot.IQD?.collected === 40000, `IQD.collected=${tot.IQD?.collected}`)
  check('1d. IQD and USD separate, never blended', Object.keys(tot).sort().join(',') === 'IQD,USD', `currencies=[${Object.keys(tot).join(', ')}]`)

  // ── 2. fetchAllCharges ──
  const ch = await fetchAllCharges(org1.org)
  check('2a. returns all 4 org charge rows (incl. the void)', ch.length === 4, `n=${ch.length}`)
  check('2b. includes a kind=void row (UI renders struck)', ch.some(r => r.kind === 'void'))
  check('2c. category surfaced on every row, incl. the product charge', ch.every(r => r.category) && ch.some(r => r.category === 'product'),
    `categories=[${[...new Set(ch.map(r => r.category))].join(', ')}]`)
  check('2d. patientName surfaced on every row', ch.every(r => r.patient_name === org1.patientName))
  check('2e. newest-first (created_at strictly descending)', isStrictlyDesc(ch.map(r => r.created_at)))

  // ── 3. fetchAllPayments ──
  const pm = await fetchAllPayments(org1.org)
  check('3a. surfaces kind — both payment and reversal rows present', pm.some(r => r.kind === 'payment') && pm.some(r => r.kind === 'reversal'))
  const rev = pm.find(r => r.kind === 'reversal')
  check('3b. reversal row AND its reversed original BOTH returned (old fetchPaymentsWithJoins could not — it omitted kind)',
    !!rev && !!rev.reverses_id && pm.some(r => r.id === rev.reverses_id), `reversal.reversesId=${rev?.reverses_id}`)
  check('3c. newest-first (recorded_at strictly descending)', isStrictlyDesc(pm.map(r => r.recorded_at)))

  // ── 4. cross-check: totals reconcile two ways ──
  const recon = reconcile(ch, pm)
  check('4. getClinicLedgerTotals reconciles with netting fetchAllCharges/fetchAllPayments (same number two ways)',
    eqTotals(tot, recon), `view=${JSON.stringify(tot)} recon=${JSON.stringify(recon)}`)
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
