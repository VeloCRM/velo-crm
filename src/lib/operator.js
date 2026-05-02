/**
 * Velo CRM — Operator helpers.
 *
 * "Operator" = a row in the `operators` table for the current auth user.
 * The agency manages clinics; only operators can read/write `org_secrets`,
 * promote orgs out of test status, etc.
 *
 * Identity is established ONCE per session by OperatorContext, which calls
 * /api/auth/is-operator at sign-in. This hook is just a thin re-export so
 * existing callers (Phase 5 ClinicCredentials, App.jsx routes) keep working
 * without an import path change.
 */

import { useOperator } from '../contexts/OperatorContext'

/**
 * React hook: tells you whether the current user is an operator.
 *
 * Returns: { loading: boolean, isOperator: boolean }
 *   - During the one-shot initial check, loading=true / isOperator=false.
 *   - When the user isn't signed in or Supabase isn't configured, resolves
 *     to { loading: false, isOperator: false }.
 *
 * Backed by OperatorContext — does NOT re-fetch on every render.
 */
export function useIsOperator() {
  const { loading, isOperator } = useOperator()
  return { loading, isOperator }
}
