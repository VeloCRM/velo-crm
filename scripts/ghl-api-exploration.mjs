#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — V1.5 Stage 1 — GHL Data Exploration (READ-ONLY)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  PURPOSE (diagnostic only — does NOT import anything):
 *    Fetch a SMALL sample from Saif's GoHighLevel location so we can document
 *    the real data shapes before building the Stage 2 import pipeline.
 *
 *    It writes ONE local file: scripts/ghl-sample-data.json
 *    That file contains REAL PATIENT DATA and is gitignored — keep it local,
 *    do not commit it, do not paste it into chat.
 *
 *  WHAT IT DOES:
 *    1. Fetches the first 5 contacts (NOT all 3,171).
 *    2. For each contact: notes, tasks, documents.
 *    3. Probes the Opportunities + Payments/Orders endpoints to settle the
 *       single biggest unknown: does GHL hold STRUCTURED payment records, or
 *       are payments only ever written as prose inside notes?
 *    4. Fetches all unique tags in the location (to surface tag variations).
 *    5. Writes everything (plus per-endpoint status/errors) to the JSON file.
 *
 *  WHAT IT NEVER DOES:
 *    - It never connects to Supabase / Velo.
 *    - It never writes, updates, or deletes anything in GHL.
 *    - It only issues GET requests.
 *
 *  ─── HOW TO RUN (Ali) ──────────────────────────────────────────────────────
 *    1. Create a file named  .env.local  in the repo root with:
 *
 *         GHL_API_KEY=your_location_api_key_here
 *         GHL_LOCATION_ID=your_location_id_here
 *
 *       (Both .env.local and scripts/ghl-sample-data.json are gitignored.)
 *
 *       Where to find them in GHL:
 *         API Key     → Settings → Business Profile → API Keys  (Location key,
 *                       Private Integration token, or Agency key both work with
 *                       the LeadConnector v2 API used here).
 *         Location ID → Settings → Business Profile  (also visible in the app
 *                       URL: .../location/<LOCATION_ID>/...).
 *
 *    2. From the repo root, run:
 *
 *         node scripts/ghl-api-exploration.mjs
 *
 *       Optional flags:
 *         --contacts=5     how many sample contacts to pull (default 5)
 *         --out=path.json  override the output path
 *
 *    3. Send the result back to the team:
 *         - The TERMINAL SUMMARY (safe to paste — it has counts, not patient data).
 *         - Keep scripts/ghl-sample-data.json local; we will walk it together.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')

const GHL_BASE = 'https://services.leadconnectorhq.com'
const API_VERSION = '2021-07-28'

// ─── Load .env.local (simple parser; no dependency) ──────────────────────────
function loadEnvLocal() {
  const envPath = path.join(ROOT_DIR, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvLocal()

function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )
  const apiKey = process.env.GHL_API_KEY
  const locationId = process.env.GHL_LOCATION_ID
  const sampleSize = parseInt(args['contacts']) || 5
  const outPath = args['out'] || path.join(__dirname, 'ghl-sample-data.json')

  if (!apiKey || !locationId) {
    console.error(`
  Missing credentials. Create .env.local in the repo root with:

    GHL_API_KEY=your_location_api_key
    GHL_LOCATION_ID=your_location_id

  Then run again:  node scripts/ghl-api-exploration.mjs
`)
    process.exit(1)
  }
  return { apiKey, locationId, sampleSize, outPath }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── GET helper with 429 backoff. Returns { ok, status, data, error }. ───────
async function ghlGet(apiKey, urlPath, params = {}, retries = 3) {
  const url = new URL(urlPath, GHL_BASE)
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v) })

  for (let attempt = 1; attempt <= retries; attempt++) {
    let res
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: API_VERSION,
          Accept: 'application/json',
        },
      })
    } catch (err) {
      return { ok: false, status: 0, data: null, error: `network: ${err.message}` }
    }

    if (res.status === 429) {
      const wait = attempt * 20
      process.stdout.write(` [429 — waiting ${wait}s]`)
      await sleep(wait * 1000)
      continue
    }

    const text = await res.text().catch(() => '')
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = { _raw: text.slice(0, 500) } }

    if (!res.ok) {
      return { ok: false, status: res.status, data, error: text.slice(0, 300) }
    }
    return { ok: true, status: res.status, data, error: null }
  }
  return { ok: false, status: 429, data: null, error: 'rate-limited after retries' }
}

