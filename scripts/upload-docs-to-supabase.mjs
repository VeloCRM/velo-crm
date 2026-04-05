#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Upload Downloaded GHL Documents to Supabase Storage
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Reads files from export/documents/{contactName}/
 *  Matches each folder to a Supabase contact by phone (via GHL export)
 *  Uploads to Supabase Storage "documents" bucket: {contactId}/{filename}
 *  Inserts a record in the documents table
 *  Updates the contact's notes JSON with document metadata
 *
 *  Usage:
 *    node scripts/upload-docs-to-supabase.mjs              # upload all
 *    node scripts/upload-docs-to-supabase.mjs --dry-run    # preview only
 *    node scripts/upload-docs-to-supabase.mjs --limit=5    # test on 5
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')
const EXPORT_DIR = path.join(ROOT_DIR, 'export')
const DOCS_DIR = path.join(EXPORT_DIR, 'documents')

// ─── Load .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env')
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
loadEnv()

// ─── Config ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--'))
    .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const USER_ID = process.env.VELO_USER_ID
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true'
const LIMIT = parseInt(args['limit']) || 0

if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
  const missing = []
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_KEY')
  if (!USER_ID) missing.push('VELO_USER_ID')
  console.error(`\n  Missing in .env: ${missing.join(', ')}\n`)
  process.exit(1)
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function normalizePhone(p) {
  return (p || '').replace(/[\s\-()]/g, '').replace(/^\+964/, '0').replace(/^964/, '0')
}

function sanitizeFilename(n) {
  return (n || 'unnamed').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/_{2,}/g, '_').slice(0, 100) || 'unnamed'
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function contentTypeFromExt(ext) {
  const map = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain', '.csv': 'text/csv',
    '.mp4': 'video/mp4', '.zip': 'application/zip',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

function parseNotesJson(notes) {
  if (!notes) return { bio: '', timeline: [], documents: [] }
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes
    return {
      bio: parsed.bio || '',
      timeline: parsed.timeline || [],
      documents: parsed.documents || [],
    }
  } catch {
    return { bio: typeof notes === 'string' ? notes : '', timeline: [], documents: [] }
  }
}

// ─── Build GHL name → phone lookup from export ─────────────────────────────
function parseCSVLine(line) {
  const cols = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue }
    cur += ch
  }
  cols.push(cur)
  return cols
}

function sanitizeFolderName(name) {
  return (name || 'unnamed')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'unnamed'
}

