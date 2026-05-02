/**
 * Velo CRM — Dental tabs (new schema).
 *
 * Three tabs hosted by the patient profile:
 *   - MedicalHistoryTab — patients.medical_history (jsonb) + patients.allergies (jsonb[])
 *   - DentalChartTab    — dental_chart_entries rows (most-recent-finding per tooth)
 *   - TreatmentPlanTab  — treatment_plans + treatment_plan_items
 *
 * Each tab calls lib/dental directly (no parent prop callbacks). Permission
 * gating uses fetchMyProfile().role — owner/doctor can edit, receptionist/
 * assistant are read-only at the UI layer (RLS is the real boundary).
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, FormField, inputStyle, selectStyle, Modal } from './shared'
import {
  fetchPatientMedicalHistory,
  updatePatientMedicalHistory,
  fetchPatientAllergies,
  updatePatientAllergies,
  fetchDentalChartEntries,
  addDentalChartEntry,
  removeDentalChartEntry,
  fetchTreatmentPlansForPatient,
  createTreatmentPlan,
  updateTreatmentPlanStatus,
  removeTreatmentPlan,
  updateTreatmentPlanItemStatus,
  isValidFdiTooth,
} from '../lib/dental'
import { fetchMyProfile, listDoctorsInOrg } from '../lib/profiles'
import { formatMoney, toMinor } from '../lib/money'

// Roles allowed to mutate dental-tab state at the UI layer. RLS policies are
// the real security boundary; this just hides the buttons for read-only users.
const EDIT_ROLES = new Set(['owner', 'doctor'])

function useMyRole() {
  const [role, setRole] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchMyProfile()
      .then(p => { if (!cancelled) setRole(p?.role || null) })
      .catch(() => { if (!cancelled) setRole(null) })
    return () => { cancelled = true }
  }, [])
  return role
}


// ═══════════════════════════════════════════════════════════════════════════
// MEDICAL HISTORY TAB
// ═══════════════════════════════════════════════════════════════════════════

const MEDICAL_CONDITIONS = [
  { id: 'diabetes',          en: 'Diabetes',            ar: 'سكري' },
  { id: 'hypertension',      en: 'Hypertension',        ar: 'ضغط دم مرتفع' },
  { id: 'heart_disease',     en: 'Heart Disease',       ar: 'أمراض القلب' },
  { id: 'asthma',            en: 'Asthma',              ar: 'ربو' },
  { id: 'hepatitis',         en: 'Hepatitis',           ar: 'التهاب الكبد' },
  { id: 'bleeding_disorder', en: 'Bleeding Disorder',   ar: 'اضطراب نزيف' },
  { id: 'epilepsy',          en: 'Epilepsy',            ar: 'صرع' },
  { id: 'thyroid',           en: 'Thyroid Disorder',    ar: 'اضطراب الغدة الدرقية' },
]

const SMOKER_OPTIONS = [
  { id: 'no',     en: 'No',           ar: 'لا' },
  { id: 'yes',    en: 'Yes',          ar: 'نعم' },
  { id: 'former', en: 'Former',       ar: 'سابقاً' },
]

export function MedicalHistoryTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && EDIT_ROLES.has(role)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState({
    conditions: [], medications: '', surgeries: '', smoker: 'no',
    pregnancy: false, blood_type: '', notes: '',
  })
  const [allergies, setAllergies] = useState([])
  const [allergyDraft, setAllergyDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchPatientMedicalHistory(patient.id),
      fetchPatientAllergies(patient.id),
    ])
      .then(([hist, allg]) => {
        if (cancelled) return
        setHistory({
          conditions: Array.isArray(hist.conditions) ? hist.conditions : [],
          medications: hist.medications || '',
          surgeries:  hist.surgeries  || '',
          smoker:     hist.smoker     || 'no',
          pregnancy:  Boolean(hist.pregnancy),
          blood_type: hist.blood_type || '',
          notes:      hist.notes      || '',
        })
        setAllergies(Array.isArray(allg) ? allg : [])
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[MedicalHistoryTab] load failed:', err)
        toast?.(isRTL ? 'فشل تحميل التاريخ الطبي' : 'Failed to load medical history', 'error')
        setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  const set = (k, v) => setHistory(prev => ({ ...prev, [k]: v }))
  const toggleCondition = (id) => {
    setHistory(prev => {
      const has = prev.conditions.includes(id)
      const next = has ? prev.conditions.filter(c => c !== id) : [...prev.conditions, id]
      return { ...prev, conditions: next }
    })
  }
  const addAllergy = () => {
    const v = allergyDraft.trim()
    if (!v) return
    if (allergies.includes(v)) { setAllergyDraft(''); return }
    setAllergies(prev => [...prev, v])
    setAllergyDraft('')
  }
  const removeAllergy = (a) => setAllergies(prev => prev.filter(x => x !== a))

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      await Promise.all([
        updatePatientMedicalHistory(patient.id, history),
        updatePatientAllergies(patient.id, allergies),
      ])
      toast?.(isRTL ? 'تم الحفظ' : 'Saved', 'success')
    } catch (err) {
      console.error('[MedicalHistoryTab] save failed:', err)
      toast?.(isRTL ? 'فشل الحفظ' : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ ...card, padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
      {isRTL ? 'جاري التحميل...' : 'Loading...'}
    </div>
  }

  return (
    <form onSubmit={e => e.preventDefault()} style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
          {isRTL ? 'التاريخ الطبي' : 'Medical History'}
        </h3>
        {canEdit && (
          <button type="button" onClick={handleSave} disabled={saving}
            style={makeBtn('primary', saving ? { opacity: 0.6, cursor: 'wait' } : { gap: 6, fontSize: 12 })}>
            {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
          </button>
        )}
      </div>

      {/* Allergies — separate chip-input section */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>
          {isRTL ? 'الحساسيات' : 'Allergies'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {allergies.length === 0 && (
            <span style={{ fontSize: 12, color: C.textMuted }}>
              {isRTL ? 'لا توجد حساسيات مسجلة' : 'No allergies recorded'}
            </span>
          )}
          {allergies.map(a => (
            <span key={a} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: C.danger,
              fontSize: 12, fontWeight: 600, border: `1px solid ${C.danger}33`,
            }}>
              {a}
              {canEdit && (
                <button type="button" onClick={() => removeAllergy(a)} aria-label="Remove"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.danger, padding: 0, display: 'inline-flex' }}>
                  {Icons.x(12)}
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={allergyDraft} onChange={e => setAllergyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAllergy() }}}
              placeholder={isRTL ? 'مثال: بنسلين' : 'e.g. Penicillin'}
              maxLength={80}
              style={{ ...inputStyle(dir), flex: 1 }} />
            <button type="button" onClick={addAllergy} style={makeBtn('secondary', { gap: 4, fontSize: 12 })}>
              {Icons.plus(13)} {isRTL ? 'إضافة' : 'Add'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FormField label={isRTL ? 'الأدوية الحالية' : 'Current Medications'} dir={dir}>
          <input value={history.medications} onChange={e => set('medications', e.target.value)} disabled={!canEdit}
            placeholder={isRTL ? 'مثال: أسبرين، ميتفورمين' : 'e.g. Aspirin, Metformin'} maxLength={500}
            style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'فصيلة الدم' : 'Blood Type'} dir={dir}>
          <select value={history.blood_type} onChange={e => set('blood_type', e.target.value)} disabled={!canEdit}
            style={selectStyle(dir)}>
            <option value="">—</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
        </FormField>
        <FormField label={isRTL ? 'العمليات السابقة' : 'Past Surgeries'} dir={dir}>
          <input value={history.surgeries} onChange={e => set('surgeries', e.target.value)} disabled={!canEdit}
            placeholder={isRTL ? 'مثال: استئصال الزائدة 2019' : 'e.g. Appendectomy 2019'} maxLength={500}
            style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'مدخن' : 'Smoker'} dir={dir}>
          <select value={history.smoker} onChange={e => set('smoker', e.target.value)} disabled={!canEdit}
            style={selectStyle(dir)}>
            {SMOKER_OPTIONS.map(o => <option key={o.id} value={o.id}>{isRTL ? o.ar : o.en}</option>)}
          </select>
        </FormField>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 16, fontSize: 13, color: C.text }}>
        <input type="checkbox" checked={history.pregnancy} onChange={e => set('pregnancy', e.target.checked)} disabled={!canEdit} />
        {isRTL ? 'حامل' : 'Pregnant / may be pregnant'}
      </label>

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>
          {isRTL ? 'الحالات الصحية' : 'Medical Conditions'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {MEDICAL_CONDITIONS.map(c => {
            const active = history.conditions.includes(c.id)
            return (
              <button type="button" key={c.id} onClick={() => canEdit && toggleCondition(c.id)} disabled={!canEdit}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit', minHeight: 36,
                  border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                  background: active ? C.primaryBg : C.white, color: active ? C.primary : C.textSec,
                  opacity: canEdit ? 1 : 0.7,
                }}>
                {active ? '✓ ' : ''}{isRTL ? c.ar : c.en}
              </button>
            )
          })}
        </div>
      </div>

      <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
        <textarea value={history.notes} onChange={e => set('notes', e.target.value)} disabled={!canEdit}
          rows={3} maxLength={1000}
          style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
      </FormField>

      {!canEdit && (
        <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
          {isRTL ? 'وصول للقراءة فقط — لتعديل التاريخ الطبي يحتاج المستخدم دور طبيب أو مالك.' : 'Read-only access — editing the medical history requires doctor or owner role.'}
        </div>
      )}
    </form>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// DENTAL CHART TAB
