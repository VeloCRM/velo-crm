-- patient-outstanding-balances-view.sql
-- SQL replacement for billing.js getOutstandingCollections — moves the org-wide
-- ledger aggregation out of client JS and into the DB. READ-ONLY DRAFT — NOT applied.
--
-- WHY A VIEW (not an RPC): this read has NO date parameter (unlike per_doctor_production).
-- A security_invoker VIEW is the right shape — same pattern as finance_ledger_totals —
-- so RLS on the base tables applies to the caller and there is no argument to pass.
--
-- GRAIN: one row per (org, patient, currency) WHERE net owed > 0.
-- ACTIVE-ROW RULE: VERBATIM from finance_ledger_totals — kind = positive-kind AND
--   NOT EXISTS a row whose reverses_id points at it. Backed by charges_reverses_idx /
--   payments_reverses_idx from scale-indexes-migration.sql.
-- latest_charge_at: PATIENT-level (max over ALL active charges of the patient), so it
--   matches the JS exactly (the JS returns ONE date per patient across currencies).

CREATE OR REPLACE VIEW public.patient_outstanding_balances
WITH (security_invoker = true) AS
WITH active_charges AS (
  SELECT c.org_id, c.patient_id, c.currency, c.amount_minor, c.created_at
  FROM public.charges c
  WHERE c.kind = 'charge'
    AND NOT (EXISTS ( SELECT 1 FROM public.charges r WHERE r.reverses_id = c.id ))
),
active_payments AS (
  SELECT p.org_id, p.patient_id, p.currency, p.amount_minor
  FROM public.payments p
  WHERE p.kind = 'payment'
    AND NOT (EXISTS ( SELECT 1 FROM public.payments r WHERE r.reverses_id = p.id ))
),
charged AS (
  SELECT org_id, patient_id, currency, sum(amount_minor)::bigint AS charged
  FROM active_charges
  GROUP BY org_id, patient_id, currency
),
paid AS (
  SELECT org_id, patient_id, currency, sum(amount_minor)::bigint AS paid
  FROM active_payments
  GROUP BY org_id, patient_id, currency
),
net AS (  -- per (patient, currency): Σ active charges − Σ active payments
  SELECT COALESCE(c.org_id, p.org_id)         AS org_id,
         COALESCE(c.patient_id, p.patient_id) AS patient_id,
         COALESCE(c.currency, p.currency)     AS currency,
         COALESCE(c.charged, 0) - COALESCE(p.paid, 0) AS owed
  FROM charged c
  FULL JOIN paid p
    ON  c.org_id     = p.org_id
    AND c.patient_id = p.patient_id
    AND c.currency   = p.currency
),
patient_latest AS (  -- one date per patient (max over ALL active charges) — matches JS
  SELECT org_id, patient_id, max(created_at) AS latest_charge_at
  FROM active_charges
  GROUP BY org_id, patient_id
)
SELECT n.org_id,
       n.patient_id,
       pt.full_name,
       pt.phone,
       n.currency,
       n.owed,
       pl.latest_charge_at
FROM net n
JOIN public.patients pt
  ON pt.id = n.patient_id AND pt.org_id = n.org_id
LEFT JOIN patient_latest pl
  ON pl.org_id = n.org_id AND pl.patient_id = n.patient_id
WHERE n.owed > 0;

-- ── Grants: SELECT-only; reads inherit the caller's RLS (security_invoker) ────
-- Supabase default privileges GRANT ALL to anon/authenticated on new public views,
-- and REVOKE ... FROM PUBLIC does NOT strip role-specific grants — so authenticated
-- must be revoked EXPLICITLY before re-granting only SELECT (same fix as
-- finance_ledger_totals). All five are ACTIVE statements (no leading `--`).
REVOKE ALL ON public.patient_outstanding_balances FROM PUBLIC;
REVOKE ALL ON public.patient_outstanding_balances FROM anon;
REVOKE ALL ON public.patient_outstanding_balances FROM authenticated;
GRANT  SELECT ON public.patient_outstanding_balances TO authenticated;
GRANT  SELECT ON public.patient_outstanding_balances TO service_role;

-- ── Reconciliation probe (#6): gross "to collect" per currency ───────────────
-- Must equal Σ of the positive per-currency balances the JS currently returns.
--   SELECT currency, sum(owed) AS gross_to_collect
--   FROM public.patient_outstanding_balances WHERE org_id = '<org>' GROUP BY currency;
-- Relationship to finance_ledger_totals: this gross >= outstanding (net), because the
-- net view nets in patient credits (negative balances) that the worklist excludes —
-- exactly the UI copy "net nets in patient credits".
