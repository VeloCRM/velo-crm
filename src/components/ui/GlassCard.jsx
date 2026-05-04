import { forwardRef } from 'react'

const PADDING = {
  none: '',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
}

const TONE = {
  default: '',
  soft:    'glass-card--soft',
  strong:  'glass-card--strong',
}

/**
 * GlassCard — Liquid Glass surface primitive.
 *
 * Visual treatment lives in `.glass-card` (src/index.css). This component
 * picks padding + tone variants and forwards everything else, so callers
 * compose with Tailwind for layout. Use `as` to render a different element
 * (e.g. `as="article"` or `as="section"`).
 */
export const GlassCard = forwardRef(function GlassCard(
  { padding = 'md', tone = 'default', as: Tag = 'div', className = '', children, ...rest },
  ref,
) {
  const cls = [
    'glass-card',
    PADDING[padding] ?? PADDING.md,
    TONE[tone] ?? '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <Tag ref={ref} className={cls} {...rest}>
      {children}
    </Tag>
  )
})

export default GlassCard
