-- ============================================================================
-- prescription-templates bucket — Storage RLS HYBRID FIX
-- ============================================================================
-- Replaces PR #17's original 4 storage.objects policies with a clean "hybrid"
-- model. Run in the Supabase SQL editor (the `prescription-templates` bucket
-- already exists from PR #17 — this only swaps policies).
--
-- ─── Access model (hybrid) ─────────────────────────────────────────────────
-- Path: prescription-templates/{org_id}/{doctor_id}/template.{ext}
--   segment 1 = org UUID, segment 2 = doctor UUID.
--
--   - SELECT: any authenticated member of the owning org (org-scoped).
--   - INSERT / UPDATE / DELETE: caller's profile.org_id matches segment 1 AND
--       (caller role = 'owner'                                  -- admin: any doctor in the org
--        OR (caller role = 'doctor' AND auth.uid() = segment 2))-- doctor: own template only
--     → owners can manage ANY doctor's template (onboarding), doctors can
--       manage ONLY their own, receptionists/assistants are blocked entirely.
--
-- NOTE: PR #17's original policies were already functionally close to this
-- (they had an owner branch + a doctor-self branch). This rewrite consolidates
-- the predicate into a single EXISTS for clarity and keeps schema.sql in sync.
-- It is NOT the fix for the "url stays null" bug — that bug is the profiles
-- UPDATE being silently no-op'd by RLS, fixed by the
-- set_prescription_template_url RPC (scripts/prescription-template-url-rpc.sql).
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query → paste → run
-- 2. Verify (expect 4 rows):
--    SELECT policyname FROM pg_policies
--      WHERE schemaname = 'storage' AND policyname LIKE 'prescription_templates_%'
--      ORDER BY policyname;
--
-- Idempotent: drops the old policies by name, recreates under DO/IF NOT EXISTS
-- guards. Safe to re-run.
-- ============================================================================

-- ─── Drop PR #17's original policies (by name) ─────────────────────────────
DROP POLICY IF EXISTS "prescription_templates_select" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_insert" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_update" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_delete" ON storage.objects;


-- ─── SELECT: org-scoped read ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_select' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;


-- ─── INSERT: same-org owner, OR same-org doctor uploading their OWN folder ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;


-- ─── UPDATE: same predicate as INSERT ──────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_update' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;


-- ─── DELETE: same predicate as INSERT/UPDATE ───────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;

-- ─── Rollback (re-apply PR #17 original) ───────────────────────────────────
-- See scripts/prescription-templates-bucket.sql for the original policy bodies.
