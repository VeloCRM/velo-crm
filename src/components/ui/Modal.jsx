import { useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'

const SIZES = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-2xl',
  xl:  'max-w-4xl',
}

/**
 * Modal — full-screen blurred backdrop with a centered glass card.
 *
 * - Closes on Escape (unless `dismissOnEsc={false}`) and backdrop click
 *   (unless `dismissOnBackdrop={false}`).
 * - Locks body scroll while open.
 * - Initial focus moves to the first focusable element inside the panel
 *   (or the close button as a fallback).
 * - Bilingual: pass `title`, `closeLabel` as props.
 *
 * Renders into a portal on document.body so z-index isolation works
 * regardless of where the trigger lives in the tree.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size              = 'md',
  closeLabel        = 'Close',
  dismissOnEsc      = true,
  dismissOnBackdrop = true,
  showClose         = true,
  className         = '',
  bodyClassName     = '',
}) {
  const panelRef = useRef(null)
  const titleId  = useId()

  // Esc-to-close + body scroll lock + initial focus.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissOnEsc) onClose?.()
    }
    document.addEventListener('keydown', onKey)

    // Initial focus — first focusable child, or panel itself.
    const t = setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(focusable || panel).focus?.()
    }, 0)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [open, onClose, dismissOnEsc])

  if (!open || typeof document === 'undefined') return null

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget && dismissOnBackdrop) onClose?.()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 animate-fade-in"
    >
      {/* Backdrop */}
      <div
        onClick={onBackdrop}
        className="absolute inset-0 bg-glass-overlay backdrop-blur-glass-sm"
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'relative w-full',
          SIZES[size] ?? SIZES.md,
          'glass-card glass-card--strong rounded-glass-lg',
          'p-0 outline-none animate-glass-in',
          'shadow-glass-lg',
          className,
        ].join(' ')}
      >
        {(title || showClose) ? (
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-3 border-b border-navy-50/80">
            {title ? (
              <h2 id={titleId} className="text-lg font-semibold text-navy-800 leading-tight">
                {title}
              </h2>
            ) : <span />}
            {showClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="grid place-items-center w-8 h-8 rounded-md text-navy-500 hover:text-navy-700 hover:bg-navy-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            ) : null}
          </header>
        ) : null}

        <div className={['px-6 py-5 text-sm text-navy-700', bodyClassName].join(' ')}>
          {children}
        </div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 px-6 pb-6 pt-3 border-t border-navy-50/80">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
