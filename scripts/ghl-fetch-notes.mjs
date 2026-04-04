#!/usr/bin/env node
/**
 * Velo CRM — Full GHL Data Export (Dental Clinic)
 *
 * Reads GHL CSV, then for each contact fetches via API:
 *   - Full contact detail (DOB, custom fields, extra phones/emails)
 *   - Notes + Tasks
 *   - Appointments
 *   - Conversations + Messages (SMS/email history)
 *
 * Resumes automatically — safe to restart if interrupted.
 *
 * Usage:
 *   node scripts/ghl-fetch-notes.mjs \
 *     --api-key=YOUR_KEY --csv=path/to/file.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, '..', 'export')

function getConfig() {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true] })
  )
  const apiKey = args['api-key'] || process.env.GHL_API_KEY
  const csvPath = args['csv']
  const apiVersion = args['api-version'] || '2021-07-28'
  if (!apiKey || !csvPath) { console.error('Usage: node scripts/ghl-fetch-notes.mjs --api-key=KEY --csv=FILE'); process.exit(1) }
  if (!fs.existsSync(csvPath)) { console.error('CSV not found:', csvPath); process.exit(1) }
  return { apiKey, csvPath, apiVersion }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function sanitizeFilename(n) { return (n||'unnamed').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/_{2,}/g,'_').slice(0,100)||'unnamed' }

function parseCSVRow(line) {
  const v=[]; let cur='', q=false
  for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;continue} q=!q;continue} if(c===','&&!q){v.push(cur);cur='';continue} cur+=c}
  v.push(cur); return v
}
function parseCSV(text) {
  const lines=text.split('\n').filter(l=>l.trim()); if(lines.length<2) return []
  const h=parseCSVRow(lines[0])
  return lines.slice(1).map(l=>{const v=parseCSVRow(l);const r={};h.forEach((k,i)=>r[k]=(v[i]||'').trim());return r})
}

async function api(apiKey, ver, endpoint, retries=3) {
  for(let a=1;a<=retries;a++){
    const res=await fetch('https://services.leadconnectorhq.com'+endpoint,{
      headers:{'Authorization':'Bearer '+apiKey,'Version':ver,'Content-Type':'application/json'}
    })
    if(res.status===429){const w=a*12; process.stdout.write(` [429 wait ${w}s]`); await sleep(w*1000); continue}
    if(!res.ok){if(res.status===404||res.status===422) return null; throw new Error('GHL '+res.status)}
    return res.json()
  }
  return null
}

async function main() {
  const config = getConfig()
  console.log()
  console.log('=== Velo CRM — Full GHL Export ===')
  console.log()

  const contacts = parseCSV(fs.readFileSync(config.csvPath, 'utf8'))
  console.log('CSV contacts:', contacts.length)

  const dirs = { root:EXPORT_DIR, data:path.join(EXPORT_DIR,'contacts'), docs:path.join(EXPORT_DIR,'documents') }
  Object.values(dirs).forEach(d=>fs.mkdirSync(d,{recursive:true}))

  // Copy CSV
  const csvDest = path.join(dirs.root,'patients.csv')
  if(!fs.existsSync(csvDest)) fs.copyFileSync(config.csvPath, csvDest)

  // Resume: check already exported
  const done = new Set(fs.readdirSync(dirs.data).map(f=>f.replace('.json','')))
  const remaining = contacts.filter(c => c['Contact Id'] && !done.has(c['Contact Id']))
  console.log('Already exported:', done.size)
  console.log('Remaining:', remaining.length)
  console.log()

  let processed = 0, withNotes = 0, withConvos = 0, totalNotes = 0, totalMsgs = 0
  const errors = []

  for (const c of remaining) {
    const cid = c['Contact Id']
    const csvName = `${c['First Name']||''} ${c['Last Name']||''}`.trim() || 'Unknown'
    processed++

    process.stdout.write(`\r  [${done.size+processed}/${contacts.length}] ${csvName.slice(0,30).padEnd(30)}`)

    try {
      // 1. Full contact detail
      const detail = await api(config.apiKey, config.apiVersion, '/contacts/'+cid)
      const ct = detail?.contact || detail || {}
      await sleep(300)

      // 2. Notes
      const notesRes = await api(config.apiKey, config.apiVersion, '/contacts/'+cid+'/notes')
      const notes = notesRes?.notes || []
      await sleep(300)

      // 3. Tasks
      const tasksRes = await api(config.apiKey, config.apiVersion, '/contacts/'+cid+'/tasks')
      const tasks = tasksRes?.tasks || []
      await sleep(300)

      // 4. Appointments
      const apptsRes = await api(config.apiKey, config.apiVersion, '/contacts/'+cid+'/appointments')
      const appts = apptsRes?.events || []
      await sleep(300)

      // 5. Conversations
      const convosRes = await api(config.apiKey, config.apiVersion, '/conversations/search?contactId='+cid)
      const convos = convosRes?.conversations || []
      let messages = []
      if (convos.length > 0) {
        for (const cv of convos.slice(0, 5)) { // max 5 conversations
          await sleep(400)
          const msgRes = await api(config.apiKey, config.apiVersion, '/conversations/'+cv.id+'/messages')
          const msgs = (msgRes?.messages || []).map(m => ({
            id: m.id, type: m.type, body: m.body || m.text || '', direction: m.direction,
            status: m.status, dateAdded: m.dateAdded, conversationId: cv.id, channel: cv.type,
          }))
          messages.push(...msgs)
        }
      }

      // Determine doctor
      const tags = ct.tags || (c['Tags']||'').split(',').map(t=>t.trim()).filter(Boolean)
      const doctor = tags.find(t=>t.toLowerCase().includes('saif')) ? 'Dr Saif'
        : tags.find(t=>t.toLowerCase().includes('hawkar')) ? 'Dr Hawkar' : ''

      // Build comprehensive record
      const record = {
        // Identity
        contactId: cid,
        firstName: ct.firstName || c['First Name'] || '',
        lastName: ct.lastName || c['Last Name'] || '',
        fullName: `${ct.firstName||c['First Name']||''} ${ct.lastName||c['Last Name']||''}`.trim(),
        phone: ct.phone || c['Phone'] || '',
        email: ct.email || c['Email'] || '',
        dateOfBirth: ct.dateOfBirth || '',
        country: ct.country || '',
        additionalPhones: ct.additionalPhones || [],
        additionalEmails: ct.additionalEmails || [],

        // Classification
        tags,
        doctor,
        source: ct.attributionSource?.sessionSource || '',
        createdBy: ct.createdBy?.sourceName || '',
        type: ct.type || '',
        dateAdded: ct.dateAdded || c['Created'] || '',
        dateUpdated: ct.dateUpdated || '',

        // Custom fields
        customFields: (ct.customFields || []).map(cf => ({
          key: cf.fieldKey || cf.id,
          value: cf.value,
        })),

        // Notes
        notes: notes.map(n => ({
          id: n.id, body: n.body || n.bodyText || '', dateAdded: n.dateAdded || '',
          userId: n.userId || '', title: n.title || '', pinned: n.pinned || false,
        })),

        // Tasks
        tasks: tasks.map(t => ({
          id: t.id, title: t.title || '', description: t.description || '',
          dueDate: t.dueDate || '', completed: t.completed || false,
        })),

        // Appointments
        appointments: appts.map(a => ({
          id: a.id, title: a.title || '', startTime: a.startTime || '',
          endTime: a.endTime || '', status: a.status || '',
        })),

        // Messages
        messages,

        exportedAt: new Date().toISOString(),
      }

      // Save
      fs.writeFileSync(path.join(dirs.data, cid+'.json'), JSON.stringify(record, null, 2), 'utf8')

      if (notes.length > 0) { withNotes++; totalNotes += notes.length }
      if (messages.length > 0) { withConvos++; totalMsgs += messages.length }

      // Download any file URLs from custom fields
      for (const cf of record.customFields) {
        const val = Array.isArray(cf.value) ? cf.value : [cf.value]
        for (const v of val) {
          if (typeof v === 'string' && v.startsWith('http')) {
            const dir = path.join(dirs.docs, sanitizeFilename(record.fullName))
            fs.mkdirSync(dir, {recursive:true})
            const ext = path.extname(new URL(v).pathname) || '.pdf'
            try {
              const r = await fetch(v); if(r.ok) fs.writeFileSync(path.join(dir, sanitizeFilename(cf.key)+ext), Buffer.from(await r.arrayBuffer()))
            } catch {}
          }
        }
      }

      await sleep(300)

    } catch (err) {
      errors.push({ name: csvName, error: err.message?.slice(0,80) || String(err) })
      if (err.message?.includes('429')) await sleep(20000)
    }
  }

  // Write meta
  const meta = {
    exportedAt: new Date().toISOString(),
    totalContacts: contacts.length, processed: done.size + processed,
    withNotes, totalNotes, withConvos, totalMsgs,
    errors: errors.length,
  }
  fs.writeFileSync(path.join(dirs.root, '_export_meta.json'), JSON.stringify(meta, null, 2))

  console.log('\n')
  console.log('=== Export Complete ===')
  console.log('Contacts processed:', meta.processed, '/', contacts.length)
  console.log('With notes:', withNotes, '(', totalNotes, 'total notes)')
  console.log('With conversations:', withConvos, '(', totalMsgs, 'messages)')
  console.log('Errors:', errors.length)
  if (errors.length) errors.slice(0,10).forEach(e => console.log('  !', e.name, ':', e.error))
  console.log()
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1) })
