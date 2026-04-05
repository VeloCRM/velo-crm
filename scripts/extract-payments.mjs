#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Velo CRM — Extract Payments from GHL Notes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Scans all exported notes for payment mentions like:
 *    "He paid 500 000id"   →  500,000 IQD
 *    "paid 200$"           →  200 USD
 *    "90 000 paid"         →  90,000 IQD
 *    "Paid 125 000id"      →  125,000 IQD
 *    "HE PAID 100000ID"    →  100,000 IQD
 *
 *  Creates records in the Supabase `payments` table.
 *
 *  Prerequisites:
 *    1. Run schema_payments.sql in Supabase SQL Editor
 *    2. Have export/notes/*.json from GHL export
 *
 *  Usage:
 *    node scripts/extract-payments.mjs \
 *      --supabase-url=https://xxx.supabase.co \
 *      --supabase-key=YOUR_SERVICE_ROLE_KEY \
 *      --user-id=YOUR_AUTH_USER_UUID
 *
 *    Optional:
 *      --dry-run       Preview extracted payments without writing
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )
  const supabaseUrl = args['supabase-url'] || process.env.SUPABASE_URL
  const supabaseKey = args['supabase-key'] || process.env.SUPABASE_SERVICE_KEY
  const userId = args['user-id'] || process.env.VELO_USER_ID
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'

  if (!supabaseUrl || !supabaseKey || !userId) {
    console.error(`
  Usage:
    node scripts/extract-payments.mjs \\
      --supabase-url=https://xxx.supabase.co \\
      --supabase-key=YOUR_SERVICE_ROLE_KEY \\
      --user-id=YOUR_AUTH_USER_UUID [--dry-run]
`)
    process.exit(1)
  }
  return { supabaseUrl, supabaseKey, userId, dryRun }
}

// ─── HTML stripping ──────────────────────────────────────────────────────────
function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function normalizePhone(p) {
  return (p || '').replace(/[\s\-()]/g, '').replace(/^\+964/, '0').replace(/^964/, '0')
}

// ─── Payment extraction ──────────────────────────────────────────────────────
function extractPaymentsFromText(text) {
  const clean = stripHtml(text)
  const payments = []
  const seen = new Set() // dedupe

  // Split into lines/sentences for context
  const lines = clean.split(/[.\n]/).map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    const lower = line.toLowerCase()

    // Skip lines that don't mention payment keywords
    if (!lower.includes('paid') && !lower.includes('دفع') && !lower.includes('دفعت')) continue

    // Skip "paid nothing", "pay nothing", "for free", "didnot pay", "didn't pay"
    if (/paid?\s+nothing/i.test(line) || /for\s+free/i.test(lower) ||
        /did\s*n[o']?t\s+pay/i.test(line) || /charge\s+him\s+nothing/i.test(lower)) continue

    // Pattern 1: "paid X 000id" or "paid X 000 id" — X * 1000 IQD
    // Matches: "paid 500 000id", "paid for today 350 000id", "PAID 100 000ID"
    const p1 = line.match(/paid\s+(?:[\w\s]{0,50}?)(\d{1,4})\s+000\s*id/i)
    if (p1) {
      const amount = parseInt(p1[1]) * 1000
      const key = `IQD_${amount}_p1`
      if (amount > 0 && !seen.has(key)) { seen.add(key); payments.push({ amount, currency: 'IQD', match: p1[0].trim() }) }
    }

    // Pattern 2: "paid Xid" where X >= 1000 (no space before id) — full IQD amount
    // Matches: "paid 100000ID", "PAID 100000id", "paid 125000id"
    if (!p1) {
      const p2 = line.match(/paid\s+(?:[\w\s]{0,50}?)(\d{4,})\s*id/i)
      if (p2) {
        const amount = parseInt(p2[1])
        const key = `IQD_${amount}_p2`
        if (amount >= 1000 && !seen.has(key)) { seen.add(key); payments.push({ amount, currency: 'IQD', match: p2[0].trim() }) }
      }
    }

    // Pattern 3: "paid X$" or "paid $X" — USD
    // Matches: "paid 200$", "Paid for advertising till tday 1000$", "He paid 200$ only"
    const p3 = line.match(/paid\s+(?:[\w\s]{0,50}?)(\d{1,7})\s*\$/i) ||
               line.match(/paid\s+(?:[\w\s]{0,50}?)\$\s*(\d{1,7})/i)
    if (p3) {
      const amount = parseInt(p3[1])
      const key = `USD_${amount}_p3`
      if (amount > 0 && !seen.has(key)) { seen.add(key); payments.push({ amount, currency: 'USD', match: p3[0].trim() }) }
    }

    // Pattern 4: "X 000 paid" or "X 000id paid" — amount before paid
    // Matches: "90 000 paid", "500 000id paid"
    if (!p1) {
      const p4 = line.match(/(\d{1,4})\s+000\s*(?:id\s+|iqd\s+)?paid/i)
      if (p4) {
        const amount = parseInt(p4[1]) * 1000
        const key = `IQD_${amount}_p4`
        if (amount > 0 && !seen.has(key)) { seen.add(key); payments.push({ amount, currency: 'IQD', match: p4[0].trim() }) }
      }
    }

    // Pattern 5: Arabic "دفع X" (paid X)
    const p5 = line.match(/دفع[ت]?\s+(\d[\d\s,]*)\s*(?:دينار|الف|IQD)?/i)
    if (p5) {
      const raw = p5[1].replace(/[\s,]/g, '')
      const amount = parseInt(raw)
      const key = `IQD_${amount}_p5`
      if (amount > 0 && !seen.has(key)) { seen.add(key); payments.push({ amount, currency: 'IQD', match: p5[0].trim() }) }
    }
  }

  return payments
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const config = getConfig()

  console.log()
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log('│  Velo CRM — Extract Payments from Notes             │')
  if (config.dryRun) {
    console.log('│  >> DRY RUN — no data will be written               │')
  }
  console.log('└──────────────────────────────────────────────────────┘')
  console.log()

  const supabase = createClient(config.supabaseUrl, config.supabaseKey)

  // Step 1: Read all note files
  const notesDir = path.join(EXPORT_DIR, 'notes')
  if (!fs.existsSync(notesDir)) {
    console.error('Notes directory not found at:', notesDir)
    process.exit(1)
  }

  const noteFiles = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'))
  console.log(`Step 1/4 — Found ${noteFiles.length} note files`)

  // Step 2: Extract payments from all notes
  console.log('\nStep 2/4 — Extracting payments from notes')

  const allExtractions = [] // { contactId, contactName, phone, noteDate, payment, noteBody }
  let filesWithPayments = 0

  for (const file of noteFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(notesDir, file), 'utf8'))
      const ghlContactId = data.contactId || file.replace('.json', '')
      const contactName = data.contactName || 'Unknown'
      const phone = data.phone || ''

      let fileHasPayments = false

      for (const note of (data.notes || [])) {
        const body = note.body || ''
        const noteDate = note.dateAdded?.slice(0, 10) || ''
        const payments = extractPaymentsFromText(body)

        for (const p of payments) {
          allExtractions.push({
            ghlContactId,
            contactName,
            phone,
            noteId: note.id || '',
            noteDate,
            amount: p.amount,
            currency: p.currency,
            matchText: p.match,
            noteBody: stripHtml(body).slice(0, 200),
          })
          fileHasPayments = true
        }
      }

      if (fileHasPayments) filesWithPayments++
    } catch {}
  }

  console.log(`  Extracted ${allExtractions.length} payments from ${filesWithPayments} contacts`)

  // Show sample
  if (allExtractions.length > 0) {
    console.log('\n  Sample payments:')
    for (const p of allExtractions.slice(0, 8)) {
      const amt = p.currency === 'USD' ? `$${p.amount.toLocaleString()}` : `${p.amount.toLocaleString()} IQD`
      console.log(`    ${p.contactName.slice(0, 25).padEnd(25)} ${amt.padStart(15)} | ${p.noteDate} | "${p.matchText.slice(0, 40)}"`)
    }
    if (allExtractions.length > 8) console.log(`    ... and ${allExtractions.length - 8} more`)
  }

  // Step 3: Match to Supabase contacts
  console.log('\nStep 3/4 — Matching to Supabase contacts')

  const all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('source', 'ghl_import')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`  Found ${all.length} imported contacts in Supabase`)

  // Build lookup maps
  const phoneMap = new Map()
  const nameMap = new Map()
  for (const c of all) {
    const norm = normalizePhone(c.phone)
    if (norm && norm.length >= 7) phoneMap.set(norm, c.id)
    const name = (c.name || '').toLowerCase().trim()
    if (name && name !== 'unknown' && name !== 'unknown patient') nameMap.set(name, c.id)
  }

  // Match extractions to contacts
  let matched = 0, unmatched = 0
  const paymentRows = []

  for (const ext of allExtractions) {
    const normPhone = normalizePhone(ext.phone)
    const normName = (ext.contactName || '').toLowerCase().trim()

    const contactId = phoneMap.get(normPhone) || nameMap.get(normName) || null

    if (contactId) {
      matched++
      paymentRows.push({
        user_id: config.userId,
        contact_id: contactId,
        amount: ext.amount,
        currency: ext.currency,
        method: 'cash',
        status: 'paid',
        payment_date: ext.noteDate || null,
        description: ext.matchText.slice(0, 200),
        source: 'note_extract',
        note_id: ext.noteId,
      })
    } else {
      unmatched++
    }
  }

  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`)

  // Step 4: Insert into Supabase
  console.log(`\nStep 4/4 — Inserting ${paymentRows.length} payments into Supabase`)

  if (config.dryRun) {
    console.log('  Skipped (dry run)')
  } else if (paymentRows.length > 0) {
    // Check for existing extracted payments to avoid duplicates
    const { data: existing } = await supabase
      .from('payments')
      .select('note_id')
      .eq('source', 'note_extract')
      .eq('user_id', config.userId)
    const existingNoteIds = new Set((existing || []).map(e => e.note_id).filter(Boolean))

    const newRows = paymentRows.filter(r => !r.note_id || !existingNoteIds.has(r.note_id))
    const skippedDupes = paymentRows.length - newRows.length

    if (skippedDupes > 0) console.log(`  Skipping ${skippedDupes} already-imported payments`)

    if (newRows.length > 0) {
      // Insert in batches of 100
      let inserted = 0
      let errors = 0
      for (let i = 0; i < newRows.length; i += 100) {
        const batch = newRows.slice(i, i + 100)
        const { error } = await supabase.from('payments').insert(batch)
        if (error) {
          console.error(`  Batch error:`, error.message)
          errors += batch.length
        } else {
          inserted += batch.length
        }
        process.stdout.write(`\r  Inserted ${inserted}/${newRows.length}...`)
      }
      console.log(`\r  Inserted ${inserted} payments, ${errors} errors       `)
    } else {
      console.log('  No new payments to insert')
    }
  }

  // Summary
  const totalIQD = allExtractions.filter(p => p.currency === 'IQD').reduce((s, p) => s + p.amount, 0)
  const totalUSD = allExtractions.filter(p => p.currency === 'USD').reduce((s, p) => s + p.amount, 0)

  console.log('\n┌──────────────────────────────────────────────────────┐')
  console.log(`│  Extraction Complete ${config.dryRun ? '(DRY RUN)' : ''}${' '.repeat(config.dryRun ? 28 : 38)}│`)
  console.log('├──────────────────────────────────────────────────────┤')
  console.log(`│  Total payments found:  ${String(allExtractions.length).padEnd(30)}│`)
  console.log(`│  Contacts with payments: ${String(filesWithPayments).padEnd(29)}│`)
  console.log(`│  Matched to Supabase:   ${String(matched).padEnd(30)}│`)
  console.log(`│  Total IQD:             ${(totalIQD.toLocaleString() + ' IQD').padEnd(30)}│`)
  console.log(`│  Total USD:             $${(totalUSD.toLocaleString()).padEnd(29)}│`)
  console.log('└──────────────────────────────────────────────────────┘')

  if (config.dryRun) {
    console.log('\nThis was a dry run. Remove --dry-run to insert payments.')
  }
  console.log()
}

main().catch(err => { console.error('\nExtraction failed:', err.message); process.exit(1) })
