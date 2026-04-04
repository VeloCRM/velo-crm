import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { SAMPLE_APPOINTMENTS } from '../sampleData'

const TYPE_COLORS = {
  meeting:     { bg:'#DAFBE1', text:'#1A7F37', accent:'#1A7F37', label:'Meeting', ar:'اجتماع' },
  call:        { bg:'#DDF4FF', text:'#0969DA', accent:'#0969DA', label:'Call', ar:'مكالمة' },
  demo:        { bg:'#FBEFFF', text:'#8250DF', accent:'#8250DF', label:'Demo', ar:'عرض' },
  'follow-up': { bg:'#FFF8C5', text:'#7D4E00', accent:'#D29922', label:'Follow-up', ar:'متابعة' },
  appointment: { bg:'#DDF4FF', text:'#0969DA', accent:'#0969DA', label:'Appointment', ar:'موعد' },
}

const REMINDERS = [
  { id:'none', en:'None', ar:'بدون' },
  { id:'15min', en:'15 minutes before', ar:'قبل 15 دقيقة' },
  { id:'1hr', en:'1 hour before', ar:'قبل ساعة' },
  { id:'1day', en:'1 day before', ar:'قبل يوم' },
]

function loadEvents() { try { return JSON.parse(localStorage.getItem('velo_calendar_events')||'null') || SAMPLE_APPOINTMENTS } catch { return SAMPLE_APPOINTMENTS } }
function saveEvents(e) { localStorage.setItem('velo_calendar_events', JSON.stringify(e)) }

