import { useState, useEffect, useRef } from 'react'
import { C } from '../design'
import { stripHtml } from '../lib/sanitize'

export default function CommandPalette({ open, onClose, contacts, deals, tickets, onNavigate, onAction, lang }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
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

  useEffect(() => {
    // Scroll selected item into view
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx])

  if (!open) return null

  const q = stripHtml(query).toLowerCase()

  // Navigation pages
  const pages = [
    { type: 'page', id: 'dashboard', label: isRTL ? 'لوحة التحكم' : 'Dashboard', icon: '📊', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'contacts', label: isRTL ? 'جهات الاتصال' : 'Contacts', icon: '👥', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'pipeline', label: isRTL ? 'خط الأنابيب' : 'Pipeline', icon: '📈', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'inbox', label: isRTL ? 'صندوق الوارد' : 'Inbox', icon: '💬', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'tickets', label: isRTL ? 'التذاكر' : 'Tickets', icon: '🎫', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'calendar', label: isRTL ? 'التقويم' : 'Calendar', icon: '📅', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'automations', label: isRTL ? 'الأتمتة' : 'Automations', icon: '⚡', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'reports', label: isRTL ? 'التقارير' : 'Reports', icon: '📊', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'finance', label: isRTL ? 'المالية' : 'Finance', icon: '💰', category: isRTL ? 'التنقل' : 'Navigation' },
    { type: 'page', id: 'settings', label: isRTL ? 'الإعدادات' : 'Settings', icon: '⚙️', category: isRTL ? 'التنقل' : 'Navigation' },
  ]

  // Quick actions
  const actions = [
    { type: 'action', id: 'add-contact', label: isRTL ? 'إضافة جهة اتصال' : 'Add Contact', icon: '➕', page: 'contacts', category: isRTL ? 'إجراءات' : 'Actions' },
    { type: 'action', id: 'create-deal', label: isRTL ? 'إنشاء صفقة' : 'Create Deal', icon: '💰', page: 'pipeline', category: isRTL ? 'إجراءات' : 'Actions' },
    { type: 'action', id: 'new-ticket', label: isRTL ? 'تذكرة جديدة' : 'New Ticket', icon: '🎫', page: 'tickets', category: isRTL ? 'إجراءات' : 'Actions' },
    { type: 'action', id: 'new-event', label: isRTL ? 'موعد جديد' : 'New Event', icon: '📅', page: 'calendar', category: isRTL ? 'إجراءات' : 'Actions' },
  ]

  // Search contacts
  const contactResults = (contacts || [])
    .filter(c => q && (c.name.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q)))
    .slice(0, 5)
    .map(c => ({
      type: 'contact', id: c.id, label: c.name, sublabel: [c.company, c.email].filter(Boolean).join(' · '),
      icon: '👤', category: isRTL ? 'جهات الاتصال' : 'Contacts',
    }))

  // Search deals
  const dealResults = (deals || [])
    .filter(d => q && ((d.name || '').toLowerCase().includes(q) || (d.contactName || '').toLowerCase().includes(q)))
    .slice(0, 5)
    .map(d => ({
      type: 'deal', id: d.id, label: d.name, sublabel: `${d.contactName || ''} · $${(d.value||0).toLocaleString()} · ${d.stage}`,
      icon: '💼', category: isRTL ? 'الصفقات' : 'Deals',
    }))

  // Search tickets
  const ticketResults = (tickets || [])
    .filter(tk => q && (tk.subject?.toLowerCase().includes(q) || tk.ticketId?.toLowerCase().includes(q) || (tk.contactName||'').toLowerCase().includes(q)))
    .slice(0, 5)
    .map(tk => ({
      type: 'ticket', id: tk.id, label: `${tk.ticketId} — ${tk.subject}`, sublabel: `${tk.status} · ${tk.priority}`,
      icon: '🎫', category: isRTL ? 'التذاكر' : 'Tickets',
    }))

  // Combine results
  const allResults = q
    ? [
        ...pages.filter(p => p.label.toLowerCase().includes(q)),
        ...actions.filter(a => a.label.toLowerCase().includes(q)),
        ...contactResults,
        ...dealResults,
        ...ticketResults,
      ]
    : [...pages.slice(0, 6), ...actions]

  const handleSelect = (item) => {
    if (item.type === 'action') {
      if (onAction) onAction(item.id)
      else onNavigate(item.page || item.id)
    } else if (item.type === 'page') {
      onNavigate(item.id)
    } else if (item.type === 'contact') {
      if (onAction) onAction('view-contact', item.id)
      else onNavigate('contacts')
    } else if (item.type === 'deal') {
      if (onAction) onAction('view-deal', item.id)
      else onNavigate('pipeline')
    } else if (item.type === 'ticket') {
      if (onAction) onAction('view-ticket', item.id)
      else onNavigate('tickets')
    }
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && allResults[selectedIdx]) { handleSelect(allResults[selectedIdx]) }
  }

  // Group results by category
  let lastCategory = ''

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 580, maxWidth: '90vw', background: C.white, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.2)', overflow: 'hidden', direction: isRTL ? 'rtl' : 'ltr', animation: 'cmdpal-in .15s ease' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }} onKeyDown={handleKeyDown}
            placeholder={isRTL ? 'ابحث عن جهات اتصال، صفقات، تذاكر، أو انتقل...' : 'Search contacts, deals, tickets, or navigate...'}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: C.text, fontFamily: 'inherit', background: 'transparent', direction: isRTL ? 'rtl' : 'ltr' }} />
          <kbd style={{ padding: '2px 6px', borderRadius: 4, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 400, overflow: 'auto', padding: '4px 0' }}>
          {allResults.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{isRTL ? 'لا توجد نتائج' : 'No results found'}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{isRTL ? 'جرب بحثًا مختلفًا' : 'Try a different search term'}</div>
            </div>
          ) : allResults.map((item, i) => {
            let categoryHeader = null
            if (item.category && item.category !== lastCategory) {
              lastCategory = item.category
              categoryHeader = (
                <div style={{ padding: '8px 18px 4px', fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  {item.category}
                </div>
              )
            }
            return (
              <div key={`${item.type}-${item.id}`}>
                {categoryHeader}
                <button onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
                    border: 'none', background: i === selectedIdx ? C.primaryBg : 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', transition: 'background .05s',
                  }}>
                  <span style={{ fontSize: 16, width: 28, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: i === selectedIdx ? C.primary : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                    {item.sublabel && <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sublabel}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'capitalize', background: C.bg, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{item.type}</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 16, fontSize: 11, color: C.textMuted }}>
          <span>↑↓ {isRTL ? 'تنقل' : 'Navigate'}</span>
          <span>↵ {isRTL ? 'فتح' : 'Open'}</span>
          <span>esc {isRTL ? 'إغلاق' : 'Close'}</span>
          <span style={{ marginInlineStart: 'auto' }}>{allResults.length} {isRTL ? 'نتيجة' : 'results'}</span>
        </div>
      </div>
      <style>{`@keyframes cmdpal-in { from { opacity:0; transform:scale(.97) translateY(-8px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>
    </div>
  )
}
