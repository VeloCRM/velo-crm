import { C, makeBtn } from '../design'

const illustrations = {
  contacts: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#EFF6FF" opacity=".5"/>
      <circle cx="60" cy="44" r="16" stroke="#2563EB" strokeWidth="2.5" fill="#EFF6FF"/>
      <path d="M36 88c0-13.25 10.75-24 24-24s24 10.75 24 24" stroke="#2563EB" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <circle cx="88" cy="36" r="8" stroke="#7C3AED" strokeWidth="2" fill="#F5F3FF"/>
      <line x1="88" y1="32" x2="88" y2="40" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/>
      <line x1="84" y1="36" x2="92" y2="36" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  deals: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#F0FDF4" opacity=".5"/>
      <rect x="24" y="50" width="18" height="36" rx="3" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2"/>
      <rect x="51" y="38" width="18" height="48" rx="3" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2"/>
      <rect x="78" y="26" width="18" height="60" rx="3" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2"/>
      <path d="M24 44l24-12 24-8 24-4" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4"/>
    </svg>
  ),
  inbox: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#EFF6FF" opacity=".5"/>
      <rect x="28" y="36" width="64" height="48" rx="6" stroke="#2563EB" strokeWidth="2.5" fill="#EFF6FF"/>
      <path d="M28 42l32 22 32-22" stroke="#2563EB" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  tickets: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#F5F3FF" opacity=".5"/>
      <rect x="30" y="30" width="60" height="60" rx="8" stroke="#7C3AED" strokeWidth="2.5" fill="#F5F3FF"/>
      <path d="M30 55h60" stroke="#7C3AED" strokeWidth="2" strokeDasharray="4 3"/>
      <circle cx="45" cy="43" r="3" fill="#7C3AED"/>
      <line x1="54" y1="43" x2="80" y2="43" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="45" cy="70" r="3" fill="#7C3AED" opacity=".5"/>
      <line x1="54" y1="70" x2="75" y2="70" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
    </svg>
  ),
  calendar: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#EFF6FF" opacity=".5"/>
      <rect x="26" y="32" width="68" height="56" rx="8" stroke="#2563EB" strokeWidth="2.5" fill="#EFF6FF"/>
      <line x1="26" y1="50" x2="94" y2="50" stroke="#2563EB" strokeWidth="2"/>
      <line x1="44" y1="28" x2="44" y2="38" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="76" y1="28" x2="76" y2="38" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="36" y="58" width="12" height="10" rx="2" fill="#2563EB" opacity=".2"/>
      <rect x="54" y="58" width="12" height="10" rx="2" fill="#2563EB" opacity=".2"/>
      <rect x="72" y="58" width="12" height="10" rx="2" fill="#2563EB" opacity=".2"/>
      <rect x="36" y="72" width="12" height="10" rx="2" fill="#2563EB" opacity=".2"/>
      <rect x="54" y="72" width="12" height="10" rx="2" fill="#2563EB" opacity=".15"/>
    </svg>
  ),
  pipeline: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#F0FDF4" opacity=".5"/>
      <rect x="16" y="34" width="22" height="52" rx="4" stroke="#16A34A" strokeWidth="2" fill="#F0FDF4"/>
      <rect x="44" y="42" width="22" height="44" rx="4" stroke="#2563EB" strokeWidth="2" fill="#EFF6FF"/>
      <rect x="72" y="50" width="22" height="36" rx="4" stroke="#7C3AED" strokeWidth="2" fill="#F5F3FF"/>
      <path d="M38 55h6M66 60h6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3"/>
    </svg>
  ),
  automations: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#FFFBEB" opacity=".5"/>
      <path d="M65 28L50 60h20L55 92" stroke="#D97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  reports: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#EFF6FF" opacity=".5"/>
      <circle cx="60" cy="60" r="28" stroke="#2563EB" strokeWidth="2.5" fill="none"/>
      <path d="M60 60L60 32" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M60 60L82 72" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M60 32A28 28 0 0 1 82 72" fill="#2563EB" opacity=".15"/>
    </svg>
  ),
  general: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#F9FAFB" opacity=".7"/>
      <rect x="36" y="32" width="48" height="56" rx="6" stroke="#6B7280" strokeWidth="2" fill="#F9FAFB"/>
      <line x1="46" y1="48" x2="74" y2="48" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"/>
      <line x1="46" y1="58" x2="68" y2="58" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
      <line x1="46" y1="68" x2="62" y2="68" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" opacity=".4"/>
    </svg>
  ),
}

export default function EmptyState({ type = 'general', title, message, actionLabel, onAction, dir }) {
  const isRTL = dir === 'rtl'
  const svg = illustrations[type] || illustrations.general

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
      direction: isRTL ? 'rtl' : 'ltr',
    }}>
      <div style={{ marginBottom: 20, opacity: 0.9 }}>{svg}</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px', maxWidth: 340, lineHeight: 1.6 }}>{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '0 20px', height: 36, borderRadius: 6, border: 'none',
          background: C.primary, color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
