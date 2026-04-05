#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Download GHL Contact Documents via Puppeteer
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  HOW IT WORKS:
 *  1. You launch Chrome manually with remote debugging:
 *       chrome.exe --remote-debugging-port=9222
 *  2. Log into GHL in that Chrome window
 *  3. Run this script — it connects to your existing Chrome
 *  4. Script navigates each contact's documents tab and downloads files
 *
 *  Usage:
 *    node scripts/download-ghl-docs.mjs                # all contacts
 *    node scripts/download-ghl-docs.mjs --limit=3      # test on 3
 *    node scripts/download-ghl-docs.mjs --resume       # resume from last
 *    node scripts/download-ghl-docs.mjs --contact=ID   # single contact
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')
const EXPORT_DIR = path.join(ROOT_DIR, 'export')
const DOCS_DIR = path.join(EXPORT_DIR, 'documents')
const PROGRESS_FILE = path.join(EXPORT_DIR, 'doc-download-progress.json')

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

const LOCATION_ID = process.env.GHL_LOCATION_ID || 'i7xxTT5qM4l9N3fjZZSU'
const LIMIT = parseInt(args['limit']) || 0
const RESUME = args['resume'] === true || args['resume'] === 'true'
const SINGLE_CONTACT = args['contact'] || ''
const DEBUG_PORT = parseInt(args['port']) || 9222

// ─── Helpers ────────────────────────────────────────────────────────────────
function sanitizeName(name) {
  return (name || 'unnamed')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'unnamed'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
    }
  } catch {}
  return { completed: [], totalDocs: 0, startedAt: new Date().toISOString() }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

// ─── Load contacts from patients.csv (all 3,171) ───────────────────────────
function loadContacts() {
  const csvPath = path.join(EXPORT_DIR, 'patients.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('  patients.csv not found! Falling back to contacts dir.')
    return loadContactsFromDir()
  }
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim())
  // Skip header
  const contacts = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (!cols[0]) continue
    contacts.push({
      id: cols[0],
      name: `${cols[1] || ''} ${cols[2] || ''}`.trim() || 'Unknown',
      phone: cols[3] || '',
    })
  }
  return contacts
}

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

function loadContactsFromDir() {
  const contactsDir = path.join(EXPORT_DIR, 'contacts')
  const contacts = []
  for (const f of fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(contactsDir, f), 'utf8'))
      contacts.push({
        id: data.contactId || f.replace('.json', ''),
        name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
        phone: data.phone || '',
      })
    } catch {}
  }
  return contacts
}

// ─── Connect to existing Chrome ─────────────────────────────────────────────
async function connectToChrome() {
  // Get the WebSocket URL from Chrome's debugging endpoint
  const debugUrl = `http://127.0.0.1:${DEBUG_PORT}/json/version`
  let wsUrl

  try {
    const res = await fetch(debugUrl)
    const data = await res.json()
    wsUrl = data.webSocketDebuggerUrl
  } catch (err) {
    console.error(`\n  Cannot connect to Chrome on port ${DEBUG_PORT}.`)
    console.error('  Please start Chrome with remote debugging first:\n')
    console.error('  1. Close ALL Chrome windows completely')
    console.error('  2. Open a terminal and run:')
    console.error(`     "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${DEBUG_PORT}`)
    console.error('  3. Log into GHL in that Chrome window')
    console.error('  4. Run this script again\n')
    process.exit(1)
  }

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl })
  console.log('  Connected to Chrome!')
  return browser
}

