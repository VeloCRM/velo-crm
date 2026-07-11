-- ============================================================================
-- V1.5 Billing — Slice 1 schema (HYBRID: evolve payments + add charges)
-- Implements billing-design.md §3–§5 as an APPEND-ONLY ledger:
--   • charges  = NEW table (what was billed)
--   • payments = EXISTING live table, EVOLVED in place (what was collected)
--   • corrections = void/reversal rows, operator-only (SupCod3 model, supersedes §6)
--   • append-only enforced by REVOKEing UPDATE/DELETE, not by convention
--
-- ⛔ DRAFT — DO NOT RUN. Staging clone first (dujnbboyeugrisgewnqu), dry-run,
--    then prod (aajwuwjxpmmqcwhiynla) via the human-runs-it ceremony
--    (CLAUDE.md net-new-schema protocol: /plan + RLS review + dry-run).
--
-- Trace-confirmed facts baked in:
--   • payments ALREADY EXISTS (id, org_id, patient_id, treatment_plan_id,
--     amount_minor bigint, currency public.currency_code, method
--     public.payment_method, recorded_at, recorded_by, notes, created_at) →
--     we ALTER, never CREATE. Existing columns + BOTH native enums kept as-is.
--   • payment_method enum is the REAL Iraqi set
--     (cash/fib/zaincash/asia_hawala/card/other) — NOT replaced with a text CHECK.
--   • charges does NOT exist → created fresh.
--   • There is NO `treatments` table → charges links treatment_plan_items(id).
--   • Live payments GRANTs SELECT,INSERT,UPDATE,DELETE to authenticated AND anon,
--     and has UPDATE/DELETE RLS policies → the append-only hole this migration closes.
--
-- ⚠️ CODE THAT BREAKS THE MOMENT UPDATE/DELETE IS REVOKED (fix in Slice 2, NOT here):
--   • src/lib/database.js:413 removePayment()  → DELETE on payments → will error.
--       caller: src/App.jsx:1821 deletePayment() (PatientProfile payments tab) →
--       lands in its catch → toast "Failed to delete payment". Feature dead, no crash.
--   • src/lib/database.js:374 patchPayment()   → UPDATE on payments → will error.
--       currently has NO caller in src (dead code today) — safe, but must become
--       append-a-reversal in Slice 2 if payment editing is ever wired up.
--   (Reads are unaffected: fetchPaymentsByPatient/fetchAllPayments/
--    fetchPaymentsWithJoins/fetchPaymentsForOrg, reports.js, goals.js.)
--
-- JUDGMENT CALLS (search "DECISION:"):
--   • Role gate on normal INSERTs: charges → doctor/owner; payments →
--     doctor/receptionist/owner (doctors CAN record payments, per sign-off).
--     Assistant/xray_tech are RLS-denied for both. This TIGHTENS payments vs the
--     old org-scope-only INSERT (assistant loses write). Intended, per design §6.
--   • New money FKs use ON DELETE RESTRICT to protect the trail. Legacy payments
--     FKs remain ON DELETE CASCADE (patient_id/org_id) — divergence flagged below;
--     optional tightening left commented so it's a conscious choice, not a silent one.
-- ============================================================================
BEGIN;

