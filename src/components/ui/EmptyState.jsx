import { forwardRef } from 'react'

/**
 * EmptyState — centered illustration / icon + heading + body + optional
 * action button. Bilingual: pass `title`, `description`, and any action
 * buttons (as children) — the component never hardcodes copy.
 *
 * `illustration` accepts any React node. If omitted, a soft gradient orb
 * is rendered as a placeholder so callers can adopt the layout immediately.
 */
export const EmptyState = forwardRef(function EmptyState(
  {
    illustration,
    title,
    description,
    action,
    className = '',
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        'flex flex-col items-center justify-center text-center',
        'px-8 py-12 gap-5 max-w-md mx-auto',
        className,
      ].join(' ')}
      {...rest}
    >
      <div aria-hidden="true" className="relative w-28 h-28 grid place-items-center">
        {illustration ?? (
          <>
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-accent-cyan-100 via-white to-navy-100 blur-md opacity-80" />
            <span className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent-cyan-300 to-navy-500 grid place-items-center shadow-glass-lg">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 11l2 2 4-4" />
              </svg>
            </span>
          </>
        )}
      </div>
      {title ? (
        <h3 className="text-lg font-semibold text-navy-800 leading-snug">{title}</h3>
      ) : null}
      {description ? (
        <p className="text-sm text-navy-600 leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
})

export default EmptyState
