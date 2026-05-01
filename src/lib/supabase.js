import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.PROD) {
    throw new Error(
      '[Velo CRM] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Production builds require Supabase to be configured.'
    )
  }
  console.warn(
    '[Velo CRM] Supabase env vars missing. Dev build will run with empty data. ' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, or append ?demo=1 to the URL for read-only sample data.'
  )
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConfigured = () => !!supabase
