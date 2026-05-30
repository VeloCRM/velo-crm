import { useState, useRef, useEffect } from 'react'
import { GlassCard, Button, Input, Select, Modal, Badge } from '../components/ui'
import { Icons, Toggle } from '../components/shared'
import { avatarGradient, avatarInitials } from '../lib/avatarGradient'
import { sanitizeName, isValidEmail } from '../lib/sanitize'
import { isSupabaseConfigured } from '../lib/supabase'
import { createInvitation, listPendingInvitations, revokeInvitation, buildInviteUrl } from '../lib/invitations'
import { listDoctorsInOrg, updateProfile, listTeamMembersInOrg, fetchMyProfile } from '../lib/profiles'
import {
  fetchPrescriptionTemplatePath,
  uploadPrescriptionTemplate,
  deletePrescriptionTemplate,
  getPrescriptionTemplateSignedUrl,
} from '../lib/database'
import { getCurrentOrgId } from '../lib/auth_session'

import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/permissions'
import { SAMPLE_DENTAL_DOCTORS } from '../sampleData'

const TABS = [
  { id: 'organization', icon: Icons.building || Icons.globe },
  { id: 'clinic', icon: Icons.calendar },
  { id: 'profile', icon: Icons.user },
  { id: 'team', icon: Icons.users },
  { id: 'notifications', icon: Icons.bell },
  { id: 'ai', icon: Icons.zap },
  { id: 'integrations', icon: Icons.link },
  { id: 'billing', icon: Icons.creditCard },
  { id: 'apikeys', icon: Icons.key },
  { id: 'agencyai', icon: Icons.zap, operatorOnly: true },
]

const CURRENCIES = [
  { id: 'USD', label: 'USD ($)' },
  { id: 'IQD', label: 'IQD (د.ع)' },
  { id: 'EUR', label: 'EUR (€)' },
  { id: 'AED', label: 'AED (د.إ)' },
  { id: 'SAR', label: 'SAR (ر.س)' },
]

const BRAND_COLORS = ['#00FFB2','#7c3aed','#00ff88','#ef4444','#f59e0b','#E16F24','#0D9488','#6366F1','#EC4899','#e2e8f0']

const SAMPLE_TEAM = [
  { id: 'tm1', name: 'Owner User',   email: 'owner@velo.app',   role: 'owner',        avatar: 'O' },
  { id: 'tm2', name: 'Ahmed Hassan', email: 'ahmed@velo.app',   role: 'doctor',       avatar: 'A' },
  { id: 'tm3', name: 'Sarah Kim',    email: 'sarah@velo.app',   role: 'receptionist', avatar: 'S' },
  { id: 'tm4', name: 'Maria Lopez',  email: 'maria@velo.app',   role: 'assistant',    avatar: 'M' },
]

