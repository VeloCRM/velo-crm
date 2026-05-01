import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsOperator } from '../../lib/operator'

const SECRET_FIELDS = [
  { kind: 'whatsapp_token',          label: 'WhatsApp Access Token',  hint: 'Long-lived Meta system-user token' },
  { kind: 'whatsapp_phone_id',       label: 'WhatsApp Phone Number ID', hint: 'Numeric ID from WhatsApp Business Platform' },
  { kind: 'whatsapp_app_secret',     label: 'WhatsApp App Secret',     hint: 'Used to verify inbound webhook HMAC' },
  { kind: 'whatsapp_webhook_secret', label: 'Webhook Verify Token',    hint: 'Shared with Meta for GET-challenge verification' },
]

export default function ClinicCredentialsPage({ lang = 'en' }) {
  const { loading: opLoading, isOperator } = useIsOperator()
  const [orgs, setOrgs] = useState([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [editingOrg, setEditingOrg] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isRTL = lang === 'ar'
  const dir = isRTL ? 'rtl' : 'ltr'

  useEffect(() => {
    if (opLoading) return
    if (!isOperator) { setOrgsLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data, error: fetchErr } = await supabase
        .from('orgs')
        .select('id, name, slug, status, currency, locale, created_at')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (fetchErr) setError(fetchErr.message)
      else setOrgs(data || [])
      setOrgsLoading(false)
    })()
    return () => { cancelled = true }
  }, [opLoading, isOperator])

  const openEdit = (org) => {
    setEditingOrg(org)
    setForm(Object.fromEntries(SECRET_FIELDS.map(f => [f.kind, ''])))
    setError(''); setMessage('')
  }
  const closeEdit = () => { setEditingOrg(null); setForm({}); setError(''); setMessage('') }

  const handleSave = async () => {
    if (!editingOrg) return
    setSaving(true); setError(''); setMessage('')

    const payload = SECRET_FIELDS
      .map(f => ({ kind: f.kind, value: (form[f.kind] || '').trim() }))
      .filter(p => p.value !== '')

    if (payload.length === 0) {
      setError(isRTL ? 'أدخل قيمة واحدة على الأقل' : 'Enter at least one value')
      setSaving(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error(isRTL ? 'لم يتم تسجيل الدخول' : 'Not signed in')

      for (const { kind, value } of payload) {
        const res = await fetch('/api/operator/set-secret', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ orgId: editingOrg.id, kind, value }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Failed to save ${kind} (${res.status})`)
        }
      }

      setMessage(isRTL ? 'تم حفظ بيانات الاعتماد.' : 'Credentials saved.')
      // Clear inputs but keep the modal open in case operator wants to set more
      setForm(Object.fromEntries(SECRET_FIELDS.map(f => [f.kind, ''])))
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (opLoading) {
    return (
      <div style={{ padding: 32 }} dir={dir}>
        <p style={{ color: '#7B7F9E' }}>{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
      </div>
    )
  }
  if (!isOperator) {
    return (
      <div style={{ padding: 32 }} dir={dir}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>
          {isRTL ? 'الوصول مرفوض' : 'Forbidden'}
        </h2>
        <p style={{ color: '#7B7F9E', marginTop: 8, fontSize: 13 }}>
          {isRTL ? 'هذه الصفحة مخصصة للمشغلين فقط.' : 'This page is for operators only.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, direction: dir }} dir={dir}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>
          {isRTL ? 'بيانات اعتماد العيادات' : 'Clinic Credentials'}
        </h1>
        <p style={{ fontSize: 13, color: '#7B7F9E', marginTop: 4 }}>
          {isRTL
            ? 'إدارة بيانات اعتماد WhatsApp وغيرها لكل عيادة. الحسابات التجريبية محظورة.'
            : 'Manage WhatsApp and other credentials per clinic. Test accounts are blocked.'}
        </p>
      </div>

      {error && !editingOrg && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FF6B6B', fontSize: 13 }}>
          {error}
        </div>
      )}

      {orgsLoading ? (
        <p style={{ color: '#7B7F9E' }}>{isRTL ? 'جاري تحميل العيادات...' : 'Loading clinics...'}</p>
      ) : orgs.length === 0 ? (
        <p style={{ color: '#7B7F9E' }}>{isRTL ? 'لا توجد عيادات.' : 'No clinics yet.'}</p>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th style={{ padding: '12px 16px', textAlign: isRTL ? 'right' : 'left', color: '#7B7F9E', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRTL ? 'الاسم' : 'Name'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: isRTL ? 'right' : 'left', color: '#7B7F9E', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Slug
                </th>
                <th style={{ padding: '12px 16px', textAlign: isRTL ? 'right' : 'left', color: '#7B7F9E', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRTL ? 'الحالة' : 'Status'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: isRTL ? 'left' : 'right', color: '#7B7F9E', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRTL ? 'إجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(org => (
                <tr key={org.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 16px', color: '#E8EAF5', fontWeight: 500 }}>{org.name}</td>
                  <td style={{ padding: '12px 16px', color: '#7B7F9E', fontFamily: 'monospace', fontSize: 12 }}>{org.slug}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: org.status === 'test' ? 'rgba(245,158,11,0.12)' : org.status === 'active' ? 'rgba(0,255,178,0.1)' : 'rgba(239,68,68,0.1)',
                      color: org.status === 'test' ? '#D29922' : org.status === 'active' ? '#00FFB2' : '#FF6B6B',
                    }}>{org.status}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: isRTL ? 'left' : 'right' }}>
                    <button
                      type="button"
                      onClick={() => openEdit(org)}
                      disabled={org.status === 'test'}
                      title={org.status === 'test' ? (isRTL ? 'لا يمكن تعيين الأسرار للحسابات التجريبية' : 'Test accounts cannot store secrets') : ''}
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: org.status === 'test' ? 'rgba(255,255,255,0.04)' : 'rgba(0,255,178,0.12)',
                        color: org.status === 'test' ? '#7B7F9E' : '#00FFB2',
                        border: org.status === 'test' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,255,178,0.3)',
                        borderRadius: 6,
                        cursor: org.status === 'test' ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isRTL ? 'إدارة بيانات WhatsApp' : 'Manage WhatsApp credentials'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingOrg && (
        <div
          onClick={closeEdit}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 540,
              background: '#0C0E1A',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
              direction: dir,
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>
                {isRTL ? 'بيانات اعتماد WhatsApp' : 'WhatsApp Credentials'}
              </h2>
              <p style={{ fontSize: 13, color: '#7B7F9E', marginTop: 4 }}>
                {editingOrg.name} <span style={{ fontFamily: 'monospace' }}>({editingOrg.slug})</span>
              </p>
            </div>

            <p style={{ fontSize: 12, color: '#7B7F9E', marginBottom: 16, lineHeight: 1.5 }}>
              {isRTL
                ? 'القيم المخزنة لا تظهر هنا. اترك أي حقل فارغاً للإبقاء على القيمة الحالية.'
                : 'Existing values are not displayed. Leave a field blank to keep the current value.'}
            </p>

            {error && (
              <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FF6B6B', fontSize: 13 }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: 'rgba(0,255,178,0.1)', border: '1px solid rgba(0,255,178,0.3)', color: '#00FFB2', fontSize: 13 }}>
                {message}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {SECRET_FIELDS.map(field => (
                <div key={field.kind}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7B7F9E', marginBottom: 4 }}>
                    {field.label}
                  </label>
                  <input
                    type="password"
                    value={form[field.kind] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [field.kind]: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="••••••••••••••••"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: '#E8EAF5',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      outline: 'none',
                      direction: 'ltr', // secrets are always LTR
                      textAlign: 'left',
                      boxSizing: 'border-box',
                    }}
                  />
                  <p style={{ fontSize: 11, color: '#5C6080', marginTop: 4, marginBottom: 0 }}>{field.hint}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  color: '#7B7F9E',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {isRTL ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  background: '#00FFB2',
                  color: '#07080E',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving
                  ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                  : (isRTL ? 'حفظ' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
