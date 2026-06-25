/**
 * MiniToothChart — compact clickable FDI chart for selecting `teeth_shown`
 * (e.g. for an X-ray). Same upper/lower-jaw layout as the dental chart, but
 * smaller and without surface wedges: each tooth is a single toggle button.
 *
 * Props:
 *   value     string[]  — selected FDI codes, e.g. ['16','17'] (controlled)
 *   onChange  (string[]) => void
 *   lang      'en' | 'ar'
 *   dir       'ltr' | 'rtl'   (unused for the chart itself — arch stays LTR)
 *
 * Tooth labels honor the doctor's FDI/Palmer preference via ToothLabel +
 * useMyToothNotation; codes are always stored/emitted as FDI strings. The arch
 * is pinned dir="ltr" so it never mirrors under RTL (matches the dental chart).
 */
import ToothLabel from './ToothLabel'
import useMyToothNotation from '../hooks/useMyToothNotation'

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

export default function MiniToothChart({ value = [], onChange, lang = 'en' }) {
  const isRTL = lang === 'ar'
  const notation = useMyToothNotation()
  const selected = new Set(value.map(String))

  const toggle = (fdi) => {
    const code = String(fdi)
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange?.([...next])
  }

  const row = (teeth) => (
    // Mobile: 8 cols (one quadrant per row) for ≥40px targets; 16-col arch ≥md.
    <div dir="ltr" className="grid gap-1 grid-cols-8 md:[grid-template-columns:repeat(16,1fr)]">
      {teeth.map(n => {
        const on = selected.has(String(n))
        return (
          <button
            key={n}
            type="button"
            onClick={() => toggle(n)}
            aria-pressed={on}
            aria-label={`${isRTL ? 'سن' : 'Tooth'} ${n}${on ? (isRTL ? '، محدد' : ', selected') : ''}`}
            className={[
              'aspect-square min-h-[40px] md:min-h-[26px] rounded-md border text-[10px] font-semibold',
              'flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan-500',
              on
                ? 'border-accent-cyan-500 bg-accent-cyan-500/10 text-navy-900'
                : 'border-navy-200 text-navy-500 hover:border-navy-300',
            ].join(' ')}
          >
            <ToothLabel fdi={n} notation={notation} locale={lang} />
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      {row(UPPER_TEETH)}
      <div className="h-px bg-navy-100/80 my-0.5" />
      {row(LOWER_TEETH)}
      <p className="text-[11px] text-navy-500 m-0 mt-1">
        {value.length > 0
          ? (isRTL ? `الأسنان المحددة: ${value.length}` : `Selected teeth: ${value.length}`)
          : (isRTL ? 'اختر الأسنان الظاهرة (اختياري)' : 'Tap the teeth shown (optional)')}
      </p>
    </div>
  )
}
