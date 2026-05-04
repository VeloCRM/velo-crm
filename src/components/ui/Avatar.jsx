import { forwardRef, useMemo, useState } from 'react'

const SIZES = {
  xs: { w: 'w-6  h-6',  text: 'text-[10px]' },
  sm: { w: 'w-8  h-8',  text: 'text-xs'    },
  md: { w: 'w-10 h-10', text: 'text-sm'    },
  lg: { w: 'w-12 h-12', text: 'text-base'  },
  xl: { w: 'w-16 h-16', text: 'text-lg'    },
}

// Deterministic palette based on name hash so the same person consistently
// gets the same color across views.
const PALETTES = [
  'from-navy-500 to-navy-700',
  'from-accent-cyan-500 to-accent-cyan-700',
  'from-emerald-500 to-emerald-700',
  'from-amber-500 to-amber-700',
  'from-rose-500 to-rose-700',
  'from-violet-500 to-violet-700',
  'from-sky-500 to-sky-700',
  'from-teal-500 to-teal-700',
]

function hashName(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar — circular image / initials fallback in 5 sizes.
 *
 * If `src` fails to load (or isn't provided), falls back to a gradient
 * circle with initials derived from `name`. Pass `alt` for screen readers.
 */
export const Avatar = forwardRef(function Avatar(
  { src, name = '', size = 'md', alt, className = '', ...rest },
  ref,
) {
  const [errored, setErrored] = useState(false)
  const sz = SIZES[size] ?? SIZES.md
  const initials = useMemo(() => initialsOf(name), [name])
  const palette  = useMemo(() => PALETTES[hashName(name || 'x') % PALETTES.length], [name])

  const base = [
    'inline-grid place-items-center shrink-0 select-none',
    'rounded-full overflow-hidden',
    'ring-1 ring-white/60',
    sz.w,
    className,
  ].join(' ')

  if (src && !errored) {
    return (
      <span ref={ref} className={base} {...rest}>
        <img
          src={src}
          alt={alt ?? name ?? ''}
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span
      ref={ref}
      className={[base, 'bg-gradient-to-br', palette, 'text-white font-semibold', sz.text].join(' ')}
      role="img"
      aria-label={alt ?? name ?? 'avatar'}
      {...rest}
    >
      {initials}
    </span>
  )
})

export default Avatar
