/**
 * useZoomPan — custom zoom/pan/pinch for an image viewer (no dependency).
 * Cursor-centered wheel zoom, Pointer-Events pan (1 pointer) + pinch (2),
 * clamp scale 0.5×–5× and pan to the zoomed overflow, fit via reset().
 *
 * Pass a ref to the viewer element. Returns { t:{scale,x,y}, reset, zoomBy,
 * handlers }. Spread `handlers` onto the viewer; the non-passive wheel listener
 * is attached/cleaned up internally.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

const MIN_SCALE = 0.5
const MAX_SCALE = 5

export default function useZoomPan(viewerRef) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map())
  const pinch = useRef(null)

  const reset = useCallback(() => {
    pointers.current.clear()
    pinch.current = null
    setT({ scale: 1, x: 0, y: 0 })
  }, [])

  const zoomAt = useCallback((clientX, clientY, factor) => {
    if (!Number.isFinite(factor) || factor <= 0) return
    setT(prev => {
      const el = viewerRef.current
      if (!el) return prev
      const r = el.getBoundingClientRect()
      const cx = clientX - r.left - r.width / 2
      const cy = clientY - r.top - r.height / 2
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      if (!Number.isFinite(scale)) return prev
      const k = scale / prev.scale
      // clamp pan to the zoomed OVERFLOW so a non-zoomed image can't drift off-centre
      const mx = (r.width * Math.max(0, scale - 1)) / 2
      const my = (r.height * Math.max(0, scale - 1)) / 2
      const nx = Math.max(-mx, Math.min(mx, cx - (cx - prev.x) * k))
      const ny = Math.max(-my, Math.min(my, cy - (cy - prev.y) * k))
      return { scale, x: nx, y: ny }
    })
  }, [viewerRef])

  // Non-passive wheel so preventDefault works; cleaned up on unmount.
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewerRef, zoomAt])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      pinch.current = d > 0 ? { dist: d } : null // guard coincident pointers (no /0)
    }
  }

  const onPointerMove = (e) => {
    const prevPt = pointers.current.get(e.pointerId)
    if (!prevPt) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      const dx = e.clientX - prevPt.x
      const dy = e.clientY - prevPt.y
      setT(p => {
        const r = viewerRef.current?.getBoundingClientRect()
        const mx = r ? (r.width * Math.max(0, p.scale - 1)) / 2 : 0
        const my = r ? (r.height * Math.max(0, p.scale - 1)) / 2 : 0
        return { ...p, x: Math.max(-mx, Math.min(mx, p.x + dx)), y: Math.max(-my, Math.min(my, p.y + dy)) }
      })
    } else if (pointers.current.size === 2 && pinch.current?.dist > 0) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist > 0) {
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.current.dist)
        pinch.current.dist = dist
      }
    }
  }

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const zoomBy = (factor) => {
    const el = viewerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  return {
    t,
    reset,
    zoomBy,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
  }
}
