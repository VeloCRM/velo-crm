import { useState, useRef, useEffect, useCallback } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, FormField, inputStyle, selectStyle, Modal } from './shared'
import DentalChart from './DentalChart'
import { getXraySignedUrl } from '../lib/dental'

// Internal: 600ms debounce with onBlur and unmount flush. Wraps an async
// callback so per-keystroke writes (medical history) coalesce into one.
function useDebouncedFlush(callback, delay = 600) {
  const callbackRef = useRef(callback)
  const timerRef = useRef(null)
  const pendingRef = useRef(null)
  const hasPendingRef = useRef(false)

  useEffect(() => { callbackRef.current = callback }, [callback])

  const debounced = useCallback((value) => {
    pendingRef.current = value
    hasPendingRef.current = true
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      hasPendingRef.current = false
      callbackRef.current(pendingRef.current)
    }, delay)
  }, [delay])

  const flush = useCallback(() => {
    if (!hasPendingRef.current) return
    clearTimeout(timerRef.current)
    hasPendingRef.current = false
    callbackRef.current(pendingRef.current)
  }, [])

  useEffect(() => () => flush(), [flush])

  return [debounced, flush]
}

// ─── Medical History Tab ────────────────────────────────────────────────────
export function MedicalHistoryTab({ contact, onUpdateMedicalHistory, lang, dir }) {
  const isRTL = lang === 'ar'
  const med = contact._medical || { allergies: '', medications: '', bloodType: '', conditions: [] }

  const CONDITIONS = [
    { id: 'diabetes', en: 'Diabetes', ar: 'سكري' },
    { id: 'hypertension', en: 'Hypertension', ar: 'ضغط دم مرتفع' },
    { id: 'heart_disease', en: 'Heart Disease', ar: 'أمراض القلب' },
    { id: 'asthma', en: 'Asthma', ar: 'ربو' },
    { id: 'hepatitis', en: 'Hepatitis', ar: 'التهاب الكبد' },
    { id: 'bleeding_disorder', en: 'Bleeding Disorder', ar: 'اضطراب نزيف' },
    { id: 'pregnancy', en: 'Pregnancy', ar: 'حمل' },
    { id: 'epilepsy', en: 'Epilepsy', ar: 'صرع' },
  ]

  const [form, setForm] = useState(med)
  const [debouncedSave, flush] = useDebouncedFlush(onUpdateMedicalHistory, 600)
  const set = (k, v) => { const n = { ...form, [k]: v }; setForm(n); debouncedSave(n) }
  const toggleCondition = (e, id) => {
    e.preventDefault()
    const conds = form.conditions.includes(id) ? form.conditions.filter(c => c !== id) : [...form.conditions, id]
    set('conditions', conds)
  }

  return (
    <form onSubmit={e => e.preventDefault()} style={{ ...card, padding: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 16px' }}>{isRTL ? 'التاريخ الطبي' : 'Medical History'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FormField label={isRTL ? 'الحساسية' : 'Allergies'} dir={dir}>
          <input value={form.allergies} onChange={e => set('allergies', e.target.value)} onBlur={flush} placeholder={isRTL ? 'مثال: بنسلين' : 'e.g. Penicillin, Latex'} style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'الأدوية الحالية' : 'Current Medications'} dir={dir}>
          <input value={form.medications} onChange={e => set('medications', e.target.value)} onBlur={flush} placeholder={isRTL ? 'الأدوية المستخدمة' : 'e.g. Aspirin, Metformin'} style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'فصيلة الدم' : 'Blood Type'} dir={dir}>
          <select value={form.bloodType} onChange={e => set('bloodType', e.target.value)} onBlur={flush} style={selectStyle(dir)}>
            <option value="">—</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
        </FormField>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 10 }}>{isRTL ? 'الحالات الصحية' : 'Medical Conditions'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CONDITIONS.map(c => {
            const active = form.conditions.includes(c.id)
            return (
              <button type="button" key={c.id} onClick={(e) => toggleCondition(e, c.id)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                background: active ? C.primaryBg : C.white, color: active ? C.primary : C.textSec, minHeight: 36,
              }}>
                {active ? '✓ ' : ''}{isRTL ? c.ar : c.en}
              </button>
            )
          })}
        </div>
      </div>
    </form>
  )
}

