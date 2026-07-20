-- ============================================================================
-- Per-doctor production report — Σ a doctor's ACTIVE charges, per currency,
-- within an optional [p_from, p_to) window.  RPC (not a view) because the date
-- filter must precede aggregation; SECURITY INVOKER so RLS scopes it per-tenant;
-- PLUS a caller-based visibility predicate enforced HERE, server-side (below).
--
-- ⛔ DRAFT — DO NOT RUN. Staging clone first (dry-run via
--    scratchpad/dryrun-per-doctor-report.mjs), verify, THEN prod
--    (aajwuwjxpmmqcwhiynla) via the human-runs-it ceremony (CLAUDE.md net-new-schema
--    protocol). Read-only object: adds a FUNCTION + EXECUTE grant; it cannot write
--    (no INSERT/UPDATE/DELETE; the charges append-only lock is untouched).
--
-- ── ACTIVE-ROW RULE (verbatim from finance-ledger-totals.sql / billing.js) ────
--   kind='charge' AND NOT EXISTS (void row whose reverses_id = this charge's id).
--   The void EXISTS is intentionally NOT date-filtered: a charge created in-range
--   but voided later is NOT produced. With p_from=p_to=NULL the per-currency Σ over
--   ALL buckets (incl. the NULL-doctor bucket) equals finance_ledger_totals.billed
--   — but ONLY for a caller who can see all rows (owner/operator; see visibility).
--
-- ── VISIBILITY (server-side; client filtering is NOT acceptable) ──────────────
--   Per-doctor revenue is sensitive. The predicate is resolved from the CALLER
--   (auth.uid()), once, at the top of the body:
--     • operator (is_operator())      → sees ALL rows for the orgs their RLS exposes
--                                        (they run the clinics — owner-equivalent).
--                                        Checked FIRST: operators have no profiles row.
--     • role = 'owner'                → ALL doctors + the NULL "other income" bucket.
--     • role = 'doctor'               → ONLY rows where doctor_id = their own id.
--                                        NEVER the NULL bucket (clinic income is an
--                                        owner concern). doctor_id = auth.uid() works
--                                        because profiles.id = auth.users.id.
--     • any other role / no profile   → ZERO rows (RETURN before the query).
--   This is IN ADDITION to RLS, not instead of it. RLS still scopes which org(s)
--   the base scans expose; the predicate then narrows WHICH DOCTORS within that.
--
-- ── SECURITY / RLS + why operator-as-owner does NOT break isolation ──────────
--   SECURITY INVOKER (the default) — NOT security definer. Base-table scans on
--   charges/profiles run as the CALLING role, so the existing RLS SELECT policies
--   apply transparently:
--     • clinic user → charges_select_own_org (org_id = current_org_id()) → only
--                     their org's charges. A DOCTOR is then further narrowed to
--                     their own doctor_id; a RECEPTIONIST/ASSISTANT/xray_tech to zero.
--     • operator    → charges_select_operator (is_operator()) → all orgs, kept
--                     SEPARATE by GROUP BY org_id. Operators are a distinct trust
--                     tier (agency staff who run the clinics); granting them the
--                     all-doctors view does NOT widen what any CLINIC MEMBER sees —
--                     a doctor/receptionist in org A still cannot see org B (RLS),
--                     and a doctor still cannot see another doctor (predicate). So
--                     the isolation property for clinic members is preserved.
--   A SECURITY DEFINER function would BYPASS RLS and force a hand-written org
--   predicate on every scan — one miss = a cross-tenant leak. INVOKER inherits the
--   proven, already-audited policies for free and cannot write. LEFT JOIN profiles
--   so the NULL-doctor bucket — and any charge whose profile RLS-hides — still
--   counts toward produced (name may be NULL; the money is never dropped).
--
--   Idempotent: CREATE OR REPLACE. Re-runnable. GRANT EXECUTE only.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.per_doctor_production(
    p_from timestamptz DEFAULT NULL,   -- inclusive lower bound; NULL = unbounded
    p_to   timestamptz DEFAULT NULL    -- EXCLUSIVE upper bound; NULL = unbounded
)
RETURNS TABLE (
    org_id      uuid,
    doctor_id   uuid,                 -- NULL = non-clinical "other income" bucket
    doctor_name text,                 -- NULL when doctor_id IS NULL (UI labels it)
    currency    public.currency_code,
    produced    bigint                -- Σ active charge amount_minor (minor units)
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_uid     uuid    := auth.uid();
    v_is_op   boolean := public.is_operator();
    v_role    text;
    v_see_all boolean;
BEGIN
    -- Resolve the caller's visibility ONCE. Operators FIRST — they have no profiles
    -- row but run the clinics, so they are owner-equivalent for the orgs RLS exposes.
    IF v_is_op THEN
        v_see_all := true;
    ELSE
        SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id = v_uid;
        v_see_all := (v_role = 'owner');
    END IF;

    -- Not owner/operator and not a doctor (receptionist / assistant / xray_tech /
    -- unknown / no profile) → they see nothing at all.
    IF NOT v_see_all AND v_role IS DISTINCT FROM 'doctor' THEN
        RETURN;  -- zero rows
    END IF;

    RETURN QUERY
    SELECT
        c.org_id,
        c.doctor_id,
        pr.full_name AS doctor_name,
        c.currency,
        SUM(c.amount_minor)::bigint AS produced
    FROM public.charges c
    LEFT JOIN public.profiles pr ON pr.id = c.doctor_id
    WHERE c.kind = 'charge'
      AND NOT EXISTS (SELECT 1 FROM public.charges r WHERE r.reverses_id = c.id)
      AND (p_from IS NULL OR c.created_at >= p_from)
      AND (p_to   IS NULL OR c.created_at <  p_to)
      -- Visibility: owner/operator (v_see_all) see every doctor + the NULL bucket;
      -- a doctor sees ONLY their own clinical rows (c.doctor_id = v_uid, which can
      -- never match the NULL bucket). RLS still scopes the org(s) underneath.
      AND (v_see_all OR c.doctor_id = v_uid)
    GROUP BY c.org_id, c.doctor_id, pr.full_name, c.currency
    ORDER BY c.org_id, produced DESC, c.currency;
END;
$$;

-- ── Grants: EXECUTE only; anon excluded (Finance/Reports are authenticated-only) ──
-- RLS + the visibility predicate gate WHAT each caller sees; EXECUTE gates WHO may
-- invoke. A receptionist CAN execute it — it simply returns zero rows for them.
REVOKE ALL ON FUNCTION public.per_doctor_production(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.per_doctor_production(timestamptz, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.per_doctor_production(timestamptz, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.per_doctor_production(timestamptz, timestamptz) TO service_role;

COMMIT;

-- ── VERIFY (run separately, AFTER commit, on the staging clone) ──────────────
-- 1) It is INVOKER, not definer:
--    SELECT proname, prosecdef FROM pg_proc WHERE proname='per_doctor_production';
--    -- EXPECT prosecdef = false.
--
-- 2) Grants — authenticated has EXECUTE, anon does not:
--    SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--     WHERE routine_name='per_doctor_production' ORDER BY grantee;
--    -- EXPECT authenticated → EXECUTE; anon → no row.
--
-- 3) VISIBILITY (simulate each caller with SET ROLE authenticated + JWT-claim GUC):
--    • as an OWNER of an org with charges → all doctors + the NULL bucket; and
--      SUM(produced) per currency == finance_ledger_totals.billed (reconciliation).
--    • as a DOCTOR → only rows where doctor_id = that doctor; NO NULL bucket.
--    • as a RECEPTIONIST → zero rows.
--    (Exercised by scratchpad/dryrun-per-doctor-report.mjs.)
--
-- 4) Tenant isolation, as a clinic user:
--    SELECT bool_and(org_id = public.current_org_id()) FROM public.per_doctor_production(NULL, NULL);
--    -- EXPECT true (or no rows). An operator would instead see multiple org_ids.

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.per_doctor_production(timestamptz, timestamptz);
