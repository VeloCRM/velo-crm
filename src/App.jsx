import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { entrance } from './lib/motion'
import { T } from './translations'
import { BRAND } from './config/brand'
import { Logo } from './components/Logo'
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
const DentalPrescriptions = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.PrescriptionsTab }))
)
const DentalNotes = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.NotesTab }))
)
const DentalDocuments = lazy(() =>
  import('./components/DentalTabs').then(m => ({ default: m.DocumentsTab }))
)
const DentalXrays = lazy(() => import('./components/XraysTab'))
import TestAccountBanner from './components/TestAccountBanner'
import AddAppointmentModal from './components/AddAppointmentModal'
import { SkeletonDashboard, SkeletonContacts, SkeletonInbox, SkeletonCalendar, SkeletonGeneric } from './components/Skeleton'
import { useToast, ToastContainer } from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import EmptyState from './components/EmptyState'

// Minimal placeholder used inside Suspense for overlays. Most overlays are
// gated on an `open` flag, so this is rendered for a single frame at most.
const OverlayFallback = () => null
import { signOut, getCurrentUser, onAuthStateChange } from './lib/auth'
import { getImpersonationContext } from './lib/auth_session'
import { isSupabaseConfigured } from './lib/supabase'
import { queryClient } from './lib/queryClient'
import { invalidateFinance } from './lib/financeCache'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import * as db from './lib/database'
import { reversePayment, createCharge, voidCharge, getPatientBalance, fetchChargesByPatient } from './lib/billing'
import { BalanceSummary, ChargesSection } from './components/BillingSections'
import { isSessionExpired, touchSession, clearAllVeloData, sanitizePathParam, LIMITS, checkSupabaseRateLimit } from './lib/sanitize'
import { rememberPendingInvite } from './lib/invitations'
import { listAppointmentsForPatient } from './lib/appointments'
import { todayLocal } from './lib/date'
import { listDoctorsInOrg } from './lib/profiles'
import { formatMoney, toMinor } from './lib/money'
import { avatarGradient, avatarInitials } from './lib/avatarGradient'
import { GlassCard, Button, Badge, Input, EmptyState as UIEmptyState } from './components/ui'
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
  undo: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
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

  // Belt-and-braces cache isolation: wipe the TanStack Query cache whenever the
  // effective org changes (impersonation enter / switch / exit / sign-out). Query
  // keys are already org-scoped (['<entity>', orgId, …]) so a switch loads a fresh
  // entry, but clearing guarantees clinic A's cached data can never surface under B.
  useEffect(() => {
    queryClient.clear()
  }, [impersonation?.orgId])

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
  // patients / patientsTotal / patientsLoadingMore now come from a useInfiniteQuery
  // defined below (after all its deps: dentalOrgId, patientFilterDoctorId, demoMode,
  // isOperator). See the "Patients — TanStack Query" section.
  // "My patients" filter (PR #6): null = all, otherwise a doctor id. PatientsPage
  // owns the toggle UI / role-default / localStorage and lifts the id up here;
  // the list fetch (which lives in this component) applies it server-side.
  const [patientFilterDoctorId, setPatientFilterDoctorId] = useState(null)
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

  // Light-only: remove any leftover [data-theme="dark"] attribute set by an
  // older session, and clear the legacy localStorage key. Dark mode toggle
  // was removed in Sprint 1 Phase 2.3.1 because the new Liquid Glass design
  // system is light-only and a proper dark variant isn't in Sprint 1 scope.
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    try { localStorage.removeItem('velo_dark') } catch { /* private mode */ }
  }, [])

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
      // Sample patients are derived from sampleData in the Patients query section
      // below (query is disabled in demo) — nothing to load here.
      return
    }
    if (!useDB) {
      // No Supabase configured (dev only). Nothing to load.
      return
    }
    // Operator without impersonation has no org context; calling getCurrentOrgId()
    // here would throw "No org membership for current user". Use the live
    // getImpersonationContext() (localStorage-backed, same source of truth as
    // getCurrentOrgId) rather than the React state — exit-impersonation paths
    // call loadAllData() synchronously after setImpersonation(null) +
    // localStorage.removeItem('velo_impersonating'), and the React state update
    // is async while localStorage is sync. The closure here would see
    // impersonation=truthy (stale) but getCurrentOrgId would see localStorage
    // as cleared — they'd disagree, the guard would miss, and the throw would
    // surface as the banner.
    if (isOperator && !getImpersonationContext()) {
      setDataLoading(false)
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

      // Patients load via the useInfiniteQuery (keyed on dentalOrgId); org-wide
      // payments are no longer prefetched here — nothing on the shell consumed them
      // (FinancePage loads its own bounded/aggregated data).
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
      // Patients load via the useInfiniteQuery (impersonation branch); org-wide
      // payments aren't prefetched (unused).
    } catch (err) {
      console.error('Impersonation data load error:', err)
      setDataError(err.message || 'Failed to load org data')
    } finally {
      setDataLoading(false)
    }
  }

  // ── Patients — TanStack Query (org-scoped, paginated, optimistic mutations) ──
  // Reference pattern (see ActivityLogTab): key = ['patients', orgId, serverParams].
  // filterDoctorId is a SERVER param (changes the result) so it's in the key — switching
  // it swaps to a fresh cache entry (the old my-filter refetch effect is gone). Search is
  // a SEPARATE path inside PatientsPage (searchResults), intentionally not keyed here.
  // Disabled in demo / no-org-operator; patients then derive from sampleData / empty.
  const patientsQueryEnabled = useDB && !demoMode && !!dentalOrgId && !(isOperator && !impersonation)
  const patientsQueryKey = ['patients', dentalOrgId, { filterDoctorId: patientFilterDoctorId || null }]
  const patientsQuery = useInfiniteQuery({
    queryKey: patientsQueryKey,
    queryFn: ({ pageParam = 0 }) => (impersonation
      ? db.fetchPatientsForOrg(impersonation.orgId, pageParam)
      : db.fetchPatients(pageParam, undefined, { primaryDoctorId: patientFilterDoctorId || undefined })),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, pg) => n + (pg.rows?.length || 0), 0)
      return loaded < (lastPage?.total || 0) ? loaded : undefined
    },
    enabled: patientsQueryEnabled,
  })
  // Derived — same names/shapes children already consume. Demo derives from sampleData
  // (query disabled); otherwise flatten the infinite pages.
  const patients = useMemo(
    () => (demoMode
      ? (sampleData?.SAMPLE_DENTAL_PATIENTS || [])
      : (patientsQuery.data?.pages.flatMap(pg => pg.rows) || [])),
    [demoMode, sampleData, patientsQuery.data],
  )
  const patientsTotal = demoMode ? patients.length : (patientsQuery.data?.pages?.[0]?.total ?? patients.length)
  const patientsLoadingMore = patientsQuery.isFetchingNextPage
  const loadMorePatients = useCallback(() => {
    if (!patientsQuery.hasNextPage || patientsQuery.isFetchingNextPage) return
    if (!checkSupabaseRateLimit()) {
      addToast(isRTL ? 'كثرة الطلبات، حاول لاحقاً' : 'Too many requests, try again shortly', 'error')
      return
    }
    patientsQuery.fetchNextPage()
  }, [patientsQuery, addToast, isRTL])

  // Optimistic write helper: patch page 0 of the infinite cache in place.
  const patchPatientsCache = (updater) => {
    queryClient.setQueryData(patientsQueryKey, (old) => {
      if (!old?.pages?.length) return old
      return { ...old, pages: old.pages.map((pg, i) => (i === 0 ? updater(pg) : pg)) }
    })
  }

  const addPatientMutation = useMutation({
    mutationFn: ({ raw }) => db.insertPatient(raw, dentalOrgId),
    onMutate: async ({ optimistic }) => {
      await queryClient.cancelQueries({ queryKey: patientsQueryKey })
      const prev = queryClient.getQueryData(patientsQueryKey)
      patchPatientsCache(pg => ({ ...pg, rows: [optimistic, ...pg.rows], total: pg.total + 1 }))
      return { prev }
    },
    onSuccess: (saved, { optimistic }) => {
      patchPatientsCache(pg => ({ ...pg, rows: pg.rows.map(x => (x.id === optimistic.id ? saved : x)) }))
    },
    onError: (err, _vars, ctx) => {
      console.error('Add patient error:', err)
      if (ctx?.prev) queryClient.setQueryData(patientsQueryKey, ctx.prev)
      addToast(isRTL ? 'خطأ في إضافة المريض' : 'Error adding patient', 'error')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['patients', dentalOrgId] }),
  })

  const updatePatientMutation = useMutation({
    mutationFn: ({ id, data }) => db.patchPatient(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: patientsQueryKey })
      const prev = queryClient.getQueryData(patientsQueryKey)
      patchPatientsCache(pg => ({ ...pg, rows: pg.rows.map(p => (p.id === id
        ? { ...p, ...data, fullName: data.full_name ?? data.fullName ?? p.fullName, full_name: data.full_name ?? data.fullName ?? p.fullName }
        : p)) }))
      return { prev }
    },
    onSuccess: (saved, { id }) => {
      patchPatientsCache(pg => ({ ...pg, rows: pg.rows.map(p => (p.id === id ? saved : p)) }))
    },
    onError: (err, _vars, ctx) => {
      console.error('Update patient error:', err)
      if (ctx?.prev) queryClient.setQueryData(patientsQueryKey, ctx.prev)
      addToast(isRTL ? 'خطأ في التحديث' : 'Error updating patient', 'error')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['patients', dentalOrgId] }),
  })

  const deletePatientMutation = useMutation({
    mutationFn: ({ id }) => db.removePatient(id),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: patientsQueryKey })
      const prev = queryClient.getQueryData(patientsQueryKey)
      patchPatientsCache(pg => ({ ...pg, rows: pg.rows.filter(p => p.id !== id), total: Math.max(0, pg.total - 1) }))
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      console.error('Delete patient error:', err)
      if (ctx?.prev) queryClient.setQueryData(patientsQueryKey, ctx.prev)
      addToast(isRTL ? 'خطأ في الحذف' : 'Error deleting patient', 'error')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['patients', dentalOrgId] }),
  })

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
    queryClient.clear()
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
      loadAllData()
      navigate('/agency')
    }
  }, [page])

  // Operator-no-impersonation landing on a clinic-only page (most commonly
  // /dashboard, the default after sign-in) gets bounced to /agency where the
  // OperatorConsole lives. Operator-only routes (`agency`, `billing`,
  // `agency-profile`, `operator/*`, `settings`) are untouched. The internal
  // `design-system` showcase is allowlisted only in DEV builds; in prod a
  // manual URL entry bounces to /agency. Without this, the operator would
  // see a "No org membership" error banner above an empty clinic dashboard.
  useEffect(() => {
    if (operatorLoading) return
    if (!isOperator || impersonation) return
    const operatorPages = new Set([
      'agency', 'billing', 'agency-profile', 'operator',
      'settings', 'finance',
      ...(import.meta.env.DEV ? ['design-system'] : []),
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
    loadAllData()
    navigate('/agency')
  }

  // Onboarding flow is gone — clinics are provisioned by the operator.

  const toggleLang = () => setLang(l => l === 'en' ? 'ar' : 'en')

  // ── Patient CRUD — optimistic via the TanStack Query mutations above (cache
  // patched in onMutate for instant feedback; rollback on error; invalidate on
  // settle). Demo mode is read-only (option a). ────────────────────────────────
  const addPatient = async (raw) => {
    if (!requirePerm('contacts', 'w')) return
    const fullName = (raw.full_name || raw.fullName || '').trim()
    const phone = (raw.phone || '').trim()
    if (!fullName) { addToast(isRTL ? 'الاسم مطلوب' : 'Full name is required', 'error'); return }
    if (!phone) { addToast(isRTL ? 'رقم الهاتف مطلوب' : 'Phone is required', 'error'); return }
    if (demoMode) { addToast(isRTL ? 'الوضع التجريبي للقراءة فقط' : 'Demo mode is read-only', 'error'); return }
    if (!dentalOrgId) {
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
      primaryDoctorId: raw.primary_doctor_id ?? raw.primaryDoctorId ?? null,
      createdAt: new Date().toISOString(),
    }
    addToast(isRTL ? 'تمت إضافة المريض' : 'Patient added', 'success')
    pushNotification('contact', isRTL ? 'مريض جديد' : 'New patient added', fullName)
    addPatientMutation.mutate({ raw, optimistic })
  }
  const updatePatient = async (id, data) => {
    if (!requirePerm('contacts', 'w')) return
    if (demoMode) { addToast(isRTL ? 'الوضع التجريبي للقراءة فقط' : 'Demo mode is read-only', 'error'); return }
    addToast(isRTL ? 'تم تحديث المريض' : 'Patient updated', 'success')
    updatePatientMutation.mutate({ id, data })
  }
  const deletePatient = async (id) => {
    if (!requirePerm('contacts', 'd')) return
    if (demoMode) { addToast(isRTL ? 'الوضع التجريبي للقراءة فقط' : 'Demo mode is read-only', 'error'); return }
    addToast(isRTL ? 'تم حذف المريض' : 'Patient deleted', 'success')
    deletePatientMutation.mutate({ id })
  }

  // Returns true only when the save is genuinely persisted (or accepted in demo
  // mode); false on failure. Callers gate their "Saved!" state on this so the UI
  // never claims success for a write that did not happen (SB-8 honesty fix).
  const saveOrgSettings = async (updates) => {
    if (!isSupabaseConfigured() || !orgSettings.id) {
      setOrgSettings(prev => ({ ...prev, ...updates }))
      return true
    }
    try {
      const { updateOrgSettings } = await import('./lib/orgs')
      const saved = await updateOrgSettings(orgSettings.id, updates)
      // Reflect what the DB actually persisted (sanitized row), not the
      // optimistic payload — dropped fields never linger in local state.
      setOrgSettings(prev => ({ ...prev, ...(saved || updates) }))
      return true
    } catch (err) {
      console.error('Save org settings error:', err)
      addToast(isRTL ? 'فشل حفظ إعدادات المؤسسة' : 'Failed to save org settings', 'error')
      return false
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
      { id: 'social', icon: Icons.globe, label: isRTL ? 'صفحات التواصل' : 'Social Pages' },
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
            ...(import.meta.env.DEV
              ? [{ id: 'design-system', icon: Icons.dashboard, label: isRTL ? 'نظام التصميم' : 'Design System' }]
              : []),
          ],
        },
      ]
    : baseVisibleGroups

  return (
    <div dir={dir} onClick={() => showUserMenu && setShowUserMenu(false)} style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'var(--font-sans)', direction:dir }}>
      {/* ── SIDEBAR (desktop) ────────────────────────────────────────── */}
      <aside
        className="desktop-sidebar relative z-raised flex flex-col bg-navy-50 border-e border-navy-100 overflow-hidden transition-[width,min-width] duration-base ease-standard"
        style={{ width: sidebarCollapsed ? 56 : 228, minWidth: sidebarCollapsed ? 56 : 228 }}
      >
        <div className={`flex items-center gap-2 min-w-0 border-b border-navy-100 min-h-[72px] py-3.5 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
          {isAgencyMode ? (
            <>
              <div className={`${sidebarCollapsed ? 'w-9 h-9' : 'w-12 h-12'} rounded-xl bg-accent-cyan-50 ring-1 ring-accent-cyan-100 grid place-items-center shrink-0 transition-[width,height] duration-base ease-standard`}>
                <svg width={sidebarCollapsed ? 18 : 24} height={sidebarCollapsed ? 18 : 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan-600"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/></svg>
              </div>
              {!sidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2 font-display text-[19px] font-extrabold tracking-[-0.03em] text-navy-900 leading-tight">
                    {BRAND.appName}
                    <span className="text-[9px] font-bold leading-[14px] tracking-[0.05em] uppercase rounded px-1.5 py-0.5 bg-accent-cyan-50 text-accent-cyan-700 ring-1 ring-accent-cyan-100">PRO</span>
                  </div>
                  <div className="text-[11px] mt-1 font-sans font-medium tracking-wide text-navy-500">{isRTL ? 'لوحة تحكم الوكالة' : 'Agency Control Panel'}</div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* SC mark (shrink-0) + stacked two-line block: product name on
                  top, clinic (tenant) name under it — both truncate with
                  ellipsis when tight. No "by SupCod3" here (login + footer only). */}
              <Logo variant="navy" withWordmark={false} size={sidebarCollapsed ? 34 : 36} />
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1 overflow-hidden leading-tight">
                  <div className="text-[15px] font-bold tracking-[-0.01em] truncate"
                       style={{ color: 'var(--brand-navy)', fontFamily: 'var(--font-sans)' }}>{BRAND.appName}</div>
                  {orgSettings.name && (
                    <div className="text-[11px] font-medium truncate"
                         style={{ color: 'var(--text-secondary)' }}>{orgSettings.name}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2 min-h-0">
          {visibleNavGroups.map((group, gi) => (
            <div key={gi} className="mb-1">
              {!sidebarCollapsed && (
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] pt-3.5 pb-1.5 px-3 font-sans text-navy-500">{group.label}</div>
              )}
              {group.items.map(item => {
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPage(item.id)}
                    data-active={active}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'w-full flex items-center gap-2 h-9',
                      'rounded-lg border-0 cursor-pointer text-[13px] font-sans text-start',
                      'transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:shadow-focus-cyan',
                      sidebarCollapsed ? 'justify-center px-0' : 'justify-start px-2.5',
                      active
                        ? 'bg-white text-navy-900 font-semibold ring-1 ring-navy-100 shadow-glass-sm'
                        : 'bg-transparent text-navy-600 font-medium hover:bg-white/70 hover:text-navy-800',
                    ].join(' ')}
                  >
                    <span aria-hidden="true" className={`flex items-center shrink-0 ${active ? 'text-accent-cyan-600' : 'text-navy-400'}`}>{item.icon(16)}</span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="bg-accent-cyan-600 text-white text-[9.5px] font-bold leading-none px-1.5 rounded-[10px] h-[18px] inline-flex items-center tabular-nums">{item.badge}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        {/* User section (desktop only) — deterministic-by-name gradient avatar with cyan online-dot */}
        {!sidebarCollapsed && user && (() => {
          const fullName = user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || t.adminUser
          return (
            <div className="border-t border-navy-100 py-3 px-3.5 flex items-center gap-2.5">
              <div className="relative shrink-0">
                <div className={`grid place-items-center w-8 h-8 rounded-full text-white text-[12px] font-bold font-sans bg-gradient-to-br shadow-glass-sm ${avatarGradient(fullName)}`}>
                  {avatarInitials(fullName)}
                </div>
                <div
                  className="absolute -bottom-px end-[-1px] w-1.5 h-1.5 rounded-full bg-accent-cyan-600 ring-2 ring-white"
                  style={{ boxShadow: '0 0 6px rgba(6,182,212,0.6)' }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-navy-900 truncate font-sans">{fullName}</div>
                <div className="text-[10px] text-navy-500 truncate">{user?.email || 'demo@velo.app'}</div>
              </div>
            </div>
          )
        })()}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(c => !c)}
          aria-label={sidebarCollapsed ? (isRTL ? 'توسيع الشريط الجانبي' : 'Expand sidebar') : (isRTL ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
          className="h-10 border-0 bg-transparent cursor-pointer border-t border-navy-100 flex items-center justify-center transition-colors duration-fast text-navy-400 hover:text-accent-cyan-600 focus-visible:outline-none focus-visible:shadow-focus-cyan"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
            {sidebarCollapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
          </svg>
        </button>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main className="mobile-main" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'rgb(var(--velo-surface-canvas))' }}>
        <header className="mobile-header" style={{ height:52, minHeight:52, background: '#FFFFFF', borderBottom:'1px solid #DDE7F4', display:'flex', alignItems:'center', padding: isMobile?'0 12px':'0 24px', gap: isMobile?8:16 }}>
          {/* Mobile: SC mark + stacked two-line block (product name over clinic
              name). Clinic truncates with ellipsis but never disappears.
              No "by SupCod3" here (login + footer only). */}
          {isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:'1 1 auto', overflow:'hidden' }}>
              <Logo variant="navy" withWordmark={false} size={30} />
              <div style={{ minWidth:0, overflow:'hidden', lineHeight:1.15 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--brand-navy)', fontFamily:'var(--font-sans)', letterSpacing:'-0.02em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{BRAND.appName}</div>
                {orgSettings.name && (
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{orgSettings.name}</div>
                )}
              </div>
            </div>
          )}
          {/* Search → opens Command Palette */}
          <div onClick={() => setCmdPaletteOpen(true)} style={{ display:'flex', alignItems:'center', gap:8, background:'#F1F5FB', borderRadius:8, padding:'0 12px', height:34, border:'1px solid #DDE7F4', flex:1, maxWidth:320, cursor:'pointer', transition:'border-color 0.18s ease' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#B6CAE5'} onMouseLeave={e=>e.currentTarget.style.borderColor='#DDE7F4'}>
            <span style={{color:'#5680B3',display:'flex'}}>{Icons.search(16)}</span>
            <span style={{ fontSize:13, color:'#5680B3', flex:1 }}>{t.searchPlaceholder}</span>
            <kbd style={{ padding:'2px 6px', borderRadius:4, background:'#FFFFFF', border:'1px solid #DDE7F4', fontSize:10, color:'#5680B3', fontFamily:"'DM Sans',sans-serif" }}>Ctrl+K</kbd>
          </div>
          <div style={{flex:1}}/>
          {!isMobile && (
            <button onClick={toggleLang} style={{ ...makeBtn('secondary'), padding:'6px 12px', fontSize:12, gap:6 }}>
              {Icons.globe()}{lang==='en'?'العربية':'English'}
            </button>
          )}
          {/* Notifications */}
          <button onClick={() => setNotifOpen(v => !v)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #DDE7F4', background:'#F1F5FB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#103562', position:'relative', transition:'all 0.18s ease' }}
            onMouseEnter={e=>e.currentTarget.style.background='#DDE7F4'} onMouseLeave={e=>e.currentTarget.style.background='#F1F5FB'}>
            {Icons.bell(16)}
            {notifications.filter(n => !n.read).length > 0 && <span style={{ position:'absolute', top:3, right:3, minWidth:16, height:16, borderRadius:8, background:'var(--status-danger-fg)', color:'var(--brand-white)', fontSize:10, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px', border:'2px solid #FFFFFF' }}>{notifications.filter(n => !n.read).length}</span>}
          </button>
          {/* User avatar + dropdown */}
          <div style={{ position:'relative' }}>
            <div onClick={() => setShowUserMenu(v => !v)} style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, var(--brand-teal), var(--brand-navy))', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--brand-white)', fontSize:13, fontWeight:600, cursor:'pointer', transition:'transform 0.18s ease', boxShadow:'0 0 12px rgba(20,184,166,0.25)' }}
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
                : <Suspense fallback={<SkeletonDashboard />}><DentalDashboard t={t} lang={lang} isRTL={isRTL} dir={dir} patients={patients} setPage={setPage} toast={addToast} /></Suspense>
              )}
              {page === 'patients' && <PatientsPage t={t} lang={lang} dir={dir} isRTL={isRTL} patients={patients} patientsTotal={patientsTotal} loadMorePatients={loadMorePatients} patientsLoadingMore={patientsLoadingMore} addPatient={addPatient} updatePatient={updatePatient} deletePatient={deletePatient} setPage={setPage} toast={addToast} showConfirm={showConfirm} urlPatientId={pageSubId} navigate={navigate} isOperator={isOperator} impersonation={impersonation} orgId={dentalOrgId} currentUserId={user?.id} currentUserRole={effectiveRole} patientFilterDoctorId={patientFilterDoctorId} setPatientFilterDoctorId={setPatientFilterDoctorId} />}
              {page === 'inbox' && <InboxPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} setPage={setPage} toast={addToast} urlConvId={pageSubId} navigate={navigate} teamMembers={teamMembers} isOperator={isOperator} impersonation={impersonation} orgId={dentalOrgId} demoMode={demoMode} sampleData={sampleData} />}
              {page === 'calendar' && <Suspense fallback={<SkeletonGeneric />}><AppointmentsPage t={t} lang={lang} dir={dir} isRTL={isRTL} patients={patients} toast={addToast} setPage={setPage} /></Suspense>}
              {page === 'automations' && <Suspense fallback={<SkeletonGeneric />}><AutomationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'forms' && <Suspense fallback={<SkeletonGeneric />}><FormsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} urlFormId={pageSubId} navigate={navigate} /></Suspense>}
              {page === 'social' && <Suspense fallback={<SkeletonGeneric />}><SocialMonitor lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'finance' && <Suspense fallback={<SkeletonGeneric />}><FinancePage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} currency={orgSettings.currency || 'USD'} toast={addToast} showConfirm={showConfirm} isOperator={isOperator && !impersonation} /></Suspense>}
              {page === 'inventory' && <Suspense fallback={<SkeletonGeneric />}><InventoryPage lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'integrations' && <Suspense fallback={<SkeletonGeneric />}><IntegrationsPage t={t} lang={lang} dir={dir} isRTL={isRTL} toast={addToast} /></Suspense>}
              {page === 'reports' && <Suspense fallback={<SkeletonGeneric />}><ReportsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} onOpenBuilder={() => setPage('report-builder')} orgId={dentalOrgId} role={effectiveRole} /></Suspense>}
              {page === 'report-builder' && <Suspense fallback={<SkeletonGeneric />}><ReportBuilder t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} onBack={() => setPage('reports')} /></Suspense>}
              {page === 'tasks' && <Suspense fallback={<SkeletonGeneric />}><TasksPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} user={user} toast={addToast} showConfirm={showConfirm} /></Suspense>}
              {page === 'goals' && <Suspense fallback={<SkeletonGeneric />}><GoalsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} toast={addToast} /></Suspense>}
              {page === 'docs' && <Suspense fallback={<SkeletonGeneric />}><DocsPage t={t} lang={lang} dir={dir} isRTL={isRTL} contacts={patients} toast={addToast} /></Suspense>}
              {page === 'agency' && isOperator && !impersonation && <Suspense fallback={<SkeletonGeneric />}><OperatorConsole user={user} onEnterOrg={startImpersonation} onSignOut={handleSignOut} toast={addToast} /></Suspense>}
              {page === 'billing' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'الفواتير' : 'Billing'} description={isRTL ? 'إدارة الفواتير والمدفوعات قريباً' : 'Billing management coming soon.'} icon={Icons.file} />}
              {page === 'agency-profile' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'ملف الوكالة' : 'Agency Profile'} description={isRTL ? 'إعدادات ملف الوكالة قريباً' : 'Agency profile settings coming soon.'} icon={Icons.user} />}
              {page === 'settings' && isAgencyMode && <AgencyPlaceholder title={isRTL ? 'الإعدادات' : 'Settings'} description={isRTL ? 'إعدادات الوكالة قريباً' : 'Agency settings coming soon.'} icon={Icons.settings} />}
              {page === 'settings' && !isAgencyMode && <Suspense fallback={<SkeletonGeneric />}><SettingsPage t={t} lang={lang} dir={dir} isRTL={isRTL} user={user} orgSettings={orgSettings} onSaveOrgSettings={saveOrgSettings} toast={addToast} initialTab={pageSubId} key={pageSubId || 'settings'} navigate={navigate} isOperator={isOperator} orgId={dentalOrgId} /></Suspense>}
              {page === 'operator' && pageSubId === 'credentials' && isOperator && <Suspense fallback={<SkeletonGeneric />}><ClinicCredentialsPage lang={lang} /></Suspense>}
              {page === 'design-system' && isOperator && import.meta.env.DEV && <Suspense fallback={<SkeletonGeneric />}><DesignSystemPage lang={lang} /></Suspense>}
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
                  { id:'social', icon: Icons.globe, label: isRTL?'صفحات التواصل':'Social Pages' },
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

// Entrance stagger applies ONLY to this many leading rows (~one viewport).
// Rows beyond it — and every row appended by "Load more" — never carry
// data-anim, so the choreography can never run per-item across thousands of
// records. See the useGSAP guard below.
const INITIAL_ANIM_COUNT = 12

function PatientsPage({ t, lang, dir, isRTL, patients, patientsTotal = 0, loadMorePatients, patientsLoadingMore = false, addPatient, updatePatient, deletePatient, setPage, toast, showConfirm, urlPatientId, navigate, isOperator, impersonation, orgId, currentUserId, currentUserRole, patientFilterDoctorId, setPatientFilterDoctorId }) {
  void t
  void lang
  void orgId
  const [search, setSearch] = useState('')
  // Motion: page scope + a run-once guard so entrance never re-fires on
  // search, filter, or "Load more" — only on the first populated browse render.
  const listScopeRef = useRef(null)
  const didAnimateRef = useRef(false)

  // ── Server-side patient search (SB-2) ─────────────────────────────────────
  // A debounced term of >= SEARCH_MIN_CHARS switches the list from the browse
  // pages (parent `patients`, capped per page) to a server query that spans ALL
  // of the org's patients. Below the threshold we fall back to browse mode and
  // the parent's paginated list — no client-side filtering of a partial array.
  const SEARCH_MIN_CHARS = 3
  const SEARCH_DEBOUNCE_MS = 300
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchResults, setSearchResults] = useState({ rows: [], total: 0, hasMore: false })
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchLoadingMore, setSearchLoadingMore] = useState(false)
  const searchActive = debouncedSearch.trim().length >= SEARCH_MIN_CHARS

  // Debounce the raw input into `debouncedSearch` (300ms) so we don't hit the
  // DB on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  // Run (or reset) the server search when the debounced term, doctor filter, or
  // impersonated org changes. Below min-chars → clear results (browse mode).
  useEffect(() => {
    const term = debouncedSearch.trim()
    if (term.length < SEARCH_MIN_CHARS) {
      setSearchResults({ rows: [], total: 0, hasMore: false })
      setSearchLoading(false)
      return
    }
    let cancelled = false
    setSearchLoading(true)
    db.searchPatients(term, { primaryDoctorId: patientFilterDoctorId || undefined, orgId: impersonation?.orgId })
      .then(res => { if (!cancelled) setSearchResults(res) })
      .catch(err => {
        if (!cancelled) { console.error('Patient search error:', err); setSearchResults({ rows: [], total: 0, hasMore: false }) }
      })
      .finally(() => { if (!cancelled) setSearchLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, patientFilterDoctorId, impersonation])

  // "Load more" within search results — pages the search set, never the browse
  // list, so the two can't mix.
  const loadMoreSearch = async () => {
    if (searchLoadingMore || !searchResults.hasMore) return
    setSearchLoadingMore(true)
    try {
      const page = await db.searchPatients(debouncedSearch.trim(), {
        offset: searchResults.rows.length,
        primaryDoctorId: patientFilterDoctorId || undefined,
        orgId: impersonation?.orgId,
      })
      setSearchResults(prev => ({ rows: [...prev.rows, ...page.rows], total: page.total, hasMore: page.hasMore }))
    } catch (err) {
      console.error('Load more search error:', err)
      toast?.(isRTL ? 'فشل تحميل المزيد' : 'Failed to load more', 'error')
    } finally {
      setSearchLoadingMore(false)
    }
  }

  // ── "My patients" filter (PR #6) ──────────────────────────────────────────
  // Binary toggle: all / mine. Role-defaulted (doctor ON, others OFF), then
  // remembered per-user in localStorage. The actual list fetch + filter live in
  // App.jsx; here we own the UI and lift the doctor id up via the setter.
  const myFilterKey = currentUserId ? `velo:patients:my_filter:${currentUserId}` : null
  const [myFilterOn, setMyFilterOn] = useState(false)
  const [myCount, setMyCount] = useState(null)

  // Resolve the initial toggle state once we know who the user is: stored
  // preference wins, else role default (doctor → ON). Push it up to App.jsx.
  useEffect(() => {
    if (!currentUserId) return
    let initial
    const stored = myFilterKey ? localStorage.getItem(myFilterKey) : null
    if (stored === '1') initial = true
    else if (stored === '0') initial = false
    else initial = currentUserRole === 'doctor'
    setMyFilterOn(initial)
    setPatientFilterDoctorId?.(initial ? currentUserId : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUserRole])

  const toggleMyFilter = () => {
    const next = !myFilterOn
    setMyFilterOn(next)
    if (myFilterKey) localStorage.setItem(myFilterKey, next ? '1' : '0')
    setPatientFilterDoctorId?.(next && currentUserId ? currentUserId : null)
  }

  // Refresh the badge count whenever the filter turns on (or the user changes).
  useEffect(() => {
    let cancelled = false
    if (!myFilterOn || !currentUserId) { setMyCount(null); return }
    db.getMyPatientsCount(currentUserId)
      .then(n => { if (!cancelled) setMyCount(n) })
      .catch(() => { if (!cancelled) setMyCount(null) })
    return () => { cancelled = true }
  }, [myFilterOn, currentUserId])
  const [showForm, setShowForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [_selectedPatientId, _setSelectedPatientId] = useState(urlPatientId || null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  // xray_tech works in the X-rays tab, so default them there; everyone else
  // lands on Overview.
  const defaultProfileTab = currentUserRole === 'xray_tech' ? 'xrays' : 'overview'
  const [profileTab, setProfileTab] = useState(defaultProfileTab)

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

  const fullNameOf = (p) => p.full_name || p.fullName || ''
  // SB-2: in search mode the rows come from the server (searchPatients across the
  // whole org); in browse mode it's the parent's paginated list. No client filter.
  const filtered = searchActive ? searchResults.rows : patients

  // Bounded entrance choreography. Runs ONCE, on the first populated *browse*
  // render. The guard blocks every re-fire: search (searchActive), My-patients
  // filter, and "Load more" (patients.length grows) all leave didAnimateRef set,
  // so the animation never replays and never fights typing or scrolling. Only
  // the first INITIAL_ANIM_COUNT rows carry data-anim="row", so the stagger is
  // capped at ~one viewport regardless of how many thousands of rows are loaded.
  useGSAP(() => {
    if (didAnimateRef.current || searchActive || patients.length === 0 || !listScopeRef.current) return
    didAnimateRef.current = true
    const mm = entrance(listScopeRef.current)
    return () => mm.revert()
  }, { scope: listScopeRef, dependencies: [patients.length, searchActive] })

  if (selectedPatientId) {
    // Look in the browse list AND the search results — a patient opened from a
    // search hit may not be in the loaded browse page.
    const p = patients.find(x => x.id === selectedPatientId)
      || searchResults.rows.find(x => x.id === selectedPatientId)
    if (!p) { setSelectedPatient(null); return null }
    return (
      <PatientProfile
        key={p.id}
        t={t} dir={dir} isRTL={isRTL} lang={lang}
        patient={p}
        profileTab={profileTab} setProfileTab={setProfileTab}
        currentUserRole={currentUserRole}
        onBack={() => { setSelectedPatient(null); setProfileTab(defaultProfileTab) }}
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

  const countLabel = searchActive
    ? (searchLoading
        ? (isRTL ? 'جارٍ البحث…' : 'Searching…')
        : (isRTL
            ? `${searchResults.total} نتيجة`
            : `${searchResults.total} ${searchResults.total === 1 ? 'result' : 'results'}`))
    : (patientsTotal > patients.length
        ? (isRTL
            ? `عرض ${patients.length} من أصل ${patientsTotal}`
            : `Showing ${patients.length} of ${patientsTotal} patients`)
        : `${filtered.length} ${isRTL ? 'مريض' : (filtered.length === 1 ? 'patient' : 'patients')}`)

  return (
    <div
      ref={listScopeRef}
      dir={dir}
      className="ds-root min-h-full -m-4 md:-m-8 p-4 md:p-8 box-border"
      style={{ background: 'var(--ds-canvas-gradient)' }}
    >
      <div className="relative max-w-[1280px] mx-auto flex flex-col gap-6">
        <div className="ds-ambient" />

        {/* ── Header ───────────────────────────────────────────────── */}
        <header data-anim="title" className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-navy-900 leading-tight tracking-tight m-0">
              {isRTL ? 'المرضى' : 'Patients'}
            </h1>
            <p className="text-sm text-navy-500 mt-1.5 m-0">{countLabel}</p>
          </div>
          <Button
            data-action="new-patient"
            variant="primary"
            iconStart={Icons.plus}
            onClick={() => { setEditingPatient(null); setShowForm(true) }}
          >
            {isRTL ? 'إضافة مريض' : 'Add Patient'}
          </Button>
        </header>

        {/* ── Search + My-patients filter ──────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              maxLength={LIMITS.search}
              iconStart={Icons.search}
              placeholder={isRTL ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
              aria-label={isRTL ? 'بحث' : 'Search'}
            />
          </div>
          {!impersonation && (
            <button
              type="button"
              onClick={toggleMyFilter}
              aria-pressed={myFilterOn}
              className={[
                'inline-flex items-center gap-2 px-3.5 h-10 rounded-glass text-sm font-semibold border transition-colors shrink-0',
                myFilterOn
                  ? 'bg-accent-cyan-600 text-white border-accent-cyan-600 hover:bg-accent-cyan-700'
                  : 'bg-white/70 text-navy-600 border-navy-200 hover:bg-navy-50',
              ].join(' ')}
            >
              {Icons.user ? Icons.user(15) : null}
              <span>{isRTL ? 'مرضاي' : 'My patients'}</span>
              {myFilterOn && myCount != null && (
                <span className="tabular-nums rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] leading-none">
                  {myCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* ── Patient list ─────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          searchActive && searchLoading ? (
            <GlassCard padding="lg">
              <p className="text-sm text-navy-500 text-center py-6 m-0">
                {isRTL ? 'جارٍ البحث…' : 'Searching…'}
              </p>
            </GlassCard>
          ) : (
          <GlassCard padding="lg">
            <UIEmptyState
              title={!searchActive && patients.length === 0
                ? (isRTL ? 'لا يوجد مرضى بعد' : 'No patients yet')
                : (isRTL ? 'لا توجد نتائج' : 'No matching patients')}
              description={!searchActive && patients.length === 0
                ? (isRTL ? 'أضف أول مريض لبدء إدارة العيادة' : 'Add your first patient to start managing the clinic')
                : (isRTL ? 'جرب تعديل مصطلح البحث' : 'Try adjusting your search')}
              action={!searchActive && patients.length === 0
                ? (
                  <Button
                    variant="primary"
                    iconStart={Icons.plus}
                    onClick={() => { setEditingPatient(null); setShowForm(true) }}
                  >
                    {isRTL ? 'إضافة مريض' : 'Add Patient'}
                  </Button>
                )
                : null}
            />
          </GlassCard>
          )
        ) : (
          <GlassCard padding="none" className="overflow-hidden">
            <ul className="flex flex-col">
              {filtered.map((p, i) => {
                const name = fullNameOf(p)
                const isLast = i === filtered.length - 1
                return (
                  <li key={p.id}
                    data-anim={i < INITIAL_ANIM_COUNT ? 'row' : undefined}
                    className={isLast ? '' : 'border-b border-navy-100/60'}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPatient(p.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPatient(p.id) } }}
                      className="group flex items-center gap-4 px-4 md:px-5 py-3 cursor-pointer hover:bg-navy-50/50 transition-colors focus:outline-none focus-visible:bg-navy-50/60"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid place-items-center w-10 h-10 rounded-full text-white text-xs font-bold shadow-glass-sm shrink-0 bg-gradient-to-br ${avatarGradient(name)}`}
                      >
                        {avatarInitials(name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-900 truncate m-0">{name || '—'}</p>
                        {(p.phone || p.email) && (
                          <p className="text-xs text-navy-500 truncate m-0 mt-0.5" dir="ltr">
                            {p.phone || p.email}
                          </p>
                        )}
                      </div>
                      <span className="hidden md:inline text-xs text-navy-400 tabular-nums shrink-0 me-1">
                        {p.dob || ''}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setEditingPatient(p); setShowForm(true) }}
                          aria-label={isRTL ? 'تعديل' : 'Edit'}
                          title={isRTL ? 'تعديل' : 'Edit'}
                          className="grid place-items-center w-11 h-11 md:w-8 md:h-8 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
                        >
                          {Icons.edit(14)}
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                          aria-label={isRTL ? 'حذف' : 'Delete'}
                          title={isRTL ? 'حذف' : 'Delete'}
                          className="grid place-items-center w-11 h-11 md:w-8 md:h-8 rounded-md text-navy-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                        >
                          {Icons.trash(14)}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </GlassCard>
        )}

        {/* ── Load more (pagination) — pages the active set by mode ─── */}
        {searchActive ? (
          searchResults.hasMore && (
            <div className="flex justify-center mt-2">
              <Button
                variant="secondary"
                onClick={loadMoreSearch}
                loading={searchLoadingMore}
                disabled={searchLoadingMore}
              >
                {searchLoadingMore
                  ? (isRTL ? 'جار التحميل...' : 'Loading…')
                  : (isRTL
                      ? `تحميل المزيد (${searchResults.rows.length} من ${searchResults.total})`
                      : `Load more (${searchResults.rows.length} of ${searchResults.total})`)}
              </Button>
            </div>
          )
        ) : (
          patientsTotal > patients.length && (
            <div className="flex justify-center mt-2">
              <Button
                variant="secondary"
                onClick={() => loadMorePatients && loadMorePatients()}
                loading={patientsLoadingMore}
                disabled={patientsLoadingMore}
              >
                {patientsLoadingMore
                  ? (isRTL ? 'جار التحميل...' : 'Loading…')
                  : (isRTL
                      ? `تحميل المزيد (${patients.length} من ${patientsTotal})`
                      : `Load more (${patients.length} of ${patientsTotal})`)}
              </Button>
            </div>
          )
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <PatientFormModal
          t={t} dir={dir} isRTL={isRTL}
          patient={editingPatient}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          toast={toast}
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
          <div className="ds-root">
            <h3 className="text-lg font-semibold text-navy-900 m-0 mb-3">
              {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
            </h3>
            <p className="text-sm text-navy-600 mb-5 m-0">
              {isRTL ? 'سيتم حذف المريض وجميع بياناته. لا يمكن التراجع.' : 'This will permanently delete the patient and all their data. This cannot be undone.'}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="destructive" onClick={() => { deletePatient(confirmDeleteId); setConfirmDeleteId(null) }}>{isRTL ? 'حذف' : 'Delete'}</Button>
            </div>
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

function PatientFormModal({ t, dir, isRTL, patient, currentUserId, currentUserRole, onSave, onClose, toast }) {
  void t
  // Default the primary doctor to the existing value, else the current user if
  // they're a doctor (the common "I'm adding my own patient" case), else blank.
  const initialPrimaryDoctor = patient?.primary_doctor_id ?? patient?.primaryDoctorId
    ?? (currentUserRole === 'doctor' ? (currentUserId || '') : '')
  const [form, setForm] = useState({
    full_name: patient?.full_name || patient?.fullName || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    dob: patient?.dob || '',
    gender: patient?.gender || '',
    allergies: Array.isArray(patient?.allergies) ? patient.allergies.join(', ') : '',
    primary_doctor_id: initialPrimaryDoctor || '',
  })
  const [errors, setErrors] = useState({})
  const set = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }))
    // Clear a field's error as soon as the user edits it.
    setErrors(prev => (prev[k] ? { ...prev, [k]: undefined } : prev))
  }

  // Doctor options for the Primary Doctor selector (role === 'doctor' only).
  const [doctors, setDoctors] = useState([])
  useEffect(() => {
    let cancelled = false
    listDoctorsInOrg()
      .then(rows => { if (!cancelled) setDoctors((rows || []).filter(d => d.role === 'doctor')) })
      .catch(() => { /* leave empty; selector falls back to Unassigned */ })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = () => {
    // Previously this returned silently on a blank Name/Phone, so Save appeared
    // to do nothing (the downstream toast in addPatient was never reached).
    // Surface field-level errors + a toast on every invalid submit.
    const next = {}
    if (!form.full_name.trim()) next.full_name = isRTL ? 'الاسم مطلوب' : 'Full name is required'
    if (!form.phone.trim()) next.phone = isRTL ? 'رقم الهاتف مطلوب' : 'Phone is required'
    if (Object.keys(next).length) {
      setErrors(next)
      toast?.(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill in the required fields', 'error')
      return
    }
    setErrors({})
    onSave({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      dob: form.dob || null,
      gender: form.gender || null,
      allergies: form.allergies
        ? form.allergies.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      primary_doctor_id: form.primary_doctor_id || null,
    })
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div className="ds-root">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-navy-900 m-0">
            {patient ? (isRTL ? 'تعديل المريض' : 'Edit Patient') : (isRTL ? 'إضافة مريض' : 'Add Patient')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRTL ? 'إغلاق' : 'Close'}
            className="grid place-items-center w-11 h-11 md:w-8 md:h-8 rounded-md text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors"
          >
            {Icons.x(18)}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <FormField label={<>{isRTL ? 'الاسم الكامل' : 'Full Name'} <span className="text-rose-600">*</span></>} dir={dir}>
            <input value={form.full_name} onChange={e=>set('full_name', e.target.value)} maxLength={LIMITS.name} aria-invalid={!!errors.full_name} style={{ ...inputStyle(dir), ...(errors.full_name ? { borderColor: '#e11d48' } : {}) }} />
            {errors.full_name && <p className="text-xs text-rose-600 mt-1 mb-0">{errors.full_name}</p>}
          </FormField>
          <FormField label={<>{isRTL ? 'رقم الهاتف' : 'Phone'} <span className="text-rose-600">*</span></>} dir={dir}>
            <input value={form.phone} onChange={e=>set('phone', e.target.value)} maxLength={LIMITS.phone} aria-invalid={!!errors.phone} style={{ ...inputStyle(dir), ...(errors.phone ? { borderColor: '#e11d48' } : {}) }} />
            {errors.phone && <p className="text-xs text-rose-600 mt-1 mb-0">{errors.phone}</p>}
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
          <FormField label={isRTL ? 'الطبيب المسؤول' : 'Primary Doctor'} dir={dir}>
            <select value={form.primary_doctor_id} onChange={e=>set('primary_doctor_id', e.target.value)} style={selectStyle(dir)}>
              <option value="">{isRTL ? '— غير محدد —' : '— Unassigned —'}</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </FormField>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="primary" onClick={handleSubmit}>{isRTL ? 'حفظ' : 'Save'}</Button>
        </div>
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

// Renders a field value, or a muted-italic "Not specified" placeholder when the
// value is empty (null/''). Returns JSX so the empty state reads distinctly from
// real data instead of a bare em-dash. EN/AR aware.
function fieldValue(value, isRTL) {
  if (value == null || value === '') {
    return <span className="italic text-navy-400">{isRTL ? 'غير محدد' : 'Not specified'}</span>
  }
  return value
}

// xray_tech sees only demographics + appointments (read-only) + X-rays (their
// work area). All clinical/financial tabs are hidden from them in the UI; RLS is
// the real boundary. Other roles see every tab (read/edit gated per-component).
const XRAY_TECH_TABS = new Set(['overview', 'appointments', 'xrays'])

function PatientProfile({ t, dir, isRTL, lang, patient, profileTab, setProfileTab, currentUserRole, onBack, onEdit, onDelete, toast }) {
  void t
  void lang
  const isXrayTech = currentUserRole === 'xray_tech'
  // Billing state (V1.5 Slice 4) — the Billing tab shows Balance → Charges →
  // Payments. Payments load as in Slice 3; charges + balance load INDEPENDENTLY
  // so a billing-schema gap (e.g. before the prod migration) can never break the
  // payments view — they just stay empty.
  // Billing data via TanStack Query, TAB-GUARDED: the 3 billing reads (payments,
  // charges, balance) fire ONLY when the Billing tab is open — previously they hit
  // the DB on EVERY profile open even if Billing was never clicked. Keyed by
  // patient.id (a patient uuid is unique to its org, so the key is inherently
  // org-scoped). Charges/balance stay independent so a billing-schema gap can't
  // break the payments view (each query fails on its own).
  const billingEnabled = profileTab === 'payments'
  const paymentsQuery = useQuery({ queryKey: ['patientPayments', patient.id], queryFn: () => db.fetchPaymentsByPatient(patient.id), enabled: billingEnabled })
  const chargesQuery = useQuery({ queryKey: ['patientCharges', patient.id], queryFn: () => fetchChargesByPatient(patient.id), enabled: billingEnabled })
  const balanceQuery = useQuery({ queryKey: ['patientBalance', patient.id], queryFn: () => getPatientBalance(patient.id), enabled: billingEnabled })
  const payments = paymentsQuery.data ?? []
  const paymentsLoading = paymentsQuery.isLoading
  const charges = chargesQuery.data ?? []
  const balance = balanceQuery.data ?? {}

  // Refresh the patient's billing after a money mutation (record/reverse payment,
  // add/void charge), AND the org-wide Finance page caches (totals / ledgers /
  // collections) so a payment on this tab can't leave Finance showing a stale
  // amount owed. patient.orgId is the effective (possibly impersonated) org — the
  // same partition FinancePage keys its queries under, so invalidation lines up.
  const invalidateBilling = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['patientPayments', patient.id] })
    queryClient.invalidateQueries({ queryKey: ['patientCharges', patient.id] })
    queryClient.invalidateQueries({ queryKey: ['patientBalance', patient.id] })
    invalidateFinance(patient.orgId)
  }, [patient.id, patient.orgId])

  const addPayment = async (raw) => {
    try {
      await db.insertPayment({ ...raw, patient_id: patient.id })
      invalidateBilling() // a collection lowers the owed balance
    } catch (err) {
      console.error('Add payment error:', err)
      toast?.(isRTL ? 'فشل إضافة الدفعة' : 'Failed to add payment', 'error')
    }
  }
  // Corrections are append-a-reversal (operator-only, enforced in billing.js +
  // RLS). Nothing is deleted: the original payment stays and a reversal row is
  // appended, so we REFETCH rather than optimistically filtering the list.
  const handleReversePayment = async (id) => {
    try {
      await reversePayment(id)
      invalidateBilling()
      toast?.(isRTL ? 'تم تسجيل قيد التصحيح — تبقى الدفعة الأصلية في السجل' : 'Reversal recorded — the original payment stays in history', 'success')
    } catch (err) {
      console.error('Reverse payment error:', err)
      toast?.(isRTL ? 'فشل عكس الدفعة' : 'Failed to reverse payment', 'error')
    }
  }
  // Charges (V1.5 Slice 4). createCharge is doctor/owner (RLS); voidCharge is
  // operator-only. Both refetch charges + balance so the headline stays accurate.
  const addCharge = async (c) => {
    try {
      await createCharge({ ...c, patientId: patient.id })
      invalidateBilling()
      toast?.(isRTL ? 'تمت إضافة الرسوم' : 'Charge added', 'success')
    } catch (err) {
      console.error('Add charge error:', err)
      toast?.(isRTL ? 'فشل إضافة الرسوم' : 'Failed to add charge', 'error')
    }
  }
  const handleVoidCharge = async (id) => {
    try {
      await voidCharge(id)
      invalidateBilling()
      toast?.(isRTL ? 'تم تسجيل قيد إبطال — تبقى الرسوم الأصلية في السجل' : 'Void recorded — the original charge stays in history', 'success')
    } catch (err) {
      console.error('Void charge error:', err)
      toast?.(isRTL ? 'فشل إبطال الرسوم' : 'Failed to void charge', 'error')
    }
  }

  // Appointments tab — fetched on demand via the appointments helper.
  const [appointments, setAppointments] = useState([])
  const [apptsLoading, setApptsLoading] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [apptRefresh, setApptRefresh] = useState(0) // bump to refetch after booking
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
  }, [patient.id, profileTab, apptRefresh])

  const fullName = patient.full_name || patient.fullName || ''
  const allergies = Array.isArray(patient.allergies) ? patient.allergies : []

  const tabs = [
    { id: 'overview',     label: isRTL ? 'نظرة عامة'    : 'Overview' },
    { id: 'appointments', label: isRTL ? 'المواعيد'      : 'Appointments' },
    { id: 'payments',     label: isRTL ? 'الفوترة'       : 'Billing' },
    { id: 'medical',      label: isRTL ? 'التاريخ الطبي' : 'Medical History' },
    { id: 'dental_chart', label: isRTL ? 'مخطط الأسنان' : 'Dental Chart' },
    { id: 'xrays',        label: isRTL ? 'الأشعة'        : 'X-rays' },
    { id: 'treatments',   label: isRTL ? 'خطة العلاج'    : 'Treatment Plan' },
    { id: 'prescriptions', label: isRTL ? 'الوصفات'       : 'Prescriptions' },
    { id: 'notes',        label: isRTL ? 'الملاحظات'     : 'Notes' },
    { id: 'documents',    label: isRTL ? 'الوثائق'       : 'Documents' },
  ]
  const visibleTabs = isXrayTech ? tabs.filter(tab => XRAY_TECH_TABS.has(tab.id)) : tabs

  // Keep xray_tech off any clinical/financial tab they can't see (e.g. a tab id
  // persisted from a prior role/session) — redirect to their X-rays work area.
  useEffect(() => {
    if (isXrayTech && !XRAY_TECH_TABS.has(profileTab)) setProfileTab('xrays')
  }, [isXrayTech, profileTab, setProfileTab])

  // Heavy tabs (Payments, Medical, Dental Chart, Treatments) keep their existing
  // implementations for now — Phase 2.2 only redesigns Overview + Appointments
  // and the chrome (header / tab bar). The dental chart visual is tackled in
  // Phase 3 (anatomical SVGs).
  const heavyTab = profileTab === 'payments' || profileTab === 'medical' || profileTab === 'dental_chart' || profileTab === 'xrays' || profileTab === 'treatments' || profileTab === 'prescriptions' || profileTab === 'notes' || profileTab === 'documents'

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
          className="self-start inline-flex items-center gap-1.5 -ms-2.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-navy-600 hover:text-navy-800 hover:bg-navy-50 transition-colors"
        >
          {isRTL ? Icons.arrowRight(16) : Icons.arrowLeft(16)}
          {isRTL ? 'العودة إلى المرضى' : 'Back to Patients'}
        </button>

        {/* ── Profile header ─────────────────────────────────────────── */}
        <GlassCard padding="lg" tone="strong" className="relative overflow-hidden">
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
              <h2 className="text-3xl font-medium text-navy-900 leading-tight tracking-tight m-0">
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
            {visibleTabs.map(tab => {
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
                      className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
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
                  [isRTL ? 'الاسم'    : 'Full Name',     fullName || null],
                  [isRTL ? 'الهاتف'   : 'Phone',         patient.phone || null],
                  [isRTL ? 'البريد'   : 'Email',         patient.email || null],
                  [isRTL ? 'الميلاد'  : 'Date of Birth', patient.dob   || null],
                  [isRTL ? 'الجنس'    : 'Gender',        patient.gender ? (GENDER_OPTIONS.find(g => g.id === patient.gender)?.[isRTL ? 'ar' : 'en'] || patient.gender) : null],
                  [isRTL ? 'الحساسيات' : 'Allergies',    allergies.length ? allergies.join(', ') : null],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-navy-600 mb-1">{label}</dt>
                    <dd className="text-sm text-navy-800 m-0">{fieldValue(value, isRTL)}</dd>
                  </div>
                ))}
              </dl>
            </GlassCard>
          )}

          {profileTab === 'appointments' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-navy-900 m-0">
                  {isRTL ? 'المواعيد' : 'Appointments'}
                </h3>
                {/* xray_tech sees appointments read-only (no booking). */}
                {!isXrayTech && (
                  <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={() => setShowBook(true)}>
                    {isRTL ? 'حجز موعد' : 'Book Appointment'}
                  </Button>
                )}
              </div>
              {apptsLoading ? <DentalSpinner isRTL={isRTL} /> :
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
              )}
            </div>
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
                  : (
                    <div className="flex flex-col gap-4">
                      <BalanceSummary balance={balance} isRTL={isRTL} />
                      <ChargesSection patient={patient} charges={charges} addCharge={addCharge} onVoid={handleVoidCharge} dir={dir} isRTL={isRTL} />
                      <PaymentsTab payments={payments} addPayment={addPayment} onReverse={handleReversePayment} dir={dir} isRTL={isRTL} currentUserRole={currentUserRole} />
                    </div>
                  )
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
              {profileTab === 'prescriptions' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalPrescriptions patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
              {profileTab === 'notes' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalNotes patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
              {profileTab === 'documents' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalDocuments patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
              {profileTab === 'xrays' && (
                <Suspense fallback={<DentalSpinner isRTL={isRTL} />}>
                  <DentalXrays patient={patient} lang={lang} dir={dir} toast={toast} />
                </Suspense>
              )}
            </div>
          )}
        </div>

        {showBook && (
          <AddAppointmentModal
            patients={[patient]}
            initialPatientId={patient.id}
            initialDate={todayLocal()}
            onClose={() => setShowBook(false)}
            onSave={() => {
              setShowBook(false)
              setApptRefresh(n => n + 1)
              toast?.(isRTL ? 'تمت إضافة الموعد' : 'Appointment booked', 'success')
            }}
          />
        )}
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

function PaymentsTab({ payments, addPayment, onReverse, dir, isRTL, currentUserRole }) {
  const [showForm, setShowForm] = useState(false)
  const [confirmReversePayment, setConfirmReversePayment] = useState(null)
  const [form, setForm] = useState({ amount: '', currency: 'IQD', method: 'cash', notes: '' })
  // Write gate governs RECORDING payments (owner + receptionist + doctor per the
  // matrix). assistant sees the tab read-only; xray_tech never reaches it (tab hidden).
  const canWrite = can(currentUserRole, 'payments', 'w')
  // Corrections are operator-only (SupCod3 model), independent of canWrite —
  // enforced in billing.js + RLS; this just hides the affordance for non-operators.
  const { isOperator } = useIsOperator()

  // Active-row set mirrors billing.js activeRows: a 'payment' row whose id is NOT
  // referenced by any reverses_id. reversal rows never count as positive, and a
  // reversed original drops out. Totals are computed over active rows only, so a
  // reversed payment contributes 0 (original + reversal net out) — per currency,
  // never blended (CLAUDE.md).
  const reversedIds = new Set(payments.map(p => p.reversesId ?? p.reverses_id).filter(Boolean))
  const isActivePayment = (p) => (p.kind || 'payment') === 'payment' && !reversedIds.has(p.id)
  const totals = payments.reduce((acc, p) => {
    if (!isActivePayment(p)) return acc
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
          {canWrite && (
            <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={() => setShowForm(true)}>
              {isRTL ? 'إضافة دفعة' : 'Record Payment'}
            </Button>
          )}
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
              const kind = p.kind || 'payment'
              const isReversal = kind === 'reversal'
              const isReversed = reversedIds.has(p.id) // an original that has been reversed
              // Operators reverse a live payment only — not a reversal row, and not
              // one already reversed (a second reversal would double-credit; billing.js
              // guards kind but not double-reversal, so we gate it here).
              const canReverse = isOperator && !isReversal && !isReversed
              const amountClass = isReversal ? 'text-rose-700' : isReversed ? 'text-navy-400 line-through' : 'text-navy-900'
              return (
                <li key={p.id} className={`flex items-center gap-3 py-3 border-b border-navy-100/60 last:border-b-0${isReversal ? ' opacity-80' : ''}`}>
                  <span aria-hidden="true" className={`grid place-items-center w-9 h-9 rounded-md text-base shrink-0 ${isReversal ? 'bg-rose-50 text-rose-700' : 'bg-navy-50'}`}>
                    {isReversal ? Icons.undo(16) : meth.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-base font-semibold tabular-nums ${amountClass}`}>
                      {isReversal ? '−' : ''}{formatMoney(amountMinor, p.currency || 'IQD')}
                    </div>
                    <div className="text-xs text-navy-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      {isReversal && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {isRTL ? 'قيد تصحيح' : 'Reversal'}
                        </span>
                      )}
                      {isReversed && (
                        <span className="inline-flex items-center rounded-full bg-navy-100 text-navy-500 border border-navy-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {isRTL ? 'معكوسة' : 'Reversed'}
                        </span>
                      )}
                      <span>
                        {isRTL ? meth.ar : meth.en}
                        {dateStr && <> &middot; {dateStr}</>}
                        {p.notes && <> &middot; {p.notes}</>}
                      </span>
                    </div>
                  </div>
                  {canReverse && (
                    <button
                      type="button"
                      onClick={() => setConfirmReversePayment(p.id)}
                      aria-label={isRTL ? 'عكس الدفعة' : 'Reverse payment'}
                      title={isRTL ? 'عكس الدفعة' : 'Reverse payment'}
                      className="grid place-items-center w-11 h-11 md:w-8 md:h-8 rounded-md text-navy-500 hover:text-amber-700 hover:bg-amber-50 transition-colors shrink-0"
                    >
                      {Icons.undo(14)}
                    </button>
                  )}
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

      {confirmReversePayment && (
        <Modal onClose={() => setConfirmReversePayment(null)} dir={dir} width={420}>
          <div className="ds-root text-center px-2">
            <h3 className="text-lg font-semibold text-navy-900 m-0 mb-2">
              {isRTL ? 'عكس هذه الدفعة؟' : 'Reverse this payment?'}
            </h3>
            <p className="text-sm text-navy-600 m-0 mb-4">
              {isRTL
                ? 'سيتم تسجيل قيد تصحيح — تبقى الدفعة الأصلية في السجل.'
                : 'A correcting entry will be recorded — the original payment stays in history.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={() => setConfirmReversePayment(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="primary" onClick={() => { onReverse(confirmReversePayment); setConfirmReversePayment(null) }}>{isRTL ? 'عكس الدفعة' : 'Reverse'}</Button>
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

// Theme-aware token aliases for the Inbox. The legacy `C` palette in design.js
// is a fixed dark theme; resolving against the --velo-* CSS variables (index.css)
// makes the Inbox follow the app's light/dark theme instead of bleeding dark.
const VT = {
  canvas:       'rgb(var(--velo-surface-canvas))',
  raised:       'rgb(var(--velo-surface-raised))',
  sunken:       'rgb(var(--velo-surface-sunken))',
  text:         'rgb(var(--velo-text-primary))',
  textSec:      'rgb(var(--velo-text-secondary))',
  textMuted:    'rgb(var(--velo-text-tertiary))',
  border:       'rgb(var(--velo-border-subtle))',
  accent:       'rgb(var(--velo-accent-solid))',
  accentFg:     'rgb(var(--velo-accent-fg))',
  accentSubtle: 'rgb(var(--velo-accent-subtle))',
  onAccent:     'rgb(var(--velo-text-on-accent))',
  danger:       'rgb(var(--velo-status-danger-fg))',
}

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
    <div className="velo-inbox" style={{ display:'flex', height:'calc(100vh - 108px)', margin:-24, marginTop:-24, direction:dir }}>
      {/* ── LEFT PANEL: Conversation List ────────────────────────────── */}
      <div style={{
        width: 360, minWidth: 360, borderRight: isRTL ? 'none' : `1px solid ${VT.border}`,
        borderLeft: isRTL ? `1px solid ${VT.border}` : 'none',
        display: 'flex', flexDirection: 'column', background: VT.raised,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${VT.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: VT.text, margin: 0 }}>
              {t.inbox}
              {totalUnread > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: VT.danger, padding: '2px 7px', borderRadius: 10, marginLeft: 8, marginRight: 8 }}>{totalUnread}</span>}
            </h2>
            <button className="velo-btn-primary" style={makeBtn('primary', { padding: '6px 12px', fontSize: 12, gap: 5 })}>
              {Icons.plus(14)} {t.compose}
            </button>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: VT.sunken, borderRadius: 8, padding: '7px 12px', border: `1px solid ${VT.border}`, marginBottom: 12 }}>
            <span style={{ color: VT.textMuted, display: 'flex' }}>{Icons.search(14)}</span>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder={t.searchConversations}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: VT.text, flex: 1, fontFamily: 'inherit', direction: dir }} />
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
                    background: isActive ? VT.accent : VT.sunken, color: isActive ? VT.onAccent : VT.textSec,
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
                  background: isActive ? VT.accentSubtle : 'transparent',
                  borderBottom: `1px solid ${VT.border}`,
                  borderLeft: isActive && !isRTL ? `3px solid ${VT.accent}` : '3px solid transparent',
                  borderRight: isActive && isRTL ? `3px solid ${VT.accent}` : '3px solid transparent',
                  transition: 'all .1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = VT.sunken }}
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
                    width: 18, height: 18, borderRadius: '50%', background: VT.raised,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${VT.border}`,
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
                    <span style={{ fontSize: 13, fontWeight: conv.unread > 0 ? 700 : 600, color: VT.text }}>{conv.contactName}</span>
                    <span style={{ fontSize: 11, color: conv.unread > 0 ? VT.accentFg : VT.textMuted, fontWeight: conv.unread > 0 ? 600 : 400 }}>{conv.lastTime}</span>
                  </div>
                  <div style={{ fontSize: 11, color: VT.textMuted, marginBottom: 4 }}>{conv.company}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontSize: 12, color: conv.unread > 0 ? VT.text : VT.textMuted,
                      fontWeight: conv.unread > 0 ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {conv.lastMessage}
                    </span>
                    {conv.unread > 0 && (
                      <span style={{
                        background: VT.accent, color: VT.onAccent, fontSize: 10, fontWeight: 700,
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: VT.canvas }}>
        {!activeConv ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, background: VT.accentSubtle, color: VT.accentFg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {Icons.inbox(36)}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: VT.text, margin: 0 }}>{t.inbox}</h3>
            <p style={{ fontSize: 13, color: VT.textSec }}>{t.noConversation}</p>
          </div>
        ) : (
          <>
            {/* ── Chat Header / Top Bar ────────────────────────────── */}
            <div style={{
              padding: '12px 20px', background: VT.raised, borderBottom: `1px solid ${VT.border}`,
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
                <div style={{ fontSize: 14, fontWeight: 700, color: VT.text }}>{activeConv.contactName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: VT.textMuted }}>
                  <ChannelIcon channel={activeConv.channel} size={12} />
                  <span>{CHANNEL_META[activeConv.channel].label}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: VT.textMuted }} />
                  <span style={{ color: activeConv.status === 'online' ? '#25D366' : VT.textMuted, fontWeight: 500 }}>
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
                            fontSize: 11, color: VT.textMuted, background: VT.canvas,
                            padding: '2px 12px', position: 'relative', zIndex: 1,
                            fontWeight: 500,
                          }}>
                            {new Date(msg.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: VT.border, zIndex: 0 }} />
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
                          background: isMe ? VT.accent : VT.raised,
                          color: isMe ? VT.onAccent : VT.text,
                          border: isMe ? 'none' : `1px solid ${VT.border}`,
                          boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                        }}>
                          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text}</div>
                          <div style={{
                            fontSize: 10, marginTop: 4,
                            color: isMe ? 'rgba(0,0,0,.5)' : VT.textMuted,
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
                margin: '0 24px', padding: 14, background: VT.raised, borderRadius: 12,
                border: '1px solid rgb(var(--velo-border-brand) / 0.35)', boxShadow: '0 4px 12px rgba(0,0,0,.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${C.primary}, #A78BFA)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: VT.accentFg }}>{t.aiSuggestion}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setShowAiSuggestion(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: VT.textMuted, display: 'flex' }}>{Icons.x(14)}</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {aiSuggestions.map((s, i) => (
                    <button key={i} onClick={() => applyAiSuggestion(s)}
                      style={{
                        padding: '8px 12px', borderRadius: 8, border: `1px solid ${VT.border}`,
                        background: VT.sunken, color: VT.text, fontSize: 12, textAlign: isRTL ? 'right' : 'left',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', lineHeight: 1.4,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = VT.accentSubtle; e.currentTarget.style.borderColor = VT.accent }}
                      onMouseLeave={e => { e.currentTarget.style.background = VT.sunken; e.currentTarget.style.borderColor = VT.border }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Message Input ────────────────────────────────────── */}
            <div style={{
              padding: '14px 20px', background: VT.raised, borderTop: `1px solid ${VT.border}`,
              display: 'flex', alignItems: 'flex-end', gap: 10,
            }}>
              {/* Attach */}
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleAttach} />
              <button onClick={() => fileInputRef.current?.click()}
                title={t.attachFile}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: `1px solid ${VT.border}`,
                  background: VT.raised, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: VT.textSec, flexShrink: 0,
                }}>
                {Icons.upload(16)}
              </button>

              {/* Emoji placeholder */}
              <button style={{
                width: 36, height: 36, borderRadius: 8, border: `1px solid ${VT.border}`,
                background: VT.raised, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: VT.textSec, flexShrink: 0, fontSize: 18,
              }}>
                😊
              </button>

              {/* Text input */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'flex-end', gap: 0,
                background: VT.sunken, borderRadius: 10, border: `1px solid ${VT.border}`,
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
                    fontSize: 13, color: VT.text, fontFamily: 'inherit', padding: '9px 0',
                    resize: 'none', direction: dir, lineHeight: 1.4, maxHeight: 100,
                  }}
                />
              </div>

              {/* AI Reply */}
              <button onClick={() => setShowAiSuggestion(!showAiSuggestion)}
                title={t.aiReply}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: showAiSuggestion ? `linear-gradient(135deg, ${C.primary}, #A78BFA)` : VT.raised,
                  border: showAiSuggestion ? 'none' : `1px solid ${VT.border}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: showAiSuggestion ? '#fff' : VT.textSec, flexShrink: 0,
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </button>

              {/* Send */}
              <button onClick={sendMessage}
                style={{
                  width: 40, height: 40, borderRadius: 10, border: 'none',
                  background: msgInput.trim() ? VT.accent : VT.border,
                  cursor: msgInput.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: msgInput.trim() ? VT.onAccent : VT.textMuted, flexShrink: 0, transition: 'background .15s',
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
      <button onClick={() => setPage('agency')} style={makeBtn('primary', { gap: 8 })}>
        {Icons.building(16)} {isRTL ? 'لوحة الوكالة' : 'Go to Agency Dashboard'}
      </button>
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
