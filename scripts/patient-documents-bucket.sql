-- ============================================================================
-- patient-documents bucket — Storage RLS
-- ============================================================================
-- Standalone re-runnable SQL for the patient-documents Storage bucket.
-- Run this AFTER manually creating the bucket via the Supabase dashboard.
--
-- ─── Bucket creation (manual, Supabase dashboard) ──────────────────────────
-- 1. supabase.com → velo-crm project → Storage → New bucket
-- 2. Name:                patient-documents
-- 3. Public:              OFF (private)
-- 4. File size limit:     26214400 (25 MB)
-- 5. Allowed MIME types:
--      application/pdf
--      image/jpeg
--      image/png
--      application/msword
--      application/vnd.openxmlformats-officedocument.wordprocessingml.document
--      application/vnd.ms-excel
--      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
--      text/plain
-- 6. Create bucket
-- 7. SQL editor → paste this file → run
-- 8. Verify: Storage → patient-documents → Policies tab shows 4 policies
--
-- ─── Path scheme ───────────────────────────────────────────────────────────
-- patient-documents/{org_id}/{patient_id}/{document_id}.{ext}
--   - segment 1 (storage.foldername(name)[1]): org UUID  → drives the RLS guard
--   - segment 2 (storage.foldername(name)[2]): patient UUID (grouping only)
--   - basename: '{document_id}.{ext}' (client-generated UUID; not used by RLS)
--
-- NOTE: storage.foldername returns FOLDER segments only, excluding the
-- basename. The 3-segment shape mirrors prescription-templates / dental_xrays.
--
-- ─── Access model ──────────────────────────────────────────────────────────
-- Documents are clinic-SHARED (unlike per-doctor prescription pads):
--   - READ:  any authenticated member of the owning org.
--   - WRITE (insert/update/delete): same-org member whose role is
--            owner, doctor, OR receptionist. There is NO "uploader = self" or
--            "uploader = patient" restriction — any clinical staff handles any
--            patient's paperwork.
-- The role check is inlined as a profiles EXISTS subquery (the PR #17
-- prescription_templates precedent); no is_org_member() helper exists in this
-- schema. The org binding is enforced by the segment-1 IN (...) clause.
--
-- All 4 policies are wrapped in idempotent DO blocks (IF NOT EXISTS guards) so
-- this file is safe to re-run. Rollback snippet at the end.
-- ============================================================================

-- READ: any authenticated member of the org can read the org's documents.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_storage_select' AND schemaname = 'storage') THEN
    CREATE POLICY "documents_storage_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: same-org member with role owner / doctor / receptionist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_storage_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "documents_storage_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('owner', 'doctor', 'receptionist')
        )
      );
  END IF;
END $$;

-- UPDATE: same predicate as INSERT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_storage_update' AND schemaname = 'storage') THEN
    CREATE POLICY "documents_storage_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('owner', 'doctor', 'receptionist')
        )
      );
  END IF;
END $$;

-- DELETE: same predicate as INSERT/UPDATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_storage_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "documents_storage_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'patient-documents'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('owner', 'doctor', 'receptionist')
        )
      );
  END IF;
END $$;

-- ─── Rollback (paste manually to fully reset) ──────────────────────────────
-- DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
-- DROP POLICY IF EXISTS "documents_storage_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "documents_storage_update" ON storage.objects;
-- DROP POLICY IF EXISTS "documents_storage_delete" ON storage.objects;
-- (Bucket deletion is manual via dashboard — must empty objects first.)
