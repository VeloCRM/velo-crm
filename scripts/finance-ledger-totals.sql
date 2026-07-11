-- ============================================================================
-- Finance sub-slice 1 — clinic-wide ledger totals (per org, per currency)
--
-- A READ-ONLY derived view the Finance page queries instead of pulling the whole
-- charges/payments ledger client-side. Per (org_id, currency):
--   billed      = Σ active charges
--   collected   = Σ active payments
--   outstanding = billed − collected            (never blends currencies)
--
-- ⛔ DRAFT — DO NOT RUN. Staging clone first, verify, then prod via the
--    human-runs-it ceremony. Read-only: adds a VIEW + a SELECT grant. It does NOT
--    touch the append-only lock (no UPDATE/DELETE, no INSTEAD OF triggers — a plain
--    view cannot write).
--
-- ── ACTIVE-ROW RULE (must match billing.js activeRows/owedByCurrency, and the
--    exact SQL proven in scripts/dryrun-billing-slice2.mjs) ────────────────────
--   A positive row counts ONLY while its id is NOT referenced by any reverses_id:
--     active charge  : kind='charge'   AND NOT EXISTS (SELECT 1 FROM charges  r WHERE r.reverses_id = c.id)
--     active payment : kind='payment'  AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id = p.id)
--   void/reversal rows never count positive, and the original they reference drops
--   out. Because outstanding = Σ(active charges) − Σ(active payments) grouped by
--   currency, the clinic-wide outstanding per currency equals the SUM of every
--   patient's getPatientBalance(...) for that currency — the numbers reconcile
--   exactly with the per-patient balances.
--
-- ── SECURITY / RLS (the whole ballgame for a multi-tenant view) ───────────────
--   Postgres runs a view's underlying table access as the view's OWNER by default,
--   and the owner (a table owner / superuser) BYPASSES RLS. A default view over
--   charges/payments would therefore leak EVERY org's totals to any caller.
--
--   FIX: WITH (security_invoker = on)  [Postgres 15+, which Supabase runs].
--   With it on, the base-table scans execute as the QUERYING role, so the existing
--   RLS SELECT policies apply transparently:
--     • clinic user  → charges_select_own_org / payments_select_own_org
--                      (org_id = current_org_id()) → sees ONLY their org's rows →
--                      the view returns exactly one org_id's currencies.
--     • operator     → charges_select_operator / payments_select_operator
--                      (is_operator()) → sees all orgs → GROUP BY org_id keeps them
--                      SEPARATE (no cross-org blending).
--   No manual org filter is needed in the view — RLS does the scoping. This is why
--   a security_invoker VIEW is SAFER here than a SECURITY DEFINER RPC:
--     • DEFINER RPC bypasses RLS and must hand-write `WHERE org_id = current_org_id()`
--       on every base scan; one forgotten predicate = a cross-tenant leak.
--     • INVOKER view inherits the proven, already-audited SELECT policies for free,
--       and cannot write (append-only lock untouched).
--   RECOMMENDATION: the security_invoker VIEW below. (A STABLE SQL function marked
--   SECURITY INVOKER would be equ-safe but is unnecessary indirection; a DEFINER
--   function is the riskiest option and is deliberately NOT used.)
--
--   Idempotent: CREATE OR REPLACE. Re-runnable. GRANT SELECT only.
-- ============================================================================

-- ── The view ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.finance_ledger_totals
    WITH (security_invoker = on) AS
WITH billed AS (
    -- Σ active charges per (org, currency) — proven active-row predicate.
    SELECT c.org_id, c.currency, SUM(c.amount_minor)::bigint AS billed
    FROM public.charges c
    WHERE c.kind = 'charge'
      AND NOT EXISTS (SELECT 1 FROM public.charges r WHERE r.reverses_id = c.id)
    GROUP BY c.org_id, c.currency
),
collected AS (
    -- Σ active payments per (org, currency) — proven active-row predicate.
    SELECT p.org_id, p.currency, SUM(p.amount_minor)::bigint AS collected
    FROM public.payments p
    WHERE p.kind = 'payment'
      AND NOT EXISTS (SELECT 1 FROM public.payments r WHERE r.reverses_id = p.id)
    GROUP BY p.org_id, p.currency
)
-- FULL OUTER JOIN so a currency that has only charges (nothing collected yet) or
-- only payments (a credit before any charge) still yields a row. COALESCE the
-- absent side to 0. Currencies are NEVER blended: the join key includes currency.
SELECT
    COALESCE(b.org_id,   c.org_id)   AS org_id,
    COALESCE(b.currency, c.currency) AS currency,
    COALESCE(b.billed,    0)::bigint AS billed,
    COALESCE(c.collected, 0)::bigint AS collected,
    (COALESCE(b.billed, 0) - COALESCE(c.collected, 0))::bigint AS outstanding
