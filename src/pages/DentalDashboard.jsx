import { useState, useEffect } from 'react'
import AddAppointmentModal from '../components/AddAppointmentModal'
import {
  SAMPLE_DENTAL_DOCTORS,
  SAMPLE_DENTAL_PATIENTS,
  SAMPLE_DENTAL_APPOINTMENTS_TODAY,
  SAMPLE_DENTAL_STATS,
} from '../sampleData'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchDentalDashboardStats } from '../lib/dental_dashboard'
import { listDoctorsInOrg } from '../lib/profiles'
import { updateAppointmentStatus } from '../lib/appointments'
import { todayLocal } from '../lib/date'

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

const CARD = 'bg-surface-raised border border-stroke-subtle rounded-lg shadow-1 p-6'

const TYPE_COLORS = {
  cleaning:    'text-clinic-sage',
  checkup:     'text-clinic-azure',
  filling:     'text-clinic-amber',
  extraction:  'text-clinic-rose',
  root_canal:  'text-clinic-violet',
  whitening:   'text-clinic-violet',
  crown:       'text-clinic-amber',
  consultation:'text-clinic-azure',
  emergency:   'text-clinic-rose',
}

// Status enum: scheduled | confirmed | in_progress | completed | no_show | cancelled
const STATUS_STYLE = {
  scheduled:   'bg-status-warning-bg text-status-warning-fg',
  confirmed:   'bg-accent-subtle text-accent-fg',
  in_progress: 'bg-accent-muted text-accent-fg',
  completed:   'bg-status-success-bg text-status-success-fg',
  no_show:     'bg-status-danger-bg/60 text-status-danger-fg',
  cancelled:   'bg-status-danger-bg text-status-danger-fg',
}

const AVATAR_ROTATION = [
  'bg-clinic-rose/15 text-clinic-rose border-clinic-rose/30',
  'bg-clinic-azure/15 text-clinic-azure border-clinic-azure/30',
  'bg-clinic-amber/15 text-clinic-amber border-clinic-amber/30',
  'bg-clinic-violet/15 text-clinic-violet border-clinic-violet/30',
  'bg-clinic-sage/15 text-clinic-sage border-clinic-sage/30',
  'bg-clinic-coral/15 text-clinic-coral border-clinic-coral/30',
]

// Deterministic palette assignment for real-schema doctors (no `color` column).
const DOCTOR_PALETTE = ['#4DA6FF', '#A78BFA', '#9D6F4F', '#F48FB1', '#81C784', '#FFB74D', '#64B5F6', '#BA68C8']
function doctorColor(doctor) {
  if (!doctor) return null
  if (doctor.color) return doctor.color
  const id = String(doctor.id || '')
  if (!id) return DOCTOR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return DOCTOR_PALETTE[hash % DOCTOR_PALETTE.length]
}

