#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — Fetch Documents via GHL Documents API (v2)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Uses the GHL v2 Documents endpoint:
 *    GET /contacts/{contactId}/documents
 *    Header: Version: 2021-07-28
 *
 *  For each document found:
 *    1. Downloads the file via its signed URL
 *    2. Uploads to Supabase Storage "documents" bucket under {contactId}/
 *    3. Saves record in the documents table
 *
 *  Reads credentials from .env automatically.
 *
 *  Usage:
 *    node scripts/fetch-documents.mjs              # run on all contacts
 *    node scripts/fetch-documents.mjs --limit=5    # test on 5 contacts
 *    node scripts/fetch-documents.mjs --dry-run    # preview only
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')
const EXPORT_DIR = path.join(ROOT_DIR, 'export')

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
function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )

  const apiKey      = args['api-key']      || process.env.GHL_API_KEY
  const supabaseUrl = args['supabase-url'] || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = args['supabase-key'] || process.env.SUPABASE_SERVICE_KEY
  const userId      = args['user-id']      || process.env.VELO_USER_ID
  const apiVersion  = args['api-version']  || '2021-07-28'
  const dryRun      = args['dry-run'] === true || args['dry-run'] === 'true'
  const limit       = parseInt(args['limit']) || 0

  if (!apiKey || !supabaseUrl || !supabaseKey || !userId) {
    const missing = []
    if (!apiKey) missing.push('GHL_API_KEY')
    if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
    if (!supabaseKey) missing.push('SUPABASE_SERVICE_KEY')
    if (!userId) missing.push('VELO_USER_ID')
    console.error(`\n  Missing in .env: ${missing.join(', ')}`)
    console.error('  See .env.example or pass via --api-key, --supabase-url, etc.\n')
    process.exit(1)
  }

  return { apiKey, supabaseUrl, supabaseKey, userId, apiVersion, dryRun, limit }
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

// ─── GHL API ────────────────────────────────────────────────────────────────
async function ghlGet(apiKey, apiVersion, endpoint, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch('https://services.leadconnectorhq.com' + endpoint, {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Version': apiVersion,
        'Content-Type': 'application/json',
      },
    })

    if (res.status === 429) {
      const wait = attempt * 30
      process.stdout.write(` [429 rate-limit, waiting ${wait}s]`)
      await sleep(wait * 1000)
      continue
    }

    if (!res.ok) {
      if (res.status === 404 || res.status === 422) return null
      const body = await res.text().catch(() => '')
      throw new Error(`GHL ${res.status} on ${endpoint}: ${body.slice(0, 200)}`)
    }

    return res.json()
  }
  return null
}

