// Velo — appointment conflict detection (matches velo-staging schema:
// appointments.scheduled_at timestamptz + duration_minutes int + chair_id text|null)
// Mirrors DB constraint no_chair_double_booking (exclusion, 15-min buffer).
export const STERILIZATION_BUFFER_MIN = 15;

const endMs = a => new Date(a.scheduled_at).getTime() + a.duration_minutes * 60000;
const startMs = a => new Date(a.scheduled_at).getTime();

export function hasConflict(a, b, opts = {}) {
  if (a.chair_id == null || b.chair_id == null) return false;
  if (a.chair_id !== b.chair_id) return false;

  const buffer = (opts.bufferMin ?? STERILIZATION_BUFFER_MIN) * 60000;

  const overlap = startMs(a) < endMs(b) && startMs(b) < endMs(a);
  if (overlap) return true;

  const gap = Math.max(startMs(a), startMs(b)) - Math.min(endMs(a), endMs(b));
  return gap < buffer;
}

/** True when candidate can be booked against existing active appointments. */
export function isSlotFree(candidate, existing, opts = {}) {
  const active = existing.filter(x => !['cancelled', 'no_show'].includes(x.status));
  return !active.some(x => hasConflict(candidate, x, opts));
}
