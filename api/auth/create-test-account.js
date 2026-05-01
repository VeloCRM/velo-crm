/**
 * Vercel Serverless Function — Create Test Account
 * Endpoint: POST /api/auth/create-test-account
 *
 * Creates an auth user, an org (status='test'), an owner profile, and seeds
 * realistic dental sample data. Returns the test credentials so the client
 * can immediately sign in.
 *
 * No authentication required: this is the only client-facing signup path.
 * Security: rate limiting and abuse prevention are out of scope for Sprint 0;
 * the 14-day cleanup cron is the safety net.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY

const APPOINTMENT_TYPES = [
  'checkup', 'cleaning', 'filling', 'extraction', 'root_canal',
  'crown', 'whitening', 'consultation', 'emergency',
]
const APPOINTMENT_STATUSES = [
  'scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled',
]
const PAYMENT_METHODS = ['cash', 'fib', 'zaincash', 'asia_hawala', 'card']
const INVENTORY_ITEMS = [
  { name: 'Composite resin (A2)', category: 'consumables', quantity: 24, unit: 'syringe', threshold: 8 },
  { name: 'Lidocaine 2% w/ epi', category: 'medications',  quantity: 12, unit: 'cartridge', threshold: 6 },
  { name: 'Disposable nitrile gloves (M)', category: 'consumables', quantity: 220, unit: 'glove', threshold: 100 },
  { name: 'Autoclave pouches (small)', category: 'sterilization', quantity: 180, unit: 'pouch', threshold: 50 },
  { name: 'X-ray sensor (size 2)', category: 'equipment', quantity: 2, unit: 'unit', threshold: 1 },
]
const TASK_TITLES = [
  'Confirm tomorrow\'s appointments by WhatsApp',
  'Order new batch of composite resin',
  'Send recall message to patients overdue >6 months',
  'Reconcile yesterday\'s cash payments',
  'Sterilize and restock chair 2 instruments',
  'Follow up on declined treatment plans',
  'Update intake form template (allergies section)',
  'Submit monthly insurance claims',
]
const FIRST_NAMES = ['Ali', 'Sara', 'Hassan', 'Layla', 'Omar', 'Noor', 'Mustafa', 'Zainab', 'Karim', 'Mariam']
const LAST_NAMES = ['Al-Jubouri', 'Al-Hashimi', 'Al-Khafaji', 'Al-Tikriti', 'Al-Saadi', 'Al-Mosawi', 'Al-Janabi', 'Al-Anbari', 'Al-Rubaie', 'Al-Maliki']

const PROCEDURES = [
  { code: 'D1110', label: 'Adult prophylaxis (cleaning)',          minor: 50_000_000 },
  { code: 'D2392', label: 'Composite filling, two surfaces',       minor: 200_000_000 },
  { code: 'D3310', label: 'Root canal — anterior',                  minor: 600_000_000 },
  { code: 'D2740', label: 'Crown — porcelain/ceramic',              minor: 900_000_000 },
  { code: 'D7140', label: 'Extraction, erupted tooth',              minor: 150_000_000 },
  { code: 'D9972', label: 'External bleaching (whitening)',         minor: 350_000_000 },
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function offsetDate(days, hours = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9 + hours, 0, 0, 0)
  return d.toISOString()
}
function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
function randomPassword() {
  return 'Test-' + randomString(20)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const slugSuffix = randomString(8)
  const email = `test-${slugSuffix}@velo.test`
  const password = randomPassword()

  let userId
  let orgId

  try {
    // 1. Create auth user (auto-confirmed so client can sign in immediately)
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test Owner', is_test_account: true },
    })
    if (userErr) throw new Error(`createUser: ${userErr.message}`)
    userId = userData.user.id

    // 2. Create org (status='test')
    const { data: org, error: orgErr } = await admin
      .from('orgs')
      .insert({
        name: `Test Clinic ${slugSuffix.slice(0, 4).toUpperCase()}`,
        slug: `test-${slugSuffix}`,
        locale: 'en',
        currency: 'IQD',
        timezone: 'Asia/Baghdad',
        status: 'test',
        operator_notes: 'Auto-generated test account',
      })
      .select('id')
      .single()
    if (orgErr) throw new Error(`createOrg: ${orgErr.message}`)
    orgId = org.id

    // 3. Create profile (role='owner')
    const { error: profileErr } = await admin
      .from('profiles')
      .insert({
        id: userId,
        org_id: orgId,
        role: 'owner',
        full_name: 'Test Owner',
        locale: 'en',
      })
    if (profileErr) throw new Error(`createProfile: ${profileErr.message}`)

    // 4. Seed 10 patients (unique phones within org)
    const patients = []
    for (let i = 0; i < 10; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length]
      const last  = LAST_NAMES[(i * 3) % LAST_NAMES.length]
      patients.push({
        org_id: orgId,
        full_name: `${first} ${last}`,
        phone: `+9647${String(500000000 + i).padStart(9, '0')}`,
        email: i % 3 === 0 ? `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@example.test` : null,
        dob: new Date(1970 + (i * 3) % 35, (i * 7) % 12, ((i * 11) % 27) + 1).toISOString().slice(0, 10),
        gender: i % 2 === 0 ? 'male' : 'female',
        medical_history: { conditions: i % 4 === 0 ? ['hypertension'] : [] },
        allergies: i % 5 === 0 ? ['penicillin'] : [],
      })
    }
    const { data: insertedPatients, error: patientsErr } = await admin
      .from('patients')
      .insert(patients)
      .select('id')
    if (patientsErr) throw new Error(`seedPatients: ${patientsErr.message}`)
    const patientIds = insertedPatients.map(p => p.id)

    // 5. Seed 20 appointments — past + future, mixed types/statuses
    const appointments = []
    for (let i = 0; i < 20; i++) {
      const dayOffset = i < 10 ? -randomInt(1, 60) : randomInt(1, 30)
      const status = dayOffset < 0
        ? pick(['completed', 'completed', 'completed', 'no_show', 'cancelled'])
        : pick(['scheduled', 'scheduled', 'confirmed'])
      appointments.push({
        org_id: orgId,
        patient_id: patientIds[i % patientIds.length],
        doctor_id: userId,
        type: APPOINTMENT_TYPES[i % APPOINTMENT_TYPES.length],
        status,
        scheduled_at: offsetDate(dayOffset, i % 8),
        duration_minutes: pick([30, 30, 45, 60]),
        chair_id: pick(['chair-1', 'chair-2']),
        notes: i % 4 === 0 ? 'Patient reports mild sensitivity.' : null,
      })
    }
    const { error: apptErr } = await admin.from('appointments').insert(appointments)
    if (apptErr) throw new Error(`seedAppointments: ${apptErr.message}`)

    // 6. Seed 5 treatment plans (3 accepted/in_progress, 2 proposed). Items
    //    are tracked in a parallel array keyed by index, then inserted after
    //    we have the generated plan ids back from the database.
    const planRows = []
    const planItemsByIndex = []
    for (let i = 0; i < 5; i++) {
      const numItems = randomInt(2, 4)
      const items = []
      let total = 0
      for (let j = 0; j < numItems; j++) {
        const proc = PROCEDURES[(i + j) % PROCEDURES.length]
        items.push(proc)
        total += proc.minor
      }
      const status = i < 3 ? pick(['accepted', 'in_progress']) : 'proposed'
      planRows.push({
        org_id: orgId,
        patient_id: patientIds[i],
        doctor_id: userId,
        status,
        total_amount_minor: total,
        currency: 'IQD',
        notes: `${numItems}-step plan`,
      })
      planItemsByIndex.push(items)
    }
    const { data: insertedPlans, error: planErr } = await admin
      .from('treatment_plans')
      .insert(planRows)
      .select('id')
    if (planErr) throw new Error(`seedTreatmentPlans: ${planErr.message}`)

    // 6b. Seed treatment_plan_items for those plans
    const planItems = []
    insertedPlans.forEach((plan, idx) => {
      planItemsByIndex[idx].forEach((proc, seq) => {
        planItems.push({
          org_id: orgId,
          treatment_plan_id: plan.id,
          tooth_number: randomInt(1, 32),
          surface: pick(['M', 'O', 'D', 'MOD', null]),
          procedure_code: proc.code,
          procedure_label: proc.label,
          amount_minor: proc.minor,
          currency: 'IQD',
          status: 'pending',
          sequence: seq,
        })
      })
    })
    const { error: itemsErr } = await admin.from('treatment_plan_items').insert(planItems)
    if (itemsErr) throw new Error(`seedTreatmentPlanItems: ${itemsErr.message}`)

    // 7. Seed 15 payments — linked to patients, sometimes to plans
    const payments = []
    for (let i = 0; i < 15; i++) {
      const amounts = [50_000_000, 100_000_000, 150_000_000, 200_000_000, 300_000_000]
      payments.push({
        org_id: orgId,
        patient_id: patientIds[i % patientIds.length],
        treatment_plan_id: i < 8 ? insertedPlans[i % insertedPlans.length].id : null,
        amount_minor: pick(amounts),
        currency: 'IQD',
        method: pick(PAYMENT_METHODS),
        recorded_at: offsetDate(-randomInt(1, 60), i % 6),
        recorded_by: userId,
        notes: null,
      })
    }
    const { error: payErr } = await admin.from('payments').insert(payments)
    if (payErr) throw new Error(`seedPayments: ${payErr.message}`)

    // 8. Seed 8 tasks
    const tasks = TASK_TITLES.map((title, i) => ({
      org_id: orgId,
      title,
      description: null,
      status: pick(['todo', 'todo', 'in_progress', 'done']),
      assignee_id: userId,
      due_at: offsetDate(randomInt(1, 7), i % 4),
      related_patient_id: i % 2 === 0 ? patientIds[i % patientIds.length] : null,
    }))
    const { error: taskErr } = await admin.from('tasks').insert(tasks)
    if (taskErr) throw new Error(`seedTasks: ${taskErr.message}`)

    // 9. Seed 5 inventory items
    const inventory = INVENTORY_ITEMS.map(item => ({
      org_id: orgId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      low_stock_threshold: item.threshold,
      last_restocked_at: offsetDate(-randomInt(5, 30)),
    }))
    const { error: invErr } = await admin.from('inventory_items').insert(inventory)
    if (invErr) throw new Error(`seedInventory: ${invErr.message}`)

    return res.status(200).json({
      ok: true,
      email,
      password,
      orgId,
      message: 'Test account created. Sign in with the returned credentials.',
    })
  } catch (err) {
    console.error('[create-test-account] failed:', err)

    // Best-effort rollback. Org cascade handles child rows; auth user is
    // separate.
    if (orgId) {
      await admin.from('orgs').delete().eq('id', orgId)
        .then(() => null, () => null)
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId)
        .then(() => null, () => null)
    }

    return res.status(500).json({
      error: 'Failed to create test account',
      detail: err.message,
    })
  }
}
