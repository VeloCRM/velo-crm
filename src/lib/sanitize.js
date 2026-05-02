// Velo CRM — Input Sanitization & Validation

// ─── HTML Stripping ──────────────────────────────────────────
// Loop until stable so nested tags like `<<script>script>` can't slip through.
export function stripHtml(str) {
  if (typeof str !== 'string') return ''
  let out = str
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/<[^>]*>/g, '')
    if (next === out) break
    out = next
  }
  return out.replace(/&[^;]+;/g, ' ').trim()
}

// ─── Text sanitization with max length ───────────────────────
export function sanitizeText(str, maxLength = 500) {
  return stripHtml(str).slice(0, maxLength)
}

// Length limits per product spec:
export const LIMITS = {
  name: 100,
  email: 255,
  phone: 20,
  notes: 5000,
  search: 200,
  pathParam: 64,
}

export function sanitizeName(str) { return sanitizeText(str, LIMITS.name) }
export function sanitizeEmail(str) { return stripHtml(str).toLowerCase().trim().slice(0, LIMITS.email) }
export function sanitizePhone(str) { return sanitizeText(str, LIMITS.phone) }
export function sanitizeNotes(str) { return sanitizeText(str, LIMITS.notes) }
export function sanitizeSearch(str) { return sanitizeText(str, LIMITS.search) }

// URL path params: only letters, digits, and hyphens. Used for IDs in the URL.
export function sanitizePathParam(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/[^A-Za-z0-9-]/g, '').slice(0, LIMITS.pathParam)
}

// ─── Validation ──────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= LIMITS.email
}
export function isValidEmailOrEmpty(email) {
  if (!email) return true
  return isValidEmail(email)
}

const PHONE_CHARS = /^[0-9+\-() .ext]+$/i
export function isValidPhone(phone) {
  if (!phone) return true // optional field
  return PHONE_CHARS.test(phone) && phone.length <= LIMITS.phone
}

export function isFiniteNumber(val) {
  const n = Number(val)
  return !isNaN(n) && isFinite(n)
}
export function isPositiveNumber(val) {
  return isFiniteNumber(val) && Number(val) >= 0
}
export function toSafeNumber(val, fallback = 0) {
  return isFiniteNumber(val) ? Number(val) : fallback
}

export function isValidDate(dateStr) {
  if (!dateStr) return true // optional
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  const year = d.getFullYear()
  return year >= 1900 && year <= 2100
}

// ─── Tag validation ──────────────────────────────────────────
export function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map(t => stripHtml(String(t)).slice(0, 30))
    .filter(t => t.length > 0)
    .slice(0, 10)
}

// ─── Contact sanitization ────────────────────────────────────
export function sanitizeContact(c) {
  return {
    ...c,
    name: sanitizeName(c.name || ''),
    email: sanitizeEmail(c.email || ''),
    phone: sanitizePhone(c.phone || ''),
    company: sanitizeText(c.company || '', 100),
    city: sanitizeText(c.city || '', 100),
    notes: sanitizeNotes(c.notes || ''),
    tags: sanitizeTags(c.tags),
  }
}

// Full validation before DB write. Returns { ok, error } where error is a
// short, user-facing reason suitable for a toast.
export function validateContactForSave(c, { isRTL = false } = {}) {
  const name = (c?.name || '').trim()
  if (!name) return { ok: false, error: isRTL ? 'الاسم مطلوب' : 'Name is required' }
  if (!isValidEmailOrEmpty(c?.email || '')) {
    return { ok: false, error: isRTL ? 'البريد الإلكتروني غير صالح' : 'Invalid email format' }
  }
  if (!isValidPhone(c?.phone || '')) {
    return { ok: false, error: isRTL ? 'رقم الهاتف غير صالح' : 'Invalid phone number' }
  }
  return { ok: true }
}

// ─── Deal sanitization ──────────────────────────────────────
export function sanitizeDeal(d) {
  return {
    ...d,
    name: sanitizeText(d.name || d.title || '', 200),
    value: Math.max(0, toSafeNumber(d.value, 0)),
    probability: Math.min(100, Math.max(0, toSafeNumber(d.probability, 0))),
    notes: sanitizeNotes(d.notes || ''),
  }
}

// ─── Ticket sanitization ────────────────────────────────────
export function sanitizeTicket(t) {
  return {
    ...t,
    subject: sanitizeText(t.subject || '', 200),
    description: sanitizeNotes(t.description || ''),
  }
}

// ─── Rate limiter (in-memory, used for login attempts) ──────
const rateLimits = {}
export function checkRateLimit(key, maxAttempts = 10, windowMs = 60000) {
  const now = Date.now()
  if (!rateLimits[key]) rateLimits[key] = []
  rateLimits[key] = rateLimits[key].filter(ts => now - ts < windowMs)
  if (rateLimits[key].length >= maxAttempts) return false
  rateLimits[key].push(now)
  return true
}

// ─── Login attempt limiter ──────────────────────────────────
const LOGIN_KEY = '_login_attempts'
export function checkLoginAttempt() {
  return checkRateLimit(LOGIN_KEY, 5, 300000) // 5 attempts per 5 minutes
}
export function getLoginLockoutRemaining() {
  const now = Date.now()
  const attempts = rateLimits[LOGIN_KEY] || []
  if (attempts.length < 5) return 0
  const oldest = attempts[0]
  const remaining = 300000 - (now - oldest)
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

// ─── Supabase request throttle (UX guard — NOT a security control) ──
// Trivially bypassed by clearing localStorage or opening devtools. Its only
// job is to protect the UI from runaway loops / typeahead storms hammering
// the DB. Real rate limiting must live server-side.
const SB_RATE_KEY = 'velo_sb_req_ts'
const SB_RATE_MAX = 100      // requests
const SB_RATE_WINDOW = 60000 // per minute
export function checkSupabaseRateLimit() {
  try {
    const now = Date.now()
    let arr = []
    try { arr = JSON.parse(localStorage.getItem(SB_RATE_KEY) || '[]') } catch { arr = [] }
    if (!Array.isArray(arr)) arr = []
    arr = arr.filter(ts => now - ts < SB_RATE_WINDOW)
    if (arr.length >= SB_RATE_MAX) {
      localStorage.setItem(SB_RATE_KEY, JSON.stringify(arr))
      return false
    }
    arr.push(now)
    localStorage.setItem(SB_RATE_KEY, JSON.stringify(arr))
    return true
  } catch {
    return true // never block on storage failure
  }
}

// ─── API Key masking ─────────────────────────────────────────
export function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••'
  return '••••••••••••' + key.slice(-4)
}

// ─── Session management ──────────────────────────────────────
const SESSION_KEY = 'velo_last_active'
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000 // 8 hours

export function touchSession() {
  try { localStorage.setItem(SESSION_KEY, String(Date.now())) }
  catch { /* storage may be unavailable */ }
}

export function isSessionExpired() {
  try {
    const last = Number(localStorage.getItem(SESSION_KEY) || '0')
    if (!last) return false // first visit
    return Date.now() - last > SESSION_TIMEOUT
  } catch { return false }
}

export function clearAllVeloData() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('velo_')) keys.push(key)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* storage may be unavailable */ }
}

// ─── Promise Timeout ─────────────────────────────────────────
export function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after ' + ms + 'ms')), ms)
    )
  ]);
}
