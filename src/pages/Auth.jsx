import { useState, useEffect } from 'react'
import { signIn, resetPassword } from '../lib/auth'
import { checkLoginAttempt, getLoginLockoutRemaining } from '../lib/sanitize'

export default function AuthPage({ onAuth, lang, setLang }) {
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [creatingTest, setCreatingTest] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [showOperatorModal, setShowOperatorModal] = useState(false)

  const operatorContact = import.meta.env.VITE_OPERATOR_CONTACT || ''

  // Countdown timer for login lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const timer = setInterval(() => {
      const remaining = getLoginLockoutRemaining()
      if (remaining <= 0) { setLockoutSeconds(0); setError('') }
      else setLockoutSeconds(remaining)
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutSeconds])

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  const t = {
    en: {
      welcome: 'Welcome to Velo',
      tagline: 'Dental practice management',
      login: 'Sign In',
      forgotPassword: 'Forgot password?',
      resetPassword: 'Reset Password',
      email: 'Email Address',
      password: 'Password',
      backToLogin: 'Back to sign in',
      resetSent: 'Password reset email sent.',
      emailRequired: 'Email is required',
      passwordRequired: 'Password is required (min 6 characters)',
      switchLang: 'العربية',
      lockedOut: 'Too many login attempts. Please wait',
      seconds: 'seconds',
      orDivider: 'or',
      newToVelo: 'New to Velo?',
      createTestAccount: 'Create test account',
      testAccountSubtitle: 'Pre-seeded with sample patients, appointments and treatment plans. Resets after 14 days.',
      creatingTestAccount: 'Setting up your test clinic...',
      realAccountQuestion: 'Want a real clinic account?',
      contactOperator: 'Contact the operator',
      operatorModalTitle: 'Get in touch',
      operatorModalBody: 'Real clinic accounts are set up by the operator. Reach out via the contact below.',
      operatorContactMissing: 'Operator contact has not been configured. Please check back later.',
      close: 'Close',
    },
    ar: {
      welcome: 'مرحباً بك في فيلو',
      tagline: 'إدارة عيادة الأسنان',
      login: 'تسجيل الدخول',
      forgotPassword: 'نسيت كلمة المرور؟',
      resetPassword: 'استعادة كلمة المرور',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      backToLogin: 'العودة لتسجيل الدخول',
      resetSent: 'تم إرسال رابط إعادة التعيين.',
      emailRequired: 'البريد الإلكتروني مطلوب',
      passwordRequired: 'كلمة المرور مطلوبة (6 أحرف)',
      switchLang: 'English',
      lockedOut: 'محاولات كثيرة. يرجى الانتظار',
      seconds: 'ثانية',
      orDivider: 'أو',
      newToVelo: 'جديد في فيلو؟',
      createTestAccount: 'إنشاء حساب تجريبي',
      testAccountSubtitle: 'يتضمن مرضى ومواعيد وخطط علاج تجريبية. يُعاد الضبط بعد 14 يوماً.',
      creatingTestAccount: 'جاري تجهيز عيادتك التجريبية...',
      realAccountQuestion: 'تريد حساب عيادة حقيقي؟',
      contactOperator: 'تواصل مع المشغل',
      operatorModalTitle: 'تواصل معنا',
      operatorModalBody: 'يقوم المشغل بإنشاء حسابات العيادات الحقيقية. تواصل عبر القناة أدناه.',
      operatorContactMissing: 'لم يتم إعداد جهة اتصال المشغل بعد. يرجى المحاولة لاحقاً.',
      close: 'إغلاق',
    },
  }
  const txt = t[lang] || t.en

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading || lockoutSeconds > 0) return
    setError(''); setMessage('')

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

    setLoading(true)
    try {
      if (mode === 'login') {
        const { data, error: err } = await signIn(email, password)
        if (err) { setError(err.message); setLoading(false); return }
        onAuth(data.user)
      } else {
        const { error: err } = await resetPassword(email)
        if (err) { setError(err.message); setLoading(false); return }
        setMessage(txt.resetSent)
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    }
    setLoading(false)
  }

  const handleCreateTestAccount = async () => {
    if (creatingTest || loading) return
    setError(''); setMessage('')
    setCreatingTest(true)
    try {
      const res = await fetch('/api/auth/create-test-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Test account creation failed (HTTP ${res.status})`)
      }
      const { email: testEmail, password: testPassword } = body
      const { data, error: err } = await signIn(testEmail, testPassword)
      if (err) throw new Error(err.message)
      onAuth(data.user)
    } catch (err) {
      setError(err.message || 'Could not create test account')
      setCreatingTest(false)
    }
    // Note: we keep `creatingTest` true on success — onAuth navigates away
  }

  const inputClass = "velo-auth-input w-full h-11 ps-3 pe-3 rounded-md border border-stroke bg-surface-canvas text-content-primary placeholder:text-content-tertiary font-sans text-body focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 focus:ring-offset-0 transition-[border-color,box-shadow] duration-fast ease-standard"
  const labelClass = "block mb-1.5 text-body-sm font-medium text-content-secondary text-start"
  const linkBtnClass = "bg-transparent border-none p-0 cursor-pointer font-sans font-semibold text-accent-fg hover:text-accent-solid-hover transition-colors duration-fast ease-standard"

  return (
    <>
      <style>{`
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
        <header className="absolute top-0 inset-x-0 flex justify-end px-5 md:px-8 py-4 z-10">
          <button
            type="button"
            onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
            className="-me-3 px-3 py-2 text-body-sm font-medium text-content-tertiary hover:text-content-primary transition-colors duration-fast ease-standard bg-transparent border-none cursor-pointer font-sans"
          >
            {txt.switchLang}
          </button>
        </header>

        <div className="min-h-screen flex flex-col items-center justify-center px-5 py-20">
          <div className="text-center mb-8">
            <div className="mx-auto mb-2 font-display text-[56px] font-bold leading-none !text-content-primary" aria-hidden="true">V</div>
            <h1 className="font-display text-h3 md:text-h2 !text-content-primary m-0 mb-1">Velo</h1>
            <p className="text-body-sm text-content-tertiary m-0">{txt.tagline}</p>
          </div>

          <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle">
            <h2 className="font-display text-h3 md:text-h2 !text-content-primary m-0 mb-1.5">
              {mode === 'forgot' ? txt.resetPassword : txt.welcome}
            </h2>
            <p className="text-body-sm text-content-tertiary m-0 mb-6">
              {mode === 'forgot'
                ? (lang === 'ar' ? 'أدخل بريدك الإلكتروني' : 'Enter your email for a reset link')
                : (lang === 'ar' ? 'أدخل بياناتك للمتابعة' : 'Enter your details to continue')}
            </p>

            {error && (
              <div
                className="mb-3 flex items-center gap-2 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-body-sm"
                role="alert"
              >
                <span>{error}</span>
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div className="mb-3 flex items-center justify-center gap-1.5 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-caption text-center">
                <span>{lang === 'ar' ? `الوقت المتبقي: ${lockoutSeconds} ثانية` : `Time remaining: ${lockoutSeconds}s`}</span>
              </div>
            )}

            {message && (
              <div className="mb-3 ps-3 pe-3 py-2.5 rounded-md bg-status-success-bg border border-status-success-border/30 text-status-success-fg text-body-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className={labelClass}>{txt.email}</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@clinic.com"
                  className={inputClass}
                  disabled={creatingTest}
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className={labelClass}>{txt.password}</label>
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    className={inputClass}
                    disabled={creatingTest}
                  />
                </div>
              )}

              {mode === 'login' && (
                <div className="text-end">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setMessage(''); setLockoutSeconds(0) }}
                    className={`${linkBtnClass} text-caption`}
                    disabled={creatingTest}
                  >
                    {txt.forgotPassword}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || creatingTest || lockoutSeconds > 0}
                className="w-full h-11 mt-2 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent font-sans text-body font-medium transition-colors duration-fast ease-standard focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30 focus-visible:ring-offset-0 disabled:bg-surface-sunken disabled:text-content-tertiary disabled:cursor-not-allowed disabled:hover:bg-surface-sunken"
              >
                {loading
                  ? (lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...')
                  : mode === 'forgot' ? txt.resetPassword
                  : txt.login}
              </button>
            </form>

            {mode === 'forgot' && (
              <div className="text-center mt-5 text-body-sm text-content-tertiary">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setMessage(''); setLockoutSeconds(0) }}
                  className={linkBtnClass}
                >
                  {txt.backToLogin}
                </button>
              </div>
            )}

            {mode === 'login' && (
              <>
                <div className="my-6 flex items-center gap-3" aria-hidden="true">
                  <div className="h-px flex-1 bg-stroke-subtle" />
                  <span className="text-caption text-content-tertiary uppercase tracking-wider">{txt.orDivider}</span>
                  <div className="h-px flex-1 bg-stroke-subtle" />
                </div>

                <div className="mb-1 text-body-sm font-medium text-content-primary text-start">
                  {txt.newToVelo}
                </div>
                <p className="mb-3 text-caption text-content-tertiary text-start leading-normal">
                  {txt.testAccountSubtitle}
                </p>
                <button
                  type="button"
                  onClick={handleCreateTestAccount}
                  disabled={creatingTest || loading}
                  className="w-full h-11 rounded-md border border-stroke bg-surface-canvas hover:bg-surface-sunken text-content-primary font-sans text-body font-medium transition-colors duration-fast ease-standard focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingTest ? txt.creatingTestAccount : txt.createTestAccount}
                </button>

                <div className="mt-6 pt-5 border-t border-stroke-subtle text-center">
                  <p className="text-caption text-content-tertiary mb-2">{txt.realAccountQuestion}</p>
                  <button
                    type="button"
                    onClick={() => setShowOperatorModal(true)}
                    className={`${linkBtnClass} text-body-sm`}
                  >
                    {txt.contactOperator}
                  </button>
                </div>
              </>
            )}

            <div className="mt-7 text-center text-caption font-normal text-content-tertiary">&copy; 2026 Velo CRM</div>
          </div>
        </div>

        {showOperatorModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setShowOperatorModal(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-7 shadow-3 border border-stroke-subtle"
              onClick={e => e.stopPropagation()}
              dir={dir}
            >
              <h3 className="font-display text-h4 !text-content-primary m-0 mb-2">{txt.operatorModalTitle}</h3>
              <p className="text-body-sm text-content-secondary m-0 mb-4 leading-normal">{txt.operatorModalBody}</p>

              {operatorContact ? (
                <a
                  href={operatorContact}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center h-11 leading-[44px] rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent font-sans text-body font-medium transition-colors duration-fast ease-standard no-underline"
                >
                  {operatorContact.replace(/^https?:\/\//, '').replace(/^mailto:/, '').replace(/^tel:/, '')}
                </a>
              ) : (
                <div className="ps-3 pe-3 py-2.5 rounded-md bg-status-warning-bg border border-status-warning-border/30 text-status-warning-fg text-body-sm">
                  {txt.operatorContactMissing}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowOperatorModal(false)}
                className="mt-4 w-full h-10 rounded-md border border-stroke bg-surface-canvas hover:bg-surface-sunken text-content-secondary font-sans text-body-sm font-medium transition-colors duration-fast ease-standard"
              >
                {txt.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
