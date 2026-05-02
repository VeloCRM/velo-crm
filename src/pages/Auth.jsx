import { useState, useEffect } from 'react'
import { signIn, resetPassword } from '../lib/auth'
import { checkLoginAttempt, getLoginLockoutRemaining } from '../lib/sanitize'
import { GlassCard, Button, Input, Modal } from '../components/ui'

/* ── Inline icons ─────────────────────────────────────────────────────── */
const MailIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)
const LockIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const SunIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)
const MoonIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)
const GlobeIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

const STRINGS = {
  en: {
    welcome: 'Welcome to Velo',
    tagline: 'Dental practice management',
    welcomeSub: 'Enter your details to continue',
    forgotSub: 'Enter your email and we\'ll send a reset link',
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
    timeRemaining: 'Time remaining:',
    loading: 'Loading…',
    orDivider: 'or',
    newToVelo: 'New to Velo?',
    createTestAccount: 'Create test account',
    testAccountSubtitle: 'Pre-seeded with sample patients, appointments and treatment plans. Resets after 14 days.',
    creatingTestAccount: 'Setting up your test clinic…',
    realAccountQuestion: 'Want a real clinic account?',
    contactOperator: 'Contact the operator',
    operatorModalTitle: 'Get in touch',
    operatorModalBody: 'Real clinic accounts are set up by the operator. Reach out via the contact below.',
    operatorContactMissing: 'Operator contact has not been configured. Please check back later.',
    close: 'Close',
    themeLight: 'Switch to light mode',
    themeDark:  'Switch to dark mode',
  },
  ar: {
    welcome: 'مرحباً بك في فيلو',
    tagline: 'إدارة عيادة الأسنان',
    welcomeSub: 'أدخل بياناتك للمتابعة',
    forgotSub: 'أدخل بريدك الإلكتروني وسنرسل رابط إعادة التعيين',
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
    timeRemaining: 'الوقت المتبقي:',
    loading: 'جارٍ التحميل...',
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
    themeLight: 'الوضع الفاتح',
    themeDark:  'الوضع الداكن',
  },
}

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
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light')

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
  const txt = STRINGS[lang] || STRINGS.en

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

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

  const headerTitle = mode === 'forgot' ? txt.resetPassword : txt.welcome
  const headerSub   = mode === 'forgot' ? txt.forgotSub    : txt.welcomeSub
  const isThemeDark = theme === 'dark'

  return (
    <div dir={dir} className="ds-root relative min-h-screen w-full overflow-y-auto">
      {/* Ambient halo behind everything */}
      <div className="ds-ambient" />

      {/* Top-right utility bar (lang + theme toggles) */}
      <header className="absolute top-0 inset-x-0 flex justify-end items-center gap-1 px-5 md:px-8 py-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
          iconStart={GlobeIcon}
          aria-label={txt.switchLang}
        >
          {txt.switchLang}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          iconStart={isThemeDark ? SunIcon : MoonIcon}
          aria-label={isThemeDark ? txt.themeLight : txt.themeDark}
        />
      </header>

      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-20">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <div
            aria-hidden="true"
            className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-2xl shadow-glass-lg navy-gradient text-white text-2xl font-bold"
          >
            V
          </div>
          <h1 className="text-3xl font-bold text-navy-800 leading-tight tracking-tight m-0 mb-1">
            Velo
          </h1>
          <p className="text-sm text-navy-500 m-0">{txt.tagline}</p>
        </div>

        {/* Main card */}
        <GlassCard padding="lg" className="w-full max-w-md md:p-10">
          <h2 className="text-2xl font-semibold text-navy-800 leading-tight tracking-tight m-0 mb-1.5">
            {headerTitle}
          </h2>
          <p className="text-sm text-navy-500 m-0 mb-6 leading-relaxed">{headerSub}</p>

          {/* Error banner — soft red glass */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-glass border border-rose-200 bg-rose-50/80 backdrop-blur-glass-sm px-3.5 py-2.5 text-sm text-rose-700 leading-snug"
            >
              {error}
            </div>
          )}

          {/* Lockout countdown — separate band so it remains visible while error shrinks */}
          {lockoutSeconds > 0 && (
            <div
              role="status"
              className="mb-4 rounded-glass border border-rose-200 bg-rose-50/60 px-3.5 py-2 text-center text-xs font-medium text-rose-700"
            >
              {txt.timeRemaining} {lockoutSeconds}{lang === 'ar' ? 'ث' : 's'}
            </div>
          )}

          {/* Success banner */}
          {message && (
            <div
              role="status"
              className="mb-4 rounded-glass border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-sm text-emerald-700"
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label={txt.email}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              iconStart={MailIcon}
              autoComplete="email"
              disabled={creatingTest}
              dir="ltr"
            />

            {mode !== 'forgot' && (
              <div className="flex flex-col gap-1.5">
                <Input
                  label={txt.password}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  iconStart={LockIcon}
                  autoComplete="current-password"
                  disabled={creatingTest}
                  dir="ltr"
                />
                <div className="text-end">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setMessage(''); setLockoutSeconds(0) }}
                    disabled={creatingTest}
                    className="text-xs font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 transition-colors disabled:opacity-50"
                  >
                    {txt.forgotPassword}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-1"
              loading={loading}
              disabled={creatingTest || lockoutSeconds > 0}
            >
              {loading
                ? txt.loading
                : mode === 'forgot' ? txt.resetPassword : txt.login}
            </Button>
          </form>

          {mode === 'forgot' && (
            <div className="text-center mt-5">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setMessage(''); setLockoutSeconds(0) }}
                className="text-sm font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 transition-colors"
              >
                {txt.backToLogin}
              </button>
            </div>
          )}

          {mode === 'login' && (
            <>
              {/* OR divider */}
              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-navy-100/80" />
                <span className="text-[10px] tracking-[0.18em] font-semibold uppercase text-navy-400">
                  {txt.orDivider}
                </span>
                <div className="h-px flex-1 bg-navy-100/80" />
              </div>

              <p className="text-sm font-semibold text-navy-800 text-start mb-1">
                {txt.newToVelo}
              </p>
              <p className="text-xs text-navy-500 text-start mb-3 leading-relaxed">
                {txt.testAccountSubtitle}
              </p>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleCreateTestAccount}
                loading={creatingTest}
                disabled={loading}
              >
                {creatingTest ? txt.creatingTestAccount : txt.createTestAccount}
              </Button>

              <div className="mt-6 pt-5 border-t border-navy-100/60 text-center">
                <p className="text-xs text-navy-500 mb-2">{txt.realAccountQuestion}</p>
                <button
                  type="button"
                  onClick={() => setShowOperatorModal(true)}
                  className="text-sm font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 transition-colors"
                >
                  {txt.contactOperator}
                </button>
              </div>
            </>
          )}

          <div className="mt-7 text-center text-[11px] font-normal text-navy-400">
            &copy; 2026 Velo CRM
          </div>
        </GlassCard>
      </div>

      <Modal
        open={showOperatorModal}
        onClose={() => setShowOperatorModal(false)}
        title={txt.operatorModalTitle}
        closeLabel={txt.close}
        size="md"
      >
        <p className="text-sm text-navy-700 leading-relaxed mb-4">{txt.operatorModalBody}</p>
        {operatorContact ? (
          <a
            href={operatorContact}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center h-11 leading-[44px] rounded-glass navy-gradient text-white font-medium shadow-navy-glow no-underline transition-all hover:-translate-y-px"
            dir="ltr"
          >
            {operatorContact.replace(/^https?:\/\//, '').replace(/^mailto:/, '').replace(/^tel:/, '')}
          </a>
        ) : (
          <div className="rounded-glass border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-sm text-amber-700">
            {txt.operatorContactMissing}
          </div>
        )}
      </Modal>
    </div>
  )
}
