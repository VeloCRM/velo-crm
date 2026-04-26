import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { C, card, makeBtn } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  SAMPLE_DENTAL_DOCTORS,
  getSampleDentalAppointmentsWeek,
} from '../sampleData'

// ─── Constants ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending:   { bg: 'rgba(255,255,255,0.05)',  text: '#7B7F9E', border: 'rgba(255,255,255,0.1)' },
  confirmed: { bg: 'rgba(77,166,255,0.12)',   text: '#4DA6FF', border: 'rgba(77,166,255,0.25)' },
  completed: { bg: 'rgba(0,255,178,0.1)',     text: '#00FFB2', border: 'rgba(0,255,178,0.25)' },
  cancelled: { bg: 'rgba(255,107,107,0.1)',   text: '#FF6B6B', border: 'rgba(255,107,107,0.25)' },
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
const HEADER_H = 44

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

function fmtDate(d) { return d.toISOString().slice(0,10) }
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      setOrgId(profile.org_id)
      const { data: docs, error: docsError } = await supabase
        .from('profiles')
        .select('id, full_name, color, specialization, role, is_active')
        .eq('org_id', profile.org_id)
        .eq('role', 'doctor')
        .eq('is_active', true)
        .order('full_name')
      if (docsError) console.warn('[AppointmentsPage] doctors fetch failed:', docsError)
      setDoctors(docs || [])
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
      const { data, error } = await supabase
        .from('appointments')
        .select('*, contacts:contact_id(id, name, phone)')
        .eq('org_id', orgId)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .order('appointment_time', { ascending: true })
      if (!error) setAppointments(data || [])
    } catch (e) { console.warn(e) }
    finally { setLoading(false) }
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

  const isToday = (d) => fmtDate(d) === fmtDate(new Date())

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
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
      if (error) { toast?.('Error updating status', 'error'); return }
    }
    toast?.(`Status updated to ${status}`, 'success')
  }

  const handleDeleteApt = async (id) => {
    // Optimistic local delete — always
    setAppointments(prev => prev.filter(a => a.id !== id))
    setSelectedApt(null)
    if (isSupabaseConfigured()) {
      const { error } = await supabase.from('appointments').delete().eq('id', id)
      if (error) { toast?.('Error deleting', 'error'); return }
    }
    toast?.('Appointment deleted', 'success')
  }

  const handleSave = async (data) => {
    if (editApt) {
      // Optimistic local update — always
      setAppointments(prev => prev.map(a => a.id === editApt.id ? { ...a, ...data } : a))
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('appointments').update(data).eq('id', editApt.id)
        if (error) { toast?.('Error updating', 'error') }
        else { toast?.('Appointment updated', 'success'); fetchAppointments() }
      } else {
        toast?.('Appointment updated', 'success')
      }
    } else {
      // Optimistic local insert with synthetic id (preserved across day↔week toggle in demo).
      const tempId = 'demo-new-' + Date.now()
      setAppointments(prev => [...prev, { id: tempId, org_id: orgId, ...data }])
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('appointments').insert({ ...data, org_id: orgId })
        if (error) { toast?.('Error creating: ' + error.message, 'error') }
        else { toast?.('Appointment created', 'success'); fetchAppointments() }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', direction: dir, overflow: 'hidden' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={goToday} style={{ ...makeBtn('secondary'), height: 34, fontSize: 13 }}>{L.today}</button>
          <button onClick={goPrev} style={{ ...makeBtn('ghost'), padding: 6, height: 34, width: 34, justifyContent: 'center' }}>{Icons.chevronLeft(16)}</button>
          <button onClick={goNext} style={{ ...makeBtn('ghost'), padding: 6, height: 34, width: 34, justifyContent: 'center' }}>{Icons.chevronRight(16)}</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, marginInlineStart: 8, whiteSpace: 'nowrap' }}>{dateDisplay}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Day/Week toggle */}
          <div style={{ display: 'flex', borderRadius: 10, background: 'var(--bg-void)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            {['day', 'week'].map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{ padding: '7px 16px', border: 'none', background: viewMode === v ? 'rgba(0,255,178,0.12)' : 'transparent', color: viewMode === v ? C.primary : C.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                {v === 'day' ? L.day : L.week}
              </button>
            ))}
          </div>
          {/* Doctor filter */}
          <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}
            style={{ ...selectStyle(dir), width: 'auto', height: 34, padding: '0 10px', fontSize: 13, minWidth: 140 }}>
            <option value="all">{L.allDoctors}</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
          {/* New Appointment */}
          <button className="velo-btn-primary" onClick={() => openNewModal()} style={{ ...makeBtn('primary'), height: 34, fontSize: 13 }}>{L.newApt}</button>
        </div>
      </div>

      {/* Empty state when no doctors */}
      {!loading && doctors.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...card, padding: '48px 40px', textAlign: 'center', maxWidth: 440 }}>
            <div style={{ marginBottom: 16, color: C.textMuted }}>{Icons.calendar(48)}</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
              {lang === 'ar' ? 'لم يتم اضافة اطباء بعد' : 'No doctors added yet'}
            </h2>
            <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px', lineHeight: 1.6 }}>
              {lang === 'ar'
                ? 'اذهب الى الاعدادات ← العيادة لاضافة الاطباء.'
                : 'Go to Settings \u2192 Clinic to add doctors.'}
            </p>
            <button className="velo-btn-primary" onClick={() => setPage && setPage('settings/clinic')}
              style={{ ...makeBtn('primary'), height: 42, fontSize: 14, padding: '0 28px' }}>
              {Icons.settings(15)} {lang === 'ar' ? 'اعدادات العيادة' : 'Clinic Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Body: sidebar + calendar + detail panel */}
      {(loading || doctors.length > 0) && <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <div style={{ width: 240, flexShrink: 0, borderInlineEnd: '1px solid var(--border-subtle)', background: 'var(--bg-card)', overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <MiniCalendar currentDate={currentDate} setCurrentDate={(d) => { setCurrentDate(d); setViewMode('day') }} lang={lang} isRTL={isRTL} appointments={appointments} />

          {/* Doctors */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.textMuted, marginBottom: 10 }}>{L.doctors}</div>
            {doctors.length === 0 ? <div style={{ fontSize: 12, color: C.textMuted }}>No doctors added</div> : doctors.map(d => (
              <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <input type="checkbox" checked={!hiddenDoctors.has(d.id)}
                  onChange={() => setHiddenDoctors(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}
                  style={{ accentColor: d.color }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{d.full_name}</span>
              </label>
            ))}
          </div>

        </div>

        {/* Calendar Area */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>Loading...</div>
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
      </div>}

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: 2 }}>{Icons.chevronLeft(14)}</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{monthLabel}</span>
        <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: 2 }}>{Icons.chevronRight(14)}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, textAlign: 'center' }}>
        {dayLabels.map((d, i) => (
          <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, padding: '4px 0' }}>{d}</div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
          const dateStr = fmtDate(d)
          const isSel = fmtDate(currentDate) === dateStr
          const hasApt = aptDates.has(dateStr)
          const isTod = dateStr === fmtDate(new Date())
          return (
            <div key={day} onClick={() => setCurrentDate(d)}
              style={{
                fontSize: 12, fontWeight: isSel ? 700 : 500, padding: '5px 0', cursor: 'pointer', borderRadius: 6,
                background: isSel ? 'rgba(0,255,178,0.15)' : 'transparent',
                color: isSel ? C.primary : isTod ? '#00FFB2' : C.text,
                position: 'relative', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-surface)' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
              {day}
              {hasApt && <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: C.primary }} />}
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
  const cols = doctors.length > 0 ? doctors : [{ id: '__none', full_name: lang === 'ar' ? 'لا يوجد أطباء' : 'No doctors', color: '#4DA6FF' }]

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Doctor Headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 60, flexShrink: 0, borderInlineEnd: '1px solid var(--border-subtle)' }} />
        {cols.map(col => (
          <div key={col.id} style={{
            flex: 1, padding: '10px 12px', textAlign: 'center',
            borderInlineEnd: '1px solid var(--border-subtle)',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: `2px solid ${col.color || '#4DA6FF'}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif", letterSpacing: '-0.01em' }}>{col.full_name}</div>
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', position: 'relative' }}>
          {/* Time Labels */}
          <div style={{ width: 60, flexShrink: 0, borderInlineEnd: '1px solid var(--border-subtle)' }}>
            {TIME_SLOTS.map((slot, i) => (
              <div key={slot} style={{ height: SLOT_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingInlineEnd: 8, paddingTop: 2 }}>
                {i % 2 === 0 && <span style={{ fontSize: 11, color: C.textSec, fontWeight: 600, fontFamily: "'Syne', sans-serif", letterSpacing: '-0.01em' }}>{slot}</span>}
              </div>
            ))}
          </div>

          {/* Columns */}
          {cols.map(col => {
            const colApts = appointments.filter(a =>
              col.id === '__none' ? true : a.doctor_id === col.id
            )
            return (
              <div key={col.id} style={{ flex: 1, position: 'relative', borderInlineEnd: '1px solid var(--border-subtle)' }}>
                {/* Slot rows */}
                {TIME_SLOTS.map((slot, i) => (
                  <div key={slot}
                    onClick={() => onSlotClick(slot, col.id === '__none' ? null : col.id)}
                    style={{
                      height: SLOT_H, borderBottom: `1px solid ${i % 2 === 0 ? 'var(--border-subtle)' : 'rgba(255,255,255,0.02)'}`,
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,178,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                  const docColor = doc?.color || '#4DA6FF'
                  const sc = STATUS_MAP[apt.status] || STATUS_MAP.pending
                  const patientName = apt.contacts?.name || 'Unknown'
                  const typeDef = APT_TYPES.find(t => t.value === apt.type)
                  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''

                  if (topPx < 0) return null

                  return (
                    <div key={apt.id}
                      onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      style={{
                        position: 'absolute', top: topPx, left: 3, right: 3,
                        height: Math.max(heightPx, 28), borderRadius: 8,
                        // Spec: rgba([doctor-color], 0.12) — hex 1f ≈ 12% alpha
                        background: `${docColor}1f`, border: `1px solid ${docColor}40`,
                        borderInlineStart: `3px solid ${docColor}`,
                        padding: '4px 8px', cursor: 'pointer', overflow: 'hidden',
                        zIndex: 2, transition: 'box-shadow 0.15s, transform 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${docColor}30`; e.currentTarget.style.transform = 'scale(1.01)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {patientName}
                      </div>
                      {heightPx > 36 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: docColor, flexShrink: 0, boxShadow: `0 0 5px ${docColor}` }} />
                          <span style={{ fontSize: 10, color: docColor, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc?.name || ''}</span>
                        </div>
                      )}
                      {heightPx > 54 && (
                        <div style={{ fontSize: 10, color: C.textSec, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeLabel}</div>
                      )}
                      {heightPx > 70 && (
                        <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: sc.bg, color: sc.text, marginTop: 3, textTransform: 'uppercase' }}>
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
    <div style={{ position: 'absolute', top, left: 54, right: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FFB2', flexShrink: 0, boxShadow: '0 0 8px rgba(0,255,178,0.4)' }} />
      <div style={{ flex: 1, height: 2, background: '#00FFB2', boxShadow: '0 0 8px rgba(0,255,178,0.4)', opacity: 0.85 }} />
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
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, minHeight: '100%' }}>
        {days.map((day, i) => {
          const dateStr = fmtDate(day)
          const dayApts = appointments.filter(a => a.appointment_date === dateStr)
          const isTod = dateStr === fmtDate(new Date())

          return (
            <div key={dateStr} style={{
              ...card, padding: 0, overflow: 'hidden',
              border: isTod ? '1px solid rgba(0,255,178,0.4)' : '1px solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Day Header */}
              <div onClick={() => onDayClick(day)}
                style={{
                  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                  background: isTod ? 'rgba(0,255,178,0.06)' : 'var(--bg-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,178,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = isTod ? 'rgba(0,255,178,0.06)' : 'var(--bg-surface)'}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isTod ? C.primary : C.textMuted, textTransform: 'uppercase' }}>
                    {L[dayKeys[i]]}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isTod ? C.primary : C.text }}>{day.getDate()}</div>
                </div>
                {dayApts.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,255,178,0.12)', color: C.primary }}>
                    {dayApts.length}
                  </span>
                )}
              </div>

              {/* Appointments */}
              <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 400 }}>
                {dayApts.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', color: C.textMuted, fontSize: 11 }}>{L.noApts}</div>
                ) : dayApts.map(apt => {
                  const doc = getDoctorById(apt.doctor_id)
                  const docColor = doc?.color || '#555'
                  const sc = STATUS_MAP[apt.status] || STATUS_MAP.pending
                  const patientName = apt.contacts?.name || 'Unknown'
                  return (
                    <div key={apt.id} onClick={(e) => { e.stopPropagation(); onAptClick(apt) }}
                      style={{
                        padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                        background: `${docColor}12`, borderInlineStart: `3px solid ${docColor}`,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = `${docColor}22`}
                      onMouseLeave={e => e.currentTarget.style.background = `${docColor}12`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: docColor }}>{apt.appointment_time?.slice(0,5)}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: sc.bg, color: sc.text, textTransform: 'uppercase' }}>{apt.status?.slice(0,4)}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patientName}</div>
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
  const sc = STATUS_MAP[apt.status] || STATUS_MAP.pending
  const patientName = apt.contacts?.name || 'Unknown'
  const patientPhone = apt.contacts?.phone || ''
  const typeDef = APT_TYPES.find(t => t.value === apt.type)
  const typeLabel = typeDef ? (lang === 'ar' ? typeDef.ar : typeDef.en) : apt.type || ''
  const endTime = apt.end_time || minToTime(timeToMin(apt.appointment_time) + (apt.duration_minutes || 30))

  return (
    <div style={{
      width: 340, flexShrink: 0, borderInlineStart: '1px solid var(--border-subtle)',
      background: 'var(--bg-card)', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      animation: 'slideIn 0.2s ease-out', direction: dir,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{L.aptDetails}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: 4 }}>{Icons.x(18)}</button>
      </div>

      <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status Badge */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, padding: '6px 20px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, textTransform: 'uppercase' }}>
            {L[apt.status] || apt.status}
          </span>
        </div>

        {/* Patient */}
        <div style={{ ...card, padding: 14, cursor: 'pointer' }} onClick={onGoToPatient}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,178,0.3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{patientName}</div>
          {patientPhone && <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{patientPhone}</div>}
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Click to view profile</div>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DetailRow icon={Icons.calendar(14)} label={L.date} value={apt.appointment_date} />
          <DetailRow icon={Icons.clock(14)} label={L.startTime} value={`${apt.appointment_time?.slice(0,5)} - ${endTime.slice(0,5)}`} />
          <DetailRow icon={Icons.clock(14)} label={L.duration} value={`${apt.duration_minutes || 30} ${L.mins}`} />
          <DetailRow label={L.type} value={typeLabel} />
          {doctor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: doctor.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{doctor.full_name}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>({doctor.specialization})</span>
            </div>
          )}
          {(apt.price > 0) && <DetailRow label={L.price} value={`${Number(apt.price).toLocaleString()} ${apt.currency || 'IQD'}`} />}
          {apt.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{L.notes}</div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5, padding: 10, background: 'var(--bg-void)', borderRadius: 8 }}>{apt.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {apt.status === 'pending' && (
          <button className="velo-btn-primary" onClick={() => onStatusChange(apt.id, 'confirmed')}
            style={{ ...makeBtn('primary'), width: '100%', justifyContent: 'center', height: 38 }}>
            {Icons.check(14)} {L.confirm}
          </button>
        )}
        {(apt.status === 'pending' || apt.status === 'confirmed') && (
          <button onClick={() => onStatusChange(apt.id, 'completed')}
            style={{ ...makeBtn('success'), width: '100%', justifyContent: 'center', height: 38 }}>
            {Icons.check(14)} {L.complete}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onEdit} style={{ ...makeBtn('secondary'), flex: 1, justifyContent: 'center', height: 36 }}>
            {Icons.edit(13)} {L.reschedule}
          </button>
          {apt.status !== 'cancelled' && apt.status !== 'completed' && (
            <button onClick={() => onStatusChange(apt.id, 'cancelled')}
              style={{ ...makeBtn('danger'), flex: 1, justifyContent: 'center', height: 36 }}>
              {Icons.x(13)} {L.cancel}
            </button>
          )}
        </div>
        <button onClick={() => onDelete(apt.id)}
          style={{ ...makeBtn('ghost'), width: '100%', justifyContent: 'center', height: 36, color: '#FF6B6B' }}>
          {Icons.trash(13)} {L.delete}
        </button>

        {/* WhatsApp Reminder */}
        {apt.contacts?.phone && (
          <button onClick={() => {
            const msg = encodeURIComponent(`Reminder: Your appointment is on ${apt.appointment_date} at ${apt.appointment_time?.slice(0,5)}`)
            const phone = apt.contacts.phone.replace(/[^0-9]/g, '')
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
          }}
            style={{ ...makeBtn('secondary'), width: '100%', justifyContent: 'center', height: 38, color: '#25d366', borderColor: 'rgba(37,211,102,0.3)' }}>
            {L.sendReminder}
          </button>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ color: C.textMuted, flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, minWidth: 70 }}>{label}:</span>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{value}</span>
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
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{editApt ? L.editApt : L.createApt}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer' }}>{Icons.x(20)}</button>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,179,71,0.1)', border: '1px solid rgba(255,179,71,0.3)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>!</span>
            <span style={{ fontSize: 13, color: '#FFB347', fontWeight: 600 }}>
              {conflictDoctor?.name || L.doctor} {L.conflict}
            </span>
          </div>
        )}

        {/* Patient Search */}
        <FormField label={L.patient} dir={dir}>
          <div style={{ position: 'relative' }} ref={searchRef}>
            {selectedContact ? (
              <div style={{ ...inputStyle(dir), display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => { upd('contact_id', ''); setShowDropdown(true) }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{selectedContact.name}</span>
                  {selectedContact.phone && <span style={{ color: C.textMuted, marginInlineStart: 8, fontSize: 12 }}>{selectedContact.phone}</span>}
                </div>
                <span style={{ color: C.textMuted }}>{Icons.x(14)}</span>
              </div>
            ) : (
              <input
                type="text" value={patientSearch}
                onChange={e => { setPatientSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder={L.searchPatient}
                style={inputStyle(dir)}
              />
            )}
            {showDropdown && !selectedContact && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {filteredContacts.length === 0 ? (
                  <div style={{ padding: 12, color: C.textMuted, fontSize: 13, textAlign: 'center' }}>No results</div>
                ) : filteredContacts.map(c => (
                  <div key={c.id}
                    onClick={() => { upd('contact_id', c.id); setPatientSearch(''); setShowDropdown(false) }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{c.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {/* Doctor */}
        <FormField label={L.doctor} dir={dir}>
          <select value={form.doctor_id} onChange={e => upd('doctor_id', e.target.value)} style={selectStyle(dir)}>
            <option value="">--</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </FormField>

        {/* Date */}
        <FormField label={L.date} dir={dir}>
          <input type="date" value={form.appointment_date} onChange={e => upd('appointment_date', e.target.value)} style={inputStyle(dir)} />
        </FormField>

        {/* Time, Duration, End Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <FormField label={L.startTime} dir={dir}>
            <select value={form.appointment_time} onChange={e => upd('appointment_time', e.target.value)} style={selectStyle(dir)}>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label={L.duration} dir={dir}>
            <select value={form.duration_minutes} onChange={e => upd('duration_minutes', Number(e.target.value))} style={selectStyle(dir)}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} {L.mins}</option>)}
            </select>
          </FormField>
          <FormField label={L.endTime} dir={dir}>
            <input type="text" value={endTime} readOnly style={{ ...inputStyle(dir), background: 'var(--bg-surface)', color: C.textMuted }} />
          </FormField>
        </div>

        {/* Type */}
        <FormField label={L.type} dir={dir}>
          <select value={form.type} onChange={e => upd('type', e.target.value)} style={selectStyle(dir)}>
            {APT_TYPES.map(t => <option key={t.value} value={t.value}>{lang === 'ar' ? t.ar : t.en}</option>)}
          </select>
        </FormField>

        {/* Price & Currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <FormField label={L.price} dir={dir}>
            <input type="number" value={form.price} onChange={e => upd('price', e.target.value)} style={inputStyle(dir)} min="0" />
          </FormField>
          <FormField label="" dir={dir}>
            <div style={{ display: 'flex', borderRadius: 10, background: 'var(--bg-void)', border: '1px solid var(--border-subtle)', overflow: 'hidden', height: 42, marginTop: 20 }}>
              {['IQD', 'USD'].map(cur => (
                <button key={cur} onClick={() => upd('currency', cur)}
                  style={{ flex: 1, border: 'none', background: form.currency === cur ? 'rgba(0,255,178,0.12)' : 'transparent', color: form.currency === cur ? C.primary : C.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {cur}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* Notes */}
        <FormField label={L.notes} dir={dir}>
          <textarea value={form.notes} onChange={e => upd('notes', e.target.value)}
            rows={3} style={{ ...inputStyle(dir), height: 'auto', padding: 12, resize: 'vertical' }} />
        </FormField>

        {/* Status (edit mode) */}
        {editApt && (
          <FormField label={L.status} dir={dir}>
            <select value={form.status} onChange={e => upd('status', e.target.value)} style={selectStyle(dir)}>
              {['pending','confirmed','completed','cancelled'].map(s => (
                <option key={s} value={s}>{L[s]}</option>
              ))}
            </select>
          </FormField>
        )}

        {/* WhatsApp toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
          <input type="checkbox" checked={form.reminder_sent} onChange={e => upd('reminder_sent', e.target.checked)} style={{ accentColor: '#25d366' }} />
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{L.sendReminder}</span>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ ...makeBtn('secondary'), flex: 1, justifyContent: 'center', height: 42 }}>{L.cancel}</button>
          <button className="velo-btn-primary" onClick={handleSubmit} disabled={!form.contact_id}
            style={{ ...makeBtn('primary'), flex: 2, justifyContent: 'center', height: 42, opacity: form.contact_id ? 1 : 0.5 }}>
            {L.save}
          </button>
        </div>
      </div>
    </Modal>
  )
}
