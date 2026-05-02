import { forwardRef, useId } from 'react'

/**
 * Select — minimal styled wrapper around the native <select> for first cut.
 *
 * The native control inherits OS keyboard / accessibility / RTL handling
 * for free, which matters for screen-reader users on mobile. A fully custom
 * dropdown panel can be built later (`SelectMenu`) for cases that need
 * search, multi-select, or rich item rendering — primitives stay minimal.
 *
 * `options` shape: `[{ value, label, disabled? }, ...]`. Pass `placeholder`
 * to render a leading disabled option that hints at empty state.
 */
export const Select = forwardRef(function Select(
  {
    id: idProp,
    label,
    options = [],
    placeholder,
    error,
    helper,
    disabled,
    className = '',
    selectClassName = '',
    children,
    ...rest
  },
  ref,
) {
  const reactId  = useId()
  const id       = idProp || `sel-${reactId}`
  const helperId = (helper || error) ? `${id}-help` : undefined
  const hasError = !!error

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

  const selectCls = [
    'peer flex-1 bg-transparent outline-none appearance-none',
    'text-sm text-navy-800',
    'h-full ps-3.5 pe-9',
    'cursor-pointer disabled:cursor-not-allowed',
    selectClassName,
  ].join(' ')

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-navy-600 select-none">
          {label}
        </label>
      ) : null}
      <div className={wrapper}>
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={helperId}
          className={selectCls}
          {...rest}
        >
          {placeholder ? <option value="" disabled hidden>{placeholder}</option> : null}
          {children
            ? children
            : options.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
        </select>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 end-3 flex items-center text-navy-400 pointer-events-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {(helper || error) ? (
        <p
          id={helperId}
          role={hasError ? 'alert' : undefined}
          className={['text-xs', hasError ? 'text-rose-700' : 'text-navy-500'].join(' ')}
        >
          {error || helper}
        </p>
      ) : null}
    </div>
  )
})

export default Select
