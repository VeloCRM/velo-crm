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
 *    1. Fetches the first 10 contacts (NOT all 3,171).
 *    2. For each contact: notes, tasks, documents.
 *    3. Probes the Opportunities + Payments/Orders endpoints to settle the
 *       single biggest unknown: does GHL hold STRUCTURED payment records, or
 *       are payments only ever written as prose inside notes?
 *    4. Fetches all unique tags in the location (to surface tag variations).
 *    5. DOCUMENT DISCOVERY (location-wide): media library (/medias/files),
 *       custom-field definitions (flagging FILE_UPLOAD fields), and rules out
 *       /contacts/{id}/files & /contacts/{id}/attachments; also scans fetched
 *       note bodies for inline file URLs.
 *    6. OLDEST contacts probe: fetches ~5 oldest contacts (where the scanned
 *       setup files likely live) and inspects their customFields for file-type
 *       values; HEADs one URL to confirm reachability + signed/expiring shape
 *       (NEVER downloads file content).
 *    7. Writes everything (plus per-endpoint status/errors) to the JSON file.
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
 *         --contacts=10        how many sample contacts to pull (default 10)
 *         --out=path.json      override the output path
 *         --old-contact=<id>   probe this specific OLD contact for file fields
 *                              (in addition to the oldest-5 heuristic). Also
 *                              accepted via env GHL_OLD_CONTACT_ID.
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
  const sampleSize = parseInt(args['contacts']) || 10
  const outPath = args['out'] || path.join(__dirname, 'ghl-sample-data.json')
  const oldContactId = args['old-contact'] || process.env.GHL_OLD_CONTACT_ID || null

  if (!apiKey || !locationId) {
    console.error(`
  Missing credentials. Create .env.local in the repo root with:

    GHL_API_KEY=your_location_api_key
    GHL_LOCATION_ID=your_location_id

  Then run again:  node scripts/ghl-api-exploration.mjs
`)
    process.exit(1)
  }
  return { apiKey, locationId, sampleSize, outPath, oldContactId }
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
      return { ok: false, status: 0, data: null, error: `network: ${err.message}`, headers: null }
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

    const hdrs = {}
    res.headers.forEach((v, k) => { hdrs[k] = v })

    if (!res.ok) {
      return { ok: false, status: res.status, data, error: text.slice(0, 300), headers: hdrs }
    }
    return { ok: true, status: res.status, data, error: null, headers: hdrs }
  }
  return { ok: false, status: 429, data: null, error: 'rate-limited after retries', headers: null }
}

