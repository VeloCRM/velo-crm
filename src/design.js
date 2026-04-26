// Velo CRM — Clinical Luxury Design System
// 8px grid · Syne + DM Sans · Deep dark palette

export const C = {
  // Sidebar
  sidebar: '#0C0E1A',
  sidebarBorder: 'rgba(255,255,255,0.07)',
  sidebarHover: 'rgba(255,255,255,0.04)',
  sidebarText: '#7B7F9E',
  sidebarActiveText: '#00FFB2',
  sidebarActive: '#00FFB2',
  sidebarActiveBg: 'rgba(0,255,178,0.08)',

  // Content
  bg: '#07080E',
  bgSec: '#0C0E1A',
  white: '#101422',
  whiteHover: '#141828',
  border: 'rgba(255,255,255,0.07)',
  borderHover: 'rgba(255,255,255,0.14)',
  borderLight: 'rgba(255,255,255,0.03)',
  text: '#E8EAF5',
  textSec: '#7B7F9E',
  textMuted: '#3A3D55',
  textLabel: '#7B7F9E',

  // Brand
  primary: '#00FFB2',
  primaryHov: '#00E8A0',
  primaryBg: 'rgba(0,255,178,0.09)',
  primaryBorder: 'rgba(0,255,178,0.25)',
  primaryRing: 'rgba(0,255,178,0.3)',

  // Accents
  blue: '#4DA6FF',
  blueBg: 'rgba(77,166,255,0.09)',
  blueBorder: 'rgba(77,166,255,0.25)',
  amber: '#FFB347',
  amberBg: 'rgba(255,179,71,0.09)',
  amberBorder: 'rgba(255,179,71,0.25)',
  coral: '#FF6B6B',
  coralBg: 'rgba(255,107,107,0.09)',

  // Semantic (aliases of the accent palette)
  success: '#00FFB2',
  successBg: 'rgba(0,255,178,0.09)',
  successBorder: 'rgba(0,255,178,0.2)',
  warning: '#FFB347',
  warningBg: 'rgba(255,179,71,0.09)',
  warningBorder: 'rgba(255,179,71,0.2)',
  warningText: '#FFB347',
  danger: '#FF6B6B',
  dangerBg: 'rgba(255,107,107,0.09)',
  dangerBorder: 'rgba(255,107,107,0.2)',
  purple: '#A78BFA',
  purpleBg: 'rgba(167,139,250,0.09)',
  purpleBorder: 'rgba(167,139,250,0.2)',

  // Radii
  radius: '14px',
  radiusSm: '8px',
  radiusMd: '11px',
  radiusXl: '18px',

  // Motion
  transition: 'all 0.18s ease',

  // Shadows
  shadowGlowMint: '0 0 20px rgba(0,255,178,0.15)',
  shadowGlowBlue: '0 0 20px rgba(77,166,255,0.15)',

  // Extra (legacy aliases)
  darkBg: '#101422',
  darkText: '#E8EAF5',
}

// Spacing system (8px grid)
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

export const CAT_COLORS = {
  client:   { bg: 'rgba(0,255,178,0.09)', text: '#00FFB2', accent: '#00FFB2' },
  prospect: { bg: 'rgba(255,179,71,0.09)', text: '#FFB347', accent: '#FFB347' },
  partner:  { bg: 'rgba(77,166,255,0.09)', text: '#4DA6FF', accent: '#4DA6FF' },
  supplier: { bg: 'rgba(167,139,250,0.09)', text: '#A78BFA', accent: '#A78BFA' },
  other:    { bg: 'rgba(255,255,255,0.04)', text: '#7B7F9E', accent: '#7B7F9E' },
}

export const STAGE_COLORS = {
  lead:        { bg: 'rgba(255,255,255,0.04)', text: '#7B7F9E', accent: '#7B7F9E' },
  qualified:   { bg: 'rgba(77,166,255,0.09)', text: '#4DA6FF', accent: '#4DA6FF' },
  proposal:    { bg: 'rgba(255,179,71,0.09)', text: '#FFB347', accent: '#FFB347' },
  negotiation: { bg: 'rgba(167,139,250,0.09)', text: '#A78BFA', accent: '#A78BFA' },
  won:         { bg: 'rgba(0,255,178,0.09)', text: '#00FFB2', accent: '#00FFB2' },
  lost:        { bg: 'rgba(255,107,107,0.09)', text: '#FF6B6B', accent: '#FF6B6B' },
}

// Status-badge preset per Clinical Luxury spec. Used by any list that renders
// an appointment / payment / ticket status. Consumers can spread the returned
// object into an inline style.
export const STATUS_BADGE = {
  pending:   { background: 'rgba(255,255,255,0.06)', color: '#7B7F9E' },
  confirmed: { background: 'rgba(77,166,255,0.12)',  color: '#4DA6FF' },
  active:    { background: 'rgba(77,166,255,0.12)',  color: '#4DA6FF' },
  completed: { background: 'rgba(0,255,178,0.1)',    color: '#00FFB2' },
  paid:      { background: 'rgba(0,255,178,0.1)',    color: '#00FFB2' },
  cancelled: { background: 'rgba(255,107,107,0.1)',  color: '#FF6B6B' },
  overdue:   { background: 'rgba(255,107,107,0.1)',  color: '#FF6B6B' },
  draft:     { background: 'rgba(255,179,71,0.1)',   color: '#FFB347' },
}
export function statusBadgeStyle(status) {
  const base = STATUS_BADGE[status] || STATUS_BADGE.pending
  return {
    ...base,
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 20,
    textTransform: 'capitalize',
    display: 'inline-block',
    fontFamily: "'DM Sans', sans-serif",
  }
}

export function makeBtn(variant = 'primary', extra = {}) {
  const base = {
    borderRadius: 8,
    padding: '0 16px',
    height: 36,
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap',
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1,
  }
  const variants = {
    // Primary hover glow + lift live in theme.css under `.velo-btn-primary:hover`
    // because :hover can't be expressed in inline style objects. Callers that
    // want the glow should add className='velo-btn-primary' in addition to the
    // style this returns.
    primary:   { background: '#00FFB2', color: '#07080E', fontWeight: 600 },
    success:   { background: '#00FFB2', color: '#07080E', fontWeight: 600 },
    danger:    { background: 'rgba(255,107,107,0.1)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.25)' },
    secondary: { background: 'rgba(0,255,178,0.09)', color: '#00FFB2', border: '1px solid rgba(0,255,178,0.25)' },
    ghost:     { background: 'transparent', color: '#7B7F9E', border: '1px solid rgba(255,255,255,0.07)' },
  }
  return { ...base, ...(variants[variant] || variants.primary), ...extra }
}

export const card = {
  background: '#101422',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: 'none',
  color: '#E8EAF5',
  transition: 'all 0.18s ease',
}
