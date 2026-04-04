// Velo CRM — Input Sanitization & Validation

// ─── HTML Stripping ──────────────────────────────────────────
export function stripHtml(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
}

// ─── Text sanitization with max length ───────────────────────
export function sanitizeText(str, maxLength = 500) {
  return stripHtml(str).slice(0, maxLength)
}

export function sanitizeName(str) { return sanitizeText(str, 100) }
export function sanitizeEmail(str) { return stripHtml(str).toLowerCase().trim().slice(0, 254) }
export function sanitizeNotes(str) { return sanitizeText(str, 5000) }

// ─── Validation ──────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254
}

const PHONE_CHARS = /^[0-9+\-() .ext]+$/i
export function isValidPhone(phone) {
  if (!phone) return true // optional field
  return PHONE_CHARS.test(phone) && phone.length <= 30
}

export function isPositiveNumber(val) {
  const n = Number(val)
  return !isNaN(n) && n >= 0 && isFinite(n)
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
    phone: sanitizeText(c.phone || '', 30),
    company: sanitizeText(c.company || '', 100),
    city: sanitizeText(c.city || '', 100),
    notes: sanitizeNotes(c.notes || ''),
    tags: sanitizeTags(c.tags),
  }
}

// ─── Deal sanitization ──────────────────────────────────────
export function sanitizeDeal(d) {
  return {
    ...d,
    name: sanitizeText(d.name || d.title || '', 200),
    value: Math.max(0, Number(d.value) || 0),
    probability: Math.min(100, Math.max(0, Number(d.probability) || 0)),
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

// ─── Rate limiter ────────────────────────────────────────────
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

// ─── API Key masking ─────────────────────────────────────────
export function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••'
  return '••••••••••••' + key.slice(-4)
}

// ─── Session management ──────────────────────────────────────
const SESSION_KEY = 'velo_last_active'
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000 // 8 hours

export function touchSession() {
  try { localStorage.setItem(SESSION_KEY, String(Date.now())) } catch {}
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
  } catch {}
}
