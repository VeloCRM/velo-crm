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
 * Format an amount-minor + currency for display.
 *
 *   formatMoney(50000, 'USD')   →  "500.00 USD"
 *   formatMoney(50000, 'IQD')   →  "50,000 IQD"
 *   formatMoney(0, 'IQD')       →  "0 IQD"
 *   formatMoney(null, 'USD')    →  "0.00 USD"
 */
export function formatMoney(amountMinor, currency = 'IQD') {
  const cur = (currency || 'IQD').toUpperCase()
  const divisor = divisorFor(cur)
  const decimals = decimalsFor(cur)
  const major = Number(amountMinor || 0) / divisor
  const text = major.toLocaleString(undefined, {
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
