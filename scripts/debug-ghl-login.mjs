#!/usr/bin/env node
/** Debug GHL login with stealth, real Chrome, and full network logging */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')
const SS_DIR = path.join(ROOT_DIR, 'export')
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME_PATH,
  userDataDir: path.join(ROOT_DIR, '.chrome-profile'),
  defaultViewport: { width: 1400, height: 900 },
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
})

const page = (await browser.pages())[0] || await browser.newPage()

// Log failed network requests
const failedRequests = []
const loadedScripts = []

page.on('requestfailed', req => {
  failedRequests.push({ url: req.url().slice(0, 120), reason: req.failure()?.errorText })
})

page.on('response', res => {
  const url = res.url()
  if (url.endsWith('.js') || url.includes('manifest')) {
    loadedScripts.push({ url: url.slice(0, 120), status: res.status() })
  }
})

page.on('console', msg => {
  const text = msg.text()
  if (text && !text.includes('DevTools') && !text.includes('%c')) {
    console.log('CONSOLE:', text.slice(0, 200))
  }
})

page.on('pageerror', err => {
  console.log('PAGE ERROR:', err.message?.slice(0, 200))
})

console.log('Navigating to GHL login...')
await page.goto('https://app.gohighlevel.com/login', { waitUntil: 'load', timeout: 60000 })

// Wait and monitor
for (let i = 1; i <= 20; i++) {
  await new Promise(r => setTimeout(r, 3000))

  const info = await page.evaluate(() => ({
    url: location.href,
    bodyText: document.body?.innerText?.slice(0, 200) || '(empty)',
    inputCount: document.querySelectorAll('input').length,
    divCount: document.querySelectorAll('div').length,
    scripts: document.querySelectorAll('script').length,
  }))

  console.log(`\n[${i*3}s] URL: ${info.url}`)
  console.log(`  body: "${info.bodyText}"`)
  console.log(`  inputs: ${info.inputCount}, divs: ${info.divCount}, scripts: ${info.scripts}`)

  if (info.inputCount > 0) {
    console.log('\n*** LOGIN FORM FOUND! ***')
    await page.screenshot({ path: path.join(SS_DIR, 'ghl-login-found.png') })

    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(el => ({
        type: el.type, name: el.name, id: el.id,
        placeholder: el.placeholder, visible: el.offsetParent !== null
      }))
    )
    console.log('Inputs:', JSON.stringify(inputs, null, 2))
    break
  }

  // Screenshot every 15s
  if (i % 5 === 0) {
    await page.screenshot({ path: path.join(SS_DIR, `ghl-debug-${i*3}s.png`) })
    console.log(`  Screenshot saved: ghl-debug-${i*3}s.png`)
  }
}

console.log('\n--- Failed requests ---')
failedRequests.forEach(r => console.log(`  FAIL: ${r.url} — ${r.reason}`))

console.log(`\n--- Loaded scripts (${loadedScripts.length}) ---`)
loadedScripts.slice(0, 15).forEach(r => console.log(`  ${r.status}: ${r.url}`))

// Check manifest specifically
console.log('\n--- Checking manifest directly ---')
const manifestUrl = 'https://production.app-manifest.leadconnectorhq.com/latest/manifest.json'
try {
  const res = await page.evaluate(async (url) => {
    const r = await fetch(url)
    return { status: r.status, ok: r.ok, text: (await r.text()).slice(0, 300) }
  }, manifestUrl)
  console.log('Manifest:', JSON.stringify(res, null, 2))
} catch (err) {
  console.log('Manifest fetch error:', err.message)
}

await browser.close()
