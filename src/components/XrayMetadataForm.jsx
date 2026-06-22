/**
 * XrayMetadataForm — the shared X-ray metadata fields (type / date / teeth /
 * treatment link / notes), used by both XrayUploadModal (batch metadata) and
 * XrayLightbox (edit mode). Controlled: parent owns `value`, gets the full next
 * object via `onChange`.
 *
 * value: { xray_type, date_taken, teeth: string[], treatment_plan_id, notes }
 */
import { useState, useEffect } from 'react'
import { FormField, inputStyle, selectStyle } from './shared'
import MiniToothChart from './MiniToothChart'
import { XRAY_TYPE_OPTIONS } from '../lib/xrayTypes'
import { fetchTreatmentPlansForPatient } from '../lib/dental'
import { todayLocal } from '../lib/date'

export default function XrayMetadataForm({ value, onChange, patientId, lang, dir, disabled = false }) {
  const isRTL = lang === 'ar'
  const [treatments, setTreatments] = useState([])
  const set = (k, v) => onChange({ ...value, [k]: v })

  // Optional treatment link; degrade quietly if it fails (logged, not toasted).
  useEffect(() => {
    let cancelled = false
    fetchTreatmentPlansForPatient(patientId)
      .then(rows => { if (!cancelled) setTreatments(rows || []) })
      .catch(err => { if (!cancelled) { console.error('[XrayMetadataForm] treatment plans load failed:', err); setTreatments([]) } })
    return () => { cancelled = true }
  }, [patientId])

  const treatmentLabel = (t) => {
    const d = t.created_at ? new Date(t.created_at).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    return `${d}${t.status ? ` — ${t.status}` : ''}`
  }

  return (
    <fieldset disabled={disabled} className="contents">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <FormField label={isRTL ? 'النوع' : 'Type'} dir={dir}>
          <select value={value.xray_type} onChange={e => set('xray_type', e.target.value)} style={selectStyle(dir)}>
            {XRAY_TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{isRTL ? o.ar : o.en}</option>)}
          </select>
        </FormField>
        <FormField label={isRTL ? 'التاريخ' : 'Date taken'} dir={dir}>
          <input type="date" value={value.date_taken} max={todayLocal()} onChange={e => set('date_taken', e.target.value)} style={inputStyle(dir)} />
        </FormField>
      </div>

      <FormField label={isRTL ? 'الأسنان الظاهرة' : 'Teeth shown'} dir={dir}>
        <MiniToothChart value={value.teeth} onChange={teeth => set('teeth', teeth)} lang={lang} dir={dir} />
      </FormField>

      <FormField label={isRTL ? 'ربط بخطة علاج (اختياري)' : 'Link to treatment (optional)'} dir={dir}>
        <select value={value.treatment_plan_id} onChange={e => set('treatment_plan_id', e.target.value)} style={selectStyle(dir)}>
          <option value="">{isRTL ? 'بدون' : 'None'}</option>
          {treatments.map(t => <option key={t.id} value={t.id}>{treatmentLabel(t)}</option>)}
        </select>
      </FormField>

      <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
        <textarea value={value.notes} onChange={e => set('notes', e.target.value)} rows={2} maxLength={500}
          style={{ ...inputStyle(dir), height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
      </FormField>
    </fieldset>
  )
}
