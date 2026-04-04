#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — Import GHL Dental Clinic into Supabase
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Reads from the export/ folder:
 *    - patients.csv (GHL format: Contact Id, First Name, Last Name, Phone, Email, Tags, etc.)
 *    - notes/[contact-id].json (fetched by ghl-fetch-notes.mjs)
 *    - documents/[name]/ (downloaded files)
 *
 *  Imports into Supabase:
 *    - contacts table (with doctor tag, notes, timeline)
 *    - Supabase Storage "documents" bucket
 *
 *  Usage:
 *    node scripts/velo-import.mjs \
 *      --supabase-url=https://xxx.supabase.co \
 *      --supabase-key=YOUR_SERVICE_ROLE_KEY \
 *      --user-id=YOUR_USER_UUID
 *
 *    Optional:
 *      --dry-run          Preview without writing
 *      --doctor=saif      Import only Dr Saif patients
 *      --doctor=hawkar    Import only Dr Hawkar patients
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )

  const supabaseUrl = args['supabase-url'] || process.env.SUPABASE_URL
  const supabaseKey = args['supabase-key'] || process.env.SUPABASE_SERVICE_KEY
  const userId = args['user-id'] || process.env.VELO_USER_ID
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'
  const doctorFilter = args['doctor'] || null // 'saif', 'hawkar', or null for all

  if (!supabaseUrl || !supabaseKey || !userId) {
    console.error(`
  Usage:
    node scripts/velo-import.mjs \\
      --supabase-url=https://xxx.supabase.co \\
      --supabase-key=YOUR_SERVICE_ROLE_KEY \\
      --user-id=YOUR_AUTH_USER_UUID

  Optional:
    --dry-run          Preview what will be imported (no writes)
    --doctor=saif      Only import Dr Saif patients
    --doctor=hawkar    Only import Dr Hawkar patients

  Where to find credentials:
    Supabase URL + Key  ->  Supabase Dashboard -> Settings -> API
    User ID             ->  Supabase Dashboard -> Auth -> Users -> click your user
`)
    process.exit(1)
  }

  return { supabaseUrl, supabaseKey, userId, dryRun, doctorFilter }
}

