/**
 * PatientPicker — reusable, controlled patient search/select field.
 *
 * Extracted verbatim (behaviour-for-behaviour) from FinancePage's RecordPaymentModal
 * inline picker so charge/collect flows across the app share one implementation:
 *   - 250ms debounced search via searchPatientsForAppointment (fires at ≥2 chars),
 *     with a `searching` state and the debounce timer cleared on unmount.
 *   - Controlled selection: the parent owns the picked patient via `selected` and is
 *     notified through `onSelect(patient)` / `onClear()`. onSelect receives the full
 *     { id, full_name, phone } row.
 *   - Renders a chip (name + phone + clear ×) when a patient is selected; otherwise an
 *     Input + results dropdown (Searching… / No results [+ optional emptyAction] /
 *     result buttons). Reuses the design-system Input + glass classes.
 *
 * The caller owns any surrounding <label> / FormField — this renders only the field.
 */
import { useState, useEffect, useRef } from 'react'
import { Icons } from './shared'
import { Input } from './ui'
import { searchPatientsForAppointment } from '../lib/appointments'

export default function PatientPicker({
  selected,
  onSelect,
  onClear,
  isRTL = false,
  dir,
  placeholder,
  disabled = false,
  emptyAction = null,
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimer = useRef(null)

  // Debounced patient search (250ms). Bails when a patient is already picked or the
  // query is too short; always clears the pending timer (incl. on unmount).
  useEffect(() => {
    if (!search || search.length < 2 || selected) { setResults([]); return }
    setSearching(true)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const rows = await searchPatientsForAppointment(search)
        setResults(rows)
      } catch (err) {
        console.error('[PatientPicker] patient search:', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(searchTimer.current)
  }, [search, selected])

  const handlePick = (p) => {
    onSelect?.(p)
    setShowDropdown(false)
    setSearch('')
  }

  const handleClear = () => {
    if (disabled) return
    setSearch('')
    setResults([])
    setShowDropdown(true)
    if (onClear) onClear()
    else onSelect?.(null)
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 h-11 px-3.5 rounded-glass bg-white/85 border border-navy-100 shadow-glass-sm">
        <span className="flex-1 font-semibold text-navy-800 truncate">{selected.full_name}</span>
        {selected.phone && (
          <span className="text-[11px] text-navy-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {selected.phone}
          </span>
        )}
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          aria-label={isRTL ? 'مسح' : 'Clear'}
          className="text-navy-400 hover:text-navy-700 transition-colors flex disabled:opacity-40"
        >
          {Icons.x(14)}
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        value={search}
        onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder ?? (isRTL ? 'ابحث بالاسم أو الرقم...' : 'Search by name or phone...')}
        iconStart={Icons.search}
        disabled={disabled}
        dir={dir}
      />
      {showDropdown && search.length >= 2 && (
        <div className="absolute top-[calc(100%+4px)] inset-x-0 z-20 max-h-56 overflow-y-auto rounded-glass border border-navy-100 bg-white shadow-glass-md">
          {searching ? (
            <div className="p-3 text-xs text-navy-500">{isRTL ? 'جاري البحث...' : 'Searching...'}</div>
          ) : results.length === 0 ? (
            <div className="p-3">
              <div className="text-xs text-navy-500">{isRTL ? 'لا توجد نتائج' : 'No results'}</div>
              {emptyAction && <div className="mt-2">{emptyAction}</div>}
            </div>
          ) : (
            results.map(p => (
              <button
                type="button"
                key={p.id}
                onClick={() => handlePick(p)}
                className="w-full text-start px-3 py-2.5 border-b border-navy-50 last:border-b-0 hover:bg-accent-cyan-50/60 transition-colors"
              >
                <div className="font-semibold text-navy-800 text-[13px]">{p.full_name}</div>
                {p.phone && (
                  <div className="text-[11px] text-navy-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.phone}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
