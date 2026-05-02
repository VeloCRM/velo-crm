import React, { useState, useEffect } from 'react'
import { Modal, FormField, inputStyle, selectStyle, Icons } from './shared'
import { Button } from './ui'
import { isSupabaseConfigured } from '../lib/supabase'
import { todayLocal } from '../lib/date'
import { getCurrentUser, getCurrentOrgId } from '../lib/auth_session'
import { listDoctorsInOrg } from '../lib/profiles'
import { searchPatientsForAppointment, upsertAppointment } from '../lib/appointments'
import { insertPatient } from '../lib/database'

// Schema enums (src/lib/schema.sql).
const TYPE_OPTIONS = [
  { value: 'checkup',      label: 'Checkup' },
  { value: 'cleaning',     label: 'Cleaning' },
  { value: 'filling',      label: 'Filling' },
  { value: 'extraction',   label: 'Extraction' },
  { value: 'root_canal',   label: 'Root Canal' },
  { value: 'crown',        label: 'Crown' },
  { value: 'whitening',    label: 'Whitening' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'emergency',    label: 'Emergency' },
]

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: 'Scheduled' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'no_show',     label: 'No-show' },
  { value: 'cancelled',   label: 'Cancelled' },
]

const DURATION_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1 hour 30 mins' },
]

const TIME_SLOTS = []
for (let h = 8; h <= 20; h++) {
  const hr = h.toString().padStart(2, '0')
  TIME_SLOTS.push(`${hr}:00`)
  if (h !== 20) TIME_SLOTS.push(`${hr}:30`)
}

// Combine separate date (YYYY-MM-DD) and time (HH:mm) inputs into an ISO
// timestamp in the user's local timezone, then send as ISO (with offset).
// Postgres stores it as timestamptz so the conversion is handled there.
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  // Construct via Date(year, month, day, hour, minute) so the result is a
  // local-time wall clock, then .toISOString() converts to UTC.
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return null
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()
}

