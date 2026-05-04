import { GlassCard } from '../ui'

/**
 * KPICard — small metric tile used on Finance + Reports.
 *
 * `value` accepts a string (already-formatted by the caller — money is
 * formatted via lib/money.formatMoney upstream so this component never
 * does math). For multi-line values (e.g. one row per currency) pass
 * a ReactNode as `value`.
 *
 * `delta` is optional; when present it renders as a small caption with
 * an up/down hint colored cyan (positive) or rose (negative). `hint`
 * is a neutral caption used when no comparison data exists yet.
 *
 * Layout is RTL-safe via flex + logical inset/text-align.
 */
export function KPICard({ label, value, hint, delta, deltaTone = 'neutral', icon, dense = false }) {
  const deltaCls = deltaTone === 'up'
    ? 'text-accent-cyan-700'
    : deltaTone === 'down'
      ? 'text-rose-600'
      : 'text-navy-500'

  return (
    <GlassCard padding="none" className={dense ? 'p-4' : 'p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10.5px] font-semibold text-navy-500 uppercase tracking-[0.08em]">
          {label}
        </div>
        {icon ? (
          <span className="text-accent-cyan-600 flex" aria-hidden="true">
            {typeof icon === 'function' ? icon(16) : icon}
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 text-navy-900 font-semibold"
        style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}
      >
        {typeof value === 'string' || typeof value === 'number' ? (
          <span className={dense ? 'text-xl' : 'text-2xl'}>{value}</span>
        ) : (
          value
        )}
      </div>
      {(hint || delta) ? (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {delta ? (
            <span className={`${deltaCls} font-semibold`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {delta}
            </span>
          ) : null}
          {hint ? <span className="text-navy-500">{hint}</span> : null}
        </div>
      ) : null}
    </GlassCard>
  )
}

export default KPICard
