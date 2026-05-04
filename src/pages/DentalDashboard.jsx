import { useState, useEffect, useMemo } from 'react'
import AddAppointmentModal from '../components/AddAppointmentModal'
import {
  SAMPLE_DENTAL_DOCTORS,
  SAMPLE_DENTAL_PATIENTS,
  SAMPLE_DENTAL_APPOINTMENTS_TODAY,
  SAMPLE_DENTAL_STATS,
} from '../sampleData'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchDentalDashboardStats } from '../lib/dental_dashboard'
import { listDoctorsInOrg, fetchMyProfile } from '../lib/profiles'
import { updateAppointmentStatus } from '../lib/appointments'
import { todayLocal } from '../lib/date'
import { avatarGradient, avatarInitials } from '../lib/avatarGradient'
import { GlassCard, Button, Badge } from '../components/ui'

/* ── Inline icon helpers ────────────────────────────────────────────────── */
const Ico = (s, children) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
const Icons = {
  users:    (s = 20) => Ico(s, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  calendar: (s = 20) => Ico(s, <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  trendUp:  (s = 20) => Ico(s, <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>),
  dollar:   (s = 20) => Ico(s, <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>),
  file:     (s = 20) => Ico(s, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  check:    (s = 16) => Ico(s, <polyline points="20 6 9 17 4 12" />),
  x:        (s = 16) => Ico(s, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  plus:     (s = 16) => Ico(s, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  arrow:    (s = 14) => Ico(s, <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  arrowRtl: (s = 14) => Ico(s, <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
}

/* ── Greeting helper ────────────────────────────────────────────────────── */
function greetingKey(date = new Date()) {
  const h = date.getHours()
  if (h >= 5  && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  return 'evening'
}
const GREETING = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', friend: 'there' },
  ar: { morning: 'صباح الخير',   afternoon: 'مساء الخير',   evening: 'مساء الخير',   friend: 'بك' },
}

/* ── Status & type tone ─────────────────────────────────────────────────── */
const STATUS_TONE = {
  scheduled:   'warning',
  confirmed:   'cyan',
  in_progress: 'cyan',
  completed:   'success',
  no_show:     'danger',
  cancelled:   'danger',
}

function aptTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function firstNameOf(fullName, fallback) {
  if (!fullName) return fallback
  const part = String(fullName).trim().split(/\s+/)[0] || fallback
  // Strip honorifics so "Dr. Saif" → "Saif"
  if (/^dr\.?$/i.test(part) || /^د\.?$/.test(part)) {
    const second = String(fullName).trim().split(/\s+/)[1]
    return second || fallback
  }
  return part
}

/* ───────────────────────────────────────────────────────────────────────── */
export default function DentalDashboard({ t, lang, isRTL, dir, patients, setPage }) {
  void t
  const [dbData, setDbData] = useState({
    appointmentsCount: 0, appointmentsList: [],
    recentPatients: [], patientsThisMonth: 0, totalPatients: 0,
    loading: true,
  })
  const [doctors, setDoctors] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [myFullName, setMyFullName] = useState('')

  // Greeting target name — fetched once per mount; safe to fail (we have a fallback).
  useEffect(() => {
    let cancelled = false
    if (!isSupabaseConfigured()) {
      setMyFullName(lang === 'ar' ? 'الطبيب' : 'Doctor')
      return
    }
    fetchMyProfile()
      .then(p => { if (!cancelled) setMyFullName(p?.full_name || '') })
      .catch(() => { /* fallback to friend below */ })
    return () => { cancelled = true }
  }, [lang])

  // Stats + appointments + recent patients
  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        if (!isSupabaseConfigured()) {
          if (!mounted) return
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const _patientById = Object.fromEntries(SAMPLE_DENTAL_PATIENTS.map(p => [p.id, p]))
          const apts = SAMPLE_DENTAL_APPOINTMENTS_TODAY.map(a => {
            const [h, m] = a.time.split(':').map(Number)
            const sd = new Date(today); sd.setHours(h, m, 0, 0)
            const p = _patientById[a.patient_id]
            return {
              id: a.id, patient_id: a.patient_id, doctor_id: a.doctor_id,
              type: a.type, status: a.status, scheduled_at: sd.toISOString(),
              duration_minutes: a.duration_minutes, notes: a.notes,
              patients: p ? { id: p.id, full_name: p.full_name, phone: p.phone } : null,
            }
          })
          setDbData({
            appointmentsList: apts, appointmentsCount: apts.length,
            recentPatients: SAMPLE_DENTAL_PATIENTS.slice(0, 5),
            patientsThisMonth: SAMPLE_DENTAL_STATS.patientsThisMonth,
            totalPatients: SAMPLE_DENTAL_STATS.totalPatients,
            loading: false,
          })
          return
        }
        const now = new Date()
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)

        const stats = await fetchDentalDashboardStats({
          dayStartIso: dayStart.toISOString(),
          dayEndIso:   dayEnd.toISOString(),
          firstOfMonthIso: firstOfMonth.toISOString(),
        })
        if (!mounted) return
        setDbData({
          appointmentsList: stats.appointmentsToday,
          appointmentsCount: stats.appointmentsToday.length,
          recentPatients:    stats.recentPatients,
          patientsThisMonth: stats.newPatientsThisMonth,
          totalPatients:     stats.totalPatients,
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

  // Doctors
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

  const today = new Date()
  const G = GREETING[lang] || GREETING.en
  const greetingFirst = firstNameOf(myFullName, G.friend)

  const dateLabel = useMemo(() => today.toLocaleDateString(
    lang === 'ar' ? 'ar-IQ-u-ca-gregory' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  ), [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stat tile config ─────────────────────────────────────────────────── */
  const STAT_TILES = [
    {
      key: 'patients',
      label: isRTL ? 'إجمالي المرضى' : 'Total Patients',
      value: dbData.totalPatients.toLocaleString(),
      icon: Icons.users,
      tint: 'bg-accent-cyan-500/10 text-accent-cyan-700',
    },
    {
      key: 'appointments',
      label: isRTL ? 'مواعيد اليوم' : "Today's Appointments",
      value: dbData.appointmentsCount,
      icon: Icons.calendar,
      tint: 'bg-navy-100 text-navy-700',
    },
    {
      key: 'month',
      label: isRTL ? 'مرضى هذا الشهر' : 'New This Month',
      value: dbData.patientsThisMonth,
      icon: Icons.trendUp,
      tint: 'bg-emerald-100 text-emerald-700',
    },
  ]

  /* ── Quick action config ──────────────────────────────────────────────── */
  const QUICK_ACTIONS = [
    { key: 'new_patient',    icon: Icons.plus,     label: isRTL ? 'مريض جديد'   : 'New Patient',    onClick: () => setPage('patients/new'), primary: false },
    { key: 'new_appointment',icon: Icons.calendar, label: isRTL ? 'موعد جديد'    : 'New Appointment',onClick: () => setShowModal(true),       primary: true  },
    { key: 'treatment',      icon: Icons.file,     label: isRTL ? 'خطة علاج'      : 'Treatment Plan', onClick: () => setPage('patients'),      primary: false },
    { key: 'payment',        icon: Icons.dollar,   label: isRTL ? 'تسجيل دفعة'   : 'Record Payment', onClick: () => setPage('finance'),       primary: false },
  ]

  return (
    <div
      dir={dir}
      className="ds-root min-h-full -m-4 md:-m-8 p-4 md:p-8 box-border"
      style={{ background: 'var(--ds-canvas-gradient)' }}
    >
      <div className="relative max-w-[1280px] mx-auto flex flex-col gap-7">
        <div className="ds-ambient" />

        {/* ── Hero greeting ──────────────────────────────────────────────── */}
        <header className="animate-fade-in">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-cyan-700 mb-1.5">
            {dateLabel}
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-navy-900 leading-tight tracking-tight m-0">
            {`${G[greetingKey(today)]}, ${greetingFirst}`}
          </h1>
          <p className="text-sm text-navy-500 mt-2 m-0">
            {isRTL
              ? 'إليك ما يحدث في عيادتك اليوم.'
              : "Here's what's happening at your clinic today."}
          </p>
        </header>

        {/* ── Stat tiles ─────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {STAT_TILES.map(s => (
            <GlassCard
              key={s.key}
              padding="lg"
              className="relative overflow-hidden transition-all duration-fast ease-standard hover:-translate-y-px hover:shadow-glass"
            >
              {/* Cyan radial glow behind the number */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-6 -end-6 w-40 h-40 rounded-full opacity-50"
                style={{ background: 'radial-gradient(closest-side, rgba(6,182,212,0.18), rgba(6,182,212,0))' }}
              />
              <div className="relative flex flex-col gap-4">
                <span aria-hidden="true" className={`grid place-items-center w-10 h-10 rounded-full ${s.tint}`}>
                  {s.icon(20)}
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-500">{s.label}</p>
                <p className="text-5xl font-bold text-navy-900 leading-none tabular-nums tracking-tight">{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </section>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {QUICK_ACTIONS.map(qa => (
            <button
              key={qa.key}
              type="button"
              onClick={qa.onClick}
              className={[
                'group relative flex flex-col items-center justify-center gap-3 p-5 rounded-glass-lg',
                'transition-all duration-fast ease-standard',
                'hover:-translate-y-px focus-visible:outline-none focus-visible:shadow-focus-cyan',
                qa.primary
                  ? 'navy-gradient text-white shadow-navy-glow hover:shadow-navy-glow'
                  : 'glass-card text-navy-700 hover:shadow-glass',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'grid place-items-center w-12 h-12 rounded-full',
                  qa.primary
                    ? 'bg-white/15 text-white'
                    : 'bg-accent-cyan-500/10 text-accent-cyan-700 group-hover:bg-accent-cyan-500/15',
                ].join(' ')}
              >
                {qa.icon(22)}
              </span>
              <span className="text-sm font-semibold">{qa.label}</span>
            </button>
          ))}
        </section>

        {/* ── Today's Doctors ────────────────────────────────────────────── */}
        {doctors.length > 0 && (
          <section className="flex flex-col gap-4">
            <header className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-navy-900 m-0">
                {isRTL ? 'أطباء اليوم' : "Today's Doctors"}
              </h2>
              <button
                type="button"
                onClick={() => setPage('settings/team')}
                className="text-sm font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 inline-flex items-center gap-1 transition-colors"
              >
                {isRTL ? 'إدارة' : 'Manage'}
                {isRTL ? Icons.arrowRtl(14) : Icons.arrow(14)}
              </button>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {doctors.map(doc => {
                const docApts = dbData.appointmentsList.filter(a => a.doctor_id === doc.id)
                return (
                  <GlassCard key={doc.id} padding="md" className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`grid place-items-center w-11 h-11 rounded-full text-white text-sm font-bold shadow-glass-sm bg-gradient-to-br ${avatarGradient(doc.full_name)}`}
                    >
                      {avatarInitials(doc.full_name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy-800 truncate m-0">{doc.full_name || (isRTL ? 'طبيب' : 'Dr. Unknown')}</p>
                      <p className="text-xs text-navy-500 m-0 mt-0.5">
                        {docApts.length} {isRTL ? 'اليوم' : 'today'}
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-navy-900 tabular-nums leading-none">
                      {docApts.length}
                    </span>
                  </GlassCard>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Two-column: Timeline + Recent Patients ─────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Today's Schedule */}
          <GlassCard padding="lg" className="md:col-span-2">
            <header className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-navy-900 m-0">
                {isRTL ? 'جدول اليوم' : "Today's Schedule"}
              </h2>
              {dbData.appointmentsList.length > 0 && (
                <Badge tone="cyan">{dbData.appointmentsList.length}</Badge>
              )}
            </header>

            {dbData.appointmentsList.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-4 text-center">
                <span className="grid place-items-center w-14 h-14 rounded-full bg-accent-cyan-500/10 text-accent-cyan-700">
                  {Icons.calendar(28)}
                </span>
                <p className="text-sm text-navy-600 m-0">{isRTL ? 'لا توجد مواعيد اليوم' : 'No appointments today'}</p>
                <Button variant="primary" size="md" iconStart={Icons.plus} onClick={() => setShowModal(true)}>
                  {isRTL ? 'إضافة موعد' : 'Add Appointment'}
                </Button>
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {dbData.appointmentsList.map(apt => {
                  const fallback = patients?.find(p => p.id === apt.patient_id)
                  const patientName = apt.patients?.full_name || fallback?.full_name || (isRTL ? 'مريض' : 'Unknown')
                  const tone = STATUS_TONE[apt.status] || 'neutral'
                  return (
                    <li
                      key={apt.id}
                      className="flex items-center gap-3 p-3 rounded-glass border border-navy-100/60 bg-white/60 backdrop-blur-glass-sm hover:border-accent-cyan-300 transition-colors"
                    >
                      <span className="w-12 text-center font-semibold text-sm text-navy-700 tabular-nums shrink-0">
                        {aptTimeStr(apt.scheduled_at)}
                      </span>
                      <span aria-hidden="true" className="w-px self-stretch bg-navy-100/80" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-800 truncate m-0">{patientName}</p>
                        {apt.type && (
                          <p className="text-xs text-navy-500 capitalize m-0 mt-0.5">{apt.type.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                      <Badge tone={tone} size="sm" dot>{apt.status.replace(/_/g, ' ')}</Badge>
                      <div className="flex gap-1 shrink-0">
                        {apt.status === 'scheduled' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAction(apt.id, 'confirmed')}
                              className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                              aria-label={isRTL ? 'تأكيد' : 'Confirm'}
                            >
                              {Icons.check(14)}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(apt.id, 'cancelled')}
                              className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                              aria-label={isRTL ? 'إلغاء' : 'Cancel'}
                            >
                              {Icons.x(14)}
                            </button>
                          </>
                        )}
                        {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                          <button
                            type="button"
                            onClick={() => handleAction(apt.id, 'completed')}
                            className="px-2.5 h-7 rounded-md text-xs font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 hover:bg-accent-cyan-50 transition-colors"
                          >
                            {isRTL ? 'إكمال' : 'Complete'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </GlassCard>

          {/* Recent Patients */}
          <GlassCard padding="lg">
            <header className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-navy-900 m-0">
                {isRTL ? 'المرضى الأخيرون' : 'Recent Patients'}
              </h2>
              <button
                type="button"
                onClick={() => setPage('patients')}
                className="text-sm font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 inline-flex items-center gap-1 transition-colors"
              >
                {isRTL ? 'الكل' : 'View All'}
                {isRTL ? Icons.arrowRtl(14) : Icons.arrow(14)}
              </button>
            </header>
            {dbData.recentPatients.length === 0 ? (
              <p className="py-8 text-center text-sm text-navy-500 m-0">
                {isRTL ? 'لا يوجد مرضى حديثون' : 'No recent patients'}
              </p>
            ) : (
              <ul className="flex flex-col gap-1 -mx-2">
                {dbData.recentPatients.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPage('patients/' + p.id)}
                      className="flex items-center gap-3 px-2 py-2.5 w-full text-start rounded-glass hover:bg-navy-50/60 transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid place-items-center w-10 h-10 rounded-full text-white text-xs font-bold shadow-glass-sm bg-gradient-to-br ${avatarGradient(p.full_name)}`}
                      >
                        {avatarInitials(p.full_name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-navy-800 truncate">{p.full_name}</span>
                        <span className="block text-xs text-navy-500 truncate">{p.phone || p.email || (isRTL ? 'بدون تواصل' : 'No contact')}</span>
                      </span>
                      <span className="text-[11px] text-navy-400 tabular-nums shrink-0">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString(lang === 'ar' ? 'ar-IQ-u-ca-gregory' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
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
