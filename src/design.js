// Velo CRM — Dark Futuristic Design System
// 8px grid · DM Sans + JetBrains Mono · Cyber-dark palette

export const C = {
  // Sidebar
  sidebar: '#0d1420',
  sidebarBorder: 'rgba(0, 212, 255, 0.08)',
  sidebarHover: 'rgba(0, 212, 255, 0.06)',
  sidebarText: '#475569',
  sidebarActiveText: '#e2e8f0',
  sidebarActive: '#00d4ff',
  sidebarActiveBg: 'rgba(0, 212, 255, 0.08)',

  // Content
  bg: '#080c14',
  white: '#111827',
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.04)',
  text: '#e2e8f0',
  textSec: '#94a3b8',
  textMuted: '#475569',
  textLabel: '#64748b',

  // Brand
  primary: '#00d4ff',
  primaryHov: '#00b8e6',
  primaryBg: 'rgba(0, 212, 255, 0.08)',
  primaryRing: 'rgba(0, 212, 255, 0.15)',

  // Semantic
  success: '#00ff88',
  successBg: 'rgba(0, 255, 136, 0.08)',
  successBorder: 'rgba(0, 255, 136, 0.15)',
  warning: '#f59e0b',
  warningBg: 'rgba(245, 158, 11, 0.08)',
  warningBorder: 'rgba(245, 158, 11, 0.15)',
  warningText: '#f59e0b',
  danger: '#ef4444',
  dangerBg: 'rgba(239, 68, 68, 0.08)',
  dangerBorder: 'rgba(239, 68, 68, 0.15)',
  purple: '#7c3aed',
  purpleBg: 'rgba(124, 58, 237, 0.08)',
  purpleBorder: 'rgba(124, 58, 237, 0.15)',

  // Extra
  darkBg: '#0d1420',
  darkText: '#e2e8f0',
}

// Spacing system (8px grid)
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

export const CAT_COLORS = {
  client:   { bg: 'rgba(0, 212, 255, 0.08)', text: '#00d4ff', accent: '#00d4ff' },
  prospect: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', accent: '#f59e0b' },
  partner:  { bg: 'rgba(0, 255, 136, 0.08)', text: '#00ff88', accent: '#00ff88' },
  supplier: { bg: 'rgba(124, 58, 237, 0.08)', text: '#7c3aed', accent: '#7c3aed' },
  other:    { bg: 'rgba(255,255,255,0.04)', text: '#64748b', accent: '#64748b' },
}

export const STAGE_COLORS = {
  lead:        { bg: 'rgba(255,255,255,0.04)', text: '#64748b', accent: '#64748b' },
  qualified:   { bg: 'rgba(0, 212, 255, 0.08)', text: '#00d4ff', accent: '#00d4ff' },
  proposal:    { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', accent: '#f59e0b' },
  negotiation: { bg: 'rgba(124, 58, 237, 0.08)', text: '#7c3aed', accent: '#7c3aed' },
  won:         { bg: 'rgba(0, 255, 136, 0.08)', text: '#00ff88', accent: '#00ff88' },
  lost:        { bg: 'rgba(239, 68, 68, 0.08)', text: '#ef4444', accent: '#ef4444' },
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
    primary:   { background: 'linear-gradient(135deg, #00d4ff, #0099cc)', color: '#080c14', fontWeight: 600, border: 'none' },
    success:   { background: 'linear-gradient(135deg, #00ff88, #00cc6a)', color: '#080c14', fontWeight: 600, border: 'none' },
    danger:    { background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', border: 'none' },
    secondary: { background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' },
    ghost:     { background: 'transparent', color: '#64748b', border: 'none' },
  }
  return { ...base, ...(variants[variant] || variants.primary), ...extra }
}

export const card = {
  background: '#111827',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow: '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
}
