/**
 * XrayGrid — presentational thumbnail grid for a patient's X-rays, grouped by
 * exact date (newest first), with filter chips for the xray_types present in the
 * data. Click a thumbnail → onOpen(xray). Handles loading / empty (role-aware).
 */
import { useState, useMemo } from 'react'
import { Button } from './ui'
import { Icons } from './shared'
import { XRAY_TYPE_OPTIONS } from '../lib/xrayTypes'

function formatDate(date, isRTL) {
  if (!date) return ''
  // Append local midnight so a date-only string isn't shifted by timezone.
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(isRTL ? 'ar-IQ-u-ca-gregory' : 'en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
        active ? 'border-accent-cyan-500 bg-accent-cyan-500/10 text-navy-900' : 'border-navy-200 text-navy-500 hover:border-navy-300',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Placeholder() {
  return (
    <span className="w-full h-full grid place-items-center text-navy-300" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
      </svg>
    </span>
  )
}

export default function XrayGrid({ xrays, loading, canEdit, roleLoading, isRTL, busyId, onOpen, onUpload }) {
  const [filter, setFilter] = useState('all')
  const typeLabel = (id) => {
    const o = XRAY_TYPE_OPTIONS.find(t => t.id === id)
    return o ? (isRTL ? o.ar : o.en) : id
  }

  const presentTypes = useMemo(
    () => XRAY_TYPE_OPTIONS.filter(o => xrays.some(x => x.xray_type === o.id)).map(o => o.id),
    [xrays]
  )
  const filtered = filter === 'all' ? xrays : xrays.filter(x => x.xray_type === filter)
  const groups = useMemo(() => {
    const m = new Map() // xrays already sorted date_taken DESC by fetchXrays
    for (const x of filtered) {
      const k = x.date_taken || ''
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(x)
    }
    return [...m.entries()]
  }, [filtered])

  if (loading) {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-navy-100/60 animate-pulse" />
        ))}
      </div>
    )
  }

  if (xrays.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-3 text-center">
        <Placeholder />
        <p className="text-sm text-navy-600 m-0">
          {/* While role is still resolving, show the neutral copy — never flash the
              receptionist message to a doctor. */}
          {roleLoading || canEdit
            ? (isRTL ? 'لا توجد صور أشعة بعد.' : 'No X-rays yet.')
            : (isRTL ? 'ستظهر صور الأشعة هنا بعد أن يرفعها طبيبك.' : 'X-rays will appear here once your doctor uploads them.')}
        </p>
        {canEdit && <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={onUpload}>{isRTL ? 'رفع أشعة' : 'Upload X-ray'}</Button>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>{isRTL ? 'الكل' : 'All'}</Chip>
          {presentTypes.map(id => (
            <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>{typeLabel(id)}</Chip>
          ))}
        </div>
        {canEdit && <Button variant="primary" size="sm" iconStart={Icons.plus} onClick={onUpload}>{isRTL ? 'رفع أشعة' : 'Upload X-ray'}</Button>}
      </div>

      {groups.map(([date, list]) => (
        <section key={date} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-navy-500 m-0">{formatDate(date, isRTL) || (isRTL ? 'بدون تاريخ' : 'Undated')}</h4>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {list.map(x => (
              <button
                key={x.id}
                type="button"
                onClick={() => onOpen(x)}
                disabled={busyId === x.id}
                aria-label={`${typeLabel(x.xray_type)} — ${x.file_name || ''} — ${formatDate(x.date_taken, isRTL)}`}
                title={`${typeLabel(x.xray_type)}${x.notes ? ` — ${x.notes}` : ''}`}
                className="group relative aspect-square rounded-lg overflow-hidden border border-navy-200 bg-navy-50 hover:border-accent-cyan-400 focus:outline-none focus-visible:border-accent-cyan-500 transition-colors disabled:opacity-60"
              >
                {x.thumbnail_data_url
                  ? <img src={x.thumbnail_data_url} alt="" className="w-full h-full object-cover" />
                  : <Placeholder />}
                <span className="absolute bottom-0 inset-x-0 bg-navy-900/65 text-white text-[10px] px-1.5 py-0.5 truncate">
                  {typeLabel(x.xray_type)}
                </span>
                {busyId === x.id && <span className="absolute inset-0 grid place-items-center bg-white/50 text-xs text-navy-700">…</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
