import { useEffect, useState } from 'react'
import { signIn, signUp } from '../lib/auth'
import {
  acceptInvitation,
  getInvitationPreview,
  rememberPendingInvite,
  getPendingInvite,
  clearPendingInvite,
} from '../lib/invitations'
import { sanitizePathParam, checkLoginAttempt, getLoginLockoutRemaining } from '../lib/sanitize'
import {
  GlassCard, Button, Input, Badge, EmptyState, SkeletonGlass,
} from '../components/ui'

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
const UserIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)
const GlobeIcon = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)
const InvalidIllustration = (
  <span className="relative grid place-items-center w-full h-full">
    <span className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-100 via-white to-amber-100 blur-md opacity-80" />
    <span className="relative w-20 h-20 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 grid place-items-center shadow-glass-lg">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </span>
  </span>
)

const STRINGS = {
  en: {
    welcomeTitle: 'You\'ve been invited',
    welcomeOrg: (org) => `Join ${org}`,
    welcomeNoOrg: 'Join the team',
    asRole: 'as',
    signInPrompt: (email) => `Sign in or create an account with ${email} to accept.`,
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    fullNameLabel: 'Full name',
    emailLocked: 'This email is fixed by the invitation.',
    expiresIn: (days) => `Expires in ${days} day${days === 1 ? '' : 's'}.`,
    expired: 'Expires shortly.',
    accept: 'Accept invitation',
    creating: 'Creating account…',
    accepting: 'Accepting invitation…',
    haveAccount: 'Already have an account?',
    noAccount: 'New here?',
    signIn: 'Sign in',
    signUp: 'Create account',
    invalidTitle: 'Invitation invalid',
    invalidBody: 'This invitation link is invalid or has expired. Contact the clinic owner for a new link.',
    backToLogin: 'Back to sign in',
    retry: 'Retry',
    appName: 'Velo',
    tagline: 'Dental practice management',
    switchLang: 'العربية',
    lockedOut: 'Too many login attempts. Please wait',
    seconds: 'seconds',
    passwordTooShort: 'Password must be at least 6 characters',
    loadingInvite: 'Loading invitation…',
  },
  ar: {
    welcomeTitle: 'تمت دعوتك',
    welcomeOrg: (org) => `الانضمام إلى ${org}`,
    welcomeNoOrg: 'الانضمام إلى الفريق',
    asRole: 'بدور',
    signInPrompt: (email) => `سجل الدخول أو أنشئ حساباً باستخدام ${email} لقبول الدعوة.`,
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    fullNameLabel: 'الاسم الكامل',
    emailLocked: 'هذا البريد محدد بواسطة الدعوة.',
    expiresIn: (days) => `تنتهي خلال ${days} يوم.`,
    expired: 'تنتهي قريباً.',
    accept: 'قبول الدعوة',
    creating: 'جاري إنشاء الحساب...',
    accepting: 'جاري قبول الدعوة...',
    haveAccount: 'لديك حساب بالفعل؟',
    noAccount: 'جديد هنا؟',
    signIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
    invalidTitle: 'الدعوة غير صالحة',
    invalidBody: 'هذا الرابط غير صالح أو منتهي الصلاحية. تواصل مع مالك العيادة للحصول على رابط جديد.',
    backToLogin: 'العودة لتسجيل الدخول',
    retry: 'إعادة المحاولة',
    appName: 'فيلو',
    tagline: 'إدارة عيادة الأسنان',
    switchLang: 'English',
    lockedOut: 'محاولات كثيرة. يرجى الانتظار',
    seconds: 'ثانية',
    passwordTooShort: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    loadingInvite: 'جاري تحميل الدعوة...',
  },
}

const ROLE_LABEL = {
  owner:        { en: 'Owner',        ar: 'مالك' },
  doctor:       { en: 'Doctor',       ar: 'طبيب' },
  receptionist: { en: 'Receptionist', ar: 'موظف استقبال' },
  assistant:    { en: 'Assistant',    ar: 'مساعد' },
}

// Map role → Badge tone (matches the design system).
const ROLE_TONE = {
  owner:        'navy',
  doctor:       'cyan',
  receptionist: 'success',
  assistant:    'neutral',
}

