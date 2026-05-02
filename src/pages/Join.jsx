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

const STRINGS = {
  en: {
    welcomeTitle: 'You\'ve been invited',
    welcomeBody: (org, role) => `${org} added you as ${role}.`,
    welcomeBodyNoOrg: (role) => `You've been invited to join as ${role}.`,
    signInPrompt: 'Sign in or create your account to accept.',
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
    invalidTitle: 'This invitation isn\'t valid',
    invalidBody: 'The link is missing, expired, or has already been used. Ask the clinic owner for a new one.',
    backToLogin: 'Back to sign in',
    retry: 'Retry',
    appName: 'Velo',
    tagline: 'Dental practice management',
    switchLang: 'العربية',
    lockedOut: 'Too many login attempts. Please wait',
    seconds: 'seconds',
    passwordTooShort: 'Password must be at least 6 characters',
  },
  ar: {
    welcomeTitle: 'تمت دعوتك',
    welcomeBody: (org, role) => `${org} أضافك بدور ${role}.`,
    welcomeBodyNoOrg: (role) => `تمت دعوتك للانضمام بدور ${role}.`,
    signInPrompt: 'سجل الدخول أو أنشئ حساباً لقبول الدعوة.',
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
    invalidTitle: 'هذه الدعوة غير صالحة',
    invalidBody: 'الرابط مفقود أو منتهي أو تم استخدامه بالفعل. اطلب رابطاً جديداً من مالك العيادة.',
    backToLogin: 'العودة لتسجيل الدخول',
    retry: 'إعادة المحاولة',
    appName: 'فيلو',
    tagline: 'إدارة عيادة الأسنان',
    switchLang: 'English',
    lockedOut: 'محاولات كثيرة. يرجى الانتظار',
    seconds: 'ثانية',
    passwordTooShort: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
  },
}

