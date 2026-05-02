import { useState, useRef, useEffect } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Toggle, FormField, inputStyle, selectStyle } from '../components/shared'
import { sanitizeName, isValidEmail } from '../lib/sanitize'
import { isSupabaseConfigured } from '../lib/supabase'
import { createInvitation, listPendingInvitations, revokeInvitation, buildInviteUrl } from '../lib/invitations'
import { listDoctorsInOrg, updateProfile, listTeamMembersInOrg, fetchMyProfile } from '../lib/profiles'
import { getCurrentOrgId } from '../lib/auth_session'

import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/permissions'
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

const INDUSTRIES = [
  { id: 'general', icon: '🏢', en: 'General Business', ar: 'أعمال عامة' },
  { id: 'dental', icon: '🦷', en: 'Dental Clinic', ar: 'عيادة أسنان' },
  { id: 'real_estate', icon: '🏠', en: 'Real Estate', ar: 'عقارات' },
  { id: 'beauty', icon: '💅', en: 'Beauty & Spa', ar: 'تجميل وسبا' },
  { id: 'legal', icon: '⚖️', en: 'Legal Services', ar: 'خدمات قانونية' },
  { id: 'restaurant', icon: '🍽️', en: 'Restaurant', ar: 'مطعم' },
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
    <div dir={dir} style={{ direction: dir }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'rgb(var(--velo-text-primary))', margin: '0 0 24px' }}>{t.settings}</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar tabs */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ ...card, padding: 8 }}>
            {visibleTabs.map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                className="tab-button"
                data-active={tab === tb.id}
                aria-current={tab === tb.id ? 'page' : undefined}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: tab === tb.id ? 'rgb(var(--velo-accent-subtle))' : undefined, color: tab === tb.id ? 'rgb(var(--velo-accent-fg))' : 'rgb(var(--velo-text-secondary))', cursor: 'pointer', fontSize: 13, fontWeight: tab === tb.id ? 600 : 500, fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', transition: 'background-color .15s, color .15s' }}>
                <span style={{ color: tab === tb.id ? 'rgb(var(--velo-accent-fg))' : 'rgb(var(--velo-text-tertiary))', display: 'flex' }}>{tb.icon(18)}</span>
                {tabLabels[tb.id]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1 }} className="fade-in" key={tab}>
          {tab === 'organization' && <OrganizationTab t={t} lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} onSave={onSaveOrgSettings} />}
          {tab === 'clinic' && <ClinicTab lang={lang} dir={dir} isRTL={isRTL} toast={toast} setTab={setTab} />}
          {tab === 'profile' && <ProfileTab t={t} lang={lang} dir={dir} isRTL={isRTL} user={user} />}
          {tab === 'team' && <TeamTab t={t} lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} toast={toast} />}
          {tab === 'notifications' && <NotificationsTab t={t} lang={lang} dir={dir} />}
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

  return (
    <div>
      {/* Company Info */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 20px' }}>{lang === 'ar' ? 'معلومات المؤسسة' : 'Organization Info'}</h2>

        {/* Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${form.primary_color}, #8250DF)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, flexShrink: 0 }}>
            {(form.name || 'V').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <FormField label={lang === 'ar' ? 'اسم الشركة' : 'Company Name'} dir={dir}>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={lang === 'ar' ? 'اسم شركتك' : 'Your company name'} style={inputStyle(dir)} />
            </FormField>
          </div>
        </div>

        {/* Industry */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 10 }}>{lang === 'ar' ? 'مجال العمل' : 'Industry'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {INDUSTRIES.map(ind => {
              const active = form.industry === ind.id
              return (
                <button key={ind.id} onClick={() => set('industry', ind.id)} style={{
                  padding: '14px 10px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
                  border: active ? `2px solid ${form.primary_color}` : `1px solid ${C.border}`,
                  background: active ? `${form.primary_color}10` : C.white,
                  transition: 'all .15s',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{ind.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: active ? form.primary_color : C.text }}>{lang === 'ar' ? ind.ar : ind.en}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Brand Color */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>{lang === 'ar' ? 'لون العلامة التجارية' : 'Brand Color'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {BRAND_COLORS.map(c => (
              <button key={c} onClick={() => set('primary_color', c)} style={{
                width: 32, height: 32, borderRadius: 8, background: c, cursor: 'pointer', padding: 0,
                border: form.primary_color === c ? '3px solid #1F2328' : '3px solid transparent',
                transition: 'border-color .15s',
              }} />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <FormField label={lang === 'ar' ? 'العملة' : 'Currency'} dir={dir}>
            <select value={form.currency} onChange={e => set('currency', e.target.value)} style={selectStyle(dir)}>
              {CURRENCIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </FormField>
          <FormField label={lang === 'ar' ? 'المنطقة الزمنية' : 'Timezone'} dir={dir}>
            <select value={form.timezone} onChange={e => set('timezone', e.target.value)} style={selectStyle(dir)}>
              {['America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Asia/Dubai','Asia/Riyadh','Asia/Baghdad','Asia/Seoul'].map(tz =>
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              )}
            </select>
          </FormField>
        </div>
      </div>

      {/* Industry note */}
      {form.industry === 'dental' && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(0,255,178,0.08)', border: '1px solid #54AEFF44', marginBottom: 20, fontSize: 13, color: '#00FFB2', lineHeight: 1.5 }}>
          🦷 {lang === 'ar' ? 'وضع عيادة الأسنان مفعّل — ستظهر "المرضى" بدلاً من "جهات الاتصال" مع تبويبات المخطط الطبي والعلاجات والأشعة.' : 'Dental mode active — "Patients" replaces "Contacts" with Medical History, Dental Chart, Treatments, Prescriptions, and X-Rays tabs.'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} style={makeBtn(saved ? 'success' : 'primary', { gap: 6 })}>
          {saved ? Icons.check(14) : null} {saved ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!') : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}
        </button>
      </div>
    </div>
  )
}

function ProfileTab({ t, lang, dir, isRTL, user }) {
  void isRTL
  const [form, setForm] = useState({
    fullName: user?.user_metadata?.full_name || 'Admin User',
    email: user?.email || 'admin@velo.app',
    phone: '+1 (555) 000-0000',
    jobTitle: lang === 'ar' ? 'مدير المبيعات' : 'Sales Manager',
    language: lang,
    timezone: 'America/New_York',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fileRef = useRef(null)

  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 24px' }}>{t.profile}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, #8250DF)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>
          {form.fullName.charAt(0)}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={makeBtn('secondary', { fontSize: 12 })}>{Icons.upload(13)} {t.changePhoto}</button>
          <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>JPG, PNG. Max 2MB</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FormField label={t.fullName} dir={dir}><input value={form.fullName} onChange={e => set('fullName', e.target.value)} style={inputStyle(dir)} /></FormField>
        <FormField label={t.emailAddress} dir={dir}><input value={form.email} onChange={e => set('email', e.target.value)} type="email" style={inputStyle(dir)} /></FormField>
        <FormField label={t.phoneNumber} dir={dir}><input value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle(dir)} /></FormField>
        <FormField label={t.jobTitle} dir={dir}><input value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} style={inputStyle(dir)} /></FormField>
        <FormField label={t.language} dir={dir}>
          <select value={form.language} onChange={e => set('language', e.target.value)} style={selectStyle(dir)}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </FormField>
        <FormField label={t.timezone} dir={dir}>
          <select value={form.timezone} onChange={e => set('timezone', e.target.value)} style={selectStyle(dir)}>
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="Europe/London">London (GMT)</option>
            <option value="Asia/Dubai">Dubai (GST)</option>
            <option value="Asia/Riyadh">Riyadh (AST)</option>
            <option value="Asia/Seoul">Seoul (KST)</option>
          </select>
        </FormField>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="velo-btn-primary" style={makeBtn('primary')}>{t.saveChanges}</button>
      </div>
    </div>
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
    return <p style={{ color: C.textMuted, fontSize: 13 }}>{isRTL ? 'جاري التحميل...' : 'Loading…'}</p>
  }

  return (
    <div>
      {/* Owner-gated invite form */}
      {isOwner ? (
        <div style={{ ...card, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{t.inviteMember}</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              type="email"
              maxLength={255}
              placeholder="email@company.com"
              style={{ ...inputStyle(dir), flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && invite()}
            />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...selectStyle(dir), width: 160 }}>
              {INVITABLE_ROLES.map(r => (
                <option key={r} value={r}>
                  {(ROLE_LABELS[lang] || ROLE_LABELS.en)[r] || r}
                </option>
              ))}
            </select>
            <button
              onClick={invite}
              disabled={inviting}
              className="velo-btn-primary"
              style={{ ...makeBtn('primary'), opacity: inviting ? 0.6 : 1, cursor: inviting ? 'wait' : 'pointer' }}
            >
              {inviting ? '…' : t.inviteMember}
            </button>
          </div>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '10px 0 0' }}>
            <strong style={{ color: C.textSec }}>
              {(ROLE_LABELS[lang] || ROLE_LABELS.en)[inviteRole] || inviteRole}
            </strong>
            {(ROLE_DESCRIPTIONS[lang] || ROLE_DESCRIPTIONS.en)[inviteRole]
              ? ' — ' + (ROLE_DESCRIPTIONS[lang] || ROLE_DESCRIPTIONS.en)[inviteRole]
              : ''}
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '6px 0 0' }}>
            {isRTL
              ? 'سيتم إنشاء رابط دعوة يمكنك نسخه وإرساله يدوياً (واتساب، بريد إلكتروني). صالح 7 أيام.'
              : 'Generates a copyable invite link you can send manually (WhatsApp, SMS, email). Expires in 7 days.'}
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            {isRTL
              ? 'إدارة الفريق متاحة لمالكي العيادة فقط.'
              : 'Team management is available to clinic owners.'}
          </p>
        </div>
      )}

      {/* Invite link modal — owner only (only shown after a successful create) */}
      {isOwner && inviteLink && (
        <div
          onClick={() => setInviteLink(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ ...card, padding: 24, maxWidth: 560, width: '100%', direction: dir }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
              {isRTL ? 'رابط الدعوة جاهز' : 'Invitation link ready'}
            </h3>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 14px' }}>
              {isRTL
                ? `أرسل هذا الرابط إلى ${inviteLink.email} عبر واتساب أو الرسائل أو البريد الإلكتروني. صالح لمدة 7 أيام.`
                : `Share this link with ${inviteLink.email} via WhatsApp, SMS, or email. The link expires in 7 days.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="velo-invite-link-input"
                readOnly
                value={inviteLink.url}
                onFocus={e => e.target.select()}
                style={{ ...inputStyle(dir), flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
              <button onClick={copyLink} className="velo-btn-primary" style={makeBtn('primary')}>
                {copied ? (isRTL ? 'تم النسخ' : 'Copied!') : (isRTL ? 'نسخ' : 'Copy')}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setInviteLink(null)} style={makeBtn('secondary')}>
                {isRTL ? 'إغلاق' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending invitations — owner only */}
      {isOwner && pending.length > 0 && (
        <div style={{ ...card, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
              {isRTL ? `دعوات معلقة (${pending.length})` : `Pending invitations (${pending.length})`}
            </h3>
          </div>
          {pending.map(inv => {
            const url = buildInviteUrl(inv.token)
            const expires = inv.expires_at ? new Date(inv.expires_at).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', { month: 'short', day: 'numeric' }) : ''
            return (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, color: C.textSec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{(inv.email || '?').charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inv.email}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(ROLE_LABELS[lang] || ROLE_LABELS.en)[inv.role] || inv.role}
                    {expires ? ` · ${isRTL ? 'تنتهي' : 'expires'} ${expires}` : ''}
                  </div>
                </div>
                <button onClick={() => setInviteLink({ url, email: inv.email })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.primary, fontSize: 12, fontFamily: 'inherit', fontWeight: 600 }}>
                  {isRTL ? 'نسخ الرابط' : 'Copy link'}
                </button>
                <button onClick={() => revoke(inv.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, display: 'flex' }} title={isRTL ? 'إلغاء' : 'Revoke'}>
                  {Icons.trash(14)}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Team list — visible to everyone in the org */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
            {t.teamMembers} ({team.length})
          </h3>
        </div>
        {team.map(member => (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
              {member.avatar}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{member.name}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
              background: member.role === 'owner' ? C.primaryBg : C.bg,
              color: member.role === 'owner' ? C.primary : C.textSec,
            }}>
              {(ROLE_LABELS[lang] || ROLE_LABELS.en)[member.role] || member.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NotificationsTab({ t, lang, dir }) {
  void dir
  const [notifs, setNotifs] = useState({
    emailNotif: true, whatsappNotif: false, browserNotif: true,
    dealUpdates: true, contactActivity: true, ticketUpdates: true,
    weeklyDigest: true, systemAlerts: true, smsAlerts: false,
  })
  const toggle = (k) => setNotifs(p => ({ ...p, [k]: !p[k] }))

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
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 24px' }}>{t.notifications}</h2>
      {sections.map((sec, si) => (
        <div key={si} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: C.textSec, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '.5px' }}>{sec.title}</h3>
          {sec.items.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.text }}>{item.label}</span>
              <Toggle value={notifs[item.key]} onChange={() => toggle(item.key)} />
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="velo-btn-primary" style={makeBtn('primary')}>{t.saveChanges}</button>
      </div>
    </div>
  )
}

function BillingTab({ t, lang, dir }) {
  void dir
  const invoices = [
    { id: 'inv1', date: 'Apr 1, 2026', amount: '$49.00', status: 'Paid' },
    { id: 'inv2', date: 'Mar 1, 2026', amount: '$49.00', status: 'Paid' },
    { id: 'inv3', date: 'Feb 1, 2026', amount: '$49.00', status: 'Paid' },
  ]

  return (
    <div>
      {/* Current plan */}
      <div style={{ ...card, padding: 24, marginBottom: 20, background: `linear-gradient(135deg, ${C.primary}08, #8250DF08)`, border: `1px solid ${C.primary}22` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: C.primaryBg, color: C.primary }}>{t.proPlanBadge || 'Pro Plan'}</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{t.currentPlan}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>$49<span style={{ fontSize: 14, fontWeight: 500, color: C.textMuted }}>{t.perMonth}</span></div>
          </div>
          <button className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>{Icons.trendUp(14)} {t.upgradeNow}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 20 }}>
          {[
            { label: t.contacts_used, used: 248, total: 1000 },
            { label: t.appointments_used || (lang === 'ar' ? 'المواعيد' : 'Appointments'), used: 34, total: 100 },
            { label: t.storage_used, used: 1.2, total: 5, unit: 'GB' },
          ].map((u, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                <span>{u.label}</span><span>{u.unit ? `${u.used}${u.unit}` : u.used} / {u.unit ? `${u.total}${u.unit}` : u.total}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: `${C.primary}22` }}>
                <div style={{ height: '100%', borderRadius: 3, background: C.primary, width: `${(u.used / u.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice history */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{lang === 'ar' ? 'سجل الفواتير' : 'Invoice History'}</h3>
        </div>
        {invoices.map(inv => (
          <div key={inv.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, gap: 16 }}>
            <span style={{ fontSize: 13, color: C.textSec, flex: 1 }}>{inv.date}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inv.amount}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,255,136,0.1)', color: '#00ff88' }}>{inv.status}</span>
            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.primary, fontSize: 12, fontFamily: 'inherit' }}>{Icons.download(13)}</button>
          </div>
        ))}
      </div>
    </div>
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
    <div>
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.primary}, #8250DF)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
              {ar ? 'بيانات الاعتماد يديرها المشغّل' : 'Credentials are managed by the operator'}
            </h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0' }}>
              {ar ? 'لم تعد العيادات تخزن مفاتيح API محلياً' : 'Clinics no longer store API keys locally'}
            </p>
          </div>
        </div>

        <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: '0 0 12px' }}>
          {ar
            ? 'تتم إدارة ميزات الذكاء الاصطناعي و WhatsApp والتكاملات الأخرى بواسطة المشغل. تواصل مع المشغل لتفعيل أي ميزة لهذه العيادة.'
            : 'AI features, WhatsApp, and other integrations are configured by the operator. Contact the operator to enable AI for this clinic.'}
        </p>

        {operatorContact ? (
          <a
            href={operatorContact}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8, marginTop: 4,
              background: C.primary, color: '#07080E',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            {ar ? 'تواصل مع المشغل' : 'Contact the operator'}
          </a>
        ) : (
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#D29922', fontSize: 12,
          }}>
            {ar
              ? 'لم يتم إعداد جهة اتصال المشغل بعد.'
              : 'Operator contact has not been configured yet.'}
          </div>
        )}
      </div>
    </div>
  )
}

function AISettingsTab({ t, lang, dir, orgSettings = {}, onSave }) {
  void t
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

  return (
    <div>
      {/* Header — credentials are operator-managed now (Phase 4) */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, #8250DF)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{lang === 'ar' ? 'إعدادات الذكاء الاصطناعي' : 'AI Agent Settings'}</h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Powered by Claude (Anthropic)</p>
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
          {lang === 'ar'
            ? 'يقوم المشغّل بإدارة بيانات اعتماد Anthropic. الإعدادات أدناه (الشخصية، قاعدة المعرفة، القنوات، ساعات العمل) تُحفظ على مستوى العيادة وتُمرَّر إلى الخادم عند الرد التلقائي.'
            : 'Anthropic credentials are managed by the operator. The settings below (personality, knowledge base, channels, working hours) are saved per-clinic and forwarded to the server when auto-replies fire.'}
        </p>
      </div>

      {/* Personality */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>{lang === 'ar' ? 'شخصية الرد' : 'AI Personality'}</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ id: 'professional', l: lang === 'ar' ? 'مهني' : 'Professional', i: '👔' }, { id: 'friendly', l: lang === 'ar' ? 'ودود' : 'Friendly', i: '😊' }, { id: 'formal', l: lang === 'ar' ? 'رسمي' : 'Formal', i: '📋' }].map(p => (
            <button key={p.id} onClick={() => setPersonality(p.id)} style={{ flex: 1, padding: '16px 12px', borderRadius: 12, border: personality === p.id ? `2px solid ${C.primary}` : `1px solid ${C.border}`, background: personality === p.id ? C.primaryBg : C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{p.i}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: personality === p.id ? C.primary : C.text }}>{p.l}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Channels + Working Hours */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ ...card, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>{lang === 'ar' ? 'القنوات المفعّلة' : 'Enabled Channels'}</h3>
          {Object.entries(channels).map(([ch, on]) => (
            <div key={ch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.text, textTransform: 'capitalize' }}>{ch}</span>
              <Toggle value={on} onChange={() => setChannels(p => ({ ...p, [ch]: !p[ch] }))} />
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>{lang === 'ar' ? 'ساعات العمل' : 'Working Hours'}</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: C.text }}>{lang === 'ar' ? 'نشط دائماً' : 'Always Active'}</span>
            <Toggle value={workingHours.always_on} onChange={() => setWorkingHours(p => ({ ...p, always_on: !p.always_on }))} />
          </div>
          {!workingHours.always_on && (
            <div style={{ display: 'flex', gap: 12 }}>
              <FormField label={lang === 'ar' ? 'من' : 'From'} dir={dir}><input type="time" value={workingHours.start} onChange={e => setWorkingHours(p => ({ ...p, start: e.target.value }))} style={inputStyle(dir)} /></FormField>
              <FormField label={lang === 'ar' ? 'إلى' : 'To'} dir={dir}><input type="time" value={workingHours.end} onChange={e => setWorkingHours(p => ({ ...p, end: e.target.value }))} style={inputStyle(dir)} /></FormField>
            </div>
          )}
        </div>
      </div>

      {/* Knowledge Base */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{lang === 'ar' ? 'قاعدة المعرفة' : 'Knowledge Base'}</h3>
          <div style={{ display:'flex', gap:6 }}>
            <input ref={fileRef} type="file" accept=".txt,.pdf,.md,.docx" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button type="button" onClick={() => fileRef.current?.click()} style={makeBtn('secondary', { fontSize: 12, gap: 4 })}>{Icons.upload(13)} {lang === 'ar' ? 'رفع ملف' : 'Upload File'}</button>
            <button type="button" onClick={() => setShowTestChat(!showTestChat)} style={makeBtn('secondary', { fontSize: 12, gap: 4 })}>🧪 {lang === 'ar' ? 'اختبار' : 'Test AI'}</button>
          </div>
        </div>
        {/* Uploaded files list */}
        {kbFiles.length > 0 && (
          <div style={{ marginBottom:12, display:'flex', gap:6, flexWrap:'wrap' }}>
            {kbFiles.map((f,i) => (
              <span key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, padding:'4px 8px', borderRadius:6, background:C.bg, border:`1px solid ${C.border}`, color:C.textSec }}>
                📄 {f.name}
                <button type="button" onClick={()=>{const next=kbFiles.filter((_,j)=>j!==i); setKbFiles(next); localStorage.setItem('velo_kb_files',JSON.stringify(next))}} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, fontSize:12, padding:0 }}>&times;</button>
              </span>
            ))}
          </div>
        )}
        <textarea value={knowledgeBase} onChange={e => setKnowledgeBase(e.target.value)} rows={6} placeholder={lang === 'ar' ? 'الصق نص الأسئلة الشائعة أو معلومات المنتج هنا...' : 'Paste FAQ text or product information here...'} style={{ ...inputStyle(dir), resize: 'vertical', lineHeight: 1.6 }} />
        <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>{lang === 'ar' ? 'سيستخدم الذكاء الاصطناعي هذه المعلومات للرد على العملاء' : 'AI will use this information to answer customer questions'}</p>
      </div>

      {/* Auto-Reply Configuration */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>{lang === 'ar' ? 'إعدادات الرد التلقائي' : 'Auto-Reply Settings'}</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
          <FormField label={lang === 'ar' ? 'كلمات التصعيد' : 'Escalation Keywords'} dir={dir}>
            <input value={escalationKeywords} onChange={e=>setEscalationKeywords(e.target.value)} placeholder="urgent, help, complaint" style={inputStyle(dir)} />
            <p style={{ fontSize:10, color:C.textMuted, marginTop:4 }}>{lang === 'ar' ? 'إذا ذكر العميل هذه الكلمات → يتم إبلاغ الفريق' : 'If customer mentions these → notify team'}</p>
          </FormField>
          <FormField label={lang === 'ar' ? 'تأخير الرد' : 'Response Delay'} dir={dir}>
            <select value={responseDelay} onChange={e=>setResponseDelay(e.target.value)} style={selectStyle(dir)}>
              <option value="instant">{lang === 'ar' ? 'فوري' : 'Instant'}</option>
              <option value="1min">{lang === 'ar' ? 'دقيقة واحدة' : '1 minute'}</option>
              <option value="3min">{lang === 'ar' ? '3 دقائق' : '3 minutes'}</option>
            </select>
            <p style={{ fontSize:10, color:C.textMuted, marginTop:4 }}>{lang === 'ar' ? 'تأخير يجعل الرد يبدو أكثر طبيعية' : 'Delay makes replies feel more human'}</p>
          </FormField>
        </div>
      </div>

      {/* Test Chat */}
      {showTestChat && (
        <div style={{ ...card, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>🧪 {lang === 'ar' ? 'اختبار الذكاء الاصطناعي' : 'Test AI Responses'}</h3>
          <div style={{ maxHeight:200, overflow:'auto', marginBottom:12, display:'flex', flexDirection:'column', gap:8 }}>
            {testMessages.map((m,i) => (
              <div key={i} style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start' }}>
                <div style={{ maxWidth:'80%', padding:'8px 12px', borderRadius:10, background:m.role==='user'?C.primary:C.bg, color:m.role==='user'?'#fff':C.text, fontSize:12, lineHeight:1.5 }}>{m.content}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={testInput} onChange={e=>setTestInput(e.target.value)} placeholder={lang === 'ar' ? 'اكتب رسالة تجريبية...' : 'Type a test message...'} style={{ ...inputStyle(dir), flex:1 }}
              onKeyDown={async e => {
                if(e.key==='Enter'&&testInput.trim()) {
                  const msg = testInput.trim(); setTestInput('')
                  setTestMessages(prev=>[...prev, {role:'user',content:msg}])
                  try {
                    const { callClaude, buildAutoReplySystem } = await import('../lib/ai')
                    const reply = await callClaude({ messages:[{role:'user',content:msg}], system: buildAutoReplySystem(knowledgeBase, personality, 'Test Customer'), maxTokens:256 })
                    setTestMessages(prev=>[...prev, {role:'assistant',content:reply}])
                  } catch { setTestMessages(prev=>[...prev, {role:'assistant',content: lang === 'ar' ? 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.' : 'An error occurred while contacting the AI service.'}]) }
                }
              }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={handleSave} style={makeBtn(saved ? 'success' : 'primary', { gap: 6 })}>{saved ? Icons.check(14) : null} {saved ? (lang === 'ar' ? 'تم الحفظ!' : 'Saved!') : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}</button>
      </div>
    </div>
  )
}

function IntegrationSettingsTab({ t, lang, dir, orgSettings = {}, onSave }) {
  void t
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
    <div style={{ ...card, padding: 24, marginBottom: 20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}><span style={{ fontSize:24 }}>{icon}</span><h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:0 }}>{title}</h3></div>
      {children}
    </div>
  )

  const WaStep = ({ num, title, children, active }) => (
    <div style={{ padding:'16px 0', borderBottom:`1px solid ${C.border}`, opacity: active?1:.5 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: active?12:0, cursor:'pointer' }} onClick={()=>setWaStep(num)}>
        <div style={{ width:28, height:28, borderRadius:'50%', background: waStep>=num?C.primary:C.bg, color: waStep>=num?'#fff':C.textMuted, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>{waStep>num?'✓':num}</div>
        <span style={{ fontSize:13, fontWeight:600, color: active?C.text:C.textSec }}>{title}</span>
      </div>
      {active && <div style={{ paddingLeft:38 }}>{children}</div>}
    </div>
  )

  return (
    <div>
      {/* WhatsApp — Step by step */}
      <Section title="WhatsApp Cloud API" icon="💬">
        <WaStep num={1} title={lang==='ar'?'إنشاء حساب Meta Business':'Create Meta Business Account'} active={waStep===1}>
          <p style={{ fontSize:12, color:C.textSec, lineHeight:1.6, marginBottom:8 }}>{lang==='ar'?'أنشئ حساب أعمال على Meta وقم بإعداد WhatsApp Cloud API':'Create a business account on Meta and set up WhatsApp Cloud API'}</p>
          <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" style={{ ...makeBtn('secondary',{gap:6,fontSize:12}), textDecoration:'none', display:'inline-flex' }}>{Icons.externalLink(13)} business.facebook.com</a>
          <button type="button" onClick={()=>setWaStep(2)} className="velo-btn-primary" style={{ ...makeBtn('primary',{fontSize:12}), marginLeft:8 }}>{lang==='ar'?'التالي':'Next'}</button>
        </WaStep>
        <WaStep num={2} title={lang==='ar'?'رقم الهاتف':'Phone Number ID'} active={waStep===2}>
          <FormField label="Phone Number ID" dir={dir}><input value={wa.phone_id} onChange={e=>setWa(p=>({...p,phone_id:e.target.value}))} placeholder="123456789012345" style={inputStyle(dir)} /></FormField>
          <button type="button" onClick={()=>setWaStep(3)} disabled={!wa.phone_id} className="velo-btn-primary" style={makeBtn('primary',{fontSize:12})}>{lang==='ar'?'التالي':'Next'}</button>
        </WaStep>
        <WaStep num={3} title={lang==='ar'?'رمز الوصول':'Access Token'} active={waStep===3}>
          <FormField label="Permanent Access Token" dir={dir}><input value={wa.token} onChange={e=>setWa(p=>({...p,token:e.target.value}))} type="password" placeholder="EAAx..." style={inputStyle(dir)} /></FormField>
          <button type="button" onClick={()=>setWaStep(4)} disabled={!wa.token} className="velo-btn-primary" style={makeBtn('primary',{fontSize:12})}>{lang==='ar'?'التالي':'Next'}</button>
        </WaStep>
        <WaStep num={4} title={lang==='ar'?'معرف حساب WhatsApp Business':'WABA ID'} active={waStep===4}>
          <FormField label="WhatsApp Business Account ID" dir={dir}><input value={wa.waba_id} onChange={e=>setWa(p=>({...p,waba_id:e.target.value}))} placeholder="123456789012345" style={inputStyle(dir)} /></FormField>
          <button type="button" onClick={()=>setWaStep(5)} className="velo-btn-primary" style={makeBtn('primary',{fontSize:12})}>{lang==='ar'?'التالي':'Next'}</button>
        </WaStep>
        <WaStep num={5} title={lang==='ar'?'إعداد Webhook':'Webhook Setup'} active={waStep===5}>
          <div style={{ padding:'10px 14px', borderRadius:8, background:C.bg, border:`1px solid ${C.border}`, marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>Webhook URL</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <code style={{ fontSize:12, color:C.primary, flex:1, wordBreak:'break-all' }}>{webhookUrl}</code>
              <button type="button" onClick={()=>navigator.clipboard?.writeText(webhookUrl)} style={makeBtn('secondary',{fontSize:10,padding:'4px 8px'})}>{Icons.copy(12)}</button>
            </div>
          </div>
          <button type="button" onClick={()=>setWaStep(6)} className="velo-btn-primary" style={makeBtn('primary',{fontSize:12})}>{lang==='ar'?'التالي':'Next'}</button>
        </WaStep>
        <WaStep num={6} title={lang==='ar'?'رمز التحقق':'Verify Token'} active={waStep===6}>
          <div style={{ padding:'10px 14px', borderRadius:8, background:C.bg, border:`1px solid ${C.border}`, marginBottom:12 }}>
            <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>Verify Token ({lang==='ar'?'انسخه إلى Meta':'paste in Meta'})</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <code style={{ fontSize:12, color:C.primary, flex:1 }}>{wa.secret}</code>
              <button type="button" onClick={()=>navigator.clipboard?.writeText(wa.secret)} style={makeBtn('secondary',{fontSize:10,padding:'4px 8px'})}>{Icons.copy(12)}</button>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" onClick={testWhatsApp} style={makeBtn('secondary',{gap:6,fontSize:12})}>
              {waTestResult==='testing'?'...' : waTestResult==='success'?'✓ Connected':lang==='ar'?'اختبار الاتصال':'Test Connection'}
            </button>
            {waTestResult && waTestResult !== 'testing' && waTestResult !== 'success' && <span style={{ fontSize:11, color:'#ef4444', alignSelf:'center' }}>{waTestResult}</span>}
          </div>
        </WaStep>
      </Section>

      {/* Facebook / Instagram */}
      <Section title="Facebook & Instagram" icon="📱">
        <p style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:12 }}>{lang==='ar'?'اربط صفحة فيسبوك لتلقي رسائل Messenger و Instagram DM.':'Connect your Facebook Page to receive Messenger and Instagram DM messages.'}</p>
        <FormField label="Meta Access Token" dir={dir}><input value={meta.token} onChange={e=>setMeta({token:e.target.value})} type="password" placeholder="EAAx..." style={inputStyle(dir)} /></FormField>
        <div style={{ display:'flex', gap:8 }}>
          <button type="button" style={makeBtn('secondary',{gap:6})}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1877F2" strokeWidth="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> {lang==='ar'?'ربط فيسبوك':'Connect Facebook'}</button>
          <button type="button" style={makeBtn('secondary',{gap:6})}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E4405F" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/></svg> {lang==='ar'?'ربط إنستغرام':'Connect Instagram'}</button>
        </div>
      </Section>

      {/* Gmail */}
      <Section title="Gmail" icon="📧">
        <FormField label={lang==='ar'?'بريد Gmail':'Connected Gmail'} dir={dir}><input value={gmail.email} onChange={e=>setGmail({email:e.target.value})} placeholder="your@gmail.com" style={inputStyle(dir)} /></FormField>
        <button type="button" style={makeBtn('secondary',{gap:6})}>{Icons.externalLink(13)} {lang==='ar'?'ربط حساب Google':'Connect Google Account'}</button>
      </Section>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button type="button" onClick={handleSave} style={makeBtn(saved?'success':'primary',{gap:6})}>{saved?Icons.check(14):null} {saved?(lang==='ar'?'تم الحفظ!':'Saved!'):(lang==='ar'?'حفظ الإعدادات':'Save Settings')}</button>
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
    <div>
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, rgb(var(--velo-accent-solid)), #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'rgb(var(--velo-text-primary))', margin: 0 }}>
              {isRTL ? 'AI الوكالة' : 'Agency AI'}
            </h2>
            <p style={{ fontSize: 12, color: 'rgb(var(--velo-text-secondary))', margin: '2px 0 0' }}>
              {isRTL ? 'يدار خادمياً' : 'Server-managed'}
            </p>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'rgb(var(--velo-text-secondary))', lineHeight: 1.6, margin: 0 }}>
          {isRTL
            ? 'يتم تكوين ميزات الذكاء الاصطناعي عبر المتغير البيئي للخادم ANTHROPIC_API_KEY بواسطة المشغل. لم تعد هناك إعدادات قابلة للتعديل من واجهة المستخدم.'
            : 'AI features are configured by the operator via the server-side ANTHROPIC_API_KEY env var. Nothing is configurable from the UI anymore — contact support to enable or rotate the key.'}
        </p>
      </div>
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

  if (loading) return <div style={{ ...card, padding: 40, textAlign: 'center', color: C.textMuted }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Doctors */}
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>{isRTL ? 'الاطباء' : 'Doctors'}</h3>
            <p style={{ fontSize: 13, color: C.textSec, margin: '4px 0 0' }}>
              {isRTL
                ? 'الأطباء مستخدمو Velo — ادعهم من تبويب الفريق بدور "طبيب"'
                : 'Doctors are Velo users — invite from the Team tab with role "Doctor"'}
            </p>
          </div>
          <button onClick={handleAddDoctor} className="velo-btn-primary" style={makeBtn('primary')}>{Icons.users(14)} {isRTL ? 'تبويب الفريق' : 'Go to Team'}</button>
        </div>

        {doctors.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13, border: '1px dashed var(--border-subtle)', borderRadius: 10 }}>
            {isRTL ? 'لا يوجد أطباء بعد. ادعهم من تبويب الفريق.' : 'No doctors yet — invite them from the Team tab.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doctors.map(doc => {
              const tint = doctorTint(doc.id)
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-void)' }}>
                  {doc.avatar_url ? (
                    <img src={doc.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${tint}20`, border: `2px solid ${tint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tint, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                      {(doc.full_name || 'D').charAt(0)}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{doc.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {ROLE_LABELS[isRTL ? 'ar' : 'en'].doctor}
                    </div>
                  </div>
                  <button onClick={() => { setEditDoc(doc); setShowDocForm(true) }} style={{ ...makeBtn('ghost'), padding: 6, height: 30 }} title={isRTL ? 'تعديل' : 'Edit'}>
                    {Icons.edit(14)}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showDocForm && <DoctorForm doc={editDoc} onSave={saveDoctor} onCancel={() => { setShowDocForm(false); setEditDoc(null) }} dir={dir} isRTL={isRTL} />}
      </div>

      {/* Working Hours */}
      <div style={{ ...card, padding: 24 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{isRTL ? 'ساعات العمل' : 'Working Hours'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, maxWidth: 400 }}>
          <FormField label={isRTL ? 'وقت الفتح' : 'Open Time'} dir={dir}>
            <input type="time" value={hours.open} onChange={e => saveHours({ ...hours, open: e.target.value })} style={inputStyle(dir)} />
          </FormField>
          <FormField label={isRTL ? 'وقت الاغلاق' : 'Close Time'} dir={dir}>
            <input type="time" value={hours.close} onChange={e => saveHours({ ...hours, close: e.target.value })} style={inputStyle(dir)} />
          </FormField>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
          {isRTL ? 'ايام العطلة' : 'Days Off'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(isRTL ? WEEK_DAYS_AR : WEEK_DAYS_EN).map((day, i) => {
            const isOff = hours.daysOff?.includes(i)
            return (
              <button key={i} onClick={() => {
                const next = isOff ? hours.daysOff.filter(d => d !== i) : [...(hours.daysOff || []), i]
                saveHours({ ...hours, daysOff: next })
              }}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: isOff ? '1px solid rgba(255,107,107,0.3)' : '1px solid var(--border-subtle)',
                  background: isOff ? 'rgba(255,107,107,0.08)' : 'transparent',
                  color: isOff ? '#FF6B6B' : C.text,
                  transition: 'all 0.15s',
                }}>
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// New profiles schema only allows clinic-side edits to full_name, avatar_url,
// and locale. Role / org_id are operator-managed and locked by trigger.
function DoctorForm({ doc, onSave, onCancel, dir, isRTL }) {
  const [form, setForm] = useState({
    full_name: doc?.full_name || '',
    avatar_url: doc?.avatar_url || '',
    locale: doc?.locale || '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div style={{ marginTop: 16, padding: 20, borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label={isRTL ? 'الاسم' : 'Name'} dir={dir}>
          <input value={form.full_name} onChange={e => set('full_name', e.target.value)} style={inputStyle(dir)} placeholder="Dr. ..." />
        </FormField>
        <FormField label={isRTL ? 'اللغة' : 'Locale'} dir={dir}>
          <select value={form.locale} onChange={e => set('locale', e.target.value)} style={selectStyle(dir)}>
            <option value="">{isRTL ? '— تلقائي —' : '— Auto —'}</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </FormField>
      </div>
      <FormField label={isRTL ? 'رابط الصورة' : 'Avatar URL'} dir={dir}>
        <input value={form.avatar_url} onChange={e => set('avatar_url', e.target.value)} style={inputStyle(dir)} placeholder="https://..." />
      </FormField>
      <div style={{ marginTop: 4, marginBottom: 12, fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
        {isRTL
          ? 'يتم إدارة الدور (طبيب / موظف استقبال) من قبل المشغل، لا يمكن تعديله من هنا.'
          : 'Role (doctor / receptionist / etc.) is operator-managed and cannot be changed from this form.'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={makeBtn('secondary')}>{isRTL ? 'الغاء' : 'Cancel'}</button>
        <button onClick={() => { if (form.full_name.trim()) onSave(form) }} disabled={!form.full_name.trim()} className="velo-btn-primary" style={{ ...makeBtn('primary'), opacity: form.full_name.trim() ? 1 : 0.5 }}>
          {isRTL ? 'تحديث' : 'Update'}
        </button>
      </div>
    </div>
  )
}

