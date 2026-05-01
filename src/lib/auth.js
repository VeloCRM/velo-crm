import { supabase, isSupabaseConfigured } from './supabase'

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Auth is unavailable in this environment.')
  }
}

/**
 * Sign in with email and password.
 * @returns {{ data, error }}
 */
export async function signIn(email, password) {
  requireSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

/**
 * Sign up with email and password.
 *
 * Note: clinic-owner signup is disabled in Sprint 0+. Real clinics are created
 * by the operator. The only client-facing signup path is the
 * /api/auth/create-test-account endpoint (test accounts only).
 * @returns {{ data, error }}
 */
export async function signUp(email, password, fullName = '') {
  requireSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })
  return { data, error }
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  if (!isSupabaseConfigured()) return { error: null }
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get the currently authenticated user.
 * @returns {object|null}
 */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Listen for auth state changes (login, logout, token refresh).
 * @param {function} callback - receives (event, session)
 * @returns {{ data: { subscription } }}
 */
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) {
    return { data: { subscription: { unsubscribe: () => {} } } }
  }
  return supabase.auth.onAuthStateChange(callback)
}

/**
 * Send a password reset email.
 * @returns {{ data, error }}
 */
export async function resetPassword(email) {
  requireSupabase()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email)
  return { data, error }
}
