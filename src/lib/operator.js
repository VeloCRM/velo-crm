/**
 * Velo CRM — Operator helpers.
 *
 * "Operator" = a row in the `operators` table for the current auth user.
 * The agency manages clinics; only operators can read/write `org_secrets`,
 * promote orgs out of test status, etc.
 *
 * Identity is checked via the SECURITY DEFINER `is_operator()` Postgres
 * function declared in src/lib/schema.sql. RLS on the operators table also
 * naturally hides everything from non-operators, so callers that fall back
 * to a SELECT are safe too.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * React hook: tells you whether the current user is an operator.
 *
 * Returns: { loading: boolean, isOperator: boolean }
 *   - During initial check, loading=true / isOperator=false.
 *   - When Supabase isn't configured or the user isn't signed in, resolves
 *     to { loading: false, isOperator: false }.
 */
export function useIsOperator() {
  const [state, setState] = useState({ loading: true, isOperator: false })

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!supabase) {
        if (!cancelled) setState({ loading: false, isOperator: false })
        return
      }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (!cancelled) setState({ loading: false, isOperator: false })
          return
        }
        const { data, error } = await supabase.rpc('is_operator')
        if (cancelled) return
        if (error) {
          // RPC isn't deployed yet, function not callable, etc. Fall back to
          // a direct SELECT against operators (RLS will return empty for
          // non-operators).
          const { data: row } = await supabase
            .from('operators')
            .select('user_id')
            .eq('user_id', session.user.id)
            .maybeSingle()
          setState({ loading: false, isOperator: !!row })
          return
        }
        setState({ loading: false, isOperator: !!data })
      } catch {
        if (!cancelled) setState({ loading: false, isOperator: false })
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  return state
}
