/**
 * useMyRole — the current user's role ('owner' | 'doctor' | 'receptionist' | …),
 * read from their profiles row. Mirrors useMyToothNotation: a self-contained,
 * cancel-guarded profile fetch. Returns { role, loading, error } so callers can
 * avoid flashing role-gated UI before the role resolves.
 *
 * (DentalTabs has a private inline useMyRole returning a bare string; this is the
 * shared file-level hook for components outside DentalTabs, e.g. XraysTab.)
 */
import { useState, useEffect } from 'react'
import { fetchMyProfile } from '../lib/profiles'

export default function useMyRole() {
  const [state, setState] = useState({ role: null, loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    fetchMyProfile()
      .then(p => { if (!cancelled) setState({ role: p?.role || null, loading: false, error: null }) })
      .catch(err => { if (!cancelled) setState({ role: null, loading: false, error: err }) })
    return () => { cancelled = true }
  }, [])
  return state
}
