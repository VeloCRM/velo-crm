/**
 * Velo CRM — Operator identity context.
 *
 * Provides a single boolean (`isOperator`) loaded once per session by
 * directly querying the `operators` table for the caller's own row.
 *
 * Why direct-query rather than a Vercel Function:
 *   - Works identically in `npm run dev`, `vercel dev`, and production.
 *     (Vite's dev server doesn't serve /api/* without `vercel dev`, so the
 *     old fetch('/api/auth/is-operator') call broke local development.)
 *   - The operators table contains only (user_id, notes, created_at) — no
 *     secrets — and the `operators_self_select` RLS policy in schema.sql
 *     restricts each row to its owner. Postgres is the security boundary,
 *     not the API layer.
 *   - One indexed lookup on a primary key. Fast enough that no extra
 *     caching beyond what context already provides is needed.
 *
 * Why context rather than a hook that re-queries: every isOperator branch
 * in App.jsx would otherwise re-run the lookup. Centralising in context
 * means one query per session, regardless of how many components ask.
 */

import { createContext, useContext, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'

const OperatorContext = createContext({
  loading: true,
  isOperator: false,
  /** Force a re-fetch (e.g. after sign-in/out). */
  refresh: async () => {},
})

/**
 * Read the caller's own row in `operators`. Returns true iff a row exists.
 *
 * Fail-closed: any error path (no Supabase config, no session, RLS denial,
 * network failure) resolves to false. Operators see a degraded clinic UI
 * if this misfires — never the reverse.
 */
async function fetchIsOperatorFromServer() {
  if (!isSupabaseConfigured()) return false
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return false

  try {
    const { data, error } = await supabase
      .from('operators')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('[OperatorContext] operators lookup failed:', error)
      return false
    }
    return !!data
  } catch (err) {
    console.error('[OperatorContext] operators lookup threw:', err)
    return false
  }
}

/**
 * Wrap the app once at the top of the tree. The provider:
 *   - kicks off the lookup once on mount,
 *   - re-runs it on auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED),
 *   - exposes a manual `refresh()` for callers that mutate operator state.
 */
export function OperatorProvider({ children }) {
  // One cached fetch, shared by every isOperator consumer. TanStack Query dedupes
  // the mount fetch + StrictMode double-invoke into a single request; staleTime
  // Infinity means operator status is fetched ONCE per session (it can't change
  // mid-session) — previously the mount fetch + the onAuthStateChange INITIAL_SESSION
  // event + StrictMode fired ~4-6 `operators?select=user_id` requests per page.
  const { data: isOperator = false, isLoading, refetch } = useQuery({
    queryKey: ['isOperator'],
    queryFn: fetchIsOperatorFromServer,
    staleTime: Infinity,
  })

  // React to real auth transitions only: refetch on sign-in, force false on sign-out.
  // (TOKEN_REFRESHED / INITIAL_SESSION don't change operator status, so no refetch.)
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') queryClient.setQueryData(['isOperator'], false)
      else if (event === 'SIGNED_IN') refetch()
    })
    return () => subscription?.unsubscribe?.()
  }, [refetch])

  const refresh = async () => { await refetch() }

  return (
    <OperatorContext.Provider value={{ loading: isLoading, isOperator, refresh }}>
      {children}
    </OperatorContext.Provider>
  )
}

/**
 * Read operator status. Returns { loading, isOperator, refresh }.
 *
 * Components that don't render the OperatorProvider (rare — only test
 * harnesses) get the default { loading: true, isOperator: false }.
 */
export function useOperator() {
  return useContext(OperatorContext)
}