-- ── 1. charges — NEW: what was billed ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.charges (
    id                    uuid                 DEFAULT gen_random_uuid() NOT NULL,
    org_id                uuid                 NOT NULL,
    patient_id            uuid                 NOT NULL,
    treatment_plan_item_id uuid,                                  -- nullable; links the clinical plan item if one exists
    doctor_id             uuid                 NOT NULL,          -- who rendered the service
    kind                  text                 NOT NULL DEFAULT 'charge',
    reverses_id           uuid,                                   -- self-FK; set on kind='void'
    description           text                 NOT NULL,
    amount_minor          bigint               NOT NULL,          -- positive, minor units for currency
    currency              public.currency_code NOT NULL DEFAULT 'IQD',   -- reuse native enum, not text
    created_by            uuid                 NOT NULL,
    created_at            timestamptz          NOT NULL DEFAULT now(),
    CONSTRAINT charges_pkey PRIMARY KEY (id),
    CONSTRAINT charges_kind_check   CHECK (kind IN ('charge', 'void')),
    CONSTRAINT charges_amount_check CHECK (amount_minor > 0),
    -- a void points at the charge it reverses; a normal charge must not.
    CONSTRAINT charges_reverses_shape CHECK (
        (kind = 'void'   AND reverses_id IS NOT NULL) OR
        (kind = 'charge' AND reverses_id IS NULL)
    ),
    CONSTRAINT charges_org_fkey       FOREIGN KEY (org_id)                 REFERENCES public.orgs(id)                 ON DELETE CASCADE,   -- org teardown cascades (consistent w/ all tables)
    CONSTRAINT charges_patient_fkey   FOREIGN KEY (patient_id)             REFERENCES public.patients(id)             ON DELETE RESTRICT,  -- DECISION: protect the trail (legacy payments uses CASCADE)
    CONSTRAINT charges_tpi_fkey       FOREIGN KEY (treatment_plan_item_id) REFERENCES public.treatment_plan_items(id) ON DELETE SET NULL,
    CONSTRAINT charges_doctor_fkey    FOREIGN KEY (doctor_id)              REFERENCES public.profiles(id)             ON DELETE RESTRICT,
    CONSTRAINT charges_reverses_fkey  FOREIGN KEY (reverses_id)            REFERENCES public.charges(id)              ON DELETE RESTRICT,
    CONSTRAINT charges_created_by_fkey FOREIGN KEY (created_by)            REFERENCES public.profiles(id)             ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS charges_org_patient_idx  ON public.charges USING btree (org_id, patient_id);
CREATE INDEX IF NOT EXISTS charges_org_currency_idx ON public.charges USING btree (org_id, currency);

-- ── 2. payments — EVOLVE in place (ledger semantics) ────────────────────────
--    Additive columns only; existing columns + enums untouched.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'payment',
    ADD COLUMN IF NOT EXISTS reverses_id uuid,                  -- self-FK; set on kind='reversal'
    ADD COLUMN IF NOT EXISTS charge_id   uuid;                  -- reserved (V1.6 charge-level allocation)

-- kind CHECK (guarded so a re-run doesn't error on the existing constraint)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_kind_check') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_kind_check CHECK (kind IN ('payment', 'reversal'));
  END IF;
  -- a reversal points at the payment it reverses; a normal payment must not.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_reverses_shape') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_reverses_shape CHECK (
        (kind = 'reversal' AND reverses_id IS NOT NULL) OR
        (kind = 'payment'  AND reverses_id IS NULL)
      );
  END IF;
  -- self-FK for reversal chain (RESTRICT: rows are never deleted anyway)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_reverses_fkey') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_reverses_fkey FOREIGN KEY (reverses_id)
      REFERENCES public.payments(id) ON DELETE RESTRICT;
  END IF;
  -- charge_id FK — added now that charges exists (still nullable / reserved)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_charge_fkey') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_charge_fkey FOREIGN KEY (charge_id)
      REFERENCES public.charges(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Balance-formula support indexes (existing indexes cover created_at only).
CREATE INDEX IF NOT EXISTS payments_org_patient_idx  ON public.payments USING btree (org_id, patient_id);
CREATE INDEX IF NOT EXISTS payments_org_currency_idx ON public.payments USING btree (org_id, currency);

-- Tighten legacy payments.patient_id FK: CASCADE → RESTRICT (protect the money
-- trail — a patient hard-delete must not erase payment history). Signed off.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_patient_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id)
  REFERENCES public.patients(id) ON DELETE RESTRICT;

-- ── 3. APPEND-ONLY LOCK (grants) ────────────────────────────────────────────
-- Close the live hole: no UPDATE/DELETE for clinic users on payments.
REVOKE UPDATE, DELETE ON public.payments FROM authenticated;
REVOKE UPDATE, DELETE ON public.payments FROM anon;          -- anon had the grant too; RLS already blocks it, revoked for cleanliness
-- service_role retains ALL (server-side migrations/backfills) — unchanged.

-- charges: SELECT + INSERT only, for anyone. No UPDATE/DELETE grant to anyone.
REVOKE ALL ON public.charges FROM anon, authenticated;
GRANT  SELECT, INSERT ON public.charges TO authenticated;
GRANT  ALL            ON public.charges TO service_role;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
--    Mirror the patients own_org + operator pattern. Normal rows: org member,
--    role-gated, self-stamped. Corrections (void/reversal): operator only.
--    No UPDATE/DELETE policy anywhere → those commands are denied even to owners
--    (belt-and-braces with the grant revokes above).

-- 4a. charges RLS
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS charges_select_own_org  ON public.charges;
CREATE POLICY charges_select_own_org ON public.charges
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS charges_select_operator ON public.charges;
CREATE POLICY charges_select_operator ON public.charges
    FOR SELECT TO authenticated
    USING (public.is_operator());

-- normal charge: org member with role doctor/owner, self-stamped
DROP POLICY IF EXISTS charges_insert_own_org ON public.charges;
CREATE POLICY charges_insert_own_org ON public.charges
    FOR INSERT TO authenticated
    WITH CHECK (
        org_id = public.current_org_id()
        AND kind = 'charge'
        AND created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('doctor'::public.profile_role, 'owner'::public.profile_role)
        )
    );

-- corrections ('void') + any operator-entered charge: operator only
DROP POLICY IF EXISTS charges_insert_operator ON public.charges;
CREATE POLICY charges_insert_operator ON public.charges
    FOR INSERT TO authenticated
    WITH CHECK (public.is_operator());

-- 4b. payments RLS — drop UPDATE/DELETE policies, re-gate INSERT, keep SELECT
DROP POLICY IF EXISTS payments_update_operator ON public.payments;
DROP POLICY IF EXISTS payments_update_own_org  ON public.payments;
DROP POLICY IF EXISTS payments_delete_operator ON public.payments;
DROP POLICY IF EXISTS payments_delete_own_org  ON public.payments;

