/**
 * Velo CRM — deterministic avatar gradients (Liquid Glass).
 *
 * Maps a name (or any stable string) to one of a curated palette of
 * Tailwind gradient classes, so the same person consistently gets the
 * same color across views (Dashboard, Patient Profile, doctor pickers).
 *
 * The gradient strings are written out literally — Tailwind's content
 * scanner can't see template-interpolated class names, so any
 * `from-${x}-${y}` pattern would silently miss at build time.
 *
 * Usage:
 *   <span className={`bg-gradient-to-br ${avatarGradient(name)} ...`}>
 *     {avatarInitials(name)}
 *   </span>
 */

// 10 distinct gradients tuned for the Liquid Glass palette. Each pair is
// chosen so the contrast against white text remains AA at 14px+. Order is
// fixed so the hash mapping is stable across releases.
const PALETTE = [
  'from-navy-500 to-accent-cyan-500',
  'from-accent-cyan-500 to-emerald-500',
  'from-navy-700 to-violet-500',
  'from-emerald-500 to-accent-cyan-600',
  'from-amber-500 to-rose-500',
  'from-rose-500 to-violet-600',
  'from-sky-500 to-navy-700',
  'from-teal-500 to-navy-600',
  'from-violet-500 to-accent-cyan-500',
  'from-navy-600 to-rose-500',
]

function hashName(s) {
  const str = String(s ?? '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Tailwind gradient classes (no `bg-gradient-to-br` — caller composes).
 * Stable per name. Empty/null names always resolve to the first entry so
 * fallbacks read consistently.
 */
export function avatarGradient(name) {
  if (!name) return PALETTE[0]
  return PALETTE[hashName(name) % PALETTE.length]
}

/**
 * Initials helper — first letter of first part + first letter of last part.
 * Single-word names take the first two letters. Empty falls back to "?".
 */
export function avatarInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
