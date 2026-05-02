import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { T } from './translations'
import { C, makeBtn, card } from './design'
// Sample data is dynamically imported when the URL contains ?demo=1.
// Production builds never load this module unless a user explicitly opts
// into demo mode, keeping it out of the main chunk.
import AuthPage from './pages/Auth'
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'))
const FormsPage = lazy(() => import('./pages/FormsPage'))
const SocialMonitor = lazy(() => import('./pages/SocialMonitor'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const GoalsPage = lazy(() => import('./pages/GoalsPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const OperatorConsole = lazy(() => import('./pages/operator/OperatorConsole'))
const DentalDashboard = lazy(() => import('./pages/DentalDashboard'))
const ClinicCredentialsPage = lazy(() => import('./pages/operator/ClinicCredentials'))
const DesignSystemPage = lazy(() => import('./pages/DesignSystem'))
const JoinPage = lazy(() => import('./pages/Join'))
// Overlays are lazy-loaded — they're rendered conditionally (modals,
// floating panels, dental tabs) and don't need to be in the initial bundle.
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const AIAssistant = lazy(() => import('./components/AIAssistant'))
const NotificationCenter = lazy(() => import('./components/NotificationCenter'))
const KeyboardShortcutsHelp = lazy(() => import('./components/KeyboardShortcuts'))
// DentalTabs exports several named tab components. Wrap each in its own
// lazy() with a default-export shim so the named exports load on demand.
const DentalMedicalHistory = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.MedicalHistoryTab }))
)
const DentalChartWrapper = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.DentalChartTab }))
)
const DentalTreatments = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.TreatmentPlanTab }))
)
import TestAccountBanner from './components/TestAccountBanner'
import { SkeletonDashboard, SkeletonContacts, SkeletonInbox, SkeletonCalendar, SkeletonGeneric } from './components/Skeleton'
import { useToast, ToastContainer } from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import EmptyState from './components/EmptyState'

// Minimal placeholder used inside Suspense for overlays. Most overlays are
// gated on an `open` flag, so this is rendered for a single frame at most.
const OverlayFallback = () => null
import { signOut, getCurrentUser, onAuthStateChange } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import * as db from './lib/database'
import { isSessionExpired, touchSession, clearAllVeloData, sanitizePathParam, sanitizeSearch, LIMITS, checkSupabaseRateLimit } from './lib/sanitize'
import { rememberPendingInvite } from './lib/invitations'
import { listAppointmentsForPatient } from './lib/appointments'
import { formatMoney, toMinor } from './lib/money'
import { avatarGradient, avatarInitials } from './lib/avatarGradient'
import { GlassCard, Button, Badge } from './components/ui'
import { can, normalizeRole } from './lib/permissions'
import { useIsOperator } from './lib/operator'
import { onAuditFailure } from './lib/audit'
import './App.css'

