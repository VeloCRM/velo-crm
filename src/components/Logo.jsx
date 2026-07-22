import { useState } from 'react'
import { BRAND } from '../config/brand'

// Renders the SC mark PNG per surface; if the asset is absent (pack not yet
// dropped), falls back to a styled monogram so no broken-image glyph shows.
// Wordmark uses a forced-LTR inner span so the Latin mark lays out correctly
// even inside an RTL (Arabic) shell; surrounding layout stays logical-property
// driven so the mark still sits on the inline-start side.
export function Logo({ variant = 'navy', withWordmark = true, size = 28, tone = 'navy', compact = false }) {
  const [imgOk, setImgOk] = useState(true)
  const src = BRAND.marks[variant] || BRAND.marks.navy
  const wordColor = tone === 'light' ? 'var(--brand-white)' : 'var(--brand-navy)'
  const subColor  = tone === 'light' ? 'rgba(255,255,255,0.72)' : 'var(--text-tertiary)'
  const wordSize = compact ? 13 : 16
  const subSize  = compact ? 9 : 10
  return (
    // shrink-0: the mark+wordmark is one indivisible unit; siblings truncate, not this.
    <span className="inline-flex items-center gap-2 shrink-0" dir="ltr">
      {imgOk ? (
        <img src={src} alt="" width={size} height={size}
             onError={() => setImgOk(false)}
             style={{ display: 'block', objectFit: 'contain' }} />
      ) : (
        <span aria-hidden="true"
          style={{ width: size, height: size, borderRadius: 8,
            background: 'var(--brand-teal)', color: 'var(--brand-navy)',
            fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: size * 0.5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          SC
        </span>
      )}
      {withWordmark && (
        <span className="leading-tight" style={{ fontFamily: 'var(--font-sans)' }}>
          <span style={{ fontWeight: 700, fontSize: wordSize, letterSpacing: '-0.01em',
            color: wordColor, display: 'block', whiteSpace: 'nowrap' }}>{BRAND.appName}</span>
          <small style={{ display: 'block', fontSize: subSize, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: -2,
            color: subColor }}>{BRAND.vendorTagline}</small>
        </span>
      )}
    </span>
  )
}