// ─── Download file from signed URL ──────────────────────────────────────────
async function downloadFile(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    return { buffer, contentType }
  } catch {
    return null
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const config = getConfig()

  console.log()
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log('│  Velo CRM — Fetch Documents (GHL Documents API v2)  │')
  if (config.dryRun) {
    console.log('│  >> DRY RUN — no data will be written               │')
  }
  console.log('└──────────────────────────────────────────────────────┘')
  console.log()

  const supabase = createClient(config.supabaseUrl, config.supabaseKey)

  // Ensure storage bucket exists
  if (!config.dryRun) {
    const { error } = await supabase.storage.createBucket('documents', { public: false })
    if (error && !error.message?.includes('already exists')) {
      console.log('  Bucket note:', error.message)
    }
  }

  // ── Step 1: Load Supabase contacts ──────────────────────────────────────
  console.log('Step 1/3 — Loading contacts from Supabase')
  const allContacts = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone')
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

  // ── Step 2: Read GHL contact IDs from export ────────────────────────────
  console.log('\nStep 2/3 — Reading GHL export records')
  const contactsDir = path.join(EXPORT_DIR, 'contacts')
  const ghlContacts = []

  if (fs.existsSync(contactsDir)) {
    for (const f of fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(contactsDir, f), 'utf8'))
        ghlContacts.push({
          ghlId: data.contactId || f.replace('.json', ''),
          name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          phone: data.phone || '',
        })
      } catch {}
    }
  }

  let targets = ghlContacts
  if (config.limit > 0) targets = ghlContacts.slice(0, config.limit)
  console.log(`  ${targets.length} contacts to process${config.limit ? ` (limited to ${config.limit})` : ''}`)

  // ── Step 3: Fetch documents via GHL Documents API ───────────────────────
  console.log('\nStep 3/3 — Fetching documents via GET /contacts/{id}/documents\n')

  let totalFound = 0
  let totalUploaded = 0
  let contactsWithDocs = 0
  let skippedNoMatch = 0
  let skippedDuplicate = 0
  const errors = []

  for (let i = 0; i < targets.length; i++) {
    const gc = targets[i]
    const label = (gc.name || 'Unknown').slice(0, 30).padEnd(30)
    process.stdout.write(`\r  [${i + 1}/${targets.length}] ${label}`)

    // Match to Supabase contact by phone
    const normPhone = normalizePhone(gc.phone)
    const supaContact = phoneToContact.get(normPhone)
    if (!supaContact) {
      skippedNoMatch++
      continue
    }

    try {
      // ── Call GHL Documents API ──
      const docsRes = await ghlGet(config.apiKey, config.apiVersion, `/contacts/${gc.ghlId}/documents`)
      await sleep(500)

      if (!docsRes) continue

      // Handle various response shapes
      const docs = docsRes.documents || docsRes.data || (Array.isArray(docsRes) ? docsRes : [])
      if (!Array.isArray(docs) || docs.length === 0) continue

      contactsWithDocs++
      totalFound += docs.length

      if (config.dryRun) {
        for (const doc of docs) {
          const name = doc.name || doc.fileName || doc.title || 'unnamed'
          const size = doc.size ? ` (${formatSize(doc.size)})` : ''
          console.log(`\n    [DRY] ${gc.name}: ${name}${size}`)
          if (doc.url || doc.fileUrl || doc.signedUrl) {
            console.log(`          URL: ${(doc.url || doc.fileUrl || doc.signedUrl).slice(0, 80)}...`)
          }
        }
        continue
      }

      // Check which documents already exist in DB for this contact
      const { data: existing } = await supabase
        .from('documents')
        .select('filename')
        .eq('contact_id', supaContact.id)
      const existingNames = new Set((existing || []).map(d => d.filename))

      for (const doc of docs) {
        const rawName = doc.name || doc.fileName || doc.title || 'unnamed'
        const filename = sanitizeFilename(rawName)
        const docUrl = doc.url || doc.fileUrl || doc.signedUrl || ''

        // Skip duplicates
        if (existingNames.has(filename)) {
          skippedDuplicate++
          continue
        }

        if (!docUrl) {
          errors.push({ contact: gc.name, error: `No URL for: ${rawName}` })
          continue
        }

        // Download the file via signed URL
        const downloaded = await downloadFile(docUrl)
        if (!downloaded) {
          errors.push({ contact: gc.name, error: `Download failed: ${docUrl.slice(0, 60)}` })
          continue
        }

        // Upload to Supabase Storage: documents/{contactId}/{filename}
        const storagePath = `${supaContact.id}/${filename}`
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, downloaded.buffer, {
            contentType: downloaded.contentType,
            upsert: false,
          })

        if (uploadErr) {
          if (uploadErr.message?.includes('already exists')) {
            skippedDuplicate++
            continue
          }
          errors.push({ contact: gc.name, error: `Upload: ${uploadErr.message}` })
          continue
        }

        // Insert record in documents table
        const { error: insertErr } = await supabase
          .from('documents')
          .insert({
            contact_id: supaContact.id,
            filename,
            size: downloaded.buffer.length,
            url: storagePath,
            uploaded_at: new Date().toISOString(),
          })

        if (insertErr) {
          errors.push({ contact: gc.name, error: `DB: ${insertErr.message}` })
          continue
        }

        totalUploaded++
        existingNames.add(filename)
        await sleep(200)
      }

      await sleep(500)
    } catch (err) {
      errors.push({ contact: gc.name, error: err.message?.slice(0, 100) || String(err) })
      if (err.message?.includes('429')) await sleep(20000)
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n')
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log(`│  Document Fetch Complete ${config.dryRun ? '(DRY RUN) ' : ''}`)
  console.log('├──────────────────────────────────────────────────────┤')
  console.log(`│  Contacts processed:    ${String(targets.length).padEnd(28)}│`)
  console.log(`│  Contacts with docs:    ${String(contactsWithDocs).padEnd(28)}│`)
  console.log(`│  Documents found:       ${String(totalFound).padEnd(28)}│`)
  console.log(`│  Uploaded to storage:   ${String(totalUploaded).padEnd(28)}│`)
  console.log(`│  Skipped (no match):    ${String(skippedNoMatch).padEnd(28)}│`)
  console.log(`│  Skipped (duplicate):   ${String(skippedDuplicate).padEnd(28)}│`)
  console.log(`│  Errors:                ${String(errors.length).padEnd(28)}│`)
  console.log('└──────────────────────────────────────────────────────┘')

  if (errors.length > 0) {
    console.log('\nErrors (first 20):')
    errors.slice(0, 20).forEach(e => console.log(`  ! ${e.contact}: ${e.error}`))
  }

  if (config.dryRun) {
    console.log('\nThis was a dry run. Remove --dry-run to upload files.')
  } else if (totalUploaded > 0) {
    console.log('\nDone! Documents uploaded and records saved.')
  }
  console.log()
}

main().catch(err => { console.error('\nFailed:', err.message); process.exit(1) })
