#!/usr/bin/env node
/**
 * Migrate imported GHL notes from flat text → structured JSON timeline
 *
 * Reads export/notes/*.json for proper per-note entries with dates.
 * Falls back to parsing [YYYY-MM-DD] patterns in the DB notes field.
 * Updates each contact's notes field to:
 *   { "bio": "...", "timeline": [...], "documents": [] }
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

const SUPABASE_URL = process.argv.find(a => a.startsWith('--supabase-url='))?.split('=').slice(1).join('=') || process.env.SUPABASE_URL
const SUPABASE_KEY = process.argv.find(a => a.startsWith('--supabase-key='))?.split('=').slice(1).join('=') || process.env.SUPABASE_SERVICE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Usage: node scripts/migrate-notes-to-timeline.mjs --supabase-url=URL --supabase-key=KEY [--dry-run]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

function normalizePhone(p) {
  return (p || '').replace(/[\s\-()]/g, '').replace(/^\+964/, '0').replace(/^964/, '0')
}

function parseNotesText(text) {
  if (!text) return { bio: '', entries: [] }
  const entries = []
  const bioLines = []
  const blocks = text.split('\n\n')
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    const dateMatch = trimmed.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*([\s\S]*)$/)
    const taskMatch = trimmed.match(/^\[Task( DONE)?\]\s*([\s\S]*)$/)
    if (dateMatch) {
      entries.push({ text: dateMatch[2].trim(), date: dateMatch[1] })
    } else if (taskMatch) {
      entries.push({ text: trimmed, date: '' })
    } else {
      bioLines.push(trimmed)
    }
  }
  return { bio: bioLines.join('\n'), entries }
}

async function fetchAllContacts() {
  const all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone, notes, source')
      .eq('source', 'ghl_import')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Notes Timeline Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  // 1. Create storage bucket
  if (!DRY_RUN) {
    console.log('Creating "documents" storage bucket...')
    const { error } = await supabase.storage.createBucket('documents', { public: false })
    if (error && !error.message?.includes('already exists')) console.log('  Bucket error:', error.message)
    else console.log('  Bucket ready')
  }

  // 2. Read export note files
  const notesDir = path.join(EXPORT_DIR, 'notes')
  const notesByPhone = new Map()
  const notesByName = new Map()
  if (fs.existsSync(notesDir)) {
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'))
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(notesDir, f), 'utf8'))
        const phone = normalizePhone(data.phone)
        const name = (data.contactName || '').toLowerCase().trim()
        const notes = (data.notes || []).map(n => ({
          text: stripHtml(n.body),
          date: n.dateAdded?.slice(0, 10) || '',
          fullDate: n.dateAdded || '',
        })).filter(n => n.text)
        if (notes.length > 0) {
          if (phone) notesByPhone.set(phone, notes)
          if (name) notesByName.set(name, notes)
        }
      } catch {}
    }
    console.log(`Loaded ${notesByPhone.size} note files from export/notes/`)
  }

  // 3. Fetch all imported contacts
  console.log('Fetching imported contacts...')
  const contacts = await fetchAllContacts()
  console.log(`Found ${contacts.length} imported contacts`)

  // 4. Migrate each contact
  let migrated = 0, withNotes = 0, skipped = 0, errors = 0
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const phone = normalizePhone(c.phone)
    const name = (c.name || '').toLowerCase().trim()

    // Check if already migrated (notes is valid JSON with timeline)
    try {
      const parsed = JSON.parse(c.notes)
      if (parsed && Array.isArray(parsed.timeline)) { skipped++; continue }
    } catch {}

    // Try to match with export notes (by phone, then by name)
    let exportNotes = notesByPhone.get(phone) || notesByName.get(name) || null

    let timeline = []
    let bio = ''

    if (exportNotes && exportNotes.length > 0) {
      // Use structured notes from export JSON (better quality)
      timeline = exportNotes.map((n, idx) => ({
        id: `ghl_${i}_${idx}`,
        text: n.text,
        date: n.date,
        author: 'GHL Import',
      }))
      // Parse bio from DB notes (metadata lines)
      const parsed = parseNotesText(c.notes)
      bio = parsed.bio
    } else if (c.notes && c.notes.trim()) {
      // Fall back to parsing the DB notes text
      const parsed = parseNotesText(c.notes)
      bio = parsed.bio
      timeline = parsed.entries.map((e, idx) => ({
        id: `ghl_${i}_${idx}`,
        text: e.text,
        date: e.date,
        author: 'GHL Import',
      }))
    }

    // Sort timeline newest first
    timeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    const json = JSON.stringify({ bio, timeline, documents: [] })

    if (timeline.length > 0) withNotes++

    process.stdout.write(`\r  [${i + 1}/${contacts.length}] ${c.name?.slice(0, 30)?.padEnd(30)} notes: ${timeline.length}`)

    if (!DRY_RUN) {
      try {
        const { error } = await supabase
          .from('contacts')
          .update({ notes: json })
          .eq('id', c.id)
        if (error) { errors++; continue }
        migrated++
      } catch { errors++ }
    } else {
      migrated++
    }

    if (i % 50 === 0) await new Promise(r => setTimeout(r, 50))
  }

  console.log(`\n\n=== Migration Complete ===`)
  console.log(`  Migrated:     ${migrated}`)
  console.log(`  With notes:   ${withNotes}`)
  console.log(`  Already done: ${skipped}`)
  console.log(`  Errors:       ${errors}`)
  if (DRY_RUN) console.log(`\n  This was a dry run. Remove --dry-run to apply.`)
  console.log()
}

main().catch(err => { console.error('Migration failed:', err.message); process.exit(1) })