// ─── Download file using API auth headers ───────────────────────────────────
async function downloadFile(url, savePath, headers) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }

    const buffer = Buffer.from(await res.arrayBuffer())

    // Add extension from content-type if missing
    let finalPath = savePath
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
    if (!path.extname(finalPath)) {
      const extMap = {
        'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
        'image/gif': '.gif', 'image/webp': '.webp',
        'application/msword': '.doc', 'text/plain': '.txt',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'video/mp4': '.mp4', 'application/zip': '.zip',
      }
      if (extMap[ct]) finalPath += extMap[ct]
    }

    // Get filename from content-disposition if available
    const disposition = res.headers.get('content-disposition') || ''
    const filenameMatch = disposition.match(/filename[*]?=["']?([^"';\n]+)/)
    if (filenameMatch) {
      const cdFilename = sanitizeName(decodeURIComponent(filenameMatch[1]))
      finalPath = path.join(path.dirname(savePath), cdFilename)
    }

    fs.writeFileSync(finalPath, buffer)
    return { success: true, size: buffer.length, path: finalPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log()
  console.log('┌──────────────────────────────────────────────────────┐')
  console.log('│  GHL Document Downloader                             │')
  console.log('└──────────────────────────────────────────────────────┘')
  console.log()

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })

  // Load contacts
  let contacts = loadContacts()
  console.log(`  Loaded ${contacts.length} contacts from export`)

  if (SINGLE_CONTACT) {
    contacts = contacts.filter(c => c.id === SINGLE_CONTACT)
    if (contacts.length === 0) { console.error(`  Contact ${SINGLE_CONTACT} not found!`); process.exit(1) }
    console.log(`  Single contact: ${contacts[0].name}`)
  }
  if (LIMIT > 0) {
    contacts = contacts.slice(0, LIMIT)
    console.log(`  Limited to ${LIMIT} contacts`)
  }

  // Always resume from progress file (use --fresh to start over)
  const FRESH = args['fresh'] === true || args['fresh'] === 'true'
  const progress = FRESH ? { completed: [], totalDocs: 0, startedAt: new Date().toISOString() } : loadProgress()
  const completedSet = new Set(progress.completed)
  if (completedSet.size > 0) console.log(`  Resuming — ${completedSet.size} already done`)

  // Connect to existing Chrome
  console.log(`\n  Connecting to Chrome on port ${DEBUG_PORT}...`)
  const browser = await connectToChrome()

  // Open a new tab for our work
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)

  try {
    // Verify we're logged into GHL
    console.log('  Verifying GHL login...')
    await page.goto(`https://app.gohighlevel.com/v2/location/${LOCATION_ID}/dashboard`, {
      waitUntil: 'networkidle2', timeout: 45000
    })
    await sleep(5000)

    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      console.error('\n  Not logged into GHL! Please log in to GHL in the Chrome window first.')
      console.error('  Then run this script again.\n')
      await page.close()
      browser.disconnect()
      process.exit(1)
    }
    console.log('  GHL session active!')

    // Get cookies for file downloads
    let cookies = await page.cookies()

    // ── Capture GHL API auth headers by navigating to a contact page ──
    let apiHeaders = {}
    page.on('request', req => {
      const url = req.url()
      if (url.includes('services.leadconnectorhq.com') || url.includes('backend.leadconnectorhq.com')) {
        const h = req.headers()
        if (h['token-id'] && !apiHeaders['token-id']) {
          apiHeaders = {
            'token-id': h['token-id'],
            'channel': h['channel'] || 'APP',
            'source': h['source'] || 'WEB_USER',
            'version': h['version'] || '2021-07-28',
          }
        }
      }
    })

    // Navigate to first contact to capture auth headers
    const firstContact = contacts[0]
    await page.goto(`https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${firstContact.id}`, {
      waitUntil: 'networkidle2', timeout: 30000
    })
    await sleep(3000)

    if (!apiHeaders['token-id']) {
      console.error('\n  Could not capture GHL API auth headers!')
      process.exit(1)
    }
    console.log('  API auth captured!')

    // Time estimation: ~1.8s per contact (0.3s API + 1.5s sleep)
    const remaining = contacts.length - (RESUME ? completedSet.size : 0)
    const estMinutes = Math.ceil(remaining * 1.8 / 60)
    const estHours = (estMinutes / 60).toFixed(1)
    console.log(`\n  Starting document scraping...`)
    console.log(`  Total contacts: ${contacts.length}`)
    console.log(`  Already completed: ${completedSet.size}`)
    console.log(`  Remaining: ${remaining}`)
    console.log(`  Estimated time: ~${estMinutes} min (${estHours} hrs)\n`)

    let totalDownloaded = 0
    let contactsWithDocs = 0
    let contactsSkipped = 0
    let contactsProcessed = 0
    const startTime = Date.now()
    const errors = []

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]
      if (completedSet.has(contact.id)) { contactsSkipped++; continue }

      contactsProcessed++
      const label = contact.name.slice(0, 35).padEnd(35)
      process.stdout.write(`  Contact ${i + 1}/${contacts.length} — ${label}`)

      // Progress report every 100 contacts processed
      if (contactsProcessed > 0 && contactsProcessed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = contactsProcessed / elapsed
        const left = remaining - contactsProcessed
        const etaMins = Math.ceil(left / rate / 60)
        console.log(`\n  ── Progress: ${contactsProcessed}/${remaining} processed | ${totalDownloaded} docs | ${contactsWithDocs} with docs | ETA: ~${etaMins} min ──\n`)
        saveProgress(progress)
      }

      const contactDir = path.join(DOCS_DIR, sanitizeName(contact.name))

      try {
        // ── Query the documents API for this contact ──
        const docsApiUrl = `https://services.leadconnectorhq.com/documents/search?locationId=${LOCATION_ID}&contactId=${contact.id}&skip=0&limit=100&type=file`
        const apiController = new AbortController()
        const apiTimeout = setTimeout(() => apiController.abort(), 15000)
        const docsRes = await fetch(docsApiUrl, {
          headers: { ...apiHeaders, 'Accept': 'application/json' },
          signal: apiController.signal,
        })
        clearTimeout(apiTimeout)
        const docsData = docsRes.ok ? await docsRes.json() : { documents: [] }
        const allDocs = (docsData.documents || []).filter(d => d.type === 'file' && d.status === 'completed')

        if (allDocs.length === 0) {
          process.stdout.write(' — 0 documents\n')
          completedSet.add(contact.id)
          progress.completed.push(contact.id)
          if (i % 10 === 0) saveProgress(progress)
          await sleep(300)
          continue
        }

        // Download each document via the API
        if (!fs.existsSync(contactDir)) fs.mkdirSync(contactDir, { recursive: true })

        let downloaded = 0

        for (const doc of allDocs) {
          const ext = doc.extension ? '.' + doc.extension : ''
          const fileName = sanitizeName(doc.name || `document_${downloaded + 1}`) + ext
          const savePath = path.join(contactDir, fileName)

          // Skip already downloaded
          if (fs.existsSync(savePath)) { downloaded++; continue }

          const downloadUrl = `https://services.leadconnectorhq.com/documents/download/${doc.id}`
          const result = await downloadFile(downloadUrl, savePath, apiHeaders)
          if (result.success) {
            downloaded++
          } else {
            errors.push({ contact: contact.name, file: fileName, error: result.error })
          }
          await sleep(300)
        }

        totalDownloaded += downloaded
        if (downloaded > 0) contactsWithDocs++
        process.stdout.write(` — ${downloaded} document${downloaded !== 1 ? 's' : ''} downloaded\n`)

      } catch (err) {
        process.stdout.write(` — ERROR: ${err.message?.slice(0, 60)}\n`)
        errors.push({ contact: contact.name, error: err.message?.slice(0, 100) })
      }

      completedSet.add(contact.id)
      progress.completed.push(contact.id)
      progress.totalDocs = totalDownloaded
      if (contactsProcessed % 20 === 0) saveProgress(progress)
      await sleep(1500)
    }

    saveProgress(progress)

    // Summary
    const totalElapsed = ((Date.now() - startTime) / 60000).toFixed(1)
    console.log('\n')
    console.log('┌──────────────────────────────────────────────────────┐')
    console.log('│  Download Complete                                   │')
    console.log('├──────────────────────────────────────────────────────┤')
    console.log(`│  Contacts processed:    ${String(contactsProcessed).padEnd(28)}│`)
    console.log(`│  Contacts with docs:    ${String(contactsWithDocs).padEnd(28)}│`)
    console.log(`│  Total docs downloaded: ${String(totalDownloaded).padEnd(28)}│`)
    console.log(`│  Skipped (resumed):     ${String(contactsSkipped).padEnd(28)}│`)
    console.log(`│  Errors:                ${String(errors.length).padEnd(28)}│`)
    console.log(`│  Elapsed:               ${(totalElapsed + ' min').padEnd(28)}│`)
    console.log('└──────────────────────────────────────────────────────┘')

    if (errors.length > 0) {
      console.log('\nErrors (first 20):')
      errors.slice(0, 20).forEach(e =>
        console.log(`  ! ${e.contact}: ${e.file ? e.file + ' — ' : ''}${e.error}`)
      )
    }

    console.log(`\nDocuments saved to: ${DOCS_DIR}`)
    console.log()

  } finally {
    await page.close()
    browser.disconnect() // Disconnect, don't close — keep Chrome open
  }
}

main().catch(err => { console.error('\nFailed:', err.message); process.exit(1) })
