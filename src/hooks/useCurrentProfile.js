/**
 * useCurrentProfile — the current user's full profiles row
 * ({ id, org_id, role, full_name, ... }) via fetchMyProfile(). Mirrors
 * useMyRole / useMyToothNotation: a self-contained, cancel-guarded fetch.
 * Returns { profile, loading }.
 *
 * The Billing tab uses it to (1) gate charge entry to doctor/owner and
 * (2) default a new charge's doctor_id to the current user when they are a
 * doctor (profile.id). RLS is the real boundary; this only shapes the UI.
 */
import { useState, useEffect } from 'react'
import { fetchMyProfile } from '../lib/profiles'

export default function useCurrentProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetchMyProfile()
      .then(p => { if (!cancelled) { setProfile(p || null); setLoading(false) } })
      .catch(() => { if (!cancelled) { setProfile(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [])
  return { profile, loading }
}