// ─── SVG Icons ──────────────────────────────────────────────────────────────
const Icons = {
  dashboard: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  contacts: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  pipeline: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  inbox: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  calendar: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  automations: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  integrations: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  reports: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
  settings: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  globe: (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  check: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  grip: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg>,
  customize: (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  eye: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  trendUp: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  clock: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  mail: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  user: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  dollar: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  target: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  activity: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  plus: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  x: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  trash: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  edit: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  arrowLeft: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  arrowRight: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  mapPin: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  file: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  upload: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  tag: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  phone: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  ticket: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5v2"/><path d="M15 11v2"/><path d="M15 17v2"/><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/></svg>,
  building: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/></svg>,
  package: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Demo mode is opt-in via ?demo=1. Loads SAMPLE_* stub data. Never writes to Supabase.
const isDemoMode = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === '1'
let _idCounter = 100
const genId = (prefix) => `${prefix}${++_idCounter}`

// ─── Shared Input Component ─────────────────────────────────────────────────
function FormField({ label, children, dir }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#7B7F9E', marginBottom: 6, direction: dir }}>{label}</label>
      {children}
    </div>
  )
}
const inputStyle = (dir) => ({
  width: '100%', padding: '0 12px', height: 36, borderRadius: 7, border: '1px solid rgba(255,255,255,0.065)',
  fontSize: 14, color: C.text, fontFamily: "'DM Sans',sans-serif", outline: 'none', background: C.bgSec,
  direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left', boxSizing: 'border-box',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
})
const selectStyle = (dir) => ({ ...inputStyle(dir), appearance: 'auto' })

// ─── Modal ──────────────────────────────────────────────────────────────────
function Modal({ children, onClose, dir, width = 520 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ direction: dir, width, maxWidth: '92vw' }}>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('velo_lang') || 'en')
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('velo_dark') === 'true')
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [orgSettings, setOrgSettings] = useState(() => isDemoMode() ? { industry: 'dental', status: 'demo' } : {})
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  // setInboxUnread is intentionally retained for the future inbox-unread
  // wiring; the eslint pattern allows underscore-prefixed unused vars.
  const [inboxUnread, _setInboxUnread] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  // Impersonation state — persisted in localStorage
  const [impersonation, setImpersonation] = useState(() => {
    try {
      const stored = localStorage.getItem('velo_impersonating')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })
  // Effective org id for dental.* calls — survives super-admin impersonation
  // even if orgSettings re-fetch races. impersonation.orgId is the canonical
  // override; orgSettings.id is the steady-state value.
  const dentalOrgId = impersonation?.orgId ?? orgSettings?.id

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const navigate = useNavigate()
  const location = useLocation()
  const _pathParts = location.pathname.split('/').filter(Boolean)
  const page = sanitizePathParam(_pathParts[0] || '') || 'dashboard'
  const pageSubId = _pathParts[1] ? (sanitizePathParam(_pathParts[1]) || null) : null
  const setPage = useCallback((p) => navigate('/' + p), [navigate])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userRole, setUserRole] = useState('owner')
  const [patients, setPatients] = useState([])
  const [patientsTotal, setPatientsTotal] = useState(0)
  const [patientsLoadingMore, setPatientsLoadingMore] = useState(false)
  const [allPayments, setAllPayments] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  // Sample data is null until ?demo=1 is detected and the module is imported.
  // Pages/widgets read slices from this; nothing renders sample content
  // until it resolves.
  const [sampleData, setSampleData] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('velo_notifications') || '[]') } catch { return [] }
  })
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm }
  const { toasts, addToast, removeToast } = useToast()

  // Audit-failure subscription. lib/audit notifies listeners when an
  // audit_log insert fails (RLS reject, network drop, etc.) — we surface a
  // warning toast so the user knows the action saved but the security trail
  // is incomplete. The bilingual lookup falls back to English if the AR key
  // hasn't been translated yet.
  useEffect(() => {
    const lbl = (lang === 'ar' ? T.ar?.audit_failed : T.en?.audit_failed) || 'Audit log failed'
    const unsub = onAuditFailure((err, ctx) => {
      const action = ctx?.action || ''
      const tail = lang === 'ar'
        ? '— الإجراء محفوظ ولكن سجل التدقيق غير مكتمل'
        : '— action saved but security trail incomplete'
      addToast(`${lbl}: ${action} ${tail}`, 'warning', 6000)
    })
    return () => { try { unsub() } catch { /* noop */ } }
  }, [addToast, lang])

  // Persist notifications
  useEffect(() => { localStorage.setItem('velo_notifications', JSON.stringify(notifications.slice(0, 50))) }, [notifications])

  // Add notification helper
  const pushNotification = useCallback((type, title, body) => {
    setNotifications(prev => [{ id: `notif_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type, title, body, time: new Date().toISOString(), read: false }, ...prev].slice(0, 50))
  }, [])

  // Notification helpers
  const markNotifRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllNotifsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const dismissNotif = (id) => setNotifications(prev => prev.filter(n => n.id !== id))

  // Confirm dialog helper
  const showConfirm = useCallback((title, message, onConfirm) => {
    setConfirmDialog({ title, message, onConfirm })
  }, [])
  const closeConfirm = () => setConfirmDialog(null)

  const demoMode = isDemoMode()
  const useDB = isSupabaseConfigured() && !demoMode
  const { isOperator, loading: operatorLoading } = useIsOperator()
  const t = T[lang]
  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    localStorage.setItem('velo_lang', lang)
  }, [lang, dir])

  // Capture an inbound /join?token=... so the token survives the auth round
  // trip (sign-up → email confirm → return). The actual /join rendering is
  // handled below; we don't redirect away from it.
  useEffect(() => {
    const path = location.pathname
    if (path.startsWith('/join')) {
      const params = new URLSearchParams(location.search)
      const rawToken = params.get('token') || ''
      const safe = sanitizePathParam(rawToken)
      if (safe) rememberPendingInvite(safe)
      return
    }
    if (path === '/') {
      navigate('/dashboard', { replace: true })
    }
  }, [location.pathname, location.search, navigate, user, impersonation])

  // Dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('velo_dark', darkMode)
  }, [darkMode])

  // Global keyboard shortcuts
  useEffect(() => {
    let gPending = false
    const handler = (e) => {
      const tag = e.target.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable
      // Allow Ctrl+K even in inputs
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdPaletteOpen(v => !v); return }
      if (isInput) return
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(v => !v); return }
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return }
        if (notifOpen) { setNotifOpen(false); return }
        if (aiOpen) { setAiOpen(false); return }
        gPending = false; return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        // "N" triggers new item based on current page
        if (page === 'patients') { document.querySelector('[data-action="new-patient"]')?.click() }
        else if (page === 'calendar') { document.querySelector('[data-action="new-event"]')?.click() }
        return
      }
      // G + key navigation
      if (e.key === 'g') { gPending = true; setTimeout(() => gPending = false, 800); return }
      if (gPending) {
        gPending = false
        const map = { d: 'dashboard', c: 'patients', i: 'inbox', a: 'calendar' }
        if (map[e.key]) { e.preventDefault(); setPage(map[e.key]) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [page, showShortcuts, notifOpen, aiOpen])

  // Auth state
  useEffect(() => {
    getCurrentUser().then(u => { if (u) setUser(u); setAuthLoading(false) })
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      if (event === 'SIGNED_OUT') setUser(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ?demo=1 — pull the sample-data module once on mount, then mirror it
  // into local state. Production builds never load this chunk unless the
  // user explicitly opts in.
  useEffect(() => {
    if (!demoMode || sampleData) return
    let cancelled = false
    ;(async () => {
      const mod = await import('./sampleData')
      if (!cancelled) setSampleData(mod)
    })()
    return () => { cancelled = true }
  }, [demoMode, sampleData])

  // Fetch data from Supabase when user logs in
  const loadAllData = async () => {
    if (demoMode) {
      // Read-only sample data for the ?demo=1 path. Wait for the dynamic
      // import to land before populating state.
      if (!sampleData) return
      setPatients(sampleData.SAMPLE_DENTAL_PATIENTS || [])
      setPatientsTotal((sampleData.SAMPLE_DENTAL_PATIENTS || []).length)
      return
    }
    if (!useDB) {
      // No Supabase configured (dev only). Show empty state.
      setPatients([]); setPatientsTotal(0); setAllPayments([])
      return
    }
    setDataLoading(true)
    setDataError(null)
    try {
      // Check if user has an org
      const { supabase: sb } = await import('./lib/supabase.js')
      if (sb) {
        const { data: profile } = await sb.from('profiles').select('org_id, role').eq('id', user.id).single()
        setUserRole(normalizeRole(profile?.role))
        if (profile?.org_id) {
          const { data: org } = await sb.from('orgs').select('*').eq('id', profile.org_id).single()
          if (org) setOrgSettings(org)
          // Fetch team members for this org
          try {
            const members = await db.fetchTeamMembers(profile.org_id)
            if (members.length > 0) setTeamMembers(members)
          } catch (e) { console.warn('Team members fetch error:', e) }
        }
        // No-org branch: clinic users without an org_id are provisioned by
        // the operator (Sprint 0+). The legacy onboarding wizard is gone.
      }

      const [patientsPage, rawPayments] = await Promise.all([
        db.fetchPatients(),
        db.fetchAllPayments().catch(() => []),
      ])
      setPatients(patientsPage.rows)
      setPatientsTotal(patientsPage.total)
      setAllPayments(rawPayments)
    } catch (err) {
      console.error('Data load error:', err)
      setDataError(err.message || 'Failed to load data')
      // On DB error, show empty state — don't pollute with sample data
    } finally {
      setDataLoading(false)
    }
  }

  // Load data for a specific org (impersonation mode)
  const loadDataForOrg = async (orgId) => {
    if (!useDB) return
    setDataLoading(true)
    setDataError(null)
    try {
      const org = await db.fetchOrg(orgId)
      if (org) setOrgSettings(org)
      const [patientsPage, rawPayments] = await Promise.all([
        db.fetchPatientsForOrg(orgId),
        db.fetchPaymentsForOrg(orgId),
      ])
      setPatients(patientsPage.rows)
      setPatientsTotal(patientsPage.total)
      setAllPayments(rawPayments)
    } catch (err) {
      console.error('Impersonation data load error:', err)
      setDataError(err.message || 'Failed to load org data')
    } finally {
      setDataLoading(false)
    }
  }

  // Fetch the next page of patients and merge into state.
  const loadMorePatients = useCallback(async () => {
    if (!useDB) return
    if (patientsLoadingMore) return
    if (patients.length >= patientsTotal) return
    if (!checkSupabaseRateLimit()) {
      addToast(isRTL ? 'كثرة الطلبات، حاول لاحقاً' : 'Too many requests, try again shortly', 'error')
      return
    }
    setPatientsLoadingMore(true)
    try {
      const offset = patients.length
      const page = impersonation
        ? await db.fetchPatientsForOrg(impersonation.orgId, offset)
        : await db.fetchPatients(offset)
      setPatients([...patients, ...page.rows])
      setPatientsTotal(page.total)
    } catch (err) {
      console.error('Load more patients error:', err)
      addToast(isRTL ? 'فشل تحميل المزيد' : 'Failed to load more', 'error')
    } finally {
      setPatientsLoadingMore(false)
    }
  }, [useDB, patientsLoadingMore, patients, patientsTotal, impersonation, addToast, isRTL])

  // Initial data load on sign-in (or impersonation switch).
  // Skip when a pending invite exists — the invite-apply effect will
  // call loadAllData after the RPC updates profile.org_id, so we avoid a
  // racy double-fetch against the pre-invite profile.
  useEffect(() => {
    if (!user) return
    // Defer data load until operator status resolves so we don't fire a
    // clinic-data fetch (which calls getCurrentOrgId() → throws "No org
    // membership") for an operator who legitimately has no profile.
    if (operatorLoading) return
    if (impersonation) {
      loadDataForOrg(impersonation.orgId)
    } else if (isOperator) {
      // Operator-no-impersonation: nothing to load. Clear the loading
      // skeleton so the OperatorConsole render path takes over cleanly.
      setDataLoading(false)
    } else {
      loadAllData()
    }
  }, [user, isOperator, operatorLoading])

  // Demo mode: re-run loadAllData once the dynamic sample-data import lands,
  // so the in-memory state is hydrated.
  useEffect(() => {
    if (!demoMode || !sampleData || !user || impersonation) return
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, sampleData])

  // The legacy invite-link flow (createInvitation / acceptInvitation /
  // velo_pending_invite) is gone — clinic users are provisioned by the
  // operator, not via self-serve invite tokens.

  // settingsTab is now derived from URL: /settings/:tab

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    setPatients([])
    setPatientsTotal(0)
    setOrgSettings({})
    setShowUserMenu(false)
    setImpersonation(null)
    localStorage.removeItem('velo_impersonating')
    localStorage.removeItem('velo_admin_session')
    clearAllVeloData()
  }

  // Session timeout (8 hours inactivity)
  useEffect(() => {
    if (!user) return
    touchSession()
    const interval = setInterval(() => {
      if (isSessionExpired()) { handleSignOut() }
      else { touchSession() }
    }, 60000)
    const onActivity = () => touchSession()
    window.addEventListener('click', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => { clearInterval(interval); window.removeEventListener('click', onActivity); window.removeEventListener('keydown', onActivity) }
  }, [user])

  // If navigating to agency while impersonating, exit impersonation
  useEffect(() => {
    if (page === 'agency' && impersonation) {
      setImpersonation(null)
      localStorage.removeItem('velo_impersonating')
      localStorage.removeItem('velo_admin_session')
      setOrgSettings({})
      setPatients([])
      setPatientsTotal(0)
      setAllPayments([])
      loadAllData()
      navigate('/agency')
    }
  }, [page])

  // Operator-no-impersonation landing on a clinic-only page (most commonly
  // /dashboard, the default after sign-in) gets bounced to /agency where the
  // OperatorConsole lives. Operator-only routes (`agency`, `billing`,
  // `agency-profile`, `operator/*`, `design-system`, `settings`) are
  // untouched. Without this, the operator would see a "No org membership"
  // error banner above an empty clinic dashboard.
  useEffect(() => {
    if (operatorLoading) return
    if (!isOperator || impersonation) return
    const operatorPages = new Set([
      'agency', 'billing', 'agency-profile', 'operator',
      'design-system', 'settings', 'finance',
    ])
    if (!operatorPages.has(page)) {
      navigate('/agency', { replace: true })
    }
  }, [isOperator, operatorLoading, impersonation, page, navigate])

  // Show auth page if not logged in
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',-apple-system,sans-serif", background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg,${C.primary},#A78BFA)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22, margin: '0 auto 16px' }}>V</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>Loading...</div>
        </div>
      </div>
    )
  }

  // /join is its own pre-app route — render the Join page regardless of
  // signed-in state. When signed-out it embeds the auth form (email locked
  // to the invitation address); when signed-in it calls acceptInvitation
  // and routes to /dashboard.
  if (location.pathname.startsWith('/join')) {
    return (
      <Suspense fallback={<SkeletonGeneric />}>
        <JoinPage user={user} onAuth={(u) => setUser(u)} lang={lang} setLang={setLang} navigate={navigate} />
      </Suspense>
    )
  }

  if (!user) {
    return <AuthPage onAuth={(u) => setUser(u)} lang={lang} setLang={setLang} />
  }

  // Operator identity comes from OperatorContext (loaded once per session
  // by directly self-selecting the operators table — RLS-bounded). The
  // context-driven `isOperator` const is already in scope from
  // `const { isOperator } = useIsOperator()` above.

  // Effective role for permission checks. Operators and agency-mode
  // impersonation always get full admin access; clinic users use their own role.
  const effectiveRole = (isOperator || impersonation) ? 'owner' : userRole
  const requirePerm = (feature, action = 'w') => {
    if (can(effectiveRole, feature, action)) return true
    addToast(isRTL ? 'ليس لديك صلاحية للقيام بذلك' : 'You do not have permission', 'error')
    return false
  }

  // Impersonation handlers
  const startImpersonation = async (org) => {
    const imp = { orgId: org.id, orgName: org.name }
    setImpersonation(imp)
    localStorage.setItem('velo_impersonating', JSON.stringify(imp))
    localStorage.setItem('velo_admin_session', JSON.stringify({ email: user.email, id: user.id }))
    await loadDataForOrg(org.id)
    navigate('/dashboard')
  }

  const exitImpersonation = () => {
    setImpersonation(null)
    localStorage.removeItem('velo_impersonating')
    localStorage.removeItem('velo_admin_session')
    setOrgSettings({})
    setPatients([])
    setPatientsTotal(0)
    setAllPayments([])
    loadAllData()
    navigate('/agency')
  }

  // Onboarding flow is gone — clinics are provisioned by the operator.

  const toggleLang = () => setLang(l => l === 'en' ? 'ar' : 'en')

  // ── Patient CRUD — Supabase-backed with optimistic local updates ──────
  const addPatient = async (raw) => {
    if (!requirePerm('contacts', 'w')) return
    const fullName = (raw.full_name || raw.fullName || '').trim()
    const phone = (raw.phone || '').trim()
    if (!fullName) {
      addToast(isRTL ? 'الاسم مطلوب' : 'Full name is required', 'error')
      return
    }
    if (!phone) {
      addToast(isRTL ? 'رقم الهاتف مطلوب' : 'Phone is required', 'error')
      return
    }
    const orgId = impersonation?.orgId ?? orgSettings?.id
    if (useDB && !orgId) {
      addToast(isRTL ? 'لا يوجد سياق منظمة — يرجى التحديث' : 'No organization context — please refresh.', 'error')
      return
    }
    const optimistic = {
      id: genId('p'),
      fullName,
      full_name: fullName,
      phone,
      email: raw.email || '',
      dob: raw.dob || '',
      gender: raw.gender || null,
      medicalHistory: raw.medicalHistory || raw.medical_history || {},
      allergies: raw.allergies || [],
      createdAt: new Date().toISOString(),
    }
    setPatients(prev => [optimistic, ...prev])
    setPatientsTotal(n => n + 1)
    addToast(isRTL ? 'تمت إضافة المريض' : 'Patient added', 'success')
    pushNotification('contact', isRTL ? 'مريض جديد' : 'New patient added', fullName)
    if (useDB) {
      try {
        const saved = await db.insertPatient(raw, orgId)
        setPatients(prev => prev.map(x => x.id === optimistic.id ? saved : x))
      } catch (err) {
        console.error('Add patient error:', err)
        addToast(isRTL ? 'خطأ في إضافة المريض' : 'Error adding patient', 'error')
        loadAllData()
      }
    }
  }
  const updatePatient = async (id, data) => {
    if (!requirePerm('contacts', 'w')) return
    setPatients(prev => prev.map(p => p.id === id ? { ...p, ...data, fullName: data.full_name ?? data.fullName ?? p.fullName, full_name: data.full_name ?? data.fullName ?? p.fullName } : p))
    addToast(isRTL ? 'تم تحديث المريض' : 'Patient updated', 'success')
    if (useDB) {
      try {
        const saved = await db.patchPatient(id, data)
        setPatients(prev => prev.map(p => p.id === id ? saved : p))
      } catch (err) {
        console.error('Update patient error:', err)
        addToast(isRTL ? 'خطأ في التحديث' : 'Error updating patient', 'error')
        loadAllData()
      }
    }
  }
  const deletePatient = async (id) => {
    if (!requirePerm('contacts', 'd')) return
    setPatients(prev => prev.filter(p => p.id !== id))
    setPatientsTotal(n => Math.max(0, n - 1))
    addToast(isRTL ? 'تم حذف المريض' : 'Patient deleted', 'success')
    if (useDB) {
      try { await db.removePatient(id) }
      catch (err) {
        console.error('Delete patient error:', err)
        addToast(isRTL ? 'خطأ في الحذف' : 'Error deleting patient', 'error')
        loadAllData()
      }
    }
  }

  const saveOrgSettings = async (updates) => {
    setOrgSettings(prev => ({ ...prev, ...updates }))
    if (!isSupabaseConfigured() || !orgSettings.id) return
    try {
      const { updateOrgSettings } = await import('./lib/orgs')
      await updateOrgSettings(orgSettings.id, updates)
    } catch (err) {
      console.error('Save org settings error:', err)
      addToast(isRTL ? 'فشل حفظ إعدادات المؤسسة' : 'Failed to save org settings', 'error')
    }
  }

  // Nav items
  const isAgencyMode = isOperator && !impersonation

  const navGroups = isAgencyMode ? [
    { label: isRTL ? 'إدارة الوكالة' : 'Agency Management', items: [
      { id: 'dashboard', icon: Icons.dashboard, label: isRTL ? 'لوحة التحكم' : 'Dashboard' },
      { id: 'agency', icon: Icons.building, label: isRTL ? 'المؤسسات' : 'Organizations' },
    ]},
    { label: isRTL ? 'المالية' : 'Financial', items: [
      { id: 'finance', icon: Icons.dollar, label: isRTL ? 'الاشتراكات و MRR' : 'Subscriptions & MRR' },
      { id: 'billing', icon: Icons.file, label: isRTL ? 'الفواتير' : 'Billing' },
    ]},
    { label: isRTL ? 'المنصة' : 'Platform', items: [
      { id: 'settings', icon: Icons.settings, label: isRTL ? 'الإعدادات' : 'Settings' },
      { id: 'agency-profile', icon: Icons.user, label: isRTL ? 'ملف الوكالة' : 'Agency Profile' },
    ]},
  ] : [
    { label: t.workspace, items: [
      { id: 'dashboard', icon: Icons.dashboard, label: t.dashboard },
      { id: 'patients', icon: Icons.contacts, label: isRTL ? 'المرضى' : 'Patients' },
      { id: 'inbox', icon: Icons.inbox, label: t.inbox, badge: inboxUnread || undefined },
      { id: 'calendar', icon: Icons.calendar, label: t.calendar },
      { id: 'tasks', icon: Icons.check, label: isRTL ? 'المهام' : 'Tasks' },
    ]},
    { label: t.tools, items: [
      { id: 'goals', icon: Icons.trendUp, label: isRTL ? 'الأهداف' : 'Goals' },
      { id: 'docs', icon: Icons.file, label: isRTL ? 'المستندات' : 'Docs' },
      { id: 'automations', icon: Icons.automations, label: t.automations },
      { id: 'forms', icon: Icons.file, label: isRTL ? 'النماذج' : 'Forms' },
      { id: 'social', icon: Icons.globe, label: isRTL ? 'صفحات التواصل' : 'Social Pages' },
      { id: 'integrations', icon: Icons.integrations, label: t.integrations },
      { id: 'reports', icon: Icons.reports, label: t.reports },
      { id: 'finance', icon: Icons.dollar, label: isRTL ? 'المالية' : 'Finance' },
      { id: 'inventory', icon: Icons.package, label: isRTL ? 'المخزون' : 'Inventory' },
    ]},
    { label: t.account, items: [
      ...(isOperator ? [{ id: 'agency', icon: Icons.building, label: isRTL ? 'لوحة الوكالة' : 'Agency' }] : []),
      { id: 'settings', icon: Icons.settings, label: t.settings },
    ]},
  ]

  // Filter non-agency nav items by role (super admin + impersonation keep
  // everything; the page gate still enforces permissions for direct URLs).
  // Operator-only entries are appended separately so the role-based filter
  // doesn't drop them (they aren't in the permissions config by design).
  const baseVisibleGroups = isAgencyMode
    ? navGroups
    : navGroups
        .map(g => ({ ...g, items: g.items.filter(item => can(effectiveRole, item.id, 'r')) }))
        .filter(g => g.items.length > 0)
  const visibleNavGroups = isOperator
    ? [
        ...baseVisibleGroups,
        {
          label: isRTL ? 'المشغل' : 'Operator',
          items: [
            { id: 'operator/credentials', icon: Icons.settings, label: isRTL ? 'بيانات اعتماد العيادات' : 'Clinic Credentials' },
            { id: 'design-system',        icon: Icons.dashboard, label: isRTL ? 'نظام التصميم' : 'Design System' },
          ],
        },
      ]
    : baseVisibleGroups

  return (
    <div dir={dir} onClick={() => showUserMenu && setShowUserMenu(false)} style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:"'DM Sans',-apple-system,sans-serif", direction:dir }}>
      {/* ── SIDEBAR (desktop) ────────────────────────────────────────── */}
      <aside className="desktop-sidebar" style={{
        width: sidebarCollapsed?56:228, minWidth: sidebarCollapsed?56:228,
        background: C.sidebar, display:'flex', flexDirection:'column',
        transition:'width 200ms ease, min-width 200ms ease',
        borderRight: isRTL?'none':`1px solid ${C.sidebarBorder}`,
        borderLeft: isRTL?`1px solid ${C.sidebarBorder}`:'none',
        overflow:'hidden', position:'relative', zIndex:10,
      }}>
        <div style={{ padding: sidebarCollapsed?'16px 8px':'16px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${C.sidebarBorder}`, minHeight:60 }}>
          {isAgencyMode ? (
            <>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(0,255,178,0.1)', border:'1px solid rgba(0,255,178,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00FFB2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/></svg>
              </div>
              {!sidebarCollapsed && <div style={{overflow:'hidden'}}>
                <div style={{color:C.text,fontWeight:800,fontSize:17,fontFamily:"'Syne',sans-serif",letterSpacing:'-0.03em',display:'flex',alignItems:'center',gap:8}}>
                  {isRTL ? 'وكالة Velo' : 'Velo Agency'}
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'rgba(0,255,178,0.1)',color:'#00FFB2',letterSpacing:'0.05em',textTransform:'uppercase',lineHeight:'14px',border:'1px solid rgba(0,255,178,0.25)'}}>PRO</span>
                </div>
                <div style={{color:C.sidebarText,fontSize:11,marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>{isRTL ? 'لوحة تحكم الوكالة' : 'Agency Control Panel'}</div>
              </div>}
            </>
          ) : (
            <>
              {/* Logo mark — 36x36 rounded 10, tooth SVG in mint */}
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(0,255,178,0.1)', border:'1px solid rgba(0,255,178,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00FFB2" strokeWidth="2"><path d="M12 2L8 6h3v4h2V6h3L12 2z"/><rect x="8" y="11" width="8" height="4" rx="1"/><path d="M9 15v3a2 2 0 004 0v-3"/><circle cx="9" cy="19" r="1" fill="#00FFB2"/><circle cx="15" cy="19" r="1" fill="#00FFB2"/></svg>
              </div>
              {!sidebarCollapsed && <div style={{overflow:'hidden'}}>
                <div style={{color:C.text,fontWeight:800,fontSize:17,fontFamily:"'Syne',sans-serif",letterSpacing:'-0.03em'}}>{orgSettings.name || t.appName}</div>
                <div style={{color:C.sidebarText,fontSize:11,marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>{orgSettings.name ? t.appName : t.appTagline}</div>
              </div>}
            </>
          )}
        </div>
        <nav style={{ flex:1, overflowY:'auto', padding:'8px', minHeight:0 }}>
          {visibleNavGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom:4 }}>
              {!sidebarCollapsed && <div style={{ color:C.textMuted, fontSize:9.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em', padding:'14px 12px 5px', fontFamily:"'DM Sans',sans-serif" }}>{group.label}</div>}
              {group.items.map(item => {
                const active = page === item.id
                return (
                  <button key={item.id} onClick={() => setPage(item.id)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8,
                      padding: sidebarCollapsed?'8px 0':'0 10px', height:36, justifyContent: sidebarCollapsed?'center':'flex-start',
                      borderRadius:8, border:'none', background: active?'rgba(0,255,178,0.08)':'transparent',
                      color: active?'#00FFB2':C.sidebarText, cursor:'pointer', fontSize:13,
                      fontWeight: active?500:400, transition:'all 0.18s ease', fontFamily:"'DM Sans',sans-serif",
                      textAlign: isRTL?'right':'left', direction:dir,
                      borderLeft: active && !isRTL ? '2px solid #00FFB2' : '2px solid transparent',
                      borderRight: active && isRTL ? '2px solid #00FFB2' : '2px solid transparent',
                      boxShadow: 'none',
                    }}
                    onMouseEnter={e=>{if(!active){ e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#E8EAF5' }}}
                    onMouseLeave={e=>{if(!active){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color=C.sidebarText }}}>
                    <span style={{ display:'flex', alignItems:'center', color: active?'#00FFB2':C.sidebarText, flexShrink:0, opacity: active?1:0.55, transition:'all 0.18s ease' }}>{item.icon(16)}</span>
                    {!sidebarCollapsed && <><span style={{flex:1}}>{item.label}</span>{item.badge && <span style={{ background:'#00FFB2', color:'#07080E', fontSize:9.5, fontWeight:700, padding:'0 7px', borderRadius:10, height:18, display:'inline-flex', alignItems:'center' }}>{item.badge}</span>}</>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        {/* User section (desktop only) — gradient avatar with online dot glow */}
        {!sidebarCollapsed && user && (
          <div style={{ borderTop:`1px solid ${C.sidebarBorder}`, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, #00FFB2, #4DA6FF)', display:'flex', alignItems:'center', justifyContent:'center', color:'#07080E', fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                {(user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              {/* Online indicator: 6px mint dot with glow */}
              <div style={{ position:'absolute', bottom:-1, [isRTL?'left':'right']:-1, width:6, height:6, borderRadius:'50%', background:'#00FFB2', boxShadow:'0 0 6px #00FFB2', border:`2px solid ${C.sidebar}` }} />
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'DM Sans',sans-serif" }}>
                {user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || t.adminUser}
              </div>
              <div style={{ fontSize:10, color:C.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.email || 'demo@velo.app'}
              </div>
            </div>
          </div>
        )}
        <button onClick={() => setSidebarCollapsed(c=>!c)} style={{ height:40, border:'none', background:'transparent', color:C.sidebarText, cursor:'pointer', borderTop:`1px solid ${C.sidebarBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit', transition:'color 150ms ease' }}
          onMouseEnter={e=>e.currentTarget.style.color=C.sidebarActiveText} onMouseLeave={e=>e.currentTarget.style.color=C.sidebarText}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            {sidebarCollapsed ? (isRTL?<polyline points="15 18 9 12 15 6"/>:<polyline points="9 18 15 12 9 6"/>) : (isRTL?<polyline points="9 18 15 12 9 6"/>:<polyline points="15 18 9 12 15 6"/>)}
          </svg>
        </button>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main className="mobile-main" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'rgb(var(--velo-surface-canvas))' }}>
        <header className="mobile-header" style={{ height:52, minHeight:52, background: C.sidebar, borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', padding: isMobile?'0 12px':'0 24px', gap: isMobile?8:16 }}>
          {/* Mobile: Logo + company name in header */}
          {isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:'rgba(0,255,178,0.1)', border:'1px solid rgba(0,255,178,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'#00FFB2', fontWeight:700, fontSize:12 }}>{(orgSettings.name || 'V').charAt(0).toUpperCase()}</div>
              <span style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:"'Syne',sans-serif" }}>{orgSettings.name || 'Velo'}</span>
            </div>
          )}
          {/* Search → opens Command Palette */}
          <div onClick={() => setCmdPaletteOpen(true)} style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'0 12px', height:34, border:'1px solid rgba(255,255,255,0.07)', flex:1, maxWidth:320, cursor:'pointer', transition:'border-color 0.18s ease' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.14)'} onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
            <span style={{color:C.textMuted,display:'flex'}}>{Icons.search(16)}</span>
            <span style={{ fontSize:13, color:C.textMuted, flex:1 }}>{t.searchPlaceholder}</span>
            <kbd style={{ padding:'2px 6px', borderRadius:4, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.065)', fontSize:10, color:C.textMuted, fontFamily:"'DM Sans',sans-serif" }}>Ctrl+K</kbd>
          </div>
          <div style={{flex:1}}/>
          {!isMobile && (
            <button onClick={toggleLang} style={{ ...makeBtn('secondary'), padding:'6px 12px', fontSize:12, gap:6 }}>
              {Icons.globe()}{lang==='en'?'العربية':'English'}
            </button>
          )}
          {/* Dark mode toggle */}
          <button onClick={() => setDarkMode(d => !d)} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.textSec, transition:'all 0.18s ease' }}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.07)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}>
            {darkMode
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          {/* Notifications */}
          <button onClick={() => setNotifOpen(v => !v)} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.textSec, position:'relative', transition:'all 0.18s ease' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.07)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}>
            {Icons.bell(16)}
            {notifications.filter(n => !n.read).length > 0 && <span style={{ position:'absolute', top:3, right:3, minWidth:16, height:16, borderRadius:8, background:'#FF6B6B', color:'#07080E', fontSize:10, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px', border:'2px solid #07080E' }}>{notifications.filter(n => !n.read).length}</span>}
          </button>
          {/* User avatar + dropdown */}
          <div style={{ position:'relative' }}>
            <div onClick={() => setShowUserMenu(v => !v)} style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, #00FFB2, #4DA6FF)', display:'flex', alignItems:'center', justifyContent:'center', color:'#07080E', fontSize:13, fontWeight:600, cursor:'pointer', transition:'transform 0.18s ease', boxShadow:'0 0 12px rgba(0,255,178,0.25)' }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              {(user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            {showUserMenu && (
              <div style={{
                position:'absolute', top:40, [isRTL?'left':'right']:0, width:220, background:C.white,
                borderRadius:8, border:`1px solid ${C.border}`, boxShadow:'0 4px 6px rgba(0,0,0,.07), 0 10px 15px rgba(0,0,0,.05)',
                zIndex:100, overflow:'hidden', direction:dir,
              }}>
                <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{user?.user_metadata?.full_name || user?.email || t.adminUser}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{user?.email || 'demo@velo.app'}</div>
                </div>
                <button onClick={() => { setPage('settings'); setShowUserMenu(false) }} style={{ width:'100%', padding:'10px 16px', border:'none', background:'transparent', textAlign:isRTL?'right':'left', cursor:'pointer', fontSize:13, color:C.text, fontFamily:'inherit', display:'flex', alignItems:'center', gap:8 }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {Icons.settings(15)} {t.settings}
                </button>
                <button onClick={handleSignOut} style={{ width:'100%', padding:'10px 16px', border:'none', background:'transparent', textAlign:isRTL?'right':'left', cursor:'pointer', fontSize:13, color:C.danger, fontFamily:'inherit', display:'flex', alignItems:'center', gap:8, borderTop:`1px solid ${C.border}` }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Test-account banner — sticky, shows when current org is in test status */}
        <TestAccountBanner
          org={orgSettings}
          lang={lang}
          onContactOperator={() => {
            const url = import.meta.env.VITE_OPERATOR_CONTACT
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
          }}
        />

        {/* Impersonation Banner */}
        {impersonation && (
          <div style={{
            background: 'linear-gradient(135deg, #DC2626, #EA580C)',
            padding: '0 24px',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            zIndex: 50,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>👁</span>
              <span>{isRTL ? 'عرض كـ:' : 'Viewing as:'} {impersonation.orgName}</span>
            </div>
            <button onClick={exitImpersonation} style={{
              border: '2px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              padding: '4px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 150ms ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            >
              {isRTL ? '← العودة للوكالة' : '← Exit to Agency'}
            </button>
          </div>
        )}

        <div style={{ flex:1, overflow:'auto', padding: isMobile?16:32 }} className="page-transition mobile-content">
          {/* Error banner */}
          {dataError && (
            <div style={{ padding:'10px 16px', marginBottom:16, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.13)', fontSize:13, color:C.danger, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>{dataError}</span>
              <button onClick={() => setDataError(null)} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.danger, fontWeight:700, fontSize:16 }}>&times;</button>
            </div>
          )}
          {/* Loading skeleton — page-specific */}
          {dataLoading ? (
            page === 'patients' ? <SkeletonContacts /> :
            page === 'inbox' ? <SkeletonInbox /> :
            page === 'calendar' ? <SkeletonCalendar /> :
            page === 'dashboard' ? <SkeletonDashboard /> :
            <SkeletonGeneric />
          ) : (
            <>
              {page === 'dashboard' && (orgSettings === null || orgSettings === undefined
                ? <SkeletonDashboard />
                : <Suspense fallback={<SkeletonDashboard />}><DentalDashboard t={t} lang={lang} isRTL={isRTL} dir={dir} patients={patients} setPage={setPage} /></Suspense>
              )}
              {page === 'patients' && <PatientsPage t={t} lang={lang} dir={dir} isRTL={isRTL} patients={patients} patientsTotal={patientsTotal} loadMorePatients={loadMorePatients} patientsLoadingMore={patientsLoadingMore} addPatient={addPatient} updatePatient={updatePatient} deletePatient={deletePatient} setPage={setPage} toast={addToast} showConfirm={showConfirm} urlPatientId={pageSubId} navigate={navigate} isOperator={isOperator} impersonation={impersonation} orgId={dentalOrgId} />}
              {page === 'inbox' && <InboxPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} setPage={setPage} toast={addToast} urlConvId={pageSubId} navigate={navigate} teamMembers={teamMembers} isOperator={isOperator} impersonation={impersonation} orgId={dentalOrgId} demoMode={demoMode} sampleData={sampleData} />}
              {page === 'calendar' && <Suspense fallback={<SkeletonGeneric />}><AppointmentsPage t={t} lang={lang} dir={dir} isRTL={isRTL} patients={patients} toast={addToast} setPage={setPage} /></Suspense>}
              {page === 'automations' && <Suspense fallback={<SkeletonGeneric />}><AutomationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'forms' && <Suspense fallback={<SkeletonGeneric />}><FormsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} urlFormId={pageSubId} navigate={navigate} /></Suspense>}
              {page === 'social' && <Suspense fallback={<SkeletonGeneric />}><SocialMonitor lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'finance' && <Suspense fallback={<SkeletonGeneric />}><FinancePage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} currency={orgSettings.currency || 'USD'} toast={addToast} showConfirm={showConfirm} isOperator={isOperator && !impersonation} orgPayments={impersonation ? allPayments : null} /></Suspense>}
              {page === 'inventory' && <Suspense fallback={<SkeletonGeneric />}><InventoryPage lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'integrations' && <Suspense fallback={<SkeletonGeneric />}><IntegrationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'reports' && <Suspense fallback={<SkeletonGeneric />}><ReportsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} onOpenBuilder={() => setPage('report-builder')} /></Suspense>}
              {page === 'report-builder' && <Suspense fallback={<SkeletonGeneric />}><ReportBuilder t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} onBack={() => setPage('reports')} /></Suspense>}
              {page === 'tasks' && <Suspense fallback={<SkeletonGeneric />}><TasksPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} user={user} toast={addToast} showConfirm={showConfirm} /></Suspense>}
              {page === 'goals' && <Suspense fallback={<SkeletonGeneric />}><GoalsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} toast={addToast} /></Suspense>}
              {page === 'docs' && <Suspense fallback={<SkeletonGeneric />}><DocsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} toast={addToast} /></Suspense>}
              {page === 'agency' && isOperator && !impersonation && <Suspense fallback={<SkeletonGeneric />}><OperatorConsole user={user} onEnterOrg={startImpersonation} onSignOut={handleSignOut} /></Suspense>}
              {page === 'billing' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'الفواتير' : 'Billing'} description={isRTL ? 'إدارة الفواتير والمدفوعات قريباً' : 'Billing management coming soon.'} icon={Icons.file} />}
              {page === 'agency-profile' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'ملف الوكالة' : 'Agency Profile'} description={isRTL ? 'إعدادات ملف الوكالة قريباً' : 'Agency profile settings coming soon.'} icon={Icons.user} />}
              {page === 'settings' && <Suspense fallback={<SkeletonGeneric />}><SettingsPage t={t} lang={lang} dir={dir} isRTL={isRTL} user={user} orgSettings={orgSettings} onSaveOrgSettings={saveOrgSettings} toast={addToast} initialTab={pageSubId} key={pageSubId || 'settings'} navigate={navigate} isOperator={isOperator} /></Suspense>}
              {page === 'operator' && pageSubId === 'credentials' && isOperator && <Suspense fallback={<SkeletonGeneric />}><ClinicCredentialsPage lang={lang} /></Suspense>}
              {page === 'design-system' && isOperator && <Suspense fallback={<SkeletonGeneric />}><DesignSystemPage lang={lang} /></Suspense>}
            </>
          )}
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ───────────────────────────────────── */}
      {isMobile && (
        <>
          <div className="mobile-bottom-nav">
            {(isAgencyMode ? [
              { id:'dashboard', icon: Icons.dashboard, label: isRTL?'لوحة التحكم':'Dashboard' },
              { id:'agency', icon: Icons.building, label: isRTL?'المؤسسات':'Orgs' },
              { id:'finance', icon: Icons.dollar, label: 'MRR' },
              { id:'_more', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>, label: isRTL?'المزيد':'More' },
            ] : [
              { id:'dashboard', icon: Icons.dashboard, label: t.dashboard },
              { id:'patients', icon: Icons.contacts, label: isRTL ? 'المرضى' : 'Patients' },
              { id:'inbox', icon: Icons.inbox, label: t.inbox },
              { id:'calendar', icon: Icons.calendar, label: t.calendar },
              { id:'_more', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>, label: isRTL?'المزيد':'More' },
            ]).map(item => {
              const active = item.id === '_more' ? mobileMoreOpen : page === item.id
              return (
                <button key={item.id} onClick={() => item.id === '_more' ? setMobileMoreOpen(v=>!v) : (setPage(item.id), setMobileMoreOpen(false))}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, border:'none', background:'transparent', color: active?'#2F81F7':'#7D8590', cursor:'pointer', fontFamily:'inherit', padding:'8px 0', minHeight:44 }}>
                  <span style={{ display:'flex' }}>{item.icon(20)}</span>
                  <span style={{ fontSize:10, fontWeight: active?600:500 }}>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* More drawer */}
          {mobileMoreOpen && (
            <>
              <div className="mobile-drawer-overlay" onClick={() => setMobileMoreOpen(false)} />
              <div className="mobile-drawer">
                <div style={{ width:40, height:4, borderRadius:2, background:'#30363D', margin:'0 auto 16px' }} />
                {(isAgencyMode ? [
                  { id:'billing', icon: Icons.file, label: isRTL?'الفواتير':'Billing' },
                  { id:'settings', icon: Icons.settings, label: isRTL?'الإعدادات':'Settings' },
                  { id:'agency-profile', icon: Icons.user, label: isRTL?'ملف الوكالة':'Agency Profile' },
                ] : [
                  { id:'tasks', icon: Icons.check, label: isRTL?'المهام':'Tasks' },
                  { id:'automations', icon: Icons.automations, label: t.automations },
                  { id:'forms', icon: Icons.file, label: isRTL?'النماذج':'Forms' },
                  { id:'social', icon: Icons.globe, label: isRTL?'صفحات التواصل':'Social Pages' },
                  { id:'integrations', icon: Icons.integrations, label: t.integrations },
                  { id:'reports', icon: Icons.reports, label: t.reports },
                  { id:'finance', icon: Icons.dollar, label: isRTL?'المالية':'Finance' },
                  { id:'inventory', icon: Icons.package, label: isRTL?'المخزون':'Inventory' },
                  { id:'settings', icon: Icons.settings, label: t.settings },
                ]).map(item => (
                  <button key={item.id} onClick={() => { setPage(item.id); setMobileMoreOpen(false) }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', border:'none', background: page===item.id?'rgba(47,129,247,0.12)':'transparent', color: page===item.id?'#E6EDF3':'#7D8590', cursor:'pointer', fontFamily:'inherit', borderRadius:8, fontSize:14, fontWeight: page===item.id?600:500, minHeight:44 }}>
                    <span style={{ display:'flex', color: page===item.id?'#2F81F7':'#7D8590' }}>{item.icon(20)}</span>
                    {item.label}
                  </button>
                ))}
                {/* Language toggle in drawer */}
                <button onClick={() => { toggleLang(); setMobileMoreOpen(false) }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', border:'none', background:'transparent', color:'#7D8590', cursor:'pointer', fontFamily:'inherit', borderRadius:8, fontSize:14, minHeight:44, marginTop:8, borderTop:'1px solid rgba(240,246,252,0.1)' }}>
                  {Icons.globe(20)} {lang==='en'?'العربية':'English'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Command Palette — lazy chunk loaded on first open */}
      {cmdPaletteOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <CommandPalette open={cmdPaletteOpen} onClose={(action) => action === 'toggle' ? setCmdPaletteOpen(v => !v) : setCmdPaletteOpen(false)} contacts={patients} onNavigate={setPage} onAction={(action) => {
            if (action === 'add-contact' || action === 'add-patient') setPage('patients')
            else if (action === 'new-event') setPage('calendar')
            else if (action === 'view-contact' || action === 'view-patient') setPage('patients')
          }} lang={lang} />
        </Suspense>
      )}

      {/* Notification Center — lazy chunk loaded on first open */}
      {notifOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} onMarkRead={markNotifRead} onMarkAllRead={markAllNotifsRead} onDismiss={dismissNotif} lang={lang} />
        </Suspense>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} isRTL={isRTL} />

      {/* Keyboard Shortcuts Help — lazy chunk loaded on first open */}
      {showShortcuts && (
        <Suspense fallback={<OverlayFallback />}>
          <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} lang={lang} />
        </Suspense>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        onConfirm={() => { confirmDialog?.onConfirm?.(); closeConfirm() }}
        onCancel={closeConfirm}
        dir={dir}
      />

      {/* AI Assistant — lazy chunk loaded on first open */}
      {aiOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} context={`Current page: ${page}. User has ${patients.length} patients.`} lang={lang} knowledgeBase={orgSettings.ai_knowledge_base} contacts={patients} />
        </Suspense>
      )}

      {/* AI Floating Button */}
      {!aiOpen && (
        <button onClick={() => setAiOpen(true)} style={{
          position: 'fixed', bottom: 24, [isRTL ? 'left' : 'right']: 24, width: 52, height: 52,
          borderRadius: 16, border: 'none', cursor: 'pointer', zIndex: 1700,
          background: `linear-gradient(135deg, ${C.primary}, #A78BFA)`,
          boxShadow: '0 4px 16px rgba(9,105,218,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(9,105,218,.4)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(9,105,218,.3)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE (unchanged from Day 1)
// ═══════════════════════════════════════════════════════════════════════════
// PATIENTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// Replaces the legacy ContactsPage. The new schema has no concept of
// status / category / source / tags / company / city — patients are simpler:
// full_name, phone, email, dob, gender, medical_history, allergies.
//
// Deals, lead-scoring, and notes-timeline are gone. Documents/prescriptions/
// x-rays were dropped from the dental schema.

function PatientsPage({ t, lang, dir, isRTL, patients, patientsTotal = 0, loadMorePatients, patientsLoadingMore = false, addPatient, updatePatient, deletePatient, setPage, toast, showConfirm, urlPatientId, navigate, isOperator, impersonation, orgId }) {
  void t
  void lang
  void toast
  void orgId
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [_selectedPatientId, _setSelectedPatientId] = useState(urlPatientId || null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [profileTab, setProfileTab] = useState('overview')

  // Sync URL param to state. The special value "new" is an intent from the
  // dashboard's "New Patient" quick action — open the create form and clear
  // the URL so refresh doesn't reopen it.
  useEffect(() => {
    if (urlPatientId === 'new') {
      setEditingPatient(null)
      setShowForm(true)
      _setSelectedPatientId(null)
      navigate('/patients')
      return
    }
    _setSelectedPatientId(urlPatientId || null)
  }, [urlPatientId])

  const selectedPatientId = _selectedPatientId
  const setSelectedPatient = (id) => {
    if (id) navigate('/patients/' + id)
    else navigate('/patients')
  }

  // Operator not impersonating — show agency message instead of patients
  if (isOperator && !impersonation) {
    return <AgencyEmptyState isRTL={isRTL} setPage={setPage} />
  }

  const normalizePhoneSearch = (p) => (p || '').replace(/[\s\-()]/g, '').replace(/^\+964/, '0').replace(/^964/, '0').replace(/^0+/, '')
  const safeSearch = sanitizeSearch(search)
  const fullNameOf = (p) => p.full_name || p.fullName || ''
  const filtered = patients.filter(p => {
    const q = safeSearch.toLowerCase().trim()
    if (!q) return true
    const qDigits = normalizePhoneSearch(safeSearch)
    return fullNameOf(p).toLowerCase().includes(q)
      || (qDigits.length >= 3 && normalizePhoneSearch(p.phone).includes(qDigits))
  })

  if (selectedPatientId) {
    const p = patients.find(x => x.id === selectedPatientId)
    if (!p) { setSelectedPatient(null); return null }
    return (
      <PatientProfile
        key={p.id}
        t={t} dir={dir} isRTL={isRTL} lang={lang}
        patient={p}
        profileTab={profileTab} setProfileTab={setProfileTab}
        onBack={() => { setSelectedPatient(null); setProfileTab('overview') }}
        onEdit={() => { setEditingPatient(p); setShowForm(true); setSelectedPatient(null) }}
        onDelete={() => showConfirm(
          isRTL ? 'حذف المريض؟' : 'Delete this patient?',
          isRTL ? 'سيتم حذف المريض وجميع البيانات السنية والمواعيد المرتبطة. لا يمكن التراجع.' : 'This will permanently delete the patient and all associated dental data and appointments. This cannot be undone.',
          () => { deletePatient(p.id); setSelectedPatient(null) }
        )}
        toast={toast}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0 }}>{isRTL ? 'المرضى' : 'Patients'}</h1>
          <p style={{ fontSize:13, color:C.textSec, marginTop:4 }}>
            {patientsTotal > patients.length
              ? (isRTL
                  ? `عرض ${patients.length} من أصل ${patientsTotal}`
                  : `Showing ${patients.length} of ${patientsTotal} patients`)
              : `${filtered.length} ${isRTL ? 'مريض' : 'patients'}`}
          </p>
        </div>
        <button data-action="new-patient" onClick={() => { setEditingPatient(null); setShowForm(true) }} className="velo-btn-primary" style={makeBtn('primary', { gap:6 })}>
          {Icons.plus(16)} {isRTL ? 'إضافة مريض' : 'Add Patient'}
        </button>
      </div>

      {/* Filters bar */}
      <div style={{ ...card, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', direction:dir }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:C.bg, borderRadius:8, padding:'6px 12px', border:`1px solid ${C.border}`, flex:1, maxWidth:380 }}>
          <span style={{color:C.textMuted,display:'flex'}}>{Icons.search(16)}</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} maxLength={LIMITS.search}
            placeholder={isRTL ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
            style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:C.text, flex:1, fontFamily:'inherit', direction:dir }} />
        </div>
      </div>

      {/* Patients Table */}
      <div style={{ ...card, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
              {[isRTL?'الاسم':'Name', isRTL?'الهاتف':'Phone', isRTL?'البريد':'Email', isRTL?'الميلاد':'DOB', ''].map((h,i) => (
                <th key={i} style={{ padding:'10px 16px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:12, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:0 }}>
                <EmptyState
                  type="contacts"
                  title={patients.length === 0 ? (isRTL ? 'لا يوجد مرضى بعد' : 'No patients yet') : (isRTL ? 'لا توجد نتائج' : 'No matching patients')}
                  message={patients.length === 0 ? (isRTL ? 'أضف أول مريض لبدء إدارة العيادة' : 'Add your first patient to start managing the clinic') : (isRTL ? 'جرب تعديل مصطلح البحث' : 'Try adjusting your search')}
                  actionLabel={patients.length === 0 ? (isRTL ? 'إضافة مريض' : 'Add Patient') : null}
                  onAction={patients.length === 0 ? () => { setEditingPatient(null); setShowForm(true) } : null}
                  dir={dir} />
              </td></tr>
            ) : filtered.map(p => {
              const name = fullNameOf(p)
              return (
                <tr key={p.id} onClick={() => setSelectedPatient(p.id)}
                  style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer', transition:'background .1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:C.primaryBg, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>{(name || 'P').charAt(0)}</div>
                      <span style={{ fontWeight:600, color:C.text }}>{name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', color:C.textSec, fontFamily:'inherit', fontVariantNumeric:'tabular-nums' }}>{p.phone || '—'}</td>
                  <td style={{ padding:'12px 16px', color:C.textSec }}>{p.email || '—'}</td>
                  <td style={{ padding:'12px 16px', color:C.textMuted, fontSize:12 }}>{p.dob || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={e => { e.stopPropagation(); setEditingPatient(p); setShowForm(true) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, padding:4, borderRadius:4, display:'flex' }} title={isRTL?'تعديل':'Edit'}>{Icons.edit(14)}</button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, padding:4, borderRadius:4, display:'flex' }} title={isRTL?'حذف':'Delete'}>{Icons.trash(14)}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Load More (pagination) */}
      {patientsTotal > patients.length && (
        <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
          <button
            onClick={() => loadMorePatients && loadMorePatients()}
            disabled={patientsLoadingMore}
            style={makeBtn('secondary', { gap:6, opacity: patientsLoadingMore ? 0.6 : 1, cursor: patientsLoadingMore ? 'wait' : 'pointer' })}
          >
            {patientsLoadingMore
              ? (isRTL ? 'جار التحميل...' : 'Loading…')
              : (isRTL
                  ? `تحميل المزيد (${patients.length} من ${patientsTotal})`
                  : `Load more (${patients.length} of ${patientsTotal})`)}
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <PatientFormModal
          t={t} dir={dir} isRTL={isRTL}
          patient={editingPatient}
          onSave={(data) => {
            if (editingPatient) updatePatient(editingPatient.id, data)
            else addPatient(data)
            setShowForm(false); setEditingPatient(null)
          }}
          onClose={() => { setShowForm(false); setEditingPatient(null) }}
        />
      )}

      {/* Confirm Delete */}
      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 12px' }}>
            {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
          </h3>
          <p style={{ fontSize:13, color:C.textSec, marginBottom:20 }}>
            {isRTL ? 'سيتم حذف المريض وجميع بياناته. لا يمكن التراجع.' : 'This will permanently delete the patient and all their data. This cannot be undone.'}
          </p>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmDeleteId(null)} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
            <button onClick={() => { deletePatient(confirmDeleteId); setConfirmDeleteId(null) }} style={makeBtn('danger')}>{isRTL?'حذف':'Delete'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Patient Form Modal ─────────────────────────────────────────────────────
const GENDER_OPTIONS = [
  { id: 'male',              en: 'Male',              ar: 'ذكر' },
  { id: 'female',            en: 'Female',            ar: 'أنثى' },
  { id: 'other',             en: 'Other',             ar: 'آخر' },
  { id: 'prefer_not_to_say', en: 'Prefer not to say', ar: 'أفضّل عدم القول' },
]

function PatientFormModal({ t, dir, isRTL, patient, onSave, onClose }) {
  void t
  const [form, setForm] = useState({
    full_name: patient?.full_name || patient?.fullName || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    dob: patient?.dob || '',
    gender: patient?.gender || '',
    allergies: Array.isArray(patient?.allergies) ? patient.allergies.join(', ') : '',
  })
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = () => {
    if (!form.full_name.trim()) return
    if (!form.phone.trim()) return
    onSave({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      dob: form.dob || null,
      gender: form.gender || null,
      allergies: form.allergies
        ? form.allergies.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    })
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:C.text, margin:0 }}>
          {patient ? (isRTL ? 'تعديل المريض' : 'Edit Patient') : (isRTL ? 'إضافة مريض' : 'Add Patient')}
        </h2>
        <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex' }}>{Icons.x(20)}</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
        <FormField label={isRTL ? 'الاسم الكامل' : 'Full Name'} dir={dir}>
          <input value={form.full_name} onChange={e=>set('full_name', e.target.value)} maxLength={LIMITS.name} style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'رقم الهاتف' : 'Phone'} dir={dir}>
          <input value={form.phone} onChange={e=>set('phone', e.target.value)} maxLength={LIMITS.phone} style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'البريد الإلكتروني' : 'Email'} dir={dir}>
          <input value={form.email} onChange={e=>set('email', e.target.value)} type="email" maxLength={LIMITS.email} style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'تاريخ الميلاد' : 'Date of Birth'} dir={dir}>
          <input value={form.dob} onChange={e=>set('dob', e.target.value)} type="date" style={inputStyle(dir)} />
        </FormField>
        <FormField label={isRTL ? 'الجنس' : 'Gender'} dir={dir}>
          <select value={form.gender} onChange={e=>set('gender', e.target.value)} style={selectStyle(dir)}>
            <option value="">{isRTL ? '— غير محدد —' : '— Not specified —'}</option>
            {GENDER_OPTIONS.map(g => <option key={g.id} value={g.id}>{isRTL ? g.ar : g.en}</option>)}
          </select>
        </FormField>
        <FormField label={isRTL ? 'الحساسيات (مفصولة بفواصل)' : 'Allergies (comma separated)'} dir={dir}>
          <input value={form.allergies} onChange={e=>set('allergies', e.target.value)} maxLength={500} style={inputStyle(dir)} placeholder={isRTL ? 'مثال: بنسلين، لاتكس' : 'e.g. penicillin, latex'} />
        </FormField>
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
        <button onClick={onClose} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
        <button onClick={handleSubmit} className="velo-btn-primary" style={makeBtn('primary')}>{isRTL?'حفظ':'Save'}</button>
      </div>
    </Modal>
  )
}

// ── Loading / error placeholders for dental tabs ───────────────────────────
function DentalSpinner({ isRTL }) {
  return (
    <div style={{ ...card, padding: 48, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
      {isRTL ? 'جاري التحميل...' : 'Loading...'}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT PROFILE
// ═══════════════════════════════════════════════════════════════════════════
function PatientProfile({ t, dir, isRTL, lang, patient, profileTab, setProfileTab, onBack, onEdit, onDelete, toast }) {
  void t
  void lang
  // Payments state — pulled lazily when the Payments tab is opened or on mount.
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setPaymentsLoading(true)
    db.fetchPaymentsByPatient(patient.id)
      .then(data => { if (!cancelled) { setPayments(data); setPaymentsLoading(false) } })
      .catch(() => { if (!cancelled) setPaymentsLoading(false) })
    return () => { cancelled = true }
  }, [patient.id])

  const addPayment = async (raw) => {
    try {
      const saved = await db.insertPayment({ ...raw, patient_id: patient.id })
      setPayments(prev => [saved, ...prev])
    } catch (err) {
      console.error('Add payment error:', err)
      toast?.(isRTL ? 'فشل إضافة الدفعة' : 'Failed to add payment', 'error')
    }
  }
  const deletePayment = async (id) => {
    try {
      await db.removePayment(id)
      setPayments(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('Delete payment error:', err)
      toast?.(isRTL ? 'فشل حذف الدفعة' : 'Failed to delete payment', 'error')
    }
  }

  // Appointments tab — fetched on demand via the appointments helper.
  const [appointments, setAppointments] = useState([])
  const [apptsLoading, setApptsLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (profileTab !== 'appointments') return
    setApptsLoading(true)
    listAppointmentsForPatient(patient.id)
      .then(rows => { if (!cancelled) { setAppointments(rows); setApptsLoading(false) } })
      .catch(err => {
        if (!cancelled) setApptsLoading(false)
        console.error('listAppointmentsForPatient error:', err)
      })
    return () => { cancelled = true }
  }, [patient.id, profileTab])

  const fullName = patient.full_name || patient.fullName || ''
  const allergies = Array.isArray(patient.allergies) ? patient.allergies : []

  const tabs = [
    { id: 'overview',     label: isRTL ? 'نظرة عامة'    : 'Overview' },
    { id: 'appointments', label: isRTL ? 'المواعيد'      : 'Appointments' },
    { id: 'payments',     label: isRTL ? 'المدفوعات'     : 'Payments' },
    { id: 'medical',      label: isRTL ? 'التاريخ الطبي' : 'Medical History' },
    { id: 'dental_chart', label: isRTL ? 'مخطط الأسنان' : 'Dental Chart' },
    { id: 'treatments',   label: isRTL ? 'خطة العلاج'    : 'Treatment Plan' },
  ]

  // Heavy tabs (Payments, Medical, Dental Chart, Treatments) keep their existing
  // implementations for now — Phase 2.2 only redesigns Overview + Appointments
  // and the chrome (header / tab bar). The dental chart visual is tackled in
  // Phase 3 (anatomical SVGs).
  const heavyTab = profileTab === 'payments' || profileTab === 'medical' || profileTab === 'dental_chart' || profileTab === 'treatments'

  return (
    <div
      dir={dir}
      className="ds-root min-h-full -m-4 md:-m-8 p-4 md:p-8 box-border"
      style={{ background: 'var(--ds-canvas-gradient)' }}
    >
      <div className="relative max-w-[1280px] mx-auto flex flex-col gap-5">
        <div className="ds-ambient" />

        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800 transition-colors"
        >
          {isRTL ? Icons.arrowRight(16) : Icons.arrowLeft(16)}
          {isRTL ? 'العودة إلى المرضى' : 'Back to Patients'}
        </button>

        {/* ── Profile header ─────────────────────────────────────────── */}
        <GlassCard padding="lg" className="relative overflow-hidden">
          {/* Subtle navy → white gradient backdrop */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'linear-gradient(135deg, rgba(221,231,244,0.6) 0%, rgba(255,255,255,0) 60%)' }}
          />
          <div className="relative flex items-start gap-5 flex-wrap md:flex-nowrap">
            <span
              aria-hidden="true"
              className={`grid place-items-center w-24 h-24 rounded-2xl text-white text-3xl font-bold shadow-glass-lg shrink-0 bg-gradient-to-br ${avatarGradient(fullName)}`}
            >
              {avatarInitials(fullName)}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-semibold text-navy-900 leading-tight tracking-tight m-0">
                {fullName || '—'}
              </h2>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-navy-700">
                {patient.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    {Icons.phone(14)} <span className="tabular-nums" dir="ltr">{patient.phone}</span>
                  </span>
                )}
                {patient.email && (
                  <span className="inline-flex items-center gap-1.5">
                    {Icons.mail(14)} <span dir="ltr">{patient.email}</span>
                  </span>
                )}
                {patient.dob && (
                  <span className="inline-flex items-center gap-1.5">
                    {Icons.calendar(14)} <span className="tabular-nums">{patient.dob}</span>
                  </span>
                )}
              </div>
              {allergies.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                    {isRTL ? 'حساسيات' : 'Allergies'}
                  </span>
                  {allergies.map((a, i) => (
                    <Badge key={i} tone="warning" size="sm" dot>{a}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={onEdit}
                iconStart={Icons.edit}
              >
                {isRTL ? 'تعديل' : 'Edit Patient'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                iconStart={Icons.trash}
              >
                {isRTL ? 'حذف' : 'Delete'}
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* ── Quick contact bar ──────────────────────────────────────── */}
        {patient.phone && (
          <GlassCard padding="md" className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-navy-500 me-1">
              {isRTL ? 'تواصل عبر' : 'Reach out via'}
            </span>
            <button
              type="button"
              onClick={() => window.open(`https://wa.me/${(patient.phone || '').replace(/[^0-9+]/g, '')}`, '_blank')}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-semibold transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              WhatsApp
            </button>
            <a
              href={`tel:${patient.phone}`}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-white/80 border border-navy-100 text-navy-700 hover:border-navy-200 text-sm font-semibold no-underline transition-colors"
              dir="ltr"
            >
              {Icons.phone(14)} {isRTL ? 'اتصال' : 'Call'}
            </a>
          </GlassCard>
        )}

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <div className="border-b border-navy-100/80 overflow-x-auto -mx-1 px-1">
          <div className="flex items-end gap-1 min-w-max">
            {tabs.map(tab => {
              const active = profileTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setProfileTab(tab.id) }}
                  className={[
                    'relative px-4 py-2.5 text-sm whitespace-nowrap transition-colors',
                    'focus-visible:outline-none focus-visible:text-navy-900 focus-visible:bg-navy-50/40 rounded-t-md',
                    active
                      ? 'text-navy-900 font-semibold'
                      : 'text-navy-500 hover:text-navy-700 font-medium',
                  ].join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                      style={{ background: 'linear-gradient(90deg, #103562, #06B6D4)' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Tab content ────────────────────────────────────────────── */}
        <div className="animate-fade-in" key={profileTab}>
          {profileTab === 'overview' && (
            <GlassCard padding="lg">
              <h3 className="text-base font-semibold text-navy-900 m-0 mb-5">
                {isRTL ? 'معلومات المريض' : 'Patient Information'}
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                {[
                  [isRTL ? 'الاسم'    : 'Full Name',     fullName || '—'],
                  [isRTL ? 'الهاتف'   : 'Phone',         patient.phone || '—'],
                  [isRTL ? 'البريد'   : 'Email',         patient.email || '—'],
                  [isRTL ? 'الميلاد'  : 'Date of Birth', patient.dob   || '—'],
                  [isRTL ? 'الجنس'    : 'Gender',        patient.gender ? (GENDER_OPTIONS.find(g => g.id === patient.gender)?.[isRTL ? 'ar' : 'en'] || patient.gender) : '—'],
                  [isRTL ? 'الحساسيات' : 'Allergies',    allergies.length ? allergies.join(', ') : '—'],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mb-1">{label}</dt>
                    <dd className="text-sm text-navy-800 m-0">{value}</dd>
                  </div>
                ))}
              </dl>
            </GlassCard>
          )}

          {profileTab === 'appointments' && (
            apptsLoading ? <DentalSpinner isRTL={isRTL} /> :
            appointments.length === 0 ? (
              <GlassCard padding="lg" className="text-center text-sm text-navy-500">
                {isRTL ? 'لا توجد مواعيد' : 'No appointments yet'}
              </GlassCard>
            ) : (
              <ol className="flex flex-col gap-3">
                {appointments.map(a => {
                  const d = new Date(a.scheduled_at)
                  const valid = !isNaN(d.getTime())
                  const dateStr = valid
                    ? d.toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    : ''
                  const timeStr = valid
                    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                    : ''
                  const tone = (
                    a.status === 'completed' ? 'success' :
                    a.status === 'cancelled' || a.status === 'no_show' ? 'danger' :
                    a.status === 'confirmed' || a.status === 'in_progress' ? 'cyan' :
                    'warning'
                  )
                  return (
                    <li key={a.id}>
                      <GlassCard padding="md" className="flex items-center gap-4 flex-wrap">
                        <div className="flex flex-col items-center justify-center w-20 shrink-0">
                          <span className="text-2xl font-bold text-navy-900 tabular-nums leading-none">{timeStr}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 mt-1.5">{dateStr}</span>
                        </div>
                        <span aria-hidden="true" className="self-stretch w-px bg-navy-100/80" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy-800 capitalize m-0">
                            {(a.type || '—').replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-navy-500 m-0 mt-1">
                            {a.duration_minutes || 30} {isRTL ? 'دقيقة' : 'min'}
                          </p>
                        </div>
                        <Badge tone={tone} dot>{(a.status || '').replace(/_/g, ' ')}</Badge>
                      </GlassCard>
                    </li>
                  )
                })}
              </ol>
            )
          )}

          {/* Heavy tabs render in their existing chrome inside a glass shell.
              The wrapper provides the new canvas + spacing; the tabs' inner
              dark-card styling (PaymentsTab, DentalTabs.*) is preserved
              until a later pass. */}
          {heavyTab && (
            <div className="relative">
              {profileTab === 'payments' && (
                paymentsLoading
                  ? <DentalSpinner isRTL={isRTL} />
                  : <PaymentsTab payments={payments} addPayment={addPayment} deletePayment={deletePayment} dir={dir} isRTL={isRTL} />
              )}
              {profileTab === 'medical' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalMedicalHistory patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
              {profileTab === 'dental_chart' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalChartWrapper patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
              {profileTab === 'treatments' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalTreatments patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENTS TAB (new schema — amount_minor + payment_method enum, no status)
// ═══════════════════════════════════════════════════════════════════════════
const PAYMENT_METHODS = [
  { id: 'cash',        en: 'Cash',        ar: 'نقداً',      icon: '💵' },
  { id: 'fib',         en: 'FIB',         ar: 'FIB',         icon: '🏦' },
  { id: 'zaincash',    en: 'ZainCash',    ar: 'زين كاش',     icon: '📱' },
  { id: 'asia_hawala', en: 'Asia Hawala', ar: 'آسيا حوالة',  icon: '💱' },
  { id: 'card',        en: 'Card',        ar: 'بطاقة',       icon: '💳' },
  { id: 'other',       en: 'Other',       ar: 'أخرى',        icon: '🔖' },
]

function PaymentsTab({ payments, addPayment, deletePayment, dir, isRTL }) {
  const [showForm, setShowForm] = useState(false)
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null)
  const [form, setForm] = useState({ amount: '', currency: 'IQD', method: 'cash', notes: '' })

  // Sum totals per currency. Don't sum across currencies (per CLAUDE.md).
  const totals = payments.reduce((acc, p) => {
    const cur = p.currency || 'IQD'
    acc[cur] = (acc[cur] || 0) + Number(p.amountMinor || p.amount_minor || 0)
    return acc
  }, {})

  const handleAdd = () => {
    if (!form.amount) return
    const amount_minor = toMinor(form.amount, form.currency)
    if (!amount_minor || amount_minor < 1) return
    addPayment({
      amount_minor,
      currency: form.currency,
      method: form.method,
      notes: form.notes || null,
    })
    setForm({ amount: '', currency: 'IQD', method: 'cash', notes: '' })
    setShowForm(false)
  }

  return (
    <div className="ds-root">
      <GlassCard padding="lg">
        {/* Totals per currency */}
        {Object.keys(totals).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {Object.entries(totals).map(([cur, sum]) => (
              <div key={cur} className="rounded-glass border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                  {isRTL ? 'إجمالي' : 'Total'} ({cur})
                </div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">
                  {formatMoney(sum, cur)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-navy-900 m-0">
            {isRTL ? 'المدفوعات' : 'Payments'} ({payments.length})
          </h3>
          <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={() => setShowForm(true)}>
            {isRTL ? 'إضافة دفعة' : 'Record Payment'}
          </Button>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-navy-500 text-center py-6 m-0">
            {isRTL ? 'لا توجد مدفوعات' : 'No payments recorded'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {payments.map(p => {
              const meth = PAYMENT_METHODS.find(m => m.id === p.method) || PAYMENT_METHODS[0]
              const amountMinor = p.amountMinor ?? p.amount_minor ?? 0
              const recordedAt = p.recordedAt || p.recorded_at || p.created_at
              const dateStr = recordedAt ? new Date(recordedAt).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US') : ''
              return (
                <li key={p.id} className="flex items-center gap-3 py-3 border-b border-navy-100/60 last:border-b-0">
                  <span aria-hidden="true" className="grid place-items-center w-9 h-9 rounded-md bg-navy-50 text-base shrink-0">
                    {meth.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-navy-900 tabular-nums">
                      {formatMoney(amountMinor, p.currency || 'IQD')}
                    </div>
                    <div className="text-xs text-navy-500 mt-1">
                      {isRTL ? meth.ar : meth.en}
                      {dateStr && <> &middot; {dateStr}</>}
                      {p.notes && <> &middot; {p.notes}</>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePayment(p.id)}
                    aria-label={isRTL ? 'حذف' : 'Delete'}
                    className="grid place-items-center w-8 h-8 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    {Icons.trash(14)}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </GlassCard>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} dir={dir} width={480}>
          <div className="ds-root">
            <form onSubmit={e => { e.preventDefault(); handleAdd() }}>
              <h3 className="text-lg font-semibold text-navy-900 m-0 mb-4">
                {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
              </h3>
              <div className="grid grid-cols-2 gap-x-3">
                <FormField label={isRTL ? 'المبلغ' : 'Amount'} dir={dir}>
                  <input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} type="number" step="0.01" min="0" style={inputStyle(dir)} />
                </FormField>
                <FormField label={isRTL ? 'العملة' : 'Currency'} dir={dir}>
                  <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} style={selectStyle(dir)}>
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                  </select>
                </FormField>
                <FormField label={isRTL ? 'طريقة الدفع' : 'Payment Method'} dir={dir}>
                  <select value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))} style={selectStyle(dir)}>
                    {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.icon} {isRTL ? m.ar : m.en}</option>)}
                  </select>
                </FormField>
                <div />
              </div>
              <FormField label={isRTL ? 'ملاحظات' : 'Notes'} dir={dir}>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder={isRTL ? 'مثال: إيصال #1234' : 'e.g. receipt #1234'} style={inputStyle(dir)} />
              </FormField>
              <div className="flex gap-2 justify-end mt-3">
                <Button variant="secondary" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
                <Button variant="primary" type="submit">{isRTL ? 'حفظ' : 'Save'}</Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {confirmDeletePayment && (
        <Modal onClose={() => setConfirmDeletePayment(null)} dir={dir} width={400}>
          <div className="ds-root text-center px-2">
            <h3 className="text-lg font-semibold text-navy-900 m-0 mb-2">
              {isRTL ? 'حذف الدفعة؟' : 'Delete this payment?'}
            </h3>
            <p className="text-sm text-navy-600 m-0 mb-4">
              {isRTL ? 'لا يمكن التراجع عن هذا' : 'This action cannot be undone'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={() => setConfirmDeletePayment(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="destructive" onClick={() => { deletePayment(confirmDeletePayment); setConfirmDeletePayment(null) }}>{isRTL ? 'حذف' : 'Delete'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// INBOX PAGE — Unified Messaging
// ═══════════════════════════════════════════════════════════════════════════

const CHANNEL_META = {
  whatsapp:  { color: '#25D366', bg: '#E7FFF1', label: 'WhatsApp' },
  email:     { color: '#00FFB2', bg: 'rgba(0,255,178,0.09)', label: 'Email' },
  facebook:  { color: '#1877F2', bg: '#E7F0FF', label: 'Facebook' },
  instagram: { color: '#E4405F', bg: '#FFE8ED', label: 'Instagram' },
  sms:       { color: '#A78BFA', bg: 'rgba(124,58,237,0.1)', label: 'SMS' },
}

const ChannelIcon = ({ channel, size = 18 }) => {
  const paths = {
    whatsapp: <><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></>,
    email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    facebook: <><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></>,
    instagram: <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></>,
    sms: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  }
  const meta = CHANNEL_META[channel] || CHANNEL_META.email
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[channel] || paths.email}
    </svg>
  )
}

const FILTER_TABS = [
  { id: 'all', key: 'allChannels' },
  { id: 'whatsapp', key: 'whatsapp' },
  { id: 'email', key: 'emailChannel' },
  { id: 'social', key: 'social', channels: ['facebook', 'instagram'] },
  { id: 'sms', key: 'sms' },
]

function InboxPage({ t, lang, dir, isRTL, contacts, setPage, urlConvId, navigate, teamMembers, isOperator, impersonation, orgId, demoMode, toast, sampleData }) {
  void teamMembers
  // Demo conversations land via sampleData prop once the dynamic import
  // resolves; non-demo runs start empty and populate from Supabase.
  const [conversations, setConversations] = useState([])
  useEffect(() => {
    if (demoMode && sampleData?.SAMPLE_CONVERSATIONS) {
      setConversations(sampleData.SAMPLE_CONVERSATIONS)
    }
  }, [demoMode, sampleData])
  const [_activeConvId, _setActiveConvId] = useState(urlConvId || null)

  useEffect(() => { _setActiveConvId(urlConvId || null) }, [urlConvId])

  const activeConvId = _activeConvId
  const setActiveConvId = (id) => {
    if (id) navigate('/inbox/' + id)
    else navigate('/inbox')
  }
  const [filter, setFilter] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [showAiSuggestion, setShowAiSuggestion] = useState(false)
  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)

  const activeConv = conversations.find(c => c.id === activeConvId)

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages?.length])

  // Mark as read when selecting conversation
  useEffect(() => {
    if (activeConvId) {
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, unread: 0 } : c))
    }
  }, [activeConvId])

  // Filter conversations
  const filtered = conversations.filter(c => {
    const matchFilter = filter === 'all' ||
      (filter === 'social' ? ['facebook','instagram'].includes(c.channel) : c.channel === filter)
    const q = searchQ.toLowerCase()
    const matchSearch = !q || c.contactName.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeConvId) return
    const trimmed = msgInput.trim()
    const now = new Date()
    const timeStr = now.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: 'numeric', minute: '2-digit' })
    const tempId = `msg_${Date.now()}`
    const newMsg = { id: tempId, sender: 'me', text: trimmed, time: timeStr, date: now.toISOString().slice(0,10), pending: true }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, messages: [...(c.messages || []), newMsg], lastMessage: trimmed, lastTime: timeStr } : c
    ))
    setMsgInput('')
    setShowAiSuggestion(false)

    // Real WhatsApp send only when we have an org context, a patient/contact id,
    // a WhatsApp channel, and we're not in demo mode. Anything else stays
    // local-only (legacy demo behavior).
    const conv = conversations.find(c => c.id === activeConvId)
    const canRealSend = !demoMode && orgId && conv?.contactId && conv?.channel === 'whatsapp'
    if (!canRealSend) {
      // Mark optimistic message as not-pending so UI doesn't show indefinite spinner.
      setConversations(prev => prev.map(c =>
        c.id === activeConvId
          ? { ...c, messages: (c.messages || []).map(m => m.id === tempId ? { ...m, pending: false } : m) }
          : c
      ))
      return
    }

    try {
      const { sendWhatsAppMessage } = await import('./lib/whatsapp')
      await sendWhatsAppMessage(orgId, conv.contactId, trimmed)
      setConversations(prev => prev.map(c =>
        c.id === activeConvId
          ? { ...c, messages: (c.messages || []).map(m => m.id === tempId ? { ...m, pending: false } : m) }
          : c
      ))
    } catch (err) {
      if (toast) toast(`${isRTL ? 'فشل الإرسال:' : 'Send failed:'} ${err.message}`, 'error')
      setConversations(prev => prev.map(c =>
        c.id === activeConvId
          ? { ...c, messages: (c.messages || []).map(m => m.id === tempId ? { ...m, pending: false, failed: true } : m) }
          : c
      ))
    }
  }

  const handleAttach = (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeConvId) return
    const now = new Date()
    const timeStr = now.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: 'numeric', minute: '2-digit' })
    const newMsg = { id: `msg_${Date.now()}`, sender: 'me', text: `📎 ${file.name}`, time: timeStr, date: now.toISOString().slice(0,10), isFile: true }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, messages: [...c.messages, newMsg], lastMessage: `📎 ${file.name}`, lastTime: timeStr } : c
    ))
  }

  // AI suggestion texts
  const aiSuggestions = [
    "Thanks for getting back to me! I'd be happy to schedule a call. Would tomorrow at 2 PM work for you?",
    "I appreciate your patience. Let me check with the team and get back to you within the hour.",
    "Great question! I'll prepare a detailed breakdown and send it over shortly.",
  ]

  const applyAiSuggestion = (text) => {
    setMsgInput(text)
    setShowAiSuggestion(false)
  }

  // Get contact for active conversation
  const activeContact = activeConv ? contacts.find(c => c.id === activeConv.contactId) : null

  // Operator + not-impersonating: show the agency empty-state instead of the
  // clinic inbox. The early return must come AFTER all hook calls above so
  // we don't break rules-of-hooks ordering.
  if (isOperator && !impersonation) return <AgencyEmptyState isRTL={isRTL} setPage={setPage} />

  return (
    <div style={{ display:'flex', height:'calc(100vh - 108px)', margin:-24, marginTop:-24, direction:dir }}>
      {/* ── LEFT PANEL: Conversation List ────────────────────────────── */}
      <div style={{
        width: 360, minWidth: 360, borderRight: isRTL ? 'none' : `1px solid ${C.border}`,
        borderLeft: isRTL ? `1px solid ${C.border}` : 'none',
        display: 'flex', flexDirection: 'column', background: C.white,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
              {t.inbox}
              {totalUnread > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.white, background: C.danger, padding: '2px 7px', borderRadius: 10, marginLeft: 8, marginRight: 8 }}>{totalUnread}</span>}
            </h2>
            <button className="velo-btn-primary" style={makeBtn('primary', { padding: '6px 12px', fontSize: 12, gap: 5 })}>
              {Icons.plus(14)} {t.compose}
            </button>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 8, padding: '7px 12px', border: `1px solid ${C.border}`, marginBottom: 12 }}>
            <span style={{ color: C.textMuted, display: 'flex' }}>{Icons.search(14)}</span>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder={t.searchConversations}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: C.text, flex: 1, fontFamily: 'inherit', direction: dir }} />
          </div>

          {/* Channel Filter Tabs */}
          <div style={{ display: 'flex', gap: 4, overflow: 'auto' }}>
            {FILTER_TABS.map(tab => {
              const isActive = filter === tab.id
              const count = tab.id === 'all' ? conversations.length :
                tab.channels ? conversations.filter(c => tab.channels.includes(c.channel)).length :
                conversations.filter(c => c.channel === tab.id).length
              return (
                <button key={tab.id} onClick={() => setFilter(tab.id)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                    background: isActive ? C.primary : C.bg, color: isActive ? '#fff' : C.textSec,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  {tab.id !== 'all' && tab.id !== 'social' && <ChannelIcon channel={tab.id} size={12} />}
                  {t[tab.key]} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <EmptyState type="inbox" title={isRTL ? 'لا توجد رسائل' : 'No conversations'} message={isRTL ? 'ستظهر المحادثات هنا عند استلام الرسائل' : 'Conversations will appear here when messages are received'} dir={dir} />
          ) : filtered.map(conv => {
            const isActive = conv.id === activeConvId
            const ch = CHANNEL_META[conv.channel]
            return (
              <div key={conv.id} onClick={() => setActiveConvId(conv.id)}
                style={{
                  padding: '14px 18px', display: 'flex', gap: 12, cursor: 'pointer',
                  background: isActive ? C.primaryBg : 'transparent',
                  borderBottom: `1px solid ${C.border}`,
                  borderLeft: isActive && !isRTL ? `3px solid ${C.primary}` : '3px solid transparent',
                  borderRight: isActive && isRTL ? `3px solid ${C.primary}` : '3px solid transparent',
                  transition: 'all .1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.bg }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                {/* Avatar with channel indicator */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: ch.bg, color: ch.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 600,
                  }}>
                    {conv.contactName.charAt(0)}
                  </div>
                  <div style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 18, height: 18, borderRadius: '50%', background: C.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${C.border}`,
                  }}>
                    <ChannelIcon channel={conv.channel} size={10} />
                  </div>
                  {conv.status === 'online' && (
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#25D366', border: '2px solid #fff' }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: conv.unread > 0 ? 700 : 600, color: C.text }}>{conv.contactName}</span>
                    <span style={{ fontSize: 11, color: conv.unread > 0 ? C.primary : C.textMuted, fontWeight: conv.unread > 0 ? 600 : 400 }}>{conv.lastTime}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{conv.company}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontSize: 12, color: conv.unread > 0 ? C.text : C.textMuted,
                      fontWeight: conv.unread > 0 ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {conv.lastMessage}
                    </span>
                    {conv.unread > 0 && (
                      <span style={{
                        background: C.primary, color: '#fff', fontSize: 10, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center', flexShrink: 0,
                      }}>
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat View ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        {!activeConv ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {Icons.inbox(36)}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{t.inbox}</h3>
            <p style={{ fontSize: 13, color: C.textMuted }}>{t.noConversation}</p>
          </div>
        ) : (
          <>
            {/* ── Chat Header / Top Bar ────────────────────────────── */}
            <div style={{
              padding: '12px 20px', background: C.white, borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: CHANNEL_META[activeConv.channel].bg,
                  color: CHANNEL_META[activeConv.channel].color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 600,
                }}>
                  {activeConv.contactName.charAt(0)}
                </div>
                {activeConv.status === 'online' && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#25D366', border: '2px solid #fff' }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{activeConv.contactName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textMuted }}>
                  <ChannelIcon channel={activeConv.channel} size={12} />
                  <span>{CHANNEL_META[activeConv.channel].label}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: C.textMuted }} />
                  <span style={{ color: activeConv.status === 'online' ? '#25D366' : C.textMuted, fontWeight: 500 }}>
                    {activeConv.status === 'online' ? t.online : t.offline}
                  </span>
                </div>
              </div>
              {/* Quick Actions */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {activeContact && (
                  <button onClick={() => setPage('patients/' + activeContact.id)} style={makeBtn('secondary', { padding: '6px 10px', fontSize: 11, gap: 4 })}>
                    {Icons.user(13)} {t.viewProfile}
                  </button>
                )}
                <button style={makeBtn('secondary', { padding: '6px 10px', fontSize: 11, gap: 4 })}>
                  {Icons.calendar(13)} {t.schedule}
                </button>
              </div>
            </div>

            {/* ── Messages Area ────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                let lastDate = ''
                return activeConv.messages.map((msg) => {
                  const isMe = msg.sender === 'me'
                  const showDate = msg.date !== lastDate
                  lastDate = msg.date
                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {showDate && (
                        <div style={{ textAlign: 'center', margin: '12px 0', position: 'relative' }}>
                          <span style={{
                            fontSize: 11, color: C.textMuted, background: C.bg,
                            padding: '2px 12px', position: 'relative', zIndex: 1,
                            fontWeight: 500,
                          }}>
                            {new Date(msg.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: C.border, zIndex: 0 }} />
                        </div>
                      )}
                      {/* Bubble */}
                      <div style={{
                        display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
                        marginBottom: 4,
                      }}>
                        <div style={{
                          maxWidth: '65%', padding: '10px 14px', borderRadius: 14,
                          borderTopRightRadius: isMe && !isRTL ? 4 : 14,
                          borderTopLeftRadius: isMe && isRTL ? 4 : (!isMe && !isRTL ? 4 : 14),
                          borderBottomLeftRadius: !isMe && isRTL ? 4 : 14,
                          background: isMe ? C.primary : C.white,
                          color: isMe ? '#fff' : C.text,
                          border: isMe ? 'none' : `1px solid ${C.border}`,
                          boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                        }}>
                          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text}</div>
                          <div style={{
                            fontSize: 10, marginTop: 4,
                            color: isMe ? 'rgba(255,255,255,.7)' : C.textMuted,
                            textAlign: isMe ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left'),
                            display: 'flex', alignItems: 'center', gap: 4,
                            justifyContent: isMe ? 'flex-end' : 'flex-start',
                          }}>
                            {msg.time}
                            {isMe && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .7 }}>
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
              <div ref={chatEndRef} />
            </div>

            {/* ── AI Suggestion Popup ──────────────────────────────── */}
            {showAiSuggestion && (
              <div style={{
                margin: '0 24px', padding: 14, background: C.white, borderRadius: 12,
                border: `1px solid ${C.primary}33`, boxShadow: '0 4px 12px rgba(0,0,0,.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${C.primary}, #A78BFA)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{t.aiSuggestion}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setShowAiSuggestion(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, display: 'flex' }}>{Icons.x(14)}</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {aiSuggestions.map((s, i) => (
                    <button key={i} onClick={() => applyAiSuggestion(s)}
                      style={{
                        padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                        background: C.bg, color: C.text, fontSize: 12, textAlign: isRTL ? 'right' : 'left',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', lineHeight: 1.4,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.primaryBg; e.currentTarget.style.borderColor = C.primary }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.borderColor = C.border }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Message Input ────────────────────────────────────── */}
            <div style={{
              padding: '14px 20px', background: C.white, borderTop: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'flex-end', gap: 10,
            }}>
              {/* Attach */}
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleAttach} />
              <button onClick={() => fileInputRef.current?.click()}
                title={t.attachFile}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.textSec, flexShrink: 0,
                }}>
                {Icons.upload(16)}
              </button>

              {/* Emoji placeholder */}
              <button style={{
                width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.textSec, flexShrink: 0, fontSize: 18,
              }}>
                😊
              </button>

              {/* Text input */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'flex-end', gap: 0,
                background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
                padding: '0 4px 0 14px', minHeight: 40,
              }}>
                <textarea
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={t.typeReply}
                  rows={1}
                  style={{
                    flex: 1, border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 13, color: C.text, fontFamily: 'inherit', padding: '9px 0',
                    resize: 'none', direction: dir, lineHeight: 1.4, maxHeight: 100,
                  }}
                />
              </div>

              {/* AI Reply */}
              <button onClick={() => setShowAiSuggestion(!showAiSuggestion)}
                title={t.aiReply}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: showAiSuggestion ? `linear-gradient(135deg, ${C.primary}, #A78BFA)` : C.white,
                  border: showAiSuggestion ? 'none' : `1px solid ${C.border}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: showAiSuggestion ? '#fff' : C.textSec, flexShrink: 0,
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </button>

              {/* Send */}
              <button onClick={sendMessage}
                style={{
                  width: 40, height: 40, borderRadius: 10, border: 'none',
                  background: msgInput.trim() ? C.primary : C.border,
                  cursor: msgInput.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', flexShrink: 0, transition: 'background .15s',
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL
                    ? <><line x1="2" y1="12" x2="22" y2="12"/><polyline points="16 6 22 12 16 18"/></>
                    : <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>
                  }
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════
function PlaceholderPage({ page, t, icon }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:400, gap:16 }}>
      <div style={{ width:72, height:72, borderRadius:16, background:C.primaryBg, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon ? icon(36) : Icons.dashboard(36)}</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0 }}>{t[page]||page}</h2>
      <p style={{ fontSize:14, color:C.textSec, maxWidth:400, textAlign:'center', lineHeight:1.6 }}>{t.loading||'Coming soon...'}</p>
    </div>
  )
}
