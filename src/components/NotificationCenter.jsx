import { C } from '../design'

const TYPE_ICONS = {
  deal: { icon: '💰', bg: 'rgba(0,255,136,0.1)', color: '#00ff88' },
  contact: { icon: '👤', bg: 'rgba(0,212,255,0.1)', color: '#00d4ff' },
  ticket: { icon: '🎫', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
  payment: { icon: '💳', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  appointment: { icon: '📅', bg: 'rgba(0,212,255,0.1)', color: '#00d4ff' },
  system: { icon: '⚙️', bg: 'rgba(255,255,255,0.04)', color: '#64748b' },
}

export default function NotificationCenter({ open, onClose, notifications, onMarkRead, onMarkAllRead, onDismiss, lang }) {
  const isRTL = lang === 'ar'
  const unreadCount = (notifications || []).filter(n => !n.read).length

  if (!open) return null

  const formatTime = (ts) => {
    if (!ts) return ''
    const diff = Date.now() - new Date(ts).getTime()
    if (isNaN(diff)) return ''
    if (diff < 0) return isRTL ? 'الآن' : 'Just now'
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return isRTL ? 'الآن' : 'Just now'
    if (mins < 60) return isRTL ? `منذ ${mins} دقيقة` : `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return isRTL ? `منذ ${hrs} ساعة` : `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return isRTL ? `منذ ${days} يوم` : `${days}d ago`
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1500 }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 60, [isRTL ? 'left' : 'right']: 80, width: 400,
          background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,.15)', maxHeight: 'calc(100vh - 80px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          direction: isRTL ? 'rtl' : 'ltr',
          animation: 'notif-in .2s ease',
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
            <button onClick={onMarkAllRead} style={{ border: 'none', background: 'transparent', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {isRTL ? 'قراءة الكل' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto', maxHeight: 420 }}>
          {(!notifications || notifications.length === 0) ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {isRTL ? 'لا توجد إشعارات' : 'All caught up!'}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {isRTL ? 'ستظهر الإشعارات هنا' : "Notifications will appear here"}
              </div>
            </div>
          ) : notifications.map(n => {
            const meta = TYPE_ICONS[n.type] || TYPE_ICONS.system
            return (
              <div key={n.id} onClick={() => onMarkRead(n.id)}
                style={{
                  padding: '14px 18px', display: 'flex', gap: 12, borderBottom: `1px solid ${C.border}`,
                  background: n.read ? 'transparent' : `${C.primary}06`, cursor: 'pointer', transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = n.read ? C.bg : `${C.primary}0A`}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : `${C.primary}06`}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: C.text }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{formatTime(n.time)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />}
                  <button onClick={e => { e.stopPropagation(); onDismiss(n.id) }}
                    style={{ border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: 2, lineHeight: 1 }}
                    onMouseEnter={e => e.currentTarget.style.color = C.danger}
                    onMouseLeave={e => e.currentTarget.style.color = C.textMuted}>
                    &times;
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <style>{`@keyframes notif-in { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  )
}
