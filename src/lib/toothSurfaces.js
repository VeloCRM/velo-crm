/**
 * Velo CRM — dental-chart surface helpers (presentation logic only).
 *
 * The dental_chart_entries table already stores `surface` (one of the 5
 * standard surfaces) and `finding` per row; this module turns a tooth's
 * entries into a per-surface view for the 5-wedge chart, and maps the 5 SVG
 * wedge POSITIONS to anatomical surfaces oriented for the standard
 * "facing-the-patient" chart view.
 *
 * No supabase / no I/O here — pure functions, unit-testable.
 */

// Findings that describe the whole tooth rather than a single surface. When one
// of these is the latest entry (or a legacy entry has no surface), the tooth is
// tinted as a whole rather than per-wedge.
export const WHOLE_TOOTH_FINDINGS = new Set([
  'missing', 'implant', 'crown', 'bridge', 'root_canal_done',
])

// Surface display labels. NOTE: 'incisal' is a DISPLAY label only for the
// anterior teeth's central surface — it is stored in the DB as 'occlusal'
// (no schema/data change). Arabic dental terms; 'incisal' (قاطعة) should be
// confirmed by a native-speaking dentist.
export const SURFACE_LABELS = {
  mesial:   { en: 'Mesial',   ar: 'إنسي' },
  distal:   { en: 'Distal',   ar: 'وحشي' },
  buccal:   { en: 'Buccal',   ar: 'دهليزي' },
  lingual:  { en: 'Lingual',  ar: 'لساني' },
  occlusal: { en: 'Occlusal', ar: 'إطباقي' },
  incisal:  { en: 'Incisal',  ar: 'قاطعة' },
}

// Five wedge polygons that exactly tile a 100×100 box (4 trapezoids + a centre
// square). Shared edges → no gaps, no overlaps. Keyed by SVG position.
export const WEDGE_POLYGONS = {
  top:    '0,0 100,0 65,35 35,35',
  right:  '100,0 100,100 65,65 65,35',
  bottom: '0,100 100,100 65,65 35,65',
  left:   '0,0 0,100 35,65 35,35',
  center: '35,35 65,35 65,65 35,65',
}

/**
 * Map the 5 wedge positions to anatomical surfaces for a given FDI tooth,
 * oriented for the standard chart (viewer faces the patient; patient's right =
 * viewer's left). Returns { position: { surface, labelKey } }.
 *   - buccal points away from the occlusal plane (top for the upper arch,
 *     bottom for the lower arch); lingual is the opposite.
 *   - mesial points toward the midline (right wedge for the patient's-right
 *     arch Q1/Q4, left wedge for the patient's-left arch Q2/Q3); distal opposite.
 *   - centre is the occlusal surface, labelled "incisal" for anterior teeth
 *     (position 1-3) but still stored as 'occlusal'.
 */
export function surfaceLayout(fdi) {
  const quadrant = Math.floor(Number(fdi) / 10)
  const position = Number(fdi) % 10
  const isUpper = quadrant === 1 || quadrant === 2
  const isRightArch = quadrant === 1 || quadrant === 4
  const centerLabelKey = position <= 3 ? 'incisal' : 'occlusal'
  return {
    top:    { surface: isUpper ? 'buccal' : 'lingual', labelKey: isUpper ? 'buccal' : 'lingual' },
    bottom: { surface: isUpper ? 'lingual' : 'buccal', labelKey: isUpper ? 'lingual' : 'buccal' },
    left:   { surface: isRightArch ? 'distal' : 'mesial', labelKey: isRightArch ? 'distal' : 'mesial' },
    right:  { surface: isRightArch ? 'mesial' : 'distal', labelKey: isRightArch ? 'mesial' : 'distal' },
    center: { surface: 'occlusal', labelKey: centerLabelKey },
  }
}

/**
 * Group a tooth's entries (assumed ordered recorded_at DESC, as
 * fetchDentalChartEntries returns them) for the hybrid render rule:
 *
 *   - finding TYPE wins: any whole-tooth finding (missing/implant/crown/bridge/
 *     root_canal_done) → whole-tooth tint, REGARDLESS of the saved surface (a
 *     crown covers the whole tooth even if a surface was recorded).
 *   - cavity/restoration on a real surface → that wedge.
 *   - cavity/restoration with null/'whole' surface (legacy) → whole-tooth tint.
 *   - healthy → no tint, but still CLAIMS its surface slot so it overrides an
 *     older finding on the same surface (latest-overrides per Q3).
 *
 *   → { bySurface: { mesial: entry, ... }, whole: entry|null }   (latest wins)
 */
export function groupBySurface(entries) {
  const bySurface = {}
  const surfaceClaimed = {} // surface → its latest entry already seen (override guard)
  let whole = null
  let wholeClaimed = false  // the whole-tooth slot's latest entry has been seen
  for (const e of (entries || [])) {
    if (WHOLE_TOOTH_FINDINGS.has(e.finding)) {
      if (!wholeClaimed) { wholeClaimed = true; whole = e } // type wins over surface; latest claims
      continue
    }
    const surf = (e.surface && e.surface !== 'whole') ? e.surface : null
    if (surf) {
      if (!(surf in surfaceClaimed)) {
        surfaceClaimed[surf] = true
        if (e.finding !== 'healthy') bySurface[surf] = e // healthy claims slot but doesn't tint
      }
    } else if (!wholeClaimed) {
      // null/'whole' surface (legacy whole-tooth entry). Healthy claims the slot
      // so it clears an older whole-tooth finding, but renders no tint.
      wholeClaimed = true
      if (e.finding !== 'healthy') whole = e
    }
  }
  return { bySurface, whole }
}
