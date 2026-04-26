// Velo CRM — Role permissions
//
// Five canonical roles. Each feature has an action (read | write | delete).
// This is CLIENT-SIDE UX enforcement only — backend RLS policies are the
// real security boundary. Keep the two in sync when roles change.

export const ROLES = ['admin', 'doctor', 'receptionist', 'assistant', 'viewer']

// Map legacy role values ('editor', 'member', 'manager') to the closest
// new role so rows created before this migration keep working.
const LEGACY_ALIASES = {
  editor: 'receptionist',
  manager: 'receptionist',
  member: 'assistant',
}

export function normalizeRole(role) {
  if (!role) return 'viewer'
  const r = String(role).toLowerCase()
  if (ROLES.includes(r)) return r
  return LEGACY_ALIASES[r] || 'viewer'
}

export const ROLE_LABELS = {
  en: {
    admin: 'Admin',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    assistant: 'Assistant',
    viewer: 'Viewer',
  },
  ar: {
    admin: 'مدير',
    doctor: 'طبيب',
    receptionist: 'موظف استقبال',
    assistant: 'مساعد',
    viewer: 'مشاهد',
  },
}

export const ROLE_DESCRIPTIONS = {
  en: {
    admin: 'Full access',
    doctor: 'Patients & appointments only',
    receptionist: 'Appointments & patients (no finance)',
    assistant: 'Read-only, plus add notes',
    viewer: 'Read-only',
  },
  ar: {
    admin: 'صلاحيات كاملة',
    doctor: 'المرضى والمواعيد فقط',
    receptionist: 'المواعيد والمرضى (بدون المالية)',
    assistant: 'قراءة فقط، مع إضافة الملاحظات',
    viewer: 'قراءة فقط',
  },
}

// Feature matrix. Actions: r = read, w = write (create/update), d = delete,
// n = add-note (contacts only — used by 'assistant').
// Features correspond to top-level pages/nav items.
const MATRIX = {
  admin: {
    dashboard: 'rwd', contacts: 'rwd', pipeline: 'rwd', inbox: 'rwd',
    tickets: 'rwd', calendar: 'rwd', tasks: 'rwd', goals: 'rwd',
    docs: 'rwd', automations: 'rwd', forms: 'rwd', social: 'rwd',
    integrations: 'rwd', reports: 'rwd', finance: 'rwd', settings: 'rwd',
    team: 'rwd',
  },
  doctor: {
    // Patients + appointments only
    dashboard: 'r',  contacts: 'rwd', calendar: 'rwd',
    // Everything else: denied
    pipeline: '',    inbox: '',       tickets: '',
    tasks: '',       goals: '',       docs: '',
    automations: '', forms: '',       social: '',
    integrations: '', reports: '',    finance: '',
    settings: 'r',   team: '',
  },
  receptionist: {
    // Appointments + patients, no finance
    dashboard: 'r', contacts: 'rwd', calendar: 'rwd',
    inbox: 'rw',    tickets: 'rw',   tasks: 'rw',
    // Denied
    pipeline: '',   goals: '',       docs: 'r',
    automations: '', forms: 'rw',    social: 'r',
    integrations: '', reports: 'r',  finance: '',
    settings: 'r',   team: '',
  },
  assistant: {
    // Read-only + add notes on contacts
    dashboard: 'r', contacts: 'rn',  pipeline: 'r',
    inbox: 'r',     tickets: 'r',    calendar: 'r',
    tasks: 'r',     goals: 'r',      docs: 'r',
    automations: 'r', forms: 'r',    social: 'r',
    integrations: 'r', reports: 'r', finance: '',
    settings: 'r',   team: '',
  },
  viewer: {
    // Pure read-only
    dashboard: 'r', contacts: 'r',   pipeline: 'r',
    inbox: 'r',     tickets: 'r',    calendar: 'r',
    tasks: 'r',     goals: 'r',      docs: 'r',
    automations: 'r', forms: 'r',    social: 'r',
    integrations: 'r', reports: 'r', finance: '',
    settings: 'r',   team: '',
  },
}

// can(role, feature, action='r') → boolean.
// action ∈ { 'r', 'w', 'd', 'n' } (read, write, delete, note).
export function can(role, feature, action = 'r') {
  const r = normalizeRole(role)
  const perms = MATRIX[r]?.[feature] || ''
  return perms.includes(action)
}

// Convenience helpers.
export const canRead   = (role, f) => can(role, f, 'r')
export const canWrite  = (role, f) => can(role, f, 'w')
export const canDelete = (role, f) => can(role, f, 'd')
export const canNote   = (role, f) => can(role, f, 'n')

// Whether the role is effectively read-only across the app. Used to show
// banners / disable bulk UI.
export function isReadOnlyRole(role) {
  const r = normalizeRole(role)
  return r === 'viewer' || r === 'assistant'
}
