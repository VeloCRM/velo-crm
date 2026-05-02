import { forwardRef } from 'react'

const TONES = {
  navy:    'bg-navy-50 text-navy-700 border-navy-100',
  cyan:    'bg-accent-cyan-50 text-accent-cyan-700 border-accent-cyan-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  danger:  'bg-rose-50 text-rose-700 border-rose-100',
  neutral: 'bg-surface-3 text-navy-600 border-surface-4',
  // Solid variant (filled, white text). For status pills that need to pop.
  'solid-navy':    'bg-navy-700 text-white border-transparent',
  'solid-success': 'bg-emerald-600 text-white border-transparent',
  'solid-danger':  'bg-rose-600 text-white border-transparent',
}

const SIZES = {
  sm: 'h-5 px-2 text-[10px] tracking-wider gap-1 font-semibold',
  md: 'h-6 px-2.5 text-[11px] tracking-wide gap-1.5 font-semibold',
}

/**
 * Badge — pill for status indicators.
 *
 * Pairs color with an optional dot or icon so the encoding survives
 * accessibility tooling (color alone is never the only signal).
 */
export const Badge = forwardRef(function Badge(
  {
    tone = 'navy',
    size = 'md',
    dot  = false,
    icon,
    children,
    className = '',
    ...rest
  },
  ref,
) {
  const cls = [
    'inline-flex items-center justify-center select-none',
    'rounded-full border uppercase whitespace-nowrap',
    SIZES[size] ?? SIZES.md,
    TONES[tone] ?? TONES.navy,
    className,
  ].join(' ')
  return (
    <span ref={ref} className={cls} {...rest}>
      {dot ? <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" /> : null}
      {icon ? <span aria-hidden="true" className="-ms-0.5">{typeof icon === 'function' ? icon(12) : icon}</span> : null}
      {children}
    </span>
  )
})

export default Badge
