-- ============================================================================
-- v1.5-add-xray-tech-role.sql  —  add the `xray_tech` role + xrays RLS
-- ----------------------------------------------------------------------------
-- V1.5 PR A. Adds a new profile_role value and lets xray_tech upload X-rays to
-- ANY patient, but UPDATE/DELETE only their OWN uploads. owner/doctor keep full
-- xray write; receptionist stays read-only on xrays (unchanged).
--
-- ⚠️ TWO-PHASE — RUN IN ORDER, EACH AS ITS OWN TRANSACTION:
--   PHASE A: ALTER TYPE ... ADD VALUE 'xray_tech'   → run alone, COMMIT.
--            (Postgres forbids using a new enum value in the same tx it's added.)
--   PHASE B: the policy rewrites below            → run AFTER Phase A commits.
--
-- Run in the Supabase SQL editor (prod). DO NOT bundle Phase A + Phase B in one
-- run. This script is NOT applied automatically — Ali reviews + runs each phase.
--
-- Pre-flight (run once, expect `profile_role`):
--   SELECT pg_typeof(role) FROM public.profiles LIMIT 1;
--   -- If it returns `text` (legacy multi-doctor-migration variant), STOP — the
--   -- change is ALTER TABLE ... DROP/ADD CONSTRAINT instead of ALTER TYPE.
--
-- Forward-only: Postgres has no DROP VALUE. Rollback = leave the value unused
-- (harmless) or recreate the type (heavy). See pr41-fracture-wear-findings.md.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE A  — run this statement ALONE, then COMMIT, before running Phase B.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TYPE public.profile_role ADD VALUE IF NOT EXISTS 'xray_tech';

-- >>> COMMIT here. Do not continue in the same transaction. <<<


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE B  — run AFTER Phase A has committed (new value must already exist).
-- Supersedes the role lists in scripts/xray-module-migration.sql §4 & §6 and
-- scripts/xray-fix-storage-insert-policy.sql. Idempotent (DROP IF EXISTS + CREATE).
-- ════════════════════════════════════════════════════════════════════════════

-- ── xrays TABLE policies ─────────────────────────────────────────────────────

-- INSERT: owner / doctor / xray_tech may insert for any patient in the org.
DROP POLICY IF EXISTS xrays_insert_doctor_or_owner ON public.xrays;
CREATE POLICY xrays_insert_doctor_or_owner ON public.xrays
  FOR INSERT WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('owner','doctor','xray_tech'))
  );

-- UPDATE: owner/doctor → any row; xray_tech → only rows they uploaded.
DROP POLICY IF EXISTS xrays_update_doctor_or_owner ON public.xrays;
CREATE POLICY xrays_update_doctor_or_owner ON public.xrays
  FOR UPDATE
  USING (
    org_id = public.current_org_id()
    AND (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role IN ('owner','doctor'))
      OR (uploaded_by = auth.uid()
          AND EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND role = 'xray_tech'))
    )
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role IN ('owner','doctor'))
      OR (uploaded_by = auth.uid()
          AND EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND role = 'xray_tech'))
    )
  );

-- DELETE: owner/doctor → any row; xray_tech → only rows they uploaded.
DROP POLICY IF EXISTS xrays_delete_doctor_or_owner ON public.xrays;
CREATE POLICY xrays_delete_doctor_or_owner ON public.xrays
  FOR DELETE USING (
    org_id = public.current_org_id()
    AND (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role IN ('owner','doctor'))
      OR (uploaded_by = auth.uid()
          AND EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND role = 'xray_tech'))
    )
  );

-- (SELECT policy xrays_select_own_org is org-only and UNCHANGED — xray_tech
--  already reads all org xrays. The operator FOR ALL policy is also unchanged.)


-- ── patient-xrays STORAGE policies ───────────────────────────────────────────
-- Path: patient-xrays/{org_id}/{patient_id}/{xray_id}.{ext}; segment 1 = org.
--
-- ⚠️ OWNERSHIP COLUMN: own-uploads-only for xray_tech uses storage.objects.owner
--    (the uploader's uid). Verify the column on your Supabase version BEFORE
--    running — if your project exposes `owner_id` (text) instead of `owner`
--    (uuid), replace `owner = auth.uid()` with `owner_id = auth.uid()::text`:
--      SELECT column_name FROM information_schema.columns
--       WHERE table_schema='storage' AND table_name='objects'
--         AND column_name IN ('owner','owner_id');

-- INSERT: owner / doctor / xray_tech.
DROP POLICY IF EXISTS "xrays_storage_insert" ON storage.objects;
CREATE POLICY "xrays_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-xrays'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('owner','doctor','xray_tech'))
  );

-- UPDATE: owner/doctor → any file in org; xray_tech → only files they uploaded.
DROP POLICY IF EXISTS "xrays_storage_update" ON storage.objects;
CREATE POLICY "xrays_storage_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'patient-xrays'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role IN ('owner','doctor'))
      OR (owner = auth.uid()
          AND EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND role = 'xray_tech'))
    )
  );

-- DELETE: owner/doctor → any file in org; xray_tech → only files they uploaded.
DROP POLICY IF EXISTS "xrays_storage_delete" ON storage.objects;
CREATE POLICY "xrays_storage_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'patient-xrays'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role IN ('owner','doctor'))
      OR (owner = auth.uid()
          AND EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND role = 'xray_tech'))
    )
  );

-- (xrays_storage_select is org-only and UNCHANGED.)


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after Phase B)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enum now includes xray_tech:
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'profile_role' ORDER BY e.enumsortorder;
--
-- 2. xrays table write policies mention xray_tech (expect 3 rows):
--   SELECT policyname, cmd, qual, with_check FROM pg_policies
--    WHERE tablename = 'xrays'
--      AND policyname IN ('xrays_insert_doctor_or_owner',
--                         'xrays_update_doctor_or_owner',
--                         'xrays_delete_doctor_or_owner');
--
-- 3. Storage write policies mention xray_tech (expect 3 rows):
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects'
--      AND policyname LIKE 'xrays_storage_%' ORDER BY policyname;
--
-- 4. Functional smoke (via the app, after the frontend PR ships):
--    - xray_tech uploads to patient A → succeeds; uploads to patient B → succeeds.
--    - xray_tech edits/deletes their OWN upload → succeeds.
--    - xray_tech edits/deletes a DOCTOR's upload → denied (RLS).
--    - receptionist upload → still denied.
-- ============================================================================
