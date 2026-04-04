// Velo CRM — Enterprise Design System
// 8px grid · Inter + DM Sans · Refined enterprise palette

export const C = {
  // Sidebar
  sidebar: '#111827',
  sidebarBorder: 'rgba(255,255,255,0.08)',
  sidebarHover: 'rgba(255,255,255,0.06)',
  sidebarText: '#6B7280',
  sidebarActiveText: '#FFFFFF',
  sidebarActive: '#3B82F6',
  sidebarActiveBg: 'rgba(255,255,255,0.10)',

  // Content
  bg: '#F9FAFB',
  white: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  text: '#111827',
  textSec: '#374151',
  textMuted: '#9CA3AF',
  textLabel: '#6B7280',

  // Brand
  primary: '#2563EB',
  primaryHov: '#1D4ED8',
  primaryBg: '#EFF6FF',
  primaryRing: 'rgba(37,99,235,0.1)',

  // Semantic
  success: '#16A34A',
  successBg: '#F0FDF4',
  successBorder: '#BBF7D0',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningText: '#92400E',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
  purpleBorder: '#DDD6FE',

  // Extra
  darkBg: '#1F2937',
  darkText: '#F9FAFB',
}

// Spacing system (8px grid)
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

export const CAT_COLORS = {
  client:   { bg: '#EFF6FF', text: '#1D4ED8', accent: '#2563EB' },
  prospect: { bg: '#FFFBEB', text: '#92400E', accent: '#D97706' },
  partner:  { bg: '#F0FDF4', text: '#166534', accent: '#16A34A' },
  supplier: { bg: '#F5F3FF', text: '#5B21B6', accent: '#7C3AED' },
  other:    { bg: '#F9FAFB', text: '#6B7280', accent: '#9CA3AF' },
}

export const STAGE_COLORS = {
  lead:        { bg: '#F9FAFB', text: '#6B7280', accent: '#9CA3AF' },
  qualified:   { bg: '#EFF6FF', text: '#1D4ED8', accent: '#2563EB' },
  proposal:    { bg: '#FFFBEB', text: '#92400E', accent: '#D97706' },
  negotiation: { bg: '#F5F3FF', text: '#5B21B6', accent: '#7C3AED' },
  won:         { bg: '#F0FDF4', text: '#166534', accent: '#16A34A' },
  lost:        { bg: '#FEF2F2', text: '#991B1B', accent: '#DC2626' },
}

export function makeBtn(variant = 'primary', extra = {}) {
  const base = {
    borderRadius: 6,
    padding: '0 16px',
    height: 36,
    fontSize: 14,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    lineHeight: 1,
  }
  const variants = {
    primary:   { background: C.primary, color: '#fff', border: 'none' },
    success:   { background: C.success, color: '#fff', border: 'none' },
    danger:    { background: C.danger,  color: '#fff', border: 'none' },
    secondary: { background: C.white,   color: C.textSec, border: `1px solid #D1D5DB` },
    ghost:     { background: 'transparent', color: C.textLabel, border: 'none' },
  }
  return { ...base, ...(variants[variant] || variants.primary), ...extra }
}

export const card = {
  background: C.white,
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}
