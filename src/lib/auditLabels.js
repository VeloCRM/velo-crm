/**
 * Velo CRM — audit action labels + payload summaries (Activity Log UI).
 *
 * Pure presentation helpers over the raw `action` strings and `payload` jsonb that
 * logAuditEvent writes. Kept UI-framework-free: `icon`/`tone` are semantic STRINGS the
 * UI maps to its own Icons/Badge — this lib imports no components.
 *
 * Forward-compatible: an unmapped action still renders (prettified verb + generic
 * payload summary), so adding a new logged action never breaks the Log UI.
 */
import { formatMoney } from './money'

// action → { en, ar, icon, tone }. icon/tone are semantic keys (UI resolves them).
// tone convention: 'success' = create/add, 'danger' = delete/void/reverse/cancel,
// 'navy' = update/status-change, 'neutral' = view/print/upload/read.
export const ACTION_LABELS = {
  // ── payments / charges (billing) ──
  'payment.create':  { en: 'Recorded a payment',   ar: 'سجّل دفعة',           icon: 'dollar',   tone: 'success' },
  'payment.update':  { en: 'Updated a payment',    ar: 'حدّث دفعة',           icon: 'dollar',   tone: 'navy'    },
  'payment.delete':  { en: 'Deleted a payment',    ar: 'حذف دفعة',            icon: 'dollar',   tone: 'danger'  },
  'payment.reverse': { en: 'Reversed a payment',   ar: 'عكس دفعة',            icon: 'undo',     tone: 'danger'  },
  'charge.create':   { en: 'Added a charge',       ar: 'أضاف رسوماً',          icon: 'file',     tone: 'success' },
  'charge.void':     { en: 'Voided a charge',      ar: 'أبطل رسوماً',          icon: 'undo',     tone: 'danger'  },

  // ── patients ──
  'patient.create':                 { en: 'Added a patient',          ar: 'أضاف مريضاً',            icon: 'user', tone: 'success' },
  'patient.update':                 { en: 'Updated patient',          ar: 'حدّث بيانات مريض',       icon: 'user', tone: 'navy'    },
  'patient.delete':                 { en: 'Deleted a patient',        ar: 'حذف مريضاً',             icon: 'user', tone: 'danger'  },
  'patient.medical_history_update': { en: 'Updated medical history',  ar: 'حدّث التاريخ الطبي',      icon: 'user', tone: 'navy'    },
  'patient.allergies_update':       { en: 'Updated allergies',        ar: 'حدّث الحساسية',          icon: 'user', tone: 'navy'    },

  // ── appointments ──
  'appointment.create':        { en: 'Booked an appointment',       ar: 'حجز موعداً',           icon: 'calendar', tone: 'success' },
  'appointment.update':        { en: 'Updated an appointment',      ar: 'حدّث موعداً',           icon: 'calendar', tone: 'navy'    },
  'appointment.delete':        { en: 'Cancelled an appointment',    ar: 'ألغى موعداً',           icon: 'calendar', tone: 'danger'  },
  'appointment.status_change': { en: 'Changed appointment status',  ar: 'غيّر حالة موعد',         icon: 'calendar', tone: 'navy'    },

  // ── clinical (dental) ──
  'dental_chart.add':                { en: 'Added a chart finding',     ar: 'أضاف ملاحظة على المخطط',   icon: 'file', tone: 'success' },
  'dental_chart.remove':             { en: 'Removed a chart finding',   ar: 'أزال ملاحظة من المخطط',    icon: 'file', tone: 'danger'  },
  'treatment_plan.create':           { en: 'Created a treatment plan',  ar: 'أنشأ خطة علاج',           icon: 'file', tone: 'success' },
  'treatment_plan.status_change':    { en: 'Updated a treatment plan',  ar: 'حدّث خطة علاج',           icon: 'file', tone: 'navy'    },
  'treatment_plan.remove':           { en: 'Removed a treatment plan',  ar: 'أزال خطة علاج',           icon: 'file', tone: 'danger'  },
  'treatment_plan_item.status_change': { en: 'Updated a plan item',     ar: 'حدّث بند خطة',            icon: 'file', tone: 'navy'    },

  // ── notes ──
  'note.create': { en: 'Added a note',    ar: 'أضاف ملاحظة',   icon: 'edit', tone: 'success' },
  'note.update': { en: 'Edited a note',   ar: 'عدّل ملاحظة',   icon: 'edit', tone: 'navy'    },
  'note.delete': { en: 'Deleted a note',  ar: 'حذف ملاحظة',    icon: 'edit', tone: 'danger'  },

  // ── documents ──
  'document.upload': { en: 'Uploaded a document', ar: 'رفع مستنداً',   icon: 'file', tone: 'neutral' },
  'document.view':   { en: 'Viewed a document',   ar: 'عرض مستنداً',   icon: 'file', tone: 'neutral' },
  'document.delete': { en: 'Deleted a document',  ar: 'حذف مستنداً',   icon: 'file', tone: 'danger'  },

  // ── prescriptions ──
  'prescription.create': { en: 'Created a prescription', ar: 'أنشأ وصفة',   icon: 'file', tone: 'success' },
  'prescription.update': { en: 'Updated a prescription', ar: 'حدّث وصفة',   icon: 'file', tone: 'navy'    },
  'prescription.delete': { en: 'Deleted a prescription', ar: 'حذف وصفة',    icon: 'file', tone: 'danger'  },
  'prescription.print':  { en: 'Printed a prescription', ar: 'طبع وصفة',    icon: 'file', tone: 'neutral' },

  // ── x-rays ──
  'xray.upload': { en: 'Uploaded an X-ray', ar: 'رفع صورة أشعة',   icon: 'file', tone: 'neutral' },
  'xray.update': { en: 'Updated an X-ray',  ar: 'حدّث صورة أشعة',   icon: 'file', tone: 'navy'    },
  'xray.delete': { en: 'Deleted an X-ray',  ar: 'حذف صورة أشعة',    icon: 'file', tone: 'danger'  },
  'xray.view':   { en: 'Viewed an X-ray',   ar: 'عرض صورة أشعة',    icon: 'file', tone: 'neutral' },

  // ── inventory ──
  'inventory_item.create': { en: 'Added an inventory item',   ar: 'أضاف صنفاً للمخزون',   icon: 'package', tone: 'success' },
  'inventory_item.update': { en: 'Updated an inventory item', ar: 'حدّث صنف مخزون',        icon: 'package', tone: 'navy'    },
  'inventory_item.delete': { en: 'Deleted an inventory item', ar: 'حذف صنف مخزون',         icon: 'package', tone: 'danger'  },

  // ── team / profile / org / settings ──
  'profile.create':                        { en: 'Added a team member',        ar: 'أضاف عضو فريق',          icon: 'users',    tone: 'success' },
  'profile.update':                        { en: 'Updated a profile',          ar: 'حدّث ملفاً شخصياً',        icon: 'user',     tone: 'navy'    },
  'profile.prescription_template.upload':  { en: 'Uploaded a Rx template',     ar: 'رفع قالب وصفة',          icon: 'file',     tone: 'neutral' },
  'profile.prescription_template.delete':  { en: 'Deleted a Rx template',      ar: 'حذف قالب وصفة',          icon: 'file',     tone: 'danger'  },
  'org.update':                            { en: 'Updated org settings',       ar: 'حدّث إعدادات المؤسسة',    icon: 'settings', tone: 'navy'    },
  'org_secret.set':                        { en: 'Set an org secret',          ar: 'ضبط سرّ المؤسسة',         icon: 'key',      tone: 'navy'    },
  'set_secret':                            { en: 'Set an org secret',          ar: 'ضبط سرّ المؤسسة',         icon: 'key',      tone: 'navy'    },

  // ── invitations ──
  'invitation.create': { en: 'Invited a member',       ar: 'دعا عضواً',        icon: 'mail', tone: 'success' },
  'invitation.revoke': { en: 'Revoked an invitation',  ar: 'ألغى دعوة',        icon: 'mail', tone: 'danger'  },

  // ── social ──
  'social_connection.upsert': { en: 'Connected a social page',  ar: 'ربط صفحة تواصل',   icon: 'globe', tone: 'navy'   },
  'social_connection.delete': { en: 'Disconnected a social page', ar: 'فصل صفحة تواصل',  icon: 'globe', tone: 'danger' },
}

