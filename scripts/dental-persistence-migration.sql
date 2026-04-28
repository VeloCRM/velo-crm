-- ═══════════════════════════════════════════════════════════════════════════
-- Velo Dental CRM — Dental Persistence Migration
-- Run this in Supabase SQL Editor.
-- Companion to Commit 3 of the demo-readiness sprint.
--
-- What this does:
--   1. Adds JSONB columns medical_history + dental_chart to contacts
--      (single-blob data — small, per-patient, queried only when the
--       patient's profile is open).
--   2. Creates 3 new tables: treatments, prescriptions, xrays
--      (multi-row data — listable, filterable, financially relevant).
--   3. Org-scoped RLS on all 3 tables (mirrors appointments_all pattern).
--   4. Storage RLS for the `dental-xrays` bucket. The bucket itself must
--      be created in Studio FIRST (Storage → New bucket: `dental-xrays`,
--      Private). See "Studio Action C" below.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
-- ADD COLUMN IF NOT EXISTS, every DO-block guards CREATE POLICY.
--
-- Schema decisions (locked, see commit message for rationale):
--   - org_id is the only RLS axis (no user_id legacy fallback).
--     Saves the "data appears for one user but not another in the same
--     org" class of bug that the contacts_all permissive policy still
--     allows for legacy contacts.
--   - All FKs CASCADE to contacts & organizations. Deleting a patient
--     deletes their treatment history. Deleting an org deletes everything.
--     created_by → auth.users SET NULL so user deletion doesn't take
--     clinical history with it.
--   - currency CHECK matches payments.currency (IQD/USD/EUR/GBP/AED/SAR).
--   - JSONB shapes match the current localStorage shapes byte-for-byte
--     so Commit 5's cutover is a swap-storage, not a reshape:
--       contacts.medical_history = { allergies, medications, bloodType,
--                                    conditions: [string] }    -- maps to UI _medical
--       contacts.dental_chart    = { [tooth_number]: status }  -- maps to UI _teeth
--   - update_updated_at() function reused from src/lib/schema.sql:202.
--     Trigger names are table-specific (set_updated_at_<table>) — the
--     existing schema reuses `set_updated_at` per table; we depart from
--     that to make trigger drops/alters unambiguous on these new tables.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Contacts: JSONB columns for single-blob dental data ─────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS medical_history JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS dental_chart    JSONB DEFAULT '{}'::jsonb;


-- ─── 2. treatments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES public.contacts(id)      ON DELETE CASCADE,

  procedure       TEXT NOT NULL,
  tooth           TEXT DEFAULT '',                                  -- "12", "UR3", or '' (string for flexibility)
  cost            NUMERIC(12, 2) DEFAULT 0,
  currency        TEXT DEFAULT 'IQD' CHECK (currency IN ('IQD','USD','EUR','GBP','AED','SAR')),
  status          TEXT DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  treatment_date  DATE,
  notes           TEXT DEFAULT '',

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatments_org              ON public.treatments(org_id);
CREATE INDEX IF NOT EXISTS idx_treatments_contact          ON public.treatments(contact_id);
CREATE INDEX IF NOT EXISTS idx_treatments_org_contact      ON public.treatments(org_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_treatments_status           ON public.treatments(org_id, status);

ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'treatments_all' AND tablename = 'treatments') THEN
    CREATE POLICY "treatments_all" ON public.treatments FOR ALL USING (
      org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    );
  END IF;
END $$;

CREATE TRIGGER set_updated_at_treatments BEFORE UPDATE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── 3. prescriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES public.contacts(id)      ON DELETE CASCADE,

  medication        TEXT NOT NULL,
  dosage            TEXT DEFAULT '',          -- free-form: "500mg x 3"
  duration          TEXT DEFAULT '',          -- free-form: "7 days"
  notes             TEXT DEFAULT '',
  prescribed_date   DATE DEFAULT CURRENT_DATE,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_org          ON public.prescriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_contact      ON public.prescriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_org_contact  ON public.prescriptions(org_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date         ON public.prescriptions(org_id, prescribed_date DESC);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescriptions_all' AND tablename = 'prescriptions') THEN
    CREATE POLICY "prescriptions_all" ON public.prescriptions FOR ALL USING (
      org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    );
  END IF;
END $$;

CREATE TRIGGER set_updated_at_prescriptions BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── 4. xrays (metadata; binary lives in Storage) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.xrays (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES public.contacts(id)      ON DELETE CASCADE,

  file_name       TEXT NOT NULL,                  -- "panoramic-2026-04-28.jpg"
  storage_path    TEXT NOT NULL,                  -- "{org_id}/{contact_id}/{xray_id}.{ext}" in dental-xrays bucket
  mime_type       TEXT DEFAULT 'image/jpeg',
  size_bytes      BIGINT DEFAULT 0,
  taken_date      DATE DEFAULT CURRENT_DATE,
  notes           TEXT DEFAULT '',

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xrays_org          ON public.xrays(org_id);
CREATE INDEX IF NOT EXISTS idx_xrays_contact      ON public.xrays(contact_id);
CREATE INDEX IF NOT EXISTS idx_xrays_org_contact  ON public.xrays(org_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_xrays_date         ON public.xrays(org_id, taken_date DESC);

ALTER TABLE public.xrays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'xrays_all' AND tablename = 'xrays') THEN
    CREATE POLICY "xrays_all" ON public.xrays FOR ALL USING (
      org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    );
  END IF;
END $$;

CREATE TRIGGER set_updated_at_xrays BEFORE UPDATE ON public.xrays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── 5. Storage RLS for dental-xrays bucket ─────────────────────────────────
-- Studio Action C (do this BEFORE the policies below take effect):
--   Supabase Studio → Storage → New bucket
--     Name:    dental-xrays
--     Public:  OFF  (private; signed URLs only)
--     File size limit: 10 MB (or org policy)
--     Allowed MIME types: image/jpeg, image/png, image/webp, application/dicom
--
-- Path contract (enforced by dental.js, depended on by these policies):
--   {org_id}/{contact_id}/{xray_id}.{ext}
--   - segment 1: org UUID (extracted via storage.foldername(name)[1])
--   - segment 2: contact UUID
--   - segment 3: xray UUID + extension
-- Any deviation from this shape WILL break RLS silently.
-- If the cast (storage.foldername(name))[1]::uuid fails (non-UUID segment),
-- the policy denies access by default — fails closed, no info leak.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dental_xrays_select' AND schemaname = 'storage') THEN
    CREATE POLICY "dental_xrays_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'dental-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dental_xrays_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "dental_xrays_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'dental-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dental_xrays_update' AND schemaname = 'storage') THEN
    CREATE POLICY "dental_xrays_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'dental-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dental_xrays_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "dental_xrays_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'dental-xrays'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;


-- ─── 6. Verification ────────────────────────────────────────────────────────
-- After running, paste these and confirm output:

-- a) New JSONB columns landed
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contacts'
  AND column_name IN ('medical_history', 'dental_chart')
ORDER BY column_name;

-- b) New tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('treatments', 'prescriptions', 'xrays')
ORDER BY table_name;

-- c) RLS is enabled on all three
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('treatments', 'prescriptions', 'xrays')
ORDER BY tablename;

-- d) Policies exist (4 storage + 3 table policies)
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE policyname LIKE 'treatments_all'
   OR policyname LIKE 'prescriptions_all'
   OR policyname LIKE 'xrays_all'
   OR policyname LIKE 'dental_xrays_%'
ORDER BY schemaname, tablename, policyname;