function loadGhlContacts() {
  const contacts = []

  // Primary source: patients.csv (all 3,171 contacts)
  const csvPath = path.join(EXPORT_DIR, 'patients.csv')
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim())
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (!cols[0]) continue
      const name = `${cols[1] || ''} ${cols[2] || ''}`.trim() || 'Unknown'
      contacts.push({
        ghlId: cols[0],
        name,
        phone: cols[3] || '',
        folderName: sanitizeFolderName(name),
      })
    }
    return contacts
  }

  // Fallback: contacts dir JSONs
  const contactsDir = path.join(EXPORT_DIR, 'contacts')
  for (const f of fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(contactsDir, f), 'utf8'))
      const name = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown'
      contacts.push({
        ghlId: data.contactId || f.replace('.json', ''),
        name,
        phone: data.phone || '',
        folderName: sanitizeFolderName(name),
      })
    } catch {}
  }
  return contacts
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log()
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log('│  Upload Documents to Supabase Storage                │')
  if (DRY_RUN) {
    console.log('│  >> DRY RUN — no data will be written               │')
  }
  console.log('└──────────────────────────────────────────────────────┘')
  console.log()

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Ensure storage bucket exists
  if (!DRY_RUN) {
    const { error } = await supabase.storage.createBucket('documents', { public: false })
    if (error && !error.message?.includes('already exists')) {
      console.log('  Bucket note:', error.message)
    }
  }

  // ── Step 1: Load Supabase contacts ──────────────────────────────────────
  console.log('Step 1/4 — Loading contacts from Supabase')
  const allContacts = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone, notes')
      .eq('source', 'ghl_import')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    allContacts.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`  ${allContacts.length} imported contacts in Supabase`)

  // Phone → Supabase contact map
  const phoneToContact = new Map()
  for (const c of allContacts) {
    const norm = normalizePhone(c.phone)
    if (norm && norm.length >= 7) phoneToContact.set(norm, c)
  }

  // ── Step 2: Load GHL export data and match folders ──────────────────────
  console.log('\nStep 2/4 — Matching download folders to Supabase contacts')
  const ghlContacts = loadGhlContacts()

  // Also build name → Supabase contact map for contacts without phone matches
  const nameToContact = new Map()
  for (const c of allContacts) {
    if (c.name) nameToContact.set(c.name.trim().toLowerCase(), c)
  }

  // Map folder name → supabase contact (by phone first, then by name)
  const folderToSupaContact = new Map()
  let matchCount = 0
  for (const gc of ghlContacts) {
    const norm = normalizePhone(gc.phone)
    const supaContact = phoneToContact.get(norm) || nameToContact.get(gc.name.trim().toLowerCase())
    if (supaContact) {
      // Map both raw name and sanitized folder name (download script uses sanitized)
      folderToSupaContact.set(gc.name, supaContact)
      folderToSupaContact.set(gc.folderName, supaContact)
      matchCount++
    }
  }
  console.log(`  ${matchCount} GHL contacts matched to Supabase contacts`)

  // ── Step 3: Scan download folders ───────────────────────────────────────
  console.log('\nStep 3/4 — Scanning downloaded documents')
  if (!fs.existsSync(DOCS_DIR)) {
    console.error('  No documents directory found at:', DOCS_DIR)
    process.exit(1)
  }

  const folders = fs.readdirSync(DOCS_DIR).filter(f =>
    fs.statSync(path.join(DOCS_DIR, f)).isDirectory()
  )
  console.log(`  ${folders.length} contact folders found`)

  // ── Step 4: Upload to Supabase ──────────────────────────────────────────
  console.log(`\nStep 4/4 — Uploading to Supabase Storage${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  let totalFiles = 0
  let totalUploaded = 0
  let totalSkippedDuplicate = 0
  let totalSkippedNoMatch = 0
  let totalBytes = 0
  const errors = []

  const foldersToProcess = LIMIT > 0 ? folders.slice(0, LIMIT) : folders

  for (let i = 0; i < foldersToProcess.length; i++) {
    const folderName = foldersToProcess[i]
    const folderPath = path.join(DOCS_DIR, folderName)

    // Match folder to Supabase contact
    const supaContact = folderToSupaContact.get(folderName)
    if (!supaContact) {
      totalSkippedNoMatch++
      continue
    }

    const files = fs.readdirSync(folderPath).filter(f =>
      fs.statSync(path.join(folderPath, f)).isFile() &&
      fs.statSync(path.join(folderPath, f)).size > 0
    )
    if (files.length === 0) continue

    totalFiles += files.length
    const label = (supaContact.name || folderName).slice(0, 35).padEnd(35)
    process.stdout.write(`  [${i + 1}/${foldersToProcess.length}] ${label}`)

    if (DRY_RUN) {
      console.log(` — ${files.length} files (dry run)`)
      for (const f of files) {
        const size = fs.statSync(path.join(folderPath, f)).size
        console.log(`    ${f} (${formatSize(size)})`)
      }
      continue
    }

    // Check which documents already exist in DB for this contact
    const { data: existing } = await supabase
      .from('documents')
      .select('filename')
      .eq('contact_id', supaContact.id)
    const existingNames = new Set((existing || []).map(d => d.filename))

    // Load current notes for updating documents array
    const parsed = parseNotesJson(supaContact.notes)
    const existingDocPaths = new Set(parsed.documents.map(d => d.path))
    let notesUpdated = false

    let uploaded = 0
    for (const fileName of files) {
      const filePath = path.join(folderPath, fileName)
      const safeName = sanitizeFilename(fileName)

      // Skip duplicates
      if (existingNames.has(safeName)) {
        totalSkippedDuplicate++
        continue
      }

      const fileBuffer = fs.readFileSync(filePath)
      const ext = path.extname(fileName)
      const contentType = contentTypeFromExt(ext)
      const storagePath = `${supaContact.id}/${safeName}`

      // Skip if already in storage (via notes check)
      if (existingDocPaths.has(storagePath)) {
        totalSkippedDuplicate++
        continue
      }

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, fileBuffer, { contentType, upsert: false })

      if (uploadErr) {
        if (uploadErr.message?.includes('already exists')) {
          totalSkippedDuplicate++
          continue
        }
        errors.push({ contact: supaContact.name, file: fileName, error: `Upload: ${uploadErr.message}` })
        continue
      }

      // Insert record in documents table
      const { error: insertErr } = await supabase
        .from('documents')
        .insert({
          contact_id: supaContact.id,
          filename: safeName,
          size: fileBuffer.length,
          url: storagePath,
          uploaded_at: new Date().toISOString(),
        })

      if (insertErr) {
        errors.push({ contact: supaContact.name, file: fileName, error: `DB: ${insertErr.message}` })
        continue
      }

      // Add to notes documents array
      parsed.documents.push({
        id: 'doc_' + Date.now() + '_' + uploaded,
        name: fileName,
        size: formatSize(fileBuffer.length),
        path: storagePath,
        date: new Date().toLocaleDateString(),
      })
      notesUpdated = true

      uploaded++
      totalUploaded++
      totalBytes += fileBuffer.length
      existingNames.add(safeName)
      await sleep(100)
    }

    // Update contact notes if we added documents
    if (notesUpdated) {
      const { error: updateErr } = await supabase
        .from('contacts')
        .update({ notes: JSON.stringify(parsed) })
        .eq('id', supaContact.id)

      if (updateErr) {
        errors.push({ contact: supaContact.name, error: `Notes update: ${updateErr.message}` })
      }
    }

    process.stdout.write(` — ${uploaded} uploaded${totalSkippedDuplicate > 0 ? `, ${totalSkippedDuplicate} skipped` : ''}\n`)

    // Progress every 50 contacts
    if ((i + 1) % 50 === 0) {
      console.log(`\n  ── Progress: ${i + 1}/${foldersToProcess.length} folders, ${totalUploaded} uploaded, ${formatSize(totalBytes)} ──\n`)
    }

    await sleep(100)
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n')
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log(`│  Upload Complete ${DRY_RUN ? '(DRY RUN) ' : ''}`)
  console.log('├──────────────────────────────────────────────────────┤')
  console.log(`│  Contact folders:       ${String(foldersToProcess.length).padEnd(28)}│`)
  console.log(`│  Total files found:     ${String(totalFiles).padEnd(28)}│`)
  console.log(`│  Uploaded to Supabase:  ${String(totalUploaded).padEnd(28)}│`)
  console.log(`│  Total size uploaded:   ${formatSize(totalBytes).padEnd(28)}│`)
  console.log(`│  Skipped (no match):    ${String(totalSkippedNoMatch).padEnd(28)}│`)
  console.log(`│  Skipped (duplicate):   ${String(totalSkippedDuplicate).padEnd(28)}│`)
  console.log(`│  Errors:                ${String(errors.length).padEnd(28)}│`)
  console.log('└──────────────────────────────────────────────────────┘')

  if (errors.length > 0) {
    console.log('\nErrors (first 20):')
    errors.slice(0, 20).forEach(e =>
      console.log(`  ! ${e.contact}: ${e.file ? e.file + ' — ' : ''}${e.error}`)
    )
  }

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Remove --dry-run to upload files.')
  }
  console.log()
}

main().catch(err => { console.error('\nFailed:', err.message); process.exit(1) })
