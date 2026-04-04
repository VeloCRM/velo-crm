#!/usr/bin/env node
/**
 * Resilient GHL export runner — keeps restarting until all contacts are done.
 * Safe to interrupt and restart anytime. Progress is saved per-contact.
 *
 * Usage:
 *   node scripts/run-export.mjs
 *
 * Set these env vars or edit the values below:
 */
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')
const CONTACTS_DIR = path.join(EXPORT_DIR, 'contacts')

// ── Config (edit these if not using CLI args) ────────────────────────────────
const API_KEY = process.env.GHL_API_KEY || 'pit-96a0b8e5-1df6-4469-85a7-9c3cf620fa69'
const CSV_PATH = process.env.GHL_CSV || path.join('C:', 'Users', 'madma', 'Downloads', 'Export_Contacts_undefined_Apr_2026_12_54_AM.csv')

function getExportedCount() {
  try { return fs.readdirSync(CONTACTS_DIR).filter(f => f.endsWith('.json')).length } catch { return 0 }
}

function getTotalCount() {
  try { return fs.readFileSync(path.join(EXPORT_DIR, 'patients.csv'), 'utf8').split('\n').filter(l => l.trim()).length - 1 } catch { return 3171 }
}

function isComplete() {
  return fs.existsSync(path.join(EXPORT_DIR, '_export_meta.json'))
}

function writeProgress(exported, total) {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
    fs.writeFileSync(path.join(EXPORT_DIR, 'progress.json'), JSON.stringify({
      total, exported, remaining: total - exported,
      percent: total > 0 ? parseFloat(((exported / total) * 100).toFixed(1)) : 0,
      complete: exported >= total,
      lastUpdated: new Date().toISOString(),
    }, null, 2))
  } catch {}
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log()
  console.log('=== Velo CRM — Resilient GHL Export Runner ===')
  console.log()

  let run = 0
  const maxRuns = 200 // safety limit

  while (run < maxRuns) {
    if (isComplete()) {
      console.log('Export is COMPLETE!')
      break
    }

    run++
    const before = getExportedCount()
    const total = getTotalCount()

    if (before >= total) {
      console.log(`All ${total} contacts exported!`)
      break
    }

    const pct = ((before / total) * 100).toFixed(1)
    const remaining = total - before
    console.log(`Run ${run} | ${before}/${total} (${pct}%) | ${remaining} remaining`)
    writeProgress(before, total)

    // Run the export script as a child process with 3-minute timeout
    try {
      const result = execSync(
        `node scripts/ghl-fetch-notes.mjs --api-key=${API_KEY} "--csv=${CSV_PATH}"`,
        {
          cwd: path.join(__dirname, '..'),
          timeout: 180000, // 3 minutes
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
        }
      )
      // If it exits cleanly, it might be done
      const after = getExportedCount()
      console.log(`  Completed cleanly. ${after} exported.`)
      if (after >= total) break
    } catch (err) {
      // Timeout or crash — that's expected, just restart
      const after = getExportedCount()
      const added = after - before
      console.log(`  Stopped (added ${added}). Restarting...`)

      if (added === 0) {
        // No progress — probably rate limited hard, wait longer
        console.log('  No progress — waiting 30s before retry...')
        await sleep(30000)
      } else {
        await sleep(3000)
      }
    }

    writeProgress(getExportedCount(), total)
  }

  const final = getExportedCount()
  const total = getTotalCount()
  writeProgress(final, total)

  console.log()
  console.log(`=== Done: ${final}/${total} contacts exported ===`)
  console.log('Run "node scripts/check-progress.mjs" for details.')
  console.log()
}

main().catch(err => { console.error('Runner failed:', err.message); process.exit(1) })
