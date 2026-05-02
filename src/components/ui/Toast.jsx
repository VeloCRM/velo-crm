import { useEffect } from 'react'

const TYPE = {
  success: {
    accent: 'text-emerald-700',
    bar:    'bg-emerald-500',
    iconBg: 'bg-emerald-50 text-emerald-700',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
  info: {
    accent: 'text-accent-cyan-700',
    bar:    'bg-accent-cyan-500',
    iconBg: 'bg-accent-cyan-50 text-accent-cyan-700',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    ),
  },
  warning: {
    accent: 'text-amber-700',
    bar:    'bg-amber-500',
    iconBg: 'bg-amber-50 text-amber-700',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  error: {
    accent: 'text-rose-700',
    bar:    'bg-rose-500',
    iconBg: 'bg-rose-50 text-rose-700',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
  },
}

/**
 * Toast — single notification card. Slides in from the inline-end edge
 * (top-right in LTR, top-left in RTL via `[dir="rtl"]` flip).
 *
 * Bilingual: pass `title`, `message`, `closeLabel` as props.
 *
 * Caller is responsible for managing timing (auto-dismiss, queueing).
 * Pass `autoDismiss` (ms) to fire `onClose` after a delay.
 */
export function Toast({
  type = 'info',
  title,
  message,
  onClose,
  closeLabel = 'Dismiss',
  autoDismiss,
  className = '',
}) {
  const tone = TYPE[type] ?? TYPE.info

  useEffect(() => {
    if (!autoDismiss) return
    const t = setTimeout(() => onClose?.(), autoDismiss)
    return () => clearTimeout(t)
  }, [autoDismiss, onClose])

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={[
        'relative w-80 max-w-[calc(100vw-2rem)]',
        'glass-card glass-card--strong rounded-glass shadow-glass-lg',
        'flex items-start gap-3 ps-4 pe-3 py-3 overflow-hidden',
        'animate-toast-in rtl:animate-toast-in-rtl',
        className,
      ].join(' ')}
    >
      {/* Accent bar — pinned to inline-start */}
      <span aria-hidden="true" className={['absolute inset-y-0 start-0 w-1', tone.bar].join(' ')} />

      <span aria-hidden="true" className={['mt-0.5 grid place-items-center w-7 h-7 rounded-md shrink-0', tone.iconBg].join(' ')}>
        {tone.icon}
      </span>

      <div className="flex-1 min-w-0">
        {title ? (
          <p className={['text-sm font-semibold leading-snug', tone.accent].join(' ')}>{title}</p>
        ) : null}
        {message ? (
          <p className="text-[13px] text-navy-700 leading-snug mt-0.5">{message}</p>
        ) : null}
      </div>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-navy-700 hover:bg-navy-50 transition-colors shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      ) : null}
    </div>
  )
}

/**
 * ToastContainer — fixed-positioned stack on the inline-end edge (top).
 * Wrap with this when rendering multiple <Toast />s; layout stays correct
 * in both LTR and RTL via logical positioning.
 */
export function ToastContainer({ children, className = '' }) {
  return (
    <div
      className={[
        'pointer-events-none fixed top-4 end-4 z-[1100]',
        'flex flex-col items-end gap-2',
        '[&>*]:pointer-events-auto',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export default Toast
