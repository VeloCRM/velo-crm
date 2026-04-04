import { useState, useEffect, useRef } from 'react'
import { C } from '../design'

export default function CommandPalette({ open, onClose, contacts, deals, tickets, onNavigate, lang }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const isRTL = lang === 'ar'

  useEffect(() => {
    if (open) { setQuery(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); onClose('toggle') }
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const q = query.toLowerCase()

  const pages = [
    { type: 'page', id: 'dashboard', label: isRTL ? 'لوحة التحكم' : 'Dashboard', icon: '📊' },
    { type: 'page', id: 'contacts', label: isRTL ? 'جهات الاتصال' : 'Contacts', icon: '👥' },
    { type: 'page', id: 'pipeline', label: isRTL ? 'خط الأنابيب' : 'Pipeline', icon: '📈' },
    { type: 'page', id: 'inbox', label: isRTL ? 'صندوق الوارد' : 'Inbox', icon: '💬' },
    { type: 'page', id: 'tickets', label: isRTL ? 'التذاكر' : 'Tickets', icon: '🎫' },
    { type: 'page', id: 'calendar', label: isRTL ? 'التقويم' : 'Calendar', icon: '📅' },
    { type: 'page', id: 'reports', label: isRTL ? 'التقارير' : 'Reports', icon: '📊' },
    { type: 'page', id: 'settings', label: isRTL ? 'الإعدادات' : 'Settings', icon: '⚙️' },
  ]

  const actions = [
    { type: 'action', id: 'add-contact', label: isRTL ? 'إضافة جهة اتصال' : 'Add Contact', icon: '➕', page: 'contacts' },
    { type: 'action', id: 'create-deal', label: isRTL ? 'إنشاء صفقة' : 'Create Deal', icon: '💰', page: 'pipeline' },
    { type: 'action', id: 'new-ticket', label: isRTL ? 'تذكرة جديدة' : 'New Ticket', icon: '🎫', page: 'tickets' },
  ]

  const contactResults = (contacts || []).filter(c => q && c.name.toLowerCase().includes(q)).slice(0, 5).map(c => ({
    type: 'contact', id: c.id, label: c.name, sublabel: c.company, icon: '👤',
  }))

  const dealResults = (deals || []).filter(d => q && (d.name || '').toLowerCase().includes(q)).slice(0, 3).map(d => ({
    type: 'deal', id: d.id, label: d.name, sublabel: `$${d.value?.toLocaleString()}`, icon: '💼',
  }))

  const ticketResults = (tickets || []).filter(tk => q && (tk.subject?.toLowerCase().includes(q) || tk.ticketId?.toLowerCase().includes(q))).slice(0, 3).map(tk => ({
    type: 'ticket', id: tk.id, label: `#${tk.ticketId} — ${tk.subject}`, icon: '🎫',
  }))

  const allResults = q
    ? [...pages.filter(p => p.label.toLowerCase().includes(q)), ...actions.filter(a => a.label.toLowerCase().includes(q)), ...contactResults, ...dealResults, ...ticketResults]
    : [...pages, ...actions]

  const handleSelect = (item) => {
    if (item.type === 'page' || item.type === 'action') onNavigate(item.page || item.id)
    else if (item.type === 'contact') onNavigate('contacts')
    else if (item.type === 'deal') onNavigate('pipeline')
    else if (item.type === 'ticket') onNavigate('tickets')
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && allResults[selectedIdx]) { handleSelect(allResults[selectedIdx]) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '90vw', background: C.white, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.2)', overflow: 'hidden', direction: isRTL ? 'rtl' : 'ltr' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }} onKeyDown={handleKeyDown}
            placeholder={isRTL ? 'ابحث عن أي شيء...' : 'Search anything...'}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: C.text, fontFamily: 'inherit', background: 'transparent', direction: isRTL ? 'rtl' : 'ltr' }} />
          <kbd style={{ padding: '2px 6px', borderRadius: 4, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflow: 'auto', padding: '6px 0' }}>
          {allResults.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>{isRTL ? 'لا توجد نتائج' : 'No results found'}</div>
          ) : allResults.map((item, i) => (
            <button key={`${item.type}-${item.id}`} onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
                border: 'none', background: i === selectedIdx ? C.primaryBg : 'transparent',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', transition: 'background .05s',
              }}>
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: i === selectedIdx ? C.primary : C.text }}>{item.label}</div>
                {item.sublabel && <div style={{ fontSize: 11, color: C.textMuted }}>{item.sublabel}</div>}
              </div>
              <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'capitalize', background: C.bg, padding: '2px 6px', borderRadius: 4 }}>{item.type}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 16, fontSize: 11, color: C.textMuted }}>
          <span>↑↓ {isRTL ? 'تنقل' : 'Navigate'}</span>
          <span>↵ {isRTL ? 'فتح' : 'Open'}</span>
          <span>esc {isRTL ? 'إغلاق' : 'Close'}</span>
        </div>
      </div>
    </div>
  )
}
