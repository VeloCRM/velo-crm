/**
 * Velo CRM — GoalsPage (new schema).
 *
 * Goals are persisted in localStorage for now (no `goals` table exists yet).
 * Each goal has a type, target_value, and period (week/month/quarter/year);
 * the current value is computed live from patients / appointments / payments /
 * treatment_plan_items via lib/goals.js.
 *
 * Persistence to a Supabase `goals` table is deferred to a future sprint
 * (needs schema design + RLS + audit) — the per-tenant localStorage shape
 * keeps the UI useful without locking in a half-baked DB shape.
 */

import { useState, useEffect, useMemo } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { GOAL_TYPES, isRevenueGoal, goalCurrency, computeGoalProgress } from '../lib/goals'
import { formatMoney, toMinor } from '../lib/money'
import { fetchMyProfile } from '../lib/profiles'
import { isSupabaseConfigured } from '../lib/supabase'

const LS_KEY = 'velo_goals'
const FONT = 'DM Sans,Inter,sans-serif'

const GOAL_TYPE_DEFS = {
  patients_seen:        { en: 'Patients seen',        ar: 'مرضى تم استقبالهم',     icon: 'users' },
  revenue_usd:          { en: 'Revenue (USD)',        ar: 'الإيرادات (دولار)',       icon: 'dollar' },
  revenue_iqd:          { en: 'Revenue (IQD)',        ar: 'الإيرادات (دينار)',        icon: 'dollar' },
  treatments_completed: { en: 'Treatments completed', ar: 'علاجات مكتملة',           icon: 'check' },
  new_patients:         { en: 'New patients',         ar: 'مرضى جدد',                icon: 'plus' },
}

const PERIODS = [
  { id: 'week',    en: 'This week',    ar: 'هذا الأسبوع' },
  { id: 'month',   en: 'This month',   ar: 'هذا الشهر' },
  { id: 'quarter', en: 'This quarter', ar: 'هذا الربع' },
  { id: 'year',    en: 'This year',    ar: 'هذه السنة' },
]

function periodBounds(period) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'week') {
    // Iraqi week starts Saturday. JS day: 0=Sun..6=Sat → distance to Sat
    const day = start.getDay()
    const distToSat = (day + 1) % 7
    start.setDate(start.getDate() - distToSat)
  } else if (period === 'month') {
    start.setDate(1)
  } else if (period === 'quarter') {
    const q = Math.floor(start.getMonth() / 3)
    start.setMonth(q * 3, 1)
  } else if (period === 'year') {
    start.setMonth(0, 1)
  }
  return { fromIso: start.toISOString(), toIso: now.toISOString() }
}

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] }
}
function saveGoals(goals) {
  localStorage.setItem(LS_KEY, JSON.stringify(goals))
}
function genId() { return 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }

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
    id: '',
    type: 'patients_seen',
    target_value: '',
    period: 'month',
    title: '',
    created_at: new Date().toISOString(),
  }
}

function formatGoalValue(value, type, isRTL) {
  if (isRevenueGoal(type)) return formatMoney(value, goalCurrency(type))
  return Number(value || 0).toLocaleString(isRTL ? 'ar-IQ' : 'en-US')
}

function typeLabel(type, isRTL) {
  const def = GOAL_TYPE_DEFS[type]
  if (!def) return type
  return isRTL ? def.ar : def.en
}