// ─── Dental Chart Tab ───────────────────────────────────────────────────────
export function DentalChartTab({ contact, onUpdateDentalChart, onAddToTreatmentPlan, lang }) {
  const teeth = contact._teeth || {}
  const handleUpdateTooth = (num, status) => {
    const updated = { ...teeth, [num]: status }
    onUpdateDentalChart(updated)
  }
  return <DentalChart teeth={teeth} onUpdateTooth={handleUpdateTooth} onAddToTreatmentPlan={onAddToTreatmentPlan} lang={lang} />
}

// ─── Treatment Plan Tab ─────────────────────────────────────────────────────
// `prefill` (optional): { tooth, condition } — when set, the form auto-opens
// with the tooth number pre-filled and a suggested procedure based on the
// diagnosis. Consumed once via `onPrefillConsumed` so it doesn't loop.
const CONDITION_PROCEDURE = {
  cavity: 'Filling',
  crown: 'Crown',
  root_canal: 'Root Canal',
  implant: 'Implant',
  missing: 'Implant or Bridge',
}

export function TreatmentPlanTab({ contact, onAddTreatment, lang, dir, prefill, onPrefillConsumed }) {
  const isRTL = lang === 'ar'
  const treatments = contact._treatments || []
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ procedure: '', tooth: '', cost: '', status: 'planned', treatmentDate: '' })
  const [submitting, setSubmitting] = useState(false)

  // When the dental chart hands us a tooth, auto-open the form with the
  // tooth and a suggested procedure. Consume the prefill so it doesn't loop.
  useEffect(() => {
    if (!prefill || !prefill.tooth) return
    setForm({
      procedure: CONDITION_PROCEDURE[prefill.condition] || '',
      tooth: String(prefill.tooth),
      cost: '',
      status: 'planned',
      treatmentDate: '',
    })
    setShowForm(true)
    if (onPrefillConsumed) onPrefillConsumed()
  }, [prefill?.tooth, prefill?.condition])

  const addTreatment = async () => {
    if (!form.procedure) return
    setSubmitting(true)
    try {
      await onAddTreatment(form)
      setForm({ procedure: '', tooth: '', cost: '', status: 'planned', treatmentDate: '' })
      setShowForm(false)
    } catch {
      // Parent toasted; keep modal open with form values intact
    } finally {
      setSubmitting(false)
    }
  }

  const statusColors = { planned: { bg: 'rgba(0,255,178,0.1)', text: '#00FFB2' }, in_progress: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' }, completed: { bg: 'rgba(0,255,136,0.1)', text: '#00ff88' } }

  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{isRTL ? 'خطة العلاج' : 'Treatment Plan'}</h3>
        <button type="button" onClick={() => setShowForm(true)} style={makeBtn('primary', { gap: 6, fontSize: 12 })}>{Icons.plus(14)} {isRTL ? 'إضافة علاج' : 'Add Treatment'}</button>
      </div>
      {treatments.length === 0 ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>{isRTL ? 'لا توجد علاجات مخططة' : 'No treatments planned'}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            {[isRTL ? 'الإجراء' : 'Procedure', isRTL ? 'السن' : 'Tooth', isRTL ? 'التكلفة' : 'Cost', isRTL ? 'الحالة' : 'Status', isRTL ? 'التاريخ' : 'Date'].map((h, i) =>
              <th key={i} style={{ padding: '8px 12px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600, color: C.textSec, fontSize: 11 }}>{h}</th>
            )}
          </tr></thead>
          <tbody>{treatments.map(tr => {
            const sc = statusColors[tr.status] || statusColors.planned
            return (
              <tr key={tr.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{tr.procedure}</td>
                <td style={{ padding: '10px 12px', color: C.textSec }}>#{tr.tooth || '—'}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>${tr.cost}</td>
                <td style={{ padding: '10px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.text, textTransform: 'capitalize' }}>{tr.status.replace('_', ' ')}</span></td>
                <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 12 }}>{tr.treatmentDate || '—'}</td>
              </tr>
            )
          })}</tbody>
        </table>
      )}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} dir={dir} width={460}>
          <form onSubmit={e => { e.preventDefault(); addTreatment() }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{isRTL ? 'إضافة علاج' : 'Add Treatment'}</h3>
            <FormField label={isRTL ? 'الإجراء' : 'Procedure'} dir={dir}><input value={form.procedure} onChange={e => setForm(p => ({ ...p, procedure: e.target.value }))} placeholder={isRTL ? 'مثال: حشوة' : 'e.g. Filling, Crown'} style={inputStyle(dir)} /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <FormField label={isRTL ? 'رقم السن' : 'Tooth #'} dir={dir}><input value={form.tooth} onChange={e => setForm(p => ({ ...p, tooth: e.target.value }))} style={inputStyle(dir)} /></FormField>
              <FormField label={isRTL ? 'التكلفة' : 'Cost ($)'} dir={dir}><input value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} type="number" style={inputStyle(dir)} /></FormField>
              <FormField label={isRTL ? 'الحالة' : 'Status'} dir={dir}>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={selectStyle(dir)}>
                  <option value="planned">{isRTL ? 'مخطط' : 'Planned'}</option>
                  <option value="in_progress">{isRTL ? 'قيد التنفيذ' : 'In Progress'}</option>
                  <option value="completed">{isRTL ? 'مكتمل' : 'Completed'}</option>
                </select>
              </FormField>
              <FormField label={isRTL ? 'التاريخ' : 'Date'} dir={dir}><input value={form.treatmentDate} onChange={e => setForm(p => ({ ...p, treatmentDate: e.target.value }))} type="date" style={inputStyle(dir)} /></FormField>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowForm(false)} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} style={makeBtn('primary', submitting ? { opacity: 0.6, cursor: 'wait' } : {})}>
                {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إضافة' : 'Add')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Prescriptions Tab ──────────────────────────────────────────────────────
export function PrescriptionsTab({ contact, onAddPrescription, lang, dir }) {
  const isRTL = lang === 'ar'
  const prescriptions = contact._prescriptions || []
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ medication: '', dosage: '', duration: '', notes: '', prescribedDate: new Date().toISOString().slice(0, 10) })
  const [submitting, setSubmitting] = useState(false)

  const addPrescription = async () => {
    if (!form.medication) return
    setSubmitting(true)
    try {
      await onAddPrescription(form)
      setForm({ medication: '', dosage: '', duration: '', notes: '', prescribedDate: new Date().toISOString().slice(0, 10) })
      setShowForm(false)
    } catch {
      // Parent toasted; keep modal open
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{isRTL ? 'الوصفات الطبية' : 'Prescriptions'}</h3>
        <button type="button" onClick={() => setShowForm(true)} style={makeBtn('primary', { gap: 6, fontSize: 12 })}>{Icons.plus(14)} {isRTL ? 'وصفة جديدة' : 'New Prescription'}</button>
      </div>
      {prescriptions.length === 0 ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>{isRTL ? 'لا توجد وصفات' : 'No prescriptions'}</p>
      ) : prescriptions.map(rx => (
        <div key={rx.id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{rx.medication}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{rx.prescribedDate}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec }}>{rx.dosage} &middot; {rx.duration}</div>
          {rx.notes && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontStyle: 'italic' }}>{rx.notes}</div>}
        </div>
      ))}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} dir={dir} width={460}>
          <form onSubmit={e => { e.preventDefault(); addPrescription() }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{isRTL ? 'وصفة جديدة' : 'New Prescription'}</h3>
            <FormField label={isRTL ? 'الدواء' : 'Medication'} dir={dir}><input value={form.medication} onChange={e => setForm(p => ({ ...p, medication: e.target.value }))} style={inputStyle(dir)} /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <FormField label={isRTL ? 'الجرعة' : 'Dosage'} dir={dir}><input value={form.dosage} onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))} placeholder="500mg x 3" style={inputStyle(dir)} /></FormField>
              <FormField label={isRTL ? 'المدة' : 'Duration'} dir={dir}><input value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} placeholder="7 days" style={inputStyle(dir)} /></FormField>
            </div>
            <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle(dir), resize: 'vertical' }} /></FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowForm(false)} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} style={makeBtn('primary', submitting ? { opacity: 0.6, cursor: 'wait' } : {})}>
                {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إضافة' : 'Add')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── X-Rays Tab ─────────────────────────────────────────────────────────────
export function XRaysTab({ contact, onUploadXray, lang, dir }) {
  const isRTL = lang === 'ar'
  const xrays = contact._xrays || []
  const [lightbox, setLightbox] = useState(null)
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { await onUploadXray(file) } catch {}
    finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{isRTL ? 'صور الأشعة' : 'X-Rays'}</h3>
        <div><input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} style={makeBtn('primary', uploading ? { gap: 6, fontSize: 12, opacity: 0.6, cursor: 'wait' } : { gap: 6, fontSize: 12 })}>
            {Icons.upload(14)} {uploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (isRTL ? 'رفع صورة' : 'Upload X-Ray')}
          </button>
        </div>
      </div>
      {xrays.length === 0 && !uploading ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>{isRTL ? 'لا توجد صور أشعة' : 'No x-rays uploaded'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {uploading && <UploadingPlaceholder isRTL={isRTL} />}
          {xrays.map(xr => (
            <div key={xr.id} onClick={() => setLightbox(xr)} style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#000' }}>
              <XrayThumbnail xr={xr} isRTL={isRTL} />
              <div style={{ padding: '8px 10px', background: C.white }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{xr.fileName}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{xr.takenDate}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', position: 'relative' }}>
            <img src={lightbox.signedUrl} alt={lightbox.fileName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, display: 'block' }} />
            <div style={{ position: 'absolute', top: -40, right: 0 }}>
              <button type="button" onClick={() => setLightbox(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>&times;</button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{lightbox.fileName}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{lightbox.takenDate}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Two-step error recovery for x-ray thumbnails: signed-URL expiry triggers a
// refresh via getXraySignedUrl; if that also fails, fall back to a plain
// "unavailable" div. Legacy localStorage rows have storagePath=null and skip
// straight to the fallback (their data-URL signedUrl is never expirable).
function XrayThumbnail({ xr, isRTL }) {
  const [src, setSrc] = useState(xr.signedUrl)
  const [errorStage, setErrorStage] = useState(0)

  useEffect(() => {
    setSrc(xr.signedUrl)
    setErrorStage(0)
  }, [xr.signedUrl])

  const handleError = async () => {
    if (errorStage === 0 && xr.storagePath) {
      try {
        const fresh = await getXraySignedUrl(xr.storagePath)
        setSrc(fresh)
        setErrorStage(1)
      } catch {
        setErrorStage(2)
      }
    } else {
      setErrorStage(2)
    }
  }

  if (errorStage === 2 || !src) return <FallbackDiv isRTL={isRTL} />

  return (
    <img
      src={src}
      onError={handleError}
      loading="lazy"
      alt={xr.fileName || ''}
      style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
    />
  )
}

function FallbackDiv({ isRTL }) {
  return (
    <div style={{
      background: C.bg, color: C.textMuted, height: 120,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, padding: '0 12px', textAlign: 'center',
    }}>
      {isRTL ? 'الصورة غير متاحة' : 'X-ray unavailable'}
    </div>
  )
}

function UploadingPlaceholder({ isRTL }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px dashed ${C.border}`, background: C.bg, opacity: 0.7 }}>
      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 12 }}>
        {isRTL ? 'جاري الرفع...' : 'Uploading...'}
      </div>
      <div style={{ padding: '8px 10px', background: C.white }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>—</div>
        <div style={{ fontSize: 10, color: C.textMuted }}>—</div>
      </div>
    </div>
  )
}
