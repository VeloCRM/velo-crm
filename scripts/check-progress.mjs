#!/usr/bin/env node
/**
 * Quick status check for GHL export progress
 * Run: node scripts/check-progress.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

const contactsDir = path.join(EXPORT_DIR, 'contacts')
const csvPath = path.join(EXPORT_DIR, 'patients.csv')
const metaPath = path.join(EXPORT_DIR, '_export_meta.json')

// Count total from CSV
let total = 0
if (fs.existsSync(csvPath)) {
  total = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim()).length - 1
}

// Count exported
let exported = 0
if (fs.existsSync(contactsDir)) {
  exported = fs.readdirSync(contactsDir).filter(f => f.endsWith('.json')).length
}

// Count notes (contacts that have notes)
let withNotes = 0
let totalNotes = 0
let withMessages = 0
if (fs.existsSync(contactsDir)) {
  for (const f of fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(contactsDir, f), 'utf8'))
      if (d.notes?.length > 0) { withNotes++; totalNotes += d.notes.length }
      if (d.messages?.length > 0) withMessages++
    } catch {}
  }
}

const pct = total > 0 ? ((exported / total) * 100).toFixed(1) : '0'
const done = fs.existsSync(metaPath)

console.log()
console.log('┌──────────────────────────────────────────────┐')
console.log('│  GHL Export Progress                         │')
console.log('├──────────────────────────────────────────────┤')
console.log(`│  Total contacts:      ${String(total).padEnd(23)}│`)
console.log(`│  Exported:            ${String(exported).padEnd(23)}│`)
console.log(`│  Progress:            ${(pct + '%').padEnd(23)}│`)
console.log(`│  Remaining:           ${String(total - exported).padEnd(23)}│`)
console.log('├──────────────────────────────────────────────┤')
console.log(`│  With notes:          ${String(withNotes).padEnd(23)}│`)
console.log(`│  Total notes:         ${String(totalNotes).padEnd(23)}│`)
console.log(`│  With messages:       ${String(withMessages).padEnd(23)}│`)
console.log('├──────────────────────────────────────────────┤')
console.log(`│  Status:              ${(done ? 'COMPLETE' : 'IN PROGRESS').padEnd(23)}│`)
console.log('└──────────────────────────────────────────────┘')

if (!done && exported < total) {
  console.log()
  console.log('To continue/restart the export:')
  console.log('  node scripts/run-export.mjs')
  console.log()
} else if (done) {
  console.log()
  console.log('Export complete! Ready to import.')
  console.log('  node scripts/velo-import.mjs --supabase-url=URL --supabase-key=KEY --user-id=UUID --dry-run')
  console.log()
}

// Write progress.json
fs.writeFileSync(path.join(EXPORT_DIR, 'progress.json'), JSON.stringify({
  total, exported, remaining: total - exported,
  percent: parseFloat(pct),
  withNotes, totalNotes, withMessages,
  complete: done,
  lastChecked: new Date().toISOString(),
}, null, 2))
console.log('Progress saved to export/progress.json')
console.log()
