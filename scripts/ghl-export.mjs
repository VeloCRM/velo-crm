#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — GoHighLevel Data Export (Dental Clinic)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Exports from GHL:
 *    1. All contacts (patients) → patients.csv
 *    2. All notes per contact   → notes/[contact-id].json
 *    3. All documents/files     → documents/[contact-name]/
 *
 *  Usage:
 *    1. Get your GHL API key from Settings → Business Profile → API Keys
 *    2. Get your Location ID from Settings → Business Profile
 *    3. Run:
 *       node scripts/ghl-export.mjs --api-key=YOUR_KEY --location-id=YOUR_LOC_ID
 *
 *    Or set environment variables:
 *       GHL_API_KEY=xxx GHL_LOCATION_ID=yyy node scripts/ghl-export.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

// ─── Parse CLI args or env vars ──────────────────────────────────────────────
function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k, v] = a.slice(2).split('='); return [k, v || true] })
  )

  const apiKey = args['api-key'] || process.env.GHL_API_KEY
  const locationId = args['location-id'] || process.env.GHL_LOCATION_ID
  const apiVersion = args['api-version'] || '2021-07-28'

  if (!apiKey || !locationId) {
    console.error(`
╔═══════════════════════════════════════════════════════════╗
║  Missing required configuration                          ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Provide your GHL credentials via CLI args or env vars:   ║
║                                                           ║
║  Option 1 — CLI:                                          ║
║    node scripts/ghl-export.mjs \\                          ║
║      --api-key=YOUR_API_KEY \\                             ║
║      --location-id=YOUR_LOCATION_ID                       ║
║                                                           ║
║  Option 2 — Environment:                                  ║
║    GHL_API_KEY=xxx GHL_LOCATION_ID=yyy \\                  ║
║      node scripts/ghl-export.mjs                          ║
║                                                           ║
║  Where to find these:                                     ║
║    API Key     → GHL Settings → Business Profile          ║
║    Location ID → GHL Settings → Business Profile → URL    ║
╚═══════════════════════════════════════════════════════════╝
`)
    process.exit(1)
  }

  return { apiKey, locationId, apiVersion }
}

// ─── GHL API client ──────────────────────────────────────────────────────────
function createClient(apiKey, apiVersion) {
  const BASE = 'https://services.leadconnectorhq.com'

  async function request(endpoint, params = {}) {
    const url = new URL(endpoint, BASE)
    Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v) })

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': apiVersion,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GHL API ${res.status}: ${endpoint} — ${body.slice(0, 200)}`)
    }

    return res.json()
  }

  return { request }
}

// ─── Fetch all contacts with pagination ──────────────────────────────────────
async function fetchAllContacts(client, locationId) {
  const all = []
  let startAfter = null
  let page = 0

  console.log('  Fetching contacts...')

  while (true) {
    page++
    const params = { locationId, limit: 100 }
    if (startAfter) params.startAfterId = startAfter

    const data = await client.request('/contacts/', params)
    const contacts = data.contacts || []

    if (contacts.length === 0) break

    all.push(...contacts)
    startAfter = contacts[contacts.length - 1].id
    process.stdout.write(`\r  Fetched ${all.length} contacts (page ${page})...`)

    // GHL rate limit: ~100 req/min — add small delay
    await sleep(300)
  }

  console.log(`\r  ✓ Fetched ${all.length} contacts total       `)
  return all
}

// ─── Fetch notes for a single contact ────────────────────────────────────────
async function fetchContactNotes(client, contactId) {
  try {
    const data = await client.request(`/contacts/${contactId}/notes`)
    return data.notes || []
  } catch (err) {
    // Some contacts may not have notes endpoint access
    if (err.message.includes('404') || err.message.includes('422')) return []
    throw err
  }
}

// ─── Fetch tasks/activities for a single contact ─────────────────────────────
async function fetchContactTasks(client, contactId) {
  try {
    const data = await client.request(`/contacts/${contactId}/tasks`)
    return data.tasks || []
  } catch {
    return []
  }
}

// ─── Download a file from URL ────────────────────────────────────────────────
async function downloadFile(url, destPath) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(destPath, buffer)
    return true
  } catch {
    return false
  }
}

// ─── Sanitize filename ───────────────────────────────────────────────────────
function sanitizeFilename(name) {
  return (name || 'unnamed')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100) || 'unnamed'
}

