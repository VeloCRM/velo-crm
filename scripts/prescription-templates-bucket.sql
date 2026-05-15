-- ============================================================================
-- prescription-templates bucket — Storage RLS
-- ============================================================================
-- Standalone re-runnable SQL for the prescription-templates Storage bucket.
-- Run this AFTER manually creating the bucket via the Supabase dashboard.
--
-- ─── Bucket creation (manual, Supabase dashboard) ──────────────────────────
-- 1. supabase.com → project → Storage → New bucket
-- 2. Name:                prescription-templates
-- 3. Public:              OFF (private)
-- 4. File size limit:     5242880 (5 MB)
-- 5. Allowed MIME types:  image/png, image/jpeg
-- 6. Create bucket
-- 7. SQL editor → paste this file → run
-- 8. Verify: Storage → prescription-templates → Policies tab shows 4 policies
--
-- ─── Path scheme ───────────────────────────────────────────────────────────
-- prescription-templates/{org_id}/{doctor_id}/template.{ext}
--   - segment 1 (storage.foldername(name)[1]): org UUID
--   - segment 2 (storage.foldername(name)[2]): doctor UUID
--   - basename: 'template.{ext}' (placeholder; not used by RLS)
--
-- NOTE: storage.foldername returns FOLDER segments only, excluding the basename.
-- The doctor_id lives as a folder segment, not a basename prefix. A 2-segment
-- scheme {org_id}/{doctor_id}.{ext} would NOT work — foldername[2] would be NULL.
-- This 3-segment shape also mirrors the dental_xrays convention.
--
-- All 4 policies are wrapped in idempotent DO blocks (IF NOT EXISTS guards)
-- so this file is safe to re-run. Drop the policies via the rollback snippet
-- at the end of the file if you need to fully reset.
-- ============================================================================

-- READ: any authenticated member of the org can preview templates.
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

-- INSERT: doctor uploading their own template (role-tightened), OR same-org owner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          -- self-upload branch: doctor uploading to their own folder, role-tightened
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR
          -- admin branch: same-org clinic owner (explicit org_id binding)
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;

-- UPDATE: same predicate as INSERT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_update' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;

-- DELETE: same predicate as INSERT/UPDATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;

-- ─── Rollback (paste manually to fully reset) ──────────────────────────────
-- DROP POLICY IF EXISTS "prescription_templates_select" ON storage.objects;
-- DROP POLICY IF EXISTS "prescription_templates_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "prescription_templates_update" ON storage.objects;
-- DROP POLICY IF EXISTS "prescription_templates_delete" ON storage.objects;
-- (Bucket deletion is manual via dashboard — must empty objects first.)
