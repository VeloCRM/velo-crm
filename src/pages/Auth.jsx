import { useState, useEffect } from 'react'
import { signIn, signUp, resetPassword } from '../lib/auth'
import { checkLoginAttempt, getLoginLockoutRemaining, sanitizePathParam } from '../lib/sanitize'
import { getInvitationPreview, rememberPendingInvite } from '../lib/invitations'

export default function AuthPage({ onAuth, lang, setLang }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [invite, setInvite] = useState(null) // { token, orgName, email, role }

  // Detect /join?token=...&email=... — fetch the invite preview so we can
  // show the org name, pre-fill the email, and force signup mode.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const path = window.location.pathname || ''
    if (!path.startsWith('/join')) return
    const params = new URLSearchParams(window.location.search)
    const rawToken = params.get('token') || ''
    const token = sanitizePathParam(rawToken) // UUIDs are alnum+hyphens; also blocks injection
    if (!token) return
    const prefillEmail = (params.get('email') || '').toLowerCase().trim()
    if (prefillEmail) setEmail(prefillEmail)
    setMode('signup')
    rememberPendingInvite(token)
    ;(async () => {
      const preview = await getInvitationPreview(token)
      if (preview) {
        setInvite({ token, orgName: preview.orgName, email: preview.email, role: preview.role })
        if (!prefillEmail && preview.email) setEmail(preview.email)
      } else {
        setInvite({ token, orgName: null, email: prefillEmail, role: null })
      }
    })()
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
    if (loading || lockoutSeconds > 0) return // Debounce: block multiple rapid submissions
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
      else if (mode === 'signup') {
        // Enforce a minimum 3-second visual state to satisfy the requested specification delay
        await new Promise(resolve => setTimeout(resolve, 3000))
        const { data, error: err } = await signUp(email, password, fullName);
        if (err) { setError(err.message); setLoading(false); return };
        onAuth(data.user)
      }
      else { const { error: err } = await resetPassword(email); if (err) { setError(err.message); setLoading(false); return }; setMessage(txt.resetSent) }
    } catch (err) { setError(err.message || 'An error occurred') }
    setLoading(false)
  }

  // Shared classes — extracted for readability. Logical properties (ps/pe/ms/me,
  // text-start/end) so RTL falls out automatically when dir="rtl" is set above.
  // `!` prefix on text-content-primary forces !important, beating the unlayered
  // legacy `h1,h2,h3{color:var(--text-primary)}` rule in src/index.css.
  // `velo-auth-input` class scopes the -webkit-autofill override below.
  const inputClass = "velo-auth-input w-full h-11 ps-3 pe-3 rounded-md border border-stroke bg-surface-canvas text-content-primary placeholder:text-content-tertiary font-sans text-body focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 focus:ring-offset-0 transition-[border-color,box-shadow] duration-fast ease-standard"
  const labelClass = "block mb-1.5 text-body-sm font-medium text-content-secondary text-start"
  const linkBtnClass = "bg-transparent border-none p-0 cursor-pointer font-sans font-semibold text-accent-fg hover:text-accent-solid-hover transition-colors duration-fast ease-standard"

  return (
    <>
      <style>{`
        /* Scoped input overrides — beat the legacy unlayered rule in
           src/styles/theme.css ('input,textarea,select { ... !important }').
           Class+element specificity (0,0,1,1) beats bare element (0,0,0,1) at
           equal !important weight, so .velo-auth-input wins without touching
           theme.css. All colors resolve through --velo-* vars, so the
           [data-theme="dark"] selector swaps them correctly in dark mode. */
        .velo-auth-input {
          background: rgb(var(--velo-surface-canvas)) !important;
          color: rgb(var(--velo-text-primary)) !important;
          border-color: rgb(var(--velo-border-default)) !important;
        }
        .velo-auth-input::placeholder {
          color: rgb(var(--velo-text-tertiary)) !important;
          opacity: 1;
        }
        .velo-auth-input:focus {
          border-color: rgb(var(--velo-border-brand)) !important;
          box-shadow: 0 0 0 3px rgb(var(--velo-accent-solid) / 0.30) !important;
          outline: none !important;
        }
        .velo-auth-input:-webkit-autofill,
        .velo-auth-input:-webkit-autofill:hover,
        .velo-auth-input:-webkit-autofill:focus,
        .velo-auth-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px rgb(var(--velo-surface-canvas)) inset !important;
          -webkit-text-fill-color: rgb(var(--velo-text-primary)) !important;
          caret-color: rgb(var(--velo-text-primary));
          transition: background-color 600000s ease-in-out 0s, color 600000s ease-in-out 0s;
        }
      `}</style>

      <div dir={dir} className="relative min-h-screen bg-surface-canvas font-sans">

        {/* Language toggle — slim top-bar ghost, inline-end anchored (flips in RTL) */}
        <header className="absolute top-0 inset-x-0 flex justify-end px-5 md:px-8 py-4 z-10">
          <button
            type="button"
            onClick={() => setLang(l => l==='en'?'ar':'en')}
            className="-me-3 px-3 py-2 text-body-sm font-medium text-content-tertiary hover:text-content-primary transition-colors duration-fast ease-standard bg-transparent border-none cursor-pointer font-sans"
          >
            {txt.switchLang}
          </button>
        </header>

        <div className="min-h-screen flex flex-col items-center justify-center px-5 py-20">

          {/* Branding — ink glyph + wordmark + tagline, centered above the card */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-2 font-display text-[56px] font-bold leading-none !text-content-primary" aria-hidden="true">V</div>
            <h1 className="font-display text-h3 md:text-h2 !text-content-primary m-0 mb-1">Velo</h1>
            <p className="text-body-sm text-content-tertiary m-0">{txt.tagline}</p>
          </div>

          {/* Form card */}
          <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle">

            <h2 className="font-display text-h3 md:text-h2 !text-content-primary m-0 mb-1.5">
              {mode==='forgot' ? txt.resetPassword : mode==='signup' ? txt.signup : txt.welcome}
            </h2>
            <p className="text-body-sm text-content-tertiary m-0 mb-6">
              {mode==='forgot'
                ? (lang==='ar'?'أدخل بريدك الإلكتروني':'Enter your email for a reset link')
                : (lang==='ar'?'أدخل بياناتك للمتابعة':'Enter your details to continue')}
            </p>

            {invite && (
              <div className="mb-4 ps-3.5 pe-3.5 py-2.5 rounded-md bg-status-info-bg border border-status-info-border/30 text-status-info-fg text-body-sm leading-normal">
                {invite.orgName
                  ? (lang==='ar' ? `تمت دعوتك للانضمام إلى ${invite.orgName}` : `You've been invited to join ${invite.orgName}`)
                  : (lang==='ar' ? 'تمت دعوتك للانضمام إلى Velo CRM' : "You've been invited to join Velo CRM")}
                {invite.role && (
                  <div className="mt-0.5 text-caption font-normal text-content-tertiary">
                    {lang==='ar' ? `الدور: ${invite.role}` : `Role: ${invite.role}`}
                  </div>
                )}
              </div>
            )}

            {/* Demo mode note — neutral info, not mint (keep mint sparse) */}
            <div
              className="mb-4 ps-3 pe-3 py-2 rounded-md bg-surface-sunken border border-stroke-subtle text-content-secondary text-caption font-normal leading-normal"
              role="note"
            >
              {txt.demoNote}
            </div>

            {error && (
              <div
                className="mb-3 flex items-center gap-2 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-body-sm"
                role="alert"
              >
                {lockoutSeconds > 0 && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                    <rect x="5" y="7" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M6 7V5a2 2 0 1 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  </svg>
                )}
                <span>{error}</span>
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div className="mb-3 flex items-center justify-center gap-1.5 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-caption text-center">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>{lang==='ar' ? `الوقت المتبقي: ${lockoutSeconds} ثانية` : `Time remaining: ${lockoutSeconds}s`}</span>
              </div>
            )}

            {message && (
              <div className="mb-3 ps-3 pe-3 py-2.5 rounded-md bg-status-success-bg border border-status-success-border/30 text-status-success-fg text-body-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {mode==='signup' && (
                <div>
                  <label className={labelClass}>{txt.fullName}</label>
                  <input value={fullName} onChange={e=>setFullName(e.target.value)} className={inputClass}/>
                </div>
              )}

              <div>
                <label className={labelClass}>{txt.email}</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@company.com" className={inputClass}/>
              </div>

              {mode!=='forgot' && (
                <div>
                  <label className={labelClass}>{txt.password}</label>
                  <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" className={inputClass}/>
                </div>
              )}

              {mode==='login' && (
                <div className="text-end">
                  <button
                    type="button"
                    onClick={()=>{setMode('forgot');setError('');setMessage('');setLockoutSeconds(0)}}
                    className={`${linkBtnClass} text-caption`}
                  >
                    {txt.forgotPassword}
                  </button>
                </div>
              )}

              {/* Primary CTA — the single primary on this screen. Quieter than inputs by design. */}
              <button
                type="submit"
                disabled={loading || lockoutSeconds > 0}
                className="w-full h-11 mt-2 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent font-sans text-body font-medium transition-colors duration-fast ease-standard focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30 focus-visible:ring-offset-0 disabled:bg-surface-sunken disabled:text-content-tertiary disabled:cursor-not-allowed disabled:hover:bg-surface-sunken"
              >
                {loading
                  ? (mode==='signup' ? (lang==='ar'?'جاري إنشاء الحساب...':'Creating account...') : (lang==='ar'?'جارٍ التحميل...':'Loading...'))
                  : mode==='forgot' ? txt.resetPassword
                  : mode==='signup' ? txt.signup
                  : txt.login}
              </button>
            </form>

            {/* Mode-switch links */}
            <div className="text-center mt-5 text-body-sm text-content-tertiary">
              {mode==='forgot' ? (
                <button type="button" onClick={()=>{setMode('login');setError('');setMessage('');setLockoutSeconds(0)}} className={linkBtnClass}>
                  {txt.backToLogin}
                </button>
              ) : mode==='login' ? (
                <span>
                  {txt.noAccount}{' '}
                  <button type="button" onClick={()=>{setMode('signup');setError('');setMessage('');setLockoutSeconds(0)}} className={linkBtnClass}>
                    {txt.signupLink}
                  </button>
                </span>
              ) : (
                <span>
                  {txt.hasAccount}{' '}
                  <button type="button" onClick={()=>{setMode('login');setError('');setMessage('');setLockoutSeconds(0)}} className={linkBtnClass}>
                    {txt.loginLink}
                  </button>
                </span>
              )}
            </div>

            <div className="mt-7 text-center text-caption font-normal text-content-tertiary">&copy; 2026 Velo CRM</div>
          </div>
        </div>
      </div>
    </>
  )
}
