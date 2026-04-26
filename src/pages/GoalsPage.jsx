import { useState, useEffect } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

const LS_KEY = 'velo_goals'
const FONT = 'DM Sans,Inter,sans-serif'

const CATEGORIES = [
  { id: 'revenue',  label: 'Revenue',  labelAr: 'الإيرادات' },
  { id: 'contacts', label: 'Contacts', labelAr: 'جهات الاتصال' },
  { id: 'deals',    label: 'Deals Won', labelAr: 'الصفقات المكتسبة' },
  { id: 'tasks',    label: 'Tasks',    labelAr: 'المهام' },
  { id: 'custom',   label: 'Custom',   labelAr: 'مخصص' },
]

const CAT_ICONS = {
  revenue:  Icons.dollar,
  contacts: Icons.users,
  deals:    Icons.trendUp,
  tasks:    Icons.check,
  custom:   Icons.bolt,
}

const CAT_COLORS = {
  revenue:  { bg: C.successBg, color: C.success },
  contacts: { bg: C.primaryBg, color: C.primary },
  deals:    { bg: C.purpleBg,  color: C.purple },
  tasks:    { bg: C.warningBg, color: C.warning },
  custom:   { bg: 'rgba(255,255,255,0.04)', color: C.textSec },
}

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] }
  catch { return [] }
}

function saveGoals(goals) {
  localStorage.setItem(LS_KEY, JSON.stringify(goals))
}

function resolveStatus(goal) {
  if (goal.currentValue >= goal.targetValue) return 'completed'
  if (new Date(goal.deadline) < new Date() && goal.currentValue < goal.targetValue) return 'missed'
  return 'active'
}

function progressColor(pct) {
  if (pct >= 100) return C.success
  if (pct >= 50)  return C.primary
  if (pct >= 25)  return C.warning
  return C.danger
}

function ProgressRing({ pct, size = 80, stroke = 6 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 100)
  const offset = circ - (clamped / 100) * circ
  const color = progressColor(clamped)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: size * 0.22, fontWeight: 700, fill: color, fontFamily: FONT }}>
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

function emptyGoal() {
  return {
    id: '', title: '', description: '', category: 'revenue',
    targetValue: '', currentValue: 0, unit: '$',
    deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    status: 'active', createdAt: new Date().toISOString(),
  }
}

