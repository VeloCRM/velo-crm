/**
 * useCurrentProfile — the current user's full profiles row
 * ({ id, org_id, role, full_name, ... }) via fetchMyProfile(). Returns
 * { profile, loading }.
 *
 * The Billing tab uses it to (1) gate charge entry to doctor/owner and
 * (2) default a new charge's doctor_id to the current user when they are a
 * doctor (profile.id). RLS is the real boundary; this only shapes the UI.
 *
 * Backed by the shared ['myProfile'] TanStack Query cache (see useMyRole).
 */
import { useQuery } from '@tanstack/react-query'
import { fetchMyProfile } from '../lib/profiles'

export default function useCurrentProfile() {
  const { data, isLoading } = useQuery({ queryKey: ['myProfile'], queryFn: fetchMyProfile })
  return { profile: data ?? null, loading: isLoading }
}