// ─── CSV escape ──────────────────────────────────────────────────────────────
function csvEscape(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Main export flow ────────────────────────────────────────────────────────
async function main() {
  const config = getConfig()
  const client = createClient(config.apiKey, config.apiVersion)

  console.log()
  console.log('┌─────────────────────────────────────────────┐')
  console.log('│  Velo CRM — GHL Dental Clinic Export        │')
  console.log('└─────────────────────────────────────────────┘')
  console.log()

  // Create export directories
  const dirs = {
    root: EXPORT_DIR,
    notes: path.join(EXPORT_DIR, 'notes'),
    docs: path.join(EXPORT_DIR, 'documents'),
  }
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }))

  // Step 1: Fetch all contacts
  console.log('Step 1/3 — Fetching contacts')
  const contacts = await fetchAllContacts(client, config.locationId)

  // Step 2: Export patients.csv
  console.log('\nStep 2/3 — Exporting patients.csv')
  const csvHeader = 'id,name,first_name,last_name,email,phone,date_added,tags,source'
  const csvRows = contacts.map(c => [
    c.id,
    csvEscape(`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.name || 'Unknown'),
    csvEscape(c.firstName || ''),
    csvEscape(c.lastName || ''),
    csvEscape(c.email || ''),
    csvEscape(c.phone || ''),
    csvEscape(c.dateAdded || c.createdAt || ''),
    csvEscape((c.tags || []).join('; ')),
    csvEscape(c.source || ''),
  ].join(','))

  fs.writeFileSync(
    path.join(dirs.root, 'patients.csv'),
    [csvHeader, ...csvRows].join('\n'),
    'utf8'
  )
  console.log(`  ✓ Exported ${contacts.length} patients to patients.csv`)

  // Step 3: Fetch notes + documents per contact
  console.log('\nStep 3/3 — Fetching notes & documents per patient')
  let totalNotes = 0
  let totalDocs = 0
  const errors = []

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.name || 'Unknown'

    process.stdout.write(`\r  Processing ${i + 1}/${contacts.length}: ${name.slice(0, 30).padEnd(30)}`)

    try {
      // Fetch notes
      const notes = await fetchContactNotes(client, c.id)
      const tasks = await fetchContactTasks(client, c.id)

      const allNotes = [
        ...notes.map(n => ({
          id: n.id,
          body: n.body || '',
          dateAdded: n.dateAdded || n.createdAt || '',
          userId: n.userId || '',
        })),
        ...tasks.map(t => ({
          id: t.id,
          body: `[Task] ${t.title || ''}: ${t.description || ''}`,
          dateAdded: t.dueDate || t.createdAt || '',
          completed: t.completed || false,
        })),
      ]

      if (allNotes.length > 0) {
        fs.writeFileSync(
          path.join(dirs.notes, `${c.id}.json`),
          JSON.stringify({
            contactId: c.id,
            contactName: name,
            exportedAt: new Date().toISOString(),
            notes: allNotes,
          }, null, 2),
          'utf8'
        )
        totalNotes += allNotes.length
      }

      // Check for documents in custom fields or attachments
      const docUrls = []

      // GHL stores files in customFields with field type "FILE_UPLOAD"
      if (c.customFields && Array.isArray(c.customFields)) {
        for (const cf of c.customFields) {
          if (cf.value && typeof cf.value === 'string' && (cf.value.startsWith('http') || cf.value.includes('storage.googleapis.com'))) {
            docUrls.push({ url: cf.value, name: cf.fieldKey || 'document' })
          }
          // Some custom fields store arrays of file URLs
          if (Array.isArray(cf.value)) {
            for (const v of cf.value) {
              if (typeof v === 'string' && v.startsWith('http')) {
                docUrls.push({ url: v, name: cf.fieldKey || 'document' })
              }
            }
          }
        }
      }

      // Also check attachments field if present
      if (c.attachments && Array.isArray(c.attachments)) {
        for (const att of c.attachments) {
          if (att.url) docUrls.push({ url: att.url, name: att.name || att.fileName || 'attachment' })
        }
      }

      if (docUrls.length > 0) {
        const contactDir = path.join(dirs.docs, sanitizeFilename(name))
        fs.mkdirSync(contactDir, { recursive: true })

        for (const doc of docUrls) {
          const ext = path.extname(new URL(doc.url).pathname) || '.pdf'
          const fname = sanitizeFilename(doc.name) + ext
          const ok = await downloadFile(doc.url, path.join(contactDir, fname))
          if (ok) totalDocs++
        }
      }

    } catch (err) {
      errors.push({ contact: name, error: err.message })
    }

    // Rate limit
    await sleep(400)
  }

  // Summary
  console.log('\n')
  console.log('┌─────────────────────────────────────────────┐')
  console.log('│  Export Complete                             │')
  console.log('├─────────────────────────────────────────────┤')
  console.log(`│  Patients:  ${String(contacts.length).padEnd(32)}│`)
  console.log(`│  Notes:     ${String(totalNotes).padEnd(32)}│`)
  console.log(`│  Documents: ${String(totalDocs).padEnd(32)}│`)
  console.log(`│  Errors:    ${String(errors.length).padEnd(32)}│`)
  console.log('├─────────────────────────────────────────────┤')
  console.log(`│  Output:    export/                         │`)
  console.log('└─────────────────────────────────────────────┘')

  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(e => console.log(`  ⚠ ${e.contact}: ${e.error.slice(0, 80)}`))
  }

  // Save export metadata
  fs.writeFileSync(
    path.join(dirs.root, '_export_meta.json'),
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      source: 'GoHighLevel',
      locationId: config.locationId,
      totalContacts: contacts.length,
      totalNotes,
      totalDocuments: totalDocs,
      errors: errors.length,
    }, null, 2),
    'utf8'
  )

  console.log('\nNext step: run the import script to load into Velo CRM:')
  console.log('  node scripts/velo-import.mjs --supabase-url=YOUR_URL --supabase-key=YOUR_SERVICE_KEY')
  console.log()
}

main().catch(err => {
  console.error('\n✗ Export failed:', err.message)
  process.exit(1)
})