// Prettify an unmapped verb: 'foo.bar_baz' → 'Foo bar baz' (forward-compatible).
function prettifyAction(action) {
  const s = String(action || '').replace(/[._]/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Activity'
}

/** Human label for an action (falls back to a prettified verb). */
export function getActionLabel(action, isRTL = false) {
  const m = ACTION_LABELS[action]
  if (m) return isRTL ? m.ar : m.en
  return prettifyAction(action)
}

/** Semantic icon + tone keys for an action (UI maps them; safe defaults). */
export function getActionMeta(action) {
  const m = ACTION_LABELS[action]
  return { icon: m?.icon || 'file', tone: m?.tone || 'neutral' }
}

// Generic key/value summary for unmapped/other actions: primitive top-level fields,
// arrays joined, *_id keys skipped (noise), capped so a row stays one line.
function genericPayloadSummary(payload) {
  const parts = []
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === null || v === undefined) continue
    if (k.endsWith('_id')) continue
    const label = k.replace(/_/g, ' ')
    if (Array.isArray(v)) {
      if (v.length) parts.push(`${label}: ${v.join(', ')}`)
    } else if (typeof v !== 'object') {
      parts.push(`${label}: ${v}`)
    }
    if (parts.length >= 4) break
  }
  return parts.join(' · ')
}

/**
 * Short one-line summary of a payload. Action-specific for the high-value money
 * actions (payments/charges via formatMoney); generic key/value for the rest.
 * Returns '' when there's nothing worth showing.
 */
export function formatAuditPayload(action, payload, isRTL = false) {
  const p = payload || {}
  const money = (amt, cur) => formatMoney(Number(amt || 0), cur || 'IQD')
  const reasonLabel = isRTL ? 'السبب' : 'reason'

  switch (action) {
    case 'payment.create':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.method ? ` (${p.method})` : ''}`
    case 'payment.reverse':
    case 'charge.void':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.reason ? ` — ${reasonLabel}: ${p.reason}` : ''}`
    case 'charge.create':
      if (p.amount_minor == null) break
      return `${money(p.amount_minor, p.currency)}${p.category ? ` · ${p.category}` : ''}`
    default:
      break
  }
  return genericPayloadSummary(p)
}
