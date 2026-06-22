/**
 * ToothSurfaces — one tooth rendered as the Dentrix/Open-Dental style 5-zone
 * cell: 4 outer wedges (buccal / lingual / mesial / distal) + a centre wedge
 * (occlusal, labelled "incisal" for anterior teeth). Each wedge is clickable
 * and keyboard-focusable; the FDI/Palmer label sits beneath the shape.
 *
 * Props:
 *   fdi           number  — FDI code 11-48 (required)
 *   findings      array   — this tooth's dental_chart_entries rows ({surface, finding, notes})
 *   findingStyles object  — finding → { color, bg, label, ar } (passed from DentalChartTab)
 *   onSurfaceClick (surface) => void  — click/Enter on a wedge (surface = DB value)
 *   onAddClick    () => void          — click on a whole-tooth-tinted tooth (interactive entry)
 *   notation      'fdi'|'palmer'      — label notation (PR #36)
 *   locale        'en'|'ar'
 *   disabled      bool    — read-only (no click/focus)
 *
 * Geometry is anatomical and intentionally does NOT mirror under RTL.
 * Accessibility: every wedge is role="button" + aria-label naming the tooth,
 * surface, and any current finding; focusable and Enter/Space-activated.
 */
import { surfaceLayout, groupBySurface, SURFACE_LABELS, WEDGE_POLYGONS } from '../lib/toothSurfaces'
import { toLocaleDigits } from '../lib/toothNotation'
import ToothLabel from './ToothLabel'

const WEDGE_POSITIONS = ['top', 'bottom', 'left', 'right', 'center']
const EMPTY_FILL = 'rgba(148,163,184,0.16)' // faint neutral so the 5 zones are always visible

export default function ToothSurfaces({
  fdi, findings, findingStyles, onSurfaceClick, onAddClick,
  notation = 'fdi', locale = 'en', disabled = false,
}) {
  const ar = locale === 'ar'
  const layout = surfaceLayout(fdi)
  const { bySurface, whole } = groupBySurface(findings)
  const styleFor = (finding) => findingStyles[finding] || findingStyles.healthy
  const labelFor = (key) => (ar ? SURFACE_LABELS[key].ar : SURFACE_LABELS[key].en)
  const findingName = (finding) => {
    const s = findingStyles[finding]
    return s ? (ar ? s.ar : s.label) : finding
  }

  // Whole-tooth tint takes precedence over per-surface wedges (e.g. a crowned
  // or missing tooth). Any non-healthy whole entry tints — this includes a
  // legacy/explicit "whole tooth" entry whose finding is a surface-type finding
  // (e.g. surface=null + cavity), which must stay visible rather than vanish.
  const wholeTinted = whole && whole.finding !== 'healthy'

  // Interactive when editable (role=button, focusable, Enter/Space); purely
  // informational (role=img) for read-only users.
  const activate = (handler) => (disabled
    ? { role: 'img' }
    : {
      onClick: handler,
      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler() } },
      role: 'button',
      tabIndex: 0,
      className: 'cursor-pointer transition-opacity hover:opacity-60 focus:outline-none focus-visible:opacity-60',
    })

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 100" className="w-full h-auto" style={{ maxWidth: 46 }}>
        {wholeTinted ? (
          <polygon
            points="0,0 100,0 100,100 0,100"
            fill={styleFor(whole.finding).color}
            stroke="#64748b"
            strokeWidth="1.5"
            aria-label={
              ar
                ? `سن ${toLocaleDigits(fdi, 'ar')}، ${findingName(whole.finding)} (السن كامل)`
                : `Tooth ${fdi}, ${findingName(whole.finding)} (whole tooth)`
            }
            {...activate(() => onAddClick?.())}
          />
        ) : (
          WEDGE_POSITIONS.map(pos => {
            const { surface, labelKey } = layout[pos]
            const entry = bySurface[surface]
            const fill = entry ? styleFor(entry.finding).color : EMPTY_FILL
            const surfaceLbl = labelFor(labelKey)
            const aria = ar
              ? `سن ${toLocaleDigits(fdi, 'ar')}، سطح ${surfaceLbl}${entry ? `، ${findingName(entry.finding)}` : ''}`
              : `Tooth ${fdi}, ${surfaceLbl} surface${entry ? `, ${findingName(entry.finding)}` : ''}`
            return (
              <polygon
                key={pos}
                points={WEDGE_POLYGONS[pos]}
                fill={fill}
                stroke="#94a3b8"
                strokeWidth="1"
                aria-label={aria}
                {...activate(() => onSurfaceClick?.(surface))}
              />
            )
          })
        )}
      </svg>
      {/* Tooth-number label doubles as the interactive entry point for
          whole-tooth findings (surface dropdown stays open in the modal). */}
      {disabled ? (
        <span className="text-[10px] leading-none text-navy-600 font-semibold tabular-nums">
          <ToothLabel fdi={fdi} notation={notation} locale={locale} />
        </span>
      ) : (
        <span
          {...activate(() => onAddClick?.())}
          aria-label={ar ? `سن ${fdi}، إضافة معاينة` : `Tooth ${fdi}, add finding`}
          className="text-[10px] leading-none text-navy-600 font-semibold tabular-nums cursor-pointer rounded hover:text-accent-cyan-700 focus:outline-none focus-visible:text-accent-cyan-700"
        >
          <ToothLabel fdi={fdi} notation={notation} locale={locale} />
        </span>
      )}
    </div>
  )
}
