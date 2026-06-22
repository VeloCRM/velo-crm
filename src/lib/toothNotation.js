/**
 * Velo CRM — tooth-notation presentation helpers.
 *
 * FDI is the canonical storage format (int 11-48 on dental_chart_entries and
 * treatment_plan_items). Palmer (British) notation is a PRESENTATION-only
 * transform driven by the per-doctor `profiles.tooth_notation` preference —
 * nothing here ever touches stored data.
 *
 * FDI two-digit code = quadrant (tens digit) + position (units digit):
 *   quadrant 1 = upper-right, 2 = upper-left, 3 = lower-left, 4 = lower-right
 *   position 1..8 (central incisor → third molar)
 * Palmer uses the same position digit (1..8) inside a quadrant bracket.
 *
 * The canonical FDI validator lives at src/lib/dental.js:isValidFdiTooth; the
 * same rule is inlined here to keep this module dependency-free (no supabase).
 */

export const TOOTH_NOTATIONS = ['fdi', 'palmer']

// Quadrant labels for accessible descriptions. Palmer's quadrant is conveyed
// only by a visual bracket, so every rendered label MUST carry one of these.
export const QUADRANT_LABELS = {
  en: { 1: 'Upper-right', 2: 'Upper-left', 3: 'Lower-left', 4: 'Lower-right' },
  ar: { 1: 'علوي يمين', 2: 'علوي يسار', 3: 'سفلي يسار', 4: 'سفلي يمين' },
}

/**
 * Convert an FDI code to its Palmer parts. Throws on a non-FDI value so a
 * caller never renders a bogus bracket. Permanent dentition only (11-48).
 */
export function fdiToPalmer(fdi) {
  const n = Number(fdi)
  const quadrant = Math.floor(n / 10)
  const position = n % 10
  if (!Number.isInteger(n) || quadrant < 1 || quadrant > 4 || position < 1 || position > 8) {
    throw new Error(`fdiToPalmer: "${fdi}" is not a valid FDI code (11-18, 21-28, 31-38, 41-48)`)
  }
  return { quadrant, position }
}

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/**
 * Render a number/string with locale-aware digits — Arabic-Indic (٠-٩) when
 * locale is 'ar', otherwise the ASCII digits unchanged.
 */
export function toLocaleDigits(value, locale = 'en') {
  const s = String(value)
  if (locale !== 'ar') return s
  return s.replace(/[0-9]/g, d => ARABIC_INDIC[Number(d)])
}
