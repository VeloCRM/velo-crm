/**
 * Velo CRM — Operator identity context.
 *
 * Provides a single boolean (`isOperator`) loaded once per session from the
 * server-side endpoint /api/auth/is-operator. The endpoint resolves identity
 * from the Supabase JWT and looks up the operators table with the service
 * role key, so the answer is authoritative.
 *
 * Why context rather than a hook that re-queries: every isOperator branch
 * in App.jsx used to re-run the lookup. Centralising in
 * context means one network round-trip per session, regardless of how many
 * components ask.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const OperatorContext = createContext({
  loading: true,
  isOperator: false,
  /** Force a re-fetch (e.g. after sign-in/out). */
  refresh: async () => {},
})

async function fetchIsOperatorFromServer() {
  if (!isSupabaseConfigured()) return false
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return false

  try {
    const res = await fetch('/api/auth/is-operator', {
      method: 'GET',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return false
    const body = await res.json().catch(() => ({}))
    return !!body?.isOperator
  } catch {
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