// Curated subset of response headers worth logging for diagnostics (no PII).
function pickHeaders(h) {
  if (!h) return null
  const keep = ['content-type', 'traceid', 'x-trace-id', 'x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-interval-milliseconds', 'retry-after']
  const out = {}
  for (const k of keep) if (h[k] != null) out[k] = h[k]
  return out
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
    documents: null,     // Step 5/6 document-storage discovery
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

  // ── 5. Document storage discovery (location-wide) ─────────────────────────
  console.log('\nStep 5 — Document storage discovery (media library / custom fields / file paths)')
  out.documents = {
    mediaLibrary: null,
    customFieldDefs: null,
    fileUploadFields: [],
    contactFilePaths: [],
    notesWithFileUrls: { count: 0, hosts: [], matchedContactIds: [] },
    oldestContacts: [],
    oldestSummary: { probed: 0, withFileFields: 0, sampleUrlSigned: null },
  }

  // 5a. Location media library — the plain call 422'd, so try param variants
  //     + an alternate endpoint, logging each 422 body (it states what's wrong).
  const mediaAttempts = [
    { label: 'altType+altId+sortBy=createdAt', path: '/medias/files', params: { altType: 'location', altId: cfg.locationId, sortBy: 'createdAt', sortOrder: 'desc', limit: 50, offset: 0 } },
    { label: '+type=file',                     path: '/medias/files', params: { altType: 'location', altId: cfg.locationId, sortBy: 'createdAt', sortOrder: 'desc', limit: 50, offset: 0, type: 'file' } },
    { label: 'sortBy=created_at',              path: '/medias/files', params: { altType: 'location', altId: cfg.locationId, sortBy: 'created_at', sortOrder: 'desc', limit: 50, offset: 0 } },
    { label: 'minimal altType+altId',          path: '/medias/files', params: { altType: 'location', altId: cfg.locationId } },
    { label: 'altId only (no altType)',        path: '/medias/files', params: { altId: cfg.locationId } },
    { label: 'alt endpoint /locations/{id}/medias', path: `/locations/${cfg.locationId}/medias`, params: {} },
  ]
  out.documents.mediaAttempts = []
  let mediaRes = { ok: false, status: 0, error: 'not attempted', data: null }
  for (const a of mediaAttempts) {
    const r = await ghlGet(cfg.apiKey, a.path, a.params)
    out.documents.mediaAttempts.push({
      label: a.label, path: a.path, params: a.params, status: r.status, ok: r.ok,
      errorBody: r.ok ? null : (r.error || '').slice(0, 400),   // 422 body = the diagnostic we want
      headers: pickHeaders(r.headers),
    })
    console.log(`  media [${a.label}] → HTTP ${r.status}${r.ok ? ' ✓' : ''}${!r.ok && r.error ? ' — ' + r.error.slice(0, 120) : ''}`)
    await sleep(350)
    if (r.ok) { mediaRes = r; break }
  }
  out.documents.mediaLibrary = probe('medias.files (first OK or last tried)', '/medias/files', mediaRes)
  out.probes.push(out.documents.mediaLibrary)
  const mediaFiles = mediaRes.ok ? (mediaRes.data?.files || mediaRes.data?.medias || mediaRes.data?.data || []) : []
  const mediaTotal = mediaRes.ok ? (mediaRes.data?.total ?? mediaRes.data?.totalCount ?? mediaFiles.length) : 0
  if (mediaRes.ok) console.log(`  media library: ✓ ${mediaFiles.length} returned (total ~${mediaTotal})`)
  else console.log('  media library: ✗ all variants failed — see documents.mediaAttempts (422 bodies) in the JSON')
  if (out.documents.mediaAttempts.some(a => a.status === 401)) console.log('    ⚠ a 401 appeared — key may lack the medias/read scope (not just a param issue)')

  // 5b. Custom field definitions (look for FILE_UPLOAD-type fields)
  const cfDefRes = await ghlGet(cfg.apiKey, `/locations/${cfg.locationId}/customFields`)
  out.documents.customFieldDefs = probe('location.customFields', '/locations/{id}/customFields', cfDefRes)
  out.probes.push(out.documents.customFieldDefs)
  await sleep(400)
  const cfDefs = cfDefRes.ok ? (cfDefRes.data?.customFields || cfDefRes.data || []) : []
  const fileFields = (Array.isArray(cfDefs) ? cfDefs : []).filter(f => {
    const dt = String(f.dataType || f.type || '').toUpperCase()
    return dt.includes('FILE') || dt.includes('UPLOAD') || dt.includes('SIGNATURE')
  })
  out.documents.fileUploadFields = fileFields.map(f => ({ id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType || f.type }))
  console.log(`  custom field defs: ${cfDefRes.ok ? `✓ ${Array.isArray(cfDefs) ? cfDefs.length : 0} fields, ${fileFields.length} file-type` : '✗ ' + cfDefRes.status}`)
  if (cfDefRes.status === 401) console.log('    ⚠ 401 — key may lack the locations/customFields scope')

  // 5c. Rule out /contacts/{id}/files and /contacts/{id}/attachments (first sample contact)
  if (contacts.length) {
    const firstId = contacts[0].id
    const filesRes = await ghlGet(cfg.apiKey, `/contacts/${firstId}/files`); await sleep(300)
    const attRes   = await ghlGet(cfg.apiKey, `/contacts/${firstId}/attachments`); await sleep(300)
    out.documents.contactFilePaths = [
      probe('contact.files', '/contacts/{id}/files', filesRes),
      probe('contact.attachments', '/contacts/{id}/attachments', attRes),
    ]
    out.probes.push(...out.documents.contactFilePaths)
    console.log(`  /contacts/{id}/files → ${filesRes.status}; /contacts/{id}/attachments → ${attRes.status}`)
    if (filesRes.status === 401 || attRes.status === 401) console.log('    ⚠ 401 — scope issue, not just a missing route')
  }

  // 5d. Scan already-fetched note bodies for inline file URLs
  const URL_RE = /https?:\/\/[^\s"')]+/gi
  const FILE_HINT = /(gohighlevel\.com|leadconnector|storage\.googleapis\.com|msgsndr|\.(pdf|jpe?g|png|gif|docx?|xlsx?|csv))/i
  const noteHosts = new Set()
  const noteMatchedIds = new Set()
  for (const c of out.contacts) {
    const notes = Array.isArray(c.notes.data) ? c.notes.data : []
    let hit = false
    for (const n of notes) {
      const text = `${n.bodyText || ''} ${n.body || ''}`
      for (const u of (text.match(URL_RE) || [])) {
        if (FILE_HINT.test(u)) {
          hit = true
          try { noteHosts.add(new URL(u).host) } catch { noteHosts.add('(unparseable)') }
        }
      }
    }
    if (hit) noteMatchedIds.add(c.raw?.id)
  }
  out.documents.notesWithFileUrls = { count: noteMatchedIds.size, hosts: [...noteHosts], matchedContactIds: [...noteMatchedIds] }
  console.log(`  notes with inline file URLs: ${noteMatchedIds.size} (hosts: ${[...noteHosts].join(', ') || 'none'})`)

  // ── 6. Oldest contacts — file custom-field probe ──────────────────────────
  console.log('\nStep 6 — Probing OLDEST contacts for file custom fields')
  if (cfg.sampleSize >= 10) {
    // The previous run returned 0 contacts from the sorted GET. Try several sort
    // syntaxes (logging status + headers + error message — NOT the body, which
    // holds PII), then fall back to paginating to the last page of the default
    // (dateAdded desc) order, whose tail = the oldest contacts.
    out.documents.oldestFetch = { method: null, attempts: [] }
    let oldContacts = []
    const sortVariants = [
      { label: 'sortBy=date_added&sortOrder=asc', params: { locationId: cfg.locationId, limit: 5, sortBy: 'date_added', sortOrder: 'asc' } },
      { label: 'sort=dateAdded:asc',              params: { locationId: cfg.locationId, limit: 5, sort: 'dateAdded:asc' } },
      { label: 'sort_by=created_at_asc',          params: { locationId: cfg.locationId, limit: 5, sort_by: 'created_at_asc' } },
      { label: 'sortBy=dateAdded&order=asc',      params: { locationId: cfg.locationId, limit: 5, sortBy: 'dateAdded', order: 'asc' } },
    ]
    for (const v of sortVariants) {
      const r = await ghlGet(cfg.apiKey, '/contacts/', v.params)
      const n = r.ok ? (r.data?.contacts || []).length : 0
      out.documents.oldestFetch.attempts.push({
        label: v.label, status: r.status, count: n,
        error: r.ok ? null : (r.error || '').slice(0, 200),   // error message only, never the data body
        headers: pickHeaders(r.headers),
      })
      console.log(`  sort [${v.label}] → HTTP ${r.status}, ${n} contacts${!r.ok && r.error ? ' — ' + r.error.slice(0, 100) : ''}`)
      await sleep(350)
      if (r.ok && n > 0) { oldContacts = r.data.contacts.slice(0, 5); out.documents.oldestFetch.method = 'sort:' + v.label; break }
    }

    // Fallback: paginate the default ordering to the last page. GHL needs BOTH
    // startAfter (ms ts) and startAfterId to advance (per the meta.nextPageUrl shape).
    if (!oldContacts.length) {
      console.log('  sort variants yielded nothing — paginating to the last page (default order)')
      let lastPage = [], pages = 0, sAfter = null, sAfterId = null
      const MAX_PAGES = 40 // 40 × 100 = 4000 ≥ 3,261 contacts
      while (pages < MAX_PAGES) {
        const params = { locationId: cfg.locationId, limit: 100 }
        if (sAfterId) { params.startAfterId = sAfterId; if (sAfter != null) params.startAfter = sAfter }
        const r = await ghlGet(cfg.apiKey, '/contacts/', params)
        await sleep(300)
        if (!r.ok) { console.log(`\n  pagination stopped at page ${pages + 1}: HTTP ${r.status}${r.error ? ' — ' + r.error.slice(0, 100) : ''}`); break }
        const page = r.data?.contacts || []
        if (!page.length) break
        lastPage = page
        pages++
        const meta = r.data?.meta || {}
        sAfterId = meta.startAfterId || page[page.length - 1]?.id
        sAfter = (meta.startAfter != null) ? meta.startAfter : (page[page.length - 1]?.dateAdded ? Date.parse(page[page.length - 1].dateAdded) : null)
        process.stdout.write(`\r  paginated ${pages} page(s)…`)
        if (!meta.nextPageUrl || page.length < 100) break
      }
      console.log('')
      oldContacts = lastPage.slice(-5) // tail of last page = oldest under desc order
      out.documents.oldestFetch.method = `pagination(last of ${pages} page(s))`
      out.documents.oldestFetch.attempts.push({ label: 'pagination-fallback', pages, returned: oldContacts.length })
    }

    // Optional explicit OLD contact (hedge if both sort + pagination disappoint).
    if (cfg.oldContactId) {
      const oneRes = await ghlGet(cfg.apiKey, `/contacts/${cfg.oldContactId}`); await sleep(300)
      const one = oneRes.ok ? (oneRes.data?.contact || oneRes.data) : null
      out.probes.push(probe('contacts.oldContactFlag', '/contacts/{id}', oneRes, 'explicit --old-contact'))
      if (one) oldContacts = [one, ...oldContacts]
    }

    let withFileFields = 0
    let sampleUrlSigned = null
    for (let i = 0; i < oldContacts.length; i++) {
      const c = oldContacts[i]
      const id = c.id
      // Re-fetch the single contact so customFields are complete.
      const fullRes = await ghlGet(cfg.apiKey, `/contacts/${id}`); await sleep(300)
      const full = fullRes.ok ? (fullRes.data?.contact || fullRes.data) : c
      const cfs = Array.isArray(full?.customFields) ? full.customFields : []

      // Detect file-like custom-field values: URL strings, arrays of URLs, or
      // objects carrying a url/fileUrl/documentUrl, plus file-ish field keys.
      const fileEntries = []
      for (const cf of cfs) {
        const v = cf.value ?? cf.fieldValue
        const candidates = []
        if (typeof v === 'string') candidates.push(v)
        else if (Array.isArray(v)) v.forEach(x => candidates.push(typeof x === 'string' ? x : (x && (x.url || x.fileUrl || x.documentUrl)) || ''))
        else if (v && typeof v === 'object') candidates.push(v.url || v.fileUrl || v.documentUrl || '')
        let matchedUrl = null
        for (const cand of candidates) {
          if (typeof cand === 'string' && /^https?:\/\//i.test(cand)) { matchedUrl = cand; break }
        }
        if (matchedUrl) fileEntries.push({ fieldId: cf.id, fieldKey: cf.fieldKey, url: matchedUrl })
        else if (/file|document|upload|attach|scan/i.test(`${cf.fieldKey || ''} ${cf.id || ''}`)) {
          fileEntries.push({ fieldId: cf.id, fieldKey: cf.fieldKey, url: null, note: 'file-like key, non-URL value' })
        }
      }

      // HEAD the FIRST resolvable URL across the whole oldest set, once, to
      // confirm reachability + whether it is a signed/expiring URL. No download.
      let headChecked = null
      const firstUrl = fileEntries.find(e => e.url)?.url
      if (firstUrl && sampleUrlSigned === null) {
        let signParamNames = []
        try { signParamNames = [...new URL(firstUrl).searchParams.keys()] } catch {}
        const signed = /[?&](token|signature|expires|expiry|X-Amz-|GoogleAccessId|Signature|se=|sig=)/i.test(firstUrl)
        let headStatus = null
        try { headStatus = (await fetch(firstUrl, { method: 'HEAD' })).status }
        catch (e) { headStatus = `HEAD failed: ${(e.message || '').slice(0, 60)}` }
        headChecked = { signed, signParamNames, headStatus }   // param NAMES only, no values
        sampleUrlSigned = signed
      }

      if (fileEntries.length) withFileFields++
      out.documents.oldestContacts.push({
        id,
        dateAdded: full?.dateAdded || c?.dateAdded || null,
        customFieldCount: cfs.length,
        fileFieldsFound: fileEntries.length,
        // store field identity + presence flags, not raw URL values (minimize PHI on disk)
        fileEntries: fileEntries.map(e => ({ fieldId: e.fieldId, fieldKey: e.fieldKey, hasUrl: !!e.url, note: e.note || null })),
        headChecked,
      })
      process.stdout.write(`\r  [${i + 1}/${oldContacts.length}] ${String(id).slice(0, 24).padEnd(24)} — ${fileEntries.length} file field(s)`)
    }
    out.documents.oldestSummary = { probed: oldContacts.length, withFileFields, sampleUrlSigned }
    console.log(`\n  oldest contacts with file custom fields: ${withFileFields}/${oldContacts.length}; sample URL signed: ${sampleUrlSigned === null ? 'n/a' : (sampleUrlSigned ? 'yes' : 'no')}`)
  } else {
    console.log('  skipped (sampleSize < 10)')
  }

  // ── 7. Summary + write file ───────────────────────────────────────────────
  out.summary = {
    contactsFetched: contacts.length,
    contactsWithNotes: out.contacts.filter(c => Array.isArray(c.notes.data) && c.notes.data.length).length,
    contactsWithTasks: out.contacts.filter(c => Array.isArray(c.tasks.data) && c.tasks.data.length).length,
    contactsWithDocuments: out.contacts.filter(c => Array.isArray(c.documents.data) && c.documents.data.length).length,
    uniqueTags: out.tags.all.length,
    opportunitiesEndpoint: out.opportunities.ok ? 'present' : `unavailable (${out.opportunities.status})`,
    paymentsOrdersEndpoint: out.payments.ok ? 'present' : `unavailable (${out.payments.status})`,
    structuredPaymentsLikely: out.opportunities.ok || out.payments.ok,
    // Step 5/6 document discovery
    mediaLibraryReturned: mediaFiles.length,
    mediaLibraryTotal: mediaTotal,
    fileUploadCustomFields: out.documents.fileUploadFields.length,
    oldestContactsProbed: out.documents.oldestSummary.probed,
    oldestContactsWithFileFields: out.documents.oldestSummary.withFileFields,
    sampleFileUrlSigned: out.documents.oldestSummary.sampleUrlSigned === null ? 'n/a' : (out.documents.oldestSummary.sampleUrlSigned ? 'yes' : 'no'),
    notesWithInlineFileUrls: out.documents.notesWithFileUrls.count,
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
  console.log('├──────────────────────────── documents ──────────────────┤')
  console.log(`│  Media library files:     ${String(out.summary.mediaLibraryReturned + ' (total ~' + out.summary.mediaLibraryTotal + ')').padEnd(31)}│`)
  console.log(`│  File-upload cust. fields:${String(out.summary.fileUploadCustomFields).padEnd(31)}│`)
  console.log(`│  Oldest w/ file fields:   ${String(out.summary.oldestContactsWithFileFields + '/' + out.summary.oldestContactsProbed).padEnd(31)}│`)
  console.log(`│  Sample file URL signed:  ${String(out.summary.sampleFileUrlSigned).padEnd(31)}│`)
  console.log(`│  Notes w/ inline file URL:${String(out.summary.notesWithInlineFileUrls).padEnd(31)}│`)
  console.log('└──────────────────────────────────────────────────────────┘')
  console.log(`\n  Wrote: ${path.relative(ROOT_DIR, cfg.outPath)}  (gitignored — keep local)`)
  console.log('  Safe to share: the summary box above. Do NOT paste the JSON file.\n')
}

main().catch(err => { console.error('\nExploration failed:', err.message); process.exit(1) })
