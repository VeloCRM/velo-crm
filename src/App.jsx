import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { T } from './translations'
import { C, CAT_COLORS, STAGE_COLORS, makeBtn, card } from './design'
import {
  SAMPLE_CONTACTS, SAMPLE_TASKS,
  SAMPLE_MESSAGES, SAMPLE_APPOINTMENTS, SAMPLE_ACTIVITIES,
  SAMPLE_CONVERSATIONS,
} from './sampleData'
import AuthPage from './pages/Auth'
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const OnboardingPage = lazy(() => import('./pages/Onboarding'))
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'))
const FormsPage = lazy(() => import('./pages/FormsPage'))
const SocialPage = lazy(() => import('./pages/SocialPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const GoalsPage = lazy(() => import('./pages/GoalsPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const AgencyDashboard = lazy(() => import('./pages/AgencyDashboard'))
const DentalDashboard = lazy(() => import('./pages/DentalDashboard'))
const GrowthIntelligence = lazy(() => import('./pages/growth/GrowthIntelligence'))
const ClinicCredentialsPage = lazy(() => import('./pages/operator/ClinicCredentials'))
import CommandPalette from './components/CommandPalette'
import AIAssistant from './components/AIAssistant'
import NotificationCenter from './components/NotificationCenter'
import TestAccountBanner from './components/TestAccountBanner'
import { SkeletonDashboard, SkeletonContacts, SkeletonInbox, SkeletonCalendar, SkeletonGeneric } from './components/Skeleton'
import { useToast, ToastContainer } from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import EmptyState from './components/EmptyState'
import KeyboardShortcutsHelp from './components/KeyboardShortcuts'
import { MedicalHistoryTab as DentalMedicalHistory, DentalChartTab as DentalChartWrapper, TreatmentPlanTab as DentalTreatments, PrescriptionsTab as DentalPrescriptions, XRaysTab as DentalXRays } from './components/DentalTabs'
import { signOut, getCurrentUser, onAuthStateChange } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import * as db from './lib/database'
import * as dental from './lib/dental'
import { DENTAL_SUPABASE_ENABLED } from './lib/featureFlags'
import { calculateLeadScore } from './lib/ai'
import { sanitizeContact, isSessionExpired, touchSession, clearAllVeloData, sanitizePathParam, sanitizeSearch, validateContactForSave, LIMITS, checkSupabaseRateLimit } from './lib/sanitize'
import { acceptInvitation, getPendingInvite, clearPendingInvite, rememberPendingInvite } from './lib/invitations'
import { can, canWrite, canDelete, normalizeRole, isReadOnlyRole } from './lib/permissions'
import { useIsOperator } from './lib/operator'
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
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { USD:'$', EUR:'€', GBP:'£', IQD:'IQD ', AED:'AED ', SAR:'SAR ' }
const fmtMoney = (n, currency) => (CURRENCY_SYMBOLS[currency] || '$') + Number(n||0).toLocaleString()
const fmt$ = (n) => '$' + Number(n||0).toLocaleString()

// Demo mode is opt-in via ?demo=1. Loads SAMPLE_* stub data. Never writes to Supabase.
const isDemoMode = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === '1'
const WIDGET_IDS = ['stats','chart','tasks','recentContacts','activity','inboxPreview','appointments','topLeads','pendingPayments','financeSummary']
const DEFAULT_LAYOUT = {
  order: WIDGET_IDS,
  visible: Object.fromEntries(WIDGET_IDS.map(id => [id, true])),
}
function loadLayout() {
  try {
    const s = localStorage.getItem('velo_dashboard_layout')
    if (s) { const p = JSON.parse(s); return { order: p.order||DEFAULT_LAYOUT.order, visible: {...DEFAULT_LAYOUT.visible, ...(p.visible||{})} } }
  } catch {}
  return {...DEFAULT_LAYOUT}
}
function saveLayout(layout) { localStorage.setItem('velo_dashboard_layout', JSON.stringify(layout)) }

const STATUS_COLORS = {
  active: { bg: 'rgba(0,255,178,0.1)', text: '#00FFB2' },
  lead: { bg: 'rgba(77,166,255,0.12)', text: '#4DA6FF' },
  inactive: { bg: 'rgba(255,255,255,0.05)', text: '#7B7F9E' },
}

let _idCounter = 100
const genId = (prefix) => `${prefix}${++_idCounter}`

function daysBetween(d1, d2) {
  const a = new Date(d1), b = new Date(d2)
  return Math.max(0, Math.round((b - a) / 86400000))
}

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
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [orgSettings, setOrgSettings] = useState(() => isDemoMode() ? { industry: 'dental', status: 'demo' } : {})
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [inboxUnread, setInboxUnread] = useState(0)
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
  const [layout, setLayout] = useState(loadLayout)
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [userRole, setUserRole] = useState('admin')
  const [contacts, setContacts] = useState([])
  const [contactsTotal, setContactsTotal] = useState(0)
  const [contactsLoadingMore, setContactsLoadingMore] = useState(false)
  const [tasks, setTasks] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [dragWidget, setDragWidget] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('velo_notifications') || '[]') } catch { return [] }
  })
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm }
  const { toasts, addToast, removeToast } = useToast()

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
  const { isOperator } = useIsOperator()
  const t = T[lang]
  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    localStorage.setItem('velo_lang', lang)
  }, [lang, dir])
  useEffect(() => { saveLayout(layout) }, [layout])

  // Redirect / (and post-auth /join) to /dashboard (or /agency for super admin).
  // For /join we first capture the token to localStorage so an already-signed-in
  // user who clicks an invite link still gets the invitation applied.
  useEffect(() => {
    const path = location.pathname
    if (path.startsWith('/join')) {
      const params = new URLSearchParams(location.search)
      const rawToken = params.get('token') || ''
      const token = sanitizePathParam(rawToken)
      if (token) rememberPendingInvite(token)
      if (user) {
        navigate('/dashboard', { replace: true })
      }
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
        if (page === 'contacts') { document.querySelector('[data-action="new-contact"]')?.click() }
        else if (page === 'calendar') { document.querySelector('[data-action="new-event"]')?.click() }
        return
      }
      // G + key navigation
      if (e.key === 'g') { gPending = true; setTimeout(() => gPending = false, 800); return }
      if (gPending) {
        gPending = false
        const map = { d: 'dashboard', c: 'contacts', i: 'inbox', a: 'calendar' }
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

  // Fetch data from Supabase when user logs in
  const loadAllData = async () => {
    if (demoMode) {
      // Read-only sample data for the ?demo=1 path.
      setContacts(SAMPLE_CONTACTS); setContactsTotal(SAMPLE_CONTACTS.length); setTasks(SAMPLE_TASKS)
      return
    }
    if (!useDB) {
      // No Supabase configured (dev only). Show empty state.
      setContacts([]); setContactsTotal(0); setTasks([]); setAllPayments([])
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
          const { data: org } = await sb.from('organizations').select('*').eq('id', profile.org_id).single()
          if (org) setOrgSettings(org)
          // Fetch team members for this org
          try {
            const members = await db.fetchTeamMembers(profile.org_id)
            if (members.length > 0) setTeamMembers(members)
          } catch (e) { console.warn('Team members fetch error:', e) }
        } else if (isSA) {
          // Super admin has no org — skip onboarding, go to agency dashboard
          localStorage.setItem('velo_onboarding_done', 'true')
        } else if (!localStorage.getItem('velo_onboarding_done')) {
          // No org and never completed onboarding — trigger wizard
          setNeedsOnboarding(true)
          setDataLoading(false)
          return
        }
      }

      const [contactsPage, rawPayments] = await Promise.all([
        db.fetchContacts(),
        db.fetchAllPayments().catch(() => []),
      ])
      setContacts(contactsPage.rows)
      setContactsTotal(contactsPage.total)
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
      const userIds = await db.fetchOrgUserIds(orgId)
      const [contactsPage, rawPayments] = await Promise.all([
        db.fetchContactsForOrg(orgId, userIds),
        db.fetchPaymentsForOrg(userIds),
      ])
      setContacts(contactsPage.rows)
      setContactsTotal(contactsPage.total)
      setAllPayments(rawPayments)
    } catch (err) {
      console.error('Impersonation data load error:', err)
      setDataError(err.message || 'Failed to load org data')
    } finally {
      setDataLoading(false)
    }
  }

  // Fetch the next page of contacts and merge into state.
  // Re-runs reference hydration so deals/tickets referencing newly-loaded
  // contacts pick up the right names/companies.
  const loadMoreContacts = useCallback(async () => {
    if (!useDB) return
    if (contactsLoadingMore) return
    if (contacts.length >= contactsTotal) return
    if (!checkSupabaseRateLimit()) {
      addToast(isRTL ? 'كثرة الطلبات، حاول لاحقاً' : 'Too many requests, try again shortly', 'error')
      return
    }
    setContactsLoadingMore(true)
    try {
      const offset = contacts.length
      const page = impersonation
        ? await db.fetchContactsForOrg(impersonation.orgId, await db.fetchOrgUserIds(impersonation.orgId), offset)
        : await db.fetchContacts(offset)
      setContacts([...contacts, ...page.rows])
      setContactsTotal(page.total)
    } catch (err) {
      console.error('Load more contacts error:', err)
      addToast(isRTL ? 'فشل تحميل المزيد' : 'Failed to load more', 'error')
    } finally {
      setContactsLoadingMore(false)
    }
  }, [useDB, contactsLoadingMore, contacts, contactsTotal, impersonation, addToast, isRTL])

  // Initial data load on sign-in (or impersonation switch).
  // Skip when a pending invite exists — the invite-apply effect will
  // call loadAllData after the RPC updates profile.org_id, so we avoid a
  // racy double-fetch against the pre-invite profile.
  useEffect(() => {
    if (!user) return
    if (!impersonation && getPendingInvite()) return
    if (!impersonation) loadAllData()
    else loadDataForOrg(impersonation.orgId)
  }, [user])

  // Apply any pending invitation token once the user is authenticated.
  // Runs when user first becomes set (fresh signup) AND when an already-
  // signed-in user lands on /join (token captured by the redirect effect).
  useEffect(() => {
    if (!user) return
    const pending = getPendingInvite()
    if (!pending) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await acceptInvitation(pending)
        if (cancelled) return
        clearPendingInvite()
        addToast(
          isRTL ? `مرحباً بك في ${result.orgName}` : `Welcome to ${result.orgName}`,
          'success'
        )
        // Re-load data now that org_id/role have changed.
        if (!impersonation) loadAllData()
      } catch (err) {
        if (cancelled) return
        console.error('Accept invitation error:', err)
        clearPendingInvite()
        addToast(
          isRTL ? 'تعذر قبول الدعوة' : (err.message || 'Could not accept invitation'),
          'error'
        )
      }
    })()
    return () => { cancelled = true }
  }, [user, location.pathname])

  // settingsTab is now derived from URL: /settings/:tab

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    setContacts([])
    setContactsTotal(0)
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
      setContacts([])
      setContactsTotal(0)
      setAllPayments([])
      loadAllData()
      navigate('/agency')
    }
  }, [page])

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

  if (!user) {
    return <AuthPage onAuth={(u) => setUser(u)} lang={lang} setLang={setLang} />
  }

  // Super Admin check — TODO: replace with role-based check post-Sprint 0
  const isSuperAdmin = false

  // Effective role for permission checks. Super admin and agency-mode
  // impersonation always get full admin access; org users use their own role.
  const effectiveRole = (isSuperAdmin || impersonation) ? 'admin' : userRole
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
    setContacts([])
    setContactsTotal(0)
    setAllPayments([])
    loadAllData()
    navigate('/agency')
  }

  if (needsOnboarding && !isSuperAdmin) {
    return <Suspense fallback={<SkeletonGeneric />}><OnboardingPage user={user} lang={lang} toast={addToast} onComplete={(org) => { setOrgSettings(org); setNeedsOnboarding(false); localStorage.setItem('velo_onboarding_done', 'true'); loadAllData() }} /></Suspense>
  }

  const toggleLang = () => setLang(l => l === 'en' ? 'ar' : 'en')
  const toggleWidget = (id) => setLayout(prev => ({ ...prev, visible: { ...prev.visible, [id]: !prev.visible[id] } }))

  const handleDragStart = (id) => setDragWidget(id)
  const handleDragOver = (e, id) => {
    e.preventDefault()
    if (dragWidget && dragWidget !== id) {
      setLayout(prev => {
        const order = [...prev.order]; const from = order.indexOf(dragWidget); const to = order.indexOf(id)
        if (from === -1 || to === -1) return prev
        order.splice(from, 1); order.splice(to, 0, dragWidget)
        return { ...prev, order }
      })
    }
  }
  const handleDragEnd = () => setDragWidget(null)
  const toggleTask = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))

  // ── CRUD — Supabase-backed with optimistic local updates ──────────────
  const addContact = async (raw) => {
    if (!requirePerm('contacts', 'w')) return
    const c = sanitizeContact(raw)
    const v = validateContactForSave(c, { isRTL })
    if (!v.ok) { addToast(v.error, 'error'); return }
    const orgId = impersonation?.orgId ?? orgSettings?.id
    if (useDB && !orgId) {
      addToast(isRTL ? 'لا يوجد سياق منظمة — يرجى التحديث' : 'No organization context — please refresh.', 'error')
      return
    }
    const optimistic = { ...c, id: genId('c'), createdAt: new Date().toISOString().slice(0,10), documents: [], notesTimeline: [], activityHistory: [] }
    setContacts(prev => [...prev, optimistic])
    setContactsTotal(n => n + 1)
    addToast(t.contactAdded || (isRTL ? 'تمت إضافة جهة الاتصال' : 'Contact added successfully'), 'success')
    pushNotification('contact', isRTL ? 'جهة اتصال جديدة' : 'New contact added', c.name || c.email || '')
    if (useDB) {
      try {
        const saved = await db.insertContact(c, orgId)
        setContacts(prev => prev.map(x => x.id === optimistic.id ? saved : x))
      } catch (err) { console.error('Add contact error:', err); addToast(isRTL ? 'خطأ في إضافة جهة الاتصال' : 'Error adding contact', 'error'); loadAllData() }
    }
  }
  const updateContact = async (id, data) => {
    if (data._fromDb) {
      setContacts(prev => prev.map(c => c.id === id ? data._fromDb : c))
      return
    }
    if (!requirePerm('contacts', 'w')) return
    // Validate email/phone if present. Full form updates sanitize too.
    const sanitized = sanitizeContact({ ...(contacts.find(c => c.id === id) || {}), ...data })
    const v = validateContactForSave(sanitized, { isRTL })
    if (!v.ok) { addToast(v.error, 'error'); return }
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
    addToast(isRTL ? 'تم تحديث جهة الاتصال' : 'Contact updated', 'success')
    if (useDB) {
      try {
        // If notes (bio) changed, rebuild the JSON preserving timeline/docs
        if (data.notes !== undefined) {
          const current = contacts.find(c => c.id === id)
          let parsed = { bio: '', timeline: [], documents: [] }
          try { parsed = JSON.parse(current?._rawNotes || '{}'); if (!parsed.timeline) parsed = { bio: '', timeline: [], documents: [] } } catch {}
          parsed.bio = data.notes
          data = { ...data, _rawNotes: JSON.stringify(parsed) }
          delete data.notes
        }
        await db.patchContact(id, data)
      }
      catch (err) { console.error('Update contact error:', err); addToast(isRTL ? 'خطأ في التحديث' : 'Error updating contact', 'error'); loadAllData() }
    }
  }
  const deleteContact = async (id) => {
    if (!requirePerm('contacts', 'd')) return
    setContacts(prev => prev.filter(c => c.id !== id))
    setContactsTotal(n => Math.max(0, n - 1))
    addToast(isRTL ? 'تم حذف جهة الاتصال' : 'Contact deleted', 'success')
    if (useDB) {
      try { await db.removeContact(id) }
      catch (err) { console.error('Delete contact error:', err); addToast(isRTL ? 'خطأ في الحذف' : 'Error deleting contact', 'error'); loadAllData() }
    }
  }
  const addNoteToContact = async (contactId, text) => {
    // Note-adding is the one write that the 'assistant' role is allowed.
    // Gate by either write or note permission on contacts.
    if (!can(effectiveRole, 'contacts', 'w') && !can(effectiveRole, 'contacts', 'n')) {
      addToast(isRTL ? 'ليس لديك صلاحية' : 'You do not have permission', 'error')
      return
    }
    const newNote = { id: genId('n'), text, date: new Date().toISOString().slice(0,10), author: t.adminUser }
    setContacts(prev => prev.map(c => c.id === contactId ? {
      ...c,
      notesTimeline: [...(c.notesTimeline||[]), newNote],
    } : c))
    addToast(isRTL ? 'تمت إضافة الملاحظة' : 'Note added', 'success')
    if (useDB) {
      try {
        const saved = await db.addContactNote(contactId, newNote)
        setContacts(prev => prev.map(c => c.id === contactId ? saved : c))
      } catch (err) { console.error('Add note error:', err) }
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
  const isAgencyMode = isSuperAdmin && !impersonation

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
      { id: 'contacts', icon: Icons.contacts, label: orgSettings.industry === 'dental' ? (isRTL ? 'المرضى' : 'Patients') : t.contacts },
      { id: 'inbox', icon: Icons.inbox, label: t.inbox, badge: inboxUnread || undefined },
      { id: 'calendar', icon: Icons.calendar, label: t.calendar },
      { id: 'tasks', icon: Icons.check, label: isRTL ? 'المهام' : 'Tasks' },
    ]},
    { label: t.tools, items: [
      { id: 'goals', icon: Icons.trendUp, label: isRTL ? 'الأهداف' : 'Goals' },
      { id: 'docs', icon: Icons.file, label: isRTL ? 'المستندات' : 'Docs' },
      { id: 'automations', icon: Icons.automations, label: t.automations },
      { id: 'forms', icon: Icons.file, label: isRTL ? 'النماذج' : 'Forms' },
      { id: 'social', icon: Icons.globe, label: isRTL ? 'التواصل' : 'Social' },
      { id: 'integrations', icon: Icons.integrations, label: t.integrations },
      { id: 'reports', icon: Icons.reports, label: t.reports },
      { id: 'finance', icon: Icons.dollar, label: isRTL ? 'المالية' : 'Finance' },
    ]},
    { label: t.account, items: [
      ...(isSuperAdmin ? [{ id: 'agency', icon: Icons.building, label: isRTL ? 'لوحة الوكالة' : 'Agency' }] : []),
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
          ],
        },
      ]
    : baseVisibleGroups

  const widgetNames = {
    stats: t.statsOverview, chart: t.monthlyRevenue||'Monthly Growth', tasks: t.tasksToday,
    recentContacts: t.contactsWidget, activity: t.recentActivity,
    inboxPreview: t.inboxPreview, appointments: t.upcomingAppointments,
    topLeads: isRTL?'أفضل العملاء المحتملين':'Top Leads by Score', pendingPayments: isRTL?'مدفوعات مستحقة':'Pending Payments', financeSummary: isRTL?'ملخص مالي':'Finance Summary',
  }

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
        <header className="mobile-header" style={{ height:52, minHeight:52, background:'rgba(12,14,26,0.8)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', padding: isMobile?'0 12px':'0 24px', gap: isMobile?8:16 }}>
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
            page === 'contacts' ? <SkeletonContacts /> :
            page === 'inbox' ? <SkeletonInbox /> :
            page === 'calendar' ? <SkeletonCalendar /> :
            page === 'dashboard' ? <SkeletonDashboard /> :
            <SkeletonGeneric />
          ) : (
            <>
              {page === 'dashboard' && (orgSettings === null || orgSettings === undefined
                ? <SkeletonDashboard />
                : orgSettings?.industry === 'dental'
                  ? <Suspense fallback={<SkeletonDashboard />}><DentalDashboard t={t} lang={lang} isRTL={isRTL} dir={dir} contacts={contacts} setPage={setPage} /></Suspense>
                  : <DashboardPage t={t} lang={lang} isRTL={isRTL} dir={dir} contacts={contacts} contactsTotal={contactsTotal} deals={deals} tasks={tasks} tickets={tickets} toggleTask={toggleTask} layout={layout} widgetNames={widgetNames} showCustomizer={showCustomizer} setShowCustomizer={setShowCustomizer} toggleWidget={toggleWidget} setLayout={setLayout} dragWidget={dragWidget} handleDragStart={handleDragStart} handleDragOver={handleDragOver} handleDragEnd={handleDragEnd} setPage={setPage} allPayments={allPayments} isSuperAdmin={isSuperAdmin} impersonation={impersonation} demoMode={demoMode} />
              )}
              {page === 'contacts' && <ContactsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} contactsTotal={contactsTotal} loadMoreContacts={loadMoreContacts} contactsLoadingMore={contactsLoadingMore} addContact={addContact} updateContact={updateContact} deleteContact={deleteContact} addNoteToContact={addNoteToContact} setPage={setPage} isDental={orgSettings.industry === 'dental'} currency={orgSettings.currency || 'USD'} toast={addToast} showConfirm={showConfirm} urlContactId={pageSubId} navigate={navigate} isSuperAdmin={isSuperAdmin} impersonation={impersonation} orgId={dentalOrgId} />}
              {page === 'inbox' && <InboxPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} setPage={setPage} toast={addToast} urlConvId={pageSubId} navigate={navigate} teamMembers={teamMembers} isSuperAdmin={isSuperAdmin} impersonation={impersonation} orgId={dentalOrgId} demoMode={demoMode} />}
              {page === 'calendar' && <Suspense fallback={<SkeletonGeneric />}><AppointmentsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} toast={addToast} setPage={setPage} /></Suspense>}
              {page === 'automations' && <Suspense fallback={<SkeletonGeneric />}><AutomationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'forms' && <Suspense fallback={<SkeletonGeneric />}><FormsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} urlFormId={pageSubId} navigate={navigate} /></Suspense>}
              {page === 'social' && <Suspense fallback={<SkeletonGeneric />}><SocialPage t={t} lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} toast={addToast} /></Suspense>}
              {page === 'finance' && <Suspense fallback={<SkeletonGeneric />}><FinancePage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} currency={orgSettings.currency || 'USD'} toast={addToast} showConfirm={showConfirm} isSuperAdmin={isSuperAdmin && !impersonation} orgPayments={impersonation ? allPayments : null} /></Suspense>}
              {page === 'integrations' && <Suspense fallback={<SkeletonGeneric />}><IntegrationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'reports' && <Suspense fallback={<SkeletonGeneric />}><ReportsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} onOpenBuilder={() => setPage('report-builder')} /></Suspense>}
              {page === 'report-builder' && <Suspense fallback={<SkeletonGeneric />}><ReportBuilder t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} onBack={() => setPage('reports')} /></Suspense>}
              {page === 'tasks' && <Suspense fallback={<SkeletonGeneric />}><TasksPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} user={user} toast={addToast} showConfirm={showConfirm} /></Suspense>}
              {page === 'goals' && <Suspense fallback={<SkeletonGeneric />}><GoalsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} toast={addToast} /></Suspense>}
              {page === 'docs' && <Suspense fallback={<SkeletonGeneric />}><DocsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={contacts} toast={addToast} /></Suspense>}
              {page === 'agency' && isSuperAdmin && !impersonation && <Suspense fallback={<SkeletonGeneric />}><AgencyDashboard user={user} onEnterOrg={startImpersonation} onSignOut={handleSignOut} /></Suspense>}
              {page === 'billing' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'الفواتير' : 'Billing'} description={isRTL ? 'إدارة الفواتير والمدفوعات قريباً' : 'Billing management coming soon.'} icon={Icons.file} />}
              {page === 'agency-profile' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'ملف الوكالة' : 'Agency Profile'} description={isRTL ? 'إعدادات ملف الوكالة قريباً' : 'Agency profile settings coming soon.'} icon={Icons.user} />}
              {page === 'settings' && <Suspense fallback={<SkeletonGeneric />}><SettingsPage t={t} lang={lang} dir={dir} isRTL={isRTL} user={user} orgSettings={orgSettings} onSaveOrgSettings={saveOrgSettings} toast={addToast} initialTab={pageSubId} key={pageSubId || 'settings'} navigate={navigate} isSuperAdmin={isSuperAdmin} /></Suspense>}
              {page === 'operator' && pageSubId === 'credentials' && isOperator && <Suspense fallback={<SkeletonGeneric />}><ClinicCredentialsPage lang={lang} /></Suspense>}
            </>
          )}
        </div>
      </main>

      {/* Widget Customizer */}
      {showCustomizer && (
        <Modal onClose={() => setShowCustomizer(false)} dir={dir} width={520}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:C.text }}>{t.widgetSettings}</h2>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => setLayout({...DEFAULT_LAYOUT})} style={makeBtn('secondary', {fontSize:11})}>{isRTL?'إعادة تعيين':'Reset'}</button>
              <button type="button" onClick={() => setShowCustomizer(false)} className="velo-btn-primary" style={makeBtn('primary')}>{t.done}</button>
            </div>
          </div>
          <p style={{ fontSize:13, color:C.textMuted, marginBottom:16 }}>{t.dragToReorder} &middot; {layout.order.filter(id=>layout.visible[id]).length}/{layout.order.length} {t.widgetsVisible}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {layout.order.map(id => (
              <div key={id} draggable onDragStart={()=>handleDragStart(id)} onDragOver={e=>handleDragOver(e,id)} onDragEnd={handleDragEnd}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:6, border:`1px solid ${layout.visible[id]?C.border:'transparent'}`, background: dragWidget===id?C.primaryBg:layout.visible[id]?C.white:C.bg, cursor:'grab', transition:'all 150ms ease', opacity: layout.visible[id]?1:.4 }}>
                <span style={{color:C.textMuted,cursor:'grab',display:'flex'}}>{Icons.grip()}</span>
                <span style={{flex:1,fontSize:14,fontWeight:500,color:C.text}}>{widgetNames[id] || id}</span>
                <button type="button" onClick={()=>toggleWidget(id)} style={{ border:'none', background:'transparent', cursor:'pointer', color: layout.visible[id]?C.primary:C.textMuted, display:'flex', alignItems:'center', padding:4, transition:'color 150ms ease' }}>
                  {layout.visible[id] ? Icons.eye() : Icons.eyeOff()}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

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
              { id:'contacts', icon: Icons.contacts, label: t.contacts },
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
                  { id:'social', icon: Icons.globe, label: isRTL?'التواصل':'Social' },
                  { id:'integrations', icon: Icons.integrations, label: t.integrations },
                  { id:'reports', icon: Icons.reports, label: t.reports },
                  { id:'finance', icon: Icons.dollar, label: isRTL?'المالية':'Finance' },
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

      {/* Command Palette */}
      <CommandPalette open={cmdPaletteOpen} onClose={(action) => action === 'toggle' ? setCmdPaletteOpen(v => !v) : setCmdPaletteOpen(false)} contacts={contacts} onNavigate={setPage} onAction={(action, id) => {
        if (action === 'add-contact') setPage('contacts')
        else if (action === 'new-event') setPage('calendar')
        else if (action === 'view-contact') setPage('contacts')
      }} lang={lang} />

      {/* Notification Center */}
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} onMarkRead={markNotifRead} onMarkAllRead={markAllNotifsRead} onDismiss={dismissNotif} lang={lang} />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} isRTL={isRTL} />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} lang={lang} />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        onConfirm={() => { confirmDialog?.onConfirm?.(); closeConfirm() }}
        onCancel={closeConfirm}
        dir={dir}
      />

      {/* AI Assistant */}
      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} apiKey={orgSettings.anthropic_api_key} context={`Current page: ${page}. User has ${contacts.length} contacts.`} lang={lang} knowledgeBase={orgSettings.ai_knowledge_base} contacts={contacts} onNavigateToApiKeys={() => navigate('/settings/apikeys')} />

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
// ─── Agency Placeholder (for upcoming agency pages) ─────────────────────────
function AgencyPlaceholder({ title, description, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <span style={{ color: C.purple, display: 'flex' }}>{icon(28)}</span>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>{title}</h2>
      <p style={{ fontSize: 14, color: C.textMuted, margin: 0, maxWidth: 400 }}>{description}</p>
    </div>
  )
}

