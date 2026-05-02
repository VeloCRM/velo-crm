import { useEffect, useMemo, useState } from 'react'
import { useIsOperator } from '../lib/operator'
import {
  listSocialConnections,
  upsertSocialConnection,
  deleteSocialConnection,
} from '../lib/social_connections'

const PLATFORMS = [
  { id: 'instagram',   en: 'Instagram',   ar: 'إنستغرام',   color: '#E4405F' },
  { id: 'facebook',    en: 'Facebook',    ar: 'فيسبوك',     color: '#1877F2' },
  { id: 'tiktok',      en: 'TikTok',      ar: 'تيك توك',     color: '#06b6d4' },
  { id: 'google_maps', en: 'Google Maps', ar: 'خرائط جوجل', color: '#10b981' },
  { id: 'youtube',     en: 'YouTube',     ar: 'يوتيوب',     color: '#ef4444' },
  { id: 'twitter',     en: 'Twitter / X', ar: 'تويتر',       color: '#3b82f6' },
]
const PLATFORM_LABEL = (id, isRTL) => {
  const p = PLATFORMS.find(x => x.id === id)
  if (!p) return id
  return isRTL ? p.ar : p.en
}
const PLATFORM_COLOR = (id) => PLATFORMS.find(x => x.id === id)?.color || '#7B7F9E'

function PlatformIcon({ platform, size = 20, color }) {
  const stroke = color || PLATFORM_COLOR(platform)
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  switch (platform) {
    case 'instagram':
      return (
        <svg {...props}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      )
    case 'facebook':
      return (
        <svg {...props}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...props}>
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      )
    case 'google_maps':
      return (
        <svg {...props}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...props}>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2C5.12 19.5 12 19.5 12 19.5s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.29 29 29 0 0 0-.46-5.33z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
        </svg>
      )
    case 'twitter':
      return (
        <svg {...props}>
          <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
  }
}

function formatRelativeTime(iso, isRTL) {
  if (!iso) return isRTL ? '—' : '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return isRTL ? 'الآن' : 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return isRTL ? 'الآن' : 'just now'
  if (min < 60) return isRTL ? `قبل ${min} دقيقة` : `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return isRTL ? `قبل ${hr} ساعة` : `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return isRTL ? `قبل ${day} يوم` : `${day} day${day === 1 ? '' : 's'} ago`
  const mo = Math.floor(day / 30)
  return isRTL ? `قبل ${mo} شهر` : `${mo} month${mo === 1 ? '' : 's'} ago`
}

function formatNumber(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 10_000)    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return num.toLocaleString()
}

