import { useState } from 'react'
import { C } from '../design'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { createInvitation } from '../lib/invitations'
import { isValidEmail } from '../lib/sanitize'

const COLORS = ['#2563EB', '#7C3AED', '#16A34A', '#DC2626', '#D97706', '#E16F24', '#0D9488', '#6366F1']

export default function OnboardingPage({ user, lang, onComplete, toast }) {
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [color, setColor] = useState('#2563EB')
  const [invites, setInvites] = useState([''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'
  const txt = {
    step1Title: isRTL ? 'أنشئ مؤسستك' : 'Create Your Organization',
    step1Sub: isRTL ? 'ابدأ بتسمية فريقك' : 'Start by naming your team',
    step2Title: isRTL ? 'ادعُ فريقك' : 'Invite Your Team',
    step2Sub: isRTL ? 'أضف أعضاء الفريق (اختياري)' : 'Add team members (optional)',
    orgLabel: isRTL ? 'اسم المؤسسة' : 'Organization Name',
    orgPlaceholder: isRTL ? 'مثال: شركة فيلو' : 'e.g. Velo Inc.',
    brandColor: isRTL ? 'لون العلامة التجارية' : 'Brand Color',
    emailPlaceholder: isRTL ? 'البريد الإلكتروني' : 'teammate@company.com',
    addAnother: isRTL ? 'إضافة شخص آخر' : '+ Add another',
    next: isRTL ? 'التالي' : 'Next',
    back: isRTL ? 'رجوع' : 'Back',
    finish: isRTL ? 'ابدأ باستخدام Velo' : 'Start Using Velo',
    skip: isRTL ? 'تخطي' : 'Skip',
  }

  const handleNext = async () => {
    if (step === 1) {
      const name = orgName.trim() || (isRTL ? 'شركتي' : 'My Company')
      setLoading(true)
      setError('')

      if (isSupabaseConfigured()) {
        try {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org-' + Date.now()
          const { data: org, error: orgErr } = await supabase.rpc('create_first_org', {
            org_name: name,
            org_slug: slug,
            org_color: color,
            org_industry: 'dental',
          })

          if (orgErr) throw orgErr

          // create_first_org() also linked the caller's profile to the new org
          // as admin. No separate profiles UPDATE needed.

          // Default departments — best-effort, non-blocking. Wrapped defensively because
          // the same unexplained RLS rejection that bit organizations might affect
          // departments too. If it fails, the user lands in the dashboard anyway and
          // can create departments manually later.
          try {
            await supabase.from('departments').insert([
              { org_id: org.id, name: isRTL ? 'المبيعات' : 'Sales', color: '#2563EB' },
              { org_id: org.id, name: isRTL ? 'الدعم' : 'Support', color: '#16A34A' },
              { org_id: org.id, name: isRTL ? 'التقنية' : 'Technical', color: '#7C3AED' },
            ])
          } catch (deptErr) {
            console.warn('Default departments seed failed (non-blocking):', deptErr.message)
          }

          localStorage.setItem('velo_tmp_org', JSON.stringify(org))
          setStep(2)
        } catch (err) {
          console.error('Onboarding org create error:', err)
          setError(err.message || 'Failed to create organization. Check your connection.')
        }
      } else {
        localStorage.setItem('velo_tmp_org', JSON.stringify({ id: 'demo-org', name, industry: 'dental', primary_color: color }))
        setStep(2)
      }
      setLoading(false)
    }
  }

  const handleFinish = async () => {
    setLoading(true)
    const stored = localStorage.getItem('velo_tmp_org')
    const org = stored ? JSON.parse(stored) : null

    // Send invitations in production mode. Skip silently in demo mode
    // (createInvitation throws on no-Supabase). Use Promise.allSettled
    // so one bad email doesn't block the rest.
    const trimmedInvites = invites.map(e => e.trim()).filter(Boolean)
    if (isSupabaseConfigured() && org?.id && trimmedInvites.length > 0) {
      const validEmails = trimmedInvites.filter(isValidEmail)
      const total = trimmedInvites.length
      const results = await Promise.allSettled(
        validEmails.map(email => createInvitation({ orgId: org.id, email, role: 'member' }))
      )
      const fulfilled = results.filter(r => r.status === 'fulfilled').length
      results.filter(r => r.status === 'rejected').forEach(r =>
        console.warn('Onboarding invite create failed:', r.reason?.message)
      )
      if (fulfilled === total) {
        toast?.(isRTL ? `تم إرسال ${fulfilled} دعوة` : `Sent ${fulfilled} invitation${fulfilled === 1 ? '' : 's'}`, 'success')
      } else if (fulfilled > 0) {
        toast?.(isRTL ? `تم إرسال ${fulfilled} من ${total} دعوات` : `Sent ${fulfilled} of ${total} invitations`, 'info')
      } else {
        toast?.(isRTL ? 'فشل إرسال الدعوات' : 'Failed to send invitations', 'error')
      }
    }

    if (org) {
      onComplete(org)
      localStorage.removeItem('velo_tmp_org')
    } else {
      onComplete({ id: 'demo-org', name: orgName || 'My Company', industry: 'dental', primary_color: color })
    }
    setLoading(false)
  }

  const handleSkip = () => {
    handleFinish()
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 14, color: '#e2e8f0', fontFamily: "'DM Sans','Inter',sans-serif", outline: 'none',
    background: '#0C0E1A', boxSizing: 'border-box', direction: dir, height: 36,
    transition: 'all 150ms ease',
  }

  return (
    <div dir={dir} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: "'Inter',-apple-system,sans-serif", padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: `linear-gradient(135deg, ${color}, #7C3AED)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 24, margin: '0 auto 12px' }}>V</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{isRTL ? `الخطوة ${step} من 2` : `Step ${step} of 2`}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            {[1, 2].map(s => <div key={s} style={{ width: 40, height: 4, borderRadius: 2, background: s <= step ? color : C.border, transition: 'all 150ms ease' }} />)}
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 12, padding: 32, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          {error && <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 16, background: C.dangerBg, fontSize: 13, color: C.danger }}>{error}</div>}

          {/* Step 1: Org name + color */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{txt.step1Title}</h2>
              <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px' }}>{txt.step1Sub}</p>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>{txt.orgLabel}</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={txt.orgPlaceholder} style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>{txt.brandColor}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{
                      width: 36, height: 36, borderRadius: 8, background: c, border: color === c ? `3px solid ${C.text}` : '3px solid transparent',
                      cursor: 'pointer', transition: 'all 150ms ease',
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Invite */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{txt.step2Title}</h2>
              <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px' }}>{txt.step2Sub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invites.map((email, i) => (
                  <input key={i} value={email} onChange={e => { const n = [...invites]; n[i] = e.target.value; setInvites(n) }} placeholder={txt.emailPlaceholder} style={inputStyle} />
                ))}
                <button onClick={() => setInvites(prev => [...prev, ''])} style={{ border: 'none', background: 'transparent', color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', padding: '4px 0', transition: 'all 150ms ease' }}>
                  {txt.addAnother}
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 6, padding: '0 20px', height: 36, fontSize: 14, fontWeight: 500, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms ease' }}>
                {txt.back}
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              {step === 2 && (
                <button onClick={handleSkip} style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 6, padding: '0 20px', height: 36, fontSize: 14, fontWeight: 500, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms ease' }}>
                  {txt.skip}
                </button>
              )}
              <button onClick={() => step < 2 ? handleNext() : handleFinish()} disabled={loading}
                style={{ border: 'none', background: color, borderRadius: 6, padding: '0 24px', height: 36, fontSize: 14, fontWeight: 500, color: '#fff', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: `0 2px 8px ${color}40`, transition: 'all 150ms ease' }}>
                {loading ? '...' : step < 2 ? txt.next : txt.finish}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
