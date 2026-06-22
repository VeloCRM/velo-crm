/**
 * XrayLightbox — fullscreen in-place X-ray viewer (replaces PR-B1's window.open).
 * Custom zoom/pan/pinch (no library), metadata view + edit + delete, prev/next
 * across the grid's filtered set. Dark overlay at z-[2900] (ConfirmDialog sits
 * above at 3000). NOT wrapped in .ds-root (would hijack to the light surface).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from './ui'
import { Icons } from './shared'
import XrayMetadataForm from './XrayMetadataForm'
import ConfirmDialog from './ConfirmDialog'
import { XRAY_TYPE_OPTIONS } from '../lib/xrayTypes'
import { getXraySignedUrl, updateXray, deleteXray } from '../lib/xrays'
import { fetchTreatmentPlansForPatient } from '../lib/dental'

const MIN_SCALE = 0.5
const MAX_SCALE = 5

// ── Zoom/pan gesture core (~60 LOC; custom, no dependency) ───────────────────
function useZoomPan(viewerRef) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const reset = useCallback(() => setT({ scale: 1, x: 0, y: 0 }), [])

  const zoomAt = useCallback((clientX, clientY, factor) => {
    setT(prev => {
      const el = viewerRef.current
      if (!el) return prev
      const r = el.getBoundingClientRect()
      const cx = clientX - r.left - r.width / 2
      const cy = clientY - r.top - r.height / 2
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      const k = scale / prev.scale
      const mx = (r.width * scale) / 2
      const my = (r.height * scale) / 2
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
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
    }
  }
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      setT(p => {
        const el = viewerRef.current
        const r = el?.getBoundingClientRect()
        const mx = r ? (r.width * p.scale) / 2 : Infinity
        const my = r ? (r.height * p.scale) / 2 : Infinity
        return { ...p, x: Math.max(-mx, Math.min(mx, p.x + dx)), y: Math.max(-my, Math.min(my, p.y + dy)) }
      })
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.current.dist)
      pinch.current.dist = dist
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

function formatBytes(n) {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function XrayLightbox({ list, index, canEdit, patientId, lang, dir, toast, onIndexChange, onClose, onMutated }) {
  const isRTL = lang === 'ar'
  const viewerRef = useRef(null)
  const closeBtnRef = useRef(null)
  const { t, reset, zoomBy, handlers } = useZoomPan(viewerRef)

  const [active, setActive] = useState(list[index])
  const [url, setUrl] = useState(null)
  const [imgState, setImgState] = useState('loading') // loading | loaded | error
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showMeta, setShowMeta] = useState(false) // mobile toggle: image (false) vs metadata (true)
  const [planLabels, setPlanLabels] = useState({})
  const retried = useRef(false)

  const hasPrev = index > 0
  const hasNext = index < list.length - 1
  const goPrev = useCallback(() => { if (index > 0) onIndexChange(index - 1) }, [index, onIndexChange])
  const goNext = useCallback(() => { if (index < list.length - 1) onIndexChange(index + 1) }, [index, list.length, onIndexChange])

  // Sync the displayed row + reset view whenever the index changes.
  useEffect(() => { setActive(list[index]); setEditing(false); setShowMeta(false); reset() }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sign the full-size URL for the active row (progressive: thumbnail shows first).
  useEffect(() => {
    if (!active?.id) return
    let cancelled = false
    setUrl(null); setImgState('loading'); retried.current = false
    getXraySignedUrl(active.id, 3600)
      .then(({ url: u }) => { if (!cancelled) (u ? setUrl(u) : setImgState('error')) })
      .catch(() => { if (!cancelled) setImgState('error') })
    return () => { cancelled = true }
  }, [active?.id])

  // Plan labels for the view-mode "linked treatment" line.
  useEffect(() => {
    let cancelled = false
    fetchTreatmentPlansForPatient(patientId)
      .then(rows => {
        if (cancelled) return
        const m = {}
        for (const r of (rows || [])) {
          const d = r.created_at ? new Date(r.created_at).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
          m[r.id] = `${d}${r.status ? ` — ${r.status}` : ''}`
        }
        setPlanLabels(m)
      })
      .catch(err => console.error('[XrayLightbox] plan labels load failed:', err))
    return () => { cancelled = true }
  }, [patientId, isRTL])

  // Keyboard: Esc close, arrows nav, +/- zoom, 0 fit (suspended during edit/confirm).
  useEffect(() => {
    const onKey = (e) => {
      if (editing || confirmDel) { if (e.key === 'Escape') { setConfirmDel(false); setEditing(false) } return }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === '+' || e.key === '=') zoomBy(1.25)
      else if (e.key === '-') zoomBy(0.8)
      else if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, confirmDel, goPrev, goNext, onClose, zoomBy, reset])

  // Focus the close button on open; restore focus to the trigger on unmount.
  useEffect(() => {
    const prevFocus = document.activeElement
    closeBtnRef.current?.focus()
    return () => { if (prevFocus && prevFocus.focus) prevFocus.focus() }
  }, [])

  if (!active) return null

  const onImgError = () => {
    // One re-fetch in case the signed URL expired mid-view.
    if (retried.current) { setImgState('error'); return }
    retried.current = true
    getXraySignedUrl(active.id, 3600)
      .then(({ url: u }) => (u ? setUrl(u) : setImgState('error')))
      .catch(() => setImgState('error'))
  }

  const startEdit = () => {
    setEditForm({
      xray_type: active.xray_type,
      date_taken: active.date_taken,
      teeth: active.teeth_shown || [],
      treatment_plan_id: active.treatment_plan_id || '',
      notes: active.notes || '',
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    const prev = active
    const optimistic = {
      ...active,
      xray_type: editForm.xray_type,
      date_taken: editForm.date_taken,
      teeth_shown: editForm.teeth,
      treatment_plan_id: editForm.treatment_plan_id || null,
      notes: editForm.notes || null,
    }
    setActive(optimistic) // optimistic
    try {
      const row = await updateXray(active.id, {
        xray_type: editForm.xray_type,
        date_taken: editForm.date_taken,
        teeth_shown: editForm.teeth,
        treatment_plan_id: editForm.treatment_plan_id || null,
        notes: editForm.notes || null,
      })
      setActive(row)
      setEditing(false)
      toast?.(isRTL ? 'تم تحديث الصورة' : 'X-ray updated', 'success')
      onMutated?.()
    } catch (err) {
      console.error('[XrayLightbox] update failed:', err)
      setActive(prev) // rollback
      toast?.(err?.message || (isRTL ? 'فشل التحديث' : 'Update failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      await deleteXray(active.id)
      toast?.(isRTL ? 'تم حذف الصورة' : 'X-ray deleted', 'success')
      setConfirmDel(false)
      onMutated?.()
      onClose()
    } catch (err) {
      console.error('[XrayLightbox] delete failed:', err)
      toast?.(err?.message || (isRTL ? 'فشل الحذف' : 'Delete failed'), 'error')
      setConfirmDel(false)
      setDeleting(false)
    }
  }

  const typeLabel = (() => {
    const o = XRAY_TYPE_OPTIONS.find(x => x.id === active.xray_type)
    return o ? (isRTL ? o.ar : o.en) : active.xray_type
  })()
  const dateLabel = active.date_taken
    ? new Date(`${active.date_taken}T00:00:00`).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : (isRTL ? 'بدون تاريخ' : 'Undated')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isRTL ? 'عارض صور الأشعة' : 'X-ray viewer'}
      className="fixed inset-0 z-[2900] flex flex-col bg-navy-900/90 backdrop-blur-sm"
      dir={dir}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 text-white/90 text-sm shrink-0">
        <span className="font-semibold truncate">{active.file_name}</span>
        <span className="text-white/50 hidden sm:inline">
          {[formatBytes(active.file_size), active.uploader?.full_name, dateLabel].filter(Boolean).join(' · ')}
        </span>
        <span className="ms-auto text-white/60 text-xs">{index + 1} / {list.length}</span>
        <button type="button" onClick={() => setShowMeta(m => !m)} className="md:hidden px-2 py-1 rounded text-white/80 hover:bg-white/10" aria-label={isRTL ? 'تبديل العرض' : 'Toggle metadata'}>
          {showMeta ? (isRTL ? 'الصورة' : 'Image') : (isRTL ? 'التفاصيل' : 'Details')}
        </button>
        <button ref={closeBtnRef} type="button" onClick={onClose} aria-label={isRTL ? 'إغلاق' : 'Close'} className="w-8 h-8 grid place-items-center rounded-full text-white/90 hover:bg-white/15">
          {Icons.x ? Icons.x(18) : '×'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Viewer */}
        <div className={`relative flex-1 min-w-0 ${showMeta ? 'hidden md:flex' : 'flex'}`}>
          <div
            ref={viewerRef}
            {...handlers}
            onDoubleClick={reset}
            className="absolute inset-0 overflow-hidden grid place-items-center select-none"
            style={{ touchAction: 'none', cursor: t.scale > 1 ? 'grab' : 'default' }}
            aria-label={isRTL ? `صورة الأشعة: ${typeLabel}` : `X-ray image: ${typeLabel}`}
          >
            {/* progressive: thumbnail under the full image */}
            {active.thumbnail_data_url && imgState !== 'loaded' && (
              <img src={active.thumbnail_data_url} alt="" aria-hidden="true" className="max-w-full max-h-full object-contain opacity-60 blur-[1px]" />
            )}
            {url && imgState !== 'error' && (
              <img
                src={url}
                alt={isRTL ? `صورة أشعة ${typeLabel}` : `${typeLabel} X-ray`}
                onLoad={() => setImgState('loaded')}
                onError={onImgError}
                draggable={false}
                className="max-w-full max-h-full object-contain"
                style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
              />
            )}
            {imgState === 'loading' && !active.thumbnail_data_url && (
              <span className="text-white/60 text-sm">{isRTL ? 'جارٍ التحميل…' : 'Loading…'}</span>
            )}
            {imgState === 'error' && (
              <div className="text-center text-white/70 text-sm">
                <p className="m-0">{isRTL ? 'تعذّر تحميل الصورة.' : 'Could not load the image.'}</p>
                <button type="button" onClick={() => { retried.current = false; setImgState('loading'); onImgError() }} className="mt-2 underline">{isRTL ? 'إعادة المحاولة' : 'Retry'}</button>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-navy-900/70 rounded-full px-2 py-1">
            <button type="button" onClick={() => zoomBy(0.8)} aria-label={isRTL ? 'تصغير' : 'Zoom out'} className="w-8 h-8 grid place-items-center text-white/90 hover:bg-white/10 rounded-full">−</button>
            <button type="button" onClick={reset} aria-label={isRTL ? 'ملء الشاشة' : 'Fit'} className="px-2 h-8 text-white/90 hover:bg-white/10 rounded-full text-xs">{Math.round(t.scale * 100)}%</button>
            <button type="button" onClick={() => zoomBy(1.25)} aria-label={isRTL ? 'تكبير' : 'Zoom in'} className="w-8 h-8 grid place-items-center text-white/90 hover:bg-white/10 rounded-full">+</button>
          </div>

          {/* Prev / next */}
          {hasPrev && <button type="button" onClick={goPrev} aria-label={isRTL ? 'السابق' : 'Previous'} className="absolute start-2 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-navy-900/60 text-white hover:bg-navy-900/80">‹</button>}
          {hasNext && <button type="button" onClick={goNext} aria-label={isRTL ? 'التالي' : 'Next'} className="absolute end-2 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-navy-900/60 text-white hover:bg-navy-900/80">›</button>}
        </div>

        {/* Metadata sidebar */}
        <aside className={`w-full md:w-80 shrink-0 bg-white overflow-y-auto ${showMeta ? 'block' : 'hidden md:block'}`}>
          <div className="ds-root p-4 flex flex-col gap-3">
            {editing ? (
              <>
                <h3 className="text-base font-semibold text-navy-900 m-0">{isRTL ? 'تعديل البيانات' : 'Edit details'}</h3>
                <XrayMetadataForm value={editForm} onChange={setEditForm} patientId={patientId} lang={lang} dir={dir} disabled={saving} />
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" disabled={saving} onClick={() => setEditing(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
                  <Button variant="primary" disabled={saving} onClick={saveEdit}>{saving ? (isRTL ? 'جارٍ الحفظ…' : 'Saving…') : (isRTL ? 'حفظ' : 'Save')}</Button>
                </div>
              </>
            ) : (
              <>
                <Row label={isRTL ? 'النوع' : 'Type'} value={typeLabel} />
                <Row label={isRTL ? 'التاريخ' : 'Date'} value={dateLabel} />
                <Row label={isRTL ? 'الأسنان' : 'Teeth'} value={(active.teeth_shown || []).join(', ') || '—'} />
                <Row label={isRTL ? 'خطة العلاج' : 'Treatment'} value={active.treatment_plan_id ? (planLabels[active.treatment_plan_id] || (isRTL ? 'مرتبطة' : 'Linked')) : '—'} />
                <Row label={isRTL ? 'ملاحظات' : 'Notes'} value={active.notes || '—'} />
                {canEdit && (
                  <div className="flex gap-2 justify-end mt-2">
                    <Button variant="secondary" onClick={startEdit}>{isRTL ? 'تعديل' : 'Edit'}</Button>
                    <Button variant="danger" onClick={() => setConfirmDel(true)}>{isRTL ? 'حذف' : 'Delete'}</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDel}
        dir={dir}
        title={isRTL ? 'حذف صورة الأشعة؟' : 'Delete X-ray?'}
        message={isRTL ? 'لا يمكن التراجع عن هذا الإجراء.' : 'This cannot be undone.'}
        confirmLabel={deleting ? (isRTL ? 'جارٍ الحذف…' : 'Deleting…') : (isRTL ? 'حذف' : 'Delete')}
        onConfirm={doDelete}
        onCancel={() => !deleting && setConfirmDel(false)}
      />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</span>
      <span className="text-sm text-navy-800 break-words whitespace-pre-wrap">{value}</span>
    </div>
  )
}