-- SELECT policies already exist and are correct (org_id = current_org_id() /
-- is_operator()); recreated here idempotently for a self-contained migration.
DROP POLICY IF EXISTS payments_select_own_org  ON public.payments;
CREATE POLICY payments_select_own_org ON public.payments
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payments_select_operator ON public.payments;
CREATE POLICY payments_select_operator ON public.payments
    FOR SELECT TO authenticated
    USING (public.is_operator());

-- normal payment: org member with role receptionist/owner, self-stamped
DROP POLICY IF EXISTS payments_insert_own_org ON public.payments;
CREATE POLICY payments_insert_own_org ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        org_id = public.current_org_id()
        AND kind = 'payment'
        AND recorded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('doctor'::public.profile_role, 'receptionist'::public.profile_role, 'owner'::public.profile_role)
        )
    );

-- corrections ('reversal') + any operator-entered payment: operator only
DROP POLICY IF EXISTS payments_insert_operator ON public.payments;
CREATE POLICY payments_insert_operator ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (public.is_operator());

COMMIT;

-- ── VERIFY (run separately, AFTER commit, on the staging clone) ──────────────
-- 1) charges exists:
--   SELECT to_regclass('public.charges');                                  -- not null
-- 2) payments has the new ledger columns:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='payments' AND column_name IN ('kind','reverses_id','charge_id');  -- 3 rows
-- 3) new constraints present:
--   SELECT conname FROM pg_constraint
--    WHERE conname IN ('payments_kind_check','payments_reverses_shape',
--                      'payments_reverses_fkey','payments_charge_fkey',
--                      'charges_kind_check','charges_amount_check','charges_reverses_shape');
-- 4) APPEND-ONLY LOCK — authenticated has NO update/delete on payments, and
--    NO update/delete on charges:
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name IN ('payments','charges')
--    ORDER BY table_name, privilege_type;
--   -- EXPECT: payments → SELECT, INSERT only ; charges → SELECT, INSERT only.
-- 5) policy inventory — SELECT/INSERT only, no UPDATE/DELETE row:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('payments','charges') ORDER BY tablename, cmd;
-- 6) balance-formula smoke (design §4): as a receptionist insert a payment, as a
--    doctor insert a charge, as an operator insert a void + a reversal; confirm
--    owed(patient,CUR)=Σactive charges − Σactive payments nets correctly, and that
--    a clinic user's UPDATE/DELETE + a non-operator void/reversal are REJECTED.

-- ── ROLLBACK (if the dry-run is rejected) ───────────────────────────────────
--   BEGIN;
--     -- restore payments grants + policies to pre-migration state
--     GRANT UPDATE, DELETE ON public.payments TO authenticated;
--     GRANT UPDATE, DELETE ON public.payments TO anon;
--     DROP POLICY IF EXISTS payments_insert_own_org  ON public.payments;
--     DROP POLICY IF EXISTS payments_insert_operator ON public.payments;
--     CREATE POLICY payments_insert_own_org  ON public.payments FOR INSERT TO authenticated WITH CHECK ((org_id = public.current_org_id()));
--     CREATE POLICY payments_insert_operator ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_operator());
--     CREATE POLICY payments_update_own_org  ON public.payments FOR UPDATE TO authenticated USING ((org_id = public.current_org_id())) WITH CHECK ((org_id = public.current_org_id()));
--     CREATE POLICY payments_update_operator ON public.payments FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
--     CREATE POLICY payments_delete_own_org  ON public.payments FOR DELETE TO authenticated USING ((org_id = public.current_org_id()));
--     CREATE POLICY payments_delete_operator ON public.payments FOR DELETE TO authenticated USING (public.is_operator());
--     -- drop the added columns/constraints (charge_id FK auto-drops with the column)
--     ALTER TABLE public.payments
--       DROP CONSTRAINT IF EXISTS payments_reverses_fkey,
--       DROP CONSTRAINT IF EXISTS payments_charge_fkey,
--       DROP CONSTRAINT IF EXISTS payments_kind_check,
--       DROP CONSTRAINT IF EXISTS payments_reverses_shape,
--       DROP COLUMN IF EXISTS charge_id,
--       DROP COLUMN IF EXISTS reverses_id,
--       DROP COLUMN IF EXISTS kind;
--     DROP INDEX IF EXISTS public.payments_org_patient_idx;
--     DROP INDEX IF EXISTS public.payments_org_currency_idx;
--     -- restore legacy patient_id FK on-delete behavior (RESTRICT → CASCADE)
--     ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_patient_id_fkey;
--     ALTER TABLE public.payments
--       ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id)
--       REFERENCES public.patients(id) ON DELETE CASCADE;
--     -- drop charges last (payments.charge_id FK already gone above)
--     DROP TABLE IF EXISTS public.charges;   -- drops its policies + indexes
--   COMMIT;