// Record an endpoint probe so the JSON documents exactly what we tried + got.
function probe(label, urlPath, result, note = '') {
  return {
    label,
    endpoint: urlPath,
    ok: result.ok,
    status: result.status,
    error: result.error || null,
    note,
    // Keep the shape but cap the size so the file stays manageable.
    sample: result.ok ? result.data : null,
  }
}

async function main() {
  const cfg = getConfig()

  console.log()
  console.log('┌──────────────────────────────────────────────────────────┐')
  console.log('│  Velo — GHL Data Exploration (READ-ONLY, no imports)      │')
  console.log('└──────────────────────────────────────────────────────────┘')
  console.log(`  Location: ${cfg.locationId}`)
  console.log(`  Sample size: ${cfg.sampleSize} contacts`)
  console.log()

  const out = {
    exploredAt: new Date().toISOString(),
    locationId: cfg.locationId,
    apiVersion: API_VERSION,
    base: GHL_BASE,
    probes: [],          // endpoint-level diagnostics
    contacts: [],        // the sample contacts with their notes/tasks/documents
    tags: { source: null, all: [] },
    opportunities: null, // structured payments probe
    payments: null,      // alternate payments/orders probe
    summary: {},
  }

  // ── 1. Sample contacts ────────────────────────────────────────────────────
  console.log('Step 1 — Fetching sample contacts')
  const contactsRes = await ghlGet(cfg.apiKey, '/contacts/', { locationId: cfg.locationId, limit: cfg.sampleSize })
  out.probes.push(probe('contacts.list', '/contacts/', contactsRes, 'limit=' + cfg.sampleSize))
  await sleep(400)

  const contacts = contactsRes.ok ? (contactsRes.data?.contacts || []) : []
  console.log(`  ${contactsRes.ok ? '✓' : '✗'} ${contacts.length} contacts (HTTP ${contactsRes.status})`)
  if (!contactsRes.ok) console.log(`    error: ${contactsRes.error?.slice(0, 160)}`)

  // ── 2. Per-contact notes / tasks / documents ──────────────────────────────
  console.log('\nStep 2 — Fetching notes / tasks / documents per sample contact')
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const id = c.id
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.contactName || c.name || '(unnamed)'
    process.stdout.write(`\r  [${i + 1}/${contacts.length}] ${name.slice(0, 30).padEnd(30)}`)

    const notesRes = await ghlGet(cfg.apiKey, `/contacts/${id}/notes`); await sleep(350)
    const tasksRes = await ghlGet(cfg.apiKey, `/contacts/${id}/tasks`); await sleep(350)
    const docsRes  = await ghlGet(cfg.apiKey, `/contacts/${id}/documents`); await sleep(350)

    out.contacts.push({
      raw: c, // full contact object — reveals customFields, attachments, tags, etc.
      notes: { ok: notesRes.ok, status: notesRes.status, error: notesRes.error, data: notesRes.ok ? (notesRes.data?.notes ?? notesRes.data) : null },
      tasks: { ok: tasksRes.ok, status: tasksRes.status, error: tasksRes.error, data: tasksRes.ok ? (tasksRes.data?.tasks ?? tasksRes.data) : null },
      documents: { ok: docsRes.ok, status: docsRes.status, error: docsRes.error, data: docsRes.ok ? (docsRes.data?.documents ?? docsRes.data) : null },
    })

    // record the endpoint shape once (from the first contact) for the reference doc
    if (i === 0) {
      out.probes.push(probe('contact.notes', `/contacts/{id}/notes`, notesRes))
      out.probes.push(probe('contact.tasks', `/contacts/{id}/tasks`, tasksRes))
      out.probes.push(probe('contact.documents', `/contacts/{id}/documents`, docsRes))
    }
  }
  console.log('\n  ✓ done')

  // ── 3. Structured payments probe (THE key unknown) ────────────────────────
  console.log('\nStep 3 — Probing for STRUCTURED payments (opportunities / orders / transactions)')

  // 3a. Opportunities (v2 search uses snake_case location_id)
  const oppRes = await ghlGet(cfg.apiKey, '/opportunities/search', { location_id: cfg.locationId, limit: 5 })
  out.opportunities = probe('opportunities.search', '/opportunities/search', oppRes, 'monetaryValue/pipeline if present')
  out.probes.push(out.opportunities)
  await sleep(400)
  console.log(`  opportunities: ${oppRes.ok ? '✓ present' : '✗ ' + oppRes.status}`)

  // 3b. Payments orders (GHL payments product — may be 401/404 if unused)
  const ordersRes = await ghlGet(cfg.apiKey, '/payments/orders', { locationId: cfg.locationId, limit: 5, altId: cfg.locationId, altType: 'location' })
  out.payments = probe('payments.orders', '/payments/orders', ordersRes, 'GHL Payments product; 404/401 likely if unused')
  out.probes.push(out.payments)
  await sleep(400)
  console.log(`  payments/orders: ${ordersRes.ok ? '✓ present' : '✗ ' + ordersRes.status}`)

  // 3c. Payments transactions (alternate)
  const txRes = await ghlGet(cfg.apiKey, '/payments/transactions', { locationId: cfg.locationId, limit: 5, altId: cfg.locationId, altType: 'location' })
  out.probes.push(probe('payments.transactions', '/payments/transactions', txRes))
  await sleep(400)
  console.log(`  payments/transactions: ${txRes.ok ? '✓ present' : '✗ ' + txRes.status}`)

  // ── 4. All unique tags in the location ────────────────────────────────────
  console.log('\nStep 4 — Fetching all tags in the location')
  const tagsRes = await ghlGet(cfg.apiKey, `/locations/${cfg.locationId}/tags`)
  out.probes.push(probe('location.tags', `/locations/{id}/tags`, tagsRes))
  if (tagsRes.ok) {
    const list = tagsRes.data?.tags || tagsRes.data || []
    out.tags.source = 'location.tags endpoint'
    out.tags.all = Array.isArray(list) ? list.map(t => (typeof t === 'string' ? t : (t.name || t))) : []
  } else {
    // Fallback: collect tags seen on the sample contacts.
    const seen = new Set()
    for (const c of contacts) (c.tags || []).forEach(t => seen.add(t))
    out.tags.source = 'fallback: sample-contact tags only (location.tags returned ' + tagsRes.status + ')'
    out.tags.all = [...seen]
  }
  console.log(`  ${out.tags.all.length} unique tags (${out.tags.source})`)

  // ── 5. Summary + write file ───────────────────────────────────────────────
  out.summary = {
    contactsFetched: contacts.length,
    contactsWithNotes: out.contacts.filter(c => Array.isArray(c.notes.data) && c.notes.data.length).length,
    contactsWithTasks: out.contacts.filter(c => Array.isArray(c.tasks.data) && c.tasks.data.length).length,
    contactsWithDocuments: out.contacts.filter(c => Array.isArray(c.documents.data) && c.documents.data.length).length,
    uniqueTags: out.tags.all.length,
    opportunitiesEndpoint: out.opportunities.ok ? 'present' : `unavailable (${out.opportunities.status})`,
    paymentsOrdersEndpoint: out.payments.ok ? 'present' : `unavailable (${out.payments.status})`,
    structuredPaymentsLikely: out.opportunities.ok || out.payments.ok,
  }

  fs.writeFileSync(cfg.outPath, JSON.stringify(out, null, 2), 'utf8')

  console.log('\n┌──────────────────────────────────────────────────────────┐')
  console.log('│  Exploration complete                                    │')
  console.log('├──────────────────────────────────────────────────────────┤')
  console.log(`│  Contacts fetched:        ${String(out.summary.contactsFetched).padEnd(31)}│`)
  console.log(`│  …with notes:             ${String(out.summary.contactsWithNotes).padEnd(31)}│`)
  console.log(`│  …with tasks:             ${String(out.summary.contactsWithTasks).padEnd(31)}│`)
  console.log(`│  …with documents:         ${String(out.summary.contactsWithDocuments).padEnd(31)}│`)
  console.log(`│  Unique tags:             ${String(out.summary.uniqueTags).padEnd(31)}│`)
  console.log(`│  Opportunities endpoint:  ${String(out.summary.opportunitiesEndpoint).padEnd(31)}│`)
  console.log(`│  Payments/orders endpoint:${String(out.summary.paymentsOrdersEndpoint).padEnd(31)}│`)
  console.log(`│  Structured payments?     ${String(out.summary.structuredPaymentsLikely ? 'LIKELY' : 'NOT FOUND — prose-in-notes?').padEnd(31)}│`)
  console.log('└──────────────────────────────────────────────────────────┘')
  console.log(`\n  Wrote: ${path.relative(ROOT_DIR, cfg.outPath)}  (gitignored — keep local)`)
  console.log('  Safe to share: the summary box above. Do NOT paste the JSON file.\n')
}

main().catch(err => { console.error('\nExploration failed:', err.message); process.exit(1) })
