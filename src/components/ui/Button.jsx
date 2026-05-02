import { forwardRef } from 'react'

const SIZES = {
  sm: 'h-8  text-[13px] px-3 gap-1.5 rounded-glass',
  md: 'h-10 text-sm   px-4 gap-2   rounded-glass',
  lg: 'h-12 text-base px-6 gap-2.5 rounded-glass-lg',
}

const ICON_SIZE = { sm: 14, md: 16, lg: 18 }

const VARIANTS = {
  primary:
    'navy-gradient text-white font-semibold shadow-navy-glow ' +
    'hover:shadow-navy-glow hover:-translate-y-px ' +
    'active:translate-y-0 active:shadow-navy-glow-soft ' +
    'focus-visible:shadow-focus-cyan',
  secondary:
    'bg-white/85 text-navy-700 font-medium border border-navy-100 backdrop-blur-glass-sm ' +
    'shadow-glass-sm hover:bg-white hover:border-navy-200 ' +
    'active:bg-navy-50 ' +
    'focus-visible:shadow-focus-navy',
  ghost:
    'bg-transparent text-navy-600 font-medium ' +
    'hover:bg-navy-50 hover:text-navy-700 ' +
    'active:bg-navy-100 ' +
    'focus-visible:shadow-focus-navy',
  destructive:
    'bg-rose-50/85 text-rose-700 font-medium border border-rose-200 backdrop-blur-glass-sm ' +
    'shadow-glass-sm hover:bg-rose-100 hover:border-rose-300 hover:text-rose-800 ' +
    'active:bg-rose-200 ' +
    'focus-visible:shadow-[0_0_0_3px_rgba(225,29,72,0.28)]',
}

const DISABLED =
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:translate-y-0 disabled:hover:bg-inherit disabled:hover:shadow-none'

function Spinner({ size }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="animate-spin" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 1-9 9" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Button — primary/secondary/ghost/destructive in 3 sizes.
 *
 * - `iconStart` / `iconEnd` accept a render function `(size) => ReactNode`
 *   so callers don't have to know the exact pixel size per variant.
 * - `loading` swaps `iconStart` for a spinner; pointer events stay disabled.
 * - All text comes from props; no hardcoded English. Pass `aria-label` when
 *   the button has no visible label (icon-only buttons).
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size    = 'md',
    iconStart,
    iconEnd,
    loading = false,
    disabled,
    type    = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const iconSz = ICON_SIZE[size] ?? ICON_SIZE.md
  const cls = [
    'inline-flex items-center justify-center select-none',
    'transition-all duration-fast ease-standard',
    'outline-none',
    SIZES[size] ?? SIZES.md,
    VARIANTS[variant] ?? VARIANTS.primary,
    DISABLED,
    className,
  ].join(' ')
  const renderStart = loading
    ? <Spinner size={iconSz} />
    : (typeof iconStart === 'function' ? iconStart(iconSz) : iconStart)
  const renderEnd = typeof iconEnd === 'function' ? iconEnd(iconSz) : iconEnd
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cls}
      {...rest}
    >
      {renderStart}
      {children}
      {renderEnd}
    </button>
  )
})

export default Button
