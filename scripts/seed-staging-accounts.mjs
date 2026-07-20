#!/usr/bin/env node
/**
 * seed-staging-accounts.mjs — provision the staging test identities + fixture
 * data needed to screenshot-verify the V1.5 billing UI (operator-only reversal).
 *
 * PERSISTS (these are fixtures staging keeps). Service-role, STAGING-ONLY
 * (aborts on the production ref), and IDEMPOTENT — re-running upserts/skips,
 * never duplicates.
 *
 * Creates:
 *   1. Org "Staging Test Clinic" (name + slug), reused by slug on re-run.
 *   2. OWNER account — auth user (Admin API) + profiles(role='owner', org_id).
 *   3. OPERATOR account — auth user (Admin API) + operators(user_id). No profile
 *      (operators have no clinic profile — matches the SupCod3 model).
 *   4. DOCTOR account — auth user (Admin API) + profiles(role='doctor', org_id).
 *      Permanent role-testing identity ("Dr. Staging Doctor").
 *   5. A test PATIENT in the org (full_name + phone).
 *   6. TWO ledger payments on that patient (kind='payment'): 40000 IQD + 25000 USD
 *      — so the UI has a live payment to reverse AND a multi-currency total to
 *      check netting.
 *   7. TWO clinical CHARGES on that patient attributed to the DOCTOR
 *      (charges.doctor_id = doctor, kind='charge', category='clinical') — so the
 *      "Production by doctor" report (per_doctor_production RPC) has live data
 *      for this doctor to render.
 *
 * Auth users are created via the Admin API (correct password hashing so the
 * accounts can actually log in); on re-run the fixture password is re-set so the
 * printed creds always work. Profiles are select-then-insert-if-missing, which
 * sidesteps the profiles BEFORE-UPDATE immutable trigger (INSERT never fires it).
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   Needs (env or scripts/.env.staging.local):
 *     STAGING_SUPABASE_URL=https://dujnbboyeugrisgewnqu.supabase.co
 *     STAGING_SUPABASE_SERVICE_ROLE_KEY=...     # server-side only
 *   Then:
 *     node scripts/seed-staging-accounts.mjs
 *
 * Prints a block to paste into scripts/.env.staging.local with both accounts'
 * creds + the created org/patient ids. Exit 0 on success.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_REF = 'aajwuwjxpmmqcwhiynla'

// ── Fixture constants (stable → idempotent lookups + reusable creds) ──────────
const ORG_NAME = 'Staging Test Clinic'
const ORG_SLUG = 'staging-test-clinic'
const OWNER_EMAIL = 'owner@staging.velo.test'
const OWNER_PASSWORD = 'Velo-Staging-Owner-2026'
const OPERATOR_EMAIL = 'operator@staging.velo.test'
const OPERATOR_PASSWORD = 'Velo-Staging-Operator-2026'
const DOCTOR_EMAIL = 'doctor@staging.velo.test'
const DOCTOR_PASSWORD = 'Velo-Staging-Doctor-2026'
const DOCTOR_NAME = 'Dr. Staging Doctor'
const PATIENT_NAME = 'Staging Test Patient'
const PATIENT_PHONE = '+9647510000000'
const PAYMENTS = [
  { amount_minor: 40000, currency: 'IQD', method: 'cash' },
  { amount_minor: 25000, currency: 'USD', method: 'fib' },
]
// Clinical charges attributed to the doctor (charges.doctor_id) so the
// per_doctor_production report has data. category='clinical' → doctor_id required.
const CHARGES = [
  { amount_minor: 150000, currency: 'IQD', description: 'Composite filling — upper right' },
  { amount_minor: 90000, currency: 'IQD', description: 'Scaling & polishing' },
]

// ── Config ────────────────────────────────────────────────────────────────────
const REQUIRED = ['STAGING_SUPABASE_URL', 'STAGING_SUPABASE_SERVICE_ROLE_KEY']
function loadEnvFile(fileName) {
  const p = path.join(__dirname, fileName)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && REQUIRED.includes(m[1]) && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
}
loadEnvFile('.env.staging.local')
loadEnvFile('.env.local')

const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length) {
  console.error('Missing required env var(s):\n  ' + missing.join('\n  '))
  console.error('\nSet them in scripts/.env.staging.local (gitignored) or export them.')
  process.exit(1)
}
const URL = process.env.STAGING_SUPABASE_URL
if (URL.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: STAGING_SUPABASE_URL points at the production ref (${PROD_REF}).`)
  process.exit(1)
}

const sb = createClient(URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const admin = sb.auth.admin

// ── Auth users (Admin API) ────────────────────────────────────────────────────
async function findUserByEmail(email) {
  const perPage = 1000
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < perPage) break
  }
  return null
}

async function ensureAuthUser(email, password, label) {
  const created = await admin.createUser({ email, password, email_confirm: true })
  if (!created.error && created.data?.user) return { id: created.data.user.id, created: true }
  // Already exists (or a transient conflict) — locate it, then re-set the fixture
  // password so the printed creds stay valid across re-runs.
  const existing = await findUserByEmail(email)
  if (!existing) throw new Error(`${label}: createUser failed and user not found — ${created.error?.message}`)
  const upd = await admin.updateUserById(existing.id, { password, email_confirm: true })
  if (upd.error) console.warn(`  ! ${label}: could not re-set password: ${upd.error.message}`)
  return { id: existing.id, created: false }
}

// ── Public tables ─────────────────────────────────────────────────────────────
async function ensureOrg() {
  const { data: existing, error } = await sb.from('orgs').select('id').eq('slug', ORG_SLUG).maybeSingle()
  if (error) throw new Error(`org lookup: ${error.message}`)
  if (existing) return { id: existing.id, created: false }
  const { data, error: insErr } = await sb.from('orgs').insert({ name: ORG_NAME, slug: ORG_SLUG }).select('id').single()
  if (insErr) throw new Error(`org insert: ${insErr.message}`)
  return { id: data.id, created: true }
}

async function ensureProfile(userId, orgId, role, fullName) {
  const { data: existing, error } = await sb.from('profiles').select('id, role, org_id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`${role} profile lookup: ${error.message}`)
  if (!existing) {
    const { error: insErr } = await sb.from('profiles')
      .insert({ id: userId, org_id: orgId, role, full_name: fullName })
    if (insErr) throw new Error(`${role} profile insert: ${insErr.message}`)
    return { created: true, role }
  }
  if (existing.role !== role || existing.org_id !== orgId) {
    // Correcting role/org needs an UPDATE, which the BEFORE-UPDATE immutable
    // trigger blocks for non-operators (service_role has no auth.uid()). Attempt
    // it; warn (don't fail) if the DB refuses — the human can fix it once.
    const { error: updErr } = await sb.from('profiles').update({ role, org_id: orgId }).eq('id', userId)
    if (updErr) console.warn(`  ! ${role} profile exists as role='${existing.role}' and could not be updated: ${updErr.message}`)
    else return { created: false, role, updated: true }
  }
  return { created: false, role: existing.role }
}

async function ensureOperator(userId) {
  const { data: existing, error } = await sb.from('operators').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`operator lookup: ${error.message}`)
  if (existing) return { created: false }
  const { error: insErr } = await sb.from('operators')
    .insert({ user_id: userId, notes: 'Staging UI-verification operator (seed-staging-accounts.mjs)' })
  if (insErr) throw new Error(`operator insert: ${insErr.message}`)
  return { created: true }
}

async function ensurePatient(orgId) {
  const { data: existing, error } = await sb.from('patients')
    .select('id').eq('org_id', orgId).eq('full_name', PATIENT_NAME).limit(1)
  if (error) throw new Error(`patient lookup: ${error.message}`)
  if (existing && existing.length) return { id: existing[0].id, created: false }
  const { data, error: insErr } = await sb.from('patients')
    .insert({ org_id: orgId, full_name: PATIENT_NAME, phone: PATIENT_PHONE }).select('id').single()
  if (insErr) throw new Error(`patient insert: ${insErr.message}`)
  return { id: data.id, created: true }
}

async function ensurePayment(orgId, patientId, recordedBy, p) {
  const { data: existing, error } = await sb.from('payments')
    .select('id')
    .eq('org_id', orgId).eq('patient_id', patientId).eq('kind', 'payment')
    .eq('amount_minor', p.amount_minor).eq('currency', p.currency).limit(1)
  if (error) throw new Error(`payment lookup: ${error.message}`)
  if (existing && existing.length) return { id: existing[0].id, created: false }
  const { data, error: insErr } = await sb.from('payments')
    .insert({
      org_id: orgId, patient_id: patientId, recorded_by: recordedBy,
      kind: 'payment', amount_minor: p.amount_minor, currency: p.currency, method: p.method,
    })
    .select('id').single()
  if (insErr) throw new Error(`payment insert (${p.amount_minor} ${p.currency}): ${insErr.message}`)
  return { id: data.id, created: true }
}

async function ensureCharge(orgId, patientId, doctorId, c) {
  // Idempotent on (org, patient, doctor, amount, currency, description, kind='charge').
  const { data: existing, error } = await sb.from('charges')
    .select('id')
    .eq('org_id', orgId).eq('patient_id', patientId).eq('doctor_id', doctorId).eq('kind', 'charge')
    .eq('amount_minor', c.amount_minor).eq('currency', c.currency).eq('description', c.description).limit(1)
  if (error) throw new Error(`charge lookup: ${error.message}`)
  if (existing && existing.length) return { id: existing[0].id, created: false }
  const { data, error: insErr } = await sb.from('charges')
    .insert({
      org_id: orgId, patient_id: patientId, doctor_id: doctorId, created_by: doctorId,
      kind: 'charge', category: 'clinical',
      amount_minor: c.amount_minor, currency: c.currency, description: c.description,
    })
    .select('id').single()
  if (insErr) throw new Error(`charge insert (${c.amount_minor} ${c.currency}): ${insErr.message}`)
  return { id: data.id, created: true }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const tag = (r) => (r.created ? 'created' : r.updated ? 'updated' : 'exists')

console.log(`\nSeeding staging fixtures (${URL})\n${'='.repeat(60)}`)

const org = await ensureOrg()
console.log(`org      ${tag(org)}   ${org.id}  (${ORG_NAME} / ${ORG_SLUG})`)

const owner = await ensureAuthUser(OWNER_EMAIL, OWNER_PASSWORD, 'owner')
console.log(`owner    ${tag(owner)}   ${owner.id}  (${OWNER_EMAIL})`)
const ownerProfile = await ensureProfile(owner.id, org.id, 'owner', 'Staging Owner')
console.log(`profile  ${tag(ownerProfile)}   role=${ownerProfile.role}`)

const operator = await ensureAuthUser(OPERATOR_EMAIL, OPERATOR_PASSWORD, 'operator')
console.log(`operator ${tag(operator)}   ${operator.id}  (${OPERATOR_EMAIL})`)
const operatorRow = await ensureOperator(operator.id)
console.log(`operators ${tag(operatorRow)}  user_id=${operator.id}`)

const doctor = await ensureAuthUser(DOCTOR_EMAIL, DOCTOR_PASSWORD, 'doctor')
console.log(`doctor   ${tag(doctor)}   ${doctor.id}  (${DOCTOR_EMAIL})`)
const doctorProfile = await ensureProfile(doctor.id, org.id, 'doctor', DOCTOR_NAME)
console.log(`profile  ${tag(doctorProfile)}   role=${doctorProfile.role}  (${DOCTOR_NAME})`)

const patient = await ensurePatient(org.id)
console.log(`patient  ${tag(patient)}   ${patient.id}  (${PATIENT_NAME})`)

const paymentResults = []
for (const p of PAYMENTS) {
  const r = await ensurePayment(org.id, patient.id, owner.id, p)
  paymentResults.push(r)
  console.log(`payment  ${tag(r)}   ${r.id}  (${p.amount_minor} ${p.currency}, ${p.method})`)
}

const chargeResults = []
for (const c of CHARGES) {
  const r = await ensureCharge(org.id, patient.id, doctor.id, c)
  chargeResults.push(r)
  console.log(`charge   ${tag(r)}   ${r.id}  (${c.amount_minor} ${c.currency}, "${c.description}" → ${DOCTOR_NAME})`)
}

// ── Paste block ───────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}\n# ── paste into scripts/.env.staging.local ──────────────────────`)
console.log(`STAGING_OWNER_EMAIL=${OWNER_EMAIL}`)
console.log(`STAGING_OWNER_PASSWORD=${OWNER_PASSWORD}`)
console.log(`STAGING_OPERATOR_EMAIL=${OPERATOR_EMAIL}`)
console.log(`STAGING_OPERATOR_PASSWORD=${OPERATOR_PASSWORD}`)
console.log(`STAGING_DOCTOR_EMAIL=${DOCTOR_EMAIL}`)
console.log(`STAGING_DOCTOR_PASSWORD=${DOCTOR_PASSWORD}`)
console.log(`# org_id=${org.id}`)
console.log(`# patient_id=${patient.id}`)
console.log(`# doctor_id=${doctor.id}`)
console.log(`# ────────────────────────────────────────────────────────────────`)
console.log('\nLogin creds:')
console.log(`  OWNER    ${OWNER_EMAIL} / ${OWNER_PASSWORD}   (role=owner — sees Record Payment, NO reverse button)`)
console.log(`  OPERATOR ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}   (impersonate "${ORG_NAME}" → reverse button appears)`)
console.log(`  DOCTOR   ${DOCTOR_EMAIL} / ${DOCTOR_PASSWORD}   (role=doctor — "Production by doctor" report shows own charges)`)
console.log('\nDone. Fixtures persisted; safe to re-run.')
