import React, { useState, useEffect } from 'react'
import { Modal, FormField, inputStyle, selectStyle, Icons } from './shared'
import { makeBtn } from '../design'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const TYPE_OPTIONS = [
  { value: 'checkup', label: 'Checkup' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'whitening', label: 'Whitening' },
  { value: 'other', label: 'Other' }
]

const DURATION_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1 hour 30 mins' }
]

const TIME_SLOTS = []
for (let h = 8; h <= 20; h++) {
  const hr = h.toString().padStart(2, '0')
  TIME_SLOTS.push(`${hr}:00`)
  if (h !== 20) TIME_SLOTS.push(`${hr}:30`)
}

// Local YYYY-MM-DD. Avoids toISOString() which returns UTC and drifts
// to the previous day in UTC+3 (Iraq) between local midnight and 03:00.
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddAppointmentModal({ onClose, onSave, contacts, initialDate, editAppointment }) {
  const [form, setForm] = useState({
    contact_id: editAppointment?.contact_id || '',
    doctor_id: editAppointment?.doctor_id || '',
    title: editAppointment?.title || '',
    appointment_date: editAppointment?.appointment_date || initialDate || todayLocal(),
    appointment_time: editAppointment?.appointment_time?.slice(0,5) || '10:00',
    duration_minutes: editAppointment?.duration_minutes || 30,
    type: editAppointment?.type || 'checkup',
    notes: editAppointment?.notes || '',
    status: editAppointment?.status || 'pending'
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [orgId, setOrgId] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [newPatientForm, setNewPatientForm] = useState({ name: '', phone: '', dob: '' })
  const [doctors, setDoctors] = useState([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('org_id').eq('id', user.id).single().then(async ({ data }) => {
        if (!data?.org_id) return
        setOrgId(data.org_id)
        // Doctors are profiles with role='doctor'. The legacy doctors
        // table was unified into profiles (Commit 2 — demo-readiness).
        const { data: docs } = await supabase.from('profiles')
          .select('id, full_name, color, specialization')
          .eq('org_id', data.org_id)
          .eq('role', 'doctor')
        setDoctors(docs || [])
      })
    })
  }, [])

  useEffect(() => {
    if (searchQuery.length >= 2 && !form.contact_id && orgId) {
      const doSearch = async () => {
        const { data, error } = await supabase.from('contacts').select('id, name, phone').eq('org_id', orgId).or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`).limit(10)
        if (!error && data) setSearchResults(data)
      }
      doSearch()
    } else {
      setSearchResults([])
    }
  }, [searchQuery, form.contact_id, orgId])

  useEffect(() => {
    if (form.contact_id && !searchQuery) {
      const initialContact = contacts.find(c => c.id === form.contact_id)
      if (initialContact) setSearchQuery(initialContact.name)
    }
  }, [form.contact_id, contacts])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (editAppointment) return
    const contact = contacts.find(c => c.id === form.contact_id) || searchResults.find(c => c.id === form.contact_id)
    const typeLabel = TYPE_OPTIONS.find(t => t.value === form.type)?.label || 'Appointment'
    let newTitle = typeLabel
    if (contact || form.contact_id) {
      newTitle = `${searchQuery || (contact && contact.name)} - ${typeLabel}`
    }
    set('title', newTitle)
  }, [form.contact_id, form.type, contacts, searchResults, searchQuery])

  const handleAddNewPatient = async () => {
    setLoading(true); setError(null); setSuccess(null)
    try {
      if (!newPatientForm.name) throw new Error('Patient name is required')
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) throw new Error('Not authenticated')
      const payload = { org_id: orgId, user_id: userData.user.id, name: newPatientForm.name, phone: newPatientForm.phone, notes: newPatientForm.dob ? `Date of Birth: ${newPatientForm.dob}` : '' }
      const { data, error: err } = await supabase.from('contacts').insert(payload).select().single()
      if (err) throw err
      set('contact_id', data.id)
      setSearchQuery(data.name)
      setShowDropdown(false)
      setShowNewPatient(false)
      setSuccess('Patient added successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch(err) {
      setError(err.message || 'Failed to add patient')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.contact_id || !form.appointment_date || !form.appointment_time || !form.title) {
      setError('Please fill in all required fields.'); return
    }
    setLoading(true); setError(null)
    try {
      if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.')
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) throw new Error('Not authenticated')
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', userData.user.id).single()
      const orgIdVal = profile?.org_id
      if (!orgIdVal) throw new Error('Organization not found')
      const payload = {
        org_id: orgIdVal, contact_id: form.contact_id,
        doctor_id: form.doctor_id || null,
        title: form.title, appointment_date: form.appointment_date,
        appointment_time: form.appointment_time,
        duration_minutes: Number(form.duration_minutes),
        type: form.type, status: form.status, notes: form.notes,
        created_by: userData.user.id
      }
      let result
      if (editAppointment?.id) {
        result = await supabase.from('appointments').update(payload).eq('id', editAppointment.id).select().single()
      } else {
        result = await supabase.from('appointments').insert(payload).select().single()
      }
      if (result.error) throw result.error
      onSave(result.data)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error saving appointment')
    } finally {
      setLoading(false)
    }
  }

  const selectedDoctor = doctors.find(d => d.id === form.doctor_id)

  return (
    <Modal onClose={onClose} width={520} dir="ltr">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {editAppointment ? 'Edit Appointment' : 'New Appointment'}
        </h2>
        <button type="button" onClick={onClose} style={{ width:32, height:32, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems:'center', justifyContent:'center', borderRadius:'var(--radius-sm)', transition:'var(--transition)' }}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)'}}>
          {Icons.x(16)}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: 'rgba(255,71,87,0.12)', color: '#FF6B6B', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, border: '1px solid rgba(255,71,87,0.25)' }}>{error}</div>}
      {success && <div style={{ padding: '10px 14px', background: 'rgba(0,255,178,0.1)', color: 'var(--accent-green)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, border: '1px solid rgba(0,255,178,0.25)' }}>{Icons.check(14)} {success}</div>}

      <FormField label="Patient">
        {form.contact_id ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...inputStyle('ltr') }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{searchQuery || contacts.find(c => c.id === form.contact_id)?.name || 'Patient'}</span>
            <button type="button" onClick={() => { set('contact_id', ''); setSearchQuery('') }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
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
                {searchResults.length > 0 ? searchResults.map(c => (
                  <div key={c.id} onClick={() => { set('contact_id', c.id); setSearchQuery(c.name); setShowDropdown(false) }}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', cursor: 'pointer', transition: 'var(--transition)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.phone}</div>}
                  </div>
                )) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>No patients found</div>
                    <button type="button" onClick={() => { setShowNewPatient(true); setNewPatientForm(p => ({ ...p, name: searchQuery })) }}
                      style={{ width:'100%', padding:'8px 14px', border:'1px solid var(--accent-primary)', background:'transparent', color:'var(--accent-primary)', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'var(--transition)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(0,255,178,0.08)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
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
                  <input value={newPatientForm.name} onChange={e => setNewPatientForm(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" style={inputStyle('ltr')} />
                  <input value={newPatientForm.phone} onChange={e => setNewPatientForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone Number" style={inputStyle('ltr')} />
                  <input type="date" value={newPatientForm.dob} onChange={e => setNewPatientForm(p => ({ ...p, dob: e.target.value }))} placeholder="Date of Birth" style={inputStyle('ltr')} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" onClick={() => setShowNewPatient(false)} style={{ padding:'8px 16px', border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Cancel</button>
                    <button type="button" onClick={handleAddNewPatient} disabled={loading} style={{ padding:'8px 16px', background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', border:'none', color:'#fff', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>{loading ? 'Saving...' : 'Add & Select'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </FormField>

      {/* Assign Doctor */}
      <FormField label="Assign Doctor">
        <div style={{ position: 'relative' }}>
          {doctors.length === 0 ? (
            <div style={{ ...inputStyle('ltr'), color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>No doctors found — add doctors in Settings → Team</span>
            </div>
          ) : (
            <select value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)} style={selectStyle('ltr')}>
              <option value="">-- Unassigned --</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.full_name || 'Dr. Unknown'}{d.specialization ? ` (${d.specialization})` : ''}
                </option>
              ))}
            </select>
          )}
          {selectedDoctor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: selectedDoctor.color || '#4DA6FF', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedDoctor.specialization || 'General'}</span>
            </div>
          )}
        </div>
      </FormField>

      <FormField label="Title">
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Appointment title" style={inputStyle('ltr')} />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="Type">
          <select value={form.type} onChange={e => set('type', e.target.value)} style={selectStyle('ltr')}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Duration">
          <select value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} style={selectStyle('ltr')}>
            {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="Date">
          <input type="date" value={form.appointment_date} onChange={e => set('appointment_date', e.target.value)} style={inputStyle('ltr')} />
        </FormField>
        <FormField label="Time">
          <select value={form.appointment_time} onChange={e => set('appointment_time', e.target.value)} style={selectStyle('ltr')}>
            <option value="">Select time...</option>
            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding:'10px 20px', border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:14, fontFamily:'inherit', transition:'var(--transition)' }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-hover)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={loading} style={{ flex:1, padding:'12px 20px', background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', border:'none', color:'#fff', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit', transition:'var(--transition)' }}
          onMouseEnter={e=>{e.currentTarget.style.opacity='0.88';e.currentTarget.style.transform='translateY(-1px)'}}
          onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.transform='translateY(0)'}}>
          {loading ? 'Saving...' : 'Save Appointment'}
        </button>
      </div>
    </Modal>
  )
}
