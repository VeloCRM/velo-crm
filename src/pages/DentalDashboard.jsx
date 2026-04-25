import React, { useState, useEffect } from 'react'
import AddAppointmentModal from '../components/AddAppointmentModal'
import {
  SAMPLE_DENTAL_DOCTORS,
  SAMPLE_DENTAL_PATIENTS,
  SAMPLE_DENTAL_APPOINTMENTS_TODAY,
  SAMPLE_DENTAL_PAYMENTS,
  SAMPLE_DENTAL_STATS,
} from '../sampleData'

const Ico = (s, children) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
const Icons = {
  users: (s = 20) => Ico(s, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  calendar: (s = 20) => Ico(s, <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  dollar: (s = 20) => Ico(s, <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>),
  file: (s = 20) => Ico(s, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  check: (s = 16) => Ico(s, <polyline points="20 6 9 17 4 12" />),
  x: (s = 16) => Ico(s, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  plus: (s = 16) => Ico(s, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  message: (s = 16) => Ico(s, <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
}

const CARD = {
  background: '#101422',
  border: '1px solid rgba(255,255,255,0.065)',
  borderRadius: 14,
  padding: '24px',
  boxShadow: 'none',
  transition: 'all 0.18s ease',
}

const TYPE_COLORS = {
  checkup: '#4DA6FF',
  cleaning: '#00FFB2',
  filling: '#FFB347',
  extraction: '#FF6B6B',
  root_canal: '#A78BFA',
  whitening: '#A78BFA',
  other: '#7B7F9E',
}
const STATUS_STYLE = {
  pending: { bg: 'rgba(255,255,255,0.05)', color: '#7B7F9E' },
  confirmed: { bg: 'rgba(77,166,255,0.12)', color: '#4DA6FF' },
  completed: { bg: 'rgba(0,255,178,0.1)', color: '#00FFB2' },
  cancelled: { bg: 'rgba(255,107,107,0.1)', color: '#FF6B6B' },
}

export default function DentalDashboard({ t, lang, isRTL, dir, contacts, setPage }) {
  const [dbData, setDbData] = useState({
    appointmentsCount: 0, appointmentsList: [],
    recentPatients: [], patientsThisMonth: 0, totalPatients: 0,
    pendingPaymentsList: [], pendingSum: 0,
    activePlans: 0, loading: true
  })
  const [doctors, setDoctors] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        const { supabase, isSupabaseConfigured } = await import('../lib/supabase.js')
        if (!isSupabaseConfigured()) {
          if (mounted) {
            const today = new Date().toISOString().slice(0, 10)
            const apts = SAMPLE_DENTAL_APPOINTMENTS_TODAY.map(a => ({ ...a, appointment_date: today }))
            setDbData({
              appointmentsList: apts,
              appointmentsCount: apts.length,
              recentPatients: SAMPLE_DENTAL_PATIENTS.slice(0, 5),
              patientsThisMonth: SAMPLE_DENTAL_STATS.patientsThisMonth,
              totalPatients: SAMPLE_DENTAL_STATS.totalPatients,
              pendingPaymentsList: SAMPLE_DENTAL_PAYMENTS,
              pendingSum: SAMPLE_DENTAL_PAYMENTS.reduce((s, p) => s + Number(p.amount || 0), 0),
              activePlans: SAMPLE_DENTAL_STATS.activePlans,
              loading: false,
            })
          }
          return
        }
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return
        let orgId = null
        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', userData.user.id).single()
        if (profile?.org_id) orgId = profile.org_id
        const nd = { appointmentsCount: 0, appointmentsList: [], recentPatients: [], patientsThisMonth: 0, totalPatients: 0, pendingPaymentsList: [], pendingSum: 0, activePlans: 0, loading: false }
        const todayStr = new Date().toISOString().slice(0, 10)
        const now = new Date()
        const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [a, b, c, d, e, f] = await Promise.allSettled([
          supabase.from('appointments').select('*').eq('appointment_date', todayStr).order('appointment_time', { ascending: true }),
          orgId
            ? supabase.from('contacts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(5)
            : supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(5),
          orgId
            ? supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', firstDayStr)
            : Promise.resolve({ count: 0, error: null }),
          supabase.from('payments').select('amount,status,contact_id,id').in('status', ['pending', 'overdue']),
          supabase.from('deals').select('*', { count: 'exact', head: true }).not('stage', 'in', '("won","lost")'),
          // Total patients (no date filter) — headline number for the clinic
          orgId
            ? supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
            : supabase.from('contacts').select('*', { count: 'exact', head: true })
        ])
        if (a.status === 'fulfilled' && !a.value.error && a.value.data) { nd.appointmentsList = a.value.data; nd.appointmentsCount = a.value.data.length }
        if (b.status === 'fulfilled' && !b.value.error && b.value.data) nd.recentPatients = b.value.data
        if (c.status === 'fulfilled' && !c.value?.error && c.value?.count != null) nd.patientsThisMonth = c.value.count
        if (d.status === 'fulfilled' && !d.value.error && d.value.data) { nd.pendingPaymentsList = d.value.data; nd.pendingSum = d.value.data.reduce((s, p) => s + Number(p.amount || 0), 0) }
        if (e.status === 'fulfilled' && !e.value.error && e.value.count !== null) nd.activePlans = e.value.count
        if (f.status === 'fulfilled' && !f.value.error && f.value.count != null) nd.totalPatients = f.value.count
        if (mounted) setDbData(nd)
      } catch { if (mounted) setDbData(p => ({ ...p, loading: false })) }
    }
    fetchData()
    return () => { mounted = false }
  }, [refreshTrigger, contacts])

  // Fetch doctors
  useEffect(() => {
    let mounted = true
    const fetchDoctors = async () => {
      try {
        const { supabase, isSupabaseConfigured } = await import('../lib/supabase.js')
        if (!isSupabaseConfigured()) { if (mounted) setDoctors(SAMPLE_DENTAL_DOCTORS); return }
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return
        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', userData.user.id).single()
        if (!profile?.org_id) return
        const { data: docs } = await supabase.from('profiles').select('id, full_name, color, specialization, role').eq('org_id', profile.org_id).eq('role', 'doctor')
        if (mounted && docs) setDoctors(docs)
      } catch { }
    }
    fetchDoctors()
    return () => { mounted = false }
  }, [refreshTrigger])

  const handleAction = async (id, status) => {
    setDbData(prev => ({ ...prev, appointmentsList: prev.appointmentsList.map(a => a.id === id ? { ...a, status } : a) }))
    try {
      const { supabase, isSupabaseConfigured } = await import('../lib/supabase.js')
      if (isSupabaseConfigured()) await supabase.from('appointments').update({ status }).eq('id', id)
    } catch { }
  }

  const fmt$ = n => Number(n || 0).toLocaleString() + ' IQD'

  const STAT_CONFIGS = [
    { label: 'TOTAL PATIENTS', value: dbData.totalPatients.toLocaleString(), color: '#E8EAF5', gradient: 'linear-gradient(90deg, #E8EAF5, #A78BFA)', cls: 'animate-slide-up stagger-1' },
    { label: "TODAY'S APPOINTMENTS", value: dbData.appointmentsCount, color: '#4DA6FF', gradient: 'linear-gradient(90deg, #4DA6FF, #00FFB2)', cls: 'animate-slide-up stagger-2' },
    { label: 'PATIENTS THIS MONTH', value: dbData.patientsThisMonth, color: '#00FFB2', gradient: 'linear-gradient(90deg, #00FFB2, #4DA6FF)', cls: 'animate-slide-up stagger-3' },
    { label: 'PENDING PAYMENTS', value: fmt$(dbData.pendingSum), color: '#FFB347', gradient: 'linear-gradient(90deg, #FFB347, #FF6B6B)', cls: 'animate-slide-up stagger-4' },
    { label: 'TREATMENT PLANS', value: dbData.activePlans, color: '#A78BFA', gradient: 'linear-gradient(90deg, #A78BFA, #4DA6FF)', cls: 'animate-slide-up stagger-5' },
  ]

  const avatarColors = ['#4DA6FF', '#00FFB2', '#FFB347', '#A78BFA', '#FF6B6B', '#A78BFA']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, direction: dir, background: '#07080E', minHeight: '100%', padding: 24, boxSizing: 'border-box' }}>

      {/* ── Header ─────────��─────────────────────────────────────── */}
      <div className="animate-fade">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#E8EAF5', margin: 0, fontFamily: "'Syne', sans-serif", letterSpacing: '-0.03em' }}>Dental Dashboard</h1>
        <p style={{ fontSize: 14, color: '#7B7F9E', marginTop: 6, marginBottom: 0 }}>
          {new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {STAT_CONFIGS.map((s, i) => (
          <div key={i} className={s.cls} style={{
            ...CARD,
            position: 'relative',
            overflow: 'hidden',
            borderTop: `2px solid ${s.color}`,
            borderColor: 'rgba(255,255,255,0.07)',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
              e.currentTarget.style.borderTopColor = s.color
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.borderTopColor = s.color
            }}>
            {/* Top accent gradient line (layered over the 2px border-top) */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.gradient }} />
            {/* Radial glow in top-right corner — 100px per spec, ~12% alpha */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${s.color}1f 0%, transparent 70%)`, pointerEvents: 'none' }} />
            {/* Accent icon chip top-right — inside the card, under the glow */}
            <div style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 7, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, opacity: 0.9, boxShadow: `0 0 8px ${s.color}80` }} />
            </div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7B7F9E', fontWeight: 600, marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>{s.label}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Today's Doctors ──────────────────────────────────────── */}
      {doctors.length > 0 && (
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#E8EAF5', margin: 0, fontFamily: "'Syne', sans-serif" }}>Today's Doctors</h2>
            <span onClick={() => setPage('appointments')} style={{ fontSize: 12, color: '#00FFB2', cursor: 'pointer', fontWeight: 600 }}>Manage →</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {doctors.map(doc => {
              const docApts = dbData.appointmentsList.filter(a => a.doctor_id === doc.id)
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: '#0C0E1A', border: `1px solid ${doc.color || '#00FFB2'}22`, flex: 1, minWidth: 160 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${doc.color || '#00FFB2'}12`, border: `2px solid ${doc.color || '#00FFB2'}40`, color: doc.color || '#00FFB2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {(doc.full_name || 'D').charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E8EAF5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.full_name || 'Dr. Unknown'}</div>
                    {doc.specialization && <div style={{ fontSize: 11, color: doc.color || '#7B7F9E', fontWeight: 500, marginTop: 2 }}>{doc.specialization}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: doc.color || '#00FFB2', fontFamily: "'Syne',sans-serif" }}>{docApts.length}</div>
                    <div style={{ fontSize: 10, color: '#3A3D55' }}>today</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ��─ Quick actions ────��───────────────────────────────────��── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          // "contacts/new" is recognised by ContactsPage as an open-the-form intent.
          { icon: Icons.plus, label: 'New Patient', onClick: () => setPage('contacts/new'), accent: '#4DA6FF' },
          { icon: Icons.calendar, label: 'New Appointment', onClick: () => setShowModal(true), accent: '#00FFB2' },
          // Treatment plans live inside each patient profile (DentalTabs
          // TreatmentPlanTab). Route to the patient list so the user can
          // pick the patient whose plan they're creating.
          { icon: Icons.file, label: 'Treatment Plan', onClick: () => setPage('contacts'), accent: '#A78BFA' },
          { icon: Icons.dollar, label: 'Record Payment', onClick: () => setPage('finance'), accent: '#FFB347' },
        ].map((btn, i) => (
          <button key={i} onClick={btn.onClick} style={{
            flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 16, backgroundColor: '#101422', border: '1px solid rgba(255,255,255,0.065)',
            borderRadius: 14, color: '#7B7F9E', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", transition: 'all 0.18s ease',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = `${btn.accent}10`
              e.currentTarget.style.borderColor = `${btn.accent}40`
              e.currentTarget.style.color = btn.accent
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#101422'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.065)'
              e.currentTarget.style.color = '#7B7F9E'
              e.currentTarget.style.transform = 'translateY(0)'
            }}>
            {btn.icon(20)}{btn.label}
          </button>
        ))}
      </div>

      {/* ── Two-column layout ──────────────���──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', gap: 24 }}>

        {/* Today's Timeline */}
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E8EAF5', margin: 0, fontFamily: "'Syne', sans-serif" }}>Today's Timeline</h2>
            <button className="velo-btn-primary" onClick={() => setShowModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              background: '#00FFB2', border: 'none', borderRadius: 8, color: '#07080E', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.18s ease', fontFamily: "'DM Sans', sans-serif",
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}>
              {Icons.plus(14)} Add
            </button>
          </div>

          {dbData.appointmentsList.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ color: '#3A3D55', opacity: 0.6 }}>{Icons.calendar(40)}</div>
              <div style={{ fontSize: 14, color: '#3A3D55' }}>No appointments today</div>
              <button onClick={() => setShowModal(true)} style={{
                padding: '8px 20px', background: 'rgba(0,255,178,0.09)', border: '1px solid rgba(0,255,178,0.25)',
                borderRadius: 8, color: '#00FFB2', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.18s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,178,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,178,0.09)' }}>
                + Add Appointment
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {dbData.appointmentsList.length > 1 && (
                <div style={{ position: 'absolute', left: 52, top: 24, bottom: 24, width: 2, background: 'rgba(255,255,255,0.07)' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {dbData.appointmentsList.map((apt, i) => {
                  const contact = contacts.find(c => c.id === apt.contact_id)
                  const tColor = TYPE_COLORS[apt.type] || '#7B7F9E'
                  const ss = STATUS_STYLE[apt.status] || STATUS_STYLE.pending
                  const doc = doctors.find(d => d.id === apt.doctor_id)
                  const docColor = doc?.color || tColor
                  // "Active" = confirmed or in-progress. Per spec: mint time,
                  // blue border-left accent, faint blue wash over the card.
                  const isActive = apt.status === 'confirmed' || apt.status === 'in_progress'
                  const timeColor = isActive ? '#00FFB2' : '#7B7F9E'
                  const cardBg = isActive ? 'rgba(77,166,255,0.05)' : '#0C0E1A'
                  const borderLeftColor = isActive ? '#4DA6FF' : docColor
                  return (
                    <div key={apt.id} className="animate-slide-up" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 48, textAlign: 'right', fontFamily: "'Syne',sans-serif", fontSize: 11.5, fontWeight: 700, color: timeColor, flexShrink: 0, letterSpacing: '-0.01em' }}>
                        {apt.appointment_time?.slice(0, 5)}
                      </div>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: docColor, border: '2px solid #07080E', flexShrink: 0, boxShadow: `0 0 6px ${docColor}`, zIndex: 1 }} />
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: cardBg, borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${borderLeftColor}`, transition: 'all 0.18s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = isActive ? 'rgba(77,166,255,0.09)' : 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = cardBg }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#E8EAF5' }}>{contact?.name || apt.patient_name || 'Unknown'}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, background: ss.bg, color: ss.color, fontSize: 11, fontWeight: 600 }}>{apt.status}</span>
                          </div>
                          {apt.type && <div style={{ fontSize: 12, color: tColor, marginTop: 4, fontWeight: 500 }}>{apt.type.replace(/_/g, ' ')}</div>}
                          {apt.notes && <div style={{ fontSize: 12, color: '#3A3D55', marginTop: 2 }}>{apt.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {apt.status === 'pending' && (
                            <>
                              <button onClick={() => handleAction(apt.id, 'confirmed')} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,255,178,0.25)', background: 'rgba(0,255,178,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00FFB2', transition: 'all 0.18s ease' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,178,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,178,0.09)'}>
                                {Icons.check(14)}
                              </button>
                              <button onClick={() => handleAction(apt.id, 'cancelled')} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,107,107,0.25)', background: 'rgba(255,107,107,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF6B6B', transition: 'all 0.18s ease' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,107,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,107,107,0.09)'}>
                                {Icons.x(14)}
                              </button>
                            </>
                          )}
                          {apt.status === 'confirmed' && (
                            <button onClick={() => handleAction(apt.id, 'completed')} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(0,255,178,0.25)', background: 'rgba(0,255,178,0.09)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#00FFB2', transition: 'all 0.18s ease', fontFamily: "'DM Sans',sans-serif" }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,178,0.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,178,0.09)'}>
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent Patients */}
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#E8EAF5', margin: 0, fontFamily: "'Syne', sans-serif" }}>Recent Patients</h2>
            <span onClick={() => setPage('contacts')} style={{ fontSize: 12, color: '#00FFB2', cursor: 'pointer', fontWeight: 600 }}>View All →</span>
          </div>
          {dbData.recentPatients.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#3A3D55', fontSize: 14 }}>No recent patients</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dbData.recentPatients.map((p, i) => (
                <div key={p.id} className="animate-slide-up" onClick={() => setPage('contacts/' + p.id)} style={{ animationDelay: `${i * 0.05}s`, opacity: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, transition: 'all 0.18s ease', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${avatarColors[i % avatarColors.length]}15`, color: avatarColors[i % avatarColors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, border: `1px solid ${avatarColors[i % avatarColors.length]}30` }}>
                    {(p.name || 'P').charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EAF5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#3A3D55', marginTop: 2 }}>{p.phone || p.email || 'No contact'}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#3A3D55', flexShrink: 0 }}>
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Payments ──────────────────────────────────────── */}
      {dbData.pendingPaymentsList.length > 0 && (
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#E8EAF5', margin: 0, fontFamily: "'Syne', sans-serif" }}>Pending Payments</h2>
            <span onClick={() => setPage('finance')} style={{ fontSize: 12, color: '#00FFB2', cursor: 'pointer', fontWeight: 600 }}>View All →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dbData.pendingPaymentsList.slice(0, 5).map((p, i) => {
              const contact = contacts.find(c => c.id === p.contact_id)
              return (
                <div key={p.id} className="animate-slide-up" style={{ animationDelay: `${i * 0.05}s`, opacity: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, transition: 'all 0.18s ease' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.status === 'overdue' ? '#FF6B6B' : '#FFB347', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EAF5' }}>{contact?.name || p.patient_name || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#3A3D55', marginTop: 2 }}>{p.status}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FFB347', fontFamily: "'Syne',sans-serif" }}>{fmt$(p.amount)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showModal && (
        <AddAppointmentModal
          contacts={contacts}
          doctors={doctors}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); setRefreshTrigger(r => r + 1) }}
          t={t} lang={lang} isRTL={isRTL} dir={dir}
        />
      )}
    </div>
  )
}
