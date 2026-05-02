// Velo CRM — Role permissions
//
// Four canonical roles, matching the schema's profile_role enum exactly:
//   owner | doctor | receptionist | assistant
//
// This is CLIENT-SIDE UX enforcement only — backend RLS policies are the
// real security boundary. Keep the two in sync when roles change.

export const ROLES = ['owner', 'doctor', 'receptionist', 'assistant']

// Map legacy role values to the closest new role so any pre-migration row
// (or a stray 'admin' string from older client code) keeps working.
const LEGACY_ALIASES = {
  admin: 'owner',
  editor: 'receptionist',
  manager: 'receptionist',
  member: 'assistant',
  viewer: 'assistant',
}

export function normalizeRole(role) {
  if (!role) return 'assistant'
  const r = String(role).toLowerCase()
  if (ROLES.includes(r)) return r
  return LEGACY_ALIASES[r] || 'assistant'
}

export const ROLE_LABELS = {
  en: {
    owner: 'Owner',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    assistant: 'Assistant',
  },
  ar: {
    owner: 'مالك',
    doctor: 'طبيب',
    receptionist: 'موظف استقبال',
    assistant: 'مساعد',
  },
}

export const ROLE_DESCRIPTIONS = {
  en: {
    owner: 'Full clinic access — settings, team, finance, clinical',
    doctor: 'Patients, appointments, dental chart, treatment plans (read-only finance)',
    receptionist: 'Patients, appointments, payments, inbox (no clinical writes)',
    assistant: 'Read-only across the clinic; can add notes on patients',
  },
  ar: {
    owner: 'صلاحيات كاملة — الإعدادات، الفريق، المالية، الإكلينيكي',
    doctor: 'المرضى، المواعيد، مخطط الأسنان، خطط العلاج (المالية للقراءة فقط)',
    receptionist: 'المرضى، المواعيد، المدفوعات، الرسائل (بدون كتابة إكلينيكية)',
    assistant: 'قراءة فقط في العيادة؛ يستطيع إضافة ملاحظات على المرضى',
  },
}

// Feature matrix. Actions: r = read, w = write (create/update), d = delete,
// n = add-note (contacts only — used by 'assistant').
//
// Keys match the page-level features in the new dental schema. Legacy
// `pipeline` and `tickets` are gone from the matrix; consumers that still
// pass those names get '' (no permission) which is the safe default.
const MATRIX = {
  // Owner — full clinic-side CRUD on everything except cross-org / operator.
  owner: {
    dashboard: 'rwd', contacts: 'rwd', patients: 'rwd', inbox: 'rwd', calendar: 'rwd',
    tasks: 'rwd',     goals: 'rwd',    docs: 'rwd',  automations: 'rwd',
    forms: 'rwd',     social: 'rwd',   integrations: 'rwd',
    reports: 'rwd',   finance: 'rwd',  settings: 'rwd', team: 'rwd',
    dental_chart: 'rwd', treatment_plans: 'rwd', payments: 'rwd',
  },
  // Doctor — clinical writes, patient CRUD, appointment CRUD, finance read.
  // No team invites, no automations/forms/integrations.
  doctor: {
    dashboard: 'r',   contacts: 'rwd', patients: 'rwd', inbox: 'r',    calendar: 'rwd',
    tasks: 'rw',      goals: 'r',      docs: 'r',     automations: '',
    forms: '',        social: '',      integrations: '',
    reports: 'r',     finance: 'r',    settings: 'r', team: '',
    dental_chart: 'rwd', treatment_plans: 'rwd', payments: 'r',
  },
  // Receptionist — front-of-house: patients, appointments, payments, inbox.
  // No clinical writes (dental_chart / treatment_plans are read-only).
  receptionist: {
    dashboard: 'r',   contacts: 'rwd', patients: 'rwd', inbox: 'rwd',  calendar: 'rwd',
    tasks: 'rw',      goals: 'r',      docs: 'r',     automations: '',
    forms: 'rw',      social: 'r',     integrations: '',
    reports: 'r',     finance: 'rw',   settings: 'r', team: '',
    dental_chart: 'r', treatment_plans: 'r', payments: 'rwd',
  },
  // Assistant — read-only viewer (hygienists, dental nurses). Can add notes
  // on contacts/patients but no other writes.
  assistant: {
    dashboard: 'r',   contacts: 'rn',  patients: 'rn', inbox: 'r',    calendar: 'r',
    tasks: 'r',       goals: 'r',      docs: 'r',     automations: '',
    forms: 'r',       social: 'r',     integrations: '',
    reports: 'r',     finance: '',     settings: 'r', team: '',
    dental_chart: 'r', treatment_plans: 'r', payments: 'r',
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
  return r === 'assistant'
}
