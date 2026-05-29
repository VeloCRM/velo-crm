-- ============================================================================
-- patients.primary_doctor_id — PR #6 (Path A) migration
-- ============================================================================
-- Adds an optional primary-doctor assignment to patients + a supporting index.
-- FILTER ONLY — this is NOT a security boundary. RLS is unchanged: reads stay
-- org-scoped, so every same-org member can still read every patient. The column
-- only powers the "My patients" convenience filter in the UI.
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query → paste → run
-- 2. Verify:
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='patients'
--        AND column_name='primary_doctor_id';
--    -- Expect 1 row
--
--    SELECT indexname FROM pg_indexes
--      WHERE schemaname='public' AND indexname='patients_primary_doctor_idx';
--    -- Expect 1 row
--
-- ─── Notes ─────────────────────────────────────────────────────────────────
-- * Nullable, no default → all existing rows become "unassigned" (NULL). No
--   backfill.
-- * ON DELETE SET NULL → deleting a doctor profile unassigns their patients
--   rather than cascade-deleting live patient records.
-- * Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). Safe to
--   re-run. RLS is intentionally untouched.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.patients_primary_doctor_idx;
-- ALTER TABLE public.patients DROP COLUMN IF EXISTS primary_doctor_id;
--
-- Plan: plans/pr-6-per-doctor-visibility.md
-- ============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS primary_doctor_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patients_primary_doctor_idx
  ON public.patients (org_id, primary_doctor_id);
