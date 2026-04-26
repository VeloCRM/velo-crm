import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, Toggle, FormField, inputStyle, selectStyle } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'

const SAMPLE_AUTOMATIONS = [
  { id: 'auto1', name: 'Welcome Message', trigger: 'new_contact', condition: 'All new contacts', action: 'send_whatsapp', actionDetail: 'Send WhatsApp welcome message', enabled: true, runs: 142, lastRun: '2 hours ago' },
  { id: 'auto2', name: 'Follow-up Reminder', trigger: 'inactivity', condition: 'No activity for 7 days', action: 'send_email', actionDetail: 'Send follow-up email reminder', enabled: true, runs: 89, lastRun: 'Yesterday' },
  { id: 'auto3', name: 'VIP Tag Workflow', trigger: 'deal_stage', condition: 'Deal value > $25,000', action: 'assign_tag', actionDetail: 'Tag contact as VIP + notify sales manager', enabled: true, runs: 23, lastRun: '3 days ago' },
  { id: 'auto4', name: 'Ticket Auto-Assign', trigger: 'ticket_created', condition: 'Department = Technical', action: 'assign_member', actionDetail: 'Assign to Ahmed Hassan', enabled: false, runs: 56, lastRun: 'Apr 1' },
  { id: 'auto5', name: 'Deal Stage Notification', trigger: 'deal_stage', condition: 'Stage changes to Won', action: 'send_email', actionDetail: 'Send congratulations email to team', enabled: true, runs: 12, lastRun: 'Apr 2' },
  { id: 'auto6', name: 'Inactive Contact Alert', trigger: 'inactivity', condition: 'No activity for 30 days', action: 'create_ticket', actionDetail: 'Create re-engagement ticket', enabled: false, runs: 8, lastRun: 'Mar 28' },
]

const TRIGGERS = [
  { id: 'new_contact', label: 'New contact created', icon: Icons.users },
  { id: 'deal_stage', label: 'Deal stage changed', icon: Icons.barChart },
  { id: 'ticket_created', label: 'Ticket created', icon: Icons.mail },
  { id: 'inactivity', label: 'Contact inactive for X days', icon: Icons.clock },
]
const ACTIONS = [
  { id: 'send_whatsapp', label: 'Send WhatsApp message' },
  { id: 'send_email', label: 'Send email' },
  { id: 'create_ticket', label: 'Create ticket' },
  { id: 'assign_member', label: 'Assign to team member' },
  { id: 'assign_tag', label: 'Add tag to contact' },
  { id: 'move_stage', label: 'Move deal to stage' },
]

export default function AutomationsPage({ t, lang, dir, isRTL }) {
  const [automations, setAutomations] = useState(isSupabaseConfigured() ? [] : SAMPLE_AUTOMATIONS)
  const [showForm, setShowForm] = useState(false)

  const toggleAuto = (id) => setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a))
  const activeCount = automations.filter(a => a.enabled).length
  const totalRuns = automations.reduce((s, a) => s + a.runs, 0)

  const addAutomation = (auto) => {
    setAutomations(prev => [...prev, { ...auto, id: `auto${Date.now()}`, runs: 0, lastRun: t.neverRun || 'Never' }])
    setShowForm(false)
  }

  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.automations}</h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{activeCount} {t.enabled || 'active'} &middot; {totalRuns} {t.totalRuns || 'total runs'}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {t.newAutomation}</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: lang === 'ar' ? 'الأتمتة النشطة' : 'Active Automations', value: activeCount, color: C.success, bg: C.successBg },
          { label: lang === 'ar' ? 'إجمالي التشغيلات' : 'Total Runs', value: totalRuns, color: C.primary, bg: C.primaryBg },
          { label: lang === 'ar' ? 'آخر تشغيل' : 'Last Triggered', value: automations[0]?.lastRun || '—', color: C.purple, bg: C.purpleBg },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons.zap(20)}</div>
            <div><div style={{ fontSize: 12, color: C.textMuted }}>{s.label}</div><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{s.value}</div></div>
          </div>
        ))}
      </div>

      {/* Automations list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {automations.map(auto => {
          const trigger = TRIGGERS.find(tr => tr.id === auto.trigger)
          const TriggerIcon = trigger?.icon || Icons.zap
          return (
            <div key={auto.id} style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 16, opacity: auto.enabled ? 1 : .6, transition: 'all 150ms ease' }}>
              <div style={{ width: 42, height: 42, borderRadius: 8, background: auto.enabled ? C.primaryBg : C.bg, color: auto.enabled ? C.primary : C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {TriggerIcon(20)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{auto.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textSec }}>
                  <span style={{ padding: '2px 8px', background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>{t.when || 'When'}: {auto.condition}</span>
                  <span style={{ color: C.textMuted }}>→</span>
                  <span style={{ padding: '2px 8px', background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>{t.then || 'Then'}: {auto.actionDetail}</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 56 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{auto.runs}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{t.runs || 'runs'}</div>
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, minWidth: 72 }}>{auto.lastRun}</div>
              <Toggle value={auto.enabled} onChange={() => toggleAuto(auto.id)} />
            </div>
          )
        })}
      </div>

      {showForm && <AutomationFormModal t={t} dir={dir} lang={lang} onSave={addAutomation} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function AutomationFormModal({ t, dir, lang, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', trigger: 'new_contact', condition: '', action: 'send_email', actionDetail: '', enabled: true })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal onClose={onClose} dir={dir} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.newAutomation}</h2>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, transition: 'all 150ms ease' }}>{Icons.x(20)}</button>
      </div>
      <FormField label={t.automationName || 'Name'} dir={dir}><input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle(dir)} /></FormField>
      <FormField label={t.trigger || 'Trigger'} dir={dir}>
        <select value={form.trigger} onChange={e => set('trigger', e.target.value)} style={selectStyle(dir)}>
          {TRIGGERS.map(tr => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
        </select>
      </FormField>
      <FormField label={lang === 'ar' ? 'الشرط' : 'Condition'} dir={dir}><input value={form.condition} onChange={e => set('condition', e.target.value)} placeholder="e.g. All new contacts" style={inputStyle(dir)} /></FormField>
      <FormField label={t.action || 'Action'} dir={dir}>
        <select value={form.action} onChange={e => set('action', e.target.value)} style={selectStyle(dir)}>
          {ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </FormField>
      <FormField label={lang === 'ar' ? 'تفاصيل الإجراء' : 'Action Detail'} dir={dir}><input value={form.actionDetail} onChange={e => set('actionDetail', e.target.value)} style={inputStyle(dir)} /></FormField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onClose} style={makeBtn('secondary')}>{t.cancel}</button>
        <button onClick={() => { if (form.name) onSave(form) }} className="velo-btn-primary" style={makeBtn('primary')}>{t.save}</button>
      </div>
    </Modal>
  )
}