// Parse CSV with proper quote handling
function parseCSVRow(line) {
  const values = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
      inQuotes = !inQuotes; continue
    }
    if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue }
    current += ch
  }
  values.push(current)
  return values
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })
    rows.push(row)
  }
  return rows
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const config = getConfig()

  console.log()
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log('│  Velo CRM — Import GHL Dental Clinic into Supabase  │')
  if (config.dryRun) {
    console.log('│  >> DRY RUN — no data will be written               │')
  }
  if (config.doctorFilter) {
    console.log(`│  >> Filter: Dr ${config.doctorFilter} only${' '.repeat(35 - config.doctorFilter.length)}│`)
  }
  console.log('└──────────────────────────────────────────────────────┘')
  console.log()

  if (!fs.existsSync(EXPORT_DIR)) {
    console.error('Export folder not found at:', EXPORT_DIR)
    console.error('Run the export first: node scripts/ghl-fetch-notes.mjs ...')
    process.exit(1)
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseKey)

  // ── Step 1: Read patients.csv (GHL format) ──────────────────────────────
  console.log('Step 1/4 — Reading patients.csv')
  const csvPath = path.join(EXPORT_DIR, 'patients.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('patients.csv not found in export/')
    process.exit(1)
  }

  let patients = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  console.log(`  Total contacts in CSV: ${patients.length}`)

  // Count by doctor
  const drSaifAll = patients.filter(p => (p['Tags'] || '').toLowerCase().includes('saif'))
  const drHawkarAll = patients.filter(p => (p['Tags'] || '').toLowerCase().includes('hawkar'))
  console.log(`  Dr Saif:   ${drSaifAll.length}`)
  console.log(`  Dr Hawkar: ${drHawkarAll.length}`)

  // Apply doctor filter if specified
  if (config.doctorFilter) {
    patients = patients.filter(p => (p['Tags'] || '').toLowerCase().includes(config.doctorFilter.toLowerCase()))
    console.log(`  After filter: ${patients.length} patients`)
  }

  // ── Step 2: Read full contact records (from export/contacts/*.json) ─────
  console.log('\nStep 2/4 — Reading exported contact records')
  const contactsDir = path.join(EXPORT_DIR, 'contacts')
  const fullDataMap = new Map()

  if (fs.existsSync(contactsDir)) {
    const files = fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'))
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(contactsDir, f), 'utf8'))
        fullDataMap.set(f.replace('.json', ''), data)
      } catch {}
    }
    console.log(`  Full records found for ${fullDataMap.size} patients`)
  }

  // Fallback: also check old notes/ folder
  const notesDir = path.join(EXPORT_DIR, 'notes')
  const notesMap = new Map()
  if (fs.existsSync(notesDir)) {
    for (const f of fs.readdirSync(notesDir).filter(f => f.endsWith('.json'))) {
      try { const d = JSON.parse(fs.readFileSync(path.join(notesDir, f), 'utf8')); notesMap.set(f.replace('.json',''), d.notes||[]) } catch {}
    }
    if (notesMap.size > fullDataMap.size) console.log(`  Legacy notes found for ${notesMap.size} patients`)
  }

  // ── Step 3: Import contacts into Supabase ───────────────────────────────
  console.log(`\nStep 3/4 — Importing ${patients.length} contacts into Supabase`)

  let imported = 0
  let skipped = 0
  let noteCount = 0
  const errors = []

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i]
    const contactId = p['Contact Id'] || ''

    // Use full record if available, else fall back to CSV data
    const full = fullDataMap.get(contactId) || null
    const firstName = full?.firstName || p['First Name'] || ''
    const lastName = full?.lastName || p['Last Name'] || ''
    const name = `${firstName} ${lastName}`.trim() || 'Unknown Patient'
    const phone = full?.phone || p['Phone'] || ''
    const email = full?.email || p['Email'] || ''
    const dob = full?.dateOfBirth || ''
    const csvTags = p['Tags'] || ''

    // Determine doctor
    const tags = full?.tags || csvTags.split(',').map(t => t.trim()).filter(Boolean)
    const doctor = (Array.isArray(tags) ? tags : [tags]).find(t => String(t).toLowerCase().includes('saif')) ? 'Dr Saif'
      : (Array.isArray(tags) ? tags : [tags]).find(t => String(t).toLowerCase().includes('hawkar')) ? 'Dr Hawkar' : ''

    process.stdout.write(`\r  [${i + 1}/${patients.length}] ${name.slice(0, 25).padEnd(25)} (${doctor || 'no tag'})`)

    // Build notes text
    const ghlNotes = full?.notes || notesMap.get(contactId) || []
    const notesLines = [
      ...ghlNotes.map(n => `[${n.dateAdded?.slice(0, 10) || ''}] ${(n.body || '').replace(/<[^>]*>/g, '')}`),
      ...( full?.tasks || []).map(t => `[Task${t.completed ? ' DONE' : ''}] ${t.title}: ${t.description}`),
    ]
    const notesText = notesLines.join('\n\n')

    // Include DOB and additional info in notes if available
    const metaLines = [
      dob ? `Date of birth: ${dob}` : '',
      full?.country ? `Country: ${full.country}` : '',
      full?.createdBy ? `Created by: ${full.createdBy}` : '',
      (full?.additionalPhones||[]).length ? `Other phones: ${full.additionalPhones.join(', ')}` : '',
      (full?.additionalEmails||[]).length ? `Other emails: ${full.additionalEmails.join(', ')}` : '',
    ].filter(Boolean)
    const fullNotes = metaLines.length ? metaLines.join('\n') + '\n\n' + notesText : notesText

    const contactData = {
      user_id: config.userId,
      name,
      email,
      phone,
      company: '',
      city: '',
      category: 'client',
      status: 'active',
      tags: [doctor, 'ghl_import'].filter(Boolean),
      source: 'ghl_import',
      notes: fullNotes.slice(0, 5000),
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
        if (error.code === '23505') { skipped++; continue }
        throw error
      }

      imported++
      noteCount += ghlNotes.length
    } catch (err) {
      errors.push({ patient: name, error: err.message || String(err) })
    }

    if (i % 20 === 0) await sleep(50)
  }

  // ── Step 4: Upload documents ────────────────────────────────────────────
  let docCount = 0
  const docsDir = path.join(EXPORT_DIR, 'documents')

  if (fs.existsSync(docsDir) && !config.dryRun) {
    const patientDirs = fs.readdirSync(docsDir).filter(d =>
      fs.statSync(path.join(docsDir, d)).isDirectory()
    )

    if (patientDirs.length > 0) {
      console.log(`\n\nStep 4/4 — Uploading ${patientDirs.length} document folders to Supabase Storage`)

      for (const dir of patientDirs) {
        const files = fs.readdirSync(path.join(docsDir, dir))
        for (const file of files) {
          const filePath = path.join(docsDir, dir, file)
          const fileBuffer = fs.readFileSync(filePath)
          const storagePath = `imports/${dir}/${file}`

          process.stdout.write(`\r  Uploading: ${dir}/${file.slice(0, 30)}`.padEnd(60))

          try {
            const { error } = await supabase.storage
              .from('documents')
              .upload(storagePath, fileBuffer, { upsert: true })
            if (!error) docCount++
            else errors.push({ patient: dir, error: `Upload: ${file}` })
          } catch (err) {
            errors.push({ patient: dir, error: `Upload error: ${err.message}` })
          }
          await sleep(100)
        }
      }
    } else {
      console.log('\n\nStep 4/4 — No documents to upload')
    }
  } else {
    console.log('\n\nStep 4/4 — ' + (config.dryRun ? 'Skipped (dry run)' : 'No documents folder'))
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n')
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log(`│  Import ${config.dryRun ? '(DRY RUN) ' : ''}Complete${' '.repeat(config.dryRun ? 31 : 40)}│`)
  console.log('├──────────────────────────────────────────────────────┤')
  console.log(`│  Contacts imported: ${String(imported).padEnd(34)}│`)
  console.log(`│  Contacts skipped:  ${String(skipped).padEnd(34)}│`)
  console.log(`│  Notes loaded:      ${String(noteCount).padEnd(34)}│`)
  console.log(`│  Documents uploaded: ${String(docCount).padEnd(33)}│`)
  console.log(`│  Errors:            ${String(errors.length).padEnd(34)}│`)
  console.log('└──────────────────────────────────────────────────────┘')

  if (errors.length > 0) {
    console.log('\nErrors (first 20):')
    errors.slice(0, 20).forEach(e => console.log(`  ! ${e.patient}: ${e.error.slice(0, 70)}`))
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`)
  }

  fs.writeFileSync(path.join(EXPORT_DIR, '_import_log.json'), JSON.stringify({
    importedAt: new Date().toISOString(),
    dryRun: config.dryRun,
    doctorFilter: config.doctorFilter,
    imported, skipped, noteCount, docCount,
    errors,
  }, null, 2), 'utf8')

  if (config.dryRun) {
    console.log('\nThis was a dry run. Remove --dry-run to actually import.')
  } else {
    console.log('\nDone! Open Velo CRM and check your contacts.')
    console.log(`All patients tagged with "${config.doctorFilter ? 'Dr ' + config.doctorFilter : 'Dr Saif/Dr Hawkar'}" + "ghl_import"`)
  }
  console.log()
}

main().catch(err => { console.error('\nImport failed:', err.message); process.exit(1) })
