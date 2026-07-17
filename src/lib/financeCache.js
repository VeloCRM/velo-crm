/**
 * Velo CRM — Finance page cache keys + invalidation (TanStack Query).
 *
 * Finance is the money surface: a stale cached balance = a wrong amount owed
 * shown to staff. The keys are defined ONCE here so the FinancePage reads and
 * every money mutation's invalidation — on BOTH the Finance page and the patient
 * Billing tab (App.jsx invalidateBilling) — reference the same partitions and
 * can't drift.
 *
 * Keys are org-scoped for cache PARTITIONING only (so impersonating another
 * clinic can't collide with your own cached ledger). The reads themselves resolve
 * the effective org server-side via getCurrentOrgId(); orgId in the key never
 * widens what a query can see. Server-varying params (date range, category,
 * method) go in the key; display-only filters (patient-name search) stay
 * client-side, matching the ActivityLogTab pattern.
 */
import { queryClient } from './queryClient'

export const financeKeys = {
  clinicTotals: (orgId) => ['clinicTotals', orgId],
  allCharges:   (orgId, params) => ['allCharges', orgId, params],
  allPayments:  (orgId, params) => ['allPayments', orgId, params],
  outstanding:  (orgId) => ['outstanding', orgId],
}

/**
 * Invalidate every Finance read for one org. Uses 2-element PREFIXES for the two
 * ledgers so ALL cached filter variants refresh (TanStack matches partial keys),
 * not just the date/category combo currently on screen. Call after EVERY money
 * mutation, from every surface. No-op without an orgId (nothing is partitioned
 * under undefined, so there would be nothing to invalidate).
 */
export function invalidateFinance(orgId) {
  if (!orgId) return
  queryClient.invalidateQueries({ queryKey: ['clinicTotals', orgId] })
  queryClient.invalidateQueries({ queryKey: ['allCharges', orgId] })
  queryClient.invalidateQueries({ queryKey: ['allPayments', orgId] })
  queryClient.invalidateQueries({ queryKey: ['outstanding', orgId] })
}
