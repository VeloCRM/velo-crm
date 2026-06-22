-- ============================================================================
-- Migration: add profiles.tooth_notation  (Palmer notation toggle, per-doctor)
-- ----------------------------------------------------------------------------
-- Feature: each clinician chooses how tooth numbers render in the UI — FDI
-- (the canonical storage format, 11-48) or Palmer (British, quadrant + 1-8).
-- Storage stays FDI everywhere; this column is a PRESENTATION preference only.
--
-- Safety: purely ADDITIVE. One nullable-with-default text column + CHECK.
--   - No existing column changed, dropped, or renamed.
--   - DEFAULT 'fdi' backfills every existing row implicitly → no UI behavior
--     change for current users until they opt in.
--   - ALTER TABLE ... ADD COLUMN is DDL; it does NOT fire the row-level
--     BEFORE UPDATE trigger `profiles_enforce_immutable`
--     (fn enforce_profile_immutable_fields), which only gates role/org_id
--     changes on UPDATE. Self-updates that set tooth_notation are allowed.
--
-- Deploy: run this in the Supabase SQL editor BEFORE merging the PR. The app
-- code selects `tooth_notation` in fetchMyProfile() and writes it via
-- updateProfile(); without the column those calls error.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tooth_notation text NOT NULL DEFAULT 'fdi'
  CHECK (tooth_notation IN ('fdi', 'palmer'));

COMMENT ON COLUMN profiles.tooth_notation IS
  'Per-doctor UI preference for tooth-number rendering: fdi (canonical, 11-48) or palmer (quadrant + 1-8). Presentation only; dental_chart_entries / treatment_plan_items always store FDI.';

-- ----------------------------------------------------------------------------
-- Verification (run manually after the ALTER; not executed automatically)
-- ----------------------------------------------------------------------------
-- 1. Column exists, correct type / default / not-null:
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name = 'tooth_notation';
--   -> expect: text | 'fdi'::text | NO
--
-- 2. CHECK constraint present:
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'profiles'::regclass AND contype = 'c'
--    AND pg_get_constraintdef(oid) ILIKE '%tooth_notation%';
--   -> expect a CHECK (tooth_notation = ANY (ARRAY['fdi','palmer']))
--
-- 3. Every existing row backfilled to 'fdi':
-- SELECT tooth_notation, count(*) FROM profiles GROUP BY tooth_notation;
--   -> expect all rows 'fdi'
--
-- 4. Rollback (if ever needed — destructive, drops the preference):
-- ALTER TABLE profiles DROP COLUMN IF EXISTS tooth_notation;
