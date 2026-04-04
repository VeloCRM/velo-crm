// Velo CRM - Design Tokens & Helpers

export const C = {
  // Sidebar
  sidebar: '#0D1117',
  sidebarBorder: 'rgba(240,246,252,0.1)',
  sidebarHover: 'rgba(177,186,196,0.08)',
  sidebarText: '#7D8590',
  sidebarActiveText: '#E6EDF3',
  sidebarActive: '#2F81F7',
  sidebarActiveBg: 'rgba(47,129,247,0.12)',

  // Content
  bg: '#F6F8FA',
  white: '#FFFFFF',
  border: '#D0D7DE',
  text: '#1F2328',
  textSec: '#57606A',
  textMuted: '#8C959F',

  // Brand
  primary: '#0969DA',
  primaryHov: '#0860CA',
  primaryBg: '#DDF4FF',

  // Semantic
  success: '#1A7F37',
  successBg: '#DAFBE1',
  warning: '#D29922',
  warningBg: '#FFF8C5',
  warningText: '#7D4E00',
  danger: '#CF222E',
  dangerBg: '#FFEBE9',
  purple: '#8250DF',
  purpleBg: '#FBEFFF',

  // Extra
  darkBg: '#21262D',
  darkText: '#E6EDF3',
}

export const CAT_COLORS = {
  client:   { bg: '#DDF4FF', text: '#0969DA', accent: '#0969DA' },
  prospect: { bg: '#FFF8C5', text: '#7D4E00', accent: '#D29922' },
  partner:  { bg: '#DAFBE1', text: '#1A7F37', accent: '#1A7F37' },
  supplier: { bg: '#FBEFFF', text: '#8250DF', accent: '#8250DF' },
  other:    { bg: '#F6F8FA', text: '#57606A', accent: '#8C959F' },
}

export const STAGE_COLORS = {
  lead:        { bg: '#F6F8FA', text: '#57606A',  accent: '#8C959F' },
  qualified:   { bg: '#DDF4FF', text: '#0969DA',  accent: '#0969DA' },
  proposal:    { bg: '#FFF8C5', text: '#7D4E00',  accent: '#D29922' },
  negotiation: { bg: '#FBEFFF', text: '#8250DF',  accent: '#8250DF' },
  won:         { bg: '#DAFBE1', text: '#1A7F37',  accent: '#1A7F37' },
  lost:        { bg: '#FFEBE9', text: '#CF222E',  accent: '#CF222E' },
}

export function makeBtn(variant = 'primary', extra = {}) {
  const base = {
    borderRadius: 6,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background .15s, opacity .15s',
    whiteSpace: 'nowrap',
  }
  const variants = {
    primary:   { background: C.primary,   color: C.white,   border: 'none' },
    success:   { background: C.success,   color: C.white,   border: 'none' },
    danger:    { background: C.danger,    color: C.white,   border: 'none' },
    secondary: { background: C.white,     color: C.text,    border: `1px solid ${C.border}` },
    ghost:     { background: 'transparent', color: C.textSec, border: 'none' },
  }
  return { ...base, ...(variants[variant] || variants.primary), ...extra }
}

export const card = {
  background: C.white,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  overflow: 'hidden',
}