export default function GoalsPage({ t, lang, dir, isRTL, toast }) {
  void t
  void lang
  const [goals, setGoals] = useState(loadGoals)
  const [progress, setProgress] = useState({}) // goal.id → current value
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyGoal)
  const [role, setRole] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchMyProfile().then(p => { if (!cancelled) setRole(p?.role || null) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => { saveGoals(goals) }, [goals])

  // Recompute progress whenever goal list changes. Each goal hits the DB
  // once per period bounds.
  useEffect(() => {
    let cancelled = false
    if (!isSupabaseConfigured()) {
      // No DB — progress stays at 0; user still sees the targets.
      setProgress({})
      return
    }
    const run = async () => {
      const out = {}
      await Promise.all(goals.map(async (g) => {
        const { fromIso, toIso } = periodBounds(g.period)
        try {
          out[g.id] = await computeGoalProgress({ type: g.type, fromIso, toIso })
        } catch (err) {
          console.error('[GoalsPage] progress compute failed:', err)
          out[g.id] = 0
        }
      }))
      if (!cancelled) setProgress(out)
    }
    run()
    return () => { cancelled = true }
  }, [goals])

  const canEdit = role ? role === 'owner' : true

  const activeCount = goals.length
  const completedCount = useMemo(
    () => goals.filter(g => Number(progress[g.id] || 0) >= Number(g.target_value || 0)).length,
    [goals, progress]
  )

  const openAdd = () => {
    setEditing(null)
    setForm(emptyGoal())
    setShowModal(true)
  }
  const openEdit = (g) => {
    setEditing(g.id)
    setForm({ ...g, target_value: g.target_value })
    setShowModal(true)
  }

  const handleSave = () => {
    const targetValue = Number(form.target_value || 0)
    if (!targetValue || targetValue < 1) {
      toast?.(isRTL ? 'القيمة المستهدفة مطلوبة' : 'Target value is required', 'error')
      return
    }
    // Revenue targets entered in display units → convert to amount_minor.
    const stored_target = isRevenueGoal(form.type)
      ? toMinor(targetValue, goalCurrency(form.type))
      : targetValue
    const next = {
      id: editing || genId(),
      type: form.type,
      target_value: stored_target,
      period: form.period,
      title: (form.title || '').trim(),
      created_at: form.created_at || new Date().toISOString(),
    }
    if (editing) setGoals(prev => prev.map(g => g.id === editing ? next : g))
    else setGoals(prev => [...prev, next])
    setShowModal(false)
    toast?.(editing ? (isRTL ? 'تم التحديث' : 'Goal updated') : (isRTL ? 'تمت الإضافة' : 'Goal added'), 'success')
  }

  const handleDelete = (id) => {
    setGoals(prev => prev.filter(g => g.id !== id))
    toast?.(isRTL ? 'تم الحذف' : 'Goal deleted', 'success')
  }

  const upd = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div dir={dir} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: FONT }}>
            {isRTL ? 'الأهداف' : 'Goals'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
            {activeCount} {isRTL ? 'هدف' : (activeCount === 1 ? 'goal' : 'goals')}
            {' · '}
            {completedCount} {isRTL ? 'مكتمل' : 'reached'}
          </p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
            {Icons.plus(14)} {isRTL ? 'هدف جديد' : 'New goal'}
          </button>
        )}
      </div>

      {!canEdit && (
        <div style={{ ...card, padding: 12, marginBottom: 16, fontSize: 12, color: C.textMuted }}>
          {isRTL
            ? 'الأهداف يحددها صاحب العيادة. هذه الصفحة قراءة فقط لدورك.'
            : 'Goals are set by the clinic owner. This view is read-only for your role.'}
        </div>
      )}

      {/* Empty state */}
      {goals.length === 0 ? (
        <div style={{ ...card, padding: 64, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.primaryBg, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            {Icons.trendUp(24)}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px', fontFamily: FONT }}>
            {isRTL ? 'لا توجد أهداف بعد' : 'No goals yet'}
          </h3>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            {isRTL ? 'أنشئ هدفك الأول لتتبع أداء العيادة' : 'Create your first goal to track clinic performance'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {goals.map(goal => {
            const current = Number(progress[goal.id] ?? 0)
            const target = Number(goal.target_value || 0)
            const pct = target > 0 ? (current / target) * 100 : 0
            const period = PERIODS.find(p => p.id === goal.period) || PERIODS[1]
            return (
              <div key={goal.id} style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {typeLabel(goal.type, isRTL)}
                    </span>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => openEdit(goal)} aria-label="Edit"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4, display: 'flex' }}>
                        {Icons.edit(14)}
                      </button>
                      <button onClick={() => handleDelete(goal.id)} aria-label="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4, display: 'flex' }}>
                        {Icons.trash(14)}
                      </button>
                    </div>
                  )}
                </div>

                {goal.title && (
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, fontFamily: FONT }}>{goal.title}</h3>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <ProgressRing pct={pct} size={80} stroke={6} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>
                      {formatGoalValue(current, goal.type, isRTL)}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {isRTL ? 'من' : 'of'} {formatGoalValue(target, goal.type, isRTL)}
                    </div>
                    <div style={{ marginTop: 8, height: 4, background: C.borderLight || C.border, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: Math.min(pct, 100) + '%', background: progressColor(pct), transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: `1px solid ${C.borderLight || C.border}` }}>
                  <span style={{ color: C.textMuted, display: 'flex' }}>{Icons.calendar(13)}</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>
                    {isRTL ? period.ar : period.en}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} dir={dir} width={480}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, fontFamily: FONT }}>
                {editing ? (isRTL ? 'تعديل الهدف' : 'Edit goal') : (isRTL ? 'هدف جديد' : 'New goal')}
              </h2>
              <button onClick={() => setShowModal(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'inline-flex' }}>
                {Icons.x(18)}
              </button>
            </div>

            <FormField label={isRTL ? 'العنوان (اختياري)' : 'Title (optional)'} dir={dir}>
              <input value={form.title} onChange={e => upd('title', e.target.value)} maxLength={120} style={inputStyle(dir)}
                placeholder={isRTL ? 'مثال: رفع المرضى الجدد' : 'e.g. Grow new patients'} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={isRTL ? 'النوع' : 'Type'} dir={dir}>
                <select value={form.type} onChange={e => upd('type', e.target.value)} style={selectStyle(dir)}>
                  {GOAL_TYPES.map(tp => (
                    <option key={tp} value={tp}>{typeLabel(tp, isRTL)}</option>
                  ))}
                </select>
              </FormField>
              <FormField label={isRTL ? 'الفترة' : 'Period'} dir={dir}>
                <select value={form.period} onChange={e => upd('period', e.target.value)} style={selectStyle(dir)}>
                  {PERIODS.map(p => <option key={p.id} value={p.id}>{isRTL ? p.ar : p.en}</option>)}
                </select>
              </FormField>
            </div>

            <FormField label={
              isRevenueGoal(form.type)
                ? (isRTL ? `القيمة المستهدفة (${goalCurrency(form.type)})` : `Target value (${goalCurrency(form.type)})`)
                : (isRTL ? 'القيمة المستهدفة' : 'Target value')
            } dir={dir}>
              <input type="number" min="1" step={isRevenueGoal(form.type) ? '0.01' : '1'}
                value={form.target_value} onChange={e => upd('target_value', e.target.value)}
                style={inputStyle(dir)} placeholder="0" />
            </FormField>

            <div style={{ padding: '10px 14px', borderRadius: 6, background: C.primaryBg, fontSize: 12, color: C.primary, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              {Icons.bolt(13)}
              {isRTL
                ? 'القيمة الحالية تُحسب تلقائيًا من بياناتك'
                : 'Current value is auto-tracked from your clinic data'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowModal(false)} style={makeBtn('secondary')}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSave} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
                {Icons.check(14)}
                {editing ? (isRTL ? 'حفظ' : 'Save') : (isRTL ? 'إنشاء' : 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
