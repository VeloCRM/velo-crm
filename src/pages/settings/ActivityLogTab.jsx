/**
 * Velo CRM — Settings ▸ Activity Log tab.
 *
 * Read-only timeline over the append-only audit_log. Visible to all org members
 * (RLS: audit_log_select_own_org). Data + labels come from the verified data layer:
 *   fetchAuditLog / resolveActors / describeActor  (src/lib/audit.js)
 *   getActionLabel / getActionMeta / formatAuditPayload  (src/lib/auditLabels.js)
 *
 * Operator (SupCod3) actions are visually distinct — an actor whose id doesn't resolve
 * to an in-org profile is the agency (per the trace's logic).
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog, resolveActors, describeActor } from '../../lib/audit'
import { getActionLabel, getActionMeta, formatAuditPayload } from '../../lib/auditLabels'
import { listTeamMembersInOrg } from '../../lib/profiles'
import { ROLE_LABELS } from '../../lib/permissions'
import { isSupabaseConfigured } from '../../lib/supabase'
import { GlassCard, Button, Input, Select, EmptyState } from '../../components/ui'
import { Icons } from '../../components/shared'

/*
 * ═══ TanStack Query reference pattern — COPY THIS for other conversions ═══════
 *
 * KEY SHAPE:  ['<entity>', orgId, <server-params object>]
 *   • orgId comes FIRST after the entity name. Every clinic-scoped query MUST include
 *     it so an operator switching clinics gets a SEPARATE cache entry — clinic A's data
 *     is never served under clinic B's key. Source: the synchronously-available
 *     `dentalOrgId` (App.jsx = impersonation.orgId ?? orgSettings.id), passed down as a
 *     prop — NOT an async getCurrentOrgId().
 *   • Put ONLY the params the queryFn actually varies on in the key (here: date range,
 *     server actorId, limit). Client-side-only filters (category, the "operator" actor
 *     selection) are applied AFTER the fetch and are deliberately NOT keyed, so toggling
 *     them reuses the cache instead of refetching identical rows.
 *
 * ORG-SCOPING GUARANTEE: the key changes when dentalOrgId changes on impersonation
 *   switch, AND App.jsx calls queryClient.clear() on every impersonation change —
 *   belt-and-braces against any cross-org cache bleed.
 *
 * INVALIDATION RULE: a mutation that changes an entity must
 *   queryClient.invalidateQueries({ queryKey: ['<entity>', orgId] }) so lists refresh.
 *   (This surface is read-only; new audit entries surface via staleTime expiry / focus
 *   refetch / reopening the tab — nothing to invalidate here.)
 *
 * ENABLED: gate on `!!orgId` so a no-org operator never fires the query.
 * ═════════════════════════════════════════════════════════════════════════════
 */

// Curated action groups for the category filter (NOT the raw ~40 actions).
const ACTION_CATEGORIES = [
  { id: 'payments', en: 'Payments', ar: 'المدفوعات', actions: ['payment.create', 'payment.update', 'payment.delete', 'payment.reverse'] },
  { id: 'charges', en: 'Charges', ar: 'الرسوم', actions: ['charge.create', 'charge.void'] },
  { id: 'patients', en: 'Patients', ar: 'المرضى', actions: ['patient.create', 'patient.update', 'patient.delete', 'patient.medical_history_update', 'patient.allergies_update'] },
  { id: 'appointments', en: 'Appointments', ar: 'المواعيد', actions: ['appointment.create', 'appointment.update', 'appointment.delete', 'appointment.status_change'] },
  { id: 'clinical', en: 'Clinical', ar: 'إكلينيكي', actions: ['dental_chart.add', 'dental_chart.remove', 'treatment_plan.create', 'treatment_plan.status_change', 'treatment_plan.remove', 'treatment_plan_item.status_change', 'prescription.create', 'prescription.update', 'prescription.delete', 'prescription.print', 'xray.upload', 'xray.update', 'xray.delete', 'xray.view'] },
  { id: 'documents', en: 'Documents & Notes', ar: 'المستندات والملاحظات', actions: ['document.upload', 'document.view', 'document.delete', 'note.create', 'note.update', 'note.delete'] },
  { id: 'team', en: 'Team & Settings', ar: 'الفريق والإعدادات', actions: ['profile.create', 'profile.update', 'profile.prescription_template.upload', 'profile.prescription_template.delete', 'org.update', 'org_secret.set', 'set_secret', 'invitation.create', 'invitation.revoke', 'inventory_item.create', 'inventory_item.update', 'inventory_item.delete', 'social_connection.upsert', 'social_connection.delete'] },
]
const CATEGORY_ACTIONS = Object.fromEntries(ACTION_CATEGORIES.map(c => [c.id, new Set(c.actions)]))

