import { useState, useEffect, useCallback } from 'react'
import { C } from '../design'

const TYPE_STYLES = {
  success: { bg: '#DAFBE1', border: '#1A7F37', color: '#1A7F37', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A7F37" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
  )},
  error: { bg: '#FFEBE9', border: '#CF222E', color: '#CF222E', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CF222E" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  )},
  info: { bg: '#DDF4FF', border: '#0969DA', color: '#0969DA', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0969DA" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  )},
  warning: { bg: '#FFF8C5', border: '#D29922', color: '#7D4E00', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D29922" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  )},
}

let _toastId = 0

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, removing: false }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    }, duration)
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  return { toasts, addToast, removeToast }
}

export function ToastContainer({ toasts, onRemove, isRTL }) {
  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, [isRTL ? 'left' : 'right']: 24,
      display: 'flex', flexDirection: 'column-reverse', gap: 8, zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info
        return (
          <div key={toast.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: C.white, borderRadius: 12, border: `1px solid ${style.border}30`,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 280, maxWidth: 420,
            pointerEvents: 'auto', direction: isRTL ? 'rtl' : 'ltr',
            animation: toast.removing ? 'toast-out .3s ease forwards' : 'toast-in .3s ease',
            borderLeft: isRTL ? 'none' : `3px solid ${style.border}`,
            borderRight: isRTL ? `3px solid ${style.border}` : 'none',
          }}>
            <span style={{ display: 'flex', flexShrink: 0 }}>{style.icon}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{toast.message}</span>
            <button onClick={() => onRemove(toast.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes toast-in { from { opacity:0; transform:translateY(16px) scale(.95) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes toast-out { from { opacity:1; transform:translateY(0) scale(1) } to { opacity:0; transform:translateY(16px) scale(.95) } }
      `}</style>
    </div>
  )
}
