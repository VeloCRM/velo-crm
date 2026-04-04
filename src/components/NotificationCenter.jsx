import { useState } from 'react'
import { C, makeBtn } from '../design'

const SAMPLE_NOTIFS = [
  { id: 'n1', type: 'deal', title: 'Deal won!', body: 'Cloud Strategies Analytics Module ($9,600)', time: '2 hours ago', read: false },
  { id: 'n2', type: 'contact', title: 'New contact added', body: 'David Park from Kore Innovate', time: '5 hours ago', read: false },
  { id: 'n3', type: 'ticket', title: 'Ticket #VLO-001 updated', body: 'SSO integration — status changed to In Progress', time: '6 hours ago', read: false },
  { id: 'n4', type: 'message', title: 'New message', body: 'Sarah Mitchell: Can we schedule a call?', time: 'Yesterday', read: true },
  { id: 'n5', type: 'deal', title: 'Deal stage changed', body: 'Nexa Corp Renewal moved to Negotiation', time: 'Yesterday', read: true },
  { id: 'n6', type: 'system', title: 'Weekly digest ready', body: 'Your weekly CRM summary is available', time: '2 days ago', read: true },
]

const TYPE_ICONS = {
  deal: { icon: '💰', bg: '#DAFBE1', color: '#1A7F37' },
  contact: { icon: '👤', bg: '#DDF4FF', color: '#0969DA' },
  ticket: { icon: '🎫', bg: '#FBEFFF', color: '#8250DF' },
  message: { icon: '💬', bg: '#DDF4FF', color: '#0969DA' },
  system: { icon: '⚙️', bg: '#F6F8FA', color: '#57606A' },
}

export default function NotificationCenter({ open, onClose, lang }) {
  const [notifs, setNotifs] = useState(SAMPLE_NOTIFS)
  const isRTL = lang === 'ar'
  const unreadCount = notifs.filter(n => !n.read).length

  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  const markRead = (id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const removeNotif = (id) => setNotifs(prev => prev.filter(n => n.id !== id))

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1500 }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 60, [isRTL ? 'left' : 'right']: 80, width: 380,
          background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,.15)', maxHeight: 'calc(100vh - 80px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          direction: isRTL ? 'rtl' : 'ltr',
        }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
              {isRTL ? 'الإشعارات' : 'Notifications'}
            </h3>
            {unreadCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: C.danger, color: '#fff' }}>{unreadCount}</span>}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ border: 'none', background: 'transparent', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {isRTL ? 'قراءة الكل' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {notifs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              {isRTL ? 'لا توجد إشعارات' : 'No notifications'}
            </div>
          ) : notifs.map(n => {
            const meta = TYPE_ICONS[n.type] || TYPE_ICONS.system
            return (
              <div key={n.id} onClick={() => markRead(n.id)}
                style={{
                  padding: '14px 18px', display: 'flex', gap: 12, borderBottom: `1px solid ${C.border}`,
                  background: n.read ? 'transparent' : `${C.primary}04`, cursor: 'pointer', transition: 'background .1s',
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: C.text }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{n.time}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />}
                  <button onClick={e => { e.stopPropagation(); removeNotif(n.id) }}
                    style={{ border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 14, padding: 2, lineHeight: 1 }}>
                    &times;
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
