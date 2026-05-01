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

// ─── Constants ──────────────────────────────────────────────────────────────
// Status -> Tailwind className map (replaces former bg/text/border hex map).
// Mint discipline: only `confirmed` (active state) carries accent.
const STATUS_STYLE = {
  pending:   'bg-status-warning-bg text-status-warning-fg',
  confirmed: 'bg-accent-subtle text-accent-fg',
  completed: 'bg-status-success-bg text-status-success-fg',
  cancelled: 'bg-status-danger-bg text-status-danger-fg',
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
  { value: 'other',        en: 'Other',        ar: 'اخرى' },
]

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
    endTime: 'End Time', type: 'Type', price: 'Price', notes: 'Notes',
    status: 'Status', save: 'Save', cancel: 'Cancel', confirm: 'Confirm',
    complete: 'Complete', reschedule: 'Reschedule', delete: 'Delete',
    sendReminder: 'Send WhatsApp Reminder', conflict: 'has another appointment at this time',
    noApts: 'No appointments', searchPatient: 'Search patient...',
    mins: 'min', pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed',
    cancelled: 'Cancelled', createApt: 'Create Appointment', editApt: 'Edit Appointment',
    allDoctors: 'All Doctors', aptDetails: 'Appointment Details',
    sat: 'Sat', sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
    filterDoctor: 'Filter by Doctor',
  },
  ar: {
    today: 'اليوم', day: 'يوم', week: 'اسبوع', newApt: '+ موعد جديد',
    doctors: 'الاطباء', patient: 'المريض', doctor: 'الطبيب',
    date: 'التاريخ', startTime: 'وقت البدء', duration: 'المدة',
    endTime: 'وقت الانتهاء', type: 'النوع', price: 'السعر', notes: 'ملاحظات',
    status: 'الحالة', save: 'حفظ', cancel: 'الغاء', confirm: 'تاكيد',
    complete: 'اكمال', reschedule: 'اعادة جدولة', delete: 'حذف',
    sendReminder: 'ارسال تذكير واتساب', conflict: 'لديه موعد اخر في هذا الوقت',
    noApts: 'لا توجد مواعيد', searchPatient: 'ابحث عن مريض...',
    mins: 'د', pending: 'قيد الانتظار', confirmed: 'مؤكد', completed: 'مكتمل',
    cancelled: 'ملغي', createApt: 'انشاء موعد', editApt: 'تعديل موعد',
    allDoctors: 'كل الاطباء', aptDetails: 'تفاصيل الموعد',
    sat: 'سبت', sun: 'احد', mon: 'اثنين', tue: 'ثلاثاء', wed: 'اربعاء', thu: 'خميس', fri: 'جمعة',
    filterDoctor: 'تصفية حسب الطبيب',
  }
}

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


