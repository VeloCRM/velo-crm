import { C, makeBtn } from '../design'

export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, variant = 'danger', onConfirm, onCancel, dir }) {
  if (!open) return null
  const isRTL = dir === 'rtl'

  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 3000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ direction: dir, width: 420, maxWidth: '92vw', textAlign: 'center', padding: 32, borderRadius: 12 }}>
        {/* Warning icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
          background: variant === 'danger' ? C.dangerBg : C.warningBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {variant === 'danger' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.danger} strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.warning} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>{title}</h3>
        <p style={{ fontSize: 13, color: C.textSec, margin: '0 0 24px', lineHeight: 1.5 }}>{message}</p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onCancel} style={makeBtn('secondary', { minWidth: 100, fontSize: 14, height: 36 })}>
            {cancelLabel || (isRTL ? 'إلغاء' : 'Cancel')}
          </button>
          <button onClick={onConfirm} style={makeBtn(variant, { minWidth: 100, fontSize: 14, height: 36 })}>
            {confirmLabel || (isRTL ? 'حذف' : 'Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