const ROLE_LABEL = {
  owner: { en: 'owner', ar: 'مالك' },
  doctor: { en: 'doctor', ar: 'طبيب' },
  receptionist: { en: 'receptionist', ar: 'موظف استقبال' },
  assistant: { en: 'assistant', ar: 'مساعد' },
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
      // Try replay from localStorage in case the user closed/reopened the tab.
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

  const inputClass = "w-full h-11 ps-3 pe-3 rounded-md border border-stroke bg-surface-canvas text-content-primary placeholder:text-content-tertiary font-sans text-body focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 transition-[border-color,box-shadow] duration-fast ease-standard"
  const labelClass = "block mb-1.5 text-body-sm font-medium text-content-secondary text-start"
  const linkBtnClass = "bg-transparent border-none p-0 cursor-pointer font-sans font-semibold text-accent-fg hover:text-accent-solid-hover transition-colors duration-fast ease-standard"

  // ── Render: invalid / expired ─────────────────────────────────────────────
  const renderInvalid = () => (
    <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 className="font-display text-h3 !text-content-primary m-0 mb-2">{txt.invalidTitle}</h2>
        <p className="text-body-sm text-content-secondary leading-relaxed m-0 mb-5">{txt.invalidBody}</p>
        <button
          type="button"
          onClick={() => {
            clearPendingInvite()
            if (navigate) navigate('/', { replace: true })
            else if (typeof window !== 'undefined') window.location.assign('/')
          }}
          className="w-full h-11 rounded-md border border-stroke bg-surface-canvas hover:bg-surface-sunken text-content-primary font-sans text-body font-medium"
        >
          {txt.backToLogin}
        </button>
      </div>
    </div>
  )

  // ── Render: signed-in, accepting (or accept failed) ───────────────────────
  const renderAccepting = () => (
    <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle text-center">
      <h2 className="font-display text-h3 !text-content-primary m-0 mb-2">{txt.welcomeTitle}</h2>
      <p className="text-body-sm text-content-secondary m-0 mb-5">
        {preview?.orgName ? txt.welcomeBody(preview.orgName, ROLE_LABEL[preview.role]?.[lang] || preview.role) : ''}
      </p>
      {accepting ? (
        <p className="text-body-sm text-content-tertiary">{txt.accepting}</p>
      ) : acceptError ? (
        <>
          <div className="mb-4 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-body-sm">
            {acceptError}
          </div>
          <button
            type="button"
            onClick={() => { setAcceptError(''); setAccepting(true); /* re-trigger via state */ setPreview({ ...preview }) }}
            className="w-full h-11 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent font-sans text-body font-medium"
          >
            {txt.retry}
          </button>
        </>
      ) : (
        <p className="text-body-sm text-content-tertiary">{txt.accepting}</p>
      )}
    </div>
  )

  // ── Render: signed-out, valid invite — embed auth form ────────────────────
  const renderAuthForm = () => {
    if (!preview) return null
    const days = daysUntil(preview.expiresAt)
    const roleLabel = ROLE_LABEL[preview.role]?.[lang] || preview.role
    return (
      <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle">
        <div className="mb-4 ps-3 pe-3 py-2.5 rounded-md bg-status-info-bg border border-status-info-border/30 text-status-info-fg text-body-sm leading-normal">
          <div className="font-semibold">
            {preview.orgName ? txt.welcomeBody(preview.orgName, roleLabel) : txt.welcomeBodyNoOrg(roleLabel)}
          </div>
          <div className="mt-0.5 text-caption text-content-tertiary">
            {days > 0 ? txt.expiresIn(days) : txt.expired}
          </div>
        </div>

        <h2 className="font-display text-h3 !text-content-primary m-0 mb-1.5">
          {mode === 'signin' ? txt.signIn : txt.signUp}
        </h2>
        <p className="text-body-sm text-content-tertiary m-0 mb-6">{txt.signInPrompt}</p>

        {error && (
          <div className="mb-3 ps-3 pe-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border/30 text-status-danger-fg text-body-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === 'signup' && (
            <div>
              <label className={labelClass}>{txt.fullNameLabel}</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>{txt.emailLabel}</label>
            <input
              value={preview.email}
              readOnly
              className={inputClass}
              dir="ltr"
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
            <p className="mt-1 text-caption text-content-tertiary">{txt.emailLocked}</p>
          </div>
          <div>
            <label className={labelClass}>{txt.passwordLabel}</label>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              className={inputClass}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || lockoutSeconds > 0}
            className="w-full h-11 mt-2 rounded-md bg-accent hover:bg-accent-solid-hover text-content-on-accent font-sans text-body font-medium disabled:bg-surface-sunken disabled:text-content-tertiary disabled:cursor-not-allowed"
          >
            {submitting
              ? (mode === 'signup' ? txt.creating : (lang === 'ar' ? 'جارٍ التحميل...' : 'Loading…'))
              : txt.accept}
          </button>
        </form>

        <div className="text-center mt-5 text-body-sm text-content-tertiary">
          {mode === 'signin' ? (
            <span>
              {txt.noAccount}{' '}
              <button type="button" onClick={() => { setMode('signup'); setError('') }} className={linkBtnClass}>
                {txt.signUp}
              </button>
            </span>
          ) : (
            <span>
              {txt.haveAccount}{' '}
              <button type="button" onClick={() => { setMode('signin'); setError('') }} className={linkBtnClass}>
                {txt.signIn}
              </button>
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div dir={dir} className="relative min-h-screen bg-surface-canvas font-sans">
      <header className="absolute top-0 inset-x-0 flex justify-end px-5 md:px-8 py-4 z-10">
        {setLang && (
          <button
            type="button"
            onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
            className="-me-3 px-3 py-2 text-body-sm font-medium text-content-tertiary hover:text-content-primary bg-transparent border-none cursor-pointer font-sans"
          >
            {txt.switchLang}
          </button>
        )}
      </header>

      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-20">
        <div className="text-center mb-8">
          <div className="mx-auto mb-2 font-display text-[56px] font-bold leading-none !text-content-primary" aria-hidden="true">V</div>
          <h1 className="font-display text-h3 md:text-h2 !text-content-primary m-0 mb-1">{txt.appName}</h1>
          <p className="text-body-sm text-content-tertiary m-0">{txt.tagline}</p>
        </div>

        {previewLoading
          ? (
            <div className="w-full max-w-md bg-surface-raised rounded-xl p-6 md:p-10 shadow-2 border border-stroke-subtle text-center">
              <p className="text-body-sm text-content-tertiary m-0">{lang === 'ar' ? 'جاري التحميل...' : 'Loading invitation…'}</p>
            </div>
          )
          : previewError || !preview
            ? renderInvalid()
            : user
              ? renderAccepting()
              : renderAuthForm()}
      </div>
    </div>
  )
}