function daysUntil(iso) {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export default function JoinPage({ user, onAuth, lang, setLang, navigate }) {
  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'
  const txt = STRINGS[lang] || STRINGS.en

  const [token, setToken] = useState(null)
  const [preview, setPreview] = useState(null)        // { orgName, email, role, expiresAt, status }
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState(false)

  const [mode, setMode] = useState('signup')          // 'signin' | 'signup'
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  // ── 1. Read token from URL on mount; remember in localStorage ──────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const rawToken = params.get('token') || ''
    const safe = sanitizePathParam(rawToken)
    if (!safe) {
      const stored = getPendingInvite()
      if (stored) {
        setToken(stored)
      } else {
        setPreviewError(true)
        setPreviewLoading(false)
      }
      return
    }
    rememberPendingInvite(safe)
    setToken(safe)
  }, [])

  // ── 2. Fetch preview ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const row = await getInvitationPreview(token)
        if (cancelled) return
        if (!row) {
          setPreviewError(true)
          setPreview(null)
        } else {
          setPreview(row)
          setPreviewError(false)
        }
      } catch {
        if (!cancelled) {
          setPreviewError(true)
          setPreview(null)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // ── 3. Lockout countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const id = setInterval(() => {
      const remaining = getLoginLockoutRemaining()
      if (remaining <= 0) { setLockoutSeconds(0); setError('') }
      else setLockoutSeconds(remaining)
    }, 1000)
    return () => clearInterval(id)
  }, [lockoutSeconds])

  // ── 4. Once a user is signed in AND we have a valid token, accept ───────
  useEffect(() => {
    if (!user || !token || !preview || preview.status !== 'pending') return
    let cancelled = false
    ;(async () => {
      setAccepting(true)
      setAcceptError('')
      try {
        await acceptInvitation(token)
        if (cancelled) return
        clearPendingInvite()
        if (navigate) navigate('/dashboard', { replace: true })
        else if (typeof window !== 'undefined') window.location.assign('/dashboard')
      } catch (err) {
        if (cancelled) return
        setAcceptError(err?.message || 'Could not accept invitation')
      } finally {
        if (!cancelled) setAccepting(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, token, preview, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || lockoutSeconds > 0 || !preview) return
    setError('')

    if (mode === 'signin') {
      if (!checkLoginAttempt()) {
        const remaining = getLoginLockoutRemaining()
        setLockoutSeconds(remaining)
        setError(`${txt.lockedOut} ${remaining} ${txt.seconds}`)
        return
      }
    }
    if (password.length < 6) {
      setError(txt.passwordTooShort)
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { data, error: err } = await signIn(preview.email, password)
        if (err) { setError(err.message); return }
        if (data?.user && onAuth) onAuth(data.user)
      } else {
        const { data, error: err } = await signUp(preview.email, password, fullName)
        if (err) { setError(err.message); return }
        if (data?.user && onAuth) onAuth(data.user)
      }
    } catch (err) {
      setError(err?.message || 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── State: invalid / expired ─────────────────────────────────────────── */
  const renderInvalid = () => (
    <GlassCard padding="lg" className="w-full max-w-md md:p-10">
      <EmptyState
        illustration={InvalidIllustration}
        title={txt.invalidTitle}
        description={txt.invalidBody}
        action={
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              clearPendingInvite()
              if (navigate) navigate('/', { replace: true })
              else if (typeof window !== 'undefined') window.location.assign('/')
            }}
          >
            {txt.backToLogin}
          </Button>
        }
      />
    </GlassCard>
  )

  /* ── State: signed-in, accepting (or accept failed) ───────────────────── */
  const renderAccepting = () => {
    const roleLabel = ROLE_LABEL[preview?.role]?.[lang] || preview?.role
    const tone = ROLE_TONE[preview?.role] || 'navy'
    return (
      <GlassCard padding="lg" className="w-full max-w-md md:p-10 text-center">
        <h2 className="text-2xl font-semibold text-navy-800 m-0 mb-2 leading-tight">
          {preview?.orgName ? txt.welcomeOrg(preview.orgName) : txt.welcomeNoOrg}
        </h2>
        <div className="flex justify-center mb-5">
          <Badge tone={tone} dot>{roleLabel}</Badge>
        </div>
        {accepting ? (
          <p className="text-sm text-navy-500">{txt.accepting}</p>
        ) : acceptError ? (
          <>
            <div
              role="alert"
              className="mb-4 rounded-glass border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {acceptError}
            </div>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => { setAcceptError(''); setAccepting(true); setPreview({ ...preview }) }}
            >
              {txt.retry}
            </Button>
          </>
        ) : (
          <p className="text-sm text-navy-500">{txt.accepting}</p>
        )}
      </GlassCard>
    )
  }

  /* ── State: signed-out, valid invite — embedded auth form ─────────────── */
  const renderAuthForm = () => {
    if (!preview) return null
    const days       = daysUntil(preview.expiresAt)
    const roleLabel  = ROLE_LABEL[preview.role]?.[lang] || preview.role
    const tone       = ROLE_TONE[preview.role] || 'navy'
    const orgHeading = preview.orgName ? txt.welcomeOrg(preview.orgName) : txt.welcomeNoOrg

    return (
      <GlassCard padding="lg" className="w-full max-w-md md:p-10">
        {/* Invite header */}
        <div className="mb-6 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-cyan-700">
            <span>{txt.welcomeTitle}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-accent-cyan-200" />
          </div>
          <h2 className="text-2xl font-semibold text-navy-800 m-0 leading-tight tracking-tight">
            {orgHeading}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-navy-500">{txt.asRole}</span>
            <Badge tone={tone} dot>{roleLabel}</Badge>
            <span className="text-xs text-navy-400 ms-1">
              · {days > 0 ? txt.expiresIn(days) : txt.expired}
            </span>
          </div>
        </div>

        <p className="text-sm text-navy-600 leading-relaxed mb-5" dir={dir}>
          {txt.signInPrompt(preview.email)}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-glass border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <Input
              label={txt.fullNameLabel}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              iconStart={UserIcon}
              autoComplete="name"
              disabled={submitting}
            />
          )}

          <Input
            label={txt.emailLabel}
            value={preview.email}
            readOnly
            iconStart={MailIcon}
            helper={txt.emailLocked}
            dir="ltr"
          />

          <Input
            label={txt.passwordLabel}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            iconStart={LockIcon}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            disabled={submitting}
            dir="ltr"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-1"
            loading={submitting}
            disabled={lockoutSeconds > 0}
          >
            {submitting
              ? (mode === 'signup' ? txt.creating : (lang === 'ar' ? 'جارٍ التحميل...' : 'Loading…'))
              : txt.accept}
          </Button>
        </form>

        <div className="text-center mt-5 text-sm text-navy-500">
          {mode === 'signin' ? (
            <span>
              {txt.noAccount}{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError('') }}
                className="font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 transition-colors"
              >
                {txt.signUp}
              </button>
            </span>
          ) : (
            <span>
              {txt.haveAccount}{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError('') }}
                className="font-semibold text-accent-cyan-700 hover:text-accent-cyan-800 transition-colors"
              >
                {txt.signIn}
              </button>
            </span>
          )}
        </div>
      </GlassCard>
    )
  }

  /* ── State: loading preview ───────────────────────────────────────────── */
  const renderLoading = () => (
    <GlassCard padding="lg" className="w-full max-w-md md:p-10">
      <div className="flex flex-col gap-4">
        <SkeletonGlass shape="title" className="w-1/2" />
        <SkeletonGlass shape="text"  className="w-2/3" />
        <SkeletonGlass shape="block" className="w-full" />
        <SkeletonGlass shape="text"  className="w-3/4" />
        <p className="text-sm text-navy-500 text-center mt-2">{txt.loadingInvite}</p>
      </div>
    </GlassCard>
  )

  return (
    <div dir={dir} className="ds-root relative min-h-screen w-full overflow-y-auto">
      <div className="ds-ambient" />

      {/* Lang toggle (no theme toggle here — Join is a one-shot landing) */}
      <header className="absolute top-0 inset-x-0 flex justify-end items-center gap-1 px-5 md:px-8 py-4 z-10">
        {setLang && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
            iconStart={GlobeIcon}
            aria-label={txt.switchLang}
          >
            {txt.switchLang}
          </Button>
        )}
      </header>

      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-20">
        {/* Brand mark — same anatomy as Auth so the visual handoff is seamless */}
        <div className="text-center mb-8">
          <div
            aria-hidden="true"
            className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-2xl shadow-glass-lg navy-gradient text-white text-2xl font-bold"
          >
            V
          </div>
          <h1 className="text-3xl font-bold text-navy-800 leading-tight tracking-tight m-0 mb-1">
            {txt.appName}
          </h1>
          <p className="text-sm text-navy-500 m-0">{txt.tagline}</p>
        </div>

        {previewLoading
          ? renderLoading()
          : previewError || !preview
            ? renderInvalid()
            : user
              ? renderAccepting()
              : renderAuthForm()}
      </div>
    </div>
  )
}
