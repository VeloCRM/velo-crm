-- ============================================================================
-- X-ray module — schema + storage + RLS  (V1, org-scoped)
-- ----------------------------------------------------------------------------
-- Backs the patient-profile X-rays tab: per-patient radiographic images stored
-- in the private `patient-xrays` Storage bucket, one `public.xrays` row per
-- file, with clinical metadata (type / date / teeth / optional treatment link /
-- notes / batch). Mirrors the documents module (scripts/documents-migration.sql
-- + scripts/patient-documents-bucket.sql) but:
--   • table-level writes are role-gated to owner/doctor (receptionists READ-ONLY),
--   • storage writes are role-gated to owner/doctor as well,
--   • adds a thumbnail_data_url column (client-generated ~200px base64 JPEG).
--
-- Source of truth for the design: scripts/xray-tab-diagnostic.md.
--
-- ⚠️ DEPLOY ORDER: run this in the Supabase SQL editor on a TEST project first,
--    verify the smoke checks at the bottom, then prod — BEFORE merging PR-A and
--    BEFORE PR-B (UI) ships (the UI selects/writes these columns + bucket).
--    Safe/idempotent: every step is guarded; the pre-flight ABORTS on a legacy
--    or mis-configured object rather than silently proceeding.
-- ============================================================================

-- ─── 0. Pre-flight: fail loudly on a legacy/incompatible state ───────────────
-- A legacy `xrays` table exists in the (never-applied) pre-rebuild script
-- scripts/dental-persistence-migration.sql with a DIFFERENT shape (contact_id,
-- organizations, no xray_type). If something like it is present, stop — do not
-- CREATE-IF-NOT-EXISTS over a wrong-shaped table.
DO $$
BEGIN
  IF to_regclass('public.xrays') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'xrays' AND column_name = 'xray_type'
    ) THEN
      RAISE EXCEPTION
        'Pre-flight: a public.xrays table without an xray_type column already exists '
        '(likely the legacy dental-persistence-migration shape). Reconcile/drop it before running this migration.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'patient-xrays') THEN
    -- Set-equality (order-insensitive): `=` on text[] is order-sensitive, which
    -- would falsely abort if a pre-existing bucket stored the MIME list reversed.
    PERFORM 1 FROM storage.buckets
     WHERE id = 'patient-xrays'
       AND public IS FALSE
       AND file_size_limit = 26214400
       AND allowed_mime_types @> ARRAY['image/jpeg','image/png']
       AND allowed_mime_types <@ ARRAY['image/jpeg','image/png'];
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Pre-flight: a patient-xrays bucket already exists with unexpected config '
        '(expected private, 25 MB, image/jpeg+image/png). Reconcile before proceeding.';
    END IF;
  END IF;
END $$;

-- ─── 1. xray_type enum ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'xray_type') THEN
    CREATE TYPE public.xray_type AS ENUM
      ('bitewing','periapical','panoramic','occlusal','cbct','other');
  END IF;
END $$;

-- ─── 2. xrays table (org-scoped) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xrays (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.orgs(id)            ON DELETE CASCADE,
  patient_id         uuid NOT NULL REFERENCES public.patients(id)        ON DELETE CASCADE,
  -- Optional link to a treatment plan (V1 has treatment_plans, not "treatments").
  treatment_plan_id  uuid          REFERENCES public.treatment_plans(id) ON DELETE SET NULL,
  file_name          text NOT NULL,
  storage_path       text NOT NULL,            -- {org_id}/{patient_id}/{xray_id}.{ext} in patient-xrays
  mime_type          text,
  file_size          bigint,
  -- Client-generated ~200px base64 JPEG (~10 KB) for the grid; original via signed URL.
  thumbnail_data_url text,
  xray_type          public.xray_type NOT NULL DEFAULT 'other',
  date_taken         date NOT NULL DEFAULT current_date,
  teeth_shown        text[] NOT NULL DEFAULT '{}',   -- FDI codes, e.g. {'16','17','46'}
  notes              text,
  batch_id           uuid,                     -- groups a multi-file upload
  uploaded_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()  -- maintained by updateXray (metadata edits)
);

COMMENT ON TABLE public.xrays IS
  'Per-patient radiographic images (binary in the patient-xrays bucket). Org-scoped; table + storage writes role-gated to owner/doctor (receptionists read-only).';

-- ─── 3. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS xrays_patient_date_idx
  ON public.xrays (org_id, patient_id, date_taken DESC);     -- grid query
