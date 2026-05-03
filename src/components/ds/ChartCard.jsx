import { GlassCard } from '../ui'

/**
 * ChartCard — GlassCard with a standard header row used on Reports.
 *
 * Header layout: [icon] [title] ........ [right slot (e.g. total)].
 * The card itself does no chart rendering — children own the body. This
 * exists so every report tile reads as part of the same family.
 */
export function ChartCard({ icon, title, right, children, className = '' }) {
  return (
    <GlassCard padding="none" className={`p-5 ${className}`}>
      <div className="flex items-center gap-2.5 mb-4">
        {icon ? (
          <span className="text-accent-cyan-600 flex shrink-0" aria-hidden="true">
            {typeof icon === 'function' ? icon(16) : icon}
          </span>
        ) : null}
        <h3 className="text-[13px] font-semibold text-navy-800 m-0 flex-1 truncate">
          {title}
        </h3>
        {right ? (
          <span
            className="text-[12px] font-semibold text-navy-700"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {right}
          </span>
        ) : null}
      </div>
      {children}
    </GlassCard>
  )
}

export default ChartCard
