/**
 * XrayUploadModal — multi-file X-ray upload with shared batch metadata.
 * Dropzone + per-file thumbnails + per-file best-effort upload with a summary
 * toast + retry-failed-only. Metadata fields are the shared <XrayMetadataForm>
 * (applied to every file in the batch).
 */
import { useState, useEffect, useRef } from 'react'
import { Modal, Icons } from './shared'
import { Button } from './ui'
import XrayMetadataForm from './XrayMetadataForm'
import { uploadXray, generateThumbnail } from '../lib/xrays'
import { todayLocal } from '../lib/date'

const ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp']
const ACCEPT_ATTR = ACCEPT_MIME.join(',')
const MAX_FILES = 20
const WARN_FILES = 10

// HEIC/HEIF (the iPhone default) reports as image/heic|heif, or sometimes an
// empty type with a .heic/.heif name — detect both so we can give a targeted hint.
const isHeic = (f) => /image\/hei[cf]/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || '')

export default function XrayUploadModal({ patientId, lang, dir, onClose, onUploaded, toast }) {
  const isRTL = lang === 'ar'
  const [items, setItems] = useState([]) // { id, file, thumb, status:'pending'|'ok'|'failed', error }
  const [form, setForm] = useState({ xray_type: 'bitewing', date_taken: todayLocal(), teeth: [], treatment_plan_id: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)
  const thumbTried = useRef(new Set()) // item ids we've already attempted a thumbnail for

  // Generate a thumbnail for each pending item exactly once (driven off items,
  // so it can't race the cap or attach to the wrong id). Cosmetic → placeholder on failure.
  useEffect(() => {
    for (const it of items) {
      if (it.thumb == null && it.status === 'pending' && !thumbTried.current.has(it.id)) {
        thumbTried.current.add(it.id)
        generateThumbnail(it.file)
          .then(thumb => setItems(cur => cur.map(x => (x.id === it.id ? { ...x, thumb } : x))))
          .catch(err => console.warn('[XrayUploadModal] thumbnail failed:', it.file?.name, err))
      }
    }
  }, [items])

  const addFiles = (fileList) => {
    const all = Array.from(fileList || [])
    if (!all.length) return
    const incoming = all.filter(f => ACCEPT_MIME.includes(f.type))
    // Previously rejected files were dropped silently — a dentist dragging an
    // iPhone HEIC or a PDF saw nothing happen. Surface an explicit toast.
    const rejected = all.filter(f => !ACCEPT_MIME.includes(f.type))
    if (rejected.length) {
      toast?.(
        rejected.some(isHeic)
          ? (isRTL
              ? 'صيغة HEIC من آيفون غير مدعومة بعد. حوّلها إلى JPG/PNG أو التقط صورة جديدة.'
              : 'iPhone HEIC format not supported yet. Convert to JPG/PNG first or take a fresh photo.')
          : (isRTL
              ? 'الصيغة غير مدعومة. استخدم JPG أو PNG أو WebP.'
              : 'Format not supported. Use JPG, PNG, or WebP.'),
        'error',
      )
    }
    if (!incoming.length) return
    // ids built OUTSIDE the updater; the updater enforces the cap against the
    // authoritative prev.length (not a stale closure).
    const candidates = incoming.map(f => ({ id: crypto.randomUUID(), file: f, thumb: null, status: 'pending', error: null }))
    setItems(prev => [...prev, ...candidates.slice(0, Math.max(0, MAX_FILES - prev.length))])
    if (items.length + incoming.length > MAX_FILES) {
      toast?.(isRTL ? `الحد الأقصى ${MAX_FILES} ملفًا للدفعة` : `Maximum ${MAX_FILES} files per batch`, 'error')
    }
  }

  const removeItem = (id) => setItems(prev => prev.filter(x => x.id !== id))
  const onPick = (e) => { addFiles(e.target.files); e.target.value = '' }
  const onDrop = (e) => { e.preventDefault(); setDragging(false); if (!submitting) addFiles(e.dataTransfer?.files) }

  const handleSubmit = async () => {
    if (!items.length || submitting) return
    setSubmitting(true)
    const batchId = crypto.randomUUID()
    const metadata = {
      xray_type: form.xray_type,
      date_taken: form.date_taken,
      teeth_shown: form.teeth,
      notes: form.notes || null,
      treatment_plan_id: form.treatment_plan_id || null,
    }
    let ok = 0
    const failedNames = []
    const next = []
    for (const it of items) {
      if (it.status === 'ok') { next.push(it); ok += 1; continue } // skip already-succeeded (retry path)
      try {
        await uploadXray({ patientId, file: it.file, metadata, thumbnailDataUrl: it.thumb, batchId })
        next.push({ ...it, status: 'ok', error: null }); ok += 1
      } catch (err) {
        console.error('[XrayUploadModal] upload failed:', it.file?.name, err)
        next.push({ ...it, status: 'failed', error: err?.message || 'failed' })
        failedNames.push(it.file?.name || '?')
      }
    }
    setItems(next)
    setSubmitting(false)

    const total = next.length
    if (ok === total) {
      toast?.(isRTL ? `تم رفع ${ok} ${ok === 1 ? 'صورة' : 'صور'}` : `Uploaded ${ok} ${ok === 1 ? 'file' : 'files'}`, 'success')
      onUploaded?.()
      onClose?.()
      return
    }
    if (ok > 0) onUploaded?.() // refresh grid for successes; keep modal open for retry
    toast?.(
      isRTL ? `تم رفع ${ok} من ${total}. فشل: ${failedNames.join('، ')}` : `${ok} of ${total} uploaded. Failed: ${failedNames.join(', ')}`,
      'error'
    )
  }

  const failedCount = items.filter(i => i.status === 'failed').length
  const submitLabel = submitting
    ? (isRTL ? 'جارٍ الرفع…' : 'Uploading…')
    : failedCount > 0
      ? (isRTL ? `إعادة محاولة الفاشل (${failedCount})` : `Retry failed (${failedCount})`)
      : (isRTL ? `رفع ${items.length}` : `Upload ${items.length}`) // button is disabled at 0 items

  return (
    <Modal onClose={() => { if (!submitting) onClose?.() }} dir={dir} width={560}>
      <div className="ds-root p-1">
        <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">{isRTL ? 'رفع أشعة' : 'Upload X-rays'}</h3>

        <div
          onClick={() => !submitting && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          aria-label={isRTL ? 'منطقة رفع صور الأشعة' : 'X-ray upload dropzone'}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
          className={[
            'rounded-xl border-2 border-dashed py-6 px-4 text-center cursor-pointer transition-colors',
            dragging ? 'border-accent-cyan-500 bg-accent-cyan-50/60' : 'border-navy-200 hover:border-accent-cyan-400 hover:bg-accent-cyan-50/30',
          ].join(' ')}
        >
          <div className="flex items-center justify-center gap-2 text-navy-500 text-sm">
            {Icons.plus ? Icons.plus(16) : '+'}
            <span>{isRTL ? 'اسحب الصور هنا أو انقر للاختيار (JPG / PNG / WebP)' : 'Drag images here or click to choose (JPG / PNG / WebP)'}</span>
          </div>
          <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} multiple onChange={onPick} className="hidden" />
        </div>

        {items.length > WARN_FILES && (
          <p className="text-[11px] text-amber-700 mt-2 m-0">
            {isRTL ? `ترفع ${items.length} ملفًا — فكّر بتقسيمها إلى دفعات أصغر.` : `Uploading ${items.length} files — consider splitting into smaller batches.`}
          </p>
        )}

        {items.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-3">
            {items.map(it => (
              <li key={it.id} className="relative w-16">
                <div className={[
                  'w-16 h-16 rounded-md overflow-hidden border bg-navy-50 grid place-items-center',
                  it.status === 'ok' ? 'border-emerald-400' : it.status === 'failed' ? 'border-rose-400' : 'border-navy-200',
                ].join(' ')}>
                  {it.thumb
                    ? <img src={it.thumb} alt="" className="w-full h-full object-cover" />
                    : <span className="text-navy-400 text-[10px]">{isRTL ? 'صورة' : 'IMG'}</span>}
                </div>
                {!submitting && (
                  <button type="button" onClick={() => removeItem(it.id)} aria-label={isRTL ? 'إزالة' : 'Remove'}
                    className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-navy-800 text-white text-xs grid place-items-center">×</button>
                )}
                <span className="block text-[9px] text-navy-500 truncate mt-0.5" title={it.file.name}>{it.file.name}</span>
                {it.status === 'failed' && <span className="block text-[9px] text-rose-600">{isRTL ? 'فشل' : 'failed'}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <XrayMetadataForm value={form} onChange={setForm} patientId={patientId} lang={lang} dir={dir} disabled={submitting} />
        </div>

        <div className="flex gap-2 justify-end mt-3">
          <Button variant="secondary" disabled={submitting} onClick={() => onClose?.()}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || items.length === 0}>{submitLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
