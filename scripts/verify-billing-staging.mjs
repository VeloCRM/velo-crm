#!/usr/bin/env node
/**
 * verify-billing-staging.mjs — end-to-end staging verification of the V1.5
 * Slice 2 billing data layer (src/lib/billing.js) against the append-only
 * charges/payments ledger shipped in scripts/billing-charges-payments-migration.sql
 * (LIVE on the staging clone, ref dujnbboyeugrisgewnqu).
 *
 * WHAT IT PROVES (design §2–§6 + the migration's append-only lock)
 *   1. createCharge      — a doctor bills; the row is stamped + audited.
 *   2. getPatientBalance — owed derived per-currency, IQD and USD NEVER blended.
 *   3. recordPayment     — a collection nets the balance down.
 *   4. append-only lock   — a clinic user's UPDATE/DELETE on payments is REJECTED
 *                          at the DB (REVOKE UPDATE,DELETE), not by convention.
 *   5. operator-only gate — voidCharge/reversePayment refuse for a clinic user
 *                          both at the client (requireOperator) AND at the DB
 *                          (RLS: a doctor's raw kind='void' insert is rejected).
 *   6. voidCharge         — operator appends a void; the charge nets out.
 *   7. reversePayment     — operator appends a reversal; the payment nets out.
 *   8. getOutstandingCollections — the patient surfaces on the reception worklist.
 *   9. audit trail        — one audit_log row per mutation.
 *
 * HOW IT EXERCISES THE REAL CODE (not a re-implementation)
 *   - A load hook (./_vite-env-loader.mjs) rewrites supabase.js's import.meta.env
 *     reads so billing.js imports unmodified under Node.
 *   - A minimal window/localStorage shim mirrors the operator UI: getCurrentOrgId()
 *     resolves an operator's effective org from the `velo_impersonating` key, and
 *     supabase-js gets a defined-but-non-browser global (no detectSessionInUrl).
 *   - Identity is switched by real signOut/signInWithPassword on the shared anon
 *     singleton — the same client billing.js holds — so every call goes through
 *     RLS exactly as the browser would. Corrections run under the operator + an
 *     impersonation context pointed at the doctor's org.
 *
 * SETUP / TEARDOWN use a SEPARATE service-role client (never the singleton):
 * it creates a fresh throwaway patient and, because clinic users cannot delete
 * append-only rows, tears the ledger + patient down at the end (service_role
 * retains ALL). Teardown is best-effort and never flips the verdict.
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   Put these in scripts/.env.staging.local (gitignored) or export them:
 *     STAGING_SUPABASE_URL=https://dujnbboyeugrisgewnqu.supabase.co
 *     STAGING_SUPABASE_ANON_KEY=...            # client path (RLS)
 *     STAGING_SUPABASE_SERVICE_ROLE_KEY=...    # setup/teardown ONLY, server-side
 *     STAGING_DOCTOR_EMAIL=...                 # a role=doctor|owner clinic user
 *     STAGING_DOCTOR_PASSWORD=...
 *     STAGING_OPERATOR_EMAIL=...               # a row in the `operators` table
 *     STAGING_OPERATOR_PASSWORD=...
 *   Then:
 *     node scripts/verify-billing-staging.mjs
 *
 * Refuses to run against the production ref (aajwuwjxpmmqcwhiynla). Exit 0 iff
 * every check passes, else 1.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { register } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla' // never touch production

// ── 1. Resolve config from env, falling back to .env.staging.local / .env.local
const REQUIRED = [
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_ANON_KEY',
  'STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'STAGING_DOCTOR_EMAIL',
  'STAGING_DOCTOR_PASSWORD',
  'STAGING_OPERATOR_EMAIL',
  'STAGING_OPERATOR_PASSWORD',
]

function loadEnvFile(fileName, keys) {
  const p = path.join(__dirname, fileName)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && keys.includes(m[1]) && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
}
loadEnvFile('.env.staging.local', REQUIRED)
loadEnvFile('.env.local', REQUIRED)

const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length) {
  console.error('Missing required env var(s):\n  ' + missing.join('\n  '))
  console.error('\nSet them in scripts/.env.staging.local (gitignored) or export them. See the header of this file.')
  process.exit(1)
}

const URL = process.env.STAGING_SUPABASE_URL
if (URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_SUPABASE_URL points at the production ref (${PROD_REF}).`)
  console.error('This runner writes + tears down data. Point it at the staging clone only.')
  process.exit(1)
}

// ── 2. Shims — must be in place BEFORE supabase.js / billing.js are imported.
//    window: defined (so getImpersonationContext runs) but NOT a browser (no
//    document) → supabase-js treats it as server, skips detectSessionInUrl.
//    localStorage: backs getImpersonationContext's velo_impersonating read.
const _lsStore = new Map()
globalThis.localStorage = {
  getItem: (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem: (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear: () => _lsStore.clear(),
}
// No `document` → supabase-js isBrowser() stays false (skips detectSessionInUrl);
// `location.href` is a harmless stub in case any unguarded read reaches for it.
globalThis.window = { localStorage: globalThis.localStorage, location: { href: '' } }

// ── 3. Register the env load-hook, then dynamically import the REAL data layer.
register('./_vite-env-loader.mjs', import.meta.url)
const { supabase } = await import('../src/lib/supabase.js')
const { clearOrgIdCache } = await import('../src/lib/auth_session.js')
const billing = await import('../src/lib/billing.js')

if (!supabase) {
  console.error('supabase singleton is null — the env shim did not take. Check STAGING_SUPABASE_URL/ANON_KEY.')
  process.exit(1)
}

// Separate service-role client for setup/teardown (bypasses RLS + append-only).
const svc = createClient(URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Test harness ─────────────────────────────────────────────────────────────
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
    const ok = !matchStr || msg.toLowerCase().includes(matchStr.toLowerCase())
    check(name, ok, ok ? `rejected: ${msg}` : `rejected, but not with "${matchStr}": ${msg}`)
  }
}
function balancesEqual(actual, expected) {
  const a = actual || {}
  const keys = new Set([...Object.keys(a), ...Object.keys(expected)])
  for (const k of keys) if (Number(a[k] || 0) !== Number(expected[k] || 0)) return false
  return true
}

async function signInAs(email, password, label) {
  await supabase.auth.signOut().catch(() => {})
  clearOrgIdCache()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in as ${label} failed: ${error.message}`)
  return data.user
}
function setImpersonation(orgId, effectiveUserId) {
  globalThis.localStorage.setItem('velo_impersonating', JSON.stringify({ orgId, orgName: 'staging-verify', effectiveUserId }))
}
function clearImpersonation() {
  globalThis.localStorage.removeItem('velo_impersonating')
  clearOrgIdCache()
}

// ── Money fixtures (IQD = whole dinars, divisor 1; USD = cents) ───────────────
const IQD_CHARGE = 60000 // 60,000 IQD
const USD_CHARGE = 5000 // $50.00
const IQD_PAYMENT = 20000 // 20,000 IQD

// State captured across phases (for assertions + teardown).
let doctorId = null
let orgId = null
let patientId = null
let iqdChargeId = null
let usdChargeId = null
let iqdPaymentId = null
const auditEntityIds = []

async function main() {
  console.log(`\nVelo billing — staging verification (${URL})\n${'='.repeat(60)}`)

  // ── SETUP ──────────────────────────────────────────────────────────────────
  const doctor = await signInAs(process.env.STAGING_DOCTOR_EMAIL, process.env.STAGING_DOCTOR_PASSWORD, 'doctor')
  doctorId = doctor.id
  clearImpersonation()

  const { data: prof, error: profErr } = await supabase
    .from('profiles').select('org_id, role').eq('id', doctorId).maybeSingle()
  if (profErr) throw new Error(`could not read doctor profile: ${profErr.message}`)
  if (!prof?.org_id) throw new Error('doctor profile has no org_id')
  orgId = prof.org_id
  check('doctor can bill (role is doctor|owner)', ['doctor', 'owner'].includes(prof.role), `role=${prof.role}`)

  const stamp = new Date().toISOString()
  const { data: pt, error: ptErr } = await svc
    .from('patients')
    .insert({ org_id: orgId, full_name: `BILLING VERIFY ${stamp}`, phone: '+9647000000000', primary_doctor_id: doctorId })
    .select('id, full_name, phone').single()
  if (ptErr) throw new Error(`service-role could not create test patient: ${ptErr.message}`)
  patientId = pt.id
  console.log(`setup: test patient ${patientId} in org ${orgId}\n`)

  // ── PHASE A — clinic doctor: bill, collect, derive ──────────────────────────
  const c1 = await billing.createCharge({ patientId, doctorId, description: 'Verify: crown', amountMinor: IQD_CHARGE, currency: 'IQD' })
  iqdChargeId = c1.id; auditEntityIds.push(c1.id)
  check('createCharge (IQD) returns a stamped charge', c1.kind === 'charge' && c1.amountMinor === IQD_CHARGE && c1.currency === 'IQD', `id=${c1.id}`)

  const c2 = await billing.createCharge({ patientId, doctorId, description: 'Verify: whitening', amountMinor: USD_CHARGE, currency: 'USD' })
  usdChargeId = c2.id; auditEntityIds.push(c2.id)
  check('createCharge (USD) returns a stamped charge', c2.kind === 'charge' && c2.amountMinor === USD_CHARGE && c2.currency === 'USD', `id=${c2.id}`)

  const b1 = await billing.getPatientBalance(patientId)
  check('getPatientBalance derives per-currency, unblended', balancesEqual(b1, { IQD: IQD_CHARGE, USD: USD_CHARGE }), JSON.stringify(b1))

  const p1 = await billing.recordPayment({ patientId, amountMinor: IQD_PAYMENT, currency: 'IQD', method: 'cash' })
  iqdPaymentId = p1.id; auditEntityIds.push(p1.id)
  check('recordPayment records a collection', p1.amountMinor === IQD_PAYMENT && p1.currency === 'IQD', `id=${p1.id}`)

  const b2 = await billing.getPatientBalance(patientId)
  check('payment nets the IQD balance down (USD untouched)', balancesEqual(b2, { IQD: IQD_CHARGE - IQD_PAYMENT, USD: USD_CHARGE }), JSON.stringify(b2))

  // ── PHASE B — append-only + operator-only gates (as the clinic doctor) ───────
  await expectReject('append-only: doctor UPDATE on payments is rejected',
    async () => { const { error } = await supabase.from('payments').update({ notes: 'tamper' }).eq('id', iqdPaymentId); if (error) throw new Error(error.message) },
    'permission')
  await expectReject('append-only: doctor DELETE on payments is rejected',
    async () => { const { error } = await supabase.from('payments').delete().eq('id', iqdPaymentId); if (error) throw new Error(error.message) },
    'permission')

  await expectReject('client gate: doctor voidCharge is refused', () => billing.voidCharge(usdChargeId, 'nope'), 'operator')
  await expectReject('client gate: doctor reversePayment is refused', () => billing.reversePayment(iqdPaymentId, 'nope'), 'operator')

  await expectReject('DB gate: doctor raw kind=void insert is RLS-rejected',
    async () => {
      const { error } = await supabase.from('charges').insert({
        org_id: orgId, patient_id: patientId, doctor_id: doctorId, kind: 'void',
        reverses_id: usdChargeId, description: 'raw void attempt', amount_minor: 1, currency: 'USD', created_by: doctorId,
      }).select()
      if (error) throw new Error(error.message)
    })

  // ── PHASE C — operator corrections (void + reversal), via impersonation ──────
  const operator = await signInAs(process.env.STAGING_OPERATOR_EMAIL, process.env.STAGING_OPERATOR_PASSWORD, 'operator')
  setImpersonation(orgId, doctorId) // effective org + effective_user for audit
  clearOrgIdCache()

  const v = await billing.voidCharge(usdChargeId, 'Verify: wrong currency')
  auditEntityIds.push(v.id)
  check('voidCharge appends a void referencing the charge', v.kind === 'void' && v.reversesId === usdChargeId, `id=${v.id}`)

  const b3 = await billing.getPatientBalance(patientId)
  check('void nets the USD charge out (IQD unchanged)', balancesEqual(b3, { IQD: IQD_CHARGE - IQD_PAYMENT }) && !('USD' in (b3 || {})), JSON.stringify(b3))

  const r = await billing.reversePayment(iqdPaymentId, 'Verify: keyed wrong')
  auditEntityIds.push(r.id)
  check('reversePayment appends a reversal referencing the payment', r.kind === 'reversal' && r.reversesId === iqdPaymentId, `id=${r.id}`)

  const b4 = await billing.getPatientBalance(patientId)
  check('reversal restores the IQD balance to the full charge', balancesEqual(b4, { IQD: IQD_CHARGE }), JSON.stringify(b4))

  // ── PHASE D — clinic read path: reception worklist ───────────────────────────
  await signInAs(process.env.STAGING_DOCTOR_EMAIL, process.env.STAGING_DOCTOR_PASSWORD, 'doctor')
  clearImpersonation()
  const worklist = await billing.getOutstandingCollections()
  const mine = worklist.find((w) => w.patientId === patientId)
  check('getOutstandingCollections surfaces the owing patient',
    !!mine && balancesEqual(mine.balances, { IQD: IQD_CHARGE }) && mine.fullName.startsWith('BILLING VERIFY'),
    mine ? JSON.stringify(mine.balances) : 'patient not in worklist')

  // ── PHASE E — audit trail (service-role read) ────────────────────────────────
  const { data: auditRows, error: auditErr } = await svc
    .from('audit_log')
    .select('action, entity_id')
    .in('entity_id', auditEntityIds)
    .in('action', ['charge.create', 'payment.create', 'charge.void', 'payment.reverse'])
  if (auditErr) {
    check('audit trail: one row per mutation', false, auditErr.message)
  } else {
    check('audit trail: one row per mutation', (auditRows?.length || 0) >= auditEntityIds.length,
      `${auditRows?.length || 0} audit rows for ${auditEntityIds.length} mutations`)
  }
}

async function teardown() {
  if (!patientId) return
  console.log(`\nteardown: removing test ledger + patient ${patientId} (service-role)`)
  try {
    // reversal/void rows first (self-FK RESTRICT), then base rows, then patient.
    await svc.from('payments').delete().eq('patient_id', patientId).eq('kind', 'reversal')
    await svc.from('payments').delete().eq('patient_id', patientId).eq('kind', 'payment')
    await svc.from('charges').delete().eq('patient_id', patientId).eq('kind', 'void')
    await svc.from('charges').delete().eq('patient_id', patientId).eq('kind', 'charge')
    await svc.from('audit_log').delete().in('entity_id', auditEntityIds)
    const { error } = await svc.from('patients').delete().eq('id', patientId)
    if (error) console.warn(`  ! patient delete warning: ${error.message}`)
    else console.log('  teardown complete.')
  } catch (e) {
    console.warn(`  ! teardown warning (non-fatal): ${e?.message || e}`)
  }
}

let runError = null
try {
  await main()
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  await teardown()
  await supabase.auth.signOut().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(60)}\n${results.length - failed.length}/${results.length} checks passed.`)
if (failed.length) {
  console.log('FAILED:\n  ' + failed.map((f) => f.name).join('\n  '))
}
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