// Semantic icon key → shared Icon fn (all exist except 'package' → file fallback).
const ICON_MAP = {
  dollar: Icons.dollar, file: Icons.file, undo: Icons.undo, user: Icons.user, users: Icons.users,
  calendar: Icons.calendar, edit: Icons.edit, settings: Icons.settings, key: Icons.key,
  mail: Icons.mail, globe: Icons.globe,
}

function defaultFrom() {
  const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  const d = new Date(); d.setHours(23, 59, 59, 999)
  return d.toISOString().slice(0, 10)
}
function toIsoBounds(fromYmd, toYmd) {
  const out = {}
  if (fromYmd) { const d = new Date(fromYmd + 'T00:00:00'); if (!Number.isNaN(d.getTime())) out.from = d.toISOString() }
  if (toYmd) { const d = new Date(toYmd + 'T23:59:59.999'); if (!Number.isNaN(d.getTime())) out.to = d.toISOString() }
  return out
}
function relativeTime(iso, isRTL) {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return isRTL ? 'الآن' : 'just now'
  const m = Math.floor(s / 60); if (m < 60) return isRTL ? `قبل ${m} د` : `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return isRTL ? `قبل ${h} س` : `${h}h ago`
  const d = Math.floor(h / 24); if (d < 30) return isRTL ? `قبل ${d} ي` : `${d}d ago`
  return new Date(iso).toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { month: 'short', day: 'numeric' })
}

function ActorChip({ actor, lang }) {
  const roleLabel = actor.role ? (ROLE_LABELS[lang === 'ar' ? 'ar' : 'en']?.[actor.role] || actor.role) : null
  const cls = actor.isOperator
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : actor.removed
      ? 'bg-navy-100 text-navy-400 border-navy-200'
      : 'bg-navy-50 text-navy-700 border-navy-200'
  const suffix = actor.isOperator ? ` (${lang === 'ar' ? 'مشغّل' : 'operator'})` : roleLabel ? ` · ${roleLabel}` : ''
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {actor.name}{suffix}
    </span>
  )
}

export default function ActivityLogTab({ orgId, lang, dir, isRTL }) {
  const [expanded, setExpanded] = useState(null)
  const [limit, setLimit] = useState(100)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [actorFilter, setActorFilter] = useState('') // '' | memberId | 'operator'
  const [category, setCategory] = useState('')

  const enabled = !!orgId && isSupabaseConfigured()

  // Org members for the actor dropdown (org-scoped cache).
  const { data: members = [] } = useQuery({
    queryKey: ['teamMembers', orgId],
    queryFn: () => listTeamMembersInOrg(),
    enabled,
  })

  // The audit feed. Key = org + the SERVER-side params only (date range, member actorId,
  // limit). category + the "operator" actor selection are client-side (below), so they
  // are NOT in the key. resolveActors is folded into the SAME queryFn so one cache entry
  // atomically holds { rows, actors } (no dependent-query waterfall).
  const serverActorId = actorFilter && actorFilter !== 'operator' ? actorFilter : undefined
  const { data, isLoading, isError } = useQuery({
    queryKey: ['activityLog', orgId, { from: dateFrom, to: dateTo, actorId: serverActorId, limit }],
    queryFn: async () => {
      const b = toIsoBounds(dateFrom, dateTo)
      const rows = await fetchAuditLog({ from: b.from, to: b.to, actorId: serverActorId, limit })
      const ids = [...new Set(rows.flatMap(r => [r.actingUserId, r.effectiveUserId]).filter(Boolean))]
      const actors = await resolveActors(ids)
      return { rows, actors }
    },
    enabled,
  })
  const rows = useMemo(() => data?.rows ?? [], [data])
  const actorMap = useMemo(() => data?.actors ?? {}, [data])

  const visibleRows = useMemo(() => rows.filter(r => {
    if (category && !CATEGORY_ACTIONS[category]?.has(r.action)) return false
    if (actorFilter === 'operator' && !describeActor(r.actingUserId, actorMap, isRTL).isOperator) return false
    return true
  }), [rows, category, actorFilter, actorMap, isRTL])

  return (
    <div dir={dir} className="flex flex-col gap-5">
      {/* Header + the append-only guarantee (sells the feature). */}
      <GlassCard padding="lg">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-accent-cyan-600 shrink-0 mt-0.5">{Icons.shield(22)}</span>
          <div>
            <h2 className="text-lg font-semibold text-navy-900 m-0">{isRTL ? 'سجل النشاط' : 'Activity Log'}</h2>
            <p className="text-sm text-navy-600 m-0 mt-1">
              {isRTL
                ? 'سجلّ دائم غير قابل للتعديل — لا يمكن تحرير أو حذف أي إدخال، ولا حتى من قِبل المشغّل.'
                : "A permanent, append-only record — entries can't be edited or deleted, not even by the operator."}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Filters */}
      <GlassCard padding="none" className="p-4">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Input type="date" label={isRTL ? 'من' : 'From'} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <Input type="date" label={isRTL ? 'إلى' : 'To'} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <Select label={isRTL ? 'المستخدم' : 'Actor'} value={actorFilter} onChange={e => setActorFilter(e.target.value)}>
            <option value="">{isRTL ? 'كل المستخدمين' : 'All actors'}</option>
            <option value="operator">{isRTL ? 'المشغّل (SupCod3)' : 'Operator (SupCod3)'}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
          </Select>
          <Select label={isRTL ? 'النوع' : 'Category'} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">{isRTL ? 'كل الأنشطة' : 'All activity'}</option>
            {ACTION_CATEGORIES.map(c => <option key={c.id} value={c.id}>{isRTL ? c.ar : c.en}</option>)}
          </Select>
        </div>
      </GlassCard>

      {/* Feed */}
      <GlassCard padding="none" className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-navy-500">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-rose-600">{isRTL ? 'تعذّر تحميل السجل' : 'Could not load the activity log'}</div>
        ) : visibleRows.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title={isRTL ? 'لا يوجد نشاط' : 'No activity'}
              description={isRTL ? 'لا يوجد نشاط في هذا النطاق. جرّب توسيع نطاق التاريخ أو تغيير الفلاتر.' : 'No activity in this range. Try widening the date range or changing the filters.'}
            />
          </div>
        ) : (
          <ul className="flex flex-col m-0 p-0 list-none">
            {visibleRows.map(r => {
              const actor = describeActor(r.actingUserId, actorMap, isRTL)
              const eff = r.effectiveUserId ? describeActor(r.effectiveUserId, actorMap, isRTL) : null
              const meta = getActionMeta(r.action)
              const iconFn = ICON_MAP[meta.icon] || Icons.file
              const summary = formatAuditPayload(r.action, r.payload, isRTL)
              const isExpanded = expanded === r.id
              return (
                <li key={r.id} className="border-b border-navy-100/60 last:border-b-0">
                  <div className="flex items-start gap-3 py-3 px-4">
                    <span aria-hidden="true" className={`grid place-items-center w-8 h-8 rounded-md shrink-0 ${actor.isOperator ? 'bg-amber-50 text-amber-700' : 'bg-navy-50 text-navy-500'}`}>
                      {iconFn(16)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ActorChip actor={actor} lang={lang} />
                        <span className="text-sm text-navy-900 font-medium">{getActionLabel(r.action, isRTL)}</span>
                        {summary && <span className="text-sm text-navy-600 truncate">— {summary}</span>}
                      </div>
                      {eff && (
                        <div className="text-xs text-navy-400 mt-0.5">
                          {isRTL ? 'بالنيابة عن' : 'acting as'} {eff.name}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-navy-400 whitespace-nowrap" title={new Date(r.createdAt).toLocaleString(isRTL ? 'ar-IQ' : 'en-US')}>
                        {relativeTime(r.createdAt, isRTL)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                        aria-label={isRTL ? 'التفاصيل' : 'Details'}
                        aria-expanded={isExpanded}
                        className="grid place-items-center w-7 h-7 rounded-md text-navy-400 hover:text-navy-700 hover:bg-navy-50 transition-colors"
                      >
                        {(isRTL ? Icons.chevronLeft : Icons.chevronRight)(14)}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 ms-11">
                      <div className="rounded-md bg-navy-50/60 border border-navy-100 p-3 text-xs text-navy-600 break-words">
                        <div><span className="text-navy-400">{isRTL ? 'الوقت' : 'Time'}:</span> {new Date(r.createdAt).toLocaleString(isRTL ? 'ar-IQ' : 'en-US', { dateStyle: 'medium', timeStyle: 'medium' })}</div>
                        {r.entityId && <div><span className="text-navy-400">{r.entityType} id:</span> {r.entityId}</div>}
                        {r.actingUserId && <div><span className="text-navy-400">actor id:</span> {r.actingUserId}</div>}
                        {Object.keys(r.payload || {}).length > 0 && (
                          <div className="mt-1 pt-1 border-t border-navy-100">
                            {Object.entries(r.payload).map(([k, v]) => (
                              <div key={k}><span className="text-navy-400">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Load older — bumps the server limit (default 100). */}
        {!isLoading && !isError && rows.length >= limit && (
          <div className="p-4 border-t border-navy-100 text-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit(l => l + 100)}>
              {isRTL ? 'تحميل أقدم' : 'Load older'}
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