FROM billed b
FULL OUTER JOIN collected c
    ON b.org_id = c.org_id AND b.currency = c.currency;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- SELECT only. A new relation inherits Supabase's default privileges
-- (ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO authenticated), which would
-- hand authenticated INSERT/UPDATE/DELETE too — meaningless on a read-only view,
-- but noise on the grant surface. REVOKE ALL first, then GRANT SELECT, so the
-- view ends up SELECT-only. anon gets nothing (Finance is authenticated-only).
-- security_invoker means the caller ALSO needs SELECT on the base tables —
-- authenticated already has it (GRANT SELECT, INSERT ON charges/payments from Slice 1).
REVOKE ALL ON public.finance_ledger_totals FROM anon;
REVOKE ALL ON public.finance_ledger_totals FROM authenticated;
GRANT  SELECT ON public.finance_ledger_totals TO authenticated;
GRANT  SELECT ON public.finance_ledger_totals TO service_role;

-- ── VERIFY (run separately, AFTER create, on the staging clone) ──────────────
-- 1) security_invoker is ON (the multi-tenant safety switch):
--    SELECT c.relname, c.reloptions
--      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname='public' AND c.relname='finance_ledger_totals';
--    -- EXPECT reloptions to contain: security_invoker=on
--
-- 2) grants — authenticated has SELECT and ONLY SELECT, anon has nothing:
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='finance_ledger_totals'
--     ORDER BY grantee, privilege_type;
--    -- EXPECT authenticated → SELECT only (no INSERT/UPDATE/DELETE); anon → no rows.
--
-- 3) RECONCILIATION — clinic-wide outstanding == Σ per-patient balances.
--    As a normal clinic user (so RLS scopes to one org), compare the view against
--    the proven per-patient active-row query aggregated across patients:
--    WITH ac AS (
--      SELECT currency, amount_minor FROM charges c
--       WHERE c.kind='charge' AND NOT EXISTS (SELECT 1 FROM charges r WHERE r.reverses_id=c.id)),
--         ap AS (
--      SELECT currency, amount_minor FROM payments p
--       WHERE p.kind='payment' AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id=p.id)),
--         net AS (
--      SELECT currency, SUM(amount_minor) amt FROM ac GROUP BY currency
--      UNION ALL SELECT currency, -SUM(amount_minor) FROM ap GROUP BY currency)
--    SELECT currency, SUM(amt)::bigint AS owed FROM net GROUP BY currency;
--    -- EXPECT: owed(currency) == outstanding(currency) from finance_ledger_totals, per currency.
--
-- 4) tenant isolation — as clinic user, every returned row's org_id = current_org_id():
--    SELECT bool_and(org_id = public.current_org_id()) FROM public.finance_ledger_totals;
--    -- EXPECT: true (or no rows). An operator would instead see multiple org_ids.

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
--   DROP VIEW IF EXISTS public.finance_ledger_totals;

-- ── NOTE on semantics (for the Finance UI) ───────────────────────────────────
-- outstanding here is the NET clinic receivable: a patient's credit / overpayment
-- (negative balance) REDUCES it. That is the correct clinic-wide net, and it is
-- what reconciles with Σ getPatientBalance. It is NOT the same as
-- getOutstandingCollections, which sums only patients owing > 0 (the worklist).
-- If the UI ever wants "gross still-to-collect, ignoring credits" =
-- Σ max(patient_owed, 0), that must group by patient first (a different view);
-- do NOT expect these two numbers to be identical when any patient holds credit.
