-- ============================================================================
-- prescriptions / prescription_items — PR #2 (Path A) migration
-- ============================================================================
-- Standalone re-runnable SQL for the prescriptions module: parent + child
-- tables, indexes, set_updated_at trigger, and RLS (8 policies per table —
-- _own_org for clinic users + _operator for super-admin bypass).
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query
-- 2. Paste this entire file
-- 3. Run
-- 4. Verify:
--    SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public'
--        AND table_name IN ('prescriptions', 'prescription_items');
--    -- Expect 2 rows
--
--    SELECT policyname FROM pg_policies
--      WHERE schemaname = 'public'
--        AND (policyname LIKE 'prescriptions_%' OR policyname LIKE 'prescription_items_%')
--      ORDER BY policyname;
--    -- Expect 16 rows (4 ops × 2 scopes × 2 tables)
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * prescription_items denormalizes org_id (matches treatment_plan_items
--   precedent in schema.sql).
-- * RLS uses the existing helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets per table — _own_org + _operator.
--   No role-tightening on writes; clinic UI gates roles via EDIT_ROLES in
--   DentalTabs.jsx (matches the treatment_plans precedent).
-- * Audit columns updated_at/updated_by are nullable so NULL clearly signals
--   "never modified since creation." A BEFORE UPDATE trigger maintains
--   updated_at; updated_by must be set by the data layer (no auth context in
--   a generic trigger function).
-- * external_id + external_source enable GHL / external-system import
--   idempotency via a partial unique index on the non-null pair.
-- * doctor_id ON DELETE RESTRICT — prescriptions are permanent clinical
--   records and must not be orphaned by an accidental doctor deletion.
--
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, ALTER TABLE ENABLE RLS is safely re-runnable,
-- policies wrapped in DO blocks with pg_policies guards). Safe to re-run.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
-- The rollback snippet is at the bottom of this file, commented out. Uncomment
-- and run if you need to fully reset the prescription tables.
--
-- Plan: plans/pr-2-prescriptions-module.md
-- ============================================================================

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  general_instructions  text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Partial audit trail: NULL = never updated since creation.
  updated_at            timestamptz,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- External-system import idempotency (e.g. GHL). Both NULL for native creates.
  external_id           text,
  external_source       text
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  drug_name       text NOT NULL,
  dosage          text,
  frequency       text,
  duration        text,
  instructions    text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at
  ON public.prescriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_org_patient_issued
  ON public.prescriptions (org_id, patient_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor
  ON public.prescriptions (doctor_id);

-- Partial unique: enforces (external_source, external_id) uniqueness only
-- when external_id IS NOT NULL. Native creates (NULL pair) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_external_uniq
  ON public.prescriptions (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prescription_items_created_at
  ON public.prescription_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription
  ON public.prescription_items (prescription_id, sort_order);


-- ─── Trigger — auto-update updated_at on UPDATE ────────────────────────────
-- Relies on public.set_updated_at() (defined in schema.sql section 6).

DROP TRIGGER IF EXISTS prescriptions_set_updated_at ON public.prescriptions;
CREATE TRIGGER prescriptions_set_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.prescriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;


-- ─── Policies — prescriptions ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_own_org ON public.prescriptions
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_insert_own_org ON public.prescriptions
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_update_own_org ON public.prescriptions
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_delete_own_org ON public.prescriptions
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_operator ON public.prescriptions
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_insert_operator ON public.prescriptions
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_update_operator ON public.prescriptions
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_delete_operator ON public.prescriptions
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ─── Policies — prescription_items ─────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_select_own_org ON public.prescription_items
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_insert_own_org ON public.prescription_items
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_update_own_org ON public.prescription_items
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_delete_own_org ON public.prescription_items
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_select_operator ON public.prescription_items
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_insert_operator ON public.prescription_items
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_update_operator ON public.prescription_items
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_delete_operator ON public.prescription_items
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ─── Trigger — doctor_id semantic integrity ────────────────────────────────
-- RLS only enforces tenancy (org_id match). The doctor_id must additionally
-- reference a profile with role='doctor' in the SAME org. RLS can't express
-- a cross-row predicate on referenced data without an EXISTS subquery, and
-- adding that to every write policy would diverge from the codebase's
-- helper-function-only convention. A trigger keeps the check co-located with
-- the table and fires only when doctor_id or org_id changes (skipping
-- general_instructions/issued_at-only UPDATEs).

CREATE OR REPLACE FUNCTION public.enforce_prescription_doctor_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.doctor_id
      AND role = 'doctor'
      AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'doctor_id must reference a profile with role=''doctor'' in the same org (got doctor_id=%, org_id=%)', NEW.doctor_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prescriptions_enforce_doctor_role'
      AND tgrelid = 'public.prescriptions'::regclass
  ) THEN
    CREATE TRIGGER prescriptions_enforce_doctor_role
      BEFORE INSERT OR UPDATE OF doctor_id, org_id ON public.prescriptions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_prescription_doctor_role();
  END IF;
END $$;


-- ============================================================================
-- Rollback (uncomment if needed)
-- ============================================================================
-- DROP TRIGGER IF EXISTS prescriptions_enforce_doctor_role ON public.prescriptions;
-- DROP FUNCTION IF EXISTS public.enforce_prescription_doctor_role();
--
-- DROP POLICY IF EXISTS prescription_items_delete_operator ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_update_operator ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_insert_operator ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_select_operator ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_delete_own_org  ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_update_own_org  ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_insert_own_org  ON public.prescription_items;
-- DROP POLICY IF EXISTS prescription_items_select_own_org  ON public.prescription_items;
--
-- DROP POLICY IF EXISTS prescriptions_delete_operator ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_update_operator ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_insert_operator ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_select_operator ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_delete_own_org  ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_update_own_org  ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_insert_own_org  ON public.prescriptions;
-- DROP POLICY IF EXISTS prescriptions_select_own_org  ON public.prescriptions;
--
-- DROP TRIGGER IF EXISTS prescriptions_set_updated_at ON public.prescriptions;
--
-- DROP TABLE IF EXISTS public.prescription_items;
-- DROP TABLE IF EXISTS public.prescriptions;