export default function CalendarPage({ t, lang, dir, isRTL, contacts }) {
  const [view, setView] = useState('month')
  const [events, setEvents] = useState(loadEvents)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')
  const [editingEvent, setEditingEvent] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const monthName = new Date(year, month).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'long', year: 'numeric' })
  const weekDays = isRTL ? ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  const getEventsForDate = (dateStr) => events.filter(e => e.date === dateStr)

  const upcomingEvents = [...events].filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||'')).slice(0, 8)

  const persist = (next) => { setEvents(next); saveEvents(next) }
  const addEvent = (ev) => { persist([...events, { ...ev, id: `evt_${Date.now()}` }]); setShowForm(false); setEditingEvent(null) }
  const updateEvent = (ev) => { persist(events.map(e => e.id === ev.id ? ev : e)); setShowForm(false); setEditingEvent(null) }
  const deleteEvent = (id) => { persist(events.filter(e => e.id !== id)); setEditingEvent(null) }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={{ direction: dir }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>{t.calendar}</h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{monthName}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {['month', 'week', 'day'].map(v => (
              <button type="button" key={v} onClick={() => setView(v)} style={{
                padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: view === v ? C.primary : C.white, color: view === v ? '#fff' : C.textSec,
              }}>{v === 'month' ? (isRTL ? 'شهري' : 'Month') : v === 'week' ? (isRTL ? 'أسبوعي' : 'Week') : (isRTL ? 'يومي' : 'Day')}</button>
            ))}
          </div>
          <button type="button" onClick={goToday} style={makeBtn('secondary', { fontSize: 12 })}>{t.today}</button>
          <button type="button" onClick={() => { setFormDate(todayStr); setEditingEvent(null); setShowForm(true) }} style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {t.newAppointment}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Calendar Grid */}
        <div style={{ flex: 1 }}>
          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={prevMonth} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, display: 'flex' }}>{isRTL ? Icons.chevronRight(20) : Icons.chevronLeft(20)}</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{monthName}</span>
            <button type="button" onClick={nextMonth} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, display: 'flex' }}>{isRTL ? Icons.chevronLeft(20) : Icons.chevronRight(20)}</button>
          </div>

          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {weekDays.map((d, i) => <div key={i} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.textMuted }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} style={{ minHeight: 80, background: C.bg, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }} />
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayEvents = getEventsForDate(dateStr)
                const isToday = dateStr === todayStr
                return (
                  <div key={i} onClick={() => { setFormDate(dateStr); setShowForm(true); setEditingEvent(null) }}
                    style={{ minHeight: 80, padding: 3, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? C.primary : C.text, width: 24, height: 24, borderRadius: '50%', background: isToday ? C.primaryBg : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 2px 3px' }}>{day}</div>
                    {dayEvents.slice(0, 3).map(ev => {
                      const tc = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting
                      return (
                        <div key={ev.id} onClick={e => { e.stopPropagation(); setEditingEvent(ev); setShowForm(true) }}
                          style={{ fontSize: 9, padding: '2px 4px', marginBottom: 1, borderRadius: 3, background: tc.bg, color: tc.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', borderLeft: `2px solid ${tc.accent}` }}>
                          {ev.time?.slice(0,5)} {ev.title?.split('—')[0]?.slice(0,15)}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && <div style={{ fontSize: 8, color: C.textMuted, padding: '0 4px' }}>+{dayEvents.length - 3}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {/* Type legend */}
          <div style={{ ...card, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(TYPE_COLORS).map(([key, val]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: val.accent }} />
                  <span style={{ color: C.textSec }}>{isRTL ? val.ar : val.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Upcoming events */}
          <div style={{ ...card, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>{t.upcomingEvents || (isRTL ? 'الأحداث القادمة' : 'Upcoming Events')}</h3>
            {upcomingEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 16 }}>{t.noAppointments}</p>
            ) : upcomingEvents.map(ev => {
              const tc = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting
              return (
                <div key={ev.id} onClick={() => { setEditingEvent(ev); setShowForm(true) }} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 4, height: 24, borderRadius: 2, background: tc.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {new Date(ev.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })} &middot; {ev.time}{ev.endTime ? `–${ev.endTime}` : ''}
                        {ev.contact && ` &middot; ${ev.contact}`}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Event Form Modal */}
      {showForm && (
        <EventFormModal t={t} dir={dir} isRTL={isRTL} lang={lang} contacts={contacts}
          event={editingEvent} defaultDate={formDate}
          onSave={(ev) => editingEvent ? updateEvent(ev) : addEvent(ev)}
          onDelete={editingEvent ? () => deleteEvent(editingEvent.id) : null}
          onClose={() => { setShowForm(false); setEditingEvent(null) }} />
      )}
    </div>
  )
}

function EventFormModal({ t, dir, isRTL, lang, contacts, event, defaultDate, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    title: event?.title || '',
    date: event?.date || defaultDate || '',
    time: event?.time || '10:00',
    endTime: event?.endTime || '11:00',
    type: event?.type || 'meeting',
    contact: event?.contact || '',
    location: event?.location || '',
    notes: event?.notes || '',
    reminder: event?.reminder || 'none',
    recurring: event?.recurring || 'none',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.title) return
    onSave({ ...(event || {}), ...form, id: event?.id })
  }

  return (
    <Modal onClose={onClose} dir={dir} width={500}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{event ? (isRTL ? 'تعديل الموعد' : 'Edit Event') : (isRTL ? 'موعد جديد' : 'New Event')}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {onDelete && <button type="button" onClick={onDelete} style={makeBtn('danger', { fontSize: 11, padding: '5px 10px' })}>{Icons.trash(12)} {isRTL ? 'حذف' : 'Delete'}</button>}
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, display: 'flex' }}>{Icons.x(20)}</button>
        </div>
      </div>

      <FormField label={isRTL ? 'العنوان' : 'Title'} dir={dir}><input value={form.title} onChange={e => set('title', e.target.value)} placeholder={isRTL ? 'عنوان الموعد' : 'Event title'} style={inputStyle(dir)} /></FormField>

      {/* Type selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>{isRTL ? 'النوع' : 'Type'}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(TYPE_COLORS).map(([key, val]) => (
            <button type="button" key={key} onClick={() => set('type', key)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: form.type === key ? `2px solid ${val.accent}` : `1px solid ${C.border}`,
              background: form.type === key ? val.bg : C.white, color: form.type === key ? val.text : C.textSec,
            }}>{isRTL ? val.ar : val.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label={isRTL ? 'التاريخ' : 'Date'} dir={dir}><input value={form.date} onChange={e => set('date', e.target.value)} type="date" style={inputStyle(dir)} /></FormField>
        <FormField label={isRTL ? 'جهة الاتصال' : 'Contact'} dir={dir}>
          {contacts ? (
            <select value={form.contact} onChange={e => set('contact', e.target.value)} style={selectStyle(dir)}>
              <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
              {contacts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          ) : <input value={form.contact} onChange={e => set('contact', e.target.value)} style={inputStyle(dir)} />}
        </FormField>
        <FormField label={isRTL ? 'وقت البداية' : 'Start Time'} dir={dir}><input value={form.time} onChange={e => set('time', e.target.value)} type="time" style={inputStyle(dir)} /></FormField>
        <FormField label={isRTL ? 'وقت الانتهاء' : 'End Time'} dir={dir}><input value={form.endTime} onChange={e => set('endTime', e.target.value)} type="time" style={inputStyle(dir)} /></FormField>
        <FormField label={isRTL ? 'الموقع' : 'Location'} dir={dir}><input value={form.location} onChange={e => set('location', e.target.value)} placeholder={isRTL ? 'مثال: مكتب الشركة' : 'e.g. Office, Zoom'} style={inputStyle(dir)} /></FormField>
        <FormField label={isRTL ? 'التذكير' : 'Reminder'} dir={dir}>
          <select value={form.reminder} onChange={e => set('reminder', e.target.value)} style={selectStyle(dir)}>
            {REMINDERS.map(r => <option key={r.id} value={r.id}>{isRTL ? r.ar : r.en}</option>)}
          </select>
        </FormField>
      </div>

      <FormField label={isRTL ? 'التكرار' : 'Recurring'} dir={dir}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'none', en: 'No repeat', ar: 'بدون تكرار' }, { id: 'daily', en: 'Daily', ar: 'يومي' }, { id: 'weekly', en: 'Weekly', ar: 'أسبوعي' }, { id: 'monthly', en: 'Monthly', ar: 'شهري' }].map(r => (
            <button type="button" key={r.id} onClick={() => set('recurring', r.id)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: form.recurring === r.id ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: form.recurring === r.id ? C.primaryBg : C.white, color: form.recurring === r.id ? C.primary : C.textSec,
            }}>{isRTL ? r.ar : r.en}</button>
          ))}
        </div>
      </FormField>

      <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle(dir), resize: 'vertical' }} /></FormField>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={onClose} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
        <button type="button" onClick={handleSave} style={makeBtn('primary')}>{isRTL ? 'حفظ' : 'Save'}</button>
      </div>
    </Modal>
  )
}