export default function GoalsPage({ t, lang, dir, isRTL, contacts, deals, toast }) {
  const [goals, setGoals] = useState(loadGoals)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyGoal)

  // Persist
  useEffect(() => { saveGoals(goals) }, [goals])

  // Auto-track + status resolve
  const resolvedGoals = goals.map(g => {
    let cv = g.currentValue
    if (g.category === 'revenue') {
      cv = (deals || []).filter(d => d.stage === 'won').reduce((s, d) => s + (d.value || 0), 0)
    } else if (g.category === 'contacts') {
      cv = (contacts || []).length
    } else if (g.category === 'deals') {
      cv = (deals || []).filter(d => d.stage === 'won').length
    }
    const updated = { ...g, currentValue: cv }
    updated.status = resolveStatus(updated)
    return updated
  })

  const activeCount = resolvedGoals.filter(g => g.status === 'active').length
  const completedCount = resolvedGoals.filter(g => g.status === 'completed').length

  const openAdd = () => {
    setEditing(null)
    setForm(emptyGoal())
    setShowModal(true)
  }

  const openEdit = (goal) => {
    setEditing(goal.id)
    setForm({ ...goal, targetValue: goal.targetValue, deadline: goal.deadline?.slice(0, 10) || '' })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.title.trim() || !form.targetValue) {
      toast?.(lang === 'ar' ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields')
      return
    }
    if (editing) {
      setGoals(prev => prev.map(g => g.id === editing ? { ...form, targetValue: Number(form.targetValue), currentValue: Number(form.currentValue) } : g))
    } else {
      const newGoal = { ...form, id: 'goal_' + Date.now(), targetValue: Number(form.targetValue), currentValue: Number(form.currentValue), createdAt: new Date().toISOString() }
      setGoals(prev => [...prev, newGoal])
    }
    setShowModal(false)
    toast?.(editing ? (lang === 'ar' ? 'تم تحديث الهدف' : 'Goal updated') : (lang === 'ar' ? 'تمت إضافة الهدف' : 'Goal added'))
  }

  const handleDelete = (id) => {
    setGoals(prev => prev.filter(g => g.id !== id))
    toast?.(lang === 'ar' ? 'تم حذف الهدف' : 'Goal deleted')
  }

  const upd = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const statusBadge = (status) => {
    const map = {
      active:    { bg: C.primaryBg,  color: C.primary, label: lang === 'ar' ? 'نشط' : 'Active' },
      completed: { bg: C.successBg,  color: C.success, label: lang === 'ar' ? 'مكتمل' : 'Completed' },
      missed:    { bg: C.dangerBg,   color: C.danger,  label: lang === 'ar' ? 'فائت' : 'Missed' },
    }
    const s = map[status] || map.active
    return (
      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    )
  }

  const formatDeadline = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return d }
  }

  return (
    <div style={{ direction: dir }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: FONT }}>
            {lang === 'ar' ? 'الأهداف' : 'Goals'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
            {activeCount} {lang === 'ar' ? 'نشط' : 'active'} &middot; {completedCount} {lang === 'ar' ? 'مكتمل' : 'completed'}
          </p>
        </div>
        <button onClick={openAdd} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
          {Icons.plus(14)} {lang === 'ar' ? 'هدف جديد' : 'New Goal'}
        </button>
      </div>

      {/* Empty state */}
      {resolvedGoals.length === 0 && (
        <div style={{ ...card, padding: 64, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.primaryBg, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            {Icons.trendUp(24)}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px', fontFamily: FONT }}>
            {lang === 'ar' ? 'لا توجد أهداف بعد' : 'No goals yet'}
          </h3>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            {lang === 'ar' ? 'أنشئ هدفك الأول لتتبع التقدم' : 'Create your first goal to start tracking progress'}
          </p>
        </div>
      )}

      {/* Goals Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {resolvedGoals.map(goal => {
          const pct = goal.targetValue > 0 ? (goal.currentValue / goal.targetValue) * 100 : 0
          const catCol = CAT_COLORS[goal.category] || CAT_COLORS.custom
          const catIcon = CAT_ICONS[goal.category] || CAT_ICONS.custom
          return (
            <div key={goal.id} style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow 150ms ease', cursor: 'default' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'}>

              {/* Top row: category + status + actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: catCol.bg, color: catCol.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {catIcon(14)}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: catCol.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {CATEGORIES.find(c => c.id === goal.category)?.[lang === 'ar' ? 'labelAr' : 'label'] || goal.category}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {statusBadge(goal.status)}
                  <button onClick={() => openEdit(goal)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4, display: 'flex' }}
                    onMouseEnter={e => e.currentTarget.style.color = C.primary}
                    onMouseLeave={e => e.currentTarget.style.color = C.textMuted}>
                    {Icons.edit(14)}
                  </button>
                  <button onClick={() => handleDelete(goal.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4, display: 'flex' }}
                    onMouseEnter={e => e.currentTarget.style.color = C.danger}
                    onMouseLeave={e => e.currentTarget.style.color = C.textMuted}>
                    {Icons.trash(14)}
                  </button>
                </div>
              </div>

              {/* Title + description */}
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, fontFamily: FONT }}>{goal.title}</h3>
                {goal.description && (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {goal.description}
                  </p>
                )}
              </div>

              {/* Progress ring + values */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                <ProgressRing pct={pct} size={80} stroke={6} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: FONT }}>
                    {goal.unit === '$' ? '$' : ''}{goal.currentValue.toLocaleString()}{goal.unit && goal.unit !== '$' ? ' ' + goal.unit : ''}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {lang === 'ar' ? 'من' : 'of'} {goal.unit === '$' ? '$' : ''}{goal.targetValue.toLocaleString()}{goal.unit && goal.unit !== '$' ? ' ' + goal.unit : ''}
                  </div>
                  <div style={{ marginTop: 8, height: 4, background: C.borderLight, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: Math.min(pct, 100) + '%', background: progressColor(pct), transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              </div>

              {/* Deadline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: `1px solid ${C.borderLight}` }}>
                <span style={{ color: C.textMuted }}>{Icons.calendar(13)}</span>
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  {lang === 'ar' ? 'الموعد النهائي:' : 'Deadline:'} {formatDeadline(goal.deadline)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} dir={dir} width={480}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, fontFamily: FONT }}>
                {editing
                  ? (lang === 'ar' ? 'تعديل الهدف' : 'Edit Goal')
                  : (lang === 'ar' ? 'هدف جديد' : 'New Goal')}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
                {Icons.x(18)}
              </button>
            </div>

            <FormField label={lang === 'ar' ? 'العنوان' : 'Title'} dir={dir}>
              <input value={form.title} onChange={e => upd('title', e.target.value)} style={inputStyle(dir)}
                placeholder={lang === 'ar' ? 'مثال: زيادة المبيعات' : 'e.g. Increase sales revenue'} />
            </FormField>

            <FormField label={lang === 'ar' ? 'الوصف' : 'Description'} dir={dir}>
              <input value={form.description} onChange={e => upd('description', e.target.value)} style={inputStyle(dir)}
                placeholder={lang === 'ar' ? 'وصف اختياري' : 'Optional description'} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={lang === 'ar' ? 'الفئة' : 'Category'} dir={dir}>
                <select value={form.category} onChange={e => upd('category', e.target.value)} style={selectStyle(dir)}>
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{lang === 'ar' ? c.labelAr : c.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label={lang === 'ar' ? 'الوحدة' : 'Unit'} dir={dir}>
                <input value={form.unit} onChange={e => upd('unit', e.target.value)} style={inputStyle(dir)}
                  placeholder="$, contacts, deals..." />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: form.category === 'custom' ? '1fr 1fr' : '1fr', gap: 12 }}>
              <FormField label={lang === 'ar' ? 'القيمة المستهدفة' : 'Target Value'} dir={dir}>
                <input type="number" value={form.targetValue} onChange={e => upd('targetValue', e.target.value)} style={inputStyle(dir)}
                  placeholder="0" min="0" />
              </FormField>

              {form.category === 'custom' && (
                <FormField label={lang === 'ar' ? 'القيمة الحالية' : 'Current Value'} dir={dir}>
                  <input type="number" value={form.currentValue} onChange={e => upd('currentValue', e.target.value)} style={inputStyle(dir)}
                    placeholder="0" min="0" />
                </FormField>
              )}
            </div>

            <FormField label={lang === 'ar' ? 'الموعد النهائي' : 'Deadline'} dir={dir}>
              <input type="date" value={form.deadline} onChange={e => upd('deadline', e.target.value)} style={inputStyle(dir)} />
            </FormField>

            {form.category !== 'custom' && (
              <div style={{ padding: '10px 14px', borderRadius: 6, background: C.primaryBg, fontSize: 12, color: C.primary, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                {Icons.bolt(13)}
                {lang === 'ar'
                  ? 'القيمة الحالية يتم تتبعها تلقائيًا من بياناتك'
                  : 'Current value is auto-tracked from your data'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowModal(false)} style={makeBtn('secondary')}>
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSave} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
                {Icons.check(14)}
                {editing ? (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (lang === 'ar' ? 'إنشاء الهدف' : 'Create Goal')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
