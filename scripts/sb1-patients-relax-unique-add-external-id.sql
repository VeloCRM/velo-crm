-- ============================================================================
-- SB-1: relax patients UNIQUE(org_id, phone) + add GHL import idempotency keys
-- ⛔ STAGING ONLY first (dujnbboyeugrisgewnqu). Dry-run on the clone, then prod
--    via the human-runs-it ceremony. Additive + reversible.
-- Mirrors notes/documents external-key pattern (org-scoped variant).
-- ============================================================================
BEGIN;

-- 1. Import idempotency columns (nullable; only import rows carry them).
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS external_id     text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS external_source text;

-- 2. Partial-unique dedupe key — org-scoped (your spec; precedents omit org_id).
--    Non-import rows (external_id IS NULL) are exempt, so manual patients are
--    never forced to carry one.
CREATE UNIQUE INDEX IF NOT EXISTS patients_external_uidx
  ON public.patients USING btree (org_id, external_source, external_id)
  WHERE (external_id IS NOT NULL);

-- 3. Drop the phone uniqueness (a table CONSTRAINT, not a standalone index).
--    Safe regardless of existing duplicate phones.
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_org_id_phone_key;

-- 4. Keep (org_id, phone) lookups fast (replaces the dropped constraint's index).
CREATE INDEX IF NOT EXISTS patients_org_phone_idx
  ON public.patients USING btree (org_id, phone);

COMMIT;

-- ── VERIFY (run separately) ─────────────────────────────────────────────────
-- Columns present:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='patients' AND column_name IN ('external_id','external_source');
-- Unique constraint gone:
--   SELECT 1 FROM pg_constraint WHERE conname='patients_org_id_phone_key';  -- expect 0 rows
-- Indexes present:
--   SELECT indexname FROM pg_indexes WHERE tablename='patients'
--    AND indexname IN ('patients_external_uidx','patients_org_phone_idx');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.patients_org_phone_idx;
--   DROP INDEX IF EXISTS public.patients_external_uidx;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS external_source;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS external_id;
--   -- Re-adding the unique constraint SUCCEEDS ONLY if no duplicate (org_id,phone)
--   -- rows exist by then (e.g. after a GHL import created family-shared dupes):
--   ALTER TABLE public.patients
--     ADD CONSTRAINT patients_org_id_phone_key UNIQUE (org_id, phone);
