/**
 * useMyRole — the current user's role ('owner' | 'doctor' | 'receptionist' | …),
 * read from their profiles row. Returns { role, loading, error } so callers can
 * avoid flashing role-gated UI before the role resolves.
 *
 * Backed by the shared ['myProfile'] TanStack Query cache: every hook that reads
 * the current user's profile (role, tooth notation, full profile) resolves from
 * ONE cached fetch instead of one network call each, per mount.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchMyProfile } from '../lib/profiles'

export default function useMyRole() {
  const { data, isLoading, error } = useQuery({ queryKey: ['myProfile'], queryFn: fetchMyProfile })
  return { role: data?.role || null, loading: isLoading, error: error || null }
}
