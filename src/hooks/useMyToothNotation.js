/**
 * useMyToothNotation — the current user's tooth-notation preference
 * ('fdi' | 'palmer'), read from their profiles row. Defaults to 'fdi' on absence
 * or error (FDI is the canonical, always-safe rendering).
 *
 * Backed by the shared ['myProfile'] TanStack Query cache (see useMyRole).
 */
import { useQuery } from '@tanstack/react-query'
import { fetchMyProfile } from '../lib/profiles'

export default function useMyToothNotation() {
  const { data } = useQuery({ queryKey: ['myProfile'], queryFn: fetchMyProfile })
  return data?.tooth_notation || 'fdi'
}
