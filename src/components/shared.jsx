import { C } from '../design'

// ─── SVG Icon helper (Heroicons style, consistent 1.5px stroke) ────────────
const I = (s, children) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{children}</svg>

export const Icons = {
  plus: (s=16) => I(s, <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  x: (s=16) => I(s, <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  check: (s=16) => I(s, <polyline points="20 6 9 17 4 12"/>),
  edit: (s=16) => I(s, <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>),
  trash: (s=16) => I(s, <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>),
  search: (s=16) => I(s, <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>),
  calendar: (s=16) => I(s, <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  clock: (s=16) => I(s, <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
  user: (s=16) => I(s, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  users: (s=16) => I(s, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  mail: (s=16) => I(s, <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>),
  phone: (s=16) => I(s, <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>),
  dollar: (s=16) => I(s, <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>),
  trendUp: (s=16) => I(s, <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>),
  arrowLeft: (s=16) => I(s, <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  arrowRight: (s=16) => I(s, <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>),
  chevronLeft: (s=16) => I(s, <polyline points="15 18 9 12 15 6"/>),
  chevronRight: (s=16) => I(s, <polyline points="9 18 15 12 9 6"/>),
  bolt: (s=16) => I(s, <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>),
  link: (s=16) => I(s, <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>),
  barChart: (s=16) => I(s, <><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>),
  pieChart: (s=16) => I(s, <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>),
  download: (s=16) => I(s, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>),
  settings: (s=16) => I(s, <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
  bell: (s=16) => I(s, <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>),
  creditCard: (s=16) => I(s, <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>),
  key: (s=16) => I(s, <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>),
  building: (s=16) => I(s, <><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/></>),
  globe: (s=16) => I(s, <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>),
  shield: (s=16) => I(s, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  copy: (s=16) => I(s, <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>),
  externalLink: (s=16) => I(s, <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>),
  image: (s=16) => I(s, <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>),
  upload: (s=16) => I(s, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>),
  zap: (s=16) => I(s, <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>),
  play: (s=16) => I(s, <polygon points="5 3 19 12 5 21 5 3"/>),
  pause: (s=16) => I(s, <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>),
  toggle: (s=16) => I(s, <><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></>),
  eye: (s=16) => I(s, <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  target: (s=16) => I(s, <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>),
}

// ─── Modal ──────────────────────────────────────────────────────────────────
export function Modal({ children, onClose, dir, width = 520 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ direction: dir, width, maxWidth: '92vw' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Form helpers ───────────────────────────────────────────────────────────
export function FormField({ label, children, dir }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8, direction: dir }}>{label}</label>
      {children}
    </div>
  )
}

export const inputStyle = (dir) => ({
  width: '100%', padding: '0 12px', height: 42, borderRadius: 10, border: '1px solid var(--border-subtle)',
  fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', background: 'var(--bg-void)',
  direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left', boxSizing: 'border-box',
  transition: 'border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
})

export const selectStyle = (dir) => ({ ...inputStyle(dir), appearance: 'auto' })

// ─── Toggle Switch ──────────────────────────────────────────────────────────
export function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} className={`toggle-track${value ? ' active' : ''}`}>
      <div className="toggle-knob" />
    </div>
  )
}
