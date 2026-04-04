import { useState } from 'react'
import { C } from '../design'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const INDUSTRIES = [
  { id: 'general', icon: '🏢', en: 'General Business', ar: 'أعمال عامة' },
  { id: 'dental', icon: '🦷', en: 'Dental Clinic', ar: 'عيادة أسنان' },
  { id: 'real_estate', icon: '🏠', en: 'Real Estate', ar: 'عقارات' },
  { id: 'beauty', icon: '💅', en: 'Beauty & Spa', ar: 'تجميل وسبا' },
  { id: 'legal', icon: '⚖️', en: 'Legal Services', ar: 'خدمات قانونية' },
  { id: 'restaurant', icon: '🍽️', en: 'Restaurant', ar: 'مطعم' },
]

const COLORS = ['#0969DA', '#8250DF', '#1A7F37', '#CF222E', '#D29922', '#E16F24', '#0D9488', '#6366F1']

export default function OnboardingPage({ user, lang, onComplete }) {
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('general')
  const [color, setColor] = useState('#0969DA')
  const [invites, setInvites] = useState([''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'
  const txt = {
    step1Title: isRTL ? 'أنشئ مؤسستك' : 'Create Your Organization',
    step1Sub: isRTL ? 'ابدأ بتسمية فريقك' : 'Start by naming your team',
    step2Title: isRTL ? 'اختر مجال عملك' : 'Choose Your Industry',
    step2Sub: isRTL ? 'سنخصص Velo لمجالك' : "We'll customize Velo for your field",
    step3Title: isRTL ? 'ادعُ فريقك' : 'Invite Your Team',
    step3Sub: isRTL ? 'أضف أعضاء الفريق (اختياري)' : 'Add team members (optional)',
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

  const handleFinish = async (skipInvite = false) => {
    const name = orgName.trim() || (isRTL ? 'شركتي' : 'My Company')
    setLoading(true)
    setError('')

    if (isSupabaseConfigured()) {
      try {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org-' + Date.now()
        const { data: org, error: orgErr } = await supabase.from('organizations').insert({
          name, slug, primary_color: color, industry, plan: 'free',
        }).select().single()
        if (orgErr) throw orgErr

        await supabase.from('profiles').update({ org_id: org.id, role: 'admin' }).eq('id', user.id)

        await supabase.from('departments').insert([
          { org_id: org.id, name: isRTL ? 'المبيعات' : 'Sales', color: '#0969DA' },
          { org_id: org.id, name: isRTL ? 'الدعم' : 'Support', color: '#1A7F37' },
          { org_id: org.id, name: isRTL ? 'التقنية' : 'Technical', color: '#8250DF' },
        ])

        onComplete(org)
      } catch (err) {
        console.error('Onboarding error:', err)
        // On failure, enter app in demo mode instead of blocking
        onComplete({ id: 'demo-org', name, industry, primary_color: color })
      }
    } else {
      onComplete({ id: 'demo-org', name, industry, primary_color: color })
    }
    setLoading(false)
  }

  const handleSkip = () => {
    const name = orgName.trim() || (isRTL ? 'شركتي' : 'My Company')
    onComplete({ id: 'demo-org', name, industry, primary_color: color })
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
    fontSize: 14, color: C.text, fontFamily: "'Inter',sans-serif", outline: 'none',
    background: C.white, boxSizing: 'border-box', direction: dir,
  }

  return (
    <div dir={dir} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: "'Inter',-apple-system,sans-serif", padding: 20 }}>
      <div style={{ width: 520, maxWidth: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${color}, #8250DF)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 24, margin: '0 auto 12px' }}>V</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{isRTL ? `الخطوة ${step} من 3` : `Step ${step} of 3`}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
            {[1, 2, 3].map(s => <div key={s} style={{ width: 40, height: 4, borderRadius: 2, background: s <= step ? color : C.border, transition: 'background .3s' }} />)}
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: 32, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          {error && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: '#FFEBE9', fontSize: 13, color: '#CF222E' }}>{error}</div>}

          {/* Step 1: Org name + color */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{txt.step1Title}</h2>
              <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px' }}>{txt.step1Sub}</p>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>{txt.orgLabel}</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={txt.orgPlaceholder} style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 8 }}>{txt.brandColor}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{
                      width: 36, height: 36, borderRadius: 10, background: c, border: color === c ? '3px solid #1F2328' : '3px solid transparent',
                      cursor: 'pointer', transition: 'border-color .2s',
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Industry */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{txt.step2Title}</h2>
              <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px' }}>{txt.step2Sub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {INDUSTRIES.map(ind => (
                  <button key={ind.id} onClick={() => setIndustry(ind.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12,
                    border: industry === ind.id ? `2px solid ${color}` : `1px solid ${C.border}`,
                    background: industry === ind.id ? `${color}08` : C.white,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', transition: 'all .15s',
                  }}>
                    <span style={{ fontSize: 24 }}>{ind.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{isRTL ? ind.ar : ind.en}</span>
                    {industry === ind.id && <span style={{ marginLeft: 'auto', marginRight: isRTL ? 'auto' : 0, color, fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Invite */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{txt.step3Title}</h2>
              <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 24px' }}>{txt.step3Sub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {invites.map((email, i) => (
                  <input key={i} value={email} onChange={e => { const n = [...invites]; n[i] = e.target.value; setInvites(n) }} placeholder={txt.emailPlaceholder} style={inputStyle} />
                ))}
                <button onClick={() => setInvites(prev => [...prev, ''])} style={{ border: 'none', background: 'transparent', color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', padding: '4px 0' }}>
                  {txt.addAnother}
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit' }}>
                {txt.back}
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              {step === 3 && (
                <button onClick={handleSkip} style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {txt.skip}
                </button>
              )}
              <button onClick={() => step < 3 ? setStep(s => s + 1) : handleFinish()} disabled={loading}
                style={{ border: 'none', background: color, borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: '#fff', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: `0 2px 8px ${color}40` }}>
                {loading ? '...' : step < 3 ? txt.next : txt.finish}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