// ─── Main Component ─────────────────────────────────────────────────────────
export default function AppointmentsPage({ t, lang, dir, isRTL, contacts, toast, setPage }) {
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
        const docs = await listDoctorsInOrg({ activeOnly: true })
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
      let startDate, endDate
      if (viewMode === 'day') {
        startDate = endDate = fmtDate(currentDate)
      } else {
        const ws = iraqWeekStart(currentDate)
        startDate = fmtDate(ws)
        endDate = fmtDate(addDays(ws, 6))
      }
      if (!isSupabaseConfigured()) {
        const all = getSampleDentalAppointmentsWeek()
        const inRange = all.filter(a => a.appointment_date >= startDate && a.appointment_date <= endDate)
        // Preserve user-created rows (id starts with 'demo-new-') within the active range
        // so toggling day↔week doesn't wipe optimistic local inserts.
        setAppointments(prev => {
          const userCreated = prev.filter(a =>
            typeof a.id === 'string' &&
            a.id.startsWith('demo-new-') &&
            a.appointment_date >= startDate &&
            a.appointment_date <= endDate
          )
          return [...inRange, ...userCreated]
        })
        setLoading(false)
        return
      }
      const data = await listAppointmentsBetween(startDate, endDate)
      setAppointments(data)
    } catch (e) {
      console.error('[AppointmentsPage] fetch failed:', e)
      toast?.(e.message || 'Failed to load appointments', 'error')
    } finally { setLoading(false) }
  }, [orgId, currentDate, viewMode])

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
      setAppointments(prev => [...prev, { id: tempId, org_id: orgId, ...data }])
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
    openNewModal({ appointment_time: time, doctor_id: doctorId, appointment_date: date || fmtDate(currentDate) })
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div dir={dir} className="flex flex-col h-[calc(100vh-60px)] overflow-hidden bg-surface-canvas font-sans text-content-primary">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap ps-5 pe-5 py-3 bg-surface-raised border-b border-stroke-subtle flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className="h-[34px] px-3 rounded-md bg-surface-canvas border border-stroke-subtle text-body-sm font-semibold text-content-primary cursor-pointer hover:bg-surface-sunken hover:border-stroke transition-colors duration-fast ease-standard">
            {L.today}
          </button>
          <button onClick={goPrev} aria-label="Previous"
            className="h-[34px] w-[34px] flex items-center justify-center rounded-md bg-transparent text-content-secondary cursor-pointer hover:bg-surface-canvas hover:text-content-primary transition-colors duration-fast ease-standard">
            {Icons.chevronLeft(16)}
          </button>
          <button onClick={goNext} aria-label="Next"
            className="h-[34px] w-[34px] flex items-center justify-center rounded-md bg-transparent text-content-secondary cursor-pointer hover:bg-surface-canvas hover:text-content-primary transition-colors duration-fast ease-standard">
            {Icons.chevronRight(16)}
          </button>
          <span className="font-display text-h3 !text-content-primary ms-2 whitespace-nowrap tabular-nums lining-nums">
            {dateDisplay}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Day/Week segmented toggle */}
          <div className="flex rounded-md bg-surface-canvas border border-stroke-subtle overflow-hidden">
            {['day', 'week'].map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-4 py-1.5 border-none text-body-sm font-semibold cursor-pointer transition-colors duration-fast ease-standard ${viewMode === v ? 'bg-accent-subtle text-accent-fg' : 'bg-transparent text-content-tertiary hover:text-content-secondary'}`}>
                {v === 'day' ? L.day : L.week}
              </button>
            ))}
          </div>
          {/* Doctor filter */}
          <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} dir={dir}
            aria-label={L.filterDoctor}
            className="h-[34px] px-2.5 rounded-md bg-surface-canvas border border-stroke-subtle text-body-sm text-content-primary outline-none cursor-pointer min-w-[140px] focus:border-stroke-brand focus:shadow-focus-brand transition-[border-color,box-shadow] duration-fast ease-standard">
            <option value="all">{L.allDoctors}</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
          {/* Single primary mint moment */}
          <button onClick={() => openNewModal()}
            className="h-[34px] px-4 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent text-body-sm font-semibold border-none cursor-pointer transition-colors duration-fast ease-standard hover:shadow-glow-mint">
            {L.newApt}
          </button>
        </div>
      </div>

      {/* Empty state when no doctors */}
      {!loading && doctors.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-surface-raised border border-stroke-subtle rounded-lg shadow-1 max-w-[440px] py-12 px-10 text-center">
            <div className="text-content-tertiary mb-4 inline-flex">{Icons.calendar(48)}</div>
            <h2 className="font-display text-h2 !text-content-primary m-0 mb-2">
              {lang === 'ar' ? 'لم يتم اضافة اطباء بعد' : 'No doctors added yet'}
            </h2>
            <p className="text-body text-content-secondary leading-relaxed m-0 mb-6">
              {lang === 'ar'
                ? 'اذهب الى الاعدادات ← العيادة لاضافة الاطباء.'
                : 'Go to Settings → Clinic to add doctors.'}
            </p>
            <button onClick={() => setPage && setPage('settings/clinic')}
              className="inline-flex items-center gap-2 h-[42px] px-7 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent text-body font-semibold border-none cursor-pointer transition-colors duration-fast ease-standard hover:shadow-glow-mint">
              {Icons.settings(15)} {lang === 'ar' ? 'اعدادات العيادة' : 'Clinic Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Body: sidebar + calendar + detail panel */}
      {(loading || doctors.length > 0) && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-[240px] flex-shrink-0 border-e border-stroke-subtle bg-surface-raised overflow-y-auto py-4 px-3 flex flex-col gap-5">
            <MiniCalendar
              currentDate={currentDate}
              setCurrentDate={(d) => { setCurrentDate(d); setViewMode('day') }}
              lang={lang}
              isRTL={isRTL}
              appointments={appointments}
            />

            {/* Doctors */}
            <div>
              <div className="text-caption uppercase text-content-tertiary mb-2.5">{L.doctors}</div>
              {doctors.length === 0 ? (
                <div className="text-caption text-content-tertiary">No doctors added</div>
              ) : doctors.map(d => (
                <label key={d.id}
                  className="flex items-center gap-2 ps-1 pe-1 py-1.5 rounded-md cursor-pointer transition-colors duration-fast ease-standard hover:bg-surface-canvas">
                  <input type="checkbox" checked={!hiddenDoctors.has(d.id)}
                    onChange={() => setHiddenDoctors(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}
                    style={{ accentColor: d.color }} />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-body-sm text-content-primary font-medium truncate">{d.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Calendar Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-content-tertiary text-body">Loading...</div>
            ) : viewMode === 'day' ? (
              <DayView
                scrollRef={scrollRef}
                doctors={visibleDoctors}
                appointments={filteredApts.filter(a => a.appointment_date === fmtDate(currentDate))}
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
              onGoToPatient={() => setPage && setPage('contacts/' + selectedApt.contact_id)}
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
          contacts={contacts}
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
  const [viewMonth, setViewMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay()
  // Shift for Sat start: Sat=0 in our grid
  const offset = (firstDay + 1) % 7

  const dayLabels = lang === 'ar'
    ? ['س','ح','ن','ث','ر','خ','ج']
    : ['S','S','M','T','W','T','F']

  const monthLabel = viewMonth.toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', { month: 'long', year: 'numeric' })

  const aptDates = new Set(appointments.map(a => a.appointment_date))

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="bg-transparent border-none text-content-secondary cursor-pointer p-0.5 hover:text-content-primary transition-colors duration-fast ease-standard">
          {Icons.chevronLeft(14)}
        </button>
        <span className="font-display text-body-lg !text-content-primary">{monthLabel}</span>
        <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          aria-label="Next month"
          className="bg-transparent border-none text-content-secondary cursor-pointer p-0.5 hover:text-content-primary transition-colors duration-fast ease-standard">
          {Icons.chevronRight(14)}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {dayLabels.map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-content-tertiary py-1 uppercase">{d}</div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
          const dateStr = fmtDate(d)
          const isSel = fmtDate(currentDate) === dateStr
          const hasApt = aptDates.has(dateStr)
          const isTod = dateStr === fmtDate(new Date())
          const stateClass = isSel
            ? 'bg-accent text-content-on-accent font-bold'
            : isTod
              ? 'bg-accent-subtle text-accent-fg font-semibold hover:bg-accent-muted'
              : 'text-content-primary font-medium hover:bg-surface-canvas'
          return (
            <div key={day} onClick={() => setCurrentDate(d)}
              className={`text-body-sm py-1 cursor-pointer rounded-md tabular-nums lining-nums relative transition-colors duration-fast ease-standard ${stateClass}`}>
              {day}
              {hasApt && !isSel && (
                <div className="absolute bottom-0.5 start-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
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
  const cols = doctors.length > 0 ? doctors : [{ id: '__none', full_name: lang === 'ar' ? 'لا يوجد أطباء' : 'No doctors', color: null }]

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Doctor Headers */}
      <div className="flex border-b border-stroke-subtle flex-shrink-0">
        <div className="w-[60px] flex-shrink-0 border-e border-stroke-subtle" />
        {cols.map(col => (
          <div key={col.id}
            className="flex-1 px-3 py-2.5 text-center border-e border-stroke-subtle bg-surface-sunken/40 border-b-2 border-solid"
            style={{ borderBottomColor: col.color || 'rgb(var(--velo-border-default))' }}>
            <div className="font-display text-h3 !text-content-primary truncate">{col.full_name}</div>
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="flex relative">
          {/* Time Labels */}
          <div className="w-[60px] flex-shrink-0 border-e border-stroke-subtle">
            {TIME_SLOTS.map((slot, i) => (
              <div key={slot} className="flex items-start justify-end pe-2 pt-0.5" style={{ height: SLOT_H }}>
                {i % 2 === 0 && (
                  <span className="font-display text-caption font-semibold text-content-secondary tabular-nums lining-nums">{slot}</span>
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
              <div key={col.id} className="flex-1 relative border-e border-stroke-subtle">
                {/* Slot rows */}
                {TIME_SLOTS.map((slot, i) => (
                  <div key={slot}
                    onClick={() => onSlotClick(slot, col.id === '__none' ? null : col.id)}
                    className={`cursor-pointer transition-colors duration-fast ease-standard hover:bg-accent-subtle/60 ${i % 2 === 0 ? 'border-b border-stroke-subtle' : 'border-b border-stroke-subtle/30'}`}
                    style={{ height: SLOT_H }}
                  />
                ))}

                {/* Appointment Cards */}
                {colApts.map(apt => {
                  const startMin = timeToMin(apt.appointment_time)
                  const duration = apt.duration_minutes || 30
                  const gridStart = timeToMin('08:00')
                  const topPx = ((startMin - gridStart) / 30) * SLOT_H
                  const heightPx = (duration / 30) * SLOT_H - 2
                  const doc = getDoctorById(apt.doctor_id)
                  const docColor = doc?.color
                  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.pending
                  const patientName = apt.contacts?.name || 'Unknown'
                  const typeDef = APT_TYPES.find(t => t.value === apt.type)
                  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''

                  if (topPx < 0) return null

                  return (
                    <div key={apt.id}
                      onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      className="absolute start-[3px] end-[3px] rounded-md cursor-pointer overflow-hidden z-raised bg-surface-raised border border-stroke-subtle border-s-[3px] shadow-1 hover:shadow-2 transition-shadow duration-fast ease-standard ps-2 pe-2 py-1"
                      style={{
                        top: topPx,
                        height: Math.max(heightPx, 28),
                        borderInlineStartColor: docColor || 'rgb(var(--velo-border-default))',
                      }}
                    >
                      <div className="text-body-sm font-semibold text-content-primary leading-tight truncate">
                        {patientName}
                      </div>
                      {heightPx > 36 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: docColor || 'rgb(var(--velo-text-tertiary))' }} />
                          <span className="text-[10px] text-content-tertiary truncate">{doc?.full_name || ''}</span>
                        </div>
                      )}
                      {heightPx > 54 && (
                        <div className="text-[10px] text-content-secondary mt-0.5 truncate">{typeLabel}</div>
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
      <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 shadow-glow-mint" />
      <div className="flex-1 h-0.5 bg-accent opacity-85 shadow-glow-mint" />
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════════
function WeekView({ currentDate, appointments, doctors, getDoctorById, onDayClick, onAptClick, isRTL, lang, L }) {
  const weekStart = iraqWeekStart(currentDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dayKeys = ['sat','sun','mon','tue','wed','thu','fri']

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-7 gap-2 min-h-full">
        {days.map((day, i) => {
          const dateStr = fmtDate(day)
          const dayApts = appointments.filter(a => a.appointment_date === dateStr)
          const isTod = dateStr === fmtDate(new Date())

          return (
            <div key={dateStr}
              className={`bg-surface-raised rounded-2xl shadow-1 overflow-hidden flex flex-col ${isTod ? 'border border-accent/60' : 'border border-stroke-subtle'}`}>
              {/* Day Header */}
              <div onClick={() => onDayClick(day)}
                className={`px-3 py-2.5 cursor-pointer border-b border-stroke-subtle flex items-center justify-between transition-colors duration-fast ease-standard ${isTod ? 'bg-accent-subtle hover:bg-accent-muted' : 'bg-surface-sunken hover:bg-accent-subtle/50'}`}>
                <div>
                  <div className={`text-caption font-bold uppercase ${isTod ? 'text-accent-fg' : 'text-content-tertiary'}`}>
                    {L[dayKeys[i]]}
                  </div>
                  <div className={`font-display text-h3 tabular-nums lining-nums ${isTod ? '!text-accent-fg' : '!text-content-primary'}`}>
                    {day.getDate()}
                  </div>
                </div>
                {dayApts.length > 0 && (
                  <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-accent-subtle text-accent-fg tabular-nums lining-nums">
                    {dayApts.length}
                  </span>
                )}
              </div>

              {/* Appointments */}
              <div className="flex-1 p-1.5 flex flex-col gap-1 overflow-y-auto max-h-[400px]">
                {dayApts.length === 0 ? (
                  <div className="p-3 text-center text-content-tertiary text-caption">{L.noApts}</div>
                ) : dayApts.map(apt => {
                  const doc = getDoctorById(apt.doctor_id)
                  const docColor = doc?.color
                  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.pending
                  const patientName = apt.contacts?.name || 'Unknown'
                  return (
                    <div key={apt.id} onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      className="px-2 py-1.5 rounded-md cursor-pointer bg-surface-raised border border-stroke-subtle border-s-[3px] hover:bg-surface-canvas hover:shadow-1 transition-[background,box-shadow] duration-fast ease-standard"
                      style={{ borderInlineStartColor: docColor || 'rgb(var(--velo-border-default))' }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-caption font-bold tabular-nums lining-nums"
                          style={{ color: docColor || 'rgb(var(--velo-text-secondary))' }}>
                          {apt.appointment_time?.slice(0,5)}
                        </span>
                        <span className={`text-[9px] font-bold uppercase rounded-sm px-1.5 py-0.5 ${ssClass}`}>
                          {apt.status?.slice(0,4)}
                        </span>
                      </div>
                      <div className="text-body-sm font-semibold text-content-primary truncate">{patientName}</div>
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
  const ssClass = STATUS_STYLE[apt.status] || STATUS_STYLE.pending
  const patientName = apt.contacts?.name || 'Unknown'
  const patientPhone = apt.contacts?.phone || ''
  const typeDef = APT_TYPES.find(t => t.value === apt.type)
  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''
  const endTime = apt.end_time || minToTime(timeToMin(apt.appointment_time) + (apt.duration_minutes || 30))

  return (
    <div dir={dir}
      className="w-[340px] flex-shrink-0 border-s border-stroke-subtle bg-surface-raised overflow-y-auto flex flex-col animate-fade shadow-1">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stroke-subtle flex items-center justify-between">
        <span className="font-display text-h3 !text-content-primary">{L.aptDetails}</span>
        <button onClick={onClose} aria-label="Close"
          className="bg-transparent border-none text-content-tertiary cursor-pointer p-1 hover:text-content-primary transition-colors duration-fast ease-standard">
          {Icons.x(18)}
        </button>
      </div>

      <div className="px-5 py-5 flex-1 flex flex-col gap-4">
        {/* Status Badge */}
        <div className="flex justify-center">
          <span className={`text-body-sm font-bold py-1.5 px-5 rounded-full uppercase ${ssClass}`}>
            {L[apt.status] || apt.status}
          </span>
        </div>

        {/* Patient */}
        <div onClick={onGoToPatient}
          className="bg-surface-canvas border border-stroke-subtle rounded-lg p-3.5 cursor-pointer transition-colors duration-fast ease-standard hover:border-stroke">
          <div className="font-display text-h2 !text-content-primary">{patientName}</div>
          {patientPhone && (
            <div className="text-caption text-content-secondary mt-1 tabular-nums lining-nums">{patientPhone}</div>
          )}
          <div className="text-[10px] text-content-tertiary mt-1">Click to view profile</div>
        </div>

        {/* Details */}
        <div className="flex flex-col gap-3">
          <DetailRow icon={Icons.calendar(14)} label={L.date} value={apt.appointment_date} tabular />
          <DetailRow icon={Icons.clock(14)} label={L.startTime} value={`${apt.appointment_time?.slice(0,5)} - ${endTime.slice(0,5)}`} tabular />
          <DetailRow icon={Icons.clock(14)} label={L.duration} value={`${apt.duration_minutes || 30} ${L.mins}`} tabular />
          <DetailRow label={L.type} value={typeLabel} />
          {doctor && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: doctor.color }} />
              <span className="text-body-sm text-content-primary font-semibold">{doctor.full_name}</span>
              <span className="text-caption text-content-tertiary">({doctor.specialization})</span>
            </div>
          )}
          {(apt.price > 0) && (
            <div className="flex items-center gap-2">
              <span className="text-caption text-content-tertiary font-semibold uppercase min-w-[70px]">{L.price}:</span>
              <span className="font-display text-body-lg font-bold text-content-primary tabular-nums lining-nums">
                {Number(apt.price).toLocaleString()}
              </span>
              <span className="text-caption text-content-secondary">{apt.currency || 'IQD'}</span>
            </div>
          )}
          {apt.notes && (
            <div>
              <div className="text-caption font-bold text-content-tertiary uppercase mb-1">{L.notes}</div>
              <div className="text-body-sm text-content-secondary leading-relaxed p-2.5 bg-surface-canvas rounded-md">
                {apt.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-4 border-t border-stroke-subtle flex flex-col gap-2">
        {apt.status === 'pending' && (
          <button onClick={() => onStatusChange(apt.id, 'confirmed')}
            className="w-full justify-center h-[38px] rounded-md bg-surface-canvas hover:bg-accent-subtle border border-stroke-subtle hover:border-accent text-content-primary hover:text-accent-fg text-body-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-fast ease-standard">
            {Icons.check(14)} {L.confirm}
          </button>
        )}
        {(apt.status === 'pending' || apt.status === 'confirmed') && (
          <button onClick={() => onStatusChange(apt.id, 'completed')}
            className="w-full justify-center h-[38px] rounded-md bg-surface-canvas hover:bg-status-success-bg border border-stroke-subtle hover:border-status-success-border text-content-primary hover:text-status-success-fg text-body-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-fast ease-standard">
            {Icons.check(14)} {L.complete}
          </button>
        )}
        <div className="flex gap-2">
          {/* Single primary mint moment in panel: Reschedule */}
          <button onClick={onEdit}
            className="flex-1 justify-center h-[36px] rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent text-body-sm font-semibold border-none cursor-pointer flex items-center gap-2 transition-colors duration-fast ease-standard hover:shadow-glow-mint">
            {Icons.edit(13)} {L.reschedule}
          </button>
          {apt.status !== 'cancelled' && apt.status !== 'completed' && (
            <button onClick={() => onStatusChange(apt.id, 'cancelled')}
              className="flex-1 justify-center h-[36px] rounded-md bg-surface-canvas hover:bg-status-danger-bg border border-stroke-subtle hover:border-status-danger-border text-content-primary hover:text-status-danger-fg text-body-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-fast ease-standard">
              {Icons.x(13)} {L.cancel}
            </button>
          )}
        </div>
        <button onClick={() => onDelete(apt.id)}
          className="w-full justify-center h-[36px] rounded-md bg-transparent hover:bg-status-danger-bg border border-stroke-subtle hover:border-status-danger-border text-status-danger-fg text-body-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-fast ease-standard">
          {Icons.trash(13)} {L.delete}
        </button>

        {/* WhatsApp Reminder — neutral outline (NOT WhatsApp brand green) */}
        {apt.contacts?.phone && (
          <button onClick={() => {
            const msg = encodeURIComponent(`Reminder: Your appointment is on ${apt.appointment_date} at ${apt.appointment_time?.slice(0,5)}`)
            const phone = apt.contacts.phone.replace(/[^0-9]/g, '')
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
          }}
            className="w-full justify-center h-[38px] rounded-md bg-transparent hover:bg-surface-canvas border border-stroke-subtle text-content-secondary hover:text-content-primary text-body-sm font-semibold cursor-pointer flex items-center transition-colors duration-fast ease-standard">
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
      {icon && <span className="text-content-tertiary flex-shrink-0">{icon}</span>}
      <span className="text-caption text-content-tertiary font-bold uppercase min-w-[70px]">{label}:</span>
      <span className={`text-body-sm text-content-primary font-medium ${tabular ? 'tabular-nums lining-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENT MODAL
// ═══════════════════════════════════════════════════════════════════════════
function AppointmentModal({ onClose, onSave, contacts, doctors, editApt, defaults, allAppointments, dir, isRTL, lang, L, currentDate }) {
  const [form, setForm] = useState(() => {
    if (editApt) return {
      contact_id: editApt.contact_id || '',
      doctor_id: editApt.doctor_id || '',
      appointment_date: editApt.appointment_date || fmtDate(currentDate),
      appointment_time: editApt.appointment_time?.slice(0,5) || '09:00',
      duration_minutes: editApt.duration_minutes || 30,
      type: editApt.type || 'checkup',
      title: editApt.title || '',
      notes: editApt.notes || '',
      status: editApt.status || 'pending',
      price: editApt.price || 0,
      currency: editApt.currency || 'IQD',
      reminder_sent: false,
    }
    return {
      contact_id: '',
      doctor_id: defaults?.doctor_id || (doctors.length === 1 ? doctors[0].id : ''),
      appointment_date: defaults?.appointment_date || fmtDate(currentDate),
      appointment_time: defaults?.appointment_time || '09:00',
      duration_minutes: 30,
      type: 'checkup',
      title: '',
      notes: '',
      status: 'pending',
      price: 0,
      currency: 'IQD',
      reminder_sent: false,
    }
  })

  const [patientSearch, setPatientSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  const upd = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const endTime = useMemo(() => {
    return minToTime(timeToMin(form.appointment_time) + form.duration_minutes)
  }, [form.appointment_time, form.duration_minutes])

  // Conflict detection
  const conflict = useMemo(() => {
    if (!form.doctor_id || !form.appointment_date || !form.appointment_time) return null
    const myStart = timeToMin(form.appointment_time)
    const myEnd = myStart + form.duration_minutes
    return allAppointments.find(a => {
      if (editApt && a.id === editApt.id) return false
      if (a.doctor_id !== form.doctor_id) return false
      if (a.appointment_date !== form.appointment_date) return false
      if (a.status === 'cancelled') return false
      const aStart = timeToMin(a.appointment_time)
      const aEnd = aStart + (a.duration_minutes || 30)
      return myStart < aEnd && myEnd > aStart
    })
  }, [form.doctor_id, form.appointment_date, form.appointment_time, form.duration_minutes, allAppointments, editApt])

  const conflictDoctor = conflict ? doctors.find(d => d.id === form.doctor_id) : null

  const filteredContacts = useMemo(() => {
    if (!patientSearch.trim()) return contacts.slice(0, 20)
    const q = patientSearch.toLowerCase()
    return contacts.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 15)
  }, [patientSearch, contacts])

  const selectedContact = contacts.find(c => c.id === form.contact_id)

  const handleSubmit = () => {
    if (!form.contact_id) return
    const data = {
      ...form,
      end_time: endTime,
      title: form.title || APT_TYPES.find(t => t.value === form.type)?.en || form.type,
    }
    onSave(data)
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-h2 !text-content-primary m-0">{editApt ? L.editApt : L.createApt}</h2>
          <button onClick={onClose} aria-label="Close"
            className="bg-transparent border-none text-content-tertiary cursor-pointer hover:text-content-primary transition-colors duration-fast ease-standard">
            {Icons.x(20)}
          </button>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div className="ps-3.5 pe-3.5 py-2.5 rounded-md bg-status-warning-bg border border-status-warning-border/30 mb-4 flex items-center gap-2">
            <span className="text-body-lg text-status-warning-fg font-bold">!</span>
            <span className="text-body-sm text-status-warning-fg font-semibold">
              {conflictDoctor?.full_name || L.doctor} {L.conflict}
            </span>
          </div>
        )}

        {/* Patient Search */}
        <FormField label={L.patient} dir={dir}>
          <div className="relative" ref={searchRef}>
            {selectedContact ? (
              <div onClick={() => { upd('contact_id', ''); setShowDropdown(true) }}
                className={`${FIELD_BASE} flex items-center justify-between cursor-pointer`}>
                <div>
                  <span className="font-semibold text-content-primary">{selectedContact.name}</span>
                  {selectedContact.phone && (
                    <span className="text-content-tertiary ms-2 text-caption tabular-nums lining-nums">
                      {selectedContact.phone}
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
            {showDropdown && !selectedContact && (
              <div className="absolute top-full inset-x-0 z-dropdown bg-surface-raised border border-stroke-subtle rounded-md mt-1 max-h-[200px] overflow-y-auto shadow-3">
                {filteredContacts.length === 0 ? (
                  <div className="p-3 text-content-tertiary text-body-sm text-center">No results</div>
                ) : filteredContacts.map(c => (
                  <div key={c.id}
                    onClick={() => { upd('contact_id', c.id); setPatientSearch(''); setShowDropdown(false) }}
                    className="ps-3.5 pe-3.5 py-2.5 cursor-pointer border-b border-stroke-subtle transition-colors duration-fast ease-standard hover:bg-surface-canvas">
                    <div className="text-body font-semibold text-content-primary">{c.name}</div>
                    {c.phone && (
                      <div className="text-caption text-content-tertiary mt-0.5 tabular-nums lining-nums">{c.phone}</div>
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
          <input type="date" value={form.appointment_date}
            onChange={e => upd('appointment_date', e.target.value)} dir={dir}
            className={`${FIELD_BASE} tabular-nums lining-nums`} />
        </FormField>

        {/* Time, Duration, End Time */}
        <div className="grid grid-cols-3 gap-3">
          <FormField label={L.startTime} dir={dir}>
            <select value={form.appointment_time}
              onChange={e => upd('appointment_time', e.target.value)} dir={dir}
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

        {/* Price & Currency */}
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <FormField label={L.price} dir={dir}>
            <input type="number" value={form.price}
              onChange={e => upd('price', e.target.value)} min="0" dir={dir}
              className={`${FIELD_BASE} tabular-nums lining-nums`} />
          </FormField>
          <FormField label="" dir={dir}>
            <div className="flex rounded-md bg-surface-canvas border border-stroke-subtle overflow-hidden h-[42px] mt-5">
              {['IQD', 'USD'].map(cur => (
                <button key={cur} onClick={() => upd('currency', cur)}
                  className={`flex-1 border-none text-body-sm font-semibold cursor-pointer transition-colors duration-fast ease-standard ${form.currency === cur ? 'bg-accent-subtle text-accent-fg' : 'bg-transparent text-content-tertiary hover:text-content-secondary'}`}>
                  {cur}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* Notes */}
        <FormField label={L.notes} dir={dir}>
          <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={3} dir={dir}
            className={`${FIELD_BASE} h-auto py-3 resize-y`} />
        </FormField>

        {/* Status (edit mode) */}
        {editApt && (
          <FormField label={L.status} dir={dir}>
            <select value={form.status} onChange={e => upd('status', e.target.value)} dir={dir} className={FIELD_BASE}>
              {['pending','confirmed','completed','cancelled'].map(s => (
                <option key={s} value={s}>{L[s]}</option>
              ))}
            </select>
          </FormField>
        )}

        {/* WhatsApp toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer py-2">
          <input type="checkbox" checked={form.reminder_sent}
            onChange={e => upd('reminder_sent', e.target.checked)} className="accent-accent" />
          <span className="text-body-sm text-content-primary font-medium">{L.sendReminder}</span>
        </label>

        {/* Actions — single mint moment is Save */}
        <div className="flex gap-2.5 mt-2">
          <button onClick={onClose}
            className="flex-1 justify-center h-[42px] rounded-md bg-surface-canvas border border-stroke-subtle text-content-primary text-body font-semibold cursor-pointer hover:bg-surface-sunken hover:border-stroke transition-colors duration-fast ease-standard flex items-center">
            {L.cancel}
          </button>
          <button onClick={handleSubmit} disabled={!form.contact_id}
            className="flex-[2] justify-center h-[42px] rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent text-body font-semibold border-none cursor-pointer transition-colors duration-fast ease-standard hover:shadow-glow-mint disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center">
            {L.save}
          </button>
        </div>
      </div>
    </Modal>
  )
}
