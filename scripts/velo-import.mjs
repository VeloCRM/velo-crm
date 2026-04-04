#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — Import GHL Export into Supabase
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Reads from the export/ folder created by ghl-export.mjs and
 *  loads everything into your Velo CRM Supabase database:
 *
 *    - patients.csv       → contacts table
 *    - notes/*.json       → contact notes (stored as JSONB in contacts.notes + timeline)
 *    - documents/[name]/  → Supabase Storage bucket "documents"
 *
 *  Usage:
 *    node scripts/velo-import.mjs \
 *      --supabase-url=https://xxx.supabase.co \
 *      --supabase-key=YOUR_SERVICE_ROLE_KEY \
 *      --user-id=YOUR_USER_UUID
 *
 *    Or set environment variables:
 *      SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=yyy VELO_USER_ID=zzz \
 *        node scripts/velo-import.mjs
 *
 *  IMPORTANT: Use the Service Role key (not the anon key) so RLS is bypassed.
 *  The user-id is your Supabase auth user UUID — find it in Supabase Dashboard → Auth → Users.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

// ─── Parse CLI args or env vars ──────────────────────────────────────────────
function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k, v] = a.slice(2).split('='); return [k, v || true] })
  )

  const supabaseUrl = args['supabase-url'] || process.env.SUPABASE_URL
  const supabaseKey = args['supabase-key'] || process.env.SUPABASE_SERVICE_KEY
  const userId = args['user-id'] || process.env.VELO_USER_ID
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'

  if (!supabaseUrl || !supabaseKey || !userId) {
    console.error(`
╔═══════════════════════════════════════════════════════════════╗
║  Missing required configuration                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Provide your Supabase credentials:                           ║
║                                                               ║
║  node scripts/velo-import.mjs \\                               ║
║    --supabase-url=https://xxx.supabase.co \\                   ║
║    --supabase-key=YOUR_SERVICE_ROLE_KEY \\                     ║
║    --user-id=YOUR_AUTH_USER_UUID                               ║
║                                                               ║
║  Optional flags:                                              ║
║    --dry-run     Preview what will be imported (no writes)    ║
║                                                               ║
║  Where to find these:                                         ║
║    URL          → Supabase Dashboard → Settings → API         ║
║    Service Key  → Supabase Dashboard → Settings → API         ║
║    User ID      → Supabase Dashboard → Auth → Users           ║
╚═══════════════════════════════════════════════════════════════╝
`)
    process.exit(1)
  }

  return { supabaseUrl, supabaseKey, userId, dryRun }
}

// ─── Parse CSV (simple parser for our known format) ──────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',')
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = []
    let current = ''
    let inQuotes = false

    for (const char of lines[i]) {
      if (char === '"' && !inQuotes) { inQuotes = true; continue }
      if (char === '"' && inQuotes) { inQuotes = false; continue }
      if (char === ',' && !inQuotes) { values.push(current); current = ''; continue }
      current += char
    }
    values.push(current)

    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim() })
    rows.push(row)
  }

  return rows
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Main import flow ────────────────────────────────────────────────────────
async function main() {
  const config = getConfig()

  console.log()
  console.log('┌─────────────────────────────────────────────┐')
  console.log('│  Velo CRM — Import GHL Data into Supabase   │')
  if (config.dryRun) {
    console.log('│  ⚡ DRY RUN — no data will be written       │')
  }
  console.log('└─────────────────────────────────────────────┘')
  console.log()

  // Verify export folder exists
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error('✗ Export folder not found at:', EXPORT_DIR)
    console.error('  Run the export script first: node scripts/ghl-export.mjs')
    process.exit(1)
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseKey)

  // ── Step 1: Read patients.csv ────────────────────────────────────────────
  console.log('Step 1/3 — Reading patients.csv')
  const csvPath = path.join(EXPORT_DIR, 'patients.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('✗ patients.csv not found in export/')
    process.exit(1)
  }

  const patients = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  console.log(`  ✓ Found ${patients.length} patients`)

  // ── Step 2: Read all notes ───────────────────────────────────────────────
  console.log('\nStep 2/3 — Reading notes')
  const notesDir = path.join(EXPORT_DIR, 'notes')
  const notesMap = new Map() // ghl_contact_id → notes array

  if (fs.existsSync(notesDir)) {
    const noteFiles = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'))
    for (const f of noteFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(notesDir, f), 'utf8'))
        const contactId = f.replace('.json', '')
        notesMap.set(contactId, data.notes || [])
      } catch {}
    }
    console.log(`  ✓ Found notes for ${notesMap.size} patients`)
  } else {
    console.log('  ⚠ No notes folder found, skipping')
  }

  // ── Step 3: Import contacts ──────────────────────────────────────────────
  console.log('\nStep 3/3 — Importing into Supabase')

  const idMap = new Map() // ghl_id → supabase_id
  let imported = 0
  let skipped = 0
  let noteCount = 0
  let docCount = 0
  const errors = []

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i]
    const name = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown Patient'

    process.stdout.write(`\r  Importing ${i + 1}/${patients.length}: ${name.slice(0, 30).padEnd(30)}`)

    // Build notes text from exported notes
    const ghlNotes = notesMap.get(p.id) || []
    const notesText = ghlNotes
      .map(n => `[${n.dateAdded?.slice(0, 10) || 'no-date'}] ${n.body}`)
      .join('\n\n')

    // Build timeline entries (for Velo's notesTimeline format)
    const timeline = ghlNotes.map((n, idx) => ({
      id: `imported_${idx}`,
      text: n.body || '',
      date: n.dateAdded?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      author: 'GHL Import',
    }))

    const contactData = {
      user_id: config.userId,
      name,
      email: p.email || '',
      phone: p.phone || '',
      company: '', // GHL dental clinics usually don't have company per patient
      city: '',
      category: 'client',        // dental patients → client
      status: 'active',
      tags: p.tags ? p.tags.split(';').map(t => t.trim()).filter(Boolean) : [],
      source: p.source || 'ghl_import',
      notes: notesText.slice(0, 5000), // max 5000 chars for notes field
    }

    if (config.dryRun) {
      imported++
      noteCount += ghlNotes.length
      continue
    }

    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert(contactData)
        .select('id')
        .single()

      if (error) {
        // Check if duplicate (by email)
        if (error.code === '23505' && p.email) {
          skipped++
          continue
        }
        throw error
      }

      idMap.set(p.id, data.id)
      imported++
      noteCount += ghlNotes.length

    } catch (err) {
      errors.push({ patient: name, error: err.message || String(err) })
    }

    // Small delay to avoid rate limits
    if (i % 10 === 0) await sleep(100)
  }

  // ── Upload documents ─────────────────────────────────────────────────────
  const docsDir = path.join(EXPORT_DIR, 'documents')
  if (fs.existsSync(docsDir) && !config.dryRun) {
    console.log('\n\n  Uploading documents to Supabase Storage...')

    const patientDirs = fs.readdirSync(docsDir).filter(d =>
      fs.statSync(path.join(docsDir, d)).isDirectory()
    )

    for (const dir of patientDirs) {
      const files = fs.readdirSync(path.join(docsDir, dir))
      for (const file of files) {
        const filePath = path.join(docsDir, dir, file)
        const fileBuffer = fs.readFileSync(filePath)
        const storagePath = `imports/${dir}/${file}`

        try {
          const { error } = await supabase.storage
            .from('documents')
            .upload(storagePath, fileBuffer, { upsert: true })

          if (!error) docCount++
          else errors.push({ patient: dir, error: `Upload failed: ${file}` })
        } catch (err) {
          errors.push({ patient: dir, error: `Upload error: ${err.message}` })
        }

        await sleep(200)
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n')
  console.log('┌─────────────────────────────────────────────┐')
  console.log(`│  Import ${config.dryRun ? '(DRY RUN) ' : ''}Complete${' '.repeat(config.dryRun ? 19 : 28)}│`)
  console.log('├─────────────────────────────────────────────┤')
  console.log(`│  Imported:  ${String(imported).padEnd(32)}│`)
  console.log(`│  Skipped:   ${String(skipped).padEnd(32)}│`)
  console.log(`│  Notes:     ${String(noteCount).padEnd(32)}│`)
  console.log(`│  Documents: ${String(docCount).padEnd(32)}│`)
  console.log(`│  Errors:    ${String(errors.length).padEnd(32)}│`)
  console.log('└─────────────────────────────────────────────┘')

  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.slice(0, 20).forEach(e => console.log(`  ⚠ ${e.patient}: ${e.error.slice(0, 80)}`))
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`)
  }

  // Save import log
  const logPath = path.join(EXPORT_DIR, '_import_log.json')
  fs.writeFileSync(logPath, JSON.stringify({
    importedAt: new Date().toISOString(),
    dryRun: config.dryRun,
    imported,
    skipped,
    noteCount,
    docCount,
    errors,
  }, null, 2), 'utf8')

  console.log(`\nImport log saved to: export/_import_log.json`)

  if (config.dryRun) {
    console.log('\nThis was a dry run. To actually import, remove the --dry-run flag.')
  } else {
    console.log('\nDone! Open Velo CRM and check your contacts.')
  }

  console.log()
}

main().catch(err => {
  console.error('\n✗ Import failed:', err.message)
  process.exit(1)
})