// ═══════════════════════════════════════════════════════════════════════════

// FDI two-digit notation. The chart is drawn looking into the patient's
// mouth, so the patient's right side (quadrants 1, 4) sits on the viewer's
// left. Quadrants:
//   1 = upper right (18..11),   2 = upper left (21..28)
//   4 = lower right (48..41),   3 = lower left (31..38)
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const FINDING_STYLES = {
  cavity:          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Cavity',     ar: 'تسوس' },
  restoration:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Restoration', ar: 'حشوة' },
  missing:         { color: '#64748b', bg: 'rgba(100,116,139,0.15)', label: 'Missing',    ar: 'مفقود' },
  crown:           { color: '#d97706', bg: 'rgba(217,119,6,0.12)',  label: 'Crown',      ar: 'تاج' },
  bridge:          { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'Bridge',     ar: 'جسر' },
  implant:         { color: '#0d9488', bg: 'rgba(13,148,136,0.12)', label: 'Implant',    ar: 'زرعة' },
  root_canal_done: { color: '#1e40af', bg: 'rgba(30,64,175,0.12)',  label: 'Root Canal', ar: 'عصب' },
  healthy:         { color: '#22c55e', bg: 'rgba(255,255,255,0.04)', label: 'Healthy',   ar: 'سليم' },
}

