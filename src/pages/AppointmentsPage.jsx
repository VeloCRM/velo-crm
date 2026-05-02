import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Icons, Modal, FormField } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'
import { fmtLocalDate as fmtDate } from '../lib/date'
import { getCurrentUser, getCurrentOrgId } from '../lib/auth_session'
import { listDoctorsInOrg } from '../lib/profiles'
import {
  listAppointmentsBetween,
  updateAppointmentStatus,
  deleteAppointment as deleteAppointmentRow,
  upsertAppointment,
} from '../lib/appointments'
import {
  SAMPLE_DENTAL_DOCTORS,
  getSampleDentalAppointmentsWeek,
} from '../sampleData'
import { GlassCard, Button, Badge } from '../components/ui'

// ─── Constants ──────────────────────────────────────────────────────────────
// Appointment status enum (matches schema.sql appointment_status):
//   scheduled | confirmed | in_progress | completed | no_show | cancelled
// Colors map to the Liquid Glass palette — amber for "needs action",
// cyan for "active", emerald for "done", rose for "negative outcome".
const STATUS_STYLE = {
  scheduled:   'bg-amber-50 text-amber-700',
  confirmed:   'bg-accent-cyan-50 text-accent-cyan-700',
  in_progress: 'bg-accent-cyan-100 text-accent-cyan-800',
  completed:   'bg-emerald-50 text-emerald-700',
  no_show:     'bg-rose-50 text-rose-700',
  cancelled:   'bg-gray-100 text-gray-600',
}

const APT_TYPES = [
  { value: 'checkup',      en: 'Checkup',      ar: 'فحص' },
  { value: 'cleaning',     en: 'Cleaning',     ar: 'تنظيف' },
  { value: 'filling',      en: 'Filling',      ar: 'حشوة' },
  { value: 'extraction',   en: 'Extraction',   ar: 'خلع' },
  { value: 'root_canal',   en: 'Root Canal',   ar: 'علاج عصب' },
  { value: 'crown',        en: 'Crown',        ar: 'تاج' },
  { value: 'whitening',    en: 'Whitening',    ar: 'تبييض' },
  { value: 'consultation', en: 'Consultation', ar: 'استشارة' },
  { value: 'emergency',    en: 'Emergency',    ar: 'طوارئ' },
]

const STATUS_OPTIONS = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']

const DURATIONS = [15, 30, 45, 60, 90, 120]