// Inverse: split an ISO scheduled_at into local YYYY-MM-DD + HH:mm.
function splitScheduledAt(iso) {
  if (!iso) return { date: todayLocal(), time: '10:00' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: todayLocal(), time: '10:00' }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export default function AddAppointmentModal({ onClose, onSave, patients, initialDate, editAppointment }) {
  const initialSplit = splitScheduledAt(editAppointment?.scheduled_at)
  const [form, setForm] = useState({
    patient_id: editAppointment?.patient_id || '',
    doctor_id: editAppointment?.doctor_id || '',
    date: editAppointment?.scheduled_at ? initialSplit.date : (initialDate || todayLocal()),
    time: editAppointment?.scheduled_at ? initialSplit.time : '10:00',
    duration_minutes: editAppointment?.duration_minutes || 30,
    type: editAppointment?.type || 'checkup',
    status: editAppointment?.status || 'scheduled',
    chair_id: editAppointment?.chair_id || '',
    notes: editAppointment?.notes || '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [orgId, setOrgId] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [newPatientForm, setNewPatientForm] = useState({ full_name: '', phone: '', dob: '', email: '' })
  const [doctors, setDoctors] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await getCurrentUser()
      if (!user || cancelled) return
      try {
        const oid = await getCurrentOrgId()
        if (cancelled) return
        setOrgId(oid)
        const docs = await listDoctorsInOrg()
        if (!cancelled) setDoctors(docs)
      } catch {
        // Empty state is fine — page renders without doctor options.
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Patient search by full_name / phone
  useEffect(() => {
    if (searchQuery.length >= 2 && !form.patient_id && orgId) {
      let cancelled = false
      ;(async () => {
        try {
          const rows = await searchPatientsForAppointment(searchQuery)
          if (!cancelled) setSearchResults(rows)
        } catch {
          if (!cancelled) setSearchResults([])
        }
      })()
      return () => { cancelled = true }
    } else {
      setSearchResults([])
    }
  }, [searchQuery, form.patient_id, orgId])

  // Pre-fill the search field if we already know the patient id
  useEffect(() => {
    if (form.patient_id && !searchQuery) {
      const p = patients?.find(x => x.id === form.patient_id)
      if (p) setSearchQuery(p.full_name || p.fullName || '')
    }
  }, [form.patient_id, patients])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleAddNewPatient = async () => {
    setLoading(true); setError(null); setSuccess(null)
    try {
      if (!newPatientForm.full_name) throw new Error('Patient name is required')
      if (!newPatientForm.phone) throw new Error('Patient phone is required')
      if (!orgId) throw new Error('Organization context not loaded')
      const created = await insertPatient({
        full_name: newPatientForm.full_name,
        phone: newPatientForm.phone,
        email: newPatientForm.email || null,
        dob: newPatientForm.dob || null,
      }, orgId)
      set('patient_id', created.id)
      setSearchQuery(created.fullName || created.full_name || newPatientForm.full_name)
      setShowDropdown(false)
      setShowNewPatient(false)
      setSuccess('Patient added successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to add patient')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.patient_id || !form.date || !form.time) {
      setError('Patient, date, and time are required.'); return
    }
    setLoading(true); setError(null)
    try {
      if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.')
      const scheduled_at = combineDateTime(form.date, form.time)
      if (!scheduled_at) throw new Error('Invalid date or time')

      const payload = {
        patient_id: form.patient_id,
        doctor_id: form.doctor_id || null,
        type: form.type,
        status: form.status,
        scheduled_at,
        duration_minutes: Number(form.duration_minutes),
        chair_id: form.chair_id || null,
        notes: form.notes || null,
      }
      const saved = await upsertAppointment(
        editAppointment?.id ? { id: editAppointment.id, ...payload } : payload
      )
      onSave(saved)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error saving appointment')
    } finally {
      setLoading(false)
    }
  }

  const selectedPatient = patients?.find(p => p.id === form.patient_id) || null

  return (
    <Modal onClose={onClose} width={520} dir="ltr">
      <div className="ds-root">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 className="text-xl font-semibold text-navy-900 m-0">
          {editAppointment ? 'Edit Appointment' : 'New Appointment'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid place-items-center w-8 h-8 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
        >
          {Icons.x(16)}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: 'rgba(255,71,87,0.12)', color: '#FF6B6B', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, border: '1px solid rgba(255,71,87,0.25)' }}>{error}</div>}
      {success && <div style={{ padding: '10px 14px', background: 'rgba(0,255,178,0.1)', color: 'var(--accent-green)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, border: '1px solid rgba(0,255,178,0.25)' }}>{Icons.check(14)} {success}</div>}

      <FormField label="Patient">
        {form.patient_id ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...inputStyle('ltr') }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {searchQuery || selectedPatient?.full_name || selectedPatient?.fullName || 'Patient'}
            </span>
            <button type="button" onClick={() => { set('patient_id', ''); setSearchQuery('') }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
              {Icons.x(16)}
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); setShowNewPatient(false) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search patient by name or phone..."
              style={inputStyle('ltr')}
            />
            {showDropdown && searchQuery.length >= 2 && !showNewPatient && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-hover)', borderRadius: 'var(--radius-sm)', marginTop: 4, zIndex: 10, maxHeight: 250, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {searchResults.length > 0 ? searchResults.map(p => (
                  <div key={p.id} onClick={() => { set('patient_id', p.id); setSearchQuery(p.full_name); setShowDropdown(false) }}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', cursor: 'pointer' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name}</div>
                    {p.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.phone}</div>}
                  </div>
                )) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>No patients found</div>
                    <button type="button" onClick={() => { setShowNewPatient(true); setNewPatientForm(p => ({ ...p, full_name: searchQuery })) }}
                      style={{ width: '100%', padding: '8px 14px', border: '1px solid var(--accent-primary)', background: 'transparent', color: 'var(--accent-primary)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {Icons.plus(14)} Add as new patient
                    </button>
                  </div>
                )}
              </div>
            )}
            {showNewPatient && (
              <div style={{ marginTop: 12, padding: 16, border: '1px solid var(--border-hover)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Add New Patient</h4>
                <div style={{ display: 'grid', gap: 12 }}>
                  <input value={newPatientForm.full_name} onChange={e => setNewPatientForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Full Name" style={inputStyle('ltr')} />
                  <input value={newPatientForm.phone} onChange={e => setNewPatientForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone Number" style={inputStyle('ltr')} />
                  <input value={newPatientForm.email} onChange={e => setNewPatientForm(p => ({ ...p, email: e.target.value }))} placeholder="Email (optional)" type="email" style={inputStyle('ltr')} />
                  <input type="date" value={newPatientForm.dob} onChange={e => setNewPatientForm(p => ({ ...p, dob: e.target.value }))} placeholder="Date of Birth" style={inputStyle('ltr')} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" onClick={() => setShowNewPatient(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
                    <button type="button" onClick={handleAddNewPatient} disabled={loading} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', border: 'none', color: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                      {loading ? 'Saving...' : 'Add & Select'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </FormField>

      <FormField label="Assign Doctor">
        {doctors.length === 0 ? (
          <div style={{ ...inputStyle('ltr'), color: 'var(--text-muted)', fontSize: 13 }}>
            No doctors found — add doctors in Settings → Team
          </div>
        ) : (
          <select value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)} style={selectStyle('ltr')}>
            <option value="">— Unassigned —</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>{d.full_name || 'Dr.'}</option>
            ))}
          </select>
        )}
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="Type">
          <select value={form.type} onChange={e => set('type', e.target.value)} style={selectStyle('ltr')}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Duration">
          <select value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} style={selectStyle('ltr')}>
            {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="Date">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle('ltr')} />
        </FormField>
        <FormField label="Time">
          <select value={form.time} onChange={e => set('time', e.target.value)} style={selectStyle('ltr')}>
            <option value="">Select time...</option>
            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="Chair">
          <input value={form.chair_id} onChange={e => set('chair_id', e.target.value)} placeholder="e.g. chair-1" style={inputStyle('ltr')} />
        </FormField>
        {editAppointment && (
          <FormField label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} style={selectStyle('ltr')}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
        )}
      </div>

      <FormField label="Notes">
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any special instructions or notes..."
          style={{ ...inputStyle('ltr'), resize: 'vertical', minHeight: 80 }}
          rows={3}
        />
      </FormField>

      <div className="flex gap-2 justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="flex-1" onClick={handleSave} loading={loading} disabled={loading}>
          {loading ? 'Saving...' : 'Save Appointment'}
        </Button>
      </div>
      </div>
    </Modal>
  )
}