// ─── Agency Empty State (shown when super admin is not impersonating) ────────
function AgencyEmptyState({ isRTL, setPage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>👈</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
        {isRTL ? 'انتقل إلى لوحة الوكالة واختر مؤسسة لعرض بياناتها' : 'Go to Agency Dashboard and enter an organization to view their data'}
      </h2>
      <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 24px', maxWidth: 420 }}>
        {isRTL ? 'اختر مؤسسة من لوحة الوكالة لعرض بياناتها.' : 'Select an organization from the Agency Dashboard to view their data.'}
      </p>
      <button onClick={() => setPage('agency')} className="velo-btn-primary" style={makeBtn('primary', { gap: 8 })}>
        {Icons.building(16)} {isRTL ? 'لوحة الوكالة' : 'Go to Agency Dashboard'}
      </button>
    </div>
  )
}

// ─── Agency Dashboard View (super admin overview with MRR stats) ────────────
const PLAN_PRICING = { free: 0, starter: 29, pro: 79, enterprise: 199 }

function AgencyDashboardView({ t, lang, isRTL, dir, setPage }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await db.fetchOrganizations()
        if (!cancelled) setOrgs(data)
      } catch (e) { console.error('Agency dashboard load error:', e) }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const activeOrgs = orgs.filter(o => o.status === 'active' || !o.status)
  const totalMRR = activeOrgs.reduce((sum, o) => sum + (PLAN_PRICING[o.plan] || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>{isRTL ? 'نظرة عامة للوكالة' : 'Agency Overview'}</h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button onClick={() => setPage('agency')} className="velo-btn-primary" style={makeBtn('primary', { gap: 8 })}>
          {Icons.building(16)} {isRTL ? 'إدارة المؤسسات' : 'Manage Organizations'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 14 }}>{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
            {[
              { label: isRTL ? 'إجمالي المؤسسات' : 'Total Organizations', value: orgs.length, color: C.primary, bg: C.primaryBg },
              { label: isRTL ? 'الاشتراكات النشطة' : 'Active Subscriptions', value: activeOrgs.length, color: C.success, bg: C.successBg },
              { label: isRTL ? 'الإيرادات الشهرية' : 'Monthly Recurring Revenue', value: `$${totalMRR.toLocaleString()}`, color: C.purple, bg: C.purpleBg },
              { label: isRTL ? 'متوسط الإيراد/مؤسسة' : 'Avg Revenue / Org', value: activeOrgs.length ? `$${Math.round(totalMRR / activeOrgs.length)}` : '$0', color: C.warning, bg: C.warningBg },
            ].map((s, i) => (
              <div key={i} style={{ ...card, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Plan distribution */}
            <div style={{ ...card, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'توزيع الاشتراكات' : 'Subscription Distribution'}</h3>
              {['enterprise', 'pro', 'starter', 'free'].map(plan => {
                const count = activeOrgs.filter(o => o.plan === plan).length
                const pct = activeOrgs.length ? (count / activeOrgs.length) * 100 : 0
                const revenue = count * (PLAN_PRICING[plan] || 0)
                const colors = { enterprise: C.success, pro: C.purple, starter: C.primary, free: C.textMuted }
                return (
                  <div key={plan} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{plan} <span style={{ fontWeight: 400, color: C.textMuted }}>(${PLAN_PRICING[plan]}/mo)</span></span>
                      <span style={{ color: C.textSec }}>{count} orgs &middot; ${revenue}/mo</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: C.bg }}>
                      <div style={{ height: '100%', borderRadius: 4, background: colors[plan], width: `${pct}%`, minWidth: count > 0 ? 4 : 0, transition: 'width 300ms ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recent orgs */}
            <div style={{ ...card, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'أحدث المؤسسات' : 'Recent Organizations'}</h3>
              {orgs.length === 0 ? (
                <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 16 }}>{isRTL ? 'لا توجد مؤسسات' : 'No organizations yet'}</p>
              ) : orgs.slice(0, 6).map(org => (
                <div key={org.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{(org.name || '?')[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{org.name}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'capitalize' }}>{org.plan || 'free'} &middot; {org.status || 'active'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.success }}>${PLAN_PRICING[org.plan] || 0}/mo</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardPage({ t, lang, isRTL, dir, contacts, contactsTotal = 0, deals, tasks, tickets, toggleTask, layout, widgetNames, showCustomizer, setShowCustomizer, toggleWidget, setLayout, dragWidget, handleDragStart, handleDragOver, handleDragEnd, setPage, allPayments, isSuperAdmin, impersonation, demoMode }) {
  // Agency mode — show agency-level stats instead of regular dashboard
  if (isSuperAdmin && !impersonation) {
    return <AgencyDashboardView t={t} lang={lang} isRTL={isRTL} dir={dir} setPage={setPage} />
  }

  const widgetRenderers = {
    stats: () => <StatsCards t={t} contacts={contacts} contactsTotal={contactsTotal} deals={deals} tickets={tickets} dir={dir} />,
    chart: () => <MonthlyChart t={t} isRTL={isRTL} />,
    tasks: () => <TasksWidget t={t} tasks={tasks} toggleTask={toggleTask} dir={dir} />,
    recentContacts: () => <RecentContactsWidget t={t} contacts={contacts} dir={dir} setPage={setPage} />,
    pipeline: () => <PipelineSummaryWidget t={t} deals={deals} dir={dir} lang={lang} />,
    ticketStats: () => <TicketStatsWidget t={t} tickets={tickets} dir={dir} />,
    activity: () => <ActivityWidget t={t} dir={dir} demoMode={demoMode} />,
    inboxPreview: () => <InboxWidget t={t} dir={dir} demoMode={demoMode} />,
    appointments: () => <AppointmentsWidget t={t} dir={dir} demoMode={demoMode} />,
    topLeads: () => <TopLeadsWidget t={t} contacts={contacts} deals={deals} dir={dir} isRTL={isRTL} />,
    pendingPayments: () => <PendingPaymentsWidget t={t} contacts={contacts} allPayments={allPayments} dir={dir} isRTL={isRTL} />,
    financeSummary: () => <FinanceSummaryWidget t={t} contacts={contacts} allPayments={allPayments} dir={dir} isRTL={isRTL} />,
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0 }}>{t.dashboard}</h1>
          <p style={{ fontSize:13, color:C.textSec, marginTop:4 }}>{new Date().toLocaleDateString(lang==='ar'?'ar-SA':'en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <button onClick={()=>setShowCustomizer(true)} style={makeBtn('secondary',{gap:8})}>{Icons.customize()}{t.customizeDashboard}</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
        {layout.order.filter(id=>layout.visible[id]).map(id => (
          <div key={id} draggable onDragStart={()=>handleDragStart(id)} onDragOver={e=>handleDragOver(e,id)} onDragEnd={handleDragEnd}
            className={dragWidget===id?'widget-dragging':''} style={{ transition:'opacity .2s, transform .2s' }}>
            {widgetRenderers[id]?.()}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard Widgets ───────────────────────────────────────────────────────
function StatsCards({ t, contacts, contactsTotal = 0, deals, tickets, dir }) {
  const openDeals = deals.filter(d => !['won','lost'].includes(d.stage))
  const pipelineVal = openDeals.reduce((s,d) => s+d.value, 0)
  const wonThisMonth = deals.filter(d => d.stage==='won').reduce((s,d) => s+d.value, 0)
  const openTicketCount = (tickets||[]).filter(tk => ['open','in_progress'].includes(tk.status)).length
  // Use contactsTotal (from the DB count) rather than contacts.length, which
  // is capped by the paginated initial load.
  const totalContactsDisplay = contactsTotal || contacts.length
  const stats = [
    { label:t.totalContacts, value:totalContactsDisplay, change:'+12%', icon:Icons.contacts, color:C.primary, bg:C.primaryBg },
    { label:t.openDeals, value:openDeals.length, change:'+3', icon:Icons.target, color:C.purple, bg:C.purpleBg },
    { label:t.pipelineValue, value:fmt$(pipelineVal), change:'+18%', icon:Icons.dollar, color:C.success, bg:C.successBg },
    { label:t.openTickets, value:openTicketCount, change:'+2', icon:Icons.ticket, color:C.danger, bg:C.dangerBg },
    { label:t.wonThisMonth, value:fmt$(wonThisMonth), change:'+$9.6K', icon:Icons.trendUp, color:C.warning, bg:C.warningBg },
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12 }}>
      {stats.map((s,i) => (
        <div key={i} style={{ ...card, padding:20, display:'flex', flexDirection:'column', gap:12, direction:dir }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, color:C.textSec, fontWeight:500 }}>{s.label}</span>
            <div style={{ width:38, height:38, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', color:s.color }}>{s.icon(20)}</div>
          </div>
          <div style={{ fontSize:28, fontWeight:700, color:C.text, letterSpacing:'-.5px' }}>{s.value}</div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:12, fontWeight:600, color:C.success, background:C.successBg, padding:'2px 6px', borderRadius:4 }}>{s.change}</span>
            <span style={{ fontSize:12, color:C.textMuted }}>{t.vsLastMonth}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthlyChart({ t, isRTL }) {
  const data=[4200,5800,4900,7200,6100,8400,7800,9200,8600,11200,9800,12400]
  const labels=(t.months||['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']).map(m=>m.substring(0,3))
  const max=Math.max(...data), W=720, H=200, padL=50, padR=20, padT=20, padB=30, chartW=W-padL-padR, chartH=H-padT-padB
  const points=data.map((v,i)=>({x:padL+(i/(data.length-1))*chartW, y:padT+chartH-(v/max)*chartH}))
  const linePath=points.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
  const areaPath=`${linePath} L${points[points.length-1].x},${padT+chartH} L${points[0].x},${padT+chartH} Z`
  const gridLines=[0,.25,.5,.75,1].map(p=>({y:padT+chartH-p*chartH, label:fmt$(Math.round(p*max))}))
  return (
    <div style={{...card,padding:20}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.monthlyRevenue||'Monthly Revenue'}</h3>
        <span style={{fontSize:12,color:C.textMuted}}>{t.last6Months||'Last 12 months'}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.primary} stopOpacity=".2"/><stop offset="100%" stopColor={C.primary} stopOpacity=".01"/></linearGradient></defs>
        {gridLines.map((g,i)=><g key={i}><line x1={padL} y1={g.y} x2={W-padR} y2={g.y} className="chart-grid-line"/><text x={padL-8} y={g.y+4} textAnchor="end" fontSize="10" fill={C.textMuted}>{g.label}</text></g>)}
        <path d={areaPath} className="chart-area"/><path d={linePath} className="chart-line"/>
        {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" className="chart-dot"/>)}
        {points.map((p,i)=><text key={i} x={p.x} y={H-6} textAnchor="middle" fontSize="10" fill={C.textMuted}>{labels[i]}</text>)}
      </svg>
    </div>
  )
}

function TasksWidget({ t, tasks, toggleTask, dir }) {
  const priorityColors = { high:C.danger, medium:C.warning, low:C.textMuted }
  return (
    <div style={{...card,padding:20,direction:dir}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.tasksToday}</h3>
        <span style={{fontSize:12,color:C.textMuted}}>{tasks.filter(x=>x.done).length}/{tasks.length}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {tasks.map(task=>(
          <div key={task.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:`1px solid ${C.border}`,background:C.white,opacity:task.done?.6:1,transition:'opacity .2s'}}>
            <button onClick={()=>toggleTask(task.id)} style={{width:20,height:20,borderRadius:6,flexShrink:0,border:task.done?'none':`2px solid ${C.border}`,background:task.done?C.success:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
              {task.done && Icons.check(12)}
            </button>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500,color:C.text,textDecoration:task.done?'line-through':'none'}}>{task.title}</div>
              {task.contact && <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{task.contact}</div>}
            </div>
            <span style={{width:8,height:8,borderRadius:'50%',background:priorityColors[task.priority]||C.textMuted,flexShrink:0}}/>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentContactsWidget({ t, contacts, dir, setPage }) {
  return (
    <div style={{...card,padding:20,direction:dir}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.contactsWidget}</h3>
        <span onClick={()=>setPage('contacts')} style={{fontSize:12,color:C.primary,cursor:'pointer',fontWeight:500}}>{t.seeAll}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {contacts.slice(0,5).map(c=>{
          const cc=CAT_COLORS[c.category]||CAT_COLORS.other
          return (
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:8,border:`1px solid ${C.border}`,background:C.white}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:cc.bg,color:cc.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600,flexShrink:0}}>{c.name.charAt(0)}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.text}}>{c.name}</div><div style={{fontSize:12,color:C.textMuted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.company}</div></div>
              <span style={{fontSize:11,fontWeight:500,padding:'3px 8px',borderRadius:6,background:cc.bg,color:cc.text}}>{t[c.category]||c.category}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActivityWidget({ t, dir, demoMode }) {
  const activities = demoMode ? SAMPLE_ACTIVITIES : []
  const iconMap={deal:Icons.dollar,contact:Icons.user,message:Icons.mail,task:Icons.check,automation:Icons.automations}
  return (
    <div style={{...card,padding:20,direction:dir}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.recentActivity}</h3>
        <span style={{fontSize:12,color:C.primary,cursor:'pointer',fontWeight:500}}>{t.seeAll}</span>
      </div>
      {activities.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',color:C.textMuted,fontSize:13}}>No recent activity</div>
      ) : (
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {activities.map((act,i)=>{
          const IconFn=iconMap[act.icon]||Icons.activity
          return (
            <div key={act.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 0',borderBottom:i<activities.length-1?`1px solid ${C.border}`:'none'}}>
              <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:`${act.color}15`,color:act.color,display:'flex',alignItems:'center',justifyContent:'center'}}>{IconFn(16)}</div>
              <div style={{flex:1}}><div style={{fontSize:13,color:C.text,lineHeight:1.4}}>{act.text}</div><div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{act.time}</div></div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

function InboxWidget({ t, dir, demoMode }) {
  const messages = demoMode ? SAMPLE_MESSAGES.slice(0,4) : []
  return (
    <div style={{...card,padding:20,direction:dir}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.inboxPreview}</h3>
        <span style={{fontSize:12,color:C.primary,cursor:'pointer',fontWeight:500}}>{t.seeAll}</span>
      </div>
      {messages.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',color:C.textMuted,fontSize:13}}>No messages yet</div>
      ) : (
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {messages.map((msg,i)=>(
          <div key={msg.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 0',borderBottom:i<messages.length-1?`1px solid ${C.border}`:'none'}}>
            <div style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:msg.read?C.bg:C.primaryBg,color:msg.read?C.textMuted:C.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600}}>{msg.from.charAt(0)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><span style={{fontSize:13,fontWeight:msg.read?500:700,color:C.text}}>{msg.from}</span><span style={{fontSize:11,color:C.textMuted,flexShrink:0}}>{msg.time}</span></div>
              <div style={{fontSize:13,fontWeight:msg.read?400:600,color:C.text,marginTop:2}}>{msg.subject}</div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{msg.preview}</div>
            </div>
            {!msg.read && <span style={{width:8,height:8,borderRadius:'50%',background:C.primary,flexShrink:0,marginTop:6}}/>}
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function AppointmentsWidget({ t, dir, demoMode }) {
  const appointments = demoMode ? SAMPLE_APPOINTMENTS.slice(0,4) : []
  const typeColors={call:{bg:C.primaryBg,color:C.primary},demo:{bg:C.purpleBg,color:C.purple},meeting:{bg:C.successBg,color:C.success}}
  return (
    <div style={{...card,padding:20,direction:dir}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.text,margin:0}}>{t.upcomingAppointments}</h3>
        <span style={{fontSize:12,color:C.primary,cursor:'pointer',fontWeight:500}}>{t.seeAll}</span>
      </div>
      {appointments.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',color:C.textMuted,fontSize:13}}>No upcoming appointments</div>
      ) : (
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {appointments.map(apt=>{
          const tc=typeColors[apt.type]||typeColors.meeting
          return (
            <div key={apt.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:C.white}}>
              <div style={{width:44,textAlign:'center',flexShrink:0}}><div style={{fontSize:18,fontWeight:700,color:C.text}}>{new Date(apt.date).getDate()}</div><div style={{fontSize:10,color:C.textMuted,fontWeight:600,textTransform:'uppercase'}}>{new Date(apt.date).toLocaleDateString('en',{month:'short'})}</div></div>
              <div style={{width:1,height:36,background:C.border,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.text}}>{apt.title}</div><div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{apt.time} &middot; {apt.contact}</div></div>
              <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:6,background:tc.bg,color:tc.color,textTransform:'capitalize'}}>{apt.type}</span>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

function TopLeadsWidget({ t, contacts, deals, dir, isRTL }) {
  const scored = contacts.map(c => ({ ...c, ...calculateLeadScore(c, deals, []) })).sort((a,b) => b.score - a.score).slice(0, 5)
  const tierStyles = { hot:{ bg:'rgba(239,68,68,0.1)', color:'#FF6B6B', icon:'' }, warm:{ bg:'rgba(245,158,11,0.1)', color:'#D29922', icon:'' }, cold:{ bg:'rgba(0,255,178,0.09)', color:'#00FFB2', icon:'' } }
  return (
    <div style={{ ...card, padding:20, direction:dir }}>
      <h3 style={{ fontSize:15, fontWeight:600, color:C.text, margin:'0 0 14px' }}>{isRTL?'أفضل العملاء المحتملين':'Top Leads by Score'}</h3>
      {scored.length === 0 ? <p style={{ fontSize:12, color:C.textMuted, textAlign:'center', padding:16 }}>{isRTL?'لا توجد بيانات':'No data'}</p> : scored.map(c => {
        const ts = tierStyles[c.tier]
        return (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:C.primaryBg, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, flexShrink:0 }}>{c.name.charAt(0)}</div>
            <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:600, color:C.text }}>{c.name}</div><div style={{ fontSize:10, color:C.textMuted }}>{c.company}</div></div>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:ts.bg, color:ts.color }}>{ts.icon}{c.score}</span>
          </div>
        )
      })}
    </div>
  )
}

function PendingPaymentsWidget({ t, contacts, allPayments, dir, isRTL }) {
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]))
  const all = (allPayments || [])
    .filter(p => p.status === 'pending' || p.status === 'overdue' || (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < new Date()))
    .map(p => ({ ...p, contactName: contactMap[p.contactId]?.name || '' }))
  all.sort((a,b) => (a.dueDate||'9').localeCompare(b.dueDate||'9'))
  return (
    <div style={{ ...card, padding:20, direction:dir }}>
      <h3 style={{ fontSize:15, fontWeight:600, color:C.text, margin:'0 0 14px' }}>{isRTL?'مدفوعات مستحقة':'Pending Payments'}</h3>
      {all.length === 0 ? <p style={{ fontSize:12, color:C.textMuted, textAlign:'center', padding:16 }}>{isRTL?'لا توجد مدفوعات معلقة':'No pending payments'}</p> : all.slice(0,5).map(p => {
        const overdue = p.dueDate && new Date(p.dueDate) < new Date()
        return (
          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:28, height:28, borderRadius:6, background: overdue?'rgba(239,68,68,0.1)':'rgba(245,158,11,0.1)', color: overdue?'#FF6B6B':'#D29922', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>{Icons.dollar(14)}</div>
            <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600, color:C.text }}>{p.contactName}</div><div style={{ fontSize:10, color:C.textMuted }}>{isRTL?'استحقاق:':'Due:'} {p.dueDate||'—'}</div></div>
            <span style={{ fontSize:12, fontWeight:700, color: overdue?'#FF6B6B':'#D29922' }}>{fmtMoney(p.amount, p.currency||'USD')}</span>
          </div>
        )
      })}
    </div>
  )
}

function FinanceSummaryWidget({ t, contacts, allPayments, dir, isRTL }) {
  let totalPaid=0, totalPending=0
  ;(allPayments || []).forEach(p => { if(p.status==='paid') totalPaid+=Number(p.amount||0); else if(p.status!=='cancelled') totalPending+=Number(p.amount||0) })
  const expenses = (() => { try { return JSON.parse(localStorage.getItem('velo_expenses')||'[]').reduce((s,e)=>s+Number(e.amount||0),0) } catch { return 0 } })()
  return (
    <div style={{ ...card, padding:20, direction:dir }}>
      <h3 style={{ fontSize:15, fontWeight:600, color:C.text, margin:'0 0 14px' }}>{isRTL?'ملخص مالي':'Finance Summary'}</h3>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          { label:isRTL?'الإيرادات':'Revenue', value:totalPaid, color:'#00FFB2', bg:'rgba(0,255,136,0.1)' },
          { label:isRTL?'معلق':'Pending', value:totalPending, color:'#D29922', bg:'rgba(245,158,11,0.1)' },
          { label:isRTL?'المصروفات':'Expenses', value:expenses, color:'#FF6B6B', bg:'rgba(239,68,68,0.1)' },
          { label:isRTL?'الصافي':'Net', value:totalPaid-expenses, color:C.primary, bg:C.primaryBg },
        ].map((s,i) => (
          <div key={i} style={{ padding:10, borderRadius:8, background:s.bg, textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:600, color:s.color, marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:14, fontWeight:700, color:s.color }}>{fmtMoney(s.value,'USD')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
function ContactsPage({ t, lang, dir, isRTL, contacts, contactsTotal = 0, loadMoreContacts, contactsLoadingMore = false, deals, addContact, updateContact, deleteContact, addDeal, addNoteToContact, setPage, isDental, currency, toast, showConfirm, urlContactId, navigate, isSuperAdmin, impersonation, orgId }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [_selectedContact, _setSelectedContact] = useState(urlContactId || null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [profileTab, setProfileTab] = useState('details')
  const [newNote, setNewNote] = useState('')
  const [showDealForm, setShowDealForm] = useState(false)

  // Sync URL param to state. The special value "new" is an intent from the
  // dashboard's "New Patient" quick action — open the create form and clear
  // the URL so refresh doesn't reopen it.
  useEffect(() => {
    if (urlContactId === 'new') {
      setEditingContact(null)
      setShowForm(true)
      _setSelectedContact(null)
      navigate('/contacts')
      return
    }
    _setSelectedContact(urlContactId || null)
  }, [urlContactId])

  // Navigate-aware setter
  const selectedContact = _selectedContact
  const setSelectedContact = (id) => {
    if (id) navigate('/contacts/' + id)
    else navigate('/contacts')
  }

  // Super admin not impersonating — show agency message instead of contacts
  if (isSuperAdmin && !impersonation) {
    return <AgencyEmptyState isRTL={isRTL} setPage={setPage} />
  }

  const normalizePhoneSearch = (p) => (p || '').replace(/[\s\-()]/g, '').replace(/^\+964/, '0').replace(/^964/, '0').replace(/^0+/, '')
  const safeSearch = sanitizeSearch(search)
  const filtered = contacts.filter(c => {
    const q = safeSearch.toLowerCase()
    const qDigits = normalizePhoneSearch(safeSearch)
    const matchSearch = !q || (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q) || (c.city||'').toLowerCase().includes(q) || (c.tags||[]).some(tag => tag.toLowerCase().includes(q)) || (qDigits.length >= 3 && normalizePhoneSearch(c.phone).includes(qDigits))
    const matchStatus = filterStatus === 'all' || c.status === filterStatus
    const matchCat = filterCategory === 'all' || c.category === filterCategory
    return matchSearch && matchStatus && matchCat
  })

  const statusLabel = (s) => t[`status${s.charAt(0).toUpperCase()+s.slice(1)}`] || s

  // If a contact is selected, show profile
  if (selectedContact) {
    const c = contacts.find(x => x.id === selectedContact)
    if (!c) { setSelectedContact(null); return null }
    const contactDeals = deals.filter(d => d.contactId === c.id)
    return (
      <ContactProfile
        key={c.id}
        t={t} dir={dir} isRTL={isRTL} lang={lang}
        contact={c} contactDeals={contactDeals}
        profileTab={profileTab} setProfileTab={setProfileTab}
        newNote={newNote} setNewNote={setNewNote}
        addNoteToContact={addNoteToContact}
        onBack={() => { setSelectedContact(null); setProfileTab('details') }}
        onEdit={() => { setEditingContact(c); setShowForm(true); setSelectedContact(null) }}
        onDelete={() => showConfirm(isRTL ? 'حذف جهة الاتصال؟' : 'Delete this contact?', isRTL ? 'سيتم حذف جهة الاتصال وجميع الصفقات المرتبطة بها. لا يمكن التراجع.' : 'This will permanently delete the contact and all associated deals. This cannot be undone.', () => { deleteContact(c.id); setSelectedContact(null) })}
        showDealForm={showDealForm} setShowDealForm={setShowDealForm}
        addDeal={addDeal} contacts={contacts}
        isDental={isDental} updateContact={updateContact} currency={currency}
        orgId={orgId} toast={toast}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0 }}>{isDental ? (isRTL ? "المرضى" : "Patients") : t.contacts}</h1>
          <p style={{ fontSize:13, color:C.textSec, marginTop:4 }}>
            {contactsTotal > contacts.length
              ? (isRTL
                  ? `عرض ${contacts.length} من أصل ${contactsTotal}`
                  : `Showing ${contacts.length} of ${contactsTotal} ${isDental ? 'patients' : (t.contactsCount || 'contacts')}`)
              : `${filtered.length} ${isDental ? (isRTL ? 'مريض' : 'patients') : t.contactsCount}`}
          </p>
        </div>
        <button data-action="new-contact" onClick={() => { setEditingContact(null); setShowForm(true) }} className="velo-btn-primary" style={makeBtn('primary', { gap:6 })}>
          {Icons.plus(16)} {t.addContact}
        </button>
      </div>

      {/* Filters bar */}
      <div style={{ ...card, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', direction:dir }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:C.bg, borderRadius:8, padding:'6px 12px', border:`1px solid ${C.border}`, flex:1, maxWidth:320 }}>
          <span style={{color:C.textMuted,display:'flex'}}>{Icons.search(16)}</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} maxLength={LIMITS.search} placeholder={t.search || t.searchPlaceholder} style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:C.text, flex:1, fontFamily:'inherit', direction:dir }} />
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...selectStyle(dir), width:'auto', padding:'6px 12px', borderRadius:8 }}>
          <option value="all">{t.allStatuses}</option>
          <option value="active">{t.statusActive}</option>
          <option value="lead">{t.statusLead}</option>
          <option value="inactive">{t.statusInactive}</option>
        </select>
        <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)} style={{ ...selectStyle(dir), width:'auto', padding:'6px 12px', borderRadius:8 }}>
          <option value="all">{t.allCategories}</option>
          <option value="client">{t.client}</option>
          <option value="prospect">{t.prospect}</option>
          <option value="partner">{t.partner}</option>
          <option value="supplier">{t.supplier}</option>
          <option value="other">{t.other}</option>
        </select>
      </div>

      {/* Contacts Table */}
      <div style={{ ...card, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
              {[t.name, t.email, t.company, t.city, t.contactStatus, t.category, t.contactSource, ''].map((h,i) => (
                <th key={i} style={{ padding:'10px 16px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:12, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding:0 }}>
                <EmptyState type="contacts" title={contacts.length === 0 ? (isRTL ? 'لا توجد جهات اتصال بعد' : 'No contacts yet') : (isRTL ? 'لا توجد نتائج' : 'No matching contacts')} message={contacts.length === 0 ? (isRTL ? 'أضف أول جهة اتصال لبدء إدارة علاقاتك' : 'Add your first contact to start managing relationships') : (isRTL ? 'جرب تعديل مصطلح البحث أو الفلاتر' : 'Try adjusting your search or filters')} actionLabel={contacts.length === 0 ? t.addContact : null} onAction={contacts.length === 0 ? () => { setEditingContact(null); setShowForm(true) } : null} dir={dir} />
              </td></tr>
            ) : filtered.map(c => {
              const cc = CAT_COLORS[c.category] || CAT_COLORS.other
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.lead
              const ls = calculateLeadScore(c, deals, [])
              const lsColors = { hot:{ bg:'rgba(239,68,68,0.1)', color:'#FF6B6B', icon:'' }, warm:{ bg:'rgba(245,158,11,0.1)', color:'#D29922', icon:'' }, cold:{ bg:'rgba(0,255,178,0.09)', color:'#00FFB2', icon:'' } }
              const lsc = lsColors[ls.tier]
              return (
                <tr key={c.id} onClick={() => setSelectedContact(c.id)}
                  style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer', transition:'background .1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:cc.bg, color:cc.text, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>{c.name.charAt(0)}</div>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontWeight:600, color:C.text }}>{c.name}</span>
                          <span title={ls.reasons.join(', ')} style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:lsc.bg, color:lsc.color }}>{ls.score}</span>
                        </div>
                        {(c.tags||[]).length > 0 && <div style={{display:'flex',gap:4,marginTop:3,flexWrap:'wrap'}}>{c.tags.slice(0,2).map(tag=><span key={tag} style={{fontSize:10,background:C.bg,border:`1px solid ${C.border}`,padding:'1px 6px',borderRadius:4,color:C.textMuted}}>{tag}</span>)}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', color:C.textSec }}>{c.email}</td>
                  <td style={{ padding:'12px 16px', color:C.textSec }}>{c.company}</td>
                  <td style={{ padding:'12px 16px', color:C.textSec }}>{c.city||'—'}</td>
                  <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:6, background:sc.bg, color:sc.text }}>{statusLabel(c.status)}</span></td>
                  <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:6, background:cc.bg, color:cc.text }}>{t[c.category]||c.category}</span></td>
                  <td style={{ padding:'12px 16px', color:C.textMuted, fontSize:12, textTransform:'capitalize' }}>{c.source||'—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={e => { e.stopPropagation(); setEditingContact(c); setShowForm(true) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, padding:4, borderRadius:4, display:'flex' }} title={t.edit}>{Icons.edit(14)}</button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, padding:4, borderRadius:4, display:'flex' }} title={t.delete}>{Icons.trash(14)}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Load More (pagination) */}
      {contactsTotal > contacts.length && (
        <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
          <button
            onClick={() => loadMoreContacts && loadMoreContacts()}
            disabled={contactsLoadingMore}
            style={makeBtn('secondary', { gap:6, opacity: contactsLoadingMore ? 0.6 : 1, cursor: contactsLoadingMore ? 'wait' : 'pointer' })}
          >
            {contactsLoadingMore
              ? (isRTL ? 'جار التحميل...' : 'Loading…')
              : (isRTL
                  ? `تحميل المزيد (عرض ${contacts.length} من ${contactsTotal})`
                  : `Load more (showing ${contacts.length} of ${contactsTotal})`)}
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <ContactFormModal
          t={t} dir={dir} isRTL={isRTL}
          contact={editingContact}
          onSave={(data) => {
            if (editingContact) updateContact(editingContact.id, data)
            else addContact(data)
            setShowForm(false); setEditingContact(null)
          }}
          onClose={() => { setShowForm(false); setEditingContact(null) }}
        />
      )}

      {/* Confirm Delete */}
      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} dir={dir} width={400}>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 12px' }}>{t.confirmDeleteTitle}</h3>
          <p style={{ fontSize:13, color:C.textSec, marginBottom:20 }}>{t.confirmDelete}</p>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmDeleteId(null)} style={makeBtn('secondary')}>{t.cancel}</button>
            <button onClick={() => { deleteContact(confirmDeleteId); setConfirmDeleteId(null) }} style={makeBtn('danger')}>{t.delete}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Contact Form Modal ──────────────────────────────────────────────────────
function ContactFormModal({ t, dir, isRTL, contact, onSave, onClose }) {
  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    company: contact?.company || '',
    city: contact?.city || '',
    category: contact?.category || 'prospect',
    status: contact?.status || 'lead',
    source: contact?.source || 'inbound',
    tags: (contact?.tags || []).join(', '),
    notes: contact?.notes || '',
  })
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSave({
      ...form,
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
    })
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:C.text, margin:0 }}>{contact ? t.editContact : t.addContact}</h2>
        <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex' }}>{Icons.x(20)}</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
        <FormField label={t.contactName} dir={dir}><input value={form.name} onChange={e=>set('name',e.target.value)} maxLength={LIMITS.name} style={inputStyle(dir)}/></FormField>
        <FormField label={t.contactEmail} dir={dir}><input value={form.email} onChange={e=>set('email',e.target.value)} type="email" maxLength={LIMITS.email} style={inputStyle(dir)}/></FormField>
        <FormField label={t.contactPhone} dir={dir}><input value={form.phone} onChange={e=>set('phone',e.target.value)} maxLength={LIMITS.phone} style={inputStyle(dir)}/></FormField>
        <FormField label={t.contactCompany} dir={dir}><input value={form.company} onChange={e=>set('company',e.target.value)} maxLength={100} style={inputStyle(dir)}/></FormField>
        <FormField label={t.city} dir={dir}><input value={form.city} onChange={e=>set('city',e.target.value)} maxLength={100} style={inputStyle(dir)}/></FormField>
        <FormField label={t.contactSource} dir={dir}>
          <select value={form.source} onChange={e=>set('source',e.target.value)} style={selectStyle(dir)}>
            {['referral','event','partnership','website','inbound','outbound','linkedin'].map(s=><option key={s} value={s}>{t[`source${s.charAt(0).toUpperCase()+s.slice(1)}`]||s}</option>)}
          </select>
        </FormField>
        <FormField label={t.contactStatus} dir={dir}>
          <select value={form.status} onChange={e=>set('status',e.target.value)} style={selectStyle(dir)}>
            <option value="active">{t.statusActive}</option>
            <option value="lead">{t.statusLead}</option>
            <option value="inactive">{t.statusInactive}</option>
          </select>
        </FormField>
        <FormField label={t.contactCategory} dir={dir}>
          <select value={form.category} onChange={e=>set('category',e.target.value)} style={selectStyle(dir)}>
            {['client','prospect','partner','supplier','other'].map(c=><option key={c} value={c}>{t[c]||c}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label={t.contactTags + ' (comma separated)'} dir={dir}><input value={form.tags} onChange={e=>set('tags',e.target.value)} maxLength={300} style={inputStyle(dir)} placeholder="e.g. enterprise, renewal"/></FormField>
      <FormField label={t.contactNotes} dir={dir}><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={3} maxLength={LIMITS.notes} style={{...inputStyle(dir),resize:'vertical'}}/></FormField>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
        <button onClick={onClose} style={makeBtn('secondary')}>{t.cancel}</button>
        <button onClick={handleSubmit} className="velo-btn-primary" style={makeBtn('primary')}>{t.save}</button>
      </div>
    </Modal>
  )
}

// ── Contact Profile ─────────────────────────────────────────────────────────
function DentalSpinner({ isRTL }) {
  return (
    <div style={{ ...card, padding: 48, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
      {isRTL ? 'جاري التحميل...' : 'Loading...'}
    </div>
  )
}

function DentalErrorBanner({ isRTL }) {
  return (
    <div style={{ ...card, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>
        {isRTL ? 'تعذر تحميل البيانات' : 'Failed to load data'}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
        {isRTL ? 'حاول مرة أخرى لاحقاً' : 'Please try again later'}
      </div>
    </div>
  )
}

function ContactProfile({ t, dir, isRTL, lang, contact, contactDeals, profileTab, setProfileTab, newNote, setNewNote, addNoteToContact, onBack, onEdit, onDelete, showDealForm, setShowDealForm, addDeal, contacts, isDental, updateContact, currency, orgId, toast }) {
  const cc = CAT_COLORS[contact.category] || CAT_COLORS.other
  const sc = STATUS_COLORS[contact.status] || STATUS_COLORS.lead
  const statusLabel = t[`status${contact.status.charAt(0).toUpperCase()+contact.status.slice(1)}`] || contact.status

  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [showCallModal, setShowCallModal] = useState(false)
  // Bridge from the dental chart: when a tooth's condition is non-healthy
  // and the user clicks "Add to Treatment Plan", we switch to the treatments
  // tab and hand this prefill to TreatmentPlanTab.
  const [treatmentPrefill, setTreatmentPrefill] = useState(null)
  const handleAddToTreatmentPlan = (tooth, condition) => {
    setTreatmentPrefill({ tooth, condition })
    setProfileTab('treatments')
  }

  // ─── Dental data: localStorage (flag OFF) or Supabase (flag ON) ──────────
  const [dentalState, setDentalState] = useState({
    loading: true,
    error: null,
    medicalHistory: {},
    dentalChart: {},
    treatments: [],
    prescriptions: [],
    xrays: [],
  })

  // localStorage helpers — used only in flag-OFF branches. Removed (along
  // with all !DENTAL_SUPABASE_ENABLED guards) in the post-flag-flip cleanup
  // commit. Read normalizes legacy `_medical/_teeth/_treatments[date]/...`
  // shape to the dental.js mapper output (treatmentDate, fileName, etc.) so
  // renderers stay uniform across flag states.
  const LS_KEY = (id) => `velo_dental_${id}`
  const readLegacyDental = (id) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_KEY(id)) || '{}')
      return {
        medicalHistory: parsed._medical || {},
        dentalChart: parsed._teeth || {},
        treatments: (parsed._treatments || []).map(t => ({
          id: t.id,
          procedure: t.procedure || '',
          tooth: t.tooth || '',
          cost: Number(t.cost) || 0,
          currency: t.currency || 'IQD',
          status: t.status || 'planned',
          treatmentDate: t.treatmentDate || t.date || '',
          notes: t.notes || '',
        })),
        prescriptions: (parsed._prescriptions || []).map(rx => ({
          id: rx.id,
          medication: rx.medication || '',
          dosage: rx.dosage || '',
          duration: rx.duration || '',
          notes: rx.notes || '',
          prescribedDate: rx.prescribedDate || rx.date || '',
        })),
        xrays: (parsed._xrays || []).map(xr => ({
          id: xr.id,
          fileName: xr.fileName || xr.name || '',
          signedUrl: xr.signedUrl || xr.url || null,
          storagePath: xr.storagePath || null,
          takenDate: xr.takenDate || xr.date || '',
          notes: xr.notes || '',
        })),
      }
    } catch { return null }
  }
  const writeLegacyDental = (id, data) => {
    try {
      localStorage.setItem(LS_KEY(id), JSON.stringify({
        _medical: data.medicalHistory,
        _teeth: data.dentalChart,
        _treatments: data.treatments,
        _prescriptions: data.prescriptions,
        _xrays: data.xrays,
      }))
    } catch {}
  }

  // Initial fetch — runs on mount. key={contact.id} on parent guarantees a
  // fresh mount per contact, but we keep the deps array honest for safety.
  useEffect(() => {
    let cancelled = false

    if (!DENTAL_SUPABASE_ENABLED) {
      const data = readLegacyDental(contact.id) || {
        medicalHistory: {}, dentalChart: {}, treatments: [], prescriptions: [], xrays: [],
      }
      if (!cancelled) setDentalState({ loading: false, error: null, ...data })
      return () => { cancelled = true }
    }

    if (!orgId) {
      if (!cancelled) setDentalState(s => ({ ...s, loading: false, error: new Error('No org context') }))
      return () => { cancelled = true }
    }

    setDentalState(s => ({ ...s, loading: true, error: null }))
    dental.fetchContactDental(orgId, contact.id)
      .then(data => {
        if (cancelled) return
        setDentalState({ loading: false, error: null, ...data })
      })
      .catch(err => {
        if (cancelled) return
        console.error('fetchContactDental error:', err)
        setDentalState(s => ({ ...s, loading: false, error: err }))
        toast(isRTL ? 'فشل تحميل البيانات السنية' : 'Failed to load dental data', 'error')
      })

    return () => { cancelled = true }
  }, [contact.id, orgId])

  const dentalContact = {
    ...contact,
    _medical: dentalState.medicalHistory,
    _teeth: dentalState.dentalChart,
    _treatments: dentalState.treatments,
    _prescriptions: dentalState.prescriptions,
    _xrays: dentalState.xrays,
  }

  // Payments from Supabase
  const [payments, setPayments] = useState([])
  useEffect(() => {
    let cancelled = false
    db.fetchPaymentsByContact(contact.id).then(data => { if (!cancelled) setPayments(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [contact.id])
  const addPayment = async (p) => {
    try {
      const saved = await db.insertPayment({ ...p, contactId: contact.id })
      setPayments(prev => [saved, ...prev])
    } catch (err) { console.error('Add payment error:', err) }
  }
  const updatePayment = async (id, data) => {
    try {
      const saved = await db.patchPayment(id, data)
      setPayments(prev => prev.map(p => p.id === id ? saved : p))
    } catch (err) { console.error('Update payment error:', err) }
  }
  const deletePayment = async (id) => {
    try {
      await db.removePayment(id)
      setPayments(prev => prev.filter(p => p.id !== id))
    } catch (err) { console.error('Delete payment error:', err) }
  }
  // ─── Per-action dental handlers ───────────────────────────────────────────
  // All 5 use functional setState to capture rollback state; dentalState is
  // intentionally NOT in deps so the callback refs stay stable across edits
  // (prevents subcomponent re-render churn). Optimistic + rollback for blob
  // updates (medical/chart); pessimistic for adds (treatments/rx/xrays).

  const onUpdateMedicalHistory = useCallback(async (history) => {
    let previous
    setDentalState(s => {
      previous = s.medicalHistory
      const next = { ...s, medicalHistory: history }
      if (!DENTAL_SUPABASE_ENABLED) writeLegacyDental(contact.id, next)
      return next
    })
    if (!DENTAL_SUPABASE_ENABLED) return
    try { await dental.updateMedicalHistory(contact.id, history) }
    catch (err) {
      console.error('updateMedicalHistory error:', err)
      setDentalState(s => ({ ...s, medicalHistory: previous }))
      toast(isRTL ? 'فشل حفظ التاريخ الطبي' : 'Failed to save medical history', 'error')
    }
  }, [contact.id, toast, isRTL])

  const onUpdateDentalChart = useCallback(async (teeth) => {
    let previous
    setDentalState(s => {
      previous = s.dentalChart
      const next = { ...s, dentalChart: teeth }
      if (!DENTAL_SUPABASE_ENABLED) writeLegacyDental(contact.id, next)
      return next
    })
    if (!DENTAL_SUPABASE_ENABLED) return
    try { await dental.updateDentalChart(contact.id, teeth) }
    catch (err) {
      console.error('updateDentalChart error:', err)
      setDentalState(s => ({ ...s, dentalChart: previous }))
      toast(isRTL ? 'فشل حفظ مخطط الأسنان' : 'Failed to save dental chart', 'error')
    }
  }, [contact.id, toast, isRTL])

  const onAddTreatment = useCallback(async (t) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      const newRow = {
        id: `tr_${Date.now()}`,
        procedure: t.procedure,
        tooth: t.tooth || '',
        cost: Number(t.cost) || 0,
        currency: 'IQD',
        status: t.status || 'planned',
        treatmentDate: t.treatmentDate || '',
        notes: '',
      }
      setDentalState(s => {
        const next = { ...s, treatments: [newRow, ...s.treatments] }
        writeLegacyDental(contact.id, next)
        return next
      })
      return
    }
    try {
      const newRow = await dental.addTreatment(orgId, contact.id, t)
      setDentalState(s => ({ ...s, treatments: [newRow, ...s.treatments] }))
    } catch (err) {
      console.error('addTreatment error:', err)
      toast(isRTL ? 'فشل إضافة العلاج' : 'Failed to add treatment', 'error')
      throw err
    }
  }, [orgId, contact.id, toast, isRTL])

  const onAddPrescription = useCallback(async (rx) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      const newRow = {
        id: `rx_${Date.now()}`,
        medication: rx.medication,
        dosage: rx.dosage || '',
        duration: rx.duration || '',
        notes: rx.notes || '',
        prescribedDate: rx.prescribedDate || new Date().toISOString().slice(0, 10),
      }
      setDentalState(s => {
        const next = { ...s, prescriptions: [newRow, ...s.prescriptions] }
        writeLegacyDental(contact.id, next)
        return next
      })
      return
    }
    try {
      const newRow = await dental.addPrescription(orgId, contact.id, rx)
      setDentalState(s => ({ ...s, prescriptions: [newRow, ...s.prescriptions] }))
    } catch (err) {
      console.error('addPrescription error:', err)
      toast(isRTL ? 'فشل إضافة الوصفة' : 'Failed to add prescription', 'error')
      throw err
    }
  }, [orgId, contact.id, toast, isRTL])

  const onUploadXray = useCallback(async (file) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const newRow = {
            id: `xr_${Date.now()}`,
            fileName: file.name,
            signedUrl: ev.target.result,
            storagePath: null,
            takenDate: new Date().toISOString().slice(0, 10),
            notes: '',
          }
          setDentalState(s => {
            const next = { ...s, xrays: [newRow, ...s.xrays] }
            writeLegacyDental(contact.id, next)
            return next
          })
          resolve()
        }
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(file)
      })
    }
    try {
      const newRow = await dental.uploadXray(orgId, contact.id, file)
      setDentalState(s => ({ ...s, xrays: [newRow, ...s.xrays] }))
    } catch (err) {
      console.error('uploadXray error:', err)
      toast(isRTL ? 'فشل رفع الصورة' : 'Failed to upload x-ray', 'error')
      throw err
    }
  }, [orgId, contact.id, toast, isRTL])

  const onDeleteTreatment = useCallback(async (treatmentId) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      setDentalState(s => {
        const next = { ...s, treatments: s.treatments.filter(tr => tr.id !== treatmentId) }
        writeLegacyDental(contact.id, next)
        return next
      })
      return
    }
    try {
      await dental.deleteTreatment(treatmentId)
      setDentalState(s => ({ ...s, treatments: s.treatments.filter(tr => tr.id !== treatmentId) }))
    } catch (err) {
      console.error('deleteTreatment error:', err)
      toast(isRTL ? 'فشل حذف العلاج' : 'Failed to delete treatment', 'error')
      throw err
    }
  }, [contact.id, toast, isRTL])

  const onDeletePrescription = useCallback(async (prescriptionId) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      setDentalState(s => {
        const next = { ...s, prescriptions: s.prescriptions.filter(rx => rx.id !== prescriptionId) }
        writeLegacyDental(contact.id, next)
        return next
      })
      return
    }
    try {
      await dental.deletePrescription(prescriptionId)
      setDentalState(s => ({ ...s, prescriptions: s.prescriptions.filter(rx => rx.id !== prescriptionId) }))
    } catch (err) {
      console.error('deletePrescription error:', err)
      toast(isRTL ? 'فشل حذف الوصفة' : 'Failed to delete prescription', 'error')
      throw err
    }
  }, [contact.id, toast, isRTL])

  // dental.deleteXray is strict storage-first: if Storage delete fails, the
  // DB row is preserved (so we never end up with an orphan row pointing at a
  // deleted file). Surface the error so the user knows to retry.
  const onDeleteXray = useCallback(async (xray) => {
    if (!DENTAL_SUPABASE_ENABLED) {
      setDentalState(s => {
        const next = { ...s, xrays: s.xrays.filter(xr => xr.id !== xray.id) }
        writeLegacyDental(contact.id, next)
        return next
      })
      return
    }
    try {
      await dental.deleteXray(xray.id, xray.storagePath)
      setDentalState(s => ({ ...s, xrays: s.xrays.filter(xr => xr.id !== xray.id) }))
    } catch (err) {
      console.error('deleteXray error:', err)
      toast(isRTL ? 'فشل حذف الصورة' : 'Failed to delete x-ray', 'error')
      throw err
    }
  }, [contact.id, toast, isRTL])

  const baseTabs = [
    { id: 'details', label: t.contactDetails },
    { id: 'notes', label: t.notesHistory },
    { id: 'activity', label: t.activityHistoryLabel },
    { id: 'documents', label: t.documents },
    { id: 'deals', label: t.relatedDeals },
    { id: 'payments', label: isRTL ? 'المدفوعات' : 'Payments' },
  ]
  const dentalTabs = isDental ? [
    { id: 'medical', label: isRTL ? 'التاريخ الطبي' : 'Medical History' },
    { id: 'dental_chart', label: isRTL ? 'مخطط الأسنان' : 'Dental Chart' },
    { id: 'treatments', label: isRTL ? 'خطة العلاج' : 'Treatment Plan' },
    { id: 'prescriptions', label: isRTL ? 'الوصفات' : 'Prescriptions' },
    { id: 'xrays', label: isRTL ? 'الأشعة' : 'X-Rays' },
  ] : []
  const tabs = [...baseTabs, ...dentalTabs]

  const activityIcons = { email: Icons.mail, call: Icons.phone, deal: Icons.dollar, meeting: Icons.calendar, note: Icons.edit }

  const fileInputRef = useRef(null)
  const [docs, setDocs] = useState(contact.documents || [])
  const [docUploading, setDocUploading] = useState(false)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploading(true)
    try {
      const saved = await db.uploadContactDocument(contact.id, file)
      setDocs(saved.documents || [])
      if (updateContact) updateContact(contact.id, { _fromDb: saved })
    } catch (err) {
      console.error('Upload error:', err)
      setDocs(prev => [...prev, { id: genId('doc'), name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', date: new Date().toLocaleDateString() }])
    }
    setDocUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDocDownload = async (doc) => {
    if (!doc.path) return
    try {
      const url = await db.getDocumentSignedUrl(doc.path)
      window.open(url, '_blank')
    } catch (err) { console.error('Download error:', err) }
  }

  const handleDocRemove = async (doc) => {
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    try {
      const saved = await db.removeContactDocument(contact.id, doc.id, doc.path)
      setDocs(saved.documents || [])
    } catch (err) { console.error('Remove doc error:', err) }
  }

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} style={{ ...makeBtn('ghost'), marginBottom:16, gap:6, fontSize:13 }}>
        {isRTL ? Icons.arrowRight(16) : Icons.arrowLeft(16)} {t.backToContacts}
      </button>

      {/* Profile header */}
      <div style={{ ...card, padding:24, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:20, direction:dir }}>
          <div style={{ width:64, height:64, borderRadius:16, background:cc.bg, color:cc.text, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700, flexShrink:0 }}>
            {contact.name.charAt(0)}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <h2 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0 }}>{contact.name}</h2>
              {(() => { const ls=calculateLeadScore(contact,contactDeals,[]); const lc={hot:{bg:'rgba(239,68,68,0.1)',color:'#FF6B6B',icon:''},warm:{bg:'rgba(245,158,11,0.1)',color:'#D29922',icon:''},cold:{bg:'rgba(0,255,178,0.09)',color:'#00FFB2',icon:''}}[ls.tier]; return <span title={ls.reasons.join(', ')} style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:6, background:lc.bg, color:lc.color }}>{ls.score}</span> })()}
              <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:6, background:sc.bg, color:sc.text }}>{statusLabel}</span>
              <span style={{ fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:6, background:cc.bg, color:cc.text }}>{t[contact.category]||contact.category}</span>
            </div>
            <div style={{ display:'flex', gap:20, marginTop:10, flexWrap:'wrap', fontSize:13, color:C.textSec }}>
              <span style={{display:'flex',alignItems:'center',gap:5}}>{Icons.mail(14)} {contact.email}</span>
              <span style={{display:'flex',alignItems:'center',gap:5}}>{Icons.phone(14)} {contact.phone}</span>
              <span style={{display:'flex',alignItems:'center',gap:5}}>{Icons.building(14)} {contact.company}</span>
              {contact.city && <span style={{display:'flex',alignItems:'center',gap:5}}>{Icons.mapPin(14)} {contact.city}</span>}
            </div>
            {(contact.tags||[]).length > 0 && (
              <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                {contact.tags.map(tag => <span key={tag} style={{ fontSize:11, background:C.bg, border:`1px solid ${C.border}`, padding:'2px 8px', borderRadius:5, color:C.textSec }}>{tag}</span>)}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button type="button" onClick={onEdit} style={makeBtn('secondary', { gap:6 })}>{Icons.edit(14)} {t.edit}</button>
            <button type="button" onClick={onDelete} style={makeBtn('danger', { gap:6 })}>{Icons.trash(14)} {t.delete}</button>
          </div>
        </div>
      </div>

      {/* Contact Channels Bar */}
      <div style={{ ...card, padding:'12px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginRight:4 }}>{isRTL?'تواصل عبر:':'Reach out via:'}</span>
        {contact.phone && <button type="button" onClick={(e)=>{e.stopPropagation();window.open(`https://wa.me/${contact.phone.replace(/[^0-9+]/g,'')}`,'_blank')}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:'none',background:'#25D36618',color:'#25D366',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          WhatsApp
        </button>}
        {contact.phone && <button type="button" onClick={(e)=>{e.stopPropagation();setShowSmsModal(true)}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:'none',background:C.primaryBg,color:C.primary,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          SMS
        </button>}
        {contact.email && <button type="button" onClick={(e)=>{e.stopPropagation();setShowEmailModal(true)}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:'none',background:'#E16F2418',color:'#E16F24',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>
          {Icons.mail(14)} Email
        </button>}
        {contact.phone && <button type="button" onClick={(e)=>{e.stopPropagation();setShowCallModal(true)}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:'none',background:'rgba(0,255,136,0.09)',color:'#00FFB2',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>
          {Icons.phone(14)} {isRTL?'اتصال':'Call'}
        </button>}
        <button type="button" title={isRTL?'اربط فيسبوك من التكاملات':'Connect Facebook in Integrations'} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.textMuted,fontSize:12,fontWeight:500,cursor:'default',fontFamily:'inherit',minHeight:36,opacity:.5}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          Facebook
        </button>
        <button type="button" title={isRTL?'اربط إنستغرام من التكاملات':'Connect Instagram in Integrations'} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.textMuted,fontSize:12,fontWeight:500,cursor:'default',fontFamily:'inherit',minHeight:36,opacity:.5}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/></svg>
          Instagram
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:`2px solid ${C.border}` }}>
        {tabs.map(tab => (
          <button type="button" key={tab.id} onClick={(e) => { e.stopPropagation(); setProfileTab(tab.id) }}
            style={{ padding:'10px 18px', border:'none', background:'transparent', cursor:'pointer',
              fontSize:13, fontWeight: profileTab===tab.id ? 700 : 500,
              color: profileTab===tab.id ? C.primary : C.textSec,
              borderBottom: profileTab===tab.id ? `2px solid ${C.primary}` : '2px solid transparent',
              marginBottom:-2, fontFamily:'inherit', transition:'all .15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fade-in" key={profileTab}>
        {profileTab === 'details' && (
          <div style={{ ...card, padding:24 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {[
                [t.contactName, contact.name],
                [t.contactEmail, contact.email],
                [t.contactPhone, contact.phone],
                [t.contactCompany, contact.company],
                [t.city, contact.city || '—'],
                [t.contactSource, contact.source || '—'],
                [t.contactStatus, statusLabel],
                [t.contactCategory, t[contact.category] || contact.category],
              ].map(([label, value], i) => (
                <div key={i}>
                  <div style={{ fontSize:12, color:C.textMuted, fontWeight:600, marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14, color:C.text }}>{value}</div>
                </div>
              ))}
            </div>
            {contact.notes && !contact.notes.startsWith('{') && (
              <div style={{ marginTop:20, padding:16, background:C.bg, borderRadius:8 }}>
                <div style={{ fontSize:12, color:C.textMuted, fontWeight:600, marginBottom:6 }}>{t.notes}</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{contact.notes}</div>
              </div>
            )}
          </div>
        )}

        {profileTab === 'notes' && (
          <div style={{ ...card, padding:24 }}>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder={t.writeSomething} style={{ ...inputStyle(dir), flex:1 }}
                onKeyDown={e => { if (e.key==='Enter' && newNote.trim()) { addNoteToContact(contact.id, newNote.trim()); setNewNote('') }}} />
              <button onClick={() => { if(newNote.trim()) { addNoteToContact(contact.id, newNote.trim()); setNewNote('') }}} className="velo-btn-primary" style={makeBtn('primary')}>{t.addNote}</button>
            </div>
            {(contact.notesTimeline||[]).length === 0
              ? <p style={{ color:C.textMuted, fontSize:13, textAlign:'center', padding:24 }}>{t.noNotes}</p>
              : [...(contact.notesTimeline||[])].reverse().map(note => (
                <div key={note.id} style={{ padding:'14px 0', borderBottom:`1px solid ${C.border}`, display:'flex', gap:12 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:C.primary, marginTop:6, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{note.text}</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>{note.author} &middot; {note.date}</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {profileTab === 'activity' && (
          <div style={{ ...card, padding:24 }}>
            {(contact.activityHistory||[]).length === 0
              ? <p style={{ color:C.textMuted, fontSize:13, textAlign:'center', padding:24 }}>{t.noActivityHistory}</p>
              : (contact.activityHistory||[]).map(act => {
                const IconFn = activityIcons[act.type] || Icons.activity
                return (
                  <div key={act.id} style={{ padding:'12px 0', borderBottom:`1px solid ${C.border}`, display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:C.primaryBg, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{IconFn(16)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:C.text }}>{act.text}</div>
                      <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>{act.date}</div>
                    </div>
                  </div>
                )
              })
            }
          </div>
        )}

        {profileTab === 'documents' && (
          <div style={{ ...card, padding:24 }}>
            <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
              <input ref={fileInputRef} type="file" style={{display:'none'}} onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} disabled={docUploading} style={makeBtn('secondary', { gap:6 })}>
                {Icons.upload(14)} {docUploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : t.uploadDocument}
              </button>
            </div>
            {docs.length === 0
              ? <p style={{ color:C.textMuted, fontSize:13, textAlign:'center', padding:24 }}>{t.noDocuments}</p>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                    {[t.fileName, t.fileSize, t.uploadDate, ''].map((h,i) => <th key={i} style={{ padding:'8px 12px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:12 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{docs.map(doc => (
                    <tr key={doc.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:8}}>{Icons.file(14)}<span style={{cursor: doc.path ? 'pointer' : 'default', color: doc.path ? C.primary : C.text, textDecoration: doc.path ? 'underline' : 'none'}} onClick={() => handleDocDownload(doc)}>{doc.name}</span></td>
                      <td style={{padding:'10px 12px',color:C.textMuted}}>{doc.size}</td>
                      <td style={{padding:'10px 12px',color:C.textMuted}}>{doc.date}</td>
                      <td style={{padding:'10px 12px', display:'flex', gap:8}}>
                        {doc.path && <button onClick={() => handleDocDownload(doc)} style={{border:'none',background:'transparent',cursor:'pointer',color:C.primary,fontSize:12}}>{isRTL ? 'تحميل' : 'Download'}</button>}
                        <button onClick={() => handleDocRemove(doc)} style={{border:'none',background:'transparent',cursor:'pointer',color:C.danger,fontSize:12}}>{t.removeDoc}</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
            }
          </div>
        )}

        {profileTab === 'deals' && (
          <div style={{ ...card, padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:15, fontWeight:600, color:C.text, margin:0 }}>{t.relatedDeals}</h3>
              <button onClick={() => setShowDealForm(true)} className="velo-btn-primary" style={makeBtn('primary', { gap:6 })}>
                {Icons.plus(14)} {t.createDealForContact}
              </button>
            </div>
            {contactDeals.length === 0
              ? <p style={{ color:C.textMuted, fontSize:13, textAlign:'center', padding:24 }}>{t.noRelatedDeals}</p>
              : contactDeals.map(deal => {
                const stageColor = STAGE_COLORS[deal.stage] || STAGE_COLORS.lead
                const stageLabel = t[`stage${deal.stage.charAt(0).toUpperCase()+deal.stage.slice(1)}`] || deal.stage
                return (
                  <div key={deal.id} style={{ padding:'14px 16px', border:`1px solid ${C.border}`, borderRadius:8, marginBottom:8, display:'flex', alignItems:'center', gap:12, background:C.white }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{deal.name}</div>
                      <div style={{ fontSize:12, color:C.textMuted, marginTop:3 }}>{fmt$(deal.value)} &middot; {deal.closeDate}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:6, background:stageColor.bg, color:stageColor.text }}>{stageLabel}</span>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* Payments tab */}
        {profileTab === 'payments' && <PaymentsTab payments={payments} addPayment={addPayment} updatePayment={updatePayment} deletePayment={deletePayment} contactDeals={contactDeals} currency={currency||'USD'} dir={dir} isRTL={isRTL} />}

        {/* Dental tabs */}
        {isDental && profileTab === 'medical' && (
          dentalState.loading ? <DentalSpinner isRTL={isRTL} /> :
          dentalState.error ? <DentalErrorBanner isRTL={isRTL} /> :
          <DentalMedicalHistory contact={dentalContact} onUpdateMedicalHistory={onUpdateMedicalHistory} lang={lang} dir={dir} />
        )}
        {isDental && profileTab === 'dental_chart' && (
          dentalState.loading ? <DentalSpinner isRTL={isRTL} /> :
          dentalState.error ? <DentalErrorBanner isRTL={isRTL} /> :
          <DentalChartWrapper contact={dentalContact} onUpdateDentalChart={onUpdateDentalChart} onAddToTreatmentPlan={handleAddToTreatmentPlan} lang={lang} />
        )}
        {isDental && profileTab === 'treatments' && (
          dentalState.loading ? <DentalSpinner isRTL={isRTL} /> :
          dentalState.error ? <DentalErrorBanner isRTL={isRTL} /> :
          <DentalTreatments contact={dentalContact} onAddTreatment={onAddTreatment} onDeleteTreatment={onDeleteTreatment} lang={lang} dir={dir} prefill={treatmentPrefill} onPrefillConsumed={() => setTreatmentPrefill(null)} />
        )}
        {isDental && profileTab === 'prescriptions' && (
          dentalState.loading ? <DentalSpinner isRTL={isRTL} /> :
          dentalState.error ? <DentalErrorBanner isRTL={isRTL} /> :
          <DentalPrescriptions contact={dentalContact} onAddPrescription={onAddPrescription} onDeletePrescription={onDeletePrescription} lang={lang} dir={dir} />
        )}
        {isDental && profileTab === 'xrays' && (
          dentalState.loading ? <DentalSpinner isRTL={isRTL} /> :
          dentalState.error ? <DentalErrorBanner isRTL={isRTL} /> :
          <DentalXRays contact={dentalContact} onUploadXray={onUploadXray} onDeleteXray={onDeleteXray} lang={lang} dir={dir} />
        )}
      </div>

      {/* Quick Deal Form */}
      {showDealForm && (
        <DealFormModal t={t} dir={dir} contacts={contacts} defaultContactId={contact.id}
          onSave={(d) => { addDeal(d); setShowDealForm(false) }}
          onClose={() => setShowDealForm(false)} />
      )}

      {/* Email Compose Modal */}
      {showEmailModal && <ComposeModal type="email" contact={contact} dir={dir} isRTL={isRTL} onClose={() => setShowEmailModal(false)} />}
      {showSmsModal && <ComposeModal type="sms" contact={contact} dir={dir} isRTL={isRTL} onClose={() => setShowSmsModal(false)} />}
      {showCallModal && (
        <Modal onClose={() => setShowCallModal(false)} dir={dir} width={380}>
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(0,255,136,0.09)', color:'#00FFB2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>{Icons.phone(24)}</div>
            <h3 style={{ fontSize:18, fontWeight:700, color:C.text, margin:'0 0 4px' }}>{contact.name}</h3>
            <p style={{ fontSize:16, color:C.textSec, fontFamily:'monospace', margin:'0 0 20px' }}>{contact.phone}</p>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(contact.phone) }} style={makeBtn('secondary', { gap:6 })}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                {isRTL?'نسخ':'Copy'}
              </button>
              <a href={`tel:${contact.phone}`} style={{ ...makeBtn('primary', { gap:6 }), textDecoration:'none' }}>
                {Icons.phone(14)} {isRTL?'فتح المتصل':'Open Dialer'}
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const PAYMENT_METHODS = [
  { id:'cash', en:'Cash', ar:'نقداً', icon:'💵' },
  { id:'bank_transfer', en:'Bank Transfer', ar:'تحويل بنكي', icon:'🏦' },
  { id:'card', en:'Credit/Debit Card', ar:'بطاقة ائتمان', icon:'💳' },
  { id:'zaincash', en:'ZainCash', ar:'زين كاش', icon:'📱' },
  { id:'fib', en:'FIB (First Iraqi Bank)', ar:'FIB المصرف العراقي الأول', icon:'🏦' },
  { id:'asia_hawala', en:'Asia Hawala', ar:'آسيا حوالة', icon:'💱' },
]
const PAYMENT_STATUSES = [
  { id:'paid', en:'Paid', ar:'مدفوع', color:'#00FFB2', bg:'rgba(0,255,136,0.1)' },
  { id:'pending', en:'Pending', ar:'معلق', color:'#D29922', bg:'rgba(245,158,11,0.1)' },
  { id:'overdue', en:'Overdue', ar:'متأخر', color:'#FF6B6B', bg:'rgba(239,68,68,0.1)' },
  { id:'cancelled', en:'Cancelled', ar:'ملغى', color:'#64748b', bg:'rgba(255,255,255,0.04)' },
]

function resolvePaymentStatus(p) {
  if (p.status === 'cancelled' || p.status === 'paid') return p.status
  if (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < new Date()) return 'overdue'
  return p.status
}

function PaymentsTab({ payments, addPayment, updatePayment, deletePayment, contactDeals, currency, dir, isRTL }) {
  const [showForm, setShowForm] = useState(false)
  const [statusDropdown, setStatusDropdown] = useState(null)
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null)
  const today = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({ amount:'', currency, method:'cash', status:'pending', dueDate:'', paymentDate:'', description:'', dealId:'' })

  // Resolve auto-overdue
  const resolved = payments.map(p => ({ ...p, _resolved: resolvePaymentStatus(p) }))
  const totalPaid = resolved.filter(p=>p._resolved==='paid').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalPending = resolved.filter(p=>p._resolved==='pending'||p._resolved==='overdue').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalOverdue = resolved.filter(p=>p._resolved==='overdue').reduce((s,p)=>s+Number(p.amount||0),0)

  const handleAdd = () => {
    if(!form.amount) return
    addPayment({ ...form, amount:Number(form.amount)||0 })
    setForm({ amount:'', currency, method:'cash', status:'pending', dueDate:'', paymentDate:'', description:'', dealId:'' })
    setShowForm(false)
  }

  const changeStatus = (id, newStatus) => {
    const updates = { status: newStatus }
    if (newStatus === 'paid') updates.paymentDate = today
    updatePayment(id, updates)
    setStatusDropdown(null)
  }

  const statusTransitions = {
    pending: [{ to:'paid', label:isRTL?'تم الدفع':'Mark as Paid', color:'#00FFB2' }, { to:'overdue', label:isRTL?'متأخر':'Mark as Overdue', color:'#FF6B6B' }, { to:'cancelled', label:isRTL?'إلغاء':'Cancel', color:'#64748b' }],
    overdue: [{ to:'paid', label:isRTL?'تم الدفع':'Mark as Paid', color:'#00FFB2' }, { to:'cancelled', label:isRTL?'إلغاء':'Cancel', color:'#64748b' }],
    paid: [{ to:'pending', label:isRTL?'إرجاع إلى معلق':'Mark as Pending', color:'#D29922' }],
    cancelled: [{ to:'pending', label:isRTL?'إعادة تفعيل':'Reactivate', color:'#D29922' }],
  }

  return (
    <div style={{ ...card, padding:24 }} onClick={() => statusDropdown && setStatusDropdown(null)}>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label: isRTL?'إجمالي المدفوع':'Total Paid', value: totalPaid, color:'#00FFB2', bg:'rgba(0,255,136,0.1)' },
          { label: isRTL?'معلق + متأخر':'Pending + Overdue', value: totalPending, color:'#D29922', bg:'rgba(245,158,11,0.1)' },
          { label: isRTL?'متأخر':'Overdue', value: totalOverdue, color:'#FF6B6B', bg:'rgba(239,68,68,0.1)' },
        ].map((s,i) => (
          <div key={i} style={{ padding:14, borderRadius:10, background:s.bg, textAlign:'center' }}>
            <div style={{ fontSize:10, fontWeight:600, color:s.color, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:s.color }}>{fmtMoney(s.value, currency)}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h3 style={{ fontSize:15, fontWeight:600, color:C.text, margin:0 }}>{isRTL?'المدفوعات':'Payments'} ({payments.length})</h3>
        <button type="button" onClick={()=>setShowForm(true)} className="velo-btn-primary" style={makeBtn('primary',{gap:6,fontSize:12})}>{Icons.plus(14)} {isRTL?'إضافة دفعة':'Add Payment'}</button>
      </div>

      {payments.length === 0 ? (
        <p style={{ fontSize:13, color:C.textMuted, textAlign:'center', padding:24 }}>{isRTL?'لا توجد مدفوعات':'No payments recorded'}</p>
      ) : resolved.sort((a,b)=>(b.dueDate||b.date||'').localeCompare(a.dueDate||a.date||'')).map(p => {
        const effectiveStatus = p._resolved
        const st = PAYMENT_STATUSES.find(s=>s.id===effectiveStatus) || PAYMENT_STATUSES[1]
        const meth = PAYMENT_METHODS.find(m=>m.id===p.method)
        const transitions = statusTransitions[effectiveStatus] || []

        return (
          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${C.border}`, opacity: effectiveStatus==='cancelled'?.5:1 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:st.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>{meth?.icon||'💵'}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{fmtMoney(p.amount, p.currency||currency)}</span>
                {/* Clickable status badge */}
                <div style={{ position:'relative' }}>
                  <button type="button" onClick={e=>{e.stopPropagation();setStatusDropdown(statusDropdown===p.id?null:p.id)}}
                    style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, background:st.bg, color:st.color, border:`1px solid ${st.color}33`, cursor:'pointer', fontFamily:'inherit' }}>
                    {isRTL?st.ar:st.en} ▾
                  </button>
                  {statusDropdown===p.id && transitions.length > 0 && (
                    <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, background:C.white, borderRadius:8, border:`1px solid ${C.border}`, boxShadow:'0 4px 12px rgba(0,0,0,.1)', zIndex:50, overflow:'hidden', minWidth:160 }}>
                      {transitions.map(tr => (
                        <button key={tr.to} type="button" onClick={e=>{e.stopPropagation();changeStatus(p.id, tr.to)}}
                          style={{ display:'block', width:'100%', padding:'8px 12px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, color:tr.color, textAlign:isRTL?'right':'left' }}
                          onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {tr.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>
                {isRTL?meth?.ar:meth?.en}
                {p.dueDate && <> &middot; {isRTL?'استحقاق:':'Due:'} {p.dueDate}</>}
                {p.paymentDate && effectiveStatus==='paid' && <> &middot; {isRTL?'دفع:':'Paid:'} {p.paymentDate}</>}
                {p.description && <> &middot; {p.description}</>}
              </div>
            </div>
            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
              <button type="button" onClick={e=>{e.stopPropagation();setConfirmDeletePayment(p.id)}} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex', padding:4 }}>{Icons.trash(14)}</button>
            </div>
          </div>
        )
      })}

      {showForm && (
        <Modal onClose={()=>setShowForm(false)} dir={dir} width={480}>
          <form onSubmit={e=>{e.preventDefault();handleAdd()}}>
            <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 16px' }}>{isRTL?'إضافة دفعة':'Add Payment'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <FormField label={isRTL?'المبلغ':'Amount'} dir={dir}><input value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} type="number" step="0.01" style={inputStyle(dir)} /></FormField>
              <FormField label={isRTL?'العملة':'Currency'} dir={dir}>
                <select value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))} style={selectStyle(dir)}>
                  {Object.entries(CURRENCY_SYMBOLS).map(([k,v])=><option key={k} value={k}>{k} ({v.trim()})</option>)}
                </select>
              </FormField>
              <FormField label={isRTL?'طريقة الدفع':'Payment Method'} dir={dir}>
                <select value={form.method} onChange={e=>setForm(p=>({...p,method:e.target.value}))} style={selectStyle(dir)}>
                  {PAYMENT_METHODS.map(m=><option key={m.id} value={m.id}>{m.icon} {isRTL?m.ar:m.en}</option>)}
                </select>
              </FormField>
              <FormField label={isRTL?'الحالة':'Status'} dir={dir}>
                <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={selectStyle(dir)}>
                  <option value="pending">{isRTL?'معلق':'Pending'}</option>
                  <option value="paid">{isRTL?'مدفوع':'Paid'}</option>
                </select>
              </FormField>
              <FormField label={isRTL?'تاريخ الاستحقاق':'Due Date'} dir={dir}><input value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))} type="date" style={inputStyle(dir)} /></FormField>
              {form.status==='paid' && <FormField label={isRTL?'تاريخ الدفع':'Payment Date'} dir={dir}><input value={form.paymentDate} onChange={e=>setForm(p=>({...p,paymentDate:e.target.value}))} type="date" style={inputStyle(dir)} /></FormField>}
              {form.status!=='paid' && <div/>}
              <FormField label={isRTL?'صفقة مرتبطة':'Linked Deal'} dir={dir}>
                <select value={form.dealId} onChange={e=>setForm(p=>({...p,dealId:e.target.value}))} style={selectStyle(dir)}>
                  <option value="">{isRTL?'بدون':'None'}</option>
                  {(contactDeals||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label={isRTL?'الوصف / رقم الفاتورة':'Description / Invoice #'} dir={dir}><input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder={isRTL?'مثال: فاتورة #1234':'e.g. Invoice #1234'} style={inputStyle(dir)} /></FormField>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button type="button" onClick={()=>setShowForm(false)} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
              <button type="submit" className="velo-btn-primary" style={makeBtn('primary')}>{isRTL?'إضافة':'Add'}</button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDeletePayment && (
        <Modal onClose={() => setConfirmDeletePayment(null)} dir={dir} width={400}>
          <div style={{ textAlign:'center', padding:8 }}>
            <div style={{ width:48, height:48, borderRadius:'50%', margin:'0 auto 12px', background:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </div>
            <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 8px' }}>{isRTL ? 'حذف الدفعة؟' : 'Delete this payment?'}</h3>
            <p style={{ fontSize:13, color:C.textSec, margin:'0 0 16px' }}>{isRTL ? 'لا يمكن التراجع عن هذا' : 'This action cannot be undone'}</p>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button onClick={() => setConfirmDeletePayment(null)} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={() => { deletePayment(confirmDeletePayment); setConfirmDeletePayment(null) }} style={makeBtn('danger')}>{isRTL ? 'حذف' : 'Delete'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ComposeModal({ type, contact, dir, isRTL, onClose }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const to = type === 'email' ? contact.email : contact.phone
  const title = type === 'email' ? (isRTL?'إرسال بريد':'Send Email') : (isRTL?'إرسال SMS':'Send SMS')
  const handleSend = () => { setSent(true); setTimeout(() => { setSent(false); onClose() }, 1500) }
  return (
    <Modal onClose={onClose} dir={dir} width={480}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:0 }}>{title}</h3>
        <button type="button" onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex' }}>{Icons.x(18)}</button>
      </div>
      <FormField label={isRTL?'إلى':'To'} dir={dir}><input value={to} readOnly style={{ ...inputStyle(dir), background:C.bg }} /></FormField>
      {type === 'email' && <FormField label={isRTL?'الموضوع':'Subject'} dir={dir}><input value={subject} onChange={e=>setSubject(e.target.value)} style={inputStyle(dir)} /></FormField>}
      <FormField label={isRTL?'الرسالة':'Message'} dir={dir}><textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} style={{ ...inputStyle(dir), resize:'vertical' }} placeholder={isRTL?'اكتب رسالتك...':'Type your message...'} /></FormField>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button type="button" onClick={onClose} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
        <button type="button" onClick={handleSend} style={makeBtn(sent?'success':'primary', { gap:6 })}>
          {sent ? Icons.check(14) : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
          {sent ? (isRTL?'تم الإرسال':'Sent!') : (isRTL?'إرسال':'Send')}
        </button>
      </div>
    </Modal>
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

function InboxPage({ t, lang, dir, isRTL, contacts, setPage, tickets, addTicket, urlConvId, navigate, teamMembers, isSuperAdmin, impersonation, orgId, demoMode, toast }) {
  if (isSuperAdmin && !impersonation) return <AgencyEmptyState isRTL={isRTL} setPage={setPage} />
  const [conversations, setConversations] = useState(() => {
    const isDemo = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1'
    return isDemo ? SAMPLE_CONVERSATIONS : []
  })
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
  const [showTicketForm, setShowTicketForm] = useState(false)
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
                {/* Ticket badge if linked */}
                {(() => {
                  const linked = (tickets||[]).find(tk => tk.conversationId === activeConvId)
                  return linked ? (
                    <button onClick={() => setPage('tickets')} style={{
                      padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700,
                      background: TICKET_PRIORITY_COLORS[linked.priority]?.bg || C.bg,
                      color: TICKET_PRIORITY_COLORS[linked.priority]?.text || C.text,
                      cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {Icons.ticket(12)} #{linked.ticketId} — {t[`status${linked.status.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join('')}`] || linked.status}
                    </button>
                  ) : null
                })()}
                {activeContact && (
                  <button onClick={() => setPage('contacts')} style={makeBtn('secondary', { padding: '6px 10px', fontSize: 11, gap: 4 })}>
                    {Icons.user(13)} {t.viewProfile}
                  </button>
                )}
                <button onClick={() => setShowTicketForm(true)} style={makeBtn('secondary', { padding: '6px 10px', fontSize: 11, gap: 4 })}>
                  {Icons.ticket(13)} {t.createTicketFromConv}
                </button>
                <button style={makeBtn('secondary', { padding: '6px 10px', fontSize: 11, gap: 4 })}>
                  {Icons.calendar(13)} {t.schedule}
                </button>
              </div>
            </div>

            {/* ── Messages Area ────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                let lastDate = ''
                return activeConv.messages.map((msg, idx) => {
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
      {/* Create Ticket from Conversation */}
      {showTicketForm && activeConv && (
        <TicketFormModal t={t} dir={dir} contacts={contacts} teamMembers={teamMembers}
          defaultContactId={activeConv.contactId} defaultContactName={activeConv.contactName}
          defaultConversationId={activeConv.id}
          defaultSubject={`${activeConv.contactName}: ${activeConv.lastMessage.substring(0,60)}`}
          onSave={(tk) => { addTicket(tk); setShowTicketForm(false) }}
          onClose={() => setShowTicketForm(false)} />
      )}
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
