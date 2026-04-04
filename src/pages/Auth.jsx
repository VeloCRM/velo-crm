import { useState, useEffect } from 'react'
import { signIn, signUp, resetPassword } from '../lib/auth'

const C = {
  sidebar: '#0D1117', primary: '#0969DA', primaryHov: '#0860CA',
  text: '#1F2328', textSec: '#57606A', textMuted: '#8C959F',
  border: '#D0D7DE', bg: '#F6F8FA', white: '#FFFFFF',
  danger: '#CF222E', success: '#1A7F37',
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  const t = {
    en: { welcome:'Welcome to Velo', tagline:'Your all-in-one CRM platform', login:'Sign In', signup:'Create Account', forgotPassword:'Forgot password?', resetPassword:'Reset Password', email:'Email Address', password:'Password', fullName:'Full Name', noAccount:"Don't have an account?", hasAccount:'Already have an account?', signupLink:'Sign up', loginLink:'Sign in', backToLogin:'Back to sign in', resetSent:'Password reset email sent.', emailRequired:'Email is required', passwordRequired:'Password is required (min 6 characters)', nameRequired:'Full name is required', switchLang:'العربية', demoNote:'Demo mode — no Supabase configured. Click Sign In to continue.' },
    ar: { welcome:'مرحباً بك في فيلو', tagline:'منصة CRM المتكاملة', login:'تسجيل الدخول', signup:'إنشاء حساب', forgotPassword:'نسيت كلمة المرور؟', resetPassword:'استعادة كلمة المرور', email:'البريد الإلكتروني', password:'كلمة المرور', fullName:'الاسم الكامل', noAccount:'ليس لديك حساب؟', hasAccount:'لديك حساب بالفعل؟', signupLink:'سجل الآن', loginLink:'سجل دخول', backToLogin:'العودة لتسجيل الدخول', resetSent:'تم إرسال رابط إعادة التعيين.', emailRequired:'البريد الإلكتروني مطلوب', passwordRequired:'كلمة المرور مطلوبة (6 أحرف)', nameRequired:'الاسم مطلوب', switchLang:'English', demoNote:'وضع تجريبي — اضغط تسجيل الدخول للمتابعة.' },
  }
  const txt = t[lang] || t.en

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
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

  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.border}`, fontSize:14, color:C.text, fontFamily:"'Inter',sans-serif", outline:'none', background:C.white, boxSizing:'border-box', direction:dir, transition:'border-color .2s', minHeight:44 }

  return (
    <div dir={dir} style={{ minHeight:'100vh', display:'flex', flexDirection: isMobile?'column':'row', fontFamily:"'Inter',-apple-system,sans-serif", background:`linear-gradient(135deg,${C.sidebar} 0%,#161B22 50%,#0D1117 100%)` }}>

      {/* Desktop left panel */}
      {!isMobile && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:60, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'rgba(9,105,218,.08)', top:-100, left:-100 }} />
          <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'rgba(130,80,223,.06)', bottom:-50, right:-50 }} />
          <div style={{ position:'relative', zIndex:1, textAlign:'center', maxWidth:400 }}>
            <div style={{ width:72, height:72, borderRadius:18, margin:'0 auto 24px', background:`linear-gradient(135deg,${C.primary},#8250DF)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:32, boxShadow:'0 8px 32px rgba(9,105,218,.3)' }}>V</div>
            <h1 style={{ fontSize:36, fontWeight:800, color:'#E6EDF3', margin:'0 0 8px' }}>Velo</h1>
            <p style={{ fontSize:16, color:'#7D8590', lineHeight:1.6, margin:0 }}>{txt.tagline}</p>
            <div style={{ marginTop:48, display:'flex', flexDirection:'column', gap:16, textAlign:isRTL?'right':'left' }}>
              {['📊 Smart dashboard','🤝 Contacts & deals','💬 Unified inbox','🎫 Ticketing system'].map((f,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderRadius:10, background:'rgba(255,255,255,.04)' }}>
                  <span style={{ fontSize:16 }}>{f.split(' ')[0]}</span>
                  <span style={{ fontSize:14, color:'#8B949E' }}>{f.substring(f.indexOf(' ')+1)}</span>
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
        background: isMobile?'transparent':C.white,
        borderRadius: isMobile?0:(isRTL?'24px 0 0 24px':'24px 0 0 24px'),
        boxShadow: isMobile?'none':'-8px 0 32px rgba(0,0,0,.1)',
      }}>
        {/* Mobile logo */}
        {isMobile && (
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ width:52, height:52, borderRadius:14, margin:'0 auto 10px', background:`linear-gradient(135deg,${C.primary},#8250DF)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:22, boxShadow:'0 8px 32px rgba(9,105,218,.3)' }}>V</div>
            <h1 style={{ fontSize:24, fontWeight:800, color:'#E6EDF3', margin:'0 0 4px' }}>Velo</h1>
            <p style={{ fontSize:13, color:'#7D8590' }}>{txt.tagline}</p>
          </div>
        )}

        <div style={isMobile ? { background:C.white, borderRadius:16, padding:'28px 22px', boxShadow:'0 4px 24px rgba(0,0,0,.15)' } : {}}>
          {/* Language toggle */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
            <button onClick={() => setLang(l => l==='en'?'ar':'en')} style={{ border:`1px solid ${C.border}`, background:'transparent', borderRadius:8, padding:'5px 12px', fontSize:12, color:isMobile?C.textSec:C.textSec, cursor:'pointer', fontFamily:'inherit' }}>
              {txt.switchLang}
            </button>
          </div>

          <h2 style={{ fontSize: isMobile?20:24, fontWeight:700, color:C.text, margin:'0 0 6px' }}>
            {mode==='forgot'?txt.resetPassword:mode==='signup'?txt.signup:txt.welcome}
          </h2>
          <p style={{ fontSize:13, color:C.textSec, margin:'0 0 20px' }}>
            {mode==='forgot'?(lang==='ar'?'أدخل بريدك الإلكتروني':'Enter your email for a reset link'):(lang==='ar'?'أدخل بياناتك للمتابعة':'Enter your details to continue')}
          </p>

          <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, background:'#DDF4FF', border:'1px solid #54AEFF44', fontSize:11, color:'#0969DA', lineHeight:1.5 }}>{txt.demoNote}</div>

          {error && <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:12, background:'#FFEBE9', fontSize:12, color:C.danger }}>{error}</div>}
          {message && <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:12, background:'#DAFBE1', fontSize:12, color:C.success }}>{message}</div>}

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {mode==='signup' && <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.fullName}</label><input value={fullName} onChange={e=>setFullName(e.target.value)} style={inp}/></div>}
            <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.email}</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@company.com" style={inp}/></div>
            {mode!=='forgot' && <div><label style={{ display:'block', fontSize:12, fontWeight:600, color:C.textSec, marginBottom:5 }}>{txt.password}</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" style={inp}/></div>}
            {mode==='login' && <div style={{ textAlign:isRTL?'left':'right' }}><button type="button" onClick={()=>{setMode('forgot');setError('');setMessage('')}} style={{ border:'none', background:'transparent', color:C.primary, fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>{txt.forgotPassword}</button></div>}
            <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px 16px', borderRadius:10, border:'none', background:loading?C.textMuted:`linear-gradient(135deg,${C.primary},${C.primaryHov})`, color:'#fff', fontSize:15, fontWeight:600, cursor:loading?'wait':'pointer', fontFamily:'inherit', boxShadow:'0 2px 8px rgba(9,105,218,.25)', minHeight:44 }}>
              {loading?(lang==='ar'?'جارٍ التحميل...':'Loading...'):mode==='forgot'?txt.resetPassword:mode==='signup'?txt.signup:txt.login}
            </button>
          </form>

          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:C.textSec }}>
            {mode==='forgot' ? <button type="button" onClick={()=>{setMode('login');setError('');setMessage('')}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.backToLogin}</button>
            : mode==='login' ? <span>{txt.noAccount}{' '}<button type="button" onClick={()=>{setMode('signup');setError('');setMessage('')}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.signupLink}</button></span>
            : <span>{txt.hasAccount}{' '}<button type="button" onClick={()=>{setMode('login');setError('');setMessage('')}} style={{ border:'none', background:'transparent', color:C.primary, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>{txt.loginLink}</button></span>}
          </div>

          <div style={{ marginTop:28, textAlign:'center', fontSize:11, color:C.textMuted }}>&copy; 2026 Velo CRM</div>
        </div>
      </div>
    </div>
  )
}
