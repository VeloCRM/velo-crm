/**
 * Velo CRM — money formatting helpers.
 *
 * The new schema stores monetary amounts as `*_minor BIGINT`. This helper
 * converts between the on-the-wire integer and human display strings.
 *
 * Conventions per CLAUDE.md and Iraqi clinic UX:
 *   - USD: amount_minor is in cents. Divide by 100, show 2 decimals.
 *   - IQD: amount_minor is in whole IQD (no fils in practice — Iraqi
 *     clinics quote and collect in whole-dinar amounts). Pass through as
 *     an integer with no decimals.
 *
 * If we ever expand to a currency that has fractional units, add the
 * divisor + decimal-places mapping below.
 */

const CURRENCY_DIVISOR = {
  USD: 100,
  IQD: 1,
}
const CURRENCY_DECIMALS = {
  USD: 2,
  IQD: 0,
}

function divisorFor(currency) {
  return CURRENCY_DIVISOR[currency] ?? 1
}
function decimalsFor(currency) {
  return CURRENCY_DECIMALS[currency] ?? 0
}

/**
 * Read the current app locale from <html lang="…">.
 *
 * App.jsx mirrors its lang state onto document.documentElement.lang on every
 * change, so this is the same source the EN/العربية toggle flips. Map the
 * codebase's two app codes to BCP-47 locales suitable for toLocaleString:
 *
 *   'ar' → 'ar-IQ'  — Iraqi Arabic. Produces Arabic-Indic numerals (٠-٩) and
 *                     Arabic grouping. Matches the locale used elsewhere in
 *                     the app for date/time formatting.
 *   'en' → undefined — let the browser pick its default Latin locale.
 *   other → pass through verbatim (defensive — currently unreachable).
 *
 * Defensive: returns undefined if document is missing (SSR, tests).
 */
function readAppLocale() {
  if (typeof document === 'undefined') return undefined
  const raw = document.documentElement?.lang
  if (!raw) return undefined
  if (raw === 'ar') return 'ar-IQ'
  if (raw === 'en') return undefined
  return raw
}

/**
 * Format an amount-minor + currency for display.
 *
 *   formatMoney(50000, 'USD')                       →  "500.00 USD"   (EN)
 *   formatMoney(50000, 'IQD')                       →  "50,000 IQD"   (EN)
 *   formatMoney(50000, 'IQD')                       →  "٥٠٬٠٠٠ IQD"  (AR)
 *   formatMoney(50000, 'USD', { locale: 'en-US' })  →  "500.00 USD"   (forced)
 *   formatMoney(0, 'IQD')                           →  "0 IQD"
 *   formatMoney(null, 'USD')                        →  "0.00 USD"
 *
 * The `locale` override is a future-proofing seam for callers that need to
 * force Latin digits regardless of UI language (CSV/PDF export, copy-to-
 * clipboard for receipts, etc.). Default behavior reads from the app locale.
 *
 * Numbers and storage are unchanged: amount_minor is still BIGINT minor units,
 * currency divisors/decimals are unchanged. Only the display text differs.
 */
export function formatMoney(amountMinor, currency = 'IQD', { locale } = {}) {
  const cur = (currency || 'IQD').toUpperCase()
  const divisor = divisorFor(cur)
  const decimals = decimalsFor(cur)
  const major = Number(amountMinor || 0) / divisor
  const effectiveLocale = locale ?? readAppLocale()
  const text = major.toLocaleString(effectiveLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${text} ${cur}`
}

/**
 * Convert a display amount (what the user typed in a form) to amount_minor.
 *
 *   toMinor(500.50, 'USD')  →  50050
 *   toMinor('500.50', 'USD') →  50050
 *   toMinor(50000, 'IQD')    →  50000
 *   toMinor('not-a-number', 'USD')  →  0
 */
export function toMinor(amount, currency = 'IQD') {
  const cur = (currency || 'IQD').toUpperCase()
  const divisor = divisorFor(cur)
  const decimals = decimalsFor(cur)
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  // Avoid float drift: round at the target decimal precision before scaling.
  const factor = Math.pow(10, decimals)
  const rounded = Math.round(n * factor) / factor
  return Math.round(rounded * divisor)
}

/**
 * Inverse of toMinor — amount_minor → display number (no currency suffix).
 * Useful when populating a form input from a stored value.
 */
export function fromMinor(amountMinor, currency = 'IQD') {
  const cur = (currency || 'IQD').toUpperCase()
  return Number(amountMinor || 0) / divisorFor(cur)
}