// scheduled_at (ISO) → local 'HH:MM'
function aptTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function DentalDashboard({ t, lang, isRTL, dir, patients, setPage }) {
  void t
  void isRTL
  const [dbData, setDbData] = useState({
    appointmentsCount: 0, appointmentsList: [],
    recentPatients: [], patientsThisMonth: 0, totalPatients: 0,
    loading: true,
  })
  const [doctors, setDoctors] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        if (!isSupabaseConfigured()) {
          if (!mounted) return
          // Demo mode — synthesize today's appointments with a fresh `scheduled_at`.
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const _patientById = Object.fromEntries(SAMPLE_DENTAL_PATIENTS.map(p => [p.id, p]))
          const apts = SAMPLE_DENTAL_APPOINTMENTS_TODAY.map(a => {
            const [h, m] = a.time.split(':').map(Number)
            const sd = new Date(today); sd.setHours(h, m, 0, 0)
            const p = _patientById[a.patient_id]
            return {
              id: a.id,
              patient_id: a.patient_id,
              doctor_id: a.doctor_id,
              type: a.type,
              status: a.status,
              scheduled_at: sd.toISOString(),
              duration_minutes: a.duration_minutes,
              notes: a.notes,
              patients: p ? { id: p.id, full_name: p.full_name, phone: p.phone } : null,
            }
          })
          setDbData({
            appointmentsList: apts,
            appointmentsCount: apts.length,
            recentPatients: SAMPLE_DENTAL_PATIENTS.slice(0, 5),
            patientsThisMonth: SAMPLE_DENTAL_STATS.patientsThisMonth,
            totalPatients: SAMPLE_DENTAL_STATS.totalPatients,
            loading: false,
          })
          return
        }
        const now = new Date()
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)

        const stats = await fetchDentalDashboardStats({
          dayStartIso: dayStart.toISOString(),
          dayEndIso: dayEnd.toISOString(),
          firstOfMonthIso: firstOfMonth.toISOString(),
        })
        if (!mounted) return
        setDbData({
          appointmentsList: stats.appointmentsToday,
          appointmentsCount: stats.appointmentsToday.length,
          recentPatients: stats.recentPatients,
          patientsThisMonth: stats.newPatientsThisMonth,
          totalPatients: stats.totalPatients,
          loading: false,
        })
      } catch (err) {
        console.error('[DentalDashboard] stats fetch failed:', err)
        if (mounted) setDbData(p => ({ ...p, loading: false }))
      }
    }
    fetchData()
    return () => { mounted = false }
  }, [refreshTrigger, patients])

  useEffect(() => {
    let mounted = true
    const fetchDoctors = async () => {
      try {
        if (!isSupabaseConfigured()) { if (mounted) setDoctors(SAMPLE_DENTAL_DOCTORS); return }
        const docs = await listDoctorsInOrg()
        if (mounted) setDoctors(docs)
      } catch (err) {
        console.error('[DentalDashboard] doctors fetch failed:', err)
      }
    }
    fetchDoctors()
    return () => { mounted = false }
  }, [refreshTrigger])

  const handleAction = async (id, status) => {
    setDbData(prev => ({ ...prev, appointmentsList: prev.appointmentsList.map(a => a.id === id ? { ...a, status } : a) }))
    if (!isSupabaseConfigured()) return
    try { await updateAppointmentStatus(id, status) }
    catch (err) { console.error('[DentalDashboard] status update failed:', err) }
  }

  const STAT_CONFIGS = [
    { label: 'TOTAL PATIENTS',       value: dbData.totalPatients.toLocaleString() },
    { label: "TODAY'S APPOINTMENTS", value: dbData.appointmentsCount },
    { label: 'PATIENTS THIS MONTH',  value: dbData.patientsThisMonth },
  ]

  return (
    <div dir={dir} className="flex flex-col gap-6 bg-surface-canvas min-h-full p-6 box-border font-sans text-content-primary">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="animate-fade pb-2">
        <h1 className="font-display text-h2 font-bold !text-content-primary m-0">Dental Dashboard</h1>
        <p className="text-body-sm text-content-tertiary mt-1.5 m-0">
          {new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── KPI grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {STAT_CONFIGS.map((s, i) => (
          <div key={i} className={`${CARD} animate-slide-up ${i < 4 ? `stagger-${i+1}` : ''}`}>
            <div className="text-caption uppercase text-content-tertiary mb-3">{s.label}</div>
            <div className="font-display font-bold text-content-primary text-[30px] leading-none tracking-[-0.02em] tabular-nums lining-nums">
              <span>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Today's Doctors ─────────────────────────────────────── */}
      {doctors.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-h3 !text-content-primary m-0">Today's Doctors</h2>
            <span onClick={() => setPage('appointments')} className="text-body-sm text-accent-fg hover:text-accent-solid-hover font-semibold cursor-pointer transition-colors duration-fast ease-standard">Manage →</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {doctors.map(doc => {
              const docApts = dbData.appointmentsList.filter(a => a.doctor_id === doc.id)
              const c = doctorColor(doc)
              return (
                <div key={doc.id} className="flex items-center gap-3 ps-4 pe-4 py-3 rounded-2xl bg-surface-raised border border-stroke-subtle shadow-1 flex-1 min-w-[180px]">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 text-content-on-accent" style={{ backgroundColor: c }}>
                    {(doc.full_name || 'D').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm font-semibold text-content-primary truncate">{doc.full_name || 'Dr. Unknown'}</div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="font-display font-bold text-h3 text-content-secondary tabular-nums lining-nums leading-none">{docApts.length}</div>
                    <div className="text-caption text-content-tertiary">today</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {[
          { icon: Icons.plus,     label: 'New Patient',      onClick: () => setPage('patients/new'),   variant: 'outline' },
          { icon: Icons.calendar, label: 'New Appointment',  onClick: () => setShowModal(true),        variant: 'primary' },
          { icon: Icons.file,     label: 'Treatment Plan',   onClick: () => setPage('patients'),       variant: 'outline' },
          { icon: Icons.dollar,   label: 'Record Payment',   onClick: () => setPage('finance'),        variant: 'outline' },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.onClick}
            className={
              btn.variant === 'primary'
                ? "flex-1 min-w-[130px] flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-accent hover:bg-accent-solid-hover text-content-on-accent text-body-sm font-semibold transition-colors duration-fast ease-standard cursor-pointer border-none shadow-1 hover:shadow-glow-mint"
                : "flex-1 min-w-[130px] flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-surface-raised border border-stroke-subtle text-content-secondary hover:text-content-primary hover:shadow-2 hover:border-stroke text-body-sm font-semibold transition-[color,box-shadow,border-color] duration-fast ease-standard cursor-pointer"
            }
          >
            {btn.icon(20)}
            <span>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* ── Two-column: Timeline + Recent Patients ──────────────── */}
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">

        {/* Today's Timeline */}
        <section>
          <div className="mb-6">
            <h2 className="font-display text-h3 !text-content-primary m-0">Today's Timeline</h2>
          </div>

          {dbData.appointmentsList.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <div className="text-content-tertiary opacity-60">{Icons.calendar(40)}</div>
              <div className="text-body-sm text-content-tertiary">No appointments today</div>
              <button onClick={() => setShowModal(true)} className="ps-5 pe-5 py-2 rounded-md bg-surface-raised border border-stroke text-content-primary hover:bg-surface-sunken text-body-sm font-semibold transition-colors duration-fast ease-standard cursor-pointer">
                + Add Appointment
              </button>
            </div>
          ) : (
            <div className="relative">
              {dbData.appointmentsList.length > 1 && (
                <div className="absolute start-[60px] top-3 bottom-3 w-px bg-stroke-subtle" aria-hidden="true" />
              )}
              <div className="flex flex-col gap-3">
                {dbData.appointmentsList.map((apt) => {
                  const fallbackPatient = patients?.find(p => p.id === apt.patient_id)
                  const patientName = apt.patients?.full_name || fallbackPatient?.full_name || 'Unknown'
                  const tColorClass = TYPE_COLORS[apt.type] || 'text-content-tertiary'
                  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled
                  const doc = doctors.find(d => d.id === apt.doctor_id)
                  const docColor = doctorColor(doc)
                  return (
                    <div key={apt.id} className="animate-slide-up flex items-center gap-3 relative">
                      <div className="w-12 text-end font-display font-semibold text-caption text-content-secondary flex-shrink-0 tabular-nums lining-nums">
                        {aptTimeStr(apt.scheduled_at)}
                      </div>
                      <div className="w-2 h-2 rounded-full flex-shrink-0 z-10 ring-2 ring-surface-canvas" style={{ backgroundColor: docColor || 'rgb(var(--velo-text-tertiary))' }} />
                      <div className="flex-1 min-w-0 flex items-center gap-3 ps-4 pe-3 py-3 bg-surface-raised rounded-xl border border-stroke-subtle border-s-[3px] shadow-1 transition-shadow duration-fast ease-standard hover:shadow-2" style={{ borderInlineStartColor: docColor }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm font-semibold text-content-primary">{patientName}</span>
                            <span className={`inline-flex items-center ps-2 pe-2 h-[22px] rounded-full text-caption font-semibold ${ssClass}`}>{apt.status}</span>
                          </div>
                          {apt.type && <div className={`text-body-sm ${tColorClass} mt-1 font-medium`}>{apt.type.replace(/_/g, ' ')}</div>}
                          {apt.notes && <div className="text-caption text-content-tertiary mt-0.5">{apt.notes}</div>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {apt.status === 'scheduled' && (
                            <>
                              <button onClick={() => handleAction(apt.id, 'confirmed')} className="w-8 h-8 rounded-md border border-stroke-subtle bg-transparent text-content-tertiary hover:border-status-success-border hover:text-status-success-fg hover:bg-status-success-bg cursor-pointer flex items-center justify-center transition-colors duration-fast ease-standard">
                                {Icons.check(14)}
                              </button>
                              <button onClick={() => handleAction(apt.id, 'cancelled')} className="w-8 h-8 rounded-md border border-stroke-subtle bg-transparent text-content-tertiary hover:border-status-danger-border hover:text-status-danger-fg hover:bg-status-danger-bg cursor-pointer flex items-center justify-center transition-colors duration-fast ease-standard">
                                {Icons.x(14)}
                              </button>
                            </>
                          )}
                          {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                            <button onClick={() => handleAction(apt.id, 'completed')} className="ps-3 pe-3 h-8 rounded-md border border-stroke-subtle bg-transparent text-content-tertiary hover:border-accent hover:text-accent-fg hover:bg-accent-subtle cursor-pointer text-caption font-semibold transition-colors duration-fast ease-standard">
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
        </section>

        {/* Recent Patients */}
        <section className={CARD}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-h3 !text-content-primary m-0">Recent Patients</h2>
            <span onClick={() => setPage('patients')} className="text-body-sm text-accent-fg hover:text-accent-solid-hover font-semibold cursor-pointer transition-colors duration-fast ease-standard">View All →</span>
          </div>
          {dbData.recentPatients.length === 0 ? (
            <div className="py-8 text-center text-content-tertiary text-body-sm">No recent patients</div>
          ) : (
            <div className="flex flex-col gap-1">
              {dbData.recentPatients.map((p, i) => (
                <button key={p.id} onClick={() => setPage('patients/' + p.id)} className="animate-slide-up flex items-center gap-3 ps-3 pe-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-fast ease-standard hover:bg-surface-canvas bg-transparent border-none w-full text-start">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-body-sm font-bold flex-shrink-0 ${AVATAR_ROTATION[i % AVATAR_ROTATION.length]}`}>
                    {(p.full_name || 'P').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm font-semibold text-content-primary truncate">{p.full_name}</div>
                    <div className="text-caption text-content-tertiary mt-0.5 truncate">{p.phone || p.email || 'No contact'}</div>
                  </div>
                  <div className="text-caption text-content-tertiary flex-shrink-0 tabular-nums lining-nums">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <AddAppointmentModal
          patients={patients}
          initialDate={todayLocal()}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); setRefreshTrigger(r => r + 1) }}
        />
      )}
    </div>
  )
}
