// Format a Date as local YYYY-MM-DD. toISOString() returns UTC; in UTC+3
// (Iraq) local-midnight Date objects render as yesterday's UTC date — bug
// fixed in 38ee132, recurrent enough across files that the helper now lives
// here as the single source of truth.
export function fmtLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const todayLocal = () => fmtLocalDate(new Date())
