#!/usr/bin/env node
/**
 * verify-audit-reads.mjs — READ-ONLY verification of the audit Log data layer
 * (src/lib/audit.js fetchAuditLog + resolveActors) against the REAL staging audit_log,
 * over a raw `pg` connection. Mirrors the SQL those functions run and prints what the
 * Activity Log UI would render, so the feed can be eyeballed before building it.
 *
 * READ-ONLY: everything runs inside BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK — no
 * writes are possible. Connects as the direct `postgres` role (bypasses RLS), and
 * filters by org_id explicitly — which yields exactly the rows fetchAuditLog returns to
 * a member of that org (audit actors are same-org, so the profiles resolution matches;
 * operator ids have no profiles row regardless of RLS).
 *
 * Target org: auto-detected as the org with the MOST operator actions (so the key
 * assertion has data), else the busiest org. Override with AUDIT_ORG_ID=<uuid>.
 *
 * ── Run (PowerShell) ─────────────────────────────────────────────────────────
 *   $env:STAGING_DB_URL='postgresql://postgres:<STAGING_DB_PASSWORD>@db.dujnbboyeugrisgewnqu.supabase.co:5432/postgres'
 *   # optional: $env:AUDIT_ORG_ID='<org-uuid>'
 *   node scratchpad/verify-audit-reads.mjs
 */
import pkg from 'pg'
const { Client } = pkg

const PROD_REF = 'aajwuwjxpmmqcwhiynla'
const STAGING_REF = 'dujnbboyeugrisgewnqu'
const OPERATOR_ACTIONS = ['payment.reverse', 'charge.void']

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

