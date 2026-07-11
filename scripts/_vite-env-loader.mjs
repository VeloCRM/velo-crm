/**
 * _vite-env-loader.mjs — Node ESM load hook (registered via module.register).
 *
 * WHY THIS EXISTS
 * src/lib/supabase.js reads `import.meta.env.VITE_*`, a Vite-only construct that
 * is `undefined` under plain Node (accessing `.VITE_SUPABASE_URL` throws a
 * TypeError at import time). That makes it impossible to `import` the real
 * billing.js data layer — which transitively imports supabase.js — from a Node
 * CLI verifier.
 *
 * Rather than fork the data layer or add a bundler (vite-node) just to test it,
 * this hook rewrites ONLY src/lib/supabase.js at load time, swapping its three
 * `import.meta.env` reads for `process.env.STAGING_*`. Production source on disk
 * is never modified; the substitution lives only in the module the verifier
 * loads. Every other module (billing.js, database.js, auth_session.js, …) loads
 * verbatim, so the verifier exercises their real code.
 *
 * The rewritten text references `process.env.STAGING_*`; those are read on the
 * main thread when supabase.js evaluates, so the verifier must populate them
 * (from .env.staging.local) before the dynamic import — the hook itself needs no
 * env access, it only emits the substituted string.
 */

const TARGET_SUFFIX = '/src/lib/supabase.js'

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  const normalized = url.replace(/\\/g, '/')
  if (normalized.endsWith(TARGET_SUFFIX) && result.source != null) {
    const src = result.source
      .toString()
      .replaceAll('import.meta.env.VITE_SUPABASE_URL', 'process.env.STAGING_SUPABASE_URL')
      .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', 'process.env.STAGING_SUPABASE_ANON_KEY')
      .replaceAll('import.meta.env.PROD', 'false')
    return { ...result, source: src }
  }
  return result
}
