/**
 * Velo CRM — TanStack Query client (single shared instance).
 *
 * Exported as a singleton so both the <QueryClientProvider> (component tree) and
 * imperative call sites (e.g. clearing the cache on an impersonation switch, from
 * non-component code) use the same cache.
 *
 * Defaults:
 *   - staleTime 30s   — data is "fresh" for 30s; remounting within that window does
 *                       NOT refetch (kills the tab-switch refetch storm).
 *   - gcTime 5min     — cached data is retained 5min after the last observer unmounts.
 *   - refetchOnWindowFocus — revalidate when the tab regains focus.
 *   - retry 1         — one retry on failure (avoids hammering on a hard error).
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
