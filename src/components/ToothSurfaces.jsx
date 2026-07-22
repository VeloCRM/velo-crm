/**
 * ToothSurfaces — one tooth rendered as the Dentrix/Open-Dental style 5-zone
 * cell: 4 outer wedges (buccal / lingual / mesial / distal) + a centre wedge
 * (occlusal, labelled "incisal" for anterior teeth) + a whole-tooth tint for
 * whole-tooth findings. Each region is clickable and keyboard-focusable; the
 * FDI/Palmer label sits beneath.
 *
 * Props:
 *   fdi           number  — FDI code 11-48 (required)
 *   findings      array   — this tooth's dental_chart_entries rows ({surface, finding, notes})
 *   findingStyles object  — finding → { color, bg, label, ar } (passed from DentalChartTab)
 *   onSurfaceClick (surface) => void  — click/Enter on a wedge (surface = DB value)
 *   onAddClick    () => void          — click on a whole-tooth tooth / the tooth number (interactive entry)
 *   notation      'fdi'|'palmer'
 *   locale        'en'|'ar'
 *   disabled      bool    — read-only (informational, no click/focus)
 *
 * Geometry is anatomical and intentionally does NOT mirror under RTL.
 * Accessibility: every region is role="button" + aria-label (tooth + surface +
 * finding), focusable, Enter/Space-activated; read-only → role="img".
 * A native <title> gives a hover tooltip naming the surface.
 */
import { surfaceLayout, groupBySurface, SURFACE_LABELS, WEDGE_POLYGONS } from '../lib/toothSurfaces'
import { pressFeedback } from '../lib/motion'
import { toLocaleDigits } from '../lib/toothNotation'
import ToothLabel from './ToothLabel'

const WEDGE_POSITIONS = ['top', 'bottom', 'left', 'right', 'center']
const EMPTY_FILL = 'rgba(148,163,184,0.16)' // faint neutral so the 5 zones are always visible
// Visible hover/focus highlight: a cyan accent stroke (CSS overrides the base
// stroke attribute). Replaces the old opacity dim, which made faint wedges fainter.
// active: gives a touch press cue (hover never fires on touch — M-02).
const WEDGE_CLASS = 'cursor-pointer transition-all duration-100 hover:[stroke:#14b8a6] hover:[stroke-width:2.5] active:[stroke:#14b8a6] active:[stroke-width:2.5] focus:outline-none focus-visible:[stroke:#14b8a6] focus-visible:[stroke-width:2.5]'

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

  // groupBySurface only routes non-healthy entries into `whole`, so any whole
  // entry tints (whole-tooth finding TYPES win over surfaces — hybrid rule).
  const wholeTinted = !!whole

  // Interaction props only (role/keyboard/handlers); styling is applied per
  // element so the wedge hover highlight stays on the wedges.
  // Selection-only tactile cue: scale-press the clicked region (pressFeedback is
  // reduced-motion-safe). This is the ONLY motion on the chart — no entrance,
  // pulse, or decorative animation on clinical data.
  const interactive = (handler) => (disabled
    ? { role: 'img' }
    : {
      onClick: (e) => { pressFeedback(e.currentTarget); handler() },
      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressFeedback(e.currentTarget); handler() } },
      role: 'button',
      tabIndex: 0,
    })

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Per-tooth size cap. Responsive (not inline maxWidth) so iPad enlarges
          the wedges: ~46px desktop/portrait → up to ~60/72px on wider/landscape
          viewports (cell width permitting in the 16-col arch). M-01 iPad path. */}
      <svg viewBox="0 0 100 100" className="w-full h-auto max-w-[46px] md:max-w-[60px] lg:max-w-[72px]">
        {wholeTinted ? (
          <polygon
            points="0,0 100,0 100,100 0,100"
            fill={styleFor(whole.finding).color}
            stroke="#64748b"
            strokeWidth="1.5"
            className={disabled ? '' : WEDGE_CLASS}
            aria-label={
              ar
                ? `سن ${toLocaleDigits(fdi, 'ar')}، ${findingName(whole.finding)} (السن كامل)`
                : `Tooth ${fdi}, ${findingName(whole.finding)} (whole tooth)`
            }
            {...interactive(() => onAddClick?.())}
          >
            <title>{ar ? `${findingName(whole.finding)} (السن كامل)` : `${findingName(whole.finding)} (whole tooth)`}</title>
          </polygon>
        ) : (
          WEDGE_POSITIONS.map(pos => {
            const { surface, labelKey } = layout[pos]
            const entry = bySurface[surface]
            const fill = entry ? styleFor(entry.finding).color : EMPTY_FILL
            const surfaceLbl = labelFor(labelKey)
            const aria = ar
              ? `سن ${toLocaleDigits(fdi, 'ar')}، سطح ${surfaceLbl}${entry ? `، ${findingName(entry.finding)}` : ''}`
              : `Tooth ${fdi}, ${surfaceLbl} surface${entry ? `, ${findingName(entry.finding)}` : ''}`
            const tip = entry
              ? `${surfaceLbl} — ${findingName(entry.finding)}`
              : (disabled ? surfaceLbl : `${surfaceLbl} — ${ar ? 'انقر للإضافة' : 'click to add'}`)
            return (
              <polygon
                key={pos}
                points={WEDGE_POLYGONS[pos]}
                fill={fill}
                stroke="#64748b"
                strokeWidth="1.5"
                className={disabled ? '' : WEDGE_CLASS}
                aria-label={aria}
                {...interactive(() => onSurfaceClick?.(surface))}
              >
                <title>{tip}</title>
              </polygon>
            )
          })
        )}
      </svg>
      {/* Tooth-number label doubles as the interactive entry point for
          whole-tooth findings (surface dropdown stays open in the modal). Its
          px/py widen the whole-tooth tap target for touch (M-03); this wedge
          label renders only >=md (iPad/desktop) — the full 44px target is in the
          iPhone MobileToothSheet — so a modest bump avoids bloating the desktop arch. */}
      {disabled ? (
        <span className="text-[10px] leading-none text-navy-600 font-semibold tabular-nums">
          <ToothLabel fdi={fdi} notation={notation} locale={locale} />
        </span>
      ) : (
        <span
          {...interactive(() => onAddClick?.())}
          aria-label={ar ? `سن ${toLocaleDigits(fdi, 'ar')}، إضافة معاينة` : `Tooth ${fdi}, add finding`}
          className="inline-flex items-center justify-center min-h-[24px] px-2 py-1 text-[10px] leading-none text-navy-600 font-semibold tabular-nums cursor-pointer rounded hover:text-accent-cyan-700 active:text-accent-cyan-700 focus:outline-none focus-visible:text-accent-cyan-700"
        >
          <ToothLabel fdi={fdi} notation={notation} locale={locale} />
        </span>
      )}
    </div>
  )
}
