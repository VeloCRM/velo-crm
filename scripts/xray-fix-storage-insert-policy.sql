-- ============================================================================
-- HOTFIX: recreate the missing patient-xrays storage INSERT policy
-- ----------------------------------------------------------------------------
-- Symptom: doctors cannot upload X-rays — the `xrays_storage_insert` policy on
-- storage.objects is absent in production, though SELECT/UPDATE/DELETE applied.
--
-- Root cause: NOT a SQL bug. The four storage policies in
-- scripts/xray-module-migration.sql (section 6) are correct and live in one
-- atomic DO block; a clean run creates all four or none. "3 of 4 present" is an
-- application artifact (a partial/fragmented apply, or a pre-existing same-named
-- policy the IF-NOT-EXISTS guard skipped and was later removed).
--
-- This script is ADDITIVE and idempotent. DROP-IF-EXISTS then CREATE guarantees
-- the CORRECT policy even if a wrong-shaped one is currently present. The
-- predicate is byte-for-byte the same shape as the working UPDATE/DELETE
-- policies: bucket guard + segment-1 org match + role IN ('owner','doctor').
--
-- Run in the Supabase SQL editor (prod), then re-run the verification at the
-- bottom. Safe to run more than once.
-- ============================================================================

DROP POLICY IF EXISTS "xrays_storage_insert" ON storage.objects;

CREATE POLICY "xrays_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-xrays'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner','doctor')
    )
  );

-- ─── Verification (run after) ───────────────────────────────────────────────
-- 1. All four storage policies now present (expect 4 rows):
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'storage' AND tablename = 'objects'
--    AND policyname LIKE 'xrays_storage_%'
--  ORDER BY policyname;
--   -> xrays_storage_delete (DELETE), xrays_storage_insert (INSERT),
--      xrays_storage_select (SELECT), xrays_storage_update (UPDATE)
--
-- 2. INSERT policy predicate matches the others (with_check populated, qual null):
-- SELECT policyname, qual, with_check FROM pg_policies
--  WHERE schemaname = 'storage' AND tablename = 'objects'
--    AND policyname = 'xrays_storage_insert';
--
-- 3. Functional smoke (authenticated as a DOCTOR via the app): uploading an
--    X-ray to patient-xrays/{your_org_id}/{patient_id}/{uuid}.jpg now succeeds.
--    As a RECEPTIONIST: the upload is denied (RLS), confirming the role gate.
-- ============================================================================
