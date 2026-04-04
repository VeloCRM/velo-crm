import { useState, useEffect, useCallback, useRef } from 'react'
import { C } from '../design'

const TYPE_STYLES = {
  success: { bg: '#F0FDF4', border: '#16A34A', color: '#16A34A', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
  )},
  error: { bg: '#FEF2F2', border: '#DC2626', color: '#DC2626', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  )},
  info: { bg: '#EFF6FF', border: '#2563EB', color: '#2563EB', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  )},
  warning: { bg: '#FFFBEB', border: '#D97706', color: '#D97706', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  )},
}

let _toastId = 0

export function useToast() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef([])

  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current = [] }
  }, [])

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, removing: false }])
    const t1 = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
      const t2 = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
      timersRef.current.push(t2)
    }, duration)
    timersRef.current.push(t1)
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
    const t = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    timersRef.current.push(t)
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
            background: C.white, borderRadius: 8, border: `1px solid ${C.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', minWidth: 280, maxWidth: 420,
            pointerEvents: 'auto', direction: isRTL ? 'rtl' : 'ltr',
            animation: toast.removing ? 'toast-out .3s ease forwards' : 'toast-in .3s ease',
            borderLeft: isRTL ? 'none' : `3px solid ${style.border}`,
            borderRight: isRTL ? `3px solid ${style.border}` : 'none',
          }}>
            <span style={{ display: 'flex', flexShrink: 0 }}>{style.icon}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.text }}>{toast.message}</span>
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
