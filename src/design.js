// Velo CRM — Clinical Luxury Design System
// 8px grid · Syne + DM Sans · Deep dark palette

export const C = {
  // Sidebar
  sidebar: '#0C0E1A',
  sidebarBorder: 'rgba(255,255,255,0.07)',
  sidebarHover: 'rgba(255,255,255,0.04)',
  sidebarText: '#7B7F9E',
  sidebarActiveText: '#14B8A6',
  sidebarActive: '#14B8A6',
  sidebarActiveBg: 'rgba(20,184,166,0.08)',

  // Content — migrated to --velo-* tokens (light-only app; resolve to :root)
  bg: 'rgb(var(--velo-surface-canvas))',
  bgSec: 'rgb(var(--velo-surface-sunken))',
  white: 'rgb(var(--velo-surface-raised))',
  whiteHover: '#141828',
  border: 'rgb(var(--velo-border-subtle))',
  borderHover: 'rgba(255,255,255,0.14)',
  borderLight: 'rgb(var(--velo-border-subtle))',
  text: 'rgb(var(--velo-text-primary))',
  textSec: 'rgb(var(--velo-text-secondary))',
  textMuted: 'rgb(var(--velo-text-tertiary))',
  textLabel: 'rgb(var(--velo-text-tertiary))',

  // Brand
  primary: 'rgb(var(--velo-accent-solid))',
  primaryHov: '#0F8F82',
  primaryBg: 'rgb(var(--velo-accent-subtle))',
  primaryBorder: 'rgba(20,184,166,0.25)',
  primaryRing: 'rgba(20,184,166,0.3)',

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
  success: 'rgb(var(--velo-accent-fg))',
  successBg: 'rgb(var(--velo-accent-subtle))',
  successBorder: 'rgba(20,184,166,0.2)',
  warning: 'rgb(var(--velo-status-warning-fg))',
  warningBg: 'rgb(var(--velo-status-warning-bg))',
  warningBorder: 'rgba(255,179,71,0.2)',
  warningText: '#FFB347',
  danger: 'rgb(var(--velo-status-danger-fg))',
  dangerBg: 'rgb(var(--velo-status-danger-bg))',
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
  shadowGlowMint: '0 0 20px rgba(20,184,166,0.15)',
  shadowGlowBlue: '0 0 20px rgba(77,166,255,0.15)',

  // Extra (legacy aliases)
  darkBg: '#101422',
  darkText: '#E8EAF5',
}

// Spacing system (8px grid)
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

export const CAT_COLORS = {
  client:   { bg: 'rgba(20,184,166,0.09)', text: '#14B8A6', accent: '#14B8A6' },
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
  won:         { bg: 'rgba(20,184,166,0.09)', text: '#14B8A6', accent: '#14B8A6' },
  lost:        { bg: 'rgba(255,107,107,0.09)', text: '#FF6B6B', accent: '#FF6B6B' },
}

// Status-badge preset per Clinical Luxury spec. Used by any list that renders
// an appointment / payment / ticket status. Consumers can spread the returned
// object into an inline style.
export const STATUS_BADGE = {
  pending:   { background: 'rgb(var(--velo-surface-sunken))',    color: 'rgb(var(--velo-text-tertiary))' },
  confirmed: { background: 'rgb(var(--velo-status-info-bg))',    color: 'rgb(var(--velo-status-info-fg))' },
  active:    { background: 'rgb(var(--velo-status-info-bg))',    color: 'rgb(var(--velo-status-info-fg))' },
  completed: { background: 'rgb(var(--velo-status-success-bg))', color: 'rgb(var(--velo-status-success-fg))' },
  paid:      { background: 'rgb(var(--velo-status-success-bg))', color: 'rgb(var(--velo-status-success-fg))' },
  cancelled: { background: 'rgb(var(--velo-status-danger-bg))',  color: 'rgb(var(--velo-status-danger-fg))' },
  overdue:   { background: 'rgb(var(--velo-status-danger-bg))',  color: 'rgb(var(--velo-status-danger-fg))' },
  draft:     { background: 'rgb(var(--velo-status-warning-bg))', color: 'rgb(var(--velo-status-warning-fg))' },
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
    primary:   { background: 'rgb(var(--velo-accent-solid))', color: 'rgb(var(--velo-text-on-accent))', fontWeight: 600 },
    success:   { background: 'rgb(var(--velo-accent-solid))', color: 'rgb(var(--velo-text-on-accent))', fontWeight: 600 },
    danger:    { background: 'rgb(var(--velo-status-danger-bg))', color: 'rgb(var(--velo-status-danger-fg))', border: '1px solid rgb(var(--velo-status-danger-border))' },
    secondary: { background: 'rgb(var(--velo-accent-subtle))', color: 'rgb(var(--velo-accent-fg))', border: '1px solid rgb(var(--velo-border-brand) / 0.4)' },
    ghost:     { background: 'transparent', color: 'rgb(var(--velo-text-tertiary))', border: '1px solid rgb(var(--velo-border-subtle))' },
  }
  return { ...base, ...(variants[variant] || variants.primary), ...extra }
}

export const card = {
  background: 'rgb(var(--velo-surface-raised))',
  borderRadius: 14,
  border: '1px solid rgb(var(--velo-border-subtle))',
  boxShadow: 'none',
  color: 'rgb(var(--velo-text-primary))',
  transition: 'all 0.18s ease',
}
