import { useState, useEffect } from 'react'
import { signIn, signUp, resetPassword } from '../lib/auth'
import { checkLoginAttempt, getLoginLockoutRemaining } from '../lib/sanitize'

const C = {
  sidebar: '#0d1420', primary: '#00d4ff', primaryHov: '#00b8e6',
  text: '#e2e8f0', textSec: '#94a3b8', textMuted: '#475569',
  border: 'rgba(255,255,255,0.08)', bg: '#0d1420', white: '#111827',
  danger: '#ef4444', success: '#00ff88',
}

export default function AuthPage({ onAuth, lang, setLang }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const timer = setInterval(() => {
      const remaining = getLoginLockoutRemaining()
      if (remaining <= 0) {
        setLockoutSeconds(0)
        setError('')
      } else {
        setLockoutSeconds(remaining)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutSeconds])

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  const t = {
    en: { welcome:'Welcome to Velo', tagline:'Your all-in-one CRM platform', login:'Sign In', signup:'Create Account', forgotPassword:'Forgot password?', resetPassword:'Reset Password', email:'Email Address', password:'Password', fullName:'Full Name', noAccount:"Don't have an account?", hasAccount:'Already have an account?', signupLink:'Sign up', loginLink:'Sign in', backToLogin:'Back to sign in', resetSent:'Password reset email sent.', emailRequired:'Email is required', passwordRequired:'Password is required (min 6 characters)', nameRequired:'Full name is required', switchLang:'العربية', demoNote:'Demo mode — no Supabase configured. Click Sign In to continue.', lockedOut:'Too many login attempts. Please wait', seconds:'seconds' },
    ar: { welcome:'مرحباً بك في فيلو', tagline:'منصة CRM المتكاملة', login:'تسجيل الدخول', signup:'إنشاء حساب', forgotPassword:'نسيت كلمة المرور؟', resetPassword:'استعادة كلمة المرور', email:'البريد الإلكتروني', password:'كلمة المرور', fullName:'الاسم الكامل', noAccount:'ليس لديك حساب؟', hasAccount:'لديك حساب بالفعل؟', signupLink:'سجل الآن', loginLink:'سجل دخول', backToLogin:'العودة لتسجيل الدخول', resetSent:'تم إرسال رابط إعادة التعيين.', emailRequired:'البريد الإلكتروني مطلوب', passwordRequired:'كلمة المرور مطلوبة (6 أحرف)', nameRequired:'الاسم مطلوب', switchLang:'English', demoNote:'وضع تجريبي — اضغط تسجيل الدخول للمتابعة.', lockedOut:'محاولات كثيرة. يرجى الانتظار', seconds:'ثانية' },
  }
  const txt = t[lang] || t.en

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')

    // Rate limiting check for login attempts
    if (mode === 'login') {
      if (!checkLoginAttempt()) {
        const remaining = getLoginLockoutRemaining()
        setLockoutSeconds(remaining)
        setError(`${txt.lockedOut} ${remaining} ${txt.seconds}`)
        return
      }
    }

    if (!email.trim()) { setError(txt.emailRequired); return }
    if (mode !== 'forgot' && password.length < 6) { setError(txt.passwordRequired); return }
    if (mode === 'signup' && !fullName.trim()) { setError(txt.nameRequired); return }
    setLoading(true)
    try {
      if (mode === 'login') { const { data, error: err } = await signIn(email, password); if (err) { setError(err.message); setLoading(false); return }; onAuth(data.user) }
      else if (mode === 'signup') { const { data, error: err } = await signUp(email, password, fullName); if (err) { setError(err.message); setLoading(false); return }; onAuth(data.user) }
      else { const { error: err } = await resetPassword(email); if (err) { setError(err.message); setLoading(false); return }; setMessage(txt.resetSent) }
    } catch (err) { setError(err.message || 'An error occurred') }
    setLoading(false)
  }

  const inp = { width:'100%', padding:'0 14px', height:44, borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', fontSize:14, color:'#e2e8f0', fontFamily:"'DM Sans','Inter',sans-serif", outline:'none', background:'#0f1729', boxSizing:'border-box', direction:dir, transition:'border-color .2s' }

  return (
    <div dir={dir} style={{ minHeight:'100vh', display:'flex', flexDirection: isMobile?'column':'row', fontFamily:"'Inter',-apple-system,sans-serif", background:`linear-gradient(135deg,${C.sidebar} 0%,#1F2937 100%)` }}>

      {/* Desktop left panel */}
      {!isMobile && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:60, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'rgba(37,99,235,.08)', top:-100, left:-100 }} />
          <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'rgba(99,102,241,.06)', bottom:-50, right:-50 }} />
          <div style={{ position:'relative', zIndex:1, textAlign:'center', maxWidth:400 }}>
            <div style={{ width:72, height:72, borderRadius:12, margin:'0 auto 24px', background:`linear-gradient(135deg,${C.primary},#6366F1)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:32, boxShadow:'0 8px 32px rgba(37,99,235,.3)' }}>V</div>
            <h1 style={{ fontSize:36, fontWeight:800, color:'#F3F4F6', margin:'0 0 8px' }}>Velo</h1>
            <p style={{ fontSize:16, color:'#9CA3AF', lineHeight:1.6, margin:0 }}>{txt.tagline}</p>
            <div style={{ marginTop:48, display:'flex', flexDirection:'column', gap:16, textAlign:isRTL?'right':'left' }}>
              {['📊 Smart dashboard','🤝 Contacts & deals','💬 Unified inbox','🎫 Ticketing system'].map((f,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderRadius:8, background:'rgba(255,255,255,.04)' }}>
                  <span style={{ fontSize:16 }}>{f.split(' ')[0]}</span>
                  <span style={{ fontSize:14, color:'#9CA3AF' }}>{f.substring(f.indexOf(' ')+1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Form panel */}
      <div style={{
        width: isMobile?'100%':480, minWidth: isMobile?'unset':480, flex: isMobile?1:'none',
        display:'flex', flexDirection:'column', justifyContent:'center',
        padding: isMobile?'24px 20px':'48px 52px',
        background: isMobile?'transparent':'#111827',
        borderRadius: isMobile?0:(isRTL?'16px 0 0 16px':'16px 0 0 16px'),
        boxShadow: isMobile?'none':'-8px 0 32px rgba(0,0,0,.4)',
        border: isMobile?'none':'1px solid rgba(0,212,255,0.12)',
      }}>
        {/* Mobile logo */}
        {isMobile && (
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ width:52, height:52, borderRadius:12, margin:'0 auto 10px', background:`linear-gradient(135deg,${C.primary},#6366F1)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:22, boxShadow:'0 8px 32px rgba(37,99,235,.3)' }}>V</div>
            <h1 style={{ fontSize:24, fontWeight:800, color:'#F3F4F6', margin:'0 0 4px' }}>Velo</h1>
            <p style={{ fontSize:13, color:'#9CA3AF' }}>{txt.tagline}</p>
          </div>
        )}

        <div style={isMobile ? { background:'#111827', borderRadius:8, padding:'28px 22px', boxShadow:'0 4px 24px rgba(0,0,0,.4)', border:'1px solid rgba(0,212,255,0.12)' } : {}}>
          {/* Language toggle */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
            <button onClick={() => setLang(l => l==='en'?'ar':'en')} style={{ border:`1px solid ${C.border}`, background:'transparent', borderRadius:6, padding:'5px 12px', fontSize:12, color:C.textSec, cursor:'pointer', fontFamily:'inherit' }}>
              {txt.switchLang}
            </button>
          </div>

          <h2 style={{ fontSize: isMobile?20:24, fontWeight:700, color:C.text, margin:'0 0 6px' }}>
            {mode==='forgot'?txt.resetPassword:mode==='signup'?txt.signup:txt.welcome}
          </h2>
          <p style={{ fontSize:13, color:C.textSec, margin:'0 0 20px' }}>
            {mode==='forgot'?(lang==='ar'?'أدخل بريدك الإلكتروني':'Enter your email for a reset link'):(lang==='ar'?'أدخل بياناتك للمتابعة':'Enter your details to continue')}
          </p>

          <div style={{ padding:'8px 12px', borderRadius:6, marginBottom:16, background:'rgba(0,212,255,0.06)', border:'1px solid rgba(0,212,255,0.12)', fontSize:11, color:'#00d4ff', lineHeight:1.5 }}>{txt.demoNote}</div>

          {error && (
            <div style={{ padding:'8px 12px', borderRadius:6, marginBottom:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', fontSize:12, color:'#ef4444', display:'flex', alignItems:'center', gap:8 }}>
              {lockoutSeconds > 0 && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
                  <rect x="5" y="7" width="6" height="6" rx="1" stroke={C.danger} strokeWidth="1.5" fill="none"/>
                  <path d="M6 7V5a2 2 0 1 1 4 0v2" stroke={C.danger} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              )}
              <span>{error}</span>
            </div>
          )}
          {lockoutSeconds > 0 && (
            <div style={{ padding:'8px 12px', borderRadius:6, marginBottom:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', fontSize:11, color:'#ef4444', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
                <circle cx="8" cy="8" r="6.5" stroke={C.danger} strokeWidth="1.2" fill="none"/>
                <path d="M8 4.5v4l2.5 1.5" stroke={C.danger} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span>{lang==='ar' ? `الوقت المتبقي: ${lockoutSeconds} ثانية` : `Time remaining: ${lockoutSeconds}s`}</span>
            </div>
          )}
          {message && <div style={{ padding:'8px 12px', borderRadius:6, marginBottom:12, background:'rgba(0,255,136,0.06)', border:'1px solid rgba(0,255,136,0.15)', fontSize:12, color:'#00ff88' }}>{message}</div>}

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {mode==='signup' && <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.fullName}</label><input value={fullName} onChange={e=>setFullName(e.target.value)} style={inp}/></div>}
            <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.email}</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@company.com" style={inp}/></div>
            {mode!=='forgot' && <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.password}</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" style={inp}/></div>}
            {mode==='login' && <div style={{ textAlign:isRTL?'left':'right' }}><button type="button" onClick={()=>{setMode('forgot');setError('');setMessage('');setLockoutSeconds(0)}} style={{ border:'none', background:'transparent', color:C.primary, fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>{txt.forgotPassword}</button></div>}
            <button type="submit" disabled={loading || lockoutSeconds > 0} style={{ width:'100%', padding:'0 16px', height:44, borderRadius:6, border:'none', background:(loading || lockoutSeconds > 0)?'#475569':'linear-gradient(135deg, #00d4ff, #0099cc)', color:(loading || lockoutSeconds > 0)?'#94a3b8':'#080c14', fontSize:15, fontWeight:600, cursor:(loading || lockoutSeconds > 0)?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:'0 2px 12px rgba(0,212,255,.25)' }}>
              {loading?(lang==='ar'?'جارٍ التحميل...':'Loading...'):mode==='forgot'?txt.resetPassword:mode==='signup'?txt.signup:txt.login}
            </button>
          </form>

          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:C.textSec }}>
            {mode==='forgot' ? <button type="button" onClick={()=>{setMode('login');setError('');setMessage('');setLockoutSeconds(0)}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.backToLogin}</button>
            : mode==='login' ? <span>{txt.noAccount}{' '}<button type="button" onClick={()=>{setMode('signup');setError('');setMessage('');setLockoutSeconds(0)}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.signupLink}</button></span>
            : <span>{txt.hasAccount}{' '}<button type="button" onClick={()=>{setMode('login');setError('');setMessage('');setLockoutSeconds(0)}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.loginLink}</button></span>}
          </div>

          <div style={{ marginTop:28, textAlign:'center', fontSize:11, color:C.textMuted }}>&copy; 2026 Velo CRM</div>
        </div>
      </div>
    </div>
  )
}
