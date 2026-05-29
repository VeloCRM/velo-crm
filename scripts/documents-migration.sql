-- ============================================================================
-- documents — PR #4 (Path A) migration
-- ============================================================================
-- Standalone re-runnable SQL for the documents module: the `documents` table,
-- indexes, and RLS (8 policies — _own_org for clinic users + _operator for
-- super-admin bypass).
--
-- NOTE: This script covers the TABLE only. The `patient-documents` Storage
-- bucket and its storage.objects RLS live in a separate script
-- (scripts/patient-documents-bucket.sql), run AFTER creating the bucket via
-- the Supabase dashboard.
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query
-- 2. Paste this entire file
-- 3. Run
-- 4. Verify:
--    SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' AND table_name = 'documents';
--    -- Expect 1 row
--
--    SELECT policyname FROM pg_policies
--      WHERE schemaname = 'public' AND policyname LIKE 'documents_%'
--      ORDER BY policyname;
--    -- Expect 8 rows (4 ops × 2 scopes)
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * Flat table — one row per uploaded file. No parent/child shape.
-- * RLS uses the existing helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets — _own_org + _operator. No
--   role-tightening on table writes; the clinic UI gates roles and the Storage
--   bucket RLS additionally role-gates writes (separate script).
-- * No trigger — documents carry no cross-table semantic invariant.
-- * uploaded_by ON DELETE SET NULL — a removed uploader account must not
--   cascade-delete clinical records.
-- * external_id + external_source enable GHL / external-system import
--   idempotency via a partial unique index on the non-null pair.
--
-- All statements are idempotent (CREATE TABLE/INDEX IF NOT EXISTS, ENABLE RLS
-- is safely re-runnable, policies wrapped in DO blocks with pg_policies
-- guards). Safe to re-run.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
-- The rollback snippet is at the bottom of this file, commented out.
--
-- Plan: plans/pr-4-documents-module.md
-- ============================================================================

-- ─── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  mime_type       text,
  file_size       bigint,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  external_id     text,
  external_source text
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS documents_patient_idx ON public.documents (patient_id);
CREATE INDEX IF NOT EXISTS documents_org_idx     ON public.documents (org_id);

CREATE UNIQUE INDEX IF NOT EXISTS documents_external_uidx
  ON public.documents (external_source, external_id)
  WHERE external_id IS NOT NULL;


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;


-- ─── Policies ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_select_own_org ON public.documents
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_insert_own_org ON public.documents
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_update_own_org ON public.documents
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_delete_own_org ON public.documents
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_select_operator ON public.documents
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_insert_operator ON public.documents
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_update_operator ON public.documents
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_delete_operator ON public.documents
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ============================================================================
-- Rollback (uncomment if needed)
-- ============================================================================
-- DROP POLICY IF EXISTS documents_delete_operator ON public.documents;
-- DROP POLICY IF EXISTS documents_update_operator ON public.documents;
-- DROP POLICY IF EXISTS documents_insert_operator ON public.documents;
-- DROP POLICY IF EXISTS documents_select_operator ON public.documents;
-- DROP POLICY IF EXISTS documents_delete_own_org  ON public.documents;
-- DROP POLICY IF EXISTS documents_update_own_org  ON public.documents;
-- DROP POLICY IF EXISTS documents_insert_own_org  ON public.documents;
-- DROP POLICY IF EXISTS documents_select_own_org  ON public.documents;
--
-- DROP TABLE IF EXISTS public.documents;