const TIME_SLOTS = []
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:30`)
}

const SLOT_H = 48

// Shared form-field className: calm warm-paper-well (matches auth screens).
const FIELD_BASE = 'w-full h-[42px] px-3 rounded-md bg-surface-canvas border border-stroke-subtle text-body text-content-primary outline-none transition-[border-color,box-shadow] duration-fast ease-standard focus:border-stroke-brand focus:shadow-focus-brand'

const LABELS = {
  en: {
    today: 'Today', day: 'Day', week: 'Week', newApt: '+ New Appointment',
    doctors: 'Doctors', patient: 'Patient', doctor: 'Doctor',
    date: 'Date', startTime: 'Start Time', duration: 'Duration',
    endTime: 'End Time', type: 'Type', notes: 'Notes',
    status: 'Status', save: 'Save', cancel: 'Cancel', confirm: 'Confirm',
    complete: 'Complete', reschedule: 'Reschedule', delete: 'Delete',
    sendReminder: 'Send WhatsApp Reminder', conflict: 'has another appointment at this time',
    noApts: 'No appointments', searchPatient: 'Search patient...',
    mins: 'min',
    scheduled: 'Scheduled', confirmed: 'Confirmed', in_progress: 'In Progress',
    completed: 'Completed', no_show: 'No Show', cancelled: 'Cancelled',
    createApt: 'Create Appointment', editApt: 'Edit Appointment',
    allDoctors: 'All Doctors', aptDetails: 'Appointment Details',
    sat: 'Sat', sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
    filterDoctor: 'Filter by Doctor',
  },
  ar: {
    today: 'اليوم', day: 'يوم', week: 'اسبوع', newApt: '+ موعد جديد',
    doctors: 'الاطباء', patient: 'المريض', doctor: 'الطبيب',
    date: 'التاريخ', startTime: 'وقت البدء', duration: 'المدة',
    endTime: 'وقت الانتهاء', type: 'النوع', notes: 'ملاحظات',
    status: 'الحالة', save: 'حفظ', cancel: 'الغاء', confirm: 'تاكيد',
    complete: 'اكمال', reschedule: 'اعادة جدولة', delete: 'حذف',
    sendReminder: 'ارسال تذكير واتساب', conflict: 'لديه موعد اخر في هذا الوقت',
    noApts: 'لا توجد مواعيد', searchPatient: 'ابحث عن مريض...',
    mins: 'د',
    scheduled: 'مجدول', confirmed: 'مؤكد', in_progress: 'قيد التنفيذ',
    completed: 'مكتمل', no_show: 'لم يحضر', cancelled: 'ملغي',
    createApt: 'انشاء موعد', editApt: 'تعديل موعد',
    allDoctors: 'كل الاطباء', aptDetails: 'تفاصيل الموعد',
    sat: 'سبت', sun: 'احد', mon: 'اثنين', tue: 'ثلاثاء', wed: 'اربعاء', thu: 'خميس', fri: 'جمعة',
    filterDoctor: 'تصفية حسب الطبيب',
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Iraq week: Sat=0 .. Fri=6
const IRAQ_DAYS = [1, 2, 3, 4, 5, 6, 0] // JS day → Iraq index
function iraqWeekStart(d) {
  const date = new Date(d)
  const jsDay = date.getDay() // 0=Sun
  const iraqIdx = IRAQ_DAYS[jsDay]
  date.setDate(date.getDate() - iraqIdx)
  date.setHours(0,0,0,0)
  return date
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function timeToMin(t) {
  if (!t) return 0
  const [h,m] = t.split(':').map(Number)
  return h * 60 + m
}

function minToTime(m) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
}

// scheduled_at (ISO) → local YYYY-MM-DD
function aptDateStr(apt) {
  if (!apt?.scheduled_at) return ''
  return fmtDate(new Date(apt.scheduled_at))
}

// scheduled_at (ISO) → local 'HH:MM'
function aptTimeStr(apt) {
  if (!apt?.scheduled_at) return ''
  const d = new Date(apt.scheduled_at)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// scheduled_at (ISO) → minutes since 00:00 local
function aptStartMin(apt) {
  if (!apt?.scheduled_at) return 0
  const d = new Date(apt.scheduled_at)
  return d.getHours() * 60 + d.getMinutes()
}

// Combine local YYYY-MM-DD + HH:MM into ISO timestamp.
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [y, mo, da] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi, 0, 0).toISOString()
}

// Whole-day [start, end] ISO range covering local YYYY-MM-DD.
function dayRangeIso(dayStr) {
  const [y, mo, da] = dayStr.split('-').map(Number)
  const start = new Date(y, mo - 1, da, 0, 0, 0, 0)
  const end = new Date(y, mo - 1, da, 23, 59, 59, 999)
  return [start.toISOString(), end.toISOString()]
}

// Deterministic palette assignment for real-schema doctors (no `color` column).
// Demo doctors carry an explicit `color`; for real rows we hash the id.
const DOCTOR_PALETTE = [
  '#4DA6FF', '#A78BFA', '#9D6F4F', '#F48FB1',
  '#81C784', '#FFB74D', '#64B5F6', '#BA68C8',
]
function doctorColor(doctor) {
  if (!doctor) return null
  if (doctor.color) return doctor.color
  const id = String(doctor.id || '')
  if (!id) return DOCTOR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return DOCTOR_PALETTE[hash % DOCTOR_PALETTE.length]
}


// ─── Main Component ─────────────────────────────────────────────────────────
export default function AppointmentsPage({ t, lang, dir, isRTL, patients, toast, setPage }) {
  void t
  const L = LABELS[lang] || LABELS.en
  const [viewMode, setViewMode] = useState('day')
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [hiddenDoctors, setHiddenDoctors] = useState(new Set())
  const [filterDoctor, setFilterDoctor] = useState('all')
  const [selectedApt, setSelectedApt] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDefaults, setModalDefaults] = useState(null)
  const [editApt, setEditApt] = useState(null)
  const scrollRef = useRef(null)

  // ─── Fetch org, doctors ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setOrgId('demo-org')
      setDoctors(SAMPLE_DENTAL_DOCTORS)
      return
    }
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      try {
        const oid = await getCurrentOrgId()
        setOrgId(oid)
        const docs = await listDoctorsInOrg()
        setDoctors(docs)
      } catch {
        // Fall through to empty state; page renders with no doctor filter.
      }
    })()
  }, [])

  // ─── Fetch appointments ──────────────────────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      let startTs, endTs
      if (viewMode === 'day') {
        ;[startTs, endTs] = dayRangeIso(fmtDate(currentDate))
      } else {
        const ws = iraqWeekStart(currentDate)
        const we = addDays(ws, 6)
        const [s] = dayRangeIso(fmtDate(ws))
        const [, e] = dayRangeIso(fmtDate(we))
        startTs = s
        endTs = e
      }
      if (!isSupabaseConfigured()) {
        const all = getSampleDentalAppointmentsWeek()
        const inRange = all.filter(a => a.scheduled_at >= startTs && a.scheduled_at <= endTs)
        // Preserve user-created rows (id starts with 'demo-new-') within the active range
        // so toggling day↔week doesn't wipe optimistic local inserts.
        setAppointments(prev => {
          const userCreated = prev.filter(a =>
            typeof a.id === 'string' &&
            a.id.startsWith('demo-new-') &&
            a.scheduled_at >= startTs &&
            a.scheduled_at <= endTs
          )
          return [...inRange, ...userCreated]
        })
        setLoading(false)
        return
      }
      const data = await listAppointmentsBetween(startTs, endTs)
      setAppointments(data)
    } catch (e) {
      console.error('[AppointmentsPage] fetch failed:', e)
      toast?.(e.message || 'Failed to load appointments', 'error')
    } finally { setLoading(false) }
  }, [orgId, currentDate, viewMode, toast])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  // Auto-scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [currentDate, viewMode])

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setCurrentDate(d) }
  const goPrev = () => setCurrentDate(prev => addDays(prev, viewMode === 'day' ? -1 : -7))
  const goNext = () => setCurrentDate(prev => addDays(prev, viewMode === 'day' ? 1 : 7))

  const dateDisplay = useMemo(() => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    }
    const ws = iraqWeekStart(currentDate)
    const we = addDays(ws, 6)
    const opts = { month: 'short', day: 'numeric' }
    const loc = lang === 'ar' ? 'ar-IQ' : 'en-US'
    return `${ws.toLocaleDateString(loc, opts)} - ${we.toLocaleDateString(loc, { ...opts, year: 'numeric' })}`
  }, [currentDate, viewMode, lang])

  const visibleDoctors = useMemo(() => {
    let result = doctors.filter(d => !hiddenDoctors.has(d.id))
    if (filterDoctor !== 'all') result = result.filter(d => d.id === filterDoctor)
    return result
  }, [doctors, hiddenDoctors, filterDoctor])

  const filteredApts = useMemo(() => {
    let result = appointments
    if (filterDoctor !== 'all') result = result.filter(a => a.doctor_id === filterDoctor)
    if (hiddenDoctors.size > 0) result = result.filter(a => !hiddenDoctors.has(a.doctor_id))
    return result
  }, [appointments, filterDoctor, hiddenDoctors])

  const getDoctorById = (id) => doctors.find(d => d.id === id)

  // ─── Actions ─────────────────────────────────────────────────────────────
  const handleStatusChange = async (id, status) => {
    // Optimistic local update — always
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setSelectedApt(prev => prev?.id === id ? { ...prev, status } : prev)
    if (isSupabaseConfigured()) {
      try { await updateAppointmentStatus(id, status) }
      catch (err) { toast?.(err.message || 'Error updating status', 'error'); return }
    }
    toast?.(`Status updated to ${status}`, 'success')
  }

  const handleDeleteApt = async (id) => {
    // Optimistic local delete — always
    setAppointments(prev => prev.filter(a => a.id !== id))
    setSelectedApt(null)
    if (isSupabaseConfigured()) {
      try { await deleteAppointmentRow(id) }
      catch (err) { toast?.(err.message || 'Error deleting', 'error'); return }
    }
    toast?.('Appointment deleted', 'success')
  }

  const handleSave = async (data) => {
    if (editApt) {
      setAppointments(prev => prev.map(a => a.id === editApt.id ? { ...a, ...data } : a))
      if (isSupabaseConfigured()) {
        try {
          await upsertAppointment({ id: editApt.id, ...data })
          toast?.('Appointment updated', 'success'); fetchAppointments()
        } catch (err) {
          toast?.(err.message || 'Error updating', 'error')
        }
      } else {
        toast?.('Appointment updated', 'success')
      }
    } else {
      const tempId = 'demo-new-' + Date.now()
      const patient = patients?.find(p => p.id === data.patient_id) || null
      setAppointments(prev => [...prev, {
        id: tempId,
        org_id: orgId,
        ...data,
        patients: patient ? { id: patient.id, full_name: patient.full_name, phone: patient.phone } : null,
      }])
      if (isSupabaseConfigured()) {
        try {
          await upsertAppointment(data)
          toast?.('Appointment created', 'success'); fetchAppointments()
        } catch (err) {
          toast?.('Error creating: ' + (err.message || 'unknown'), 'error')
        }
      } else {
        toast?.('Appointment created', 'success')
      }
    }
    setShowModal(false)
    setEditApt(null)
    setModalDefaults(null)
  }

  const openNewModal = (defaults) => {
    setEditApt(null)
    setModalDefaults(defaults || null)
    setShowModal(true)
  }

  const openEditModal = (apt) => {
    setEditApt(apt)
    setModalDefaults(null)
    setShowModal(true)
  }

  const handleSlotClick = (time, doctorId, date) => {
    openNewModal({ time, doctor_id: doctorId, date: date || fmtDate(currentDate) })
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      dir={dir}
      className="ds-root flex flex-col h-[calc(100vh-60px)] overflow-hidden -m-4 md:-m-8"
      style={{ background: 'var(--ds-canvas-gradient)' }}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 md:px-8 py-3 bg-white/70 backdrop-blur-glass-sm border-b border-navy-100/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goToday}>{L.today}</Button>
          <button
            type="button"
            onClick={goPrev}
            aria-label={isRTL ? 'التالي' : 'Previous'}
            className="grid place-items-center w-9 h-9 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
          >
            {Icons.chevronLeft(16)}
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={isRTL ? 'السابق' : 'Next'}
            className="grid place-items-center w-9 h-9 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
          >
            {Icons.chevronRight(16)}
          </button>
          <span className="text-base md:text-lg font-semibold text-navy-900 ms-2 whitespace-nowrap tabular-nums">
            {dateDisplay}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Day/Week segmented toggle — navy-cyan gradient on active */}
          <div className="flex rounded-glass bg-navy-50/60 p-0.5 overflow-hidden">
            {['day', 'week'].map(v => {
              const active = viewMode === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewMode(v)}
                  className={[
                    'relative px-4 py-1 rounded-md text-sm font-semibold transition-colors',
                    active ? 'text-navy-900 bg-white shadow-glass-sm' : 'text-navy-500 hover:text-navy-700',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {v === 'day' ? L.day : L.week}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                      style={{ background: 'linear-gradient(90deg, #103562, #06B6D4)' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          {/* Doctor filter */}
          <select
            value={filterDoctor}
            onChange={e => setFilterDoctor(e.target.value)}
            dir={dir}
            aria-label={L.filterDoctor}
            className="h-9 px-3 rounded-glass bg-white/85 border border-navy-100 text-sm text-navy-800 outline-none cursor-pointer min-w-[140px] hover:border-navy-200 focus:border-accent-cyan-500 focus:shadow-focus-cyan transition-all"
          >
            <option value="all">{L.allDoctors}</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
          <Button
            variant="primary"
            size="sm"
            iconStart={Icons.plus}
            onClick={() => openNewModal()}
          >
            {isRTL ? 'موعد جديد' : 'New Appointment'}
          </Button>
        </div>
      </div>

      {/* Empty state when no doctors */}
      {!loading && doctors.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-4">
          <GlassCard padding="lg" className="max-w-[440px] text-center">
            <span className="grid place-items-center w-16 h-16 mx-auto mb-4 rounded-full bg-accent-cyan-500/10 text-accent-cyan-700">
              {Icons.calendar(32)}
            </span>
            <h2 className="text-2xl font-semibold text-navy-900 m-0 mb-2 leading-tight">
              {lang === 'ar' ? 'لم يتم اضافة اطباء بعد' : 'No doctors added yet'}
            </h2>
            <p className="text-sm text-navy-600 leading-relaxed m-0 mb-5">
              {lang === 'ar'
                ? 'اذهب الى الاعدادات ← العيادة لاضافة الاطباء.'
                : 'Go to Settings → Clinic to add doctors.'}
            </p>
            <Button
              variant="primary"
              iconStart={Icons.settings}
              onClick={() => setPage && setPage('settings/clinic')}
            >
              {lang === 'ar' ? 'اعدادات العيادة' : 'Clinic Settings'}
            </Button>
          </GlassCard>
        </div>
      )}

      {/* Body: sidebar + calendar + detail panel */}
      {(loading || doctors.length > 0) && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-[240px] flex-shrink-0 border-e border-navy-100/80 bg-white/65 backdrop-blur-glass-sm overflow-y-auto py-4 px-3 flex flex-col gap-5">
            <MiniCalendar
              currentDate={currentDate}
              setCurrentDate={(d) => { setCurrentDate(d); setViewMode('day') }}
              lang={lang}
              isRTL={isRTL}
              appointments={appointments}
            />

            {/* Doctors */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-500 mb-2.5">{L.doctors}</div>
              {doctors.length === 0 ? (
                <div className="text-xs text-navy-400">{lang === 'ar' ? 'لا يوجد أطباء' : 'No doctors added'}</div>
              ) : doctors.map(d => {
                const c = doctorColor(d)
                return (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 ps-1 pe-1 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-navy-50/60"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenDoctors.has(d.id)}
                      onChange={() => setHiddenDoctors(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}
                      style={{ accentColor: c }}
                    />
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-sm text-navy-800 font-medium truncate">{d.full_name}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Calendar Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-navy-500 text-sm">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : viewMode === 'day' ? (
              <DayView
                scrollRef={scrollRef}
                doctors={visibleDoctors}
                appointments={filteredApts.filter(a => aptDateStr(a) === fmtDate(currentDate))}
                getDoctorById={getDoctorById}
                onSlotClick={handleSlotClick}
                onAptClick={setSelectedApt}
                isRTL={isRTL}
                lang={lang}
                L={L}
                currentDate={currentDate}
              />
            ) : (
              <WeekView
                currentDate={currentDate}
                appointments={filteredApts}
                doctors={doctors}
                getDoctorById={getDoctorById}
                onDayClick={(d) => { setCurrentDate(d); setViewMode('day') }}
                onAptClick={setSelectedApt}
                isRTL={isRTL}
                lang={lang}
                L={L}
              />
            )}
          </div>

          {/* Right Detail Panel */}
          {selectedApt && (
            <DetailPanel
              apt={selectedApt}
              doctor={getDoctorById(selectedApt.doctor_id)}
              onClose={() => setSelectedApt(null)}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteApt}
              onEdit={() => { openEditModal(selectedApt); setSelectedApt(null) }}
              onGoToPatient={() => setPage && setPage('patients/' + selectedApt.patient_id)}
              isRTL={isRTL}
              lang={lang}
              L={L}
              dir={dir}
            />
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AppointmentModal
          onClose={() => { setShowModal(false); setEditApt(null); setModalDefaults(null) }}
          onSave={handleSave}
          patients={patients}
          doctors={doctors}
          editApt={editApt}
          defaults={modalDefaults}
          allAppointments={appointments}
          dir={dir}
          isRTL={isRTL}
          lang={lang}
          L={L}
          currentDate={currentDate}
        />
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// MINI CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function MiniCalendar({ currentDate, setCurrentDate, lang, isRTL, appointments }) {
  void isRTL
  const [viewMonth, setViewMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay()
  // Shift for Sat start: Sat=0 in our grid
  const offset = (firstDay + 1) % 7

  const dayLabels = lang === 'ar'
    ? ['س','ح','ن','ث','ر','خ','ج']
    : ['S','S','M','T','W','T','F']

  const monthLabel = viewMonth.toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', { month: 'long', year: 'numeric' })

  const aptDates = useMemo(
    () => new Set(appointments.map(a => aptDateStr(a))),
    [appointments]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          aria-label={lang === 'ar' ? 'الشهر السابق' : 'Previous month'}
          className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
        >
          {Icons.chevronLeft(14)}
        </button>
        <span className="text-sm font-semibold text-navy-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          aria-label={lang === 'ar' ? 'الشهر التالي' : 'Next month'}
          className="grid place-items-center w-7 h-7 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
        >
          {Icons.chevronRight(14)}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {dayLabels.map((d, i) => (
          <div key={i} className="text-[10px] font-semibold text-navy-400 py-1 uppercase tracking-wider">{d}</div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
          const dateStr = fmtDate(d)
          const isSel = fmtDate(currentDate) === dateStr
          const hasApt = aptDates.has(dateStr)
          const isTod = dateStr === fmtDate(new Date())
          // Selected (and today-when-also-selected) gets the navy pill;
          // today-not-selected gets a subtle cyan ring; everything else is
          // a quiet hoverable cell.
          const stateClass = isSel
            ? 'bg-navy-700 text-white font-bold shadow-glass-sm'
            : isTod
              ? 'bg-accent-cyan-50 text-accent-cyan-800 font-semibold ring-1 ring-accent-cyan-300 hover:bg-accent-cyan-100'
              : 'text-navy-700 font-medium hover:bg-navy-50'
          return (
            <div
              key={day}
              onClick={() => setCurrentDate(d)}
              className={`text-sm py-1 cursor-pointer rounded-md tabular-nums relative transition-colors ${stateClass}`}
            >
              {day}
              {hasApt && !isSel && (
                <div className="absolute bottom-0.5 start-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-cyan-500" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// DAY VIEW
// ═══════════════════════════════════════════════════════════════════════════
function DayView({ scrollRef, doctors, appointments, getDoctorById, onSlotClick, onAptClick, isRTL, lang, L, currentDate }) {
  void isRTL
  void L
  const cols = doctors.length > 0 ? doctors : [{ id: '__none', full_name: lang === 'ar' ? 'لا يوجد أطباء' : 'No doctors', color: null }]

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Doctor Headers */}
      <div className="flex border-b border-navy-100/80 flex-shrink-0 bg-white/60 backdrop-blur-glass-sm">
        <div className="w-[60px] flex-shrink-0 border-e border-navy-100/60" />
        {cols.map(col => {
          const c = doctorColor(col)
          return (
            <div
              key={col.id}
              className="flex-1 px-3 py-2.5 text-center border-e border-navy-100/60 border-b-2 border-solid"
              style={{ borderBottomColor: c || 'rgba(15,23,42,0.08)' }}
            >
              <div className="text-base font-semibold text-navy-900 truncate">{col.full_name}</div>
            </div>
          )
        })}
      </div>

      {/* Time Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="flex relative">
          {/* Time Labels */}
          <div className="w-[60px] flex-shrink-0 border-e border-navy-100/60">
            {TIME_SLOTS.map((slot, i) => (
              <div key={slot} className="flex items-start justify-end pe-2 pt-0.5" style={{ height: SLOT_H }}>
                {i % 2 === 0 && (
                  <span className="text-[11px] font-semibold text-navy-500 tabular-nums">{slot}</span>
                )}
              </div>
            ))}
          </div>

          {/* Columns */}
          {cols.map(col => {
            const colApts = appointments.filter(a =>
              col.id === '__none' ? true : a.doctor_id === col.id
            )
            return (
              <div key={col.id} className="flex-1 relative border-e border-navy-100/60">
                {/* Slot rows */}
                {TIME_SLOTS.map((slot, i) => (
                  <div
                    key={slot}
                    onClick={() => onSlotClick(slot, col.id === '__none' ? null : col.id)}
                    className={`cursor-pointer transition-colors hover:bg-navy-50/60 ${i % 2 === 0 ? 'border-b border-navy-100/60' : 'border-b border-navy-100/20'}`}
                    style={{ height: SLOT_H }}
                  />
                ))}

                {/* Appointment Cards */}
                {colApts.map(apt => {
                  const startMin = aptStartMin(apt)
                  const duration = apt.duration_minutes || 30
                  const gridStart = timeToMin('08:00')
                  const topPx = ((startMin - gridStart) / 30) * SLOT_H
                  const heightPx = (duration / 30) * SLOT_H - 2
                  const doc = getDoctorById(apt.doctor_id)
                  const docColor = doctorColor(doc)
                  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled
                  const patientName = apt.patients?.full_name || (lang === 'ar' ? 'مجهول' : 'Unknown')
                  const typeDef = APT_TYPES.find(t => t.value === apt.type)
                  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''
                  const isCancelled = apt.status === 'cancelled'

                  if (topPx < 0) return null

                  return (
                    <div
                      key={apt.id}
                      onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      className={`absolute start-[3px] end-[3px] rounded-glass cursor-pointer overflow-hidden z-raised border border-navy-100/80 border-s-[3px] shadow-glass-sm hover:shadow-glass transition-shadow ps-2 pe-2 py-1 backdrop-blur-glass-sm ${isCancelled ? 'bg-gray-100/80 opacity-75' : 'bg-white/85'}`}
                      style={{
                        top: topPx,
                        height: Math.max(heightPx, 28),
                        borderInlineStartColor: docColor || 'rgba(15,23,42,0.16)',
                      }}
                    >
                      <div className={`text-sm font-semibold leading-tight truncate ${isCancelled ? 'text-gray-500 line-through' : 'text-navy-900'}`}>
                        {patientName}
                      </div>
                      {heightPx > 36 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: docColor || 'rgba(15,23,42,0.3)' }}
                          />
                          <span className="text-[10px] text-navy-500 truncate">{doc?.full_name || ''}</span>
                        </div>
                      )}
                      {heightPx > 54 && (
                        <div className="text-[10px] text-navy-600 mt-0.5 truncate">{typeLabel}</div>
                      )}
                      {heightPx > 70 && (
                        <span className={`inline-block text-[9px] font-bold uppercase rounded-sm px-1.5 py-0.5 mt-1 ${ssClass}`}>
                          {apt.status}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Current Time Line */}
        {fmtDate(currentDate) === fmtDate(new Date()) && <CurrentTimeLine />}
      </div>
    </div>
  )
}

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(iv)
  }, [])
  const min = now.getHours() * 60 + now.getMinutes()
  const gridStart = timeToMin('08:00')
  const top = ((min - gridStart) / 30) * SLOT_H
  if (top < 0) return null
  return (
    <div className="absolute z-sticky pointer-events-none flex items-center start-[54px] end-0" style={{ top }}>
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: '#06B6D4', boxShadow: '0 0 12px -2px rgba(6,182,212,0.55)' }}
      />
      <div
        className="flex-1 h-0.5 opacity-90"
        style={{ background: '#06B6D4', boxShadow: '0 0 8px -2px rgba(6,182,212,0.45)' }}
      />
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════════
function WeekView({ currentDate, appointments, doctors, getDoctorById, onDayClick, onAptClick, isRTL, lang, L }) {
  void doctors
  void isRTL
  void lang
  const weekStart = iraqWeekStart(currentDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dayKeys = ['sat','sun','mon','tue','wed','thu','fri']

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-7 gap-2 min-h-full">
        {days.map((day, i) => {
          const dateStr = fmtDate(day)
          const dayApts = appointments
            .filter(a => aptDateStr(a) === dateStr)
            .sort((a, b) => aptStartMin(a) - aptStartMin(b))
          const isTod = dateStr === fmtDate(new Date())

          return (
            <div
              key={dateStr}
              className={`glass-card rounded-glass-lg overflow-hidden flex flex-col ${isTod ? 'ring-1 ring-accent-cyan-300' : ''}`}
            >
              {/* Day Header */}
              <div
                onClick={() => onDayClick(day)}
                className={`px-3 py-2.5 cursor-pointer border-b border-navy-100/60 flex items-center justify-between transition-colors ${isTod ? 'bg-accent-cyan-50/80 hover:bg-accent-cyan-100' : 'bg-navy-50/40 hover:bg-navy-50/70'}`}
              >
                <div>
                  <div className={`text-[10px] font-semibold uppercase tracking-wider ${isTod ? 'text-accent-cyan-700' : 'text-navy-500'}`}>
                    {L[dayKeys[i]]}
                  </div>
                  <div className={`text-lg font-bold tabular-nums leading-tight ${isTod ? 'text-accent-cyan-800' : 'text-navy-900'}`}>
                    {day.getDate()}
                  </div>
                </div>
                {dayApts.length > 0 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${isTod ? 'bg-accent-cyan-500 text-white' : 'bg-navy-100 text-navy-700'}`}>
                    {dayApts.length}
                  </span>
                )}
              </div>

              {/* Appointments */}
              <div className="flex-1 p-1.5 flex flex-col gap-1 overflow-y-auto max-h-[400px]">
                {dayApts.length === 0 ? (
                  <div className="p-3 text-center text-navy-400 text-[11px]">{L.noApts}</div>
                ) : dayApts.map(apt => {
                  const doc = getDoctorById(apt.doctor_id)
                  const docColor = doctorColor(doc)
                  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled
                  const patientName = apt.patients?.full_name || (lang === 'ar' ? 'مجهول' : 'Unknown')
                  const isCancelled = apt.status === 'cancelled'
                  return (
                    <div
                      key={apt.id}
                      onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      className={`px-2 py-1.5 rounded-md cursor-pointer border border-navy-100/60 border-s-[3px] hover:shadow-glass-sm transition-shadow ${isCancelled ? 'bg-gray-100/80 opacity-75' : 'bg-white/85 backdrop-blur-glass-sm hover:bg-white'}`}
                      style={{ borderInlineStartColor: docColor || 'rgba(15,23,42,0.16)' }}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className="text-[11px] font-bold tabular-nums"
                          style={{ color: docColor || '#475569' }}
                        >
                          {aptTimeStr(apt)}
                        </span>
                        <span className={`text-[9px] font-bold uppercase rounded-sm px-1.5 py-0.5 ${ssClass}`}>
                          {apt.status?.slice(0,4)}
                        </span>
                      </div>
                      <div className={`text-sm font-semibold truncate ${isCancelled ? 'text-gray-500 line-through' : 'text-navy-900'}`}>{patientName}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// DETAIL PANEL (right side)
// ═══════════════════════════════════════════════════════════════════════════
function DetailPanel({ apt, doctor, onClose, onStatusChange, onDelete, onEdit, onGoToPatient, isRTL, lang, L, dir }) {
  void isRTL
  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled
  const patientName = apt.patients?.full_name || 'Unknown'
  const patientPhone = apt.patients?.phone || ''
  const typeDef = APT_TYPES.find(t => t.value === apt.type)
  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''
  const startMin = aptStartMin(apt)
  const duration = apt.duration_minutes || 30
  const startTime = aptTimeStr(apt)
  const endTime = minToTime(startMin + duration)
  const docColor = doctorColor(doctor)

  return (
    <div
      dir={dir}
      className="ds-root w-[340px] flex-shrink-0 border-s border-navy-100/80 bg-white/70 backdrop-blur-glass-sm overflow-y-auto flex flex-col animate-fade-in"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-navy-100/60 flex items-center justify-between">
        <span className="text-base font-semibold text-navy-900">{L.aptDetails}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          className="grid place-items-center w-8 h-8 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
        >
          {Icons.x(18)}
        </button>
      </div>

      <div className="px-5 py-5 flex-1 flex flex-col gap-4">
        {/* Status Badge */}
        <div className="flex justify-center">
          <span className={`text-xs font-bold py-1.5 px-5 rounded-full uppercase tracking-wider ${ssClass}`}>
            {L[apt.status] || apt.status}
          </span>
        </div>

        {/* Patient */}
        <div
          onClick={onGoToPatient}
          className="bg-white/85 border border-navy-100 rounded-glass p-3.5 cursor-pointer transition-colors hover:border-navy-200 hover:bg-white shadow-glass-sm"
        >
          <div className="text-lg font-semibold text-navy-900 leading-tight">{patientName}</div>
          {patientPhone && (
            <div className="text-xs text-navy-600 mt-1 tabular-nums" dir="ltr">{patientPhone}</div>
          )}
          <div className="text-[10px] text-accent-cyan-700 font-medium mt-1.5">
            {lang === 'ar' ? 'انقر لعرض الملف' : 'Click to view profile'}
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col gap-3">
          <DetailRow icon={Icons.calendar(14)} label={L.date} value={aptDateStr(apt)} tabular />
          <DetailRow icon={Icons.clock(14)} label={L.startTime} value={`${startTime} - ${endTime}`} tabular />
          <DetailRow icon={Icons.clock(14)} label={L.duration} value={`${duration} ${L.mins}`} tabular />
          <DetailRow label={L.type} value={typeLabel} />
          {doctor && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: docColor }} />
              <span className="text-sm text-navy-800 font-semibold">{doctor.full_name}</span>
            </div>
          )}
          {apt.notes && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 mb-1">{L.notes}</div>
              <div className="text-sm text-navy-700 leading-relaxed p-2.5 bg-navy-50/60 rounded-md">
                {apt.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-4 border-t border-navy-100/60 flex flex-col gap-2">
        {apt.status === 'scheduled' && (
          <Button
            variant="secondary"
            className="w-full justify-center"
            iconStart={Icons.check}
            onClick={() => onStatusChange(apt.id, 'confirmed')}
          >
            {L.confirm}
          </Button>
        )}
        {(apt.status === 'scheduled' || apt.status === 'confirmed' || apt.status === 'in_progress') && (
          <button
            type="button"
            onClick={() => onStatusChange(apt.id, 'completed')}
            className="w-full justify-center inline-flex items-center gap-2 h-10 px-4 rounded-glass bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 hover:text-emerald-800 text-sm font-semibold transition-colors"
          >
            {Icons.check(14)} {L.complete}
          </button>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1 justify-center"
            iconStart={Icons.edit}
            onClick={onEdit}
          >
            {L.reschedule}
          </Button>
          {apt.status !== 'cancelled' && apt.status !== 'completed' && (
            <button
              type="button"
              onClick={() => onStatusChange(apt.id, 'cancelled')}
              className="flex-1 justify-center inline-flex items-center gap-2 h-10 px-4 rounded-glass bg-white/85 hover:bg-rose-50 border border-navy-100 hover:border-rose-200 text-navy-700 hover:text-rose-700 text-sm font-semibold transition-colors"
            >
              {Icons.x(13)} {L.cancel}
            </button>
          )}
        </div>
        <Button
          variant="destructive"
          className="w-full justify-center"
          iconStart={Icons.trash}
          onClick={() => onDelete(apt.id)}
        >
          {L.delete}
        </Button>

        {/* WhatsApp Reminder — neutral outline */}
        {apt.patients?.phone && (
          <button
            type="button"
            onClick={() => {
              const msg = encodeURIComponent(`Reminder: Your appointment is on ${aptDateStr(apt)} at ${startTime}`)
              const phone = apt.patients.phone.replace(/[^0-9]/g, '')
              window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
            }}
            className="w-full justify-center inline-flex items-center h-10 rounded-glass bg-transparent hover:bg-navy-50 border border-navy-100 text-navy-600 hover:text-navy-800 text-sm font-semibold transition-colors"
          >
            {L.sendReminder}
          </button>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value, tabular }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-navy-400 flex-shrink-0">{icon}</span>}
      <span className="text-[10px] text-navy-500 font-semibold uppercase tracking-wider min-w-[70px]">{label}:</span>
      <span className={`text-sm text-navy-800 font-medium ${tabular ? 'tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENT MODAL
// ═══════════════════════════════════════════════════════════════════════════
function AppointmentModal({ onClose, onSave, patients, doctors, editApt, defaults, allAppointments, dir, isRTL, lang, L, currentDate }) {
  void isRTL
  const patientList = patients || []

  const [form, setForm] = useState(() => {
    if (editApt) return {
      patient_id: editApt.patient_id || '',
      doctor_id: editApt.doctor_id || '',
      date: aptDateStr(editApt) || fmtDate(currentDate),
      time: aptTimeStr(editApt) || '09:00',
      duration_minutes: editApt.duration_minutes || 30,
      type: editApt.type || 'checkup',
      notes: editApt.notes || '',
      status: editApt.status || 'scheduled',
      chair_id: editApt.chair_id || '',
    }
    return {
      patient_id: '',
      doctor_id: defaults?.doctor_id || (doctors.length === 1 ? doctors[0].id : ''),
      date: defaults?.date || fmtDate(currentDate),
      time: defaults?.time || '09:00',
      duration_minutes: 30,
      type: 'checkup',
      notes: '',
      status: 'scheduled',
      chair_id: '',
    }
  })

  const [patientSearch, setPatientSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  const upd = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const endTime = useMemo(() => {
    return minToTime(timeToMin(form.time) + form.duration_minutes)
  }, [form.time, form.duration_minutes])

  // Conflict detection — compare overlapping intervals on the same doctor + date.
  const conflict = useMemo(() => {
    if (!form.doctor_id || !form.date || !form.time) return null
    const myStart = timeToMin(form.time)
    const myEnd = myStart + form.duration_minutes
    return allAppointments.find(a => {
      if (editApt && a.id === editApt.id) return false
      if (a.doctor_id !== form.doctor_id) return false
      if (aptDateStr(a) !== form.date) return false
      if (a.status === 'cancelled' || a.status === 'no_show') return false
      const aStart = aptStartMin(a)
      const aEnd = aStart + (a.duration_minutes || 30)
      return myStart < aEnd && myEnd > aStart
    })
  }, [form.doctor_id, form.date, form.time, form.duration_minutes, allAppointments, editApt])

  const conflictDoctor = conflict ? doctors.find(d => d.id === form.doctor_id) : null

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patientList.slice(0, 20)
    const q = patientSearch.toLowerCase()
    return patientList.filter(p =>
      p.full_name?.toLowerCase().includes(q) || p.phone?.includes(q)
    ).slice(0, 15)
  }, [patientSearch, patientList])

  const selectedPatient = patientList.find(p => p.id === form.patient_id)

  const handleSubmit = () => {
    if (!form.patient_id) return
    const scheduled_at = combineDateTime(form.date, form.time)
    if (!scheduled_at) return
    onSave({
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || null,
      type: form.type,
      status: form.status,
      scheduled_at,
      duration_minutes: form.duration_minutes,
      chair_id: form.chair_id || null,
      notes: form.notes || null,
    })
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div className="ds-root px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-navy-900 m-0">{editApt ? L.editApt : L.createApt}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRTL ? 'إغلاق' : 'Close'}
            className="grid place-items-center w-8 h-8 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
          >
            {Icons.x(18)}
          </button>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div className="ps-3.5 pe-3.5 py-2.5 rounded-glass bg-amber-50/80 border border-amber-200 mb-4 flex items-center gap-2">
            <span className="text-base text-amber-700 font-bold">!</span>
            <span className="text-sm text-amber-700 font-semibold">
              {conflictDoctor?.full_name || L.doctor} {L.conflict}
            </span>
          </div>
        )}

        {/* Patient Search */}
        <FormField label={L.patient} dir={dir}>
          <div className="relative" ref={searchRef}>
            {selectedPatient ? (
              <div onClick={() => { upd('patient_id', ''); setShowDropdown(true) }}
                className={`${FIELD_BASE} flex items-center justify-between cursor-pointer`}>
                <div>
                  <span className="font-semibold text-content-primary">{selectedPatient.full_name}</span>
                  {selectedPatient.phone && (
                    <span className="text-content-tertiary ms-2 text-caption tabular-nums lining-nums">
                      {selectedPatient.phone}
                    </span>
                  )}
                </div>
                <span className="text-content-tertiary">{Icons.x(14)}</span>
              </div>
            ) : (
              <input type="text" value={patientSearch}
                onChange={e => { setPatientSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder={L.searchPatient}
                dir={dir}
                className={FIELD_BASE} />
            )}
            {showDropdown && !selectedPatient && (
              <div className="absolute top-full inset-x-0 z-dropdown bg-surface-raised border border-stroke-subtle rounded-md mt-1 max-h-[200px] overflow-y-auto shadow-3">
                {filteredPatients.length === 0 ? (
                  <div className="p-3 text-content-tertiary text-body-sm text-center">No results</div>
                ) : filteredPatients.map(p => (
                  <div key={p.id}
                    onClick={() => { upd('patient_id', p.id); setPatientSearch(''); setShowDropdown(false) }}
                    className="ps-3.5 pe-3.5 py-2.5 cursor-pointer border-b border-stroke-subtle transition-colors duration-fast ease-standard hover:bg-surface-canvas">
                    <div className="text-body font-semibold text-content-primary">{p.full_name}</div>
                    {p.phone && (
                      <div className="text-caption text-content-tertiary mt-0.5 tabular-nums lining-nums">{p.phone}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {/* Doctor */}
        <FormField label={L.doctor} dir={dir}>
          <select value={form.doctor_id} onChange={e => upd('doctor_id', e.target.value)} dir={dir} className={FIELD_BASE}>
            <option value="">--</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </FormField>

        {/* Date */}
        <FormField label={L.date} dir={dir}>
          <input type="date" value={form.date}
            onChange={e => upd('date', e.target.value)} dir={dir}
            className={`${FIELD_BASE} tabular-nums lining-nums`} />
        </FormField>

        {/* Time, Duration, End Time */}
        <div className="grid grid-cols-3 gap-3">
          <FormField label={L.startTime} dir={dir}>
            <select value={form.time}
              onChange={e => upd('time', e.target.value)} dir={dir}
              className={`${FIELD_BASE} tabular-nums lining-nums`}>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label={L.duration} dir={dir}>
            <select value={form.duration_minutes}
              onChange={e => upd('duration_minutes', Number(e.target.value))} dir={dir}
              className={`${FIELD_BASE} tabular-nums lining-nums`}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} {L.mins}</option>)}
            </select>
          </FormField>
          <FormField label={L.endTime} dir={dir}>
            <input type="text" value={endTime} readOnly dir={dir}
              className={`${FIELD_BASE} bg-surface-sunken text-content-tertiary tabular-nums lining-nums cursor-not-allowed`} />
          </FormField>
        </div>

        {/* Type */}
        <FormField label={L.type} dir={dir}>
          <select value={form.type} onChange={e => upd('type', e.target.value)} dir={dir} className={FIELD_BASE}>
            {APT_TYPES.map(t => <option key={t.value} value={t.value}>{lang === 'ar' ? t.ar : t.en}</option>)}
          </select>
        </FormField>

        {/* Notes */}
        <FormField label={L.notes} dir={dir}>
          <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={3} dir={dir}
            className={`${FIELD_BASE} h-auto py-3 resize-y`} />
        </FormField>

        {/* Status (edit mode) */}
        {editApt && (
          <FormField label={L.status} dir={dir}>
            <select value={form.status} onChange={e => upd('status', e.target.value)} dir={dir} className={FIELD_BASE}>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{L[s] || s}</option>
              ))}
            </select>
          </FormField>
        )}

        {/* Actions */}
        <div className="flex gap-2.5 mt-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>{L.cancel}</Button>
          <Button variant="primary" size="lg" className="flex-[2]" onClick={handleSubmit} disabled={!form.patient_id}>{L.save}</Button>
        </div>
      </div>
    </Modal>
  )
}
