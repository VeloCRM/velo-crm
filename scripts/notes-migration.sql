-- ============================================================================
-- notes — PR #5 (Path A) migration
-- ============================================================================
-- Standalone re-runnable SQL for the notes module: the `notes` table, indexes,
-- and RLS (8 policies — _own_org for clinic users + _operator for super-admin
-- bypass). Pure text — NO Storage bucket, NO trigger.
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query
-- 2. Paste this entire file
-- 3. Run
-- 4. Verify:
--    SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' AND table_name = 'notes';
--    -- Expect 1 row
--
--    SELECT policyname FROM pg_policies
--      WHERE schemaname = 'public' AND policyname LIKE 'notes_%'
--      ORDER BY policyname;
--    -- Expect 8 rows (4 ops × 2 scopes)
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * Flat table — one row per note.
-- * RLS uses the existing helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets — _own_org + _operator. No
--   role-tightening on writes; the clinic UI gates roles (owner/doctor).
-- * No trigger — updated_at is set by the data layer; NULL = never edited.
-- * pinned boolean drives the list sort (pinned DESC, created_at DESC), backed
--   by notes_pinned_idx.
-- * external_id + external_source enable GHL import idempotency; external_user_id
--   preserves the GHL note author (no FK — GHL users aren't in our auth.users).
--
-- All statements are idempotent (CREATE TABLE/INDEX IF NOT EXISTS, ENABLE RLS
-- is safely re-runnable, policies wrapped in DO blocks with pg_policies
-- guards). Safe to re-run.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
-- The rollback snippet is at the bottom of this file, commented out.
--
-- Plan: plans/pr-5-notes-module.md
-- ============================================================================

-- ─── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  body             text NOT NULL,
  title            text,
  pinned           boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id      text,
  external_source  text,
  external_user_id text
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS notes_patient_idx ON public.notes (patient_id);
CREATE INDEX IF NOT EXISTS notes_org_idx     ON public.notes (org_id);

CREATE INDEX IF NOT EXISTS notes_pinned_idx
  ON public.notes (patient_id, pinned DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notes_external_uidx
  ON public.notes (external_source, external_id)
  WHERE external_id IS NOT NULL;


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;


-- ─── Policies ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_select_own_org ON public.notes
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_insert_own_org ON public.notes
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_update_own_org ON public.notes
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_delete_own_org ON public.notes
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_select_operator ON public.notes
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_insert_operator ON public.notes
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_update_operator ON public.notes
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_delete_operator ON public.notes
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ============================================================================
-- Rollback (uncomment if needed)
-- ============================================================================
-- DROP POLICY IF EXISTS notes_delete_operator ON public.notes;
-- DROP POLICY IF EXISTS notes_update_operator ON public.notes;
-- DROP POLICY IF EXISTS notes_insert_operator ON public.notes;
-- DROP POLICY IF EXISTS notes_select_operator ON public.notes;
-- DROP POLICY IF EXISTS notes_delete_own_org  ON public.notes;
-- DROP POLICY IF EXISTS notes_update_own_org  ON public.notes;
-- DROP POLICY IF EXISTS notes_insert_own_org  ON public.notes;
-- DROP POLICY IF EXISTS notes_select_own_org  ON public.notes;
--
-- DROP TABLE IF EXISTS public.notes;
