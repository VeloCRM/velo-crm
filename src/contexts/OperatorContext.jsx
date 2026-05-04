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

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

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
  const [state, setState] = useState({ loading: true, isOperator: false })

  const refresh = async () => {
    setState(prev => ({ ...prev, loading: true }))
    const isOperator = await fetchIsOperatorFromServer()
    setState({ loading: false, isOperator })
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const isOperator = await fetchIsOperatorFromServer()
      if (!cancelled) setState({ loading: false, isOperator })
    })()

    if (!isSupabaseConfigured()) return () => { cancelled = true }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setState({ loading: false, isOperator: false })
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        ;(async () => {
          const isOperator = await fetchIsOperatorFromServer()
          if (!cancelled) setState({ loading: false, isOperator })
        })()
      }
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe?.()
    }
  }, [])

  return (
    <OperatorContext.Provider value={{ ...state, refresh }}>
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
