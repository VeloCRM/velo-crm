/**
 * MobileToothSheet — iPhone (<md) replacement for the 5-wedge tap target.
 *
 * The 16-across wedge arch yields ~4px tap targets on a phone (audit M-01).
 * Instead, the compact iPhone arch shows whole-tooth buttons; tapping one opens
 * THIS sheet: the tooth's 5 surfaces + a whole-tooth row as full-width ≥44px
 * rows, each showing the current finding. Tapping a row routes through the SAME
 * openSurface/openTooth handlers as the desktop wedges → the existing add-finding
 * modal. The parent closes this sheet BEFORE opening that modal (avoids two
 * stacked bottom-sheets — diagnostic gotcha).
 *
 * Anatomical orientation is irrelevant here (it's a labeled list, not the arch),
 * so RTL just flips text via `dir`. Read-only roles see findings, rows disabled.
 */
import { Modal, Icons } from './shared'
import { groupBySurface, SURFACE_LABELS } from '../lib/toothSurfaces'
import ToothLabel from './ToothLabel'

// DB surface values in clinical order. 'occlusal' shows as "Incisal" for anterior
// teeth (FDI position 1-3) but is still stored as 'occlusal'.
const SURFACE_ORDER = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal']

function FindingChip({ finding, findingStyles, ar }) {
  const s = findingStyles[finding] || findingStyles.healthy
  const name = s ? (ar ? s.ar : s.label) : finding
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}
    >
      {name}
    </span>
  )
}

function SurfaceRow({ label, entry, canEdit, ar, findingStyles, onSelect }) {
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onSelect}
      className={[
        'flex items-center justify-between gap-3 w-full min-h-[52px] px-4 rounded-xl border border-navy-100 bg-white/70 text-start transition-colors',
        canEdit ? 'active:bg-accent-cyan-50 cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <span className="text-sm font-semibold text-navy-800">{label}</span>
      {entry
        ? <FindingChip finding={entry.finding} findingStyles={findingStyles} ar={ar} />
        : canEdit
          ? <span className="text-xs text-accent-cyan-700 font-semibold shrink-0">{ar ? 'إضافة +' : 'Add +'}</span>
          : <span className="text-xs text-navy-300 shrink-0">—</span>}
    </button>
  )
}

export default function MobileToothSheet({
  fdi, findings, findingStyles, notation = 'fdi', locale = 'en', dir = 'ltr',
  canEdit = false, onSurfaceSelect, onWholeToothSelect, onClose,
}) {
  const ar = locale === 'ar'
  const { bySurface, whole } = groupBySurface(findings)
  const isAnterior = (fdi % 10) <= 3
  const surfaceLabel = (surf) => {
    const key = surf === 'occlusal' && isAnterior ? 'incisal' : surf
    return ar ? SURFACE_LABELS[key].ar : SURFACE_LABELS[key].en
  }

  return (
    <Modal onClose={onClose} dir={dir} width={420}>
      <div className="ds-root flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-navy-900 m-0">
            {ar ? 'السن ' : 'Tooth '}
            <ToothLabel fdi={fdi} notation={notation} locale={locale} />
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar ? 'إغلاق' : 'Close'}
            className="grid place-items-center w-11 h-11 -me-2 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
          >
            {Icons.x(18)}
          </button>
        </div>

        {!canEdit && (
          <p className="text-[11px] italic text-navy-400 m-0">
            {ar ? 'وصول للقراءة فقط' : 'Read-only'}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {SURFACE_ORDER.map(surf => (
            <SurfaceRow
              key={surf}
              label={surfaceLabel(surf)}
              entry={bySurface[surf]}
              canEdit={canEdit}
              ar={ar}
              findingStyles={findingStyles}
              onSelect={() => onSurfaceSelect?.(surf)}
            />
          ))}
          <SurfaceRow
            label={ar ? 'السن كامل' : 'Whole tooth'}
            entry={whole}
            canEdit={canEdit}
            ar={ar}
            findingStyles={findingStyles}
            onSelect={() => onWholeToothSelect?.()}
          />
        </div>
      </div>
    </Modal>
  )
}
