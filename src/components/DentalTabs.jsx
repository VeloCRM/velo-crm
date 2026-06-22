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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Icons, FormField, inputStyle, selectStyle, Modal } from './shared'
import { GlassCard, Button } from './ui'
import ToothLabel from './ToothLabel'
import ToothSurfaces from './ToothSurfaces'
import useMyToothNotation from '../hooks/useMyToothNotation'
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
import {
  fetchPrescriptionsForPatient,
  createPrescription,
  updatePrescription,
  deletePrescription,
  fetchPrescriptionForPrint,
  logPrescriptionPrint,
} from '../lib/prescriptions'
import { getPrescriptionTemplateSignedUrl } from '../lib/database'
import {
  fetchDocumentsForPatient,
  uploadDocument,
  getDocumentSignedUrl,
  deleteDocument,
} from '../lib/documents'
import {
  fetchNotesForPatient,
  createNote,
  updateNote,
  deleteNote,
} from '../lib/notes'

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
    return (
      <div className="ds-root">
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="ds-root">
      <GlassCard padding="lg" as="form" onSubmit={e => e.preventDefault()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-navy-900 m-0">
            {isRTL ? 'التاريخ الطبي' : 'Medical History'}
          </h3>
          {canEdit && (
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
              {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
            </Button>
          )}
        </div>

        {/* Allergies */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mb-2">
            {isRTL ? 'الحساسيات' : 'Allergies'}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
            {allergies.length === 0 && (
              <span className="text-xs text-navy-400">
                {isRTL ? 'لا توجد حساسيات مسجلة' : 'No allergies recorded'}
              </span>
            )}
            {allergies.map(a => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200"
              >
                {a}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeAllergy(a)}
                    aria-label={isRTL ? 'إزالة' : 'Remove'}
                    className="text-rose-700 hover:text-rose-900 transition-colors inline-flex"
                  >
                    {Icons.x(12)}
                  </button>
                )}
              </span>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <input
                value={allergyDraft}
                onChange={e => setAllergyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAllergy() } }}
                placeholder={isRTL ? 'مثال: بنسلين' : 'e.g. Penicillin'}
                maxLength={80}
                style={{ ...inputStyle(dir), flex: 1 }}
              />
              <Button variant="secondary" size="sm" iconStart={Icons.plus} onClick={addAllergy}>
                {isRTL ? 'إضافة' : 'Add'}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
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

        <label className="flex items-center gap-2 mt-1 mb-5 text-sm text-navy-800">
          <input type="checkbox" checked={history.pregnancy} onChange={e => set('pregnancy', e.target.checked)} disabled={!canEdit}
            className="w-4 h-4 accent-accent-cyan-600" />
          {isRTL ? 'حامل' : 'Pregnant / may be pregnant'}
        </label>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mb-2">
            {isRTL ? 'الحالات الصحية' : 'Medical Conditions'}
          </div>
          <div className="flex gap-2 flex-wrap">
            {MEDICAL_CONDITIONS.map(c => {
              const active = history.conditions.includes(c.id)
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => canEdit && toggleCondition(c.id)}
                  disabled={!canEdit}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 h-9 rounded-glass text-xs font-semibold transition-colors',
                    active
                      ? 'bg-accent-cyan-50 text-accent-cyan-700 border-2 border-accent-cyan-500'
                      : 'bg-white text-navy-600 border border-navy-100 hover:border-navy-200 hover:text-navy-800',
                    canEdit ? 'cursor-pointer' : 'cursor-default opacity-70',
                  ].join(' ')}
                >
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
          <p className="mt-3 text-[11px] italic text-navy-400 m-0">
            {isRTL
              ? 'وصول للقراءة فقط — لتعديل التاريخ الطبي يحتاج المستخدم دور طبيب أو مالك.'
              : 'Read-only access — editing the medical history requires doctor or owner role.'}
          </p>
        )}
      </GlassCard>
    </div>
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
  const notation = useMyToothNotation()
  const canEdit = role && EDIT_ROLES.has(role)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [activeTooth, setActiveTooth] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ finding: 'cavity', surface: '', notes: '' })
  // When set, the modal was opened from a specific surface wedge → surface
  // dropdown is locked. null → interactive (whole-tooth / any surface) entry.
  const [prefillSurface, setPrefillSurface] = useState(null)

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

  // All entries grouped per tooth (each list stays DESC by recorded_at, as the
  // helper returns them). ToothSurfaces derives latest-per-surface from this.
  const entriesByTooth = useMemo(() => {
    const map = {}
    for (const e of entries) {
      if (!map[e.tooth_number]) map[e.tooth_number] = []
      map[e.tooth_number].push(e)
    }
    return map
  }, [entries])

  // Interactive entry (whole-tooth or any surface) — surface dropdown unlocked.
  const openTooth = (n) => {
    if (!canEdit) return
    setActiveTooth(n)
    setPrefillSurface(null)
    setForm({ finding: 'cavity', surface: '', notes: '' })
    setShowForm(true)
  }

  // Surface-specific entry from a wedge click — surface dropdown locked.
  const openSurface = (n, surface) => {
    if (!canEdit) return
    setActiveTooth(n)
    setPrefillSurface(surface)
    setForm({ finding: 'cavity', surface, notes: '' })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setActiveTooth(null); setPrefillSurface(null) }

  // Anterior teeth (FDI position 1-3) label the central surface "Incisal"
  // while still storing it as 'occlusal' (no schema/data change).
  const isAnterior = activeTooth != null && (activeTooth % 10) <= 3
  const surfaceOptionLabel = (s) => {
    if (s.id === 'occlusal' && isAnterior) return isRTL ? 'قاطعة' : 'Incisal'
    return isRTL ? s.ar : s.en
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
      closeForm()
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

  const renderTooth = (num) => (
    <ToothSurfaces
      key={num}
      fdi={num}
      findings={entriesByTooth[num] || []}
      findingStyles={FINDING_STYLES}
      onSurfaceClick={(surface) => openSurface(num, surface)}
      onAddClick={() => openTooth(num)}
      notation={notation}
      locale={lang}
      disabled={!canEdit}
    />
  )

  return (
    <div className="ds-root flex flex-col gap-3">
      {/* Legend */}
      <GlassCard padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(FINDING_STYLES).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className="block w-3.5 h-3.5 rounded-sm"
                style={{ background: val.bg, border: `2px solid ${val.color}` }}
              />
              <span className="text-navy-600 font-medium">{isRTL ? val.ar : val.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-navy-500 m-0 leading-snug">
          {isRTL
            ? 'انقر على سطح السن لتسجيل معاينة عليه، أو على رقم السن للمعاينات الشاملة للسن (مفقود، تاج، زرعة…). المعاينات الشاملة تلوّن السن بالكامل.'
            : 'Click a surface to record a finding on it, or the tooth number for whole-tooth findings (missing, crown, implant…). Whole-tooth findings tint the entire tooth.'}
        </p>
      </GlassCard>

      {/* Chart grid — 5-surface diamond-wedge teeth (see ToothSurfaces). */}
      <GlassCard padding="lg">
        {loading ? (
          <div className="text-center text-sm text-navy-500 py-5">
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : (
          <>
            <div className="text-[11px] font-semibold text-navy-500 mb-2 text-center uppercase tracking-wider">
              {notation === 'palmer'
                ? (isRTL ? 'الفك العلوي' : 'Upper jaw')
                : (isRTL ? 'الفك العلوي (18-11 / 21-28)' : 'Upper jaw (18-11 / 21-28)')}
            </div>
            {/* dir=ltr pins the arch order (patient-right on the viewer's left)
                regardless of UI language — a dental chart is conventionally LTR. */}
            <div dir="ltr" className="grid grid-cols-16 gap-1.5 mb-4" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
              {UPPER_TEETH.map(renderTooth)}
            </div>
            <div className="h-px bg-navy-100/80 my-1.5 mb-4" />
            <div dir="ltr" className="grid grid-cols-16 gap-1.5" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
              {LOWER_TEETH.map(renderTooth)}
            </div>
            <div className="text-[11px] font-semibold text-navy-500 mt-2 text-center uppercase tracking-wider">
              {notation === 'palmer'
                ? (isRTL ? 'الفك السفلي' : 'Lower jaw')
                : (isRTL ? 'الفك السفلي (48-41 / 31-38)' : 'Lower jaw (48-41 / 31-38)')}
            </div>
          </>
        )}
        {!canEdit && !loading && (
          <p className="mt-3 text-[11px] italic text-navy-400 text-center m-0">
            {isRTL ? 'وصول للقراءة فقط' : 'Read-only — recording findings requires doctor or owner role.'}
          </p>
        )}
      </GlassCard>

      {/* Recent findings list */}
      <GlassCard padding="lg">
        <h4 className="text-sm font-semibold text-navy-900 m-0 mb-3">
          {isRTL ? 'آخر المعاينات' : 'Recent findings'}
        </h4>
        {entries.length === 0 ? (
          <p className="text-xs text-navy-500 text-center py-4 m-0">
            {isRTL ? 'لا توجد معاينات' : 'No findings recorded yet'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.slice(0, 12).map(e => {
              const style = FINDING_STYLES[e.finding] || FINDING_STYLES.healthy
              const when = e.recorded_at ? new Date(e.recorded_at).toLocaleString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''
              const recName = e.recorder?.full_name || (isRTL ? 'غير معروف' : 'Unknown')
              return (
                <li key={e.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-navy-50/40">
                  <span
                    className="min-w-[36px] text-xs font-bold tabular-nums"
                    style={{ color: style.color }}
                  >
                    <ToothLabel fdi={e.tooth_number} notation={notation} locale={lang} hash />
                  </span>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}33` }}
                  >
                    {findingLabel(e.finding, isRTL)}
                  </span>
                  {e.surface && <span className="text-[11px] text-navy-600 capitalize">{e.surface}</span>}
                  {e.notes && <span className="text-[11px] text-navy-500 flex-1 truncate">{e.notes}</span>}
                  <span className="text-[11px] text-navy-400 ms-auto tabular-nums">{when}</span>
                  <span className="text-[11px] text-navy-400">· {recName}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(e.id)}
                      aria-label={isRTL ? 'حذف' : 'Delete'}
                      className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                    >
                      {Icons.trash(13)}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </GlassCard>

      {/* Add-finding modal */}
      {showForm && activeTooth && (
        <Modal onClose={() => { if (!submitting) closeForm() }} dir={dir} width={460}>
          <div className="ds-root">
            <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
              <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
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
                {prefillSurface != null ? (
                  // Opened from a surface wedge → surface is fixed, shown read-only.
                  <select value={form.surface} disabled aria-readonly="true"
                    style={{ ...selectStyle(dir), opacity: 0.75, cursor: 'not-allowed' }}>
                    {SURFACE_OPTIONS.map(s => <option key={s.id} value={s.id}>{surfaceOptionLabel(s)}</option>)}
                  </select>
                ) : (
                  <select value={form.surface} onChange={e => setForm(p => ({ ...p, surface: e.target.value }))} style={selectStyle(dir)}>
                    {SURFACE_OPTIONS.map(s => <option key={s.id} value={s.id}>{surfaceOptionLabel(s)}</option>)}
                  </select>
                )}
              </FormField>
              <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} maxLength={500}
                  style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
              </FormField>
              <div className="flex gap-2 justify-end mt-2">
                <Button variant="secondary" disabled={submitting} onClick={closeForm}>
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تسجيل' : 'Record')}
                </Button>
              </div>
            </form>
          </div>
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
  const notation = useMyToothNotation()
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
    <div className="ds-root flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-navy-900 m-0">
          {isRTL ? 'خطط العلاج' : 'Treatment Plans'}
        </h3>
        {canEdit && (
          <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={() => setShowForm(true)}>
            {isRTL ? 'خطة جديدة' : 'New Plan'}
          </Button>
        )}
      </div>

      {loading ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </GlassCard>
      ) : plans.length === 0 ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'لا توجد خطط علاج' : 'No treatment plans yet'}
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map(plan => {
            const sc = PLAN_STATUS_COLOR[plan.status] || PLAN_STATUS_COLOR.proposed
            const items = plan.treatment_plan_items || []
            const created = plan.created_at ? new Date(plan.created_at).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US') : ''
            return (
              <GlassCard key={plan.id} padding="none" className="overflow-hidden">
                {/* Plan header */}
                <div className="px-5 py-3.5 flex items-center gap-3 border-b border-navy-100/80 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-semibold text-navy-900">
                      {plan.doctor?.full_name || (isRTL ? 'بدون طبيب' : 'No doctor')}
                    </div>
                    <div className="text-[11px] text-navy-500 mt-1 tabular-nums">
                      {created} · {items.length} {isRTL ? 'بنود' : (items.length === 1 ? 'item' : 'items')}
                    </div>
                  </div>
                  <div className="text-base font-bold text-navy-900 tabular-nums">
                    {formatMoney(plan.total_amount_minor, plan.currency)}
                  </div>
                  {canEdit ? (
                    <select
                      value={plan.status}
                      onChange={e => handlePlanStatus(plan.id, e.target.value)}
                      style={{
                        ...selectStyle(dir), width: 'auto', padding: '4px 12px', height: 30,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.color}55`,
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {PLAN_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
                    </select>
                  ) : (
                    <span
                      className="px-2.5 py-1 rounded-md text-xs font-bold"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {isRTL ? PLAN_STATUS_OPTIONS.find(s => s.id === plan.status)?.ar : PLAN_STATUS_OPTIONS.find(s => s.id === plan.status)?.en}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(plan.id)}
                      aria-label={isRTL ? 'حذف الخطة' : 'Delete plan'}
                      className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                    >
                      {Icons.trash(14)}
                    </button>
                  )}
                </div>
                {/* Items */}
                {items.length === 0 ? (
                  <p className="px-5 py-3.5 text-xs text-navy-500 m-0">
                    {isRTL ? 'لا توجد بنود' : 'No line items'}
                  </p>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-navy-50/60">
                        {[
                          isRTL ? 'السن'    : 'Tooth',
                          isRTL ? 'السطح'   : 'Surface',
                          isRTL ? 'الإجراء' : 'Procedure',
                          isRTL ? 'المبلغ'  : 'Amount',
                          isRTL ? 'الحالة'  : 'Status',
                        ].map((h, i) => (
                          <th
                            key={i}
                            className="px-3.5 py-2 font-semibold text-navy-500 text-[11px] uppercase tracking-wider whitespace-nowrap"
                            style={{ textAlign: isRTL ? 'right' : 'left' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const ic = ITEM_STATUS_COLOR[item.status] || ITEM_STATUS_COLOR.pending
                        return (
                          <tr key={item.id} className="border-t border-navy-100/60">
                            <td className="px-3.5 py-2 font-semibold text-navy-800 tabular-nums">{item.tooth_number ? <ToothLabel fdi={item.tooth_number} notation={notation} locale={lang} hash /> : '—'}</td>
                            <td className="px-3.5 py-2 text-navy-600 capitalize">{item.surface || '—'}</td>
                            <td className="px-3.5 py-2 text-navy-800">{item.procedure_label}</td>
                            <td className="px-3.5 py-2 font-semibold text-navy-800 tabular-nums">
                              {formatMoney(item.amount_minor, item.currency || plan.currency)}
                            </td>
                            <td className="px-3.5 py-1.5">
                              {canEdit ? (
                                <select
                                  value={item.status}
                                  onChange={e => handleItemStatus(plan.id, item.id, e.target.value)}
                                  style={{
                                    ...selectStyle(dir), width: 'auto', padding: '2px 8px', height: 26,
                                    background: ic.bg, color: ic.color, border: `1px solid ${ic.color}55`,
                                    fontSize: 11, fontWeight: 700,
                                  }}
                                >
                                  {ITEM_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
                                </select>
                              ) : (
                                <span
                                  className="px-2 py-0.5 rounded text-[11px] font-bold"
                                  style={{ background: ic.bg, color: ic.color }}
                                >
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
                  <div className="px-5 py-2.5 border-t border-navy-100/60 text-xs text-navy-600 italic">
                    {plan.notes}
                  </div>
                )}
              </GlassCard>
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
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-3">
            {isRTL ? 'حذف الخطة' : 'Delete Plan'}
          </h3>
          <p className="text-sm text-navy-600 m-0 mb-5">
            {isRTL ? 'سيتم حذف الخطة وجميع بنودها. لا يمكن التراجع.' : 'This will permanently delete the plan and all its items. This cannot be undone.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)}>{isRTL ? 'حذف' : 'Delete'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ─── New-plan modal ────────────────────────────────────────────────────────
function NewTreatmentPlanModal({ patientId, dir, isRTL, onCancel, onSaved, onError }) {
  const notation = useMyToothNotation()
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
      <div className="ds-root">
        <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
            {isRTL ? 'خطة علاج جديدة' : 'New Treatment Plan'}
          </h3>

          <div className="grid grid-cols-[2fr_1fr] gap-x-4">
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

          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mt-2 mb-2">
            {isRTL ? 'البنود' : 'Line items'}
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="grid grid-cols-[60px_90px_1fr_110px_32px] gap-2 items-center text-[11px] text-navy-500 font-semibold">
              <span>{isRTL ? 'السن' : 'Tooth'}</span>
              <span>{isRTL ? 'السطح' : 'Surface'}</span>
              <span>{isRTL ? 'الإجراء' : 'Procedure'}</span>
              <span className="text-end">{isRTL ? 'المبلغ' : 'Amount'}</span>
              <span />
            </div>
            {items.map((it, idx) => {
              const toothInvalid = it.tooth_number !== '' && it.tooth_number != null && !isValidFdiTooth(it.tooth_number)
              return (
                <div key={idx} className="grid grid-cols-[60px_90px_1fr_110px_32px] gap-2 items-start">
                  <div>
                    <input
                      value={it.tooth_number}
                      onChange={e => updateItem(idx, 'tooth_number', e.target.value)}
                      type="number" min="11" max="48" placeholder="FDI"
                      title={isRTL ? 'ترميز FDI: ١١-١٨، ٢١-٢٨، ٣١-٣٨، ٤١-٤٨' : 'FDI: 11-18, 21-28, 31-38, 41-48'}
                      style={{ ...inputStyle(dir), padding: '0 8px', textAlign: 'center', borderColor: toothInvalid ? '#ef4444' : undefined }}
                    />
                    {toothInvalid && (
                      <div className="text-[10px] text-rose-700 mt-0.5 leading-tight">
                        {isRTL ? 'ترميز FDI غير صالح' : 'Invalid FDI'}
                      </div>
                    )}
                    {/* Display-only Palmer echo of the FDI entry (input stays FDI). */}
                    {notation === 'palmer' && it.tooth_number !== '' && it.tooth_number != null && !toothInvalid && (
                      <div className="text-[10px] text-navy-500 mt-0.5 leading-tight flex items-center justify-center">
                        <ToothLabel fdi={Number(it.tooth_number)} notation="palmer" locale={isRTL ? 'ar' : 'en'} />
                      </div>
                    )}
                  </div>
                  <select value={it.surface} onChange={e => updateItem(idx, 'surface', e.target.value)} style={{ ...selectStyle(dir), padding: '0 6px' }}>
                    {SURFACE_OPTIONS.map(s => <option key={s.id} value={s.id}>{isRTL ? s.ar : s.en}</option>)}
                  </select>
                  <input
                    value={it.procedure_label}
                    onChange={e => updateItem(idx, 'procedure_label', e.target.value)}
                    maxLength={200}
                    placeholder={isRTL ? 'مثال: حشوة كومبوزيت' : 'e.g. Composite filling'}
                    style={inputStyle(dir)}
                  />
                  <input
                    value={it.amount}
                    onChange={e => updateItem(idx, 'amount', e.target.value)}
                    type="number" min="0" step="0.01"
                    placeholder="0"
                    style={{ ...inputStyle(dir), textAlign: 'right' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    aria-label={isRTL ? 'إزالة الصف' : 'Remove row'}
                    disabled={items.length === 1}
                    className={[
                      'grid place-items-center w-7 h-7 rounded-md transition-colors',
                      items.length === 1
                        ? 'text-navy-300 cursor-default'
                        : 'text-navy-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer',
                    ].join(' ')}
                  >
                    {Icons.x(14)}
                  </button>
                </div>
              )
            })}
          </div>
          <Button variant="secondary" size="sm" iconStart={Icons.plus} onClick={addItemRow} type="button">
            {isRTL ? 'إضافة بند' : 'Add row'}
          </Button>

          <div className="mt-4 px-3.5 py-2.5 rounded-glass bg-navy-50/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-500">{isRTL ? 'الإجمالي' : 'Total'}</span>
            <span className="text-base font-bold text-navy-900 tabular-nums">{formatMoney(total, currency)}</span>
          </div>

          <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={1000}
              style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
          </FormField>

          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" disabled={submitting} onClick={onCancel}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
              {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إنشاء الخطة' : 'Create Plan')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

export function PrescriptionsTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && EDIT_ROLES.has(role)

  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // null = new; otherwise edit mode
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [printingId, setPrintingId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchPrescriptionsForPatient(patient.id)
      setPrescriptions(rows)
    } catch (err) {
      console.error('[PrescriptionsTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل الوصفات' : 'Failed to load prescriptions', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  const openNew = () => { setEditingId(null); setShowForm(true) }
  const openEdit = (rx) => { setEditingId(rx.id); setShowForm(true) }
  const editingPrescription = editingId ? prescriptions.find(p => p.id === editingId) : null

  const handleDelete = async (id) => {
    try {
      await deletePrescription(id)
      setPrescriptions(prev => prev.filter(p => p.id !== id))
      toast?.(isRTL ? 'تم حذف الوصفة' : 'Prescription deleted', 'success')
    } catch (err) {
      console.error('[PrescriptionsTab] delete failed:', err)
      toast?.(isRTL ? 'فشل الحذف' : 'Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="ds-root flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-navy-900 m-0">
          {isRTL ? 'الوصفات الطبية' : 'Prescriptions'}
        </h3>
        {canEdit && (
          <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={openNew}>
            {isRTL ? 'وصفة جديدة' : 'New Prescription'}
          </Button>
        )}
      </div>

      {loading ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </GlassCard>
      ) : prescriptions.length === 0 ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'لا توجد وصفات' : 'No prescriptions yet'}
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {prescriptions.map(rx => {
            const docName = rx.doctor?.full_name || (isRTL ? 'بدون طبيب' : 'No doctor')
            const issued = rx.issued_at
              ? new Date(rx.issued_at).toLocaleDateString(
                  isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US',
                  { dateStyle: 'medium' }
                )
              : ''
            const items = rx.prescription_items || []
            const canPrint = Boolean(rx.doctor?.prescription_template_url)
            const printDisabledTitle = isRTL
              ? 'لم يقم الطبيب برفع قالب وصفة. الإعدادات → الأطباء → [الطبيب] → قالب الوصفة.'
              : 'Doctor has not uploaded a prescription template. Settings → Doctors → [Doctor] → Prescription Template.'

            return (
              <GlassCard key={rx.id} padding="lg" className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-semibold text-navy-900">{docName}</div>
                    <div className="text-[11px] text-navy-500 mt-1 tabular-nums">
                      {issued} · {items.length} {isRTL ? 'دواء' : (items.length === 1 ? 'item' : 'items')}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => canPrint && setPrintingId(rx.id)}
                    disabled={!canPrint}
                    title={!canPrint ? printDisabledTitle : undefined}
                  >
                    {isRTL ? 'طباعة' : 'Print'}
                  </Button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(rx)}
                        aria-label={isRTL ? 'تعديل' : 'Edit'}
                        className="text-xs font-semibold text-navy-600 hover:text-accent-cyan-700 px-2 py-1 rounded-md hover:bg-accent-cyan-50/60 transition-colors"
                      >
                        {isRTL ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(rx.id)}
                        aria-label={isRTL ? 'حذف' : 'Delete'}
                        className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        {Icons.trash(14)}
                      </button>
                    </>
                  )}
                </div>
                {items.length > 0 && (
                  <ul className="flex flex-col gap-1 m-0 ps-0 list-none">
                    {items
                      .slice()
                      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map((item, idx) => (
                        <li key={item.id} className="text-xs text-navy-700 flex gap-1.5">
                          <span className="text-navy-400 tabular-nums w-5 text-end">{idx + 1}.</span>
                          <span className="flex-1">
                            <span className="font-semibold">{item.drug_name}</span>
                            {item.dosage && <span> · {item.dosage}</span>}
                            {item.frequency && <span> · {item.frequency}</span>}
                            {item.duration && <span> · {item.duration}</span>}
                            {item.instructions && <span className="text-navy-500"> — {item.instructions}</span>}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {rx.general_instructions && (
                  <div className="text-[11px] text-navy-600 italic mt-1 ps-6">
                    {rx.general_instructions}
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}

      {showForm && (
        <PrescriptionEntryModal
          patientId={patient.id}
          existing={editingPrescription}
          dir={dir}
          isRTL={isRTL}
          onCancel={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => {
            const wasEdit = Boolean(editingPrescription)
            setShowForm(false)
            setEditingId(null)
            reload()
            toast?.(
              wasEdit
                ? (isRTL ? 'تم تحديث الوصفة' : 'Prescription updated')
                : (isRTL ? 'تم إنشاء الوصفة' : 'Prescription created'),
              'success'
            )
          }}
          onError={msg => toast?.(msg, 'error')}
        />
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-3">
            {isRTL ? 'حذف الوصفة' : 'Delete Prescription'}
          </h3>
          <p className="text-sm text-navy-600 m-0 mb-5">
            {isRTL
              ? 'سيتم حذف الوصفة وجميع أدويتها. لا يمكن التراجع.'
              : 'This will permanently delete the prescription and all its items. This cannot be undone.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)}>{isRTL ? 'حذف' : 'Delete'}</Button>
          </div>
        </Modal>
      )}

      {printingId && (
        <PrescriptionPrintModal
          prescriptionId={printingId}
          dir={dir}
          isRTL={isRTL}
          onClose={() => setPrintingId(null)}
          toast={toast}
        />
      )}
    </div>
  )
}


// ─── Prescription entry modal — handles both new and edit ─────────────────
function PrescriptionEntryModal({ patientId, existing, dir, isRTL, onCancel, onSaved, onError }) {
  // Prefill state from `existing` (edit mode) or use fresh defaults (new mode).
  const initialItems = existing && Array.isArray(existing.prescription_items) && existing.prescription_items.length > 0
    ? existing.prescription_items
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(it => ({
          drug_name: it.drug_name || '',
          dosage: it.dosage || '',
          frequency: it.frequency || '',
          duration: it.duration || '',
          instructions: it.instructions || '',
        }))
    : [{ drug_name: '', dosage: '', frequency: '', duration: '', instructions: '' }]

  const initialIssuedAt = existing?.issued_at
    ? existing.issued_at.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const [doctors, setDoctors] = useState([])
  const [doctorId, setDoctorId] = useState(existing?.doctor_id || '')
  const [issuedAt, setIssuedAt] = useState(initialIssuedAt)
  const [generalInstructions, setGeneralInstructions] = useState(existing?.general_instructions || '')
  const [items, setItems] = useState(initialItems)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    listDoctorsInOrg()
      .then(rows => {
        if (cancelled) return
        // listDoctorsInOrg returns BOTH owners AND doctors. The schema trigger
        // (enforce_prescription_doctor_role) rejects non-doctor doctor_id, so
        // we filter here to surface only valid prescribers in the dropdown.
        setDoctors((rows || []).filter(d => d.role === 'doctor'))
      })
      .catch(() => { /* leave empty; submit validation will catch missing doctor */ })
    return () => { cancelled = true }
  }, [])

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it))
  }
  const addItemRow = () => setItems(prev => [
    ...prev,
    { drug_name: '', dosage: '', frequency: '', duration: '', instructions: '' },
  ])
  const removeItemRow = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (!doctorId) {
      onError(isRTL ? 'يرجى اختيار الطبيب' : 'Please select a doctor')
      return
    }

    const labeledItems = items.filter(it => (it.drug_name || '').trim())
    if (labeledItems.length === 0) {
      onError(isRTL ? 'أضف دواءً واحداً على الأقل' : 'Add at least one medication')
      return
    }

    const cleanItems = labeledItems.map((it, idx) => ({
      drug_name:    it.drug_name.trim(),
      dosage:       it.dosage.trim()       || null,
      frequency:    it.frequency.trim()    || null,
      duration:     it.duration.trim()     || null,
      instructions: it.instructions.trim() || null,
      sort_order:   idx,
    }))

    // Convert yyyy-mm-dd back to ISO timestamptz at noon local (avoids tz
    // edge cases where a midnight UTC value would land on the wrong day in
    // Asia/Baghdad).
    const issuedAtIso = issuedAt
      ? new Date(`${issuedAt}T12:00:00`).toISOString()
      : new Date().toISOString()

    setSubmitting(true)
    try {
      if (existing) {
        await updatePrescription(existing.id, {
          doctor_id: doctorId,
          issued_at: issuedAtIso,
          general_instructions: generalInstructions.trim() || null,
          items: cleanItems,
        })
      } else {
        await createPrescription(patientId, {
          doctor_id: doctorId,
          issued_at: issuedAtIso,
          general_instructions: generalInstructions.trim() || null,
          items: cleanItems,
        })
      }
      onSaved()
    } catch (err) {
      console.error('[PrescriptionEntryModal] save failed:', err)
      onError(err.message || (isRTL ? 'فشل حفظ الوصفة' : 'Failed to save prescription'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={() => { if (!submitting) onCancel() }} dir={dir} width={720}>
      <div className="ds-root">
        <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
            {existing
              ? (isRTL ? 'تعديل الوصفة' : 'Edit Prescription')
              : (isRTL ? 'وصفة جديدة' : 'New Prescription')}
          </h3>

          <div className="grid grid-cols-[2fr_1fr] gap-x-4">
            <FormField label={isRTL ? 'الطبيب' : 'Doctor'} dir={dir}>
              <select value={doctorId} onChange={e => setDoctorId(e.target.value)} required style={selectStyle(dir)}>
                <option value="">{isRTL ? '— اختر —' : '— Select —'}</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </FormField>
            <FormField label={isRTL ? 'التاريخ' : 'Date'} dir={dir}>
              <input
                type="date"
                value={issuedAt}
                onChange={e => setIssuedAt(e.target.value)}
                style={inputStyle(dir)}
              />
            </FormField>
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mt-2 mb-2">
            {isRTL ? 'الأدوية' : 'Medications'}
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="grid grid-cols-[1.5fr_80px_100px_80px_1fr_32px] gap-2 items-center text-[11px] text-navy-500 font-semibold">
              <span>{isRTL ? 'الدواء' : 'Drug'}</span>
              <span>{isRTL ? 'الجرعة' : 'Dosage'}</span>
              <span>{isRTL ? 'التكرار' : 'Frequency'}</span>
              <span>{isRTL ? 'المدة' : 'Duration'}</span>
              <span>{isRTL ? 'تعليمات' : 'Instructions'}</span>
              <span />
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1.5fr_80px_100px_80px_1fr_32px] gap-2 items-start">
                <input
                  value={it.drug_name}
                  onChange={e => updateItem(idx, 'drug_name', e.target.value)}
                  maxLength={200}
                  placeholder={isRTL ? 'مثال: أموكسيسيلين ٥٠٠ ملغ' : 'e.g. Amoxicillin 500mg'}
                  style={inputStyle(dir)}
                />
                <input
                  value={it.dosage}
                  onChange={e => updateItem(idx, 'dosage', e.target.value)}
                  maxLength={64}
                  placeholder={isRTL ? '٥٠٠ ملغ' : '500mg'}
                  style={inputStyle(dir)}
                />
                <input
                  value={it.frequency}
                  onChange={e => updateItem(idx, 'frequency', e.target.value)}
                  maxLength={64}
                  placeholder={isRTL ? '٣ مرات/يوم' : 'TID'}
                  style={inputStyle(dir)}
                />
                <input
                  value={it.duration}
                  onChange={e => updateItem(idx, 'duration', e.target.value)}
                  maxLength={64}
                  placeholder={isRTL ? '٧ أيام' : '7 days'}
                  style={inputStyle(dir)}
                />
                <input
                  value={it.instructions}
                  onChange={e => updateItem(idx, 'instructions', e.target.value)}
                  placeholder={isRTL ? 'مع الطعام' : 'With food'}
                  style={inputStyle(dir)}
                />
                <button
                  type="button"
                  onClick={() => removeItemRow(idx)}
                  aria-label={isRTL ? 'إزالة الصف' : 'Remove row'}
                  disabled={items.length === 1}
                  className={[
                    'grid place-items-center w-7 h-7 rounded-md transition-colors',
                    items.length === 1
                      ? 'text-navy-300 cursor-default'
                      : 'text-navy-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer',
                  ].join(' ')}
                >
                  {Icons.x(14)}
                </button>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" iconStart={Icons.plus} onClick={addItemRow} type="button">
            {isRTL ? 'إضافة دواء' : 'Add medication'}
          </Button>

          <FormField label={isRTL ? 'تعليمات عامة' : 'General instructions'} dir={dir}>
            <textarea
              value={generalInstructions}
              onChange={e => setGeneralInstructions(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={isRTL
                ? 'مثال: تجنب الكحول. أكمل العلاج كاملاً.'
                : 'e.g. Avoid alcohol. Complete the full course.'}
              style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }}
            />
          </FormField>

          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" disabled={submitting} onClick={onCancel}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
              {submitting
                ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                : existing
                  ? (isRTL ? 'تحديث' : 'Update')
                  : (isRTL ? 'حفظ' : 'Save')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}


// ─── Prescription print modal — fetch + scaled preview + window.print() ───
function PrescriptionPrintModal({ prescriptionId, dir, isRTL, onClose, toast }) {
  const [data, setData] = useState(null)
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [templateError, setTemplateError] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [preprintedMode, setPreprintedMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setTemplateError(false)
    setBgLoaded(false)
    setSignedUrl(null)
    setData(null)

    const load = async () => {
      try {
        const rx = await fetchPrescriptionForPrint(prescriptionId)
        if (cancelled) return
        if (!rx) {
          toast?.(isRTL ? 'لم يتم العثور على الوصفة' : 'Prescription not found', 'error')
          onClose()
          return
        }
        setData(rx)

        const path = rx.doctor?.prescription_template_url
        if (!path) {
          setTemplateError(true)
          setLoading(false)
          return
        }

        try {
          const url = await getPrescriptionTemplateSignedUrl(path)
          if (cancelled) return
          if (!url) {
            setTemplateError(true)
          } else {
            setSignedUrl(url)
          }
        } catch (urlErr) {
          console.error('[PrescriptionPrintModal] signed URL failed:', urlErr)
          if (!cancelled) setTemplateError(true)
        }
      } catch (err) {
        console.error('[PrescriptionPrintModal] load failed:', err)
        if (!cancelled) {
          toast?.(isRTL ? 'فشل تحميل الوصفة' : 'Failed to load prescription', 'error')
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [prescriptionId, toast, isRTL, onClose])

  const handlePrint = async () => {
    if (!data) return
    if (!preprintedMode && (!signedUrl || !bgLoaded)) return
    setPrinting(true)
    try {
      await logPrescriptionPrint(prescriptionId)
      window.print()
    } catch (err) {
      console.error('[PrescriptionPrintModal] print audit failed:', err)
      toast?.(isRTL ? 'فشل تسجيل الطباعة' : 'Failed to log print event', 'error')
    } finally {
      setPrinting(false)
    }
  }

  const issuedDate = data?.issued_at
    ? new Date(data.issued_at).toLocaleDateString(
        isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US',
        { dateStyle: 'medium' }
      )
    : ''
  const items = (data?.prescription_items || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return (
    <Modal onClose={() => { if (!printing) onClose() }} dir={dir} width={620}>
      <div className="ds-root">
        <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
          {isRTL ? 'طباعة الوصفة' : 'Print Prescription'}
        </h3>

        {loading ? (
          <div className="text-center text-sm text-navy-500 py-10">
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : templateError && !preprintedMode ? (
          <div className="rounded-glass bg-amber-50 border border-amber-200 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-amber-900 m-0 mb-2">
              {isRTL ? 'قالب الوصفة غير متوفر' : "Doctor's prescription template not available"}
            </p>
            <p className="text-xs text-amber-700 m-0 mb-2">
              {isRTL
                ? 'اتصل بالطبيب لرفع قالب الوصفة عبر الإعدادات → الأطباء → [الطبيب] → قالب الوصفة.'
                : 'Contact the doctor to upload it via Settings → Doctors → [Doctor] → Prescription Template.'}
            </p>
            <p className="text-xs text-amber-700 m-0">
              {isRTL
                ? 'أو إذا كانت وصفاتك مطبوعة مسبقاً، فعّل خيار "طباعة على وصفة مطبوعة مسبقاً" أدناه.'
                : 'Or, if your prescription pads are pre-printed with letterhead, enable "Print on pre-printed pad" below.'}
            </p>
          </div>
        ) : (
          <div className="rx-print-preview-container">
            <div className="rx-print">
              {!preprintedMode && signedUrl && (
                <img
                  className="rx-print__bg"
                  src={signedUrl}
                  alt=""
                  onLoad={() => setBgLoaded(true)}
                />
              )}
              <div className="rx-print__patient" dir={dir}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11pt' }}>
                  <span>
                    <strong>{isRTL ? 'المريض:' : 'Patient:'}</strong> {data?.patient?.full_name || ''}
                  </span>
                  <span>
                    <strong>{isRTL ? 'التاريخ:' : 'Date:'}</strong> {issuedDate}
                  </span>
                </div>
              </div>
              <div className="rx-print__meds" dir={dir}>
                <div style={{ fontSize: '24pt', fontWeight: 700, marginBottom: '4mm' }}>Rx</div>
                <ol style={{ paddingInlineStart: '6mm', margin: 0, fontSize: '11pt', lineHeight: 1.4 }}>
                  {items.map(item => (
                    <li key={item.id} style={{ marginBottom: '3mm' }}>
                      <strong>{item.drug_name}</strong>
                      {item.dosage ? ` ${item.dosage}` : ''}
                      {(item.frequency || item.duration || item.instructions) && (
                        <div style={{ fontSize: '10pt', color: '#475569', marginTop: '1mm' }}>
                          {item.frequency}
                          {item.frequency && item.duration ? ' × ' : ''}
                          {item.duration}
                          {(item.frequency || item.duration) && item.instructions ? ' · ' : ''}
                          {item.instructions}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              {data?.general_instructions && (
                <div className="rx-print__general" dir={dir}>
                  <strong>{isRTL ? 'تعليمات عامة:' : 'General:'}</strong> {data.general_instructions}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-navy-800 cursor-pointer">
            <input
              type="checkbox"
              checked={preprintedMode}
              onChange={e => setPreprintedMode(e.target.checked)}
              className="w-4 h-4 accent-accent-cyan-600"
            />
            {isRTL ? 'طباعة على وصفة مطبوعة مسبقاً' : 'Print on pre-printed pad'}
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={printing}>
              {isRTL ? 'إغلاق' : 'Close'}
            </Button>
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={printing || loading || !data || (!preprintedMode && (!signedUrl || !bgLoaded))}
              title={!preprintedMode && templateError ? (isRTL ? 'قالب الوصفة غير متوفر' : 'Template not available') : undefined}
            >
              {printing ? (isRTL ? 'جاري الطباعة...' : 'Printing...') : (isRTL ? 'طباعة' : 'Print')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════
// Per-patient file attachments. Wider edit gate than the other dental tabs —
// receptionists routinely handle paperwork (scans, ID/insurance copies).

const DOCUMENTS_EDIT_ROLES = new Set(['owner', 'doctor', 'receptionist'])

// Mirror of the data-layer + bucket MIME whitelist, for the file picker's
// `accept` attribute. The data layer + bucket are the real gate.
const DOCUMENT_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
].join(',')

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

// Small inline file glyph for non-image mime types (shared.jsx has no generic
// "file" icon). Images reuse Icons.image.
function docIcon(mime) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return Icons.image(18)
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

export function DocumentsTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && DOCUMENTS_EDIT_ROLES.has(role)

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const fileInputRef = useRef(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchDocumentsForPatient(patient.id)
      setDocuments(rows)
    } catch (err) {
      console.error('[DocumentsTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل الوثائق' : 'Failed to load documents', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  // Upload one or more files sequentially, then reload once.
  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setUploading(true)
    let ok = 0
    let firstError = null
    for (const file of files) {
      try {
        await uploadDocument(patient.id, file)
        ok += 1
      } catch (err) {
        console.error('[DocumentsTab] upload failed:', err)
        if (!firstError) firstError = err
      }
    }
    setUploading(false)
    if (ok > 0) {
      await reload()
      toast?.(
        isRTL ? `تم رفع ${ok} ${ok === 1 ? 'وثيقة' : 'وثائق'}` : `Uploaded ${ok} ${ok === 1 ? 'file' : 'files'}`,
        'success'
      )
    }
    if (firstError) {
      toast?.(firstError.message || (isRTL ? 'فشل الرفع' : 'Upload failed'), 'error')
    }
  }, [patient.id, reload, toast, isRTL])

  const onPick = (e) => {
    const files = e.target.files
    handleFiles(files)
    e.target.value = '' // allow re-picking the same file
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!canEdit || uploading) return
    handleFiles(e.dataTransfer?.files)
  }

  const openSigned = async (id, { download } = {}) => {
    setBusyId(id)
    try {
      const { url, fileName } = await getDocumentSignedUrl(id)
      if (!url) throw new Error(isRTL ? 'تعذر إنشاء الرابط' : 'Could not generate link')
      if (download) {
        // Supabase signed URLs honor a `download` query param → forces
        // Content-Disposition: attachment even across origins.
        const dlUrl = url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(fileName || '')
        const a = document.createElement('a')
        a.href = dlUrl
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('[DocumentsTab] signed-url failed:', err)
      toast?.(isRTL ? 'فشل فتح الوثيقة' : 'Failed to open document', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id)
      setDocuments(prev => prev.filter(d => d.id !== id))
      toast?.(isRTL ? 'تم حذف الوثيقة' : 'Document deleted', 'success')
    } catch (err) {
      console.error('[DocumentsTab] delete failed:', err)
      toast?.(isRTL ? 'فشل الحذف' : 'Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const dropHandlers = canEdit ? {
    onDragOver: (e) => { e.preventDefault(); if (!dragging) setDragging(true) },
    onDragLeave: () => setDragging(false),
    onDrop,
  } : {}

  const dropZone = (full) => (
    <div
      {...dropHandlers}
      onClick={() => canEdit && !uploading && fileInputRef.current?.click()}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={(e) => { if (canEdit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fileInputRef.current?.click() } }}
      className={[
        'rounded-xl border-2 border-dashed transition-colors text-center',
        full ? 'py-12 px-6' : 'py-3 px-4',
        dragging ? 'border-accent-cyan-500 bg-accent-cyan-50/60' : 'border-navy-200',
        canEdit && !uploading ? 'cursor-pointer hover:border-accent-cyan-400 hover:bg-accent-cyan-50/30' : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center justify-center gap-2 text-navy-500">
        {Icons.upload(full ? 22 : 16)}
        <span className={full ? 'text-sm font-medium' : 'text-xs font-medium'}>
          {uploading
            ? (isRTL ? 'جاري الرفع...' : 'Uploading...')
            : (isRTL ? 'اسحب الملفات هنا أو انقر للرفع' : 'Drag files here or click to upload')}
        </span>
      </div>
      {full && (
        <div className="text-[11px] text-navy-400 mt-2">
          {isRTL
            ? 'PDF أو صور أو Word أو Excel أو نص — بحد أقصى ٢٥ ميغابايت'
            : 'PDF, images, Word, Excel, or text — up to 25 MB'}
        </div>
      )}
    </div>
  )

  return (
    <div className="ds-root flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-navy-900 m-0">
          {isRTL ? 'الوثائق' : 'Documents'}
        </h3>
        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            iconStart={Icons.upload}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {isRTL ? 'رفع' : 'Upload'}
          </Button>
        )}
      </div>

      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          onChange={onPick}
          className="hidden"
        />
      )}

      {loading ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </GlassCard>
      ) : documents.length === 0 ? (
        canEdit
          ? dropZone(true)
          : (
            <GlassCard padding="lg" className="text-center text-sm text-navy-500">
              {isRTL ? 'لا توجد وثائق' : 'No documents yet'}
            </GlassCard>
          )
      ) : (
        <div className="flex flex-col gap-3">
          {canEdit && dropZone(false)}
          <div className="flex flex-col gap-2">
            {documents.map(doc => {
              const uploaded = doc.created_at
                ? new Date(doc.created_at).toLocaleDateString(
                    isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US',
                    { dateStyle: 'medium' }
                  )
                : ''
              const size = formatFileSize(doc.file_size)
              const uploaderName = doc.uploader?.full_name || ''
              const rowBusy = busyId === doc.id
              return (
                <GlassCard key={doc.id} padding="md" className="flex items-center gap-3 flex-wrap">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-navy-50 text-navy-500 shrink-0">
                    {docIcon(doc.mime_type)}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-sm font-semibold text-navy-900 break-all">{doc.file_name}</div>
                    <div className="text-[11px] text-navy-500 mt-0.5 tabular-nums">
                      {[size, uploaded, uploaderName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      iconStart={Icons.eye}
                      onClick={() => openSigned(doc.id)}
                      disabled={rowBusy}
                    >
                      {isRTL ? 'عرض' : 'View'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconStart={Icons.download}
                      onClick={() => openSigned(doc.id, { download: true })}
                      disabled={rowBusy}
                    >
                      {isRTL ? 'تنزيل' : 'Download'}
                    </Button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        aria-label={isRTL ? 'حذف' : 'Delete'}
                        className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        {Icons.trash(14)}
                      </button>
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-3">
            {isRTL ? 'حذف الوثيقة' : 'Delete Document'}
          </h3>
          <p className="text-sm text-navy-600 m-0 mb-5">
            {isRTL
              ? 'سيتم حذف الملف نهائياً. لا يمكن التراجع.'
              : 'This will permanently delete the file. This cannot be undone.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)}>{isRTL ? 'حذف' : 'Delete'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// NOTES TAB
// ═══════════════════════════════════════════════════════════════════════════
// Per-patient clinical notes. Doctor-scoped writes (uses the file-level
// EDIT_ROLES = owner/doctor — narrower than Documents).

// Inline pin glyph (shared.jsx has no pin/star icon). Filled when pinned.
function pinIcon(filled, s = 14) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14l-1.6-2.7a2 2 0 0 1-.4-1.2V7a2 2 0 0 1 2-2V3H6v2a2 2 0 0 1 2 2v6.1a2 2 0 0 1-.4 1.2L6 17z" />
    </svg>
  )
}

export function NotesTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const role = useMyRole()
  const canEdit = role && EDIT_ROLES.has(role)

  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [pinBusyId, setPinBusyId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchNotesForPatient(patient.id)
      setNotes(rows)
    } catch (err) {
      console.error('[NotesTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل الملاحظات' : 'Failed to load notes', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  const openNew = () => { setEditingId(null); setShowForm(true) }
  const openEdit = (note) => { setEditingId(note.id); setShowForm(true) }
  const editingNote = editingId ? notes.find(n => n.id === editingId) : null

  const togglePin = async (note) => {
    setPinBusyId(note.id)
    try {
      await updateNote(note.id, { pinned: !note.pinned })
      await reload()
    } catch (err) {
      console.error('[NotesTab] pin toggle failed:', err)
      toast?.(isRTL ? 'فشل التثبيت' : 'Failed to update pin', 'error')
    } finally {
      setPinBusyId(null)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      toast?.(isRTL ? 'تم حذف الملاحظة' : 'Note deleted', 'success')
    } catch (err) {
      console.error('[NotesTab] delete failed:', err)
      toast?.(isRTL ? 'فشل الحذف' : 'Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="ds-root flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-navy-900 m-0">
          {isRTL ? 'الملاحظات' : 'Notes'}
        </h3>
        {canEdit && (
          <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={openNew}>
            {isRTL ? 'ملاحظة جديدة' : 'New Note'}
          </Button>
        )}
      </div>

      {loading ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </GlassCard>
      ) : notes.length === 0 ? (
        <GlassCard padding="lg" className="text-center text-sm text-navy-500">
          {isRTL ? 'لا توجد ملاحظات' : 'No notes yet'}
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map(note => {
            const created = note.created_at
              ? new Date(note.created_at).toLocaleDateString(
                  isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US',
                  { dateStyle: 'medium' }
                )
              : ''
            return (
              <GlassCard key={note.id} padding="lg" className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.title && (
                        <span className="text-sm font-semibold text-navy-900">{note.title}</span>
                      )}
                      {note.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent-cyan-700 bg-accent-cyan-50 rounded px-1.5 py-0.5">
                          {pinIcon(true, 10)}
                          {isRTL ? 'مثبتة' : 'Pinned'}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePin(note)}
                        disabled={pinBusyId === note.id}
                        aria-label={note.pinned ? (isRTL ? 'إلغاء التثبيت' : 'Unpin') : (isRTL ? 'تثبيت' : 'Pin')}
                        title={note.pinned ? (isRTL ? 'إلغاء التثبيت' : 'Unpin') : (isRTL ? 'تثبيت' : 'Pin')}
                        className={[
                          'grid place-items-center w-7 h-7 rounded-md transition-colors',
                          note.pinned
                            ? 'text-accent-cyan-700 hover:bg-accent-cyan-50'
                            : 'text-navy-500 hover:text-accent-cyan-700 hover:bg-accent-cyan-50/60',
                        ].join(' ')}
                      >
                        {pinIcon(note.pinned)}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(note)}
                        aria-label={isRTL ? 'تعديل' : 'Edit'}
                        className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-accent-cyan-700 hover:bg-accent-cyan-50/60 transition-colors"
                      >
                        {Icons.edit(14)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(note.id)}
                        aria-label={isRTL ? 'حذف' : 'Delete'}
                        className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        {Icons.trash(14)}
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm text-navy-700 whitespace-pre-wrap break-words">{note.body}</div>
                <div className="text-[11px] text-navy-500 tabular-nums">
                  {created}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {showForm && (
        <NoteEntryModal
          patientId={patient.id}
          existing={editingNote}
          dir={dir}
          isRTL={isRTL}
          onCancel={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => {
            const wasEdit = Boolean(editingNote)
            setShowForm(false)
            setEditingId(null)
            reload()
            toast?.(
              wasEdit
                ? (isRTL ? 'تم تحديث الملاحظة' : 'Note updated')
                : (isRTL ? 'تم إنشاء الملاحظة' : 'Note created'),
              'success'
            )
          }}
          onError={msg => toast?.(msg, 'error')}
        />
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-3">
            {isRTL ? 'حذف الملاحظة' : 'Delete Note'}
          </h3>
          <p className="text-sm text-navy-600 m-0 mb-5">
            {isRTL
              ? 'سيتم حذف الملاحظة نهائياً. لا يمكن التراجع.'
              : 'This will permanently delete the note. This cannot be undone.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)}>{isRTL ? 'حذف' : 'Delete'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ─── Note entry modal — handles both new and edit ─────────────────────────
function NoteEntryModal({ patientId, existing, dir, isRTL, onCancel, onSaved, onError }) {
  const [title, setTitle] = useState(existing?.title || '')
  const [body, setBody] = useState(existing?.body || '')
  const [pinned, setPinned] = useState(Boolean(existing?.pinned))
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!body.trim()) {
      onError(isRTL ? 'نص الملاحظة مطلوب' : 'Note body is required')
      return
    }
    setSubmitting(true)
    try {
      if (existing) {
        await updateNote(existing.id, {
          title: title.trim() || null,
          body: body.trim(),
          pinned,
        })
      } else {
        await createNote(patientId, {
          title: title.trim() || null,
          body: body.trim(),
          pinned,
        })
      }
      onSaved()
    } catch (err) {
      console.error('[NoteEntryModal] save failed:', err)
      onError(err.message || (isRTL ? 'فشل حفظ الملاحظة' : 'Failed to save note'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={() => { if (!submitting) onCancel() }} dir={dir} width={560}>
      <div className="ds-root">
        <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
          <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
            {existing
              ? (isRTL ? 'تعديل الملاحظة' : 'Edit Note')
              : (isRTL ? 'ملاحظة جديدة' : 'New Note')}
          </h3>

          <FormField label={isRTL ? 'العنوان (اختياري)' : 'Title (optional)'} dir={dir}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              placeholder={isRTL ? 'مثال: متابعة' : 'e.g. Follow-up'}
              style={inputStyle(dir)}
            />
          </FormField>

          <FormField label={isRTL ? 'النص' : 'Note'} dir={dir}>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              maxLength={5000}
              autoFocus
              placeholder={isRTL ? 'اكتب الملاحظة هنا...' : 'Write the note here...'}
              style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }}
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm text-navy-700 mt-1 mb-2 cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            {isRTL ? 'تثبيت في الأعلى' : 'Pin to top'}
          </label>

          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" disabled={submitting} onClick={onCancel}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
              {submitting
                ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                : existing
                  ? (isRTL ? 'تحديث' : 'Update')
                  : (isRTL ? 'حفظ' : 'Save')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