CREATE INDEX IF NOT EXISTS xrays_batch_idx
  ON public.xrays (batch_id) WHERE batch_id IS NOT NULL;      -- batch retry lookups
CREATE INDEX IF NOT EXISTS xrays_patient_idx ON public.xrays (patient_id);
CREATE INDEX IF NOT EXISTS xrays_org_idx     ON public.xrays (org_id);

-- ─── 4. Table RLS ────────────────────────────────────────────────────────────
-- Uses the codebase helpers public.current_org_id() and public.is_operator()
-- (same as the documents table). SELECT = any org member; INSERT/UPDATE/DELETE =
-- owner/doctor only (defense in depth on top of the UI EDIT_ROLES gate + the
-- Storage write policies). Operators get full access.
ALTER TABLE public.xrays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xrays' AND policyname = 'xrays_select_own_org') THEN
    CREATE POLICY xrays_select_own_org ON public.xrays
      FOR SELECT USING (org_id = public.current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xrays' AND policyname = 'xrays_insert_doctor_or_owner') THEN
    CREATE POLICY xrays_insert_doctor_or_owner ON public.xrays
      FOR INSERT WITH CHECK (
        org_id = public.current_org_id()
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('owner','doctor'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xrays' AND policyname = 'xrays_update_doctor_or_owner') THEN
    CREATE POLICY xrays_update_doctor_or_owner ON public.xrays
      FOR UPDATE
      USING (
        org_id = public.current_org_id()
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('owner','doctor'))
      )
      WITH CHECK (
        org_id = public.current_org_id()
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('owner','doctor'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xrays' AND policyname = 'xrays_delete_doctor_or_owner') THEN
    CREATE POLICY xrays_delete_doctor_or_owner ON public.xrays
      FOR DELETE USING (
        org_id = public.current_org_id()
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('owner','doctor'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xrays' AND policyname = 'xrays_operator') THEN
    CREATE POLICY xrays_operator ON public.xrays
      FOR ALL USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

-- ─── 5. patient-xrays bucket (private, 25 MB, JPEG/PNG) ───────────────────────
-- Created here via SQL (modern Supabase supports file_size_limit/allowed_mime_types
-- columns). The pre-flight above already aborted if a mis-configured bucket existed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-xrays', 'patient-xrays', false, 26214400, ARRAY['image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Storage RLS on patient-xrays ─────────────────────────────────────────
-- Path: patient-xrays/{org_id}/{patient_id}/{xray_id}.{ext}
--   segment 1 (storage.foldername(name)[1]) = org UUID → drives the guard.
-- SELECT: any org member. INSERT/UPDATE/DELETE: org member with role owner/doctor
-- (NO receptionist — diverges from patient-documents on purpose). Fails closed if
-- segment 1 is not a UUID (cast error → deny).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'xrays_storage_select') THEN
    CREATE POLICY "xrays_storage_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'patient-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'xrays_storage_insert') THEN
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
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'xrays_storage_update') THEN
    CREATE POLICY "xrays_storage_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'patient-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('owner','doctor')
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'xrays_storage_delete') THEN
    CREATE POLICY "xrays_storage_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'patient-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('owner','doctor')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- Verification (run manually after applying; not executed automatically)
-- ============================================================================
-- 1. Table + key columns:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='xrays' ORDER BY ordinal_position;
--
-- 2. Policies (expect 5 table + 4 storage):
-- SELECT policyname FROM pg_policies WHERE tablename='xrays';
-- SELECT policyname FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'xrays_storage_%';
--
-- 3. Bucket config (expect public=false, 26214400, {image/jpeg,image/png}):
-- SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='patient-xrays';
--
-- 4. Receptionist write denial (run while authenticated as a receptionist; expect 42501):
-- INSERT INTO public.xrays (org_id, patient_id, file_name, storage_path, xray_type, date_taken)
-- VALUES (public.current_org_id(), '<patient-uuid>', 't.jpg', 'x/y/z.jpg', 'bitewing', current_date);
--   -- expect: ERROR 42501 row-level security policy violation
-- 5. Doctor/owner insert (authenticated as doctor): same INSERT → succeeds.
--
-- Rollback (destructive):
-- DROP TABLE IF EXISTS public.xrays;  DROP TYPE IF EXISTS public.xray_type;
-- DROP POLICY IF EXISTS "xrays_storage_select" ON storage.objects; -- (+ insert/update/delete)
-- DELETE FROM storage.buckets WHERE id='patient-xrays'; -- only after emptying objects
