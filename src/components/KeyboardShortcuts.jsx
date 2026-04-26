import { C } from '../design'

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], desc: 'Open command palette', ar: 'فتح لوحة الأوامر' },
  { keys: ['N'], desc: 'New item (contact, deal, etc.)', ar: 'عنصر جديد' },
  { keys: ['Esc'], desc: 'Close modal / panel', ar: 'إغلاق النافذة' },
  { keys: ['?'], desc: 'Show keyboard shortcuts', ar: 'عرض اختصارات لوحة المفاتيح' },
  { keys: ['G', 'D'], desc: 'Go to Dashboard', ar: 'الانتقال للوحة التحكم' },
  { keys: ['G', 'C'], desc: 'Go to Contacts', ar: 'الانتقال لجهات الاتصال' },
  { keys: ['G', 'P'], desc: 'Go to Pipeline', ar: 'الانتقال لخط الأنابيب' },
  { keys: ['G', 'I'], desc: 'Go to Inbox', ar: 'الانتقال للبريد الوارد' },
  { keys: ['G', 'T'], desc: 'Go to Tickets', ar: 'الانتقال للتذاكر' },
  { keys: ['G', 'A'], desc: 'Go to Calendar', ar: 'الانتقال للتقويم' },
]

export default function KeyboardShortcutsHelp({ open, onClose, lang }) {
  if (!open) return null
  const isRTL = lang === 'ar'

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2500 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '92vw', direction: isRTL ? 'rtl' : 'ltr' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
            {isRTL ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SHORTCUTS.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 8,
              background: i % 2 === 0 ? C.bg : 'transparent',
            }}>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{isRTL ? s.ar : s.desc}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.keys.map((k, j) => (
                  <span key={j}>
                    <kbd style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 6,
                      background: C.white, border: `1px solid ${C.border}`,
                      fontSize: 11, fontWeight: 600, color: C.textSec,
                      fontFamily: "'Inter', sans-serif",
                      boxShadow: '0 1px 2px rgba(0,0,0,.06)',
                      minWidth: 24, textAlign: 'center',
                    }}>{k}</kbd>
                    {j < s.keys.length - 1 && <span style={{ fontSize: 10, color: C.textMuted, margin: '0 2px' }}>+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,255,178,0.08)', border: '1px solid rgba(0,255,178,0.12)', fontSize: 12, color: '#00FFB2' }}>
          {isRTL ? 'نصيحة: اضغط ?' : 'Tip: Press ?'} {isRTL ? 'في أي وقت لعرض هذه الاختصارات' : 'anytime to show these shortcuts'}
        </div>
      </div>
    </div>
  )
}
