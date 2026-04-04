import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Sign in with email and password.
 * @returns {{ data, error }}
 */
export async function signIn(email, password) {
  if (!isSupabaseConfigured()) {
    return { data: { user: { id: 'demo', email } }, error: null }
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

/**
 * Sign up with email and password.
 * @returns {{ data, error }}
 */
export async function signUp(email, password, fullName = '') {
  if (!isSupabaseConfigured()) {
    return { data: { user: { id: 'demo', email } }, error: null }
  }
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
  if (!isSupabaseConfigured()) {
    return { error: null }
  }
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get the currently authenticated user.
 * @returns {object|null}
 */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    return null
  }
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
  if (!isSupabaseConfigured()) {
    return { data: {}, error: null }
  }
  const { data, error } = await supabase.auth.resetPasswordForEmail(email)
  return { data, error }
}
