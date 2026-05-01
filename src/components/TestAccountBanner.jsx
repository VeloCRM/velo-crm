import { useState } from 'react'

const SESSION_DISMISS_KEY = 'velo_test_banner_dismissed_org'

function readDismissedOrgId() {
  try { return sessionStorage.getItem(SESSION_DISMISS_KEY) || null }
  catch { return null }
}

/**
 * Sticky top banner shown when the current org is a test account.
 *
 * - Renders only when org.status === 'test'.
 * - Dismissible per session (sessionStorage); auto-reappears when the user
 *   switches to a different org or starts a new browser session.
 *
 * Props:
 *   org   - the current org row (or null)
 *   lang  - 'en' | 'ar'
 *   onContactOperator - optional click handler for the inline contact CTA
 */
export default function TestAccountBanner({ org, lang = 'en', onContactOperator }) {
  const [dismissedOrgId, setDismissedOrgId] = useState(readDismissedOrgId)

  if (!org || org.status !== 'test') return null
  // Compute dismissal purely from state — when org.id changes, this naturally
  // re-evaluates without needing an effect.
  if (org.id && dismissedOrgId === org.id) return null

  const isRTL = lang === 'ar'
  const message = isRTL
    ? 'حساب تجريبي — تُحذف البيانات بعد 14 يوماً. تواصل مع المشغل للحصول على حساب عيادة حقيقي.'
    : 'Test account — data resets after 14 days. Contact the operator for a real clinic account.'
  const dismissLabel = isRTL ? 'إخفاء' : 'Dismiss'
  const contactLabel = isRTL ? 'تواصل' : 'Contact'

  const handleDismiss = () => {
    if (!org.id) return
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, org.id) } catch { /* no-op */ }
    setDismissedOrgId(org.id)
  }

  return (
    <div
      role="status"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        background: 'linear-gradient(135deg, #D29922, #E16F24)',
        color: '#fff',
        padding: '0 16px',
        height: 38,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 1px 0 rgba(0,0,0,0.15)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14 }}>⚠</span>
      <span style={{ flex: 1, lineHeight: 1.2 }}>{message}</span>
      {onContactOperator && (
        <button
          type="button"
          onClick={onContactOperator}
          style={{
            border: '1px solid rgba(255,255,255,0.45)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          {contactLabel}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={dismissLabel}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '4px 8px',
          fontFamily: 'inherit',
          opacity: 0.85,
        }}
      >
        ×
      </button>
    </div>
  )
}