export default function SettingsPage({ t, lang, dir, isRTL, user, orgSettings, onSaveOrgSettings, toast, initialTab, navigate, isOperator }) {
  const [tab, _setTab] = useState(initialTab || 'organization')

  const setTab = (t) => {
    _setTab(t)
    if (navigate) navigate('/settings/' + t)
  }

  const visibleTabs = TABS.filter(tb => !tb.operatorOnly || isOperator)

  const tabLabels = {
    organization: lang === 'ar' ? 'المؤسسة' : 'Organization', clinic: lang === 'ar' ? 'العيادة' : 'Clinic', profile: t.profile, team: t.team, notifications: t.notifications, ai: lang === 'ar' ? 'الذكاء الاصطناعي' : 'AI Agent', integrations: lang === 'ar' ? 'التكاملات' : 'Integrations', billing: t.billing, apikeys: lang === 'ar' ? 'مفاتيح API' : 'API Keys', agencyai: lang === 'ar' ? 'AI الوكالة' : 'Agency AI',
  }

  return (
    <div dir={dir} className="ds-root min-h-full p-6 md:p-8">
      <h1 className="text-[28px] font-semibold text-navy-800 m-0 mb-6 leading-tight tracking-tight">
        {t.settings}
      </h1>
      <div className="flex gap-6 items-start">
        {/* Sidebar tabs */}
        <GlassCard
          as="nav"
          padding="sm"
          aria-label={lang === 'ar' ? 'أقسام الإعدادات' : 'Settings sections'}
          className="w-[220px] shrink-0 sticky top-6"
        >
          <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
            {visibleTabs.map(tb => {
              const isActive = tab === tb.id
              return (
                <li key={tb.id}>
                  <button
                    type="button"
                    onClick={() => setTab(tb.id)}
                    data-active={isActive}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'tab-button',
                      'w-full flex items-center gap-2.5',
                      'py-2.5 ps-3.5 pe-3',
                      'rounded-lg border-0 cursor-pointer',
                      'text-[13px] text-start',
                      'transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:shadow-focus-cyan',
                      isActive
                        ? 'bg-white/80 text-navy-900 font-semibold ring-1 ring-navy-100 shadow-glass-sm'
                        : 'bg-transparent text-navy-600 font-medium hover:bg-navy-50/70 hover:text-navy-800',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex shrink-0 ${isActive ? 'text-accent-cyan-600' : 'text-navy-400'}`}
                    >
                      {tb.icon(18)}
                    </span>
                    <span className="truncate">{tabLabels[tb.id]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </GlassCard>

        {/* Tab content */}
        <div className="flex-1 min-w-0 fade-in" key={tab}>
          {tab === 'organization' && <OrganizationTab t={t} lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} onSave={onSaveOrgSettings} />}
          {tab === 'clinic' && <ClinicTab lang={lang} dir={dir} isRTL={isRTL} toast={toast} setTab={setTab} />}
          {tab === 'profile' && <ProfileTab t={t} lang={lang} dir={dir} isRTL={isRTL} user={user} toast={toast} />}
          {tab === 'team' && <TeamTab t={t} lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} toast={toast} />}
          {tab === 'notifications' && <NotificationsTab t={t} lang={lang} dir={dir} toast={toast} />}
          {tab === 'ai' && <AISettingsTab t={t} lang={lang} dir={dir} orgSettings={orgSettings} onSave={onSaveOrgSettings} />}
          {tab === 'integrations' && <IntegrationSettingsTab t={t} lang={lang} dir={dir} orgSettings={orgSettings} onSave={onSaveOrgSettings} />}
          {tab === 'billing' && <BillingTab t={t} lang={lang} dir={dir} />}
          {tab === 'apikeys' && <ApiKeysTab lang={lang} />}
          {tab === 'agencyai' && isOperator && <AgencyAITab lang={lang} dir={dir} toast={toast} />}
        </div>
      </div>
    </div>
  )
}

function OrganizationTab({ t, lang, dir, isRTL, orgSettings = {}, onSave }) {
  void t
  void dir
  void isRTL
  const [form, setForm] = useState({
    name: orgSettings.name || '',
    industry: orgSettings.industry || 'general',
    primary_color: orgSettings.primary_color || '#00FFB2',
    currency: orgSettings.currency || 'USD',
    timezone: orgSettings.timezone || 'America/New_York',
  })
  const [saved, setSaved] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (onSave) onSave({ ...form, name: sanitizeName(form.name) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const TIMEZONES = ['America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Asia/Dubai','Asia/Riyadh','Asia/Baghdad','Asia/Seoul']

  return (
    <div className="space-y-5">
      <GlassCard padding="lg">
        <h2 className="text-lg font-semibold text-navy-800 m-0 mb-5">
          {lang === 'ar' ? 'معلومات المؤسسة' : 'Organization Info'}
        </h2>

        {/* Logo + Name */}
        <div className="flex items-center gap-5 mb-6">
          <div
            className="grid place-items-center w-16 h-16 rounded-glass-lg text-white text-[26px] font-bold shrink-0 shadow-glass-sm"
            style={{ background: `linear-gradient(135deg, ${form.primary_color}, #103562)` }}
            aria-hidden="true"
          >
            {(form.name || 'V').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <Input
              label={lang === 'ar' ? 'اسم الشركة' : 'Company Name'}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder={lang === 'ar' ? 'اسم شركتك' : 'Your company name'}
            />
          </div>
        </div>

        {/* Brand Color */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-navy-600 mb-2">
            {lang === 'ar' ? 'لون العلامة التجارية' : 'Brand Color'}
          </div>
          <div className="flex flex-wrap gap-2">
            {BRAND_COLORS.map(c => {
              const active = form.primary_color === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('primary_color', c)}
                  aria-label={c}
                  aria-pressed={active}
                  className={[
                    'w-8 h-8 rounded-md cursor-pointer p-0',
                    'transition-shadow duration-fast',
                    active ? 'ring-2 ring-offset-2 ring-navy-800' : 'ring-0',
                  ].join(' ')}
                  style={{ background: c }}
                />
              )
            })}
          </div>
        </div>

        {/* Currency + Timezone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label={lang === 'ar' ? 'العملة' : 'Currency'}
            value={form.currency}
            onChange={e => set('currency', e.target.value)}
            options={CURRENCIES.map(c => ({ value: c.id, label: c.label }))}
          />
          <Select
            label={lang === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}
            value={form.timezone}
            onChange={e => set('timezone', e.target.value)}
            options={TIMEZONES.map(tz => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
          />
        </div>
      </GlassCard>

      {/* Industry note */}
      {form.industry === 'dental' && (
        <GlassCard padding="md" className="bg-accent-cyan-50/60 border-accent-cyan-200">
          <p className="text-[13px] text-accent-cyan-800 leading-relaxed m-0">
            🦷{' '}
            {lang === 'ar'
              ? 'وضع عيادة الأسنان مفعّل — ستظهر "المرضى" بدلاً من "جهات الاتصال" مع تبويبات المخطط الطبي والعلاجات والأشعة.'
              : 'Dental mode active — "Patients" replaces "Contacts" with Medical History, Dental Chart, Treatments, Prescriptions, and X-Rays tabs.'}
          </p>
        </GlassCard>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleSave}
          iconStart={saved ? Icons.check : undefined}
        >
          {saved
            ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!')
            : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}
        </Button>
      </div>
    </div>
  )
}

function ProfileTab({ t, lang, dir, isRTL, user, toast }) {
  void dir
  void isRTL
  const [form, setForm] = useState({
    fullName: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    language: lang,
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)

  // Hydrate name/language from the canonical profiles row (not user_metadata),
  // so a saved change survives reopening the tab.
  useEffect(() => {
    let cancelled = false
    fetchMyProfile()
      .then(p => {
        if (cancelled || !p) return
        setForm(f => ({ ...f, fullName: p.full_name || f.fullName, language: p.locale || f.language }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    if (!user?.id) { toast?.(lang === 'ar' ? 'لا يوجد سياق مستخدم' : 'No user context', 'error'); return }
    setSaving(true)
    try {
      await updateProfile(user.id, { full_name: form.fullName, locale: form.language })
      toast?.(lang === 'ar' ? 'تم حفظ الملف الشخصي' : 'Profile saved', 'success')
    } catch (e) {
      toast?.(e.message || (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard padding="lg">
      <h2 className="text-lg font-semibold text-navy-800 m-0 mb-6">{t.profile}</h2>

      <div className="flex items-center gap-5 mb-7">
        <div
          className={`grid place-items-center w-[72px] h-[72px] rounded-full text-white text-[28px] font-bold shrink-0 shadow-glass-sm bg-gradient-to-br ${avatarGradient(form.fullName)}`}
          aria-hidden="true"
        >
          {avatarInitials(form.fullName)}
        </div>
        <div>
          <span
            title={lang === 'ar' ? 'رفع الصورة قريباً' : 'Photo upload coming soon'}
            className="inline-block"
          >
            <Button variant="secondary" size="sm" iconStart={Icons.upload} disabled>
              {t.changePhoto}
            </Button>
          </span>
          <p className="text-[11px] text-navy-500 mt-1.5 m-0">
            {lang === 'ar' ? 'رفع الصورة قريباً' : 'Photo upload coming soon'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <Input
          label={t.fullName}
          value={form.fullName}
          onChange={e => set('fullName', e.target.value)}
        />
        <Input
          label={t.emailAddress}
          type="email"
          value={form.email}
          readOnly
        />
        <Select
          label={t.language}
          value={form.language}
          onChange={e => set('language', e.target.value)}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ar', label: 'العربية' },
          ]}
        />
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : t.saveChanges}
        </Button>
      </div>
    </GlassCard>
  )
}

// Roles a clinic owner can invite. Owners can never invite other owners
// (one owner per org). Operators can flip ownership through dedicated
// operator endpoints.
const INVITABLE_ROLES = ['doctor', 'receptionist', 'assistant']

function TeamTab({ t, lang, dir, isRTL, toast }) {
  // Identity gating: only owners see the invite form. Everyone in the org
  // sees the team list.
  const [myRole, setMyRole] = useState(null)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [team, setTeam] = useState([])
  const [pending, setPending] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('receptionist')
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState(null) // { url, email }
  const [copied, setCopied] = useState(false)

  const isOwner = myRole === 'owner'

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setTeam(SAMPLE_TEAM)
      setIdentityLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const profile = await fetchMyProfile()
        if (cancelled) return
        setMyRole(profile?.role || null)
        const members = await listTeamMembersInOrg()
        if (cancelled) return
        setTeam((members || []).map(p => ({
          id: p.id,
          name: p.full_name || 'Team Member',
          role: p.role || 'assistant',
          avatar: (p.full_name || 'T').charAt(0).toUpperCase(),
        })))
        if (profile?.role === 'owner') {
          const invites = await listPendingInvitations()
          if (!cancelled) setPending(invites || [])
        }
      } catch (err) {
        if (!cancelled) console.error('Team load error:', err)
      } finally {
        if (!cancelled) setIdentityLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const notify = (msg, type = 'success') => { if (toast) toast(msg, type) }

  const invite = async () => {
    if (inviting) return
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) {
      notify(isRTL ? 'البريد الإلكتروني غير صالح' : 'Invalid email address', 'error')
      return
    }
    setInviting(true)
    try {
      const row = await createInvitation({ email, role: inviteRole })
      const url = buildInviteUrl(row.token)
      setInviteLink({ url, email })
      setPending(prev => [row, ...prev])
      setInviteEmail('')
      notify(isRTL ? 'تم إنشاء رابط الدعوة' : 'Invitation link created')
    } catch (err) {
      console.error('Create invitation error:', err)
      notify(err?.message || (isRTL ? 'فشل إنشاء الدعوة' : 'Failed to create invitation'), 'error')
    } finally {
      setInviting(false)
    }
  }

  const revoke = async (id) => {
    try {
      await revokeInvitation(id)
      setPending(prev => prev.filter(p => p.id !== id))
      notify(isRTL ? 'تم إلغاء الدعوة' : 'Invitation revoked')
    } catch (err) {
      console.error('Revoke invitation error:', err)
      notify(err?.message || (isRTL ? 'فشل الإلغاء' : 'Failed to revoke'), 'error')
    }
  }

  const copyLink = async () => {
    if (!inviteLink?.url) return
    try {
      await navigator.clipboard.writeText(inviteLink.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.getElementById('velo-invite-link-input')
      if (el && el.select) el.select()
    }
  }

  if (identityLoading) {
    return <p className="text-sm text-navy-500 m-0">{isRTL ? 'جاري التحميل...' : 'Loading…'}</p>
  }

  return (
    <div className="space-y-5">
      {/* Owner-gated invite form OR non-owner notice */}
      {isOwner ? (
        <GlassCard padding="lg">
          <h2 className="text-lg font-semibold text-navy-800 m-0 mb-5">{t.inviteMember}</h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
            <Input
              type="email"
              maxLength={255}
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="email@company.com"
              onKeyDown={e => e.key === 'Enter' && invite()}
              aria-label={t.inviteMember}
            />
            <Select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              options={INVITABLE_ROLES.map(r => ({ value: r, label: (ROLE_LABELS[lang] || ROLE_LABELS.en)[r] || r }))}
              aria-label={isRTL ? 'الدور' : 'Role'}
            />
            <Button variant="primary" onClick={invite} loading={inviting}>
              {t.inviteMember}
            </Button>
          </div>
          <p className="text-xs text-navy-500 m-0 mt-3">
            <strong className="text-navy-700 font-semibold">
              {(ROLE_LABELS[lang] || ROLE_LABELS.en)[inviteRole] || inviteRole}
            </strong>
            {(ROLE_DESCRIPTIONS[lang] || ROLE_DESCRIPTIONS.en)[inviteRole]
              ? ' — ' + (ROLE_DESCRIPTIONS[lang] || ROLE_DESCRIPTIONS.en)[inviteRole]
              : ''}
          </p>
          <p className="text-xs text-navy-500 m-0 mt-1.5">
            {isRTL
              ? 'سيتم إنشاء رابط دعوة يمكنك نسخه وإرساله يدوياً (واتساب، بريد إلكتروني). صالح 7 أيام.'
              : 'Generates a copyable invite link you can send manually (WhatsApp, SMS, email). Expires in 7 days.'}
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding="md">
          <p className="text-sm text-navy-600 m-0">
            {isRTL
              ? 'إدارة الفريق متاحة لمالكي العيادة فقط.'
              : 'Team management is available to clinic owners.'}
          </p>
        </GlassCard>
      )}

      {/* Invite link modal — owner only (only shown after a successful create) */}
      <Modal
        open={!!(isOwner && inviteLink)}
        onClose={() => setInviteLink(null)}
        title={isRTL ? 'رابط الدعوة جاهز' : 'Invitation link ready'}
        closeLabel={isRTL ? 'إغلاق' : 'Close'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setInviteLink(null)}>
            {isRTL ? 'إغلاق' : 'Done'}
          </Button>
        }
      >
        <div dir={dir}>
          <p className="text-xs text-navy-600 leading-relaxed m-0 mb-3.5">
            {isRTL
              ? `أرسل هذا الرابط إلى ${inviteLink?.email || ''} عبر واتساب أو الرسائل أو البريد الإلكتروني. صالح لمدة 7 أيام.`
              : `Share this link with ${inviteLink?.email || ''} via WhatsApp, SMS, or email. The link expires in 7 days.`}
          </p>
          <div className="flex gap-2 items-stretch">
            <input
              id="velo-invite-link-input"
              readOnly
              value={inviteLink?.url || ''}
              onFocus={e => e.target.select()}
              className="flex-1 min-w-0 h-11 px-3.5 rounded-glass bg-white/85 backdrop-blur-glass-sm border border-navy-100 text-xs font-mono text-navy-800 outline-none transition-all duration-fast ease-standard focus:border-accent-cyan-500 focus:shadow-focus-cyan"
              aria-label={isRTL ? 'رابط الدعوة' : 'Invitation link'}
            />
            <Button variant="primary" onClick={copyLink}>
              {copied ? (isRTL ? 'تم النسخ' : 'Copied!') : (isRTL ? 'نسخ' : 'Copy')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pending invitations — owner only */}
      {isOwner && pending.length > 0 && (
        <GlassCard padding="none">
          <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-navy-800 m-0">
              {isRTL ? 'دعوات معلقة' : 'Pending invitations'}
            </h3>
            <Badge tone="navy"><span className="tabular-nums lining-nums">{pending.length}</span></Badge>
          </div>
          {pending.map((inv, idx) => {
            const url = buildInviteUrl(inv.token)
            const expires = inv.expires_at ? new Date(inv.expires_at).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', { month: 'short', day: 'numeric' }) : ''
            const isLast = idx === pending.length - 1
            return (
              <div key={inv.id} className={`flex items-center gap-3.5 px-5 py-3.5 ${isLast ? '' : 'border-b border-navy-100'}`}>
                <div className="grid place-items-center w-9 h-9 rounded-full bg-navy-50 text-navy-600 text-sm font-semibold shrink-0" aria-hidden="true">
                  {(inv.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-navy-800 truncate">{inv.email}</div>
                  <div className="text-[11px] text-navy-500 truncate tabular-nums lining-nums">
                    {(ROLE_LABELS[lang] || ROLE_LABELS.en)[inv.role] || inv.role}
                    {expires ? ` · ${isRTL ? 'تنتهي' : 'expires'} ${expires}` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setInviteLink({ url, email: inv.email })}>
                  {isRTL ? 'نسخ الرابط' : 'Copy link'}
                </Button>
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  aria-label={isRTL ? 'إلغاء الدعوة' : 'Revoke invitation'}
                  className="grid place-items-center w-8 h-8 rounded-glass text-navy-400 hover:text-rose-600 hover:bg-rose-50 transition-colors duration-fast"
                >
                  {Icons.trash(14)}
                </button>
              </div>
            )
          })}
        </GlassCard>
      )}

      {/* Team list — visible to everyone in the org */}
      <GlassCard padding="none">
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-navy-800 m-0">{t.teamMembers}</h3>
          <Badge tone="navy"><span className="tabular-nums lining-nums">{team.length}</span></Badge>
        </div>
        {team.map((member, idx) => {
          const isLast = idx === team.length - 1
          return (
            <div key={member.id} className={`flex items-center gap-3.5 px-5 py-3.5 ${isLast ? '' : 'border-b border-navy-100'}`}>
              <div
                className={`grid place-items-center w-9 h-9 rounded-full text-white text-sm font-bold shrink-0 shadow-glass-sm bg-gradient-to-br ${avatarGradient(member.name)}`}
                aria-hidden="true"
              >
                {avatarInitials(member.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-navy-800 truncate">{member.name}</div>
              </div>
              <Badge tone={member.role === 'owner' ? 'cyan' : 'navy'}>
                {(ROLE_LABELS[lang] || ROLE_LABELS.en)[member.role] || member.role}
              </Badge>
            </div>
          )
        })}
      </GlassCard>
    </div>
  )
}

const NOTIF_PREFS_KEY = 'velo_notification_prefs'
const NOTIF_DEFAULTS = {
  emailNotif: true, whatsappNotif: false, browserNotif: true,
  dealUpdates: true, contactActivity: true, ticketUpdates: true,
  weeklyDigest: true, systemAlerts: true, smsAlerts: false,
}

function NotificationsTab({ t, lang, toast }) {
  // Per-device preferences — no server column exists yet, so persist to
  // localStorage (matches the precedent set by velo_clinic_hours / velo_kb_files).
  const [notifs, setNotifs] = useState(() => {
    try { return { ...NOTIF_DEFAULTS, ...JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}') } }
    catch { return NOTIF_DEFAULTS }
  })
  const [saved, setSaved] = useState(false)
  const toggle = (k) => setNotifs(p => ({ ...p, [k]: !p[k] }))

  const handleSave = () => {
    try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(notifs)) } catch { /* storage unavailable */ }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    toast?.(lang === 'ar' ? 'تم حفظ تفضيلات الإشعارات' : 'Notification preferences saved', 'success')
  }

  const sections = [
    { title: lang === 'ar' ? 'قنوات الإشعارات' : 'Notification Channels', items: [
      { key: 'emailNotif', label: t.emailNotifications || 'Email Notifications' },
      { key: 'whatsappNotif', label: lang === 'ar' ? 'إشعارات واتساب' : 'WhatsApp Notifications' },
      { key: 'browserNotif', label: lang === 'ar' ? 'إشعارات المتصفح' : 'Browser Notifications' },
    ]},
    { title: lang === 'ar' ? 'أنواع الأحداث' : 'Event Types', items: [
      { key: 'dealUpdates', label: t.dealUpdates },
      { key: 'contactActivity', label: t.contactActivity },
      { key: 'ticketUpdates', label: lang === 'ar' ? 'تحديثات التذاكر' : 'Ticket Updates' },
      { key: 'weeklyDigest', label: t.weeklyDigest },
      { key: 'systemAlerts', label: t.systemAlerts },
    ]},
  ]

  return (
    <GlassCard padding="lg">
      <h2 className="text-lg font-semibold text-navy-800 m-0 mb-6">{t.notifications}</h2>
      {sections.map((sec, si) => (
        <div key={si} className="mb-7 last:mb-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-navy-500 m-0 mb-3.5">
            {sec.title}
          </h3>
          {sec.items.map(item => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 border-b border-navy-100/80 last:border-b-0"
            >
              <span className="text-[13px] text-navy-700">{item.label}</span>
              <Toggle value={notifs[item.key]} onChange={() => toggle(item.key)} />
            </div>
          ))}
        </div>
      ))}
      <div className="flex justify-end mt-6">
        <Button variant="primary" onClick={handleSave} iconStart={saved ? Icons.check : undefined}>
          {saved ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!') : t.saveChanges}
        </Button>
      </div>
    </GlassCard>
  )
}

function BillingTab({ t, lang, dir }) {
  void t
  void dir
  const isAr = lang === 'ar'
  // Billing is operator-managed in the agency model — there is no self-serve
  // plan/invoice surface (no Stripe integration). Show an honest notice rather
  // than fabricated plan/usage/invoice data.
  return (
    <GlassCard padding="lg">
      <div className="flex items-start gap-4">
        <div className="grid place-items-center w-11 h-11 rounded-glass bg-accent-cyan-50 ring-1 ring-accent-cyan-100 text-accent-cyan-600 shrink-0">
          {Icons.creditCard(20)}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-navy-800 m-0 mb-1.5">
            {isAr ? 'الفوترة' : 'Billing'}
          </h2>
          <p className="text-[13px] text-navy-600 leading-relaxed m-0">
            {isAr ? 'تتم إدارة الفوترة بواسطة وكالتك.' : 'Billing is managed by your agency.'}
          </p>
          <p className="text-[13px] text-navy-600 leading-relaxed m-0 mt-1">
            {isAr ? 'تواصل مع SupCod3 لتغيير الخطة أو الفواتير.' : 'Contact SupCod3 for plan changes or invoices.'}
          </p>
        </div>
      </div>
    </GlassCard>
  )
}

function ApiKeysTab({ lang }) {
  // Sprint 0 cleanup: this tab used to let clinics paste their own
  // Anthropic / Meta / Google API keys into localStorage. As of Phase 4 the
  // Anthropic key lives only on the server, and Phase 5 moved WhatsApp /
  // other integration credentials into org_secrets (operator-managed). No
  // client-side key persistence remains.
  const ar = lang === 'ar'
  const operatorContact = import.meta.env.VITE_OPERATOR_CONTACT || ''

  return (
    <div className="space-y-5">
      <GlassCard padding="lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid place-items-center w-11 h-11 rounded-glass bg-accent-cyan-50 ring-1 ring-accent-cyan-100 shrink-0 text-accent-cyan-600" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-navy-800 m-0">
              {ar ? 'بيانات الاعتماد يديرها المشغّل' : 'Credentials are managed by the operator'}
            </h2>
            <p className="text-xs text-navy-500 m-0 mt-0.5">
              {ar ? 'لم تعد العيادات تخزن مفاتيح API محلياً' : 'Clinics no longer store API keys locally'}
            </p>
          </div>
        </div>

        <p className="text-sm text-navy-600 leading-relaxed m-0 mb-3">
          {ar
            ? 'تتم إدارة ميزات الذكاء الاصطناعي و WhatsApp والتكاملات الأخرى بواسطة المشغل. تواصل مع المشغل لتفعيل أي ميزة لهذه العيادة.'
            : 'AI features, WhatsApp, and other integrations are configured by the operator. Contact the operator to enable AI for this clinic.'}
        </p>

        {operatorContact ? (
          <a
            href={operatorContact}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-glass navy-gradient text-white text-sm font-semibold shadow-navy-glow no-underline transition-all duration-fast ease-standard hover:-translate-y-px hover:shadow-navy-glow active:translate-y-0 active:shadow-navy-glow-soft focus-visible:outline-none focus-visible:shadow-focus-cyan"
          >
            {ar ? 'تواصل مع المشغل' : 'Contact the operator'}
          </a>
        ) : (
          <div className="mt-2 px-3.5 py-2.5 rounded-glass bg-amber-50/60 ring-1 ring-amber-200 text-xs text-amber-800">
            {ar
              ? 'لم يتم إعداد جهة اتصال المشغل بعد.'
              : 'Operator contact has not been configured yet.'}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

function AISettingsTab({ t, lang, dir, orgSettings = {}, onSave }) {
  void t
  void dir
  // The Anthropic key lives only on the server now (Phase 4). Clinic users
  // configure prompt/personality/knowledge here; the secret never leaves the
  // server proxy at /api/ai/chat.
  const [personality, setPersonality] = useState(orgSettings.ai_personality || 'professional')
  const [knowledgeBase, setKnowledgeBase] = useState(orgSettings.ai_knowledge_base || '')
  const [channels, setChannels] = useState(orgSettings.ai_enabled_channels || { whatsapp: false, instagram: false, email: false })
  const [workingHours, setWorkingHours] = useState(orgSettings.ai_working_hours || { start: '09:00', end: '17:00', always_on: false })
  const [escalationKeywords, setEscalationKeywords] = useState(orgSettings.ai_escalation_keywords || 'urgent, help, complaint, manager')
  const [responseDelay, setResponseDelay] = useState(orgSettings.ai_response_delay || 'instant')
  const [kbFiles, setKbFiles] = useState(() => { try { return JSON.parse(localStorage.getItem('velo_kb_files')||'[]') } catch { return [] } })
  const [showTestChat, setShowTestChat] = useState(false)
  const [testMessages, setTestMessages] = useState([])
  const [testInput, setTestInput] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  const handleSave = () => {
    if (onSave) onSave({ ai_personality: personality, ai_knowledge_base: knowledgeBase, ai_enabled_channels: channels, ai_working_hours: workingHours, ai_escalation_keywords: escalationKeywords, ai_response_delay: responseDelay })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setKnowledgeBase(prev => prev + '\n\n--- ' + file.name + ' ---\n' + ev.target.result)
      const next = [...kbFiles, { name: file.name, size: (file.size/1024).toFixed(1)+'KB', date: new Date().toLocaleDateString() }]
      setKbFiles(next); localStorage.setItem('velo_kb_files', JSON.stringify(next))
    }
    reader.readAsText(file)
  }

  const PERSONALITIES = [
    { id: 'professional', l: lang === 'ar' ? 'مهني' : 'Professional', i: '👔' },
    { id: 'friendly',     l: lang === 'ar' ? 'ودود'  : 'Friendly',     i: '😊' },
    { id: 'formal',       l: lang === 'ar' ? 'رسمي'  : 'Formal',       i: '📋' },
  ]

  return (
    <div className="space-y-5">
      {/* Header — credentials are operator-managed now (Phase 4) */}
      <GlassCard padding="lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="grid place-items-center w-9 h-9 rounded-glass bg-accent-cyan-50 ring-1 ring-accent-cyan-100 shrink-0 text-accent-cyan-600" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-navy-800 m-0">{lang === 'ar' ? 'إعدادات الذكاء الاصطناعي' : 'AI Agent Settings'}</h2>
            <p className="text-xs text-navy-500 m-0 mt-0.5">Powered by Claude (Anthropic)</p>
          </div>
        </div>
        <p className="text-sm text-navy-600 leading-relaxed m-0">
          {lang === 'ar'
            ? 'يقوم المشغّل بإدارة بيانات اعتماد Anthropic. الإعدادات أدناه (الشخصية، قاعدة المعرفة، القنوات، ساعات العمل) تُحفظ على مستوى العيادة وتُمرَّر إلى الخادم عند الرد التلقائي.'
            : 'Anthropic credentials are managed by the operator. The settings below (personality, knowledge base, channels, working hours) are saved per-clinic and forwarded to the server when auto-replies fire.'}
        </p>
      </GlassCard>

      {/* Personality */}
      <GlassCard padding="lg">
        <h3 className="text-base font-semibold text-navy-800 m-0 mb-3.5">{lang === 'ar' ? 'شخصية الرد' : 'AI Personality'}</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {PERSONALITIES.map(p => {
            const active = personality === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersonality(p.id)}
                aria-pressed={active}
                className={[
                  'py-4 px-3 rounded-glass text-center cursor-pointer',
                  'transition-colors duration-fast ease-standard',
                  'focus-visible:outline-none focus-visible:shadow-focus-cyan',
                  active
                    ? 'bg-accent-cyan-50/60 ring-2 ring-accent-cyan-500 text-accent-cyan-700'
                    : 'bg-white ring-1 ring-navy-100 text-navy-700 hover:ring-navy-200',
                ].join(' ')}
              >
                <div className="text-[28px] leading-none mb-1.5" aria-hidden="true">{p.i}</div>
                <div className="text-[13px] font-semibold">{p.l}</div>
              </button>
            )
          })}
        </div>
      </GlassCard>

      {/* Channels + Working Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <GlassCard padding="lg">
          <h3 className="text-base font-semibold text-navy-800 m-0 mb-3.5">{lang === 'ar' ? 'القنوات المفعّلة' : 'Enabled Channels'}</h3>
          {Object.entries(channels).map(([ch, on], idx, arr) => {
            const isLast = idx === arr.length - 1
            return (
              <div key={ch} className={`flex items-center justify-between py-2.5 ${isLast ? '' : 'border-b border-navy-100'}`}>
                <span className="text-[13px] text-navy-700 capitalize">{ch}</span>
                <Toggle value={on} onChange={() => setChannels(p => ({ ...p, [ch]: !p[ch] }))} />
              </div>
            )
          })}
        </GlassCard>
        <GlassCard padding="lg">
          <h3 className="text-base font-semibold text-navy-800 m-0 mb-3.5">{lang === 'ar' ? 'ساعات العمل' : 'Working Hours'}</h3>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-navy-700">{lang === 'ar' ? 'نشط دائماً' : 'Always Active'}</span>
            <Toggle value={workingHours.always_on} onChange={() => setWorkingHours(p => ({ ...p, always_on: !p.always_on }))} />
          </div>
          {!workingHours.always_on && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="time"
                label={lang === 'ar' ? 'من' : 'From'}
                value={workingHours.start}
                onChange={e => setWorkingHours(p => ({ ...p, start: e.target.value }))}
              />
              <Input
                type="time"
                label={lang === 'ar' ? 'إلى' : 'To'}
                value={workingHours.end}
                onChange={e => setWorkingHours(p => ({ ...p, end: e.target.value }))}
              />
            </div>
          )}
        </GlassCard>
      </div>

      {/* Knowledge Base */}
      <GlassCard padding="lg">
        <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
          <h3 className="text-base font-semibold text-navy-800 m-0">{lang === 'ar' ? 'قاعدة المعرفة' : 'Knowledge Base'}</h3>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".txt,.pdf,.md,.docx" className="hidden" onChange={handleFileUpload} />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} iconStart={Icons.upload}>
              {lang === 'ar' ? 'رفع ملف' : 'Upload File'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowTestChat(!showTestChat)}>
              <span aria-hidden="true">🧪</span> {lang === 'ar' ? 'اختبار' : 'Test AI'}
            </Button>
          </div>
        </div>
        {/* Uploaded files list */}
        {kbFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {kbFiles.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 h-6 ps-2.5 pe-1.5 rounded-full bg-navy-50 ring-1 ring-navy-100 text-navy-700 text-[11px]">
                <span aria-hidden="true">📄</span> {f.name}
                <button
                  type="button"
                  onClick={() => { const next = kbFiles.filter((_, j) => j !== i); setKbFiles(next); localStorage.setItem('velo_kb_files', JSON.stringify(next)) }}
                  aria-label={(lang === 'ar' ? 'إزالة ' : 'Remove ') + f.name}
                  className="grid place-items-center w-4 h-4 rounded-full text-navy-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >&times;</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={knowledgeBase}
          onChange={e => setKnowledgeBase(e.target.value)}
          rows={6}
          placeholder={lang === 'ar' ? 'الصق نص الأسئلة الشائعة أو معلومات المنتج هنا...' : 'Paste FAQ text or product information here...'}
          className="w-full min-h-[140px] px-3.5 py-2.5 rounded-glass bg-white/85 backdrop-blur-glass-sm border border-navy-100 text-sm text-navy-800 placeholder:text-navy-400 leading-relaxed resize-y outline-none transition-all duration-fast ease-standard hover:border-navy-200 focus:border-accent-cyan-500 focus:shadow-focus-cyan"
        />
        <p className="text-[11px] text-navy-500 mt-1.5 m-0">{lang === 'ar' ? 'سيستخدم الذكاء الاصطناعي هذه المعلومات للرد على العملاء' : 'AI will use this information to answer customer questions'}</p>
      </GlassCard>

      {/* Auto-Reply Configuration */}
      <GlassCard padding="lg">
        <h3 className="text-base font-semibold text-navy-800 m-0 mb-3.5">{lang === 'ar' ? 'إعدادات الرد التلقائي' : 'Auto-Reply Settings'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={lang === 'ar' ? 'كلمات التصعيد' : 'Escalation Keywords'}
            value={escalationKeywords}
            onChange={e => setEscalationKeywords(e.target.value)}
            placeholder="urgent, help, complaint"
            helper={lang === 'ar' ? 'إذا ذكر العميل هذه الكلمات → يتم إبلاغ الفريق' : 'If customer mentions these → notify team'}
          />
          <Select
            label={lang === 'ar' ? 'تأخير الرد' : 'Response Delay'}
            value={responseDelay}
            onChange={e => setResponseDelay(e.target.value)}
            options={[
              { value: 'instant', label: lang === 'ar' ? 'فوري' : 'Instant' },
              { value: '1min',    label: lang === 'ar' ? 'دقيقة واحدة' : '1 minute' },
              { value: '3min',    label: lang === 'ar' ? '3 دقائق' : '3 minutes' },
            ]}
            helper={lang === 'ar' ? 'تأخير يجعل الرد يبدو أكثر طبيعية' : 'Delay makes replies feel more human'}
          />
        </div>
      </GlassCard>

      {/* Test Chat */}
      {showTestChat && (
        <GlassCard padding="md">
          <h3 className="text-sm font-semibold text-navy-800 m-0 mb-3">
            <span aria-hidden="true">🧪</span> {lang === 'ar' ? 'اختبار الذكاء الاصطناعي' : 'Test AI Responses'}
          </h3>
          <div className="max-h-[200px] overflow-auto mb-3 flex flex-col gap-2">
            {testMessages.map((m, i) => (
              <div
                key={i}
                className={[
                  'max-w-[80%] px-3 py-2 rounded-glass text-xs leading-relaxed',
                  m.role === 'user'
                    ? 'self-end bg-accent-cyan-600 text-white shadow-glass-sm'
                    : 'self-start bg-navy-50 ring-1 ring-navy-100 text-navy-800',
                ].join(' ')}
              >
                {m.content}
              </div>
            ))}
          </div>
          <Input
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            placeholder={lang === 'ar' ? 'اكتب رسالة تجريبية...' : 'Type a test message...'}
            aria-label={lang === 'ar' ? 'رسالة تجريبية' : 'Test message'}
            onKeyDown={async e => {
              if (e.key === 'Enter' && testInput.trim()) {
                const msg = testInput.trim(); setTestInput('')
                setTestMessages(prev => [...prev, { role: 'user', content: msg }])
                try {
                  const { callClaude, buildAutoReplySystem } = await import('../lib/ai')
                  const reply = await callClaude({ messages: [{ role: 'user', content: msg }], system: buildAutoReplySystem(knowledgeBase, personality, 'Test Customer'), maxTokens: 256 })
                  setTestMessages(prev => [...prev, { role: 'assistant', content: reply }])
                } catch { setTestMessages(prev => [...prev, { role: 'assistant', content: lang === 'ar' ? 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.' : 'An error occurred while contacting the AI service.' }]) }
              }
            }}
          />
        </GlassCard>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleSave}
          iconStart={saved ? Icons.check : undefined}
        >
          {saved ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!') : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}
        </Button>
      </div>
    </div>
  )
}

function IntegrationSettingsTab({ t, lang, dir, orgSettings = {}, onSave }) {
  void t
  void dir
  // Math.random() is impure during render; pin it to a useState lazy
  // initializer so the secret is generated exactly once per mount.
  const [defaultSecret] = useState(() => orgSettings.whatsapp_webhook_secret || 'velo_' + Math.random().toString(36).slice(2, 10))
  const [wa, setWa] = useState({ phone_id: orgSettings.whatsapp_phone_id || '', token: orgSettings.whatsapp_access_token || '', secret: orgSettings.whatsapp_webhook_secret || defaultSecret, waba_id: orgSettings.whatsapp_waba_id || '' })
  const [gmail, setGmail] = useState({ email: orgSettings.gmail_email || '' })
  const [meta, setMeta] = useState({ token: orgSettings.meta_access_token || '' })
  const [waStep, setWaStep] = useState(1)
  const [waTestResult, setWaTestResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : ''

  const handleSave = () => {
    if (onSave) onSave({ whatsapp_phone_id: wa.phone_id, whatsapp_access_token: wa.token, whatsapp_webhook_secret: wa.secret, whatsapp_waba_id: wa.waba_id, gmail_email: gmail.email, meta_access_token: meta.token })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const testWhatsApp = async () => {
    setWaTestResult('testing')
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${wa.phone_id}`, { headers: { Authorization: `Bearer ${wa.token}` } })
      if (res.ok) { setWaTestResult('success') } else { const d = await res.json(); setWaTestResult(d.error?.message || 'Failed') }
    } catch (e) { setWaTestResult(e.message) }
    setTimeout(() => setWaTestResult(null), 5000)
  }

  const Section = ({ title, icon, children }) => (
    <GlassCard padding="lg">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
        <h3 className="text-base font-semibold text-navy-800 m-0">{title}</h3>
      </div>
      {children}
    </GlassCard>
  )

  const WaStep = ({ num, title, children, active }) => (
    <div className={`py-4 border-b border-navy-100/80 last:border-b-0 transition-opacity duration-fast ${active ? '' : 'opacity-50'}`}>
      <div
        className={`flex items-center gap-2.5 cursor-pointer ${active ? 'mb-3' : ''}`}
        onClick={() => setWaStep(num)}
      >
        <div
          className={[
            'grid place-items-center w-7 h-7 rounded-full text-[12px] font-bold shrink-0 tabular-nums',
            waStep >= num ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-400',
          ].join(' ')}
          aria-hidden="true"
        >
          {waStep > num ? '✓' : num}
        </div>
        <span className={`text-[13px] font-semibold ${active ? 'text-navy-800' : 'text-navy-500'}`}>
          {title}
        </span>
      </div>
      {active && <div className="ps-[38px] mt-2 space-y-3">{children}</div>}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="bg-navy-50 border border-navy-100 rounded-glass px-4 py-3 text-[13px] text-navy-600">
        {lang === 'ar' ? 'أدر عمليات الدمج من صفحة عمليات الدمج.' : 'Manage integrations from the Integrations page.'}
      </div>
      {/* WhatsApp — Step by step */}
      <Section title="WhatsApp Cloud API" icon="💬">
        <WaStep num={1} title={lang === 'ar' ? 'إنشاء حساب Meta Business' : 'Create Meta Business Account'} active={waStep === 1}>
          <p className="text-xs text-navy-600 leading-relaxed m-0">
            {lang === 'ar' ? 'أنشئ حساب أعمال على Meta وقم بإعداد WhatsApp Cloud API' : 'Create a business account on Meta and set up WhatsApp Cloud API'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconStart={Icons.externalLink}
              onClick={() => window.open('https://business.facebook.com', '_blank', 'noopener,noreferrer')}
            >
              business.facebook.com
            </Button>
            <Button variant="primary" size="sm" onClick={() => setWaStep(2)}>
              {lang === 'ar' ? 'التالي' : 'Next'}
            </Button>
          </div>
        </WaStep>

        <WaStep num={2} title={lang === 'ar' ? 'رقم الهاتف' : 'Phone Number ID'} active={waStep === 2}>
          <Input
            label="Phone Number ID"
            value={wa.phone_id}
            onChange={e => setWa(p => ({ ...p, phone_id: e.target.value }))}
            placeholder="123456789012345"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setWaStep(3)}
            disabled={!wa.phone_id}
          >
            {lang === 'ar' ? 'التالي' : 'Next'}
          </Button>
        </WaStep>

        <WaStep num={3} title={lang === 'ar' ? 'رمز الوصول' : 'Access Token'} active={waStep === 3}>
          <Input
            label="Permanent Access Token"
            type="password"
            value={wa.token}
            onChange={e => setWa(p => ({ ...p, token: e.target.value }))}
            placeholder="EAAx..."
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setWaStep(4)}
            disabled={!wa.token}
          >
            {lang === 'ar' ? 'التالي' : 'Next'}
          </Button>
        </WaStep>

        <WaStep num={4} title={lang === 'ar' ? 'معرف حساب WhatsApp Business' : 'WABA ID'} active={waStep === 4}>
          <Input
            label="WhatsApp Business Account ID"
            value={wa.waba_id}
            onChange={e => setWa(p => ({ ...p, waba_id: e.target.value }))}
            placeholder="123456789012345"
          />
          <Button variant="primary" size="sm" onClick={() => setWaStep(5)}>
            {lang === 'ar' ? 'التالي' : 'Next'}
          </Button>
        </WaStep>

        <WaStep num={5} title={lang === 'ar' ? 'إعداد Webhook' : 'Webhook Setup'} active={waStep === 5}>
          <div className="bg-navy-50 border border-navy-100 rounded-glass p-3.5">
            <div className="text-[11px] text-navy-500 mb-1">Webhook URL</div>
            <div className="flex items-center gap-2">
              <code className="text-[12px] text-accent-cyan-700 font-mono break-all flex-1">
                {webhookUrl}
              </code>
              <Button
                variant="secondary"
                size="sm"
                iconStart={Icons.copy}
                onClick={() => navigator.clipboard?.writeText(webhookUrl)}
                aria-label={lang === 'ar' ? 'نسخ' : 'Copy'}
              />
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setWaStep(6)}>
            {lang === 'ar' ? 'التالي' : 'Next'}
          </Button>
        </WaStep>

        <WaStep num={6} title={lang === 'ar' ? 'رمز التحقق' : 'Verify Token'} active={waStep === 6}>
          <div className="bg-navy-50 border border-navy-100 rounded-glass p-3.5">
            <div className="text-[11px] text-navy-500 mb-1">
              Verify Token ({lang === 'ar' ? 'انسخه إلى Meta' : 'paste in Meta'})
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[12px] text-accent-cyan-700 font-mono flex-1">
                {wa.secret}
              </code>
              <Button
                variant="secondary"
                size="sm"
                iconStart={Icons.copy}
                onClick={() => navigator.clipboard?.writeText(wa.secret)}
                aria-label={lang === 'ar' ? 'نسخ' : 'Copy'}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={testWhatsApp}>
              {waTestResult === 'testing'
                ? '...'
                : waTestResult === 'success'
                  ? '✓ Connected'
                  : (lang === 'ar' ? 'اختبار الاتصال' : 'Test Connection')}
            </Button>
            {waTestResult && waTestResult !== 'testing' && waTestResult !== 'success' && (
              <span className="text-[11px] text-rose-600">{waTestResult}</span>
            )}
          </div>
        </WaStep>
      </Section>

      {/* Facebook / Instagram */}
      <Section title="Facebook & Instagram" icon="📱">
        <p className="text-[13px] text-navy-600 leading-relaxed m-0 mb-3">
          {lang === 'ar' ? 'اربط صفحة فيسبوك لتلقي رسائل Messenger و Instagram DM.' : 'Connect your Facebook Page to receive Messenger and Instagram DM messages.'}
        </p>
        <div className="mb-3">
          <Input
            label="Meta Access Token"
            type="password"
            value={meta.token}
            onChange={e => setMeta({ token: e.target.value })}
            placeholder="EAAx..."
          />
        </div>
      </Section>

      {/* Gmail */}
      <Section title="Gmail" icon="📧">
        <div className="mb-3">
          <Input
            label={lang === 'ar' ? 'بريد Gmail' : 'Connected Gmail'}
            value={gmail.email}
            onChange={e => setGmail({ email: e.target.value })}
            placeholder="your@gmail.com"
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleSave}
          iconStart={saved ? Icons.check : undefined}
        >
          {saved
            ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!')
            : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}
        </Button>
      </div>
    </div>
  )
}

// ─── Agency AI Settings (Super Admin Only) ──────────────────────────────────
function AgencyAITab({ lang }) {
  // Phase 4 moved the Anthropic key to the server-side ANTHROPIC_API_KEY env
  // var. The agency_settings table is gone. This tab is preserved as an
  // operator-only notice so the navigation doesn't 404 — there's nothing
  // to configure here from the UI anymore.
  const isRTL = lang === 'ar'
  return (
    <div className="space-y-5">
      <GlassCard padding="lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid place-items-center w-11 h-11 rounded-glass bg-accent-cyan-50 ring-1 ring-accent-cyan-100 shrink-0 text-accent-cyan-600" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-navy-800 m-0">
              {isRTL ? 'AI الوكالة' : 'Agency AI'}
            </h2>
            <p className="text-xs text-navy-600 m-0 mt-0.5">
              {isRTL ? 'يدار خادمياً' : 'Server-managed'}
            </p>
          </div>
        </div>
        <p className="text-sm text-navy-600 leading-relaxed m-0">
          {isRTL
            ? 'يتم تكوين ميزات الذكاء الاصطناعي عبر المتغير البيئي للخادم ANTHROPIC_API_KEY بواسطة المشغل. لم تعد هناك إعدادات قابلة للتعديل من واجهة المستخدم.'
            : 'AI features are configured by the operator via the server-side ANTHROPIC_API_KEY env var. Nothing is configurable from the UI anymore — contact support to enable or rotate the key.'}
        </p>
      </GlassCard>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// CLINIC TAB — Manage Doctors, Working Hours
// ═══════════════════════════════════════════════════════════════════════════
const WEEK_DAYS_EN = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday']
const WEEK_DAYS_AR = ['السبت','الاحد','الاثنين','الثلاثاء','الاربعاء','الخميس','الجمعة']

// Deterministic palette assignment for the avatar tint. The new `profiles`
// schema doesn't store a color column, but the doctor list looks dead
// without one — we hash the id so each doctor gets a stable shade.
const DOCTOR_PALETTE = ['#4DA6FF','#00FFB2','#a855f7','#f59e0b','#ef4444','#6366f1','#ec4899','#14b8a6']
function doctorTint(id) {
  const s = String(id || '')
  if (!s) return DOCTOR_PALETTE[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return DOCTOR_PALETTE[h % DOCTOR_PALETTE.length]
}

function ClinicTab({ lang, dir, isRTL, toast, setTab }) {
  void lang
  void dir
  const [doctors, setDoctors] = useState(() =>
    isSupabaseConfigured() ? [] : SAMPLE_DENTAL_DOCTORS
  )
  const [loading, setLoading] = useState(() => isSupabaseConfigured())
  const [editDoc, setEditDoc] = useState(null)
  const [showDocForm, setShowDocForm] = useState(false)
  const [workingHours, setWorkingHours] = useState(() => {
    try { return JSON.parse(localStorage.getItem('velo_clinic_hours') || 'null') } catch { return null }
  })

  const defaultHours = { open: '08:00', close: '21:00', daysOff: [6] }
  const hours = workingHours || defaultHours

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    ;(async () => {
      try {
        await getCurrentOrgId()
        await fetchAll()
      } catch {
        setLoading(false)
      }
    })()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const docs = await listDoctorsInOrg()
      setDoctors(docs)
    } catch (err) {
      console.error('[Settings] doctors fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  // Save the editable subset of profile fields. The new `profiles` table only
  // has full_name, avatar_url, locale that a clinic user can self-edit; role
  // and org_id are operator-managed (and the trigger blocks them anyway).
  const saveDoctor = async (form) => {
    if (!isSupabaseConfigured()) {
      toast?.(isRTL ? 'الوضع التجريبي: اتصل بـ Supabase لإدارة الأطباء' : 'Demo mode: connect Supabase to manage doctors', 'info')
      return
    }
    if (!editDoc?.id) return
    try {
      await updateProfile(editDoc.id, {
        full_name: form.full_name,
        avatar_url: form.avatar_url || null,
        locale: form.locale || null,
      })
      toast?.(isRTL ? 'تم تحديث الطبيب' : 'Doctor updated', 'success')
      setShowDocForm(false); setEditDoc(null)
      await fetchAll()
    } catch (err) {
      toast?.('Error: ' + err.message, 'error')
    }
  }

  const saveHours = (h) => {
    setWorkingHours(h)
    localStorage.setItem('velo_clinic_hours', JSON.stringify(h))
    toast?.('Working hours saved', 'success')
  }

  // "Add Doctor" → Team tab. The invitations flow assigns role='doctor' on
  // accept, then the new user shows up here automatically.
  const handleAddDoctor = () => {
    toast?.(
      isRTL
        ? 'الأطباء مستخدمو Velo — ادعهم من تبويب الفريق بدور "طبيب"'
        : 'Doctors are Velo users — invite them from the Team tab with role "Doctor"',
      'info'
    )
    if (setTab) setTab('team')
  }

  if (loading) {
    return (
      <GlassCard padding="lg" className="text-center">
        <p className="text-sm text-navy-500 m-0">Loading...</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-5">
      {/* Doctors */}
      <GlassCard padding="lg">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-navy-800 m-0">{isRTL ? 'الاطباء' : 'Doctors'}</h3>
            <p className="text-sm text-navy-600 leading-relaxed m-0 mt-1">
              {isRTL
                ? 'الأطباء مستخدمو Velo — ادعهم من تبويب الفريق بدور "طبيب"'
                : 'Doctors are Velo users — invite from the Team tab with role "Doctor"'}
            </p>
          </div>
          <Button variant="primary" onClick={handleAddDoctor} iconStart={Icons.users}>
            {isRTL ? 'تبويب الفريق' : 'Go to Team'}
          </Button>
        </div>

        {doctors.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-glass border border-dashed border-navy-200 text-sm text-navy-500 italic">
            {isRTL ? 'لا يوجد أطباء بعد. ادعهم من تبويب الفريق.' : 'No doctors yet — invite them from the Team tab.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {doctors.map(doc => {
              const tint = doctorTint(doc.id)
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3 rounded-glass bg-white/85 ring-1 ring-navy-100">
                  {doc.avatar_url ? (
                    <img src={doc.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="grid place-items-center w-10 h-10 rounded-full text-base font-bold shrink-0"
                      style={{ background: `${tint}20`, border: `2px solid ${tint}`, color: tint }}
                      aria-hidden="true"
                    >
                      {(doc.full_name || 'D').charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-800 truncate">{doc.full_name || '—'}</div>
                    <div className="text-[11px] text-navy-500 mt-0.5">
                      {ROLE_LABELS[isRTL ? 'ar' : 'en'].doctor}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditDoc(doc); setShowDocForm(true) }}
                    aria-label={isRTL ? 'تعديل' : 'Edit'}
                    className="grid place-items-center w-8 h-8 rounded-glass text-navy-500 hover:text-navy-700 hover:bg-navy-50 transition-colors duration-fast"
                  >
                    {Icons.edit(14)}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showDocForm && <DoctorForm doc={editDoc} onSave={saveDoctor} onCancel={() => { setShowDocForm(false); setEditDoc(null) }} isRTL={isRTL} toast={toast} />}
      </GlassCard>

      {/* Working Hours */}
      <GlassCard padding="lg">
        <h3 className="text-lg font-semibold text-navy-800 m-0 mb-4">{isRTL ? 'ساعات العمل' : 'Working Hours'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 max-w-md">
          <Input
            type="time"
            label={isRTL ? 'وقت الفتح' : 'Open Time'}
            value={hours.open}
            onChange={e => saveHours({ ...hours, open: e.target.value })}
          />
          <Input
            type="time"
            label={isRTL ? 'وقت الاغلاق' : 'Close Time'}
            value={hours.close}
            onChange={e => saveHours({ ...hours, close: e.target.value })}
          />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-500 mb-2.5">
          {isRTL ? 'ايام العطلة' : 'Days Off'}
        </div>
        <div className="flex flex-wrap gap-2">
          {(isRTL ? WEEK_DAYS_AR : WEEK_DAYS_EN).map((day, i) => {
            const isOff = hours.daysOff?.includes(i)
            return (
              <button
                key={i}
                type="button"
                aria-pressed={isOff}
                onClick={() => {
                  const next = isOff ? hours.daysOff.filter(d => d !== i) : [...(hours.daysOff || []), i]
                  saveHours({ ...hours, daysOff: next })
                }}
                className={[
                  'h-9 px-4 rounded-glass text-[13px] font-semibold cursor-pointer',
                  'transition-colors duration-fast ease-standard',
                  'focus-visible:outline-none focus-visible:shadow-focus-cyan',
                  isOff
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : 'bg-transparent text-navy-700 ring-1 ring-navy-100 hover:ring-navy-200 hover:bg-navy-50',
                ].join(' ')}
              >
                {day}
              </button>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}

// New profiles schema only allows clinic-side edits to full_name, avatar_url,
// and locale. Role / org_id are operator-managed and locked by trigger.
function PrescriptionTemplatePanel({ doctor, toast, isRTL }) {
  const [currentPath, setCurrentPath] = useState(null)
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const path = await fetchPrescriptionTemplatePath(doctor.id)
        if (cancelled) return
        setCurrentPath(path)
        if (path) {
          const url = await getPrescriptionTemplateSignedUrl(path)
          if (!cancelled) setSignedUrl(url)
        }
      } catch (err) {
        console.error('[PrescriptionTemplatePanel] fetch failed:', err)
        if (!cancelled && toast) toast(isRTL ? 'فشل تحميل القالب' : 'Failed to load template', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // toast/isRTL intentionally excluded from deps: refetching on
    // language change or parent re-render would re-run the network
    // call unnecessarily. Mount-time capture is correct here.
  }, [doctor.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSignedUrl = async (path) => {
    try {
      const url = await getPrescriptionTemplateSignedUrl(path)
      setSignedUrl(url)
    } catch (err) {
      console.error('[PrescriptionTemplatePanel] signed URL refresh failed:', err)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(true)
    try {
      const newPath = await uploadPrescriptionTemplate(doctor.id, file)
      setCurrentPath(newPath)
      await refreshSignedUrl(newPath)
      if (toast) toast(isRTL ? 'تم تحميل القالب' : 'Template uploaded', 'success')
    } catch (err) {
      console.error('[PrescriptionTemplatePanel] upload failed:', err)
      if (toast) toast(err?.message || (isRTL ? 'فشل التحميل' : 'Upload failed'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleConfirmRemove = async () => {
    setUploading(true)
    try {
      await deletePrescriptionTemplate(doctor.id)
      setCurrentPath(null)
      setSignedUrl(null)
      setConfirmingRemove(false)
      if (toast) toast(isRTL ? 'تم حذف القالب' : 'Template removed', 'success')
    } catch (err) {
      console.error('[PrescriptionTemplatePanel] delete failed:', err)
      if (toast) toast(err?.message || (isRTL ? 'فشل الحذف' : 'Remove failed'), 'error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-navy-500">
        {isRTL ? 'جارٍ التحميل…' : 'Loading…'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />

      {!currentPath && (
        <div className="text-center py-6">
          <Button
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? (isRTL ? 'جارٍ التحميل…' : 'Uploading…')
              : (isRTL ? 'تحميل PNG أو JPG' : 'Upload PNG or JPG')}
          </Button>
          <p className="text-[11px] text-navy-500 mt-3 m-0">
            {isRTL
              ? '5 ميجابايت كحد أقصى. الموصى به: 2480×3508 (A4 بدقة 300 DPI).'
              : '5 MB max. Recommended 2480×3508 (A4 @ 300 DPI).'}
          </p>
        </div>
      )}

      {currentPath && (
        <div className="flex gap-4 items-start">
          <div className="w-32 h-44 rounded-glass overflow-hidden bg-navy-50 ring-1 ring-navy-100 shrink-0 grid place-items-center">
            {signedUrl ? (
              <img src={signedUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[11px] text-navy-400">
                {isRTL ? 'لا توجد معاينة' : 'No preview'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-navy-700 m-0 mb-3">
              {isRTL ? 'القالب الحالي' : 'Current template'}
            </p>
            {!confirmingRemove && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? (isRTL ? 'جارٍ التحميل…' : 'Uploading…')
                    : (isRTL ? 'استبدال' : 'Replace')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingRemove(true)}
                  disabled={uploading}
                >
                  {isRTL ? 'حذف' : 'Remove'}
                </Button>
              </div>
            )}
            {confirmingRemove && (
              <div className="rounded-glass bg-red-50/60 ring-1 ring-red-100 p-3">
                <p className="text-[13px] text-navy-800 m-0 mb-2">
                  {isRTL
                    ? 'هل تريد حذف قالب الوصفة؟ سيحتاج الطبيب إلى إعادة التحميل لطباعة الوصفات.'
                    : 'Remove prescription template? The doctor will need to re-upload to print prescriptions.'}
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={uploading}
                  >
                    {isRTL ? 'الغاء' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmRemove}
                    disabled={uploading}
                  >
                    {uploading
                      ? (isRTL ? 'جارٍ الحذف…' : 'Removing…')
                      : (isRTL ? 'تأكيد الحذف' : 'Confirm Remove')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


function DoctorForm({ doc, onSave, onCancel, dir, isRTL, toast }) {
  void dir
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    full_name: doc?.full_name || '',
    avatar_url: doc?.avatar_url || '',
    locale: doc?.locale || '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="mt-4 p-5 rounded-glass bg-navy-50/40 ring-1 ring-navy-100">
      <div className="flex gap-1 mb-5 p-1 rounded-lg bg-white/40">
        {[
          { id: 'profile',  label: isRTL ? 'الملف الشخصي' : 'Profile' },
          { id: 'template', label: isRTL ? 'قالب الوصفة' : 'Prescription Template' },
        ].map(t => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex-1 py-2 px-3 rounded-md cursor-pointer border-0',
                'text-[13px] transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:shadow-focus-cyan',
                isActive
                  ? 'bg-white/80 text-navy-900 font-semibold ring-1 ring-navy-100 shadow-glass-sm'
                  : 'bg-transparent text-navy-600 font-medium hover:bg-navy-50/70 hover:text-navy-800',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input
              label={isRTL ? 'الاسم' : 'Name'}
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Dr. ..."
            />
            <Select
              label={isRTL ? 'اللغة' : 'Locale'}
              value={form.locale}
              onChange={e => set('locale', e.target.value)}
              options={[
                { value: '',   label: isRTL ? '— تلقائي —' : '— Auto —' },
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
              ]}
            />
          </div>
          <div className="mb-3">
            <Input
              label={isRTL ? 'رابط الصورة' : 'Avatar URL'}
              value={form.avatar_url}
              onChange={e => set('avatar_url', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <p className="text-[11px] text-navy-500 italic m-0 mb-4">
            {isRTL
              ? 'يتم إدارة الدور (طبيب / موظف استقبال) من قبل المشغل، لا يمكن تعديله من هنا.'
              : 'Role (doctor / receptionist / etc.) is operator-managed and cannot be changed from this form.'}
          </p>
        </>
      )}

      {tab === 'template' && (
        <PrescriptionTemplatePanel doctor={doc} toast={toast} isRTL={isRTL} />
      )}

      <div className="flex gap-2 justify-end mt-4">
        <Button variant="secondary" onClick={onCancel}>
          {isRTL ? 'الغاء' : 'Cancel'}
        </Button>
        {tab === 'profile' && (
          <Button
            variant="primary"
            onClick={() => { if (form.full_name.trim()) onSave(form) }}
            disabled={!form.full_name.trim()}
          >
            {isRTL ? 'تحديث' : 'Update'}
          </Button>
        )}
      </div>
    </div>
  )
}

