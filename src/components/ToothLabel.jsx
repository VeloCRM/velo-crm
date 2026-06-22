/**
 * ToothLabel — renders a single tooth identifier in the viewer's preferred
 * notation. FDI is canonical; Palmer is a presentation transform.
 *
 * Props:
 *   fdi       number  — the canonical FDI code (11-48). Required.
 *   notation  string  — 'fdi' (default) | 'palmer'
 *   locale    string  — 'en' (default) | 'ar' (Arabic-Indic digits)
 *   hash      bool     — prefix FDI output with '#' (preserves the existing
 *                        list-row look). Ignored in Palmer mode.
 *
 * Accessibility: Palmer's quadrant is conveyed ONLY by a visual bracket, so the
 * wrapper is role="img" with an unambiguous aria-label ("Upper-right 6, FDI 16")
 * and the visual glyph is aria-hidden. This is mandatory, not optional.
 */
import { fdiToPalmer, toLocaleDigits, QUADRANT_LABELS } from '../lib/toothNotation'

// Bracket border width (px). Physical left/right (NOT logical) on purpose: the
// Palmer bracket is anatomical and must NOT mirror under RTL.
const BW = 1.6

const BRACKET_SIDES = {
  1: { borderTopWidth: BW, borderRightWidth: BW },   // upper-right
  2: { borderTopWidth: BW, borderLeftWidth: BW },    // upper-left
  3: { borderBottomWidth: BW, borderLeftWidth: BW },  // lower-left
  4: { borderBottomWidth: BW, borderRightWidth: BW }, // lower-right
}

export default function ToothLabel({ fdi, notation = 'fdi', locale = 'en', hash = false }) {
  const ar = locale === 'ar'

  // Palmer path — guard the conversion so a stray non-FDI value (legacy/bad row)
  // degrades to plain FDI text instead of crashing the chart.
  if (notation === 'palmer') {
    let palmer
    try {
      palmer = fdiToPalmer(fdi)
    } catch {
      palmer = null
    }
    if (palmer) {
      const { quadrant, position } = palmer
      const digit = toLocaleDigits(position, locale)
      const label = ar
        ? `${QUADRANT_LABELS.ar[quadrant]} ${digit}، ترميز FDI ${toLocaleDigits(fdi, 'ar')}`
        : `${QUADRANT_LABELS.en[quadrant]} ${position}, FDI ${fdi}`
      return (
        <span role="img" aria-label={label} title={label} style={{ display: 'inline-flex' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1px 4px',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              borderStyle: 'solid',
              borderColor: 'currentColor',
              borderWidth: 0,
              ...BRACKET_SIDES[quadrant],
            }}
          >
            {digit}
          </span>
        </span>
      )
    }
  }

  // FDI path (default + Palmer fallback).
  const text = `${hash ? '#' : ''}${toLocaleDigits(fdi, locale)}`
  const label = ar ? `ترميز FDI ${toLocaleDigits(fdi, 'ar')}` : `FDI ${fdi}`
  return (
    <span role="img" aria-label={label} title={label} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {text}
    </span>
  )
}
