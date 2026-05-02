import { forwardRef } from 'react'

const SHAPES = {
  text:    'h-3 rounded-full',
  title:   'h-5 rounded-full',
  block:   'h-24 rounded-glass',
  avatar:  'rounded-full',
  card:    'h-40 rounded-glass-lg',
}

/**
 * SkeletonGlass — pulsing translucent placeholder used while glass surfaces
 * load. Drop in place of any final content; size with width/height utility
 * classes (e.g. `<SkeletonGlass shape="title" className="w-1/2" />`).
 *
 * `shape` controls the radius/height defaults; pass `className` to override.
 */
export const SkeletonGlass = forwardRef(function SkeletonGlass(
  { shape = 'text', className = '', ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={[
        'relative overflow-hidden',
        'bg-gradient-to-r from-white/40 via-white/70 to-white/40',
        'border border-white/40 backdrop-blur-glass-sm',
        'animate-pulse',
        SHAPES[shape] ?? SHAPES.text,
        className,
      ].join(' ')}
      {...rest}
    >
      <div
        className="absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.7)_50%,transparent_70%)] bg-[length:200%_100%] animate-glass-shimmer"
        aria-hidden="true"
      />
    </div>
  )
})

/**
 * SkeletonGlassCard — convenience composition: a glass card containing a
 * standard "header + 3 lines + meta row" loading layout. Use as the default
 * fallback while a card-shaped section is fetching.
 */
export function SkeletonGlassCard({ className = '' }) {
  return (
    <div className={['glass-card p-6 flex flex-col gap-4', className].join(' ')}>
      <div className="flex items-center gap-3">
        <SkeletonGlass shape="avatar" className="w-10 h-10" />
        <div className="flex-1 space-y-2">
          <SkeletonGlass shape="title" className="w-1/3" />
          <SkeletonGlass shape="text"  className="w-1/4" />
        </div>
      </div>
      <SkeletonGlass shape="text" className="w-full" />
      <SkeletonGlass shape="text" className="w-5/6" />
      <SkeletonGlass shape="text" className="w-3/4" />
    </div>
  )
}

export default SkeletonGlass