// ── Inline replicas of auditLabels.js (Node can't safely import the app lib) ──
const DIVISOR = { IQD: 1, USD: 100 }
function money(minor, cur = 'IQD') {
  const c = (cur || 'IQD').toUpperCase()
  const d = DIVISOR[c] || 1
  const v = Number(minor || 0) / d
  return `${v.toLocaleString('en-US', d === 1 ? {} : { minimumFractionDigits: 2 })} ${c}`
}
const ACTION_LABELS = {
  'payment.create': 'Recorded a payment', 'payment.update': 'Updated a payment',
  'payment.delete': 'Deleted a payment', 'payment.reverse': 'Reversed a payment',
  'charge.create': 'Added a charge', 'charge.void': 'Voided a charge',
  'patient.create': 'Added a patient', 'patient.update': 'Updated patient', 'patient.delete': 'Deleted a patient',
  'appointment.create': 'Booked an appointment', 'appointment.update': 'Updated an appointment',
  'appointment.delete': 'Cancelled an appointment', 'appointment.status_change': 'Changed appointment status',
  'note.create': 'Added a note', 'note.update': 'Edited a note', 'note.delete': 'Deleted a note',
  'treatment_plan.create': 'Created a treatment plan', 'charge.create.other': 'Added a charge',
}
function actionLabel(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const s = String(action || '').replace(/[._]/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Activity'
}
function genericPayload(p) {
  const parts = []
  for (const [k, v] of Object.entries(p || {})) {
    if (v == null || k.endsWith('_id')) continue
    const label = k.replace(/_/g, ' ')
    if (Array.isArray(v)) { if (v.length) parts.push(`${label}: ${v.join(', ')}`) }
    else if (typeof v !== 'object') parts.push(`${label}: ${v}`)
    if (parts.length >= 4) break
  }
  return parts.join(' · ')
}
function payloadSummary(action, p = {}) {
  switch (action) {
    case 'payment.create':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.method ? ` (${p.method})` : ''}`
    case 'payment.reverse':
    case 'charge.void':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.reason ? ` — reason: ${p.reason}` : ''}`
    case 'charge.create':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.category ? ` · ${p.category}` : ''}`
    default: break
  }
  return genericPayload(p)
}

const results = []
function check(name, ok, info = '') {
  results.push({ ok: !!ok })
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}

async function main() {
  console.log(`\nAudit reads verification (${u.hostname})\n${'='.repeat(72)}`)
  await client.query('BEGIN')
  await client.query('SET TRANSACTION READ ONLY')

  // ── pick target org ──
  let org = process.env.AUDIT_ORG_ID || null
  if (!org) {
    const r = await client.query(
      `SELECT org_id::text AS org_id FROM audit_log GROUP BY org_id
        ORDER BY count(*) FILTER (WHERE action = ANY($1)) DESC, count(*) DESC LIMIT 1`,
      [OPERATOR_ACTIONS],
    )
    org = r.rows[0]?.org_id || null
  }
  if (!org) { console.log('No audit_log rows on staging — nothing to verify.'); return }
  const orgName = (await client.query(`SELECT name FROM orgs WHERE id=$1`, [org])).rows[0]?.name || '(unknown)'
  console.log(`Target org: ${org}  "${orgName}"\n`)

  // ── 1. fetchAuditLog equivalent: newest 20 rows for the org ──
  const rows = (await client.query(
    `SELECT id::text, created_at, action, entity_type, acting_user_id::text AS acting_user_id,
            effective_user_id::text AS effective_user_id, payload
       FROM audit_log WHERE org_id = $1 ORDER BY created_at DESC LIMIT 20`, [org],
  )).rows
  check('1. fetchAuditLog returned rows', rows.length > 0, `${rows.length} rows`)
  console.log('\n── newest audit rows ─────────────────────────────────────────────────')
  for (const r of rows) {
    const when = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  ${when}  ${r.action.padEnd(28)} ent=${(r.entity_type || '').padEnd(14)} act=${(r.acting_user_id || 'NULL').slice(0, 8)} eff=${(r.effective_user_id || 'NULL').slice(0, 8)}  ${JSON.stringify(r.payload)}`)
  }

  // ── 2. resolveActors equivalent: distinct acting ids → profiles batch ──
  const actorIds = [...new Set(rows.map(r => r.acting_user_id).filter(Boolean))]
  const profs = actorIds.length
    ? (await client.query(`SELECT id::text, full_name, role FROM profiles WHERE id = ANY($1)`, [actorIds])).rows
    : []
  const actorMap = {}
  for (const p of profs) actorMap[p.id] = { name: p.full_name || 'Unknown', role: p.role, isOperator: false }
  for (const id of actorIds) if (!actorMap[id]) actorMap[id] = { name: 'SupCod3', role: null, isOperator: true }

  const resolved = actorIds.filter(id => !actorMap[id].isOperator)
  const unresolved = actorIds.filter(id => actorMap[id].isOperator)
  console.log('\n── actor resolution ──────────────────────────────────────────────────')
  console.log(`  RESOLVED (clinic members): ${resolved.length}`)
  for (const id of resolved) console.log(`    ${id.slice(0, 8)} → ${actorMap[id].name} (${actorMap[id].role})`)
  console.log(`  UNRESOLVED (→ operator/SupCod3): ${unresolved.length}`)
  for (const id of unresolved) console.log(`    ${id.slice(0, 8)} → SupCod3 (operator)`)
  check('2. resolveActors resolved at least one clinic member', resolved.length > 0, `${resolved.length} member(s)`)

  // ── 3. KEY ASSERTION: operator actions have an UNRESOLVED acting_user_id ──
  const opRows = rows.filter(r => OPERATOR_ACTIONS.includes(r.action))
  console.log('\n── operator-performed actions (payment.reverse / charge.void) ────────')
  if (opRows.length === 0) {
    console.log('  none in the newest 20 rows for this org — key assertion SKIPPED.')
    console.log('  (widen with a different AUDIT_ORG_ID, or perform a reversal/void on staging first.)')
  } else {
    for (const r of opRows) {
      // acting id must NOT resolve to a profile; report effective_user_id.
      const isOp = !r.acting_user_id || !actorMap[r.acting_user_id] || actorMap[r.acting_user_id].isOperator
      // actorMap only holds ids from the row set; re-check directly against profiles for safety:
      const actingResolvesToProfile = profs.some(p => p.id === r.acting_user_id)
      check(`3. ${r.action} acting_user_id does NOT resolve to a profile (→ operator)`,
        !actingResolvesToProfile && isOp,
        `acting=${(r.acting_user_id || 'NULL').slice(0, 8)} effective=${r.effective_user_id ? r.effective_user_id.slice(0, 8) : 'NULL'}`)
      console.log(`     effective_user_id is ${r.effective_user_id ? 'POPULATED (' + r.effective_user_id.slice(0, 8) + ')' : 'NULL'}`)
    }
  }

  // ── 4. UI render preview ──
  console.log('\n── UI render preview (what the feed would read) ──────────────────────')
  for (const r of rows) {
    let actor
    if (!r.acting_user_id) actor = 'Removed user'
    else if (actorMap[r.acting_user_id]?.isOperator) actor = 'SupCod3 (operator)'
    else actor = actorMap[r.acting_user_id]?.name || 'SupCod3 (operator)'
    if (r.effective_user_id) {
      const eff = profs.find(p => p.id === r.effective_user_id)
      actor += ` acting as ${eff ? eff.full_name : r.effective_user_id.slice(0, 8)}`
    }
    const summary = payloadSummary(r.action, r.payload)
    console.log(`  ${actor} — ${actionLabel(r.action)}${summary ? ` — ${summary}` : ''}`)
  }
}

let runError = null
try {
  await client.connect()
  await main()
} catch (e) {
  runError = e
  check('run completed without an unexpected error', false, e?.message || String(e))
} finally {
  try { await client.query('ROLLBACK') } catch { /* ignore */ }
  await client.end().catch(() => {})
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(72)}\n${results.length - failed.length}/${results.length} checks passed. (READ ONLY — nothing written)`)
if (runError) console.log(`\nUnexpected error: ${runError.stack || runError.message}`)
process.exit(failed.length || runError ? 1 : 0)