const SURFACE_OPTIONS = [
  { id: '',          en: 'Whole tooth', ar: 'السن كامل' },
  { id: 'mesial',    en: 'Mesial',      ar: 'إنسي' },
  { id: 'distal',    en: 'Distal',      ar: 'وحشي' },
  { id: 'buccal',    en: 'Buccal',      ar: 'دهليزي' },
  { id: 'lingual',   en: 'Lingual',     ar: 'لساني' },
  { id: 'occlusal',  en: 'Occlusal',    ar: 'إطباقي' },
]

function findingLabel(f, isRTL) {
  const def = FINDING_STYLES[f]
  if (!def) return f
  return isRTL ? def.ar : def.label
}

export function DentalChartTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && EDIT_ROLES.has(role)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [activeTooth, setActiveTooth] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ finding: 'cavity', surface: '', notes: '' })

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchDentalChartEntries(patient.id)
      setEntries(rows)
    } catch (err) {
      console.error('[DentalChartTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل المخطط' : 'Failed to load chart', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  // Most-recent finding per tooth, derived from the entries list (already
  // ordered DESC by recorded_at by the helper).
  const findingByTooth = useMemo(() => {
    const map = {}
    for (const e of entries) {
      if (!(e.tooth_number in map)) map[e.tooth_number] = e.finding
    }
    return map
  }, [entries])

  const openTooth = (n) => {
    if (!canEdit) return
    setActiveTooth(n)
    setForm({ finding: 'cavity', surface: '', notes: '' })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!activeTooth) return
    setSubmitting(true)
    try {
      await addDentalChartEntry(patient.id, {
        tooth_number: activeTooth,
        surface: form.surface || null,
        finding: form.finding,
        notes: form.notes || null,
      })
      await reload()
      toast?.(isRTL ? 'تم تسجيل المعاينة' : 'Finding recorded', 'success')
      setShowForm(false)
      setActiveTooth(null)
    } catch (err) {
      console.error('[DentalChartTab] add failed:', err)
      toast?.(isRTL ? 'فشل إضافة المعاينة' : 'Failed to add finding', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteEntry = async (entryId) => {
    if (!canEdit) return
    try {
      await removeDentalChartEntry(entryId)
      setEntries(prev => prev.filter(e => e.id !== entryId))
      toast?.(isRTL ? 'تم الحذف' : 'Entry removed', 'success')
    } catch (err) {
      console.error('[DentalChartTab] remove failed:', err)
      toast?.(isRTL ? 'فشل الحذف' : 'Failed to delete entry', 'error')
    }
  }

  const Tooth = ({ num }) => {
    const finding = findingByTooth[num] || 'healthy'
    const style = FINDING_STYLES[finding]
    return (
      <button type="button" onClick={() => openTooth(num)} disabled={!canEdit}
        title={`#${num} — ${findingLabel(finding, isRTL)}`}
        style={{
          width: '100%', aspectRatio: '1 / 1', minHeight: 36,
          border: `2px solid ${style.color}`, borderRadius: 8, cursor: canEdit ? 'pointer' : 'default',
          background: style.bg, color: C.text, fontWeight: 700, fontSize: 11,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit', transition: 'transform .12s', padding: 0,
        }}>
        <span style={{ fontSize: 11, lineHeight: 1 }}>{num}</span>
      </button>
    )
  }

  return (
    <div>
      {/* Legend */}
      <div style={{ ...card, padding: '12px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {Object.entries(FINDING_STYLES).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: val.bg, border: `2px solid ${val.color}` }} />
            <span style={{ color: C.textSec, fontWeight: 500 }}>{isRTL ? val.ar : val.label}</span>
          </div>
        ))}
      </div>

      {/* Chart grid */}
      <div style={{ ...card, padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 20 }}>
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 8, textAlign: 'center' }}>
              {isRTL ? 'الفك العلوي (18-11 / 21-28)' : 'Upper jaw (18-11 / 21-28)'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 6, marginBottom: 18 }}>
              {UPPER_TEETH.map(n => <Tooth key={n} num={n} />)}
            </div>
            <div style={{ height: 1, background: C.border, margin: '4px 0 18px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 6 }}>
              {LOWER_TEETH.map(n => <Tooth key={n} num={n} />)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginTop: 8, textAlign: 'center' }}>
              {isRTL ? 'الفك السفلي (48-41 / 31-38)' : 'Lower jaw (48-41 / 31-38)'}
            </div>
          </>
        )}
        {!canEdit && !loading && (
          <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
            {isRTL ? 'وصول للقراءة فقط' : 'Read-only — recording findings requires doctor or owner role.'}
          </div>
        )}
      </div>

      {/* Recent findings list */}
      <div style={{ ...card, padding: 20, marginTop: 12 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>
          {isRTL ? 'آخر المعاينات' : 'Recent findings'}
        </h4>
        {entries.length === 0 ? (
          <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 16, margin: 0 }}>
            {isRTL ? 'لا توجد معاينات' : 'No findings recorded yet'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.slice(0, 12).map(e => {
              const style = FINDING_STYLES[e.finding] || FINDING_STYLES.healthy
              const when = e.recorded_at ? new Date(e.recorded_at).toLocaleString(isRTL ? 'ar-IQ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''
              const recName = e.recorder?.full_name || (isRTL ? 'غير معروف' : 'Unknown')
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: C.bg }}>
                  <div style={{ minWidth: 36, fontSize: 12, fontWeight: 700, color: style.color, fontVariantNumeric: 'tabular-nums' }}>#{e.tooth_number}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: style.bg, color: style.color, border: `1px solid ${style.color}33` }}>
                    {findingLabel(e.finding, isRTL)}
                  </span>
                  {e.surface && <span style={{ fontSize: 11, color: C.textSec, textTransform: 'capitalize' }}>{e.surface}</span>}
                  {e.notes && <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>{e.notes}</span>}
                  <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{when}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>· {recName}</span>
                  {canEdit && (
                    <button type="button" onClick={() => handleDeleteEntry(e.id)} aria-label="Delete"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'inline-flex' }}>
                      {Icons.trash(13)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add-finding modal */}
      {showForm && activeTooth && (
        <Modal onClose={() => { if (!submitting) { setShowForm(false); setActiveTooth(null) } }} dir={dir} width={460}>
          <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>
              {isRTL ? `سن رقم ${activeTooth}` : `Tooth #${activeTooth}`}
            </h3>
            <FormField label={isRTL ? 'المعاينة' : 'Finding'} dir={dir}>
              <select value={form.finding} onChange={e => setForm(p => ({ ...p, finding: e.target.value }))} style={selectStyle(dir)}>
                {Object.keys(FINDING_STYLES).map(f => (
                  <option key={f} value={f}>{findingLabel(f, isRTL)}</option>
                ))}
              </select>
            </FormField>
            <FormField label={isRTL ? 'السطح' : 'Surface'} dir={dir}>
              <select value={form.surface} onChange={e => setForm(p => ({ ...p, surface: e.target.value }))} style={selectStyle(dir)}>
                {SURFACE_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
              </select>
            </FormField>
            <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} maxLength={500}
                style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" disabled={submitting} onClick={() => { setShowForm(false); setActiveTooth(null) }} style={makeBtn('secondary')}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" disabled={submitting} style={makeBtn('primary', submitting ? { opacity: 0.6, cursor: 'wait' } : {})}>
                {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تسجيل' : 'Record')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT PLAN TAB
// ═══════════════════════════════════════════════════════════════════════════

const PLAN_STATUS_OPTIONS = [
  { id: 'proposed',    en: 'Proposed',    ar: 'مقترحة' },
  { id: 'accepted',    en: 'Accepted',    ar: 'مقبولة' },
  { id: 'in_progress', en: 'In Progress', ar: 'قيد التنفيذ' },
  { id: 'completed',   en: 'Completed',   ar: 'مكتملة' },
  { id: 'declined',    en: 'Declined',    ar: 'مرفوضة' },
]

const ITEM_STATUS_OPTIONS = [
  { id: 'pending',     en: 'Pending',     ar: 'معلق' },
  { id: 'in_progress', en: 'In Progress', ar: 'قيد التنفيذ' },
  { id: 'completed',   en: 'Completed',   ar: 'مكتمل' },
  { id: 'skipped',     en: 'Skipped',     ar: 'تم تخطيه' },
]

const PLAN_STATUS_COLOR = {
  proposed:    { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  accepted:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  in_progress: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  completed:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  declined:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

const ITEM_STATUS_COLOR = {
  pending:     { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  in_progress: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  completed:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  skipped:     { color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
}

export function TreatmentPlanTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && EDIT_ROLES.has(role)

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchTreatmentPlansForPatient(patient.id)
      setPlans(rows)
    } catch (err) {
      console.error('[TreatmentPlanTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل خطط العلاج' : 'Failed to load treatment plans', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  const handlePlanStatus = async (planId, nextStatus) => {
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status: nextStatus } : p))
    try { await updateTreatmentPlanStatus(planId, nextStatus) }
    catch (err) {
      console.error('[TreatmentPlanTab] plan status:', err)
      toast?.(isRTL ? 'فشل تحديث الحالة' : 'Failed to update status', 'error')
      reload()
    }
  }

  const handleItemStatus = async (planId, itemId, nextStatus) => {
    setPlans(prev => prev.map(p => p.id !== planId ? p : ({
      ...p,
      treatment_plan_items: (p.treatment_plan_items || []).map(it => it.id === itemId ? { ...it, status: nextStatus } : it),
    })))
    try { await updateTreatmentPlanItemStatus(itemId, nextStatus) }
    catch (err) {
      console.error('[TreatmentPlanTab] item status:', err)
      toast?.(isRTL ? 'فشل تحديث حالة البند' : 'Failed to update item status', 'error')
      reload()
    }
  }

  const handleDelete = async (planId) => {
    try {
      await removeTreatmentPlan(planId)
      setPlans(prev => prev.filter(p => p.id !== planId))
      toast?.(isRTL ? 'تم حذف الخطة' : 'Plan deleted', 'success')
    } catch (err) {
      console.error('[TreatmentPlanTab] remove failed:', err)
      toast?.(isRTL ? 'فشل الحذف' : 'Failed to delete plan', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
          {isRTL ? 'خطط العلاج' : 'Treatment Plans'}
        </h3>
        {canEdit && (
          <button type="button" onClick={() => setShowForm(true)} style={makeBtn('primary', { gap: 6, fontSize: 12 })}>
            {Icons.plus(14)} {isRTL ? 'خطة جديدة' : 'New Plan'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </div>
      ) : plans.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
          {isRTL ? 'لا توجد خطط علاج' : 'No treatment plans yet'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map(plan => {
            const sc = PLAN_STATUS_COLOR[plan.status] || PLAN_STATUS_COLOR.proposed
            const items = plan.treatment_plan_items || []
            const created = plan.created_at ? new Date(plan.created_at).toLocaleDateString(isRTL ? 'ar-IQ' : 'en-US') : ''
            return (
              <div key={plan.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {/* Plan header */}
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {plan.doctor?.full_name || (isRTL ? 'بدون طبيب' : 'No doctor')}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                      {created} · {items.length} {isRTL ? 'بنود' : (items.length === 1 ? 'item' : 'items')}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(plan.total_amount_minor, plan.currency)}
                  </div>
                  {canEdit ? (
                    <select value={plan.status} onChange={e => handlePlanStatus(plan.id, e.target.value)}
                      style={{
                        ...selectStyle(dir), width: 'auto', padding: '4px 12px', height: 30,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.color}55`, fontSize: 12, fontWeight: 700,
                      }}>
                      {PLAN_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
                    </select>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: 6, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 700 }}>
                      {isRTL ? PLAN_STATUS_OPTIONS.find(s => s.id === plan.status)?.ar : PLAN_STATUS_OPTIONS.find(s => s.id === plan.status)?.en}
                    </span>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => setConfirmDeleteId(plan.id)} aria-label="Delete plan"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, padding: 6, display: 'inline-flex' }}>
                      {Icons.trash(14)}
                    </button>
                  )}
                </div>
                {/* Items */}
                {items.length === 0 ? (
                  <p style={{ padding: '14px 18px', color: C.textMuted, fontSize: 12, margin: 0 }}>
                    {isRTL ? 'لا توجد بنود' : 'No line items'}
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        {[
                          isRTL ? 'السن' : 'Tooth',
                          isRTL ? 'السطح' : 'Surface',
                          isRTL ? 'الإجراء' : 'Procedure',
                          isRTL ? 'المبلغ' : 'Amount',
                          isRTL ? 'الحالة' : 'Status',
                        ].map((h, i) => (
                          <th key={i} style={{ padding: '8px 14px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600, color: C.textSec, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const ic = ITEM_STATUS_COLOR[item.status] || ITEM_STATUS_COLOR.pending
                        return (
                          <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: '8px 14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.text }}>{item.tooth_number ? `#${item.tooth_number}` : '—'}</td>
                            <td style={{ padding: '8px 14px', color: C.textSec, textTransform: 'capitalize' }}>{item.surface || '—'}</td>
                            <td style={{ padding: '8px 14px', color: C.text }}>{item.procedure_label}</td>
                            <td style={{ padding: '8px 14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.text }}>
                              {formatMoney(item.amount_minor, item.currency || plan.currency)}
                            </td>
                            <td style={{ padding: '6px 14px' }}>
                              {canEdit ? (
                                <select value={item.status} onChange={e => handleItemStatus(plan.id, item.id, e.target.value)}
                                  style={{
                                    ...selectStyle(dir), width: 'auto', padding: '2px 8px', height: 26,
                                    background: ic.bg, color: ic.color, border: `1px solid ${ic.color}55`, fontSize: 11, fontWeight: 700,
                                  }}>
                                  {ITEM_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
                                </select>
                              ) : (
                                <span style={{ padding: '2px 8px', borderRadius: 5, background: ic.bg, color: ic.color, fontSize: 11, fontWeight: 700 }}>
                                  {isRTL ? ITEM_STATUS_OPTIONS.find(s => s.id === item.status)?.ar : ITEM_STATUS_OPTIONS.find(s => s.id === item.status)?.en}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {plan.notes && (
                  <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textSec, fontStyle: 'italic' }}>
                    {plan.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <NewTreatmentPlanModal
          patientId={patient.id}
          dir={dir}
          isRTL={isRTL}
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); toast?.(isRTL ? 'تم إنشاء الخطة' : 'Plan created', 'success') }}
          onError={msg => toast?.(msg, 'error')}
        />
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>
            {isRTL ? 'حذف الخطة' : 'Delete Plan'}
          </h3>
          <p style={{ fontSize: 13, color: C.textSec, margin: '0 0 20px' }}>
            {isRTL ? 'سيتم حذف الخطة وجميع بنودها. لا يمكن التراجع.' : 'This will permanently delete the plan and all its items. This cannot be undone.'}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setConfirmDeleteId(null)} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
            <button type="button" onClick={() => handleDelete(confirmDeleteId)} style={makeBtn('danger')}>{isRTL ? 'حذف' : 'Delete'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ─── New-plan modal ────────────────────────────────────────────────────────
function NewTreatmentPlanModal({ patientId, dir, isRTL, onCancel, onSaved, onError }) {
  const [doctors, setDoctors] = useState([])
  const [doctorId, setDoctorId] = useState('')
  const [currency, setCurrency] = useState('IQD')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([
    { tooth_number: '', surface: '', procedure_label: '', amount: '' },
  ])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    listDoctorsInOrg()
      .then(rows => { if (!cancelled) setDoctors(rows) })
      .catch(() => { /* no doctors → "(none)" only */ })
    return () => { cancelled = true }
  }, [])

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it))
  }
  const addItemRow = () => setItems(prev => [...prev, { tooth_number: '', surface: '', procedure_label: '', amount: '' }])
  const removeItemRow = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const total = items.reduce((s, it) => s + toMinor(it.amount, currency), 0)

  const handleSubmit = async () => {
    // Drop empty rows; require at least one row with a label.
    const labeledItems = items.filter(it => (it.procedure_label || '').trim())

    if (labeledItems.length === 0) {
      onError(isRTL ? 'أضف بنداً واحداً على الأقل' : 'Add at least one line item')
      return
    }

    // Reject obviously bad FDI codes before the round-trip. The server CHECK
    // catches it too, but the message would be cryptic.
    for (const it of labeledItems) {
      if (it.tooth_number && !isValidFdiTooth(it.tooth_number)) {
        onError(isRTL
          ? `رقم سن غير صالح: "${it.tooth_number}". استخدم ترميز FDI (11-18, 21-28, 31-38, 41-48).`
          : `Invalid FDI tooth code "${it.tooth_number}". Use 11-18, 21-28, 31-38, or 41-48.`)
        return
      }
    }

    const cleanItems = labeledItems.map((it, idx) => ({
      tooth_number: it.tooth_number ? Number(it.tooth_number) : null,
      surface: it.surface || null,
      procedure_label: it.procedure_label.trim(),
      procedure_code: it.procedure_label.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 64),
      amount_minor: toMinor(it.amount || 0, currency),
      sequence: idx,
    }))

    setSubmitting(true)
    try {
      await createTreatmentPlan(patientId, {
        doctor_id: doctorId || null,
        status: 'proposed',
        currency,
        notes: notes.trim() || null,
        items: cleanItems,
      })
      onSaved()
    } catch (err) {
      console.error('[NewTreatmentPlanModal] create failed:', err)
      onError(err.message || (isRTL ? 'فشل إنشاء الخطة' : 'Failed to create plan'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={() => { if (!submitting) onCancel() }} dir={dir} width={720}>
      <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>
          {isRTL ? 'خطة علاج جديدة' : 'New Treatment Plan'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
          <FormField label={isRTL ? 'الطبيب' : 'Doctor'} dir={dir}>
            <select value={doctorId} onChange={e => setDoctorId(e.target.value)} style={selectStyle(dir)}>
              <option value="">{isRTL ? '— اختر —' : '— None —'}</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </FormField>
          <FormField label={isRTL ? 'العملة' : 'Currency'} dir={dir}>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={selectStyle(dir)}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </FormField>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginTop: 8, marginBottom: 8 }}>
          {isRTL ? 'البنود' : 'Line items'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 1fr 110px 32px', gap: 8, alignItems: 'center', fontSize: 11, color: C.textMuted, fontWeight: 600 }}>
            <span>{isRTL ? 'السن' : 'Tooth'}</span>
            <span>{isRTL ? 'السطح' : 'Surface'}</span>
            <span>{isRTL ? 'الإجراء' : 'Procedure'}</span>
            <span style={{ textAlign: 'right' }}>{isRTL ? 'المبلغ' : 'Amount'}</span>
            <span />
          </div>
          {items.map((it, idx) => {
            const toothInvalid = it.tooth_number !== '' && it.tooth_number != null && !isValidFdiTooth(it.tooth_number)
            return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 90px 1fr 110px 32px', gap: 8, alignItems: 'start' }}>
              <div>
                <input value={it.tooth_number} onChange={e => updateItem(idx, 'tooth_number', e.target.value)} type="number" min="11" max="48" placeholder="FDI"
                  title={isRTL ? 'ترميز FDI: ١١-١٨، ٢١-٢٨، ٣١-٣٨، ٤١-٤٨' : 'FDI: 11-18, 21-28, 31-38, 41-48'}
                  style={{ ...inputStyle(dir), padding: '0 8px', textAlign: 'center', borderColor: toothInvalid ? '#ef4444' : undefined }} />
                {toothInvalid && (
                  <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2, lineHeight: 1.2 }}>
                    {isRTL ? 'ترميز FDI غير صالح' : 'Invalid FDI'}
                  </div>
                )}
              </div>
              <select value={it.surface} onChange={e => updateItem(idx, 'surface', e.target.value)} style={{ ...selectStyle(dir), padding: '0 6px' }}>
                {SURFACE_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
              </select>
              <input value={it.procedure_label} onChange={e => updateItem(idx, 'procedure_label', e.target.value)} maxLength={200}
                placeholder={isRTL ? 'مثال: حشوة كومبوزيت' : 'e.g. Composite filling'}
                style={inputStyle(dir)} />
              <input value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)} type="number" min="0" step="0.01"
                placeholder="0" style={{ ...inputStyle(dir), textAlign: 'right' }} />
              <button type="button" onClick={() => removeItemRow(idx)} aria-label="Remove row" disabled={items.length === 1}
                style={{ border: 'none', background: 'transparent', cursor: items.length === 1 ? 'default' : 'pointer', color: C.textMuted, opacity: items.length === 1 ? 0.4 : 1, padding: 4, display: 'inline-flex' }}>
                {Icons.x(14)}
              </button>
            </div>
            )
          })}
        </div>
        <button type="button" onClick={addItemRow} style={makeBtn('secondary', { gap: 4, fontSize: 12 })}>
          {Icons.plus(13)} {isRTL ? 'إضافة بند' : 'Add row'}
        </button>

        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>{isRTL ? 'الإجمالي' : 'Total'}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total, currency)}</span>
        </div>

        <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={1000}
            style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
        </FormField>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" disabled={submitting} onClick={onCancel} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting} style={makeBtn('primary', submitting ? { opacity: 0.6, cursor: 'wait' } : {})}>
            {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إنشاء الخطة' : 'Create Plan')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
