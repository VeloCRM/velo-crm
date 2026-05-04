import { forwardRef, useId, useState } from 'react'

/**
 * Input — text input with top-aligned label, optional leading icon, error
 * state, and password visibility toggle (when type="password").
 *
 * Bilingual-ready: pass `label`, `placeholder`, `error`, `helper`,
 * `revealLabel`, `hideLabel` as props. The component never hardcodes copy.
 *
 * For accessibility:
 *   - label is connected via htmlFor / id (auto-generated if not provided)
 *   - error is exposed via aria-invalid + aria-describedby
 *   - helper / error text live in the same element so descriptions stay
 *     in sync with announcements.
 */
export const Input = forwardRef(function Input(
  {
    id: idProp,
    label,
    type = 'text',
    iconStart,
    iconEnd,
    error,
    helper,
    disabled,
    revealLabel = 'Show password',
    hideLabel   = 'Hide password',
    className = '',
    inputClassName = '',
    ...rest
  },
  ref,
) {
  const reactId  = useId()
  const id       = idProp || `in-${reactId}`
  const helperId = (helper || error) ? `${id}-help` : undefined
  const isPassword = type === 'password'
  const [reveal, setReveal] = useState(false)
  const effectiveType = isPassword && reveal ? 'text' : type

  const hasError = !!error
  const padStart = iconStart ? 'ps-10' : 'ps-3.5'
  const padEnd   = (iconEnd || isPassword) ? 'pe-10' : 'pe-3.5'

  const wrapper = [
    'relative flex items-center',
    'h-11 w-full rounded-glass',
    'bg-white/85 backdrop-blur-glass-sm',
    'border transition-all duration-fast ease-standard',
    hasError
      ? 'border-rose-300 focus-within:border-rose-400 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.22)]'
      : 'border-navy-100 hover:border-navy-200 focus-within:border-accent-cyan-500 focus-within:shadow-focus-cyan',
    disabled ? 'opacity-60 bg-surface-3 cursor-not-allowed' : 'shadow-glass-sm',
  ].join(' ')

  const inputCls = [
    'peer flex-1 bg-transparent outline-none',
    'text-sm text-navy-800 placeholder:text-navy-400',
    'h-full', padStart, padEnd,
    inputClassName,
  ].join(' ')

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label ? (
        <label
          htmlFor={id}
          className="text-xs font-medium text-navy-600 select-none"
        >
          {label}
        </label>
      ) : null}
      <div className={wrapper}>
        {iconStart ? (
          <span
            className="absolute inset-y-0 start-3 flex items-center text-navy-400 pointer-events-none"
            aria-hidden="true"
          >
            {typeof iconStart === 'function' ? iconStart(16) : iconStart}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          type={effectiveType}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={helperId}
          className={inputCls}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal(v => !v)}
            disabled={disabled}
            className="absolute inset-y-0 end-2 flex items-center justify-center w-7 h-7 my-auto rounded-md text-navy-500 hover:text-navy-700 hover:bg-navy-50 transition-colors"
            aria-label={reveal ? hideLabel : revealLabel}
            aria-pressed={reveal}
          >
            {reveal ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        ) : iconEnd ? (
          <span className="absolute inset-y-0 end-3 flex items-center text-navy-400 pointer-events-none" aria-hidden="true">
            {typeof iconEnd === 'function' ? iconEnd(16) : iconEnd}
          </span>
        ) : null}
      </div>
      {(helper || error) ? (
        <p
          id={helperId}
          role={hasError ? 'alert' : undefined}
          className={[
            'text-xs',
            hasError ? 'text-rose-700' : 'text-navy-500',
          ].join(' ')}
        >
          {error || helper}
        </p>
      ) : null}
    </div>
  )
})

export default Input