// ── Operator-only edit/add modal ───────────────────────────────────────────
function ConnectionFormModal({
  isRTL, dir, existing, availablePlatforms, onClose, onSave, onDelete, saving,
}) {
  const [platform, setPlatform] = useState(existing?.platform || availablePlatforms[0]?.id || 'instagram')
  const [form, setForm] = useState({
    page_name: existing?.page_name || '',
    profile_url: existing?.profile_url || '',
    profile_pic_url: existing?.profile_pic_url || '',
    followers_count: existing?.followers_count ?? 0,
    following_count: existing?.following_count ?? 0,
    posts_count: existing?.posts_count ?? 0,
    engagement_rate: existing?.engagement_rate ?? '',
    bio: existing?.bio || '',
    notes: existing?.notes || '',
  })
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const isEditing = !!existing

  const numberInput = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: '#0C0E1A',
    color: '#E8EAF5', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  }
  const textInput = { ...numberInput, direction: dir, textAlign: isRTL ? 'right' : 'left' }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#7B7F9E', marginBottom: 4 }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          background: '#0C0E1A', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 24, direction: dir,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <PlatformIcon platform={platform} size={28} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>
            {isEditing
              ? (isRTL ? `تعديل ${PLATFORM_LABEL(platform, isRTL)}` : `Edit ${PLATFORM_LABEL(platform, isRTL)}`)
              : (isRTL ? 'إضافة منصة' : 'Add platform')}
          </h2>
        </div>

        {!isEditing && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{isRTL ? 'المنصة' : 'Platform'}</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              style={{ ...textInput, appearance: 'auto' }}
            >
              {availablePlatforms.map(p => (
                <option key={p.id} value={p.id}>{isRTL ? p.ar : p.en}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>{isRTL ? 'اسم الصفحة' : 'Page name'}</label>
            <input value={form.page_name} onChange={e => set('page_name', e.target.value)} style={textInput} />
          </div>
          <div>
            <label style={labelStyle}>{isRTL ? 'رابط الملف' : 'Profile URL'}</label>
            <input value={form.profile_url} onChange={e => set('profile_url', e.target.value)} style={textInput} placeholder="https://..." dir="ltr" />
          </div>
          <div>
            <label style={labelStyle}>{isRTL ? 'رابط صورة الملف' : 'Profile picture URL'}</label>
            <input value={form.profile_pic_url} onChange={e => set('profile_pic_url', e.target.value)} style={textInput} placeholder="https://..." dir="ltr" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div>
              <label style={labelStyle}>{isRTL ? 'المتابعون' : 'Followers'}</label>
              <input type="number" min="0" value={form.followers_count} onChange={e => set('followers_count', e.target.value)} style={numberInput} />
            </div>
            <div>
              <label style={labelStyle}>{isRTL ? 'يتابع' : 'Following'}</label>
              <input type="number" min="0" value={form.following_count} onChange={e => set('following_count', e.target.value)} style={numberInput} />
            </div>
            <div>
              <label style={labelStyle}>{isRTL ? 'المنشورات' : 'Posts'}</label>
              <input type="number" min="0" value={form.posts_count} onChange={e => set('posts_count', e.target.value)} style={numberInput} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>{isRTL ? 'معدل التفاعل (%)' : 'Engagement rate (%)'}</label>
            <input
              type="number" min="0" max="999.99" step="0.01"
              value={form.engagement_rate}
              onChange={e => set('engagement_rate', e.target.value)}
              style={numberInput}
              placeholder="0.00"
            />
          </div>
          <div>
            <label style={labelStyle}>{isRTL ? 'النبذة' : 'Bio'}</label>
            <textarea
              value={form.bio}
              onChange={e => set('bio', e.target.value)}
              rows={2}
              style={{ ...textInput, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>{isRTL ? 'ملاحظات داخلية' : 'Internal notes'}</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              style={{ ...textInput, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 24 }}>
          {isEditing ? (
            <button
              type="button"
              onClick={() => onDelete(platform)}
              disabled={saving}
              style={{
                padding: '8px 14px', background: 'transparent',
                color: '#FF6B6B', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 7, fontSize: 13, fontWeight: 500,
                fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {isRTL ? 'حذف' : 'Delete'}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px', background: 'transparent',
                color: '#7B7F9E', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7, fontSize: 13, fontWeight: 500,
                fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => onSave(platform, form)}
              disabled={saving}
              style={{
                padding: '8px 16px', background: '#00FFB2', color: '#07080E',
                border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Operator-contact empty-state modal ─────────────────────────────────────
function OperatorContactModal({ isRTL, dir, onClose }) {
  const operatorContact = import.meta.env.VITE_OPERATOR_CONTACT || ''
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, background: '#0C0E1A',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 24, direction: dir,
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#E8EAF5', margin: '0 0 8px' }}>
          {isRTL ? 'تواصل مع المشغل' : 'Contact the operator'}
        </h3>
        <p style={{ fontSize: 13, color: '#7B7F9E', margin: '0 0 16px', lineHeight: 1.5 }}>
          {isRTL
            ? 'يقوم المشغل بإضافة وإدارة صفحات التواصل الاجتماعي للعيادة.'
            : 'The operator adds and manages your clinic\'s social pages.'}
        </p>

        {operatorContact ? (
          <a
            href={operatorContact}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              padding: '10px 16px', background: '#00FFB2', color: '#07080E',
              borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            {operatorContact.replace(/^https?:\/\//, '').replace(/^mailto:/, '').replace(/^tel:/, '')}
          </a>
        ) : (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#D29922', fontSize: 12,
          }}>
            {isRTL
              ? 'لم يتم إعداد جهة اتصال المشغل بعد.'
              : 'Operator contact has not been configured yet.'}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 12, width: '100%',
            padding: '8px 16px', background: 'transparent',
            color: '#7B7F9E', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {isRTL ? 'إغلاق' : 'Close'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SocialMonitor({ lang = 'en', dir, isRTL: isRTLProp, toast }) {
  const isRTL = isRTLProp ?? lang === 'ar'
  const resolvedDir = dir || (isRTL ? 'rtl' : 'ltr')
  const { isOperator } = useIsOperator()

  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingConn, setEditingConn] = useState(null)   // existing row, for "Edit"
  const [adding, setAdding] = useState(false)            // operator adding new
  const [showContactModal, setShowContactModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listSocialConnections()
      setConnections(rows)
    } catch (err) {
      setError(err.message || 'Failed to load social connections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const connectedPlatforms = useMemo(
    () => new Set(connections.map(c => c.platform)),
    [connections],
  )
  const availablePlatformsForAdd = useMemo(
    () => PLATFORMS.filter(p => !connectedPlatforms.has(p.id)),
    [connectedPlatforms],
  )

  const handleSave = async (platform, fields) => {
    setSaving(true)
    try {
      await upsertSocialConnection(platform, fields)
      toast?.(isRTL ? 'تم الحفظ' : 'Saved', 'success')
      setEditingConn(null)
      setAdding(false)
      await reload()
    } catch (err) {
      toast?.(err.message || (isRTL ? 'فشل الحفظ' : 'Failed to save'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (platform) => {
    if (!platform) return
    setSaving(true)
    try {
      await deleteSocialConnection(platform)
      toast?.(isRTL ? 'تم الحذف' : 'Deleted', 'success')
      setEditingConn(null)
      setAdding(false)
      await reload()
    } catch (err) {
      toast?.(err.message || (isRTL ? 'فشل الحذف' : 'Failed to delete'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir={resolvedDir} style={{ padding: 24, direction: resolvedDir }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>
            {isRTL ? 'صفحات التواصل الاجتماعي' : 'Social Pages'}
          </h1>
          <p style={{ fontSize: 13, color: '#7B7F9E', marginTop: 4 }}>
            {isRTL
              ? 'لوحة قراءة فقط للأرقام التي يقوم المشغل بتحديثها يدوياً.'
              : 'Read-only dashboard. Numbers are updated manually by the operator.'}
          </p>
        </div>
        {isOperator && availablePlatformsForAdd.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              padding: '8px 14px', background: '#00FFB2', color: '#07080E',
              border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            + {isRTL ? 'إضافة منصة' : 'Add platform'}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#FF6B6B', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#7B7F9E', fontSize: 13 }}>
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </p>
      ) : connections.length === 0 ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.4 }}>📱</div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#E8EAF5', margin: '0 0 8px' }}>
            {isRTL ? 'لا توجد صفحات متصلة' : 'No social pages connected'}
          </h2>
          <p style={{ fontSize: 13, color: '#7B7F9E', margin: '0 0 20px', lineHeight: 1.5, maxWidth: 360, marginInline: 'auto' }}>
            {isRTL
              ? 'تواصل مع المشغل لإضافة حسابات التواصل الاجتماعي الخاصة بك.'
              : 'Contact the operator to add your social accounts.'}
          </p>
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            style={{
              padding: '8px 18px', background: '#00FFB2', color: '#07080E',
              border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {isRTL ? 'تواصل مع المشغل' : 'Contact the operator'}
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        }}>
          {connections.map(conn => {
            const color = PLATFORM_COLOR(conn.platform)
            return (
              <div
                key={conn.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: 18,
                  display: 'flex', flexDirection: 'column', gap: 14,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${color}1A`, border: `1px solid ${color}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <PlatformIcon platform={conn.platform} size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#7B7F9E', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {PLATFORM_LABEL(conn.platform, isRTL)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#E8EAF5', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conn.page_name || (isRTL ? 'بدون اسم' : 'Untitled')}
                    </div>
                    {conn.profile_url && (
                      <a
                        href={conn.profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 11, color, marginTop: 2,
                          display: 'inline-block', textDecoration: 'none',
                          maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                        dir="ltr"
                      >
                        {conn.profile_url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  {isOperator && (
                    <button
                      type="button"
                      onClick={() => setEditingConn(conn)}
                      style={{
                        background: 'transparent', color: '#7B7F9E',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                        padding: '4px 10px', fontSize: 11, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                      }}
                    >
                      {isRTL ? 'تعديل' : 'Edit'}
                    </button>
                  )}
                </div>

                {/* Big stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { label: isRTL ? 'متابعون' : 'Followers', value: conn.followers_count },
                    { label: isRTL ? 'يتابع' : 'Following', value: conn.following_count },
                    { label: isRTL ? 'منشورات' : 'Posts', value: conn.posts_count },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 8, padding: '10px 8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5' }}>
                        {formatNumber(stat.value)}
                      </div>
                      <div style={{ fontSize: 10, color: '#7B7F9E', marginTop: 2 }}>
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 11, color: '#7B7F9E', borderTop: '1px solid rgba(255,255,255,0.05)',
                  paddingTop: 10,
                }}>
                  <span>
                    {conn.engagement_rate != null
                      ? (isRTL
                          ? `معدل التفاعل: ${conn.engagement_rate}%`
                          : `Engagement: ${conn.engagement_rate}%`)
                      : (isRTL ? 'بدون معدل تفاعل' : 'No engagement data')}
                  </span>
                  <span>
                    {isRTL ? 'آخر تحديث: ' : 'Last synced: '}{formatRelativeTime(conn.last_synced_at, isRTL)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(editingConn || adding) && (
        <ConnectionFormModal
          isRTL={isRTL}
          dir={resolvedDir}
          existing={editingConn}
          availablePlatforms={editingConn
            ? PLATFORMS.filter(p => p.id === editingConn.platform)
            : availablePlatformsForAdd}
          onClose={() => { setEditingConn(null); setAdding(false) }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
        />
      )}

      {showContactModal && (
        <OperatorContactModal
          isRTL={isRTL}
          dir={resolvedDir}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </div>
  )
}
