-- Velo CRM — SB-2: server-side patient search (trigram indexes)
-- =============================================================================
-- PURPOSE: power ILIKE '%term%' search across ALL of an org's patients
-- (full_name + phone) instead of the old client-side filter over 100 loaded
-- rows. Backs src/lib/database.js -> searchPatients().
--
-- ⚠️ NET-NEW SCHEMA — follow the CLAUDE.md protocol:
--   1. Run this on a STAGING copy first, never directly on production.
--   2. Run the VERIFY block below; confirm the extension + both indexes exist.
--   3. Only then schedule the production run (a human runs it; never from chat).
--
-- Data safety: additive only. Creates an extension + two indexes. No table data
-- is read, written, or altered. Fully reversible (see ROLLBACK).
-- =============================================================================

BEGIN;

-- 1. Trigram matching support (idempotent; no-op if already present).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes that let the planner use a `%term%` ILIKE.
--    gin_trgm_ops indexes 3-char grams → aligns with the UI's 3-char minimum.
CREATE INDEX IF NOT EXISTS patients_full_name_trgm_idx
  ON patients USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS patients_phone_trgm_idx
  ON patients USING gin (phone gin_trgm_ops);

COMMIT;

-- -----------------------------------------------------------------------------
-- PRODUCTION NOTE: at Saif's scale (~3.3k rows/org) the in-transaction build
-- above locks the table for well under a second. If you prefer zero lock on a
-- larger table, run these two OUTSIDE a transaction instead (CONCURRENTLY
-- cannot run inside BEGIN/COMMIT):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS patients_full_name_trgm_idx
--     ON patients USING gin (full_name gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS patients_phone_trgm_idx
--     ON patients USING gin (phone gin_trgm_ops);
-- -----------------------------------------------------------------------------

-- VERIFY (run separately after the migration; expect pg_trgm + 2 index rows):
--   SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'patients'
--      AND indexname IN ('patients_full_name_trgm_idx','patients_phone_trgm_idx')
--    ORDER BY indexname;
--
-- SMOKE (optional — confirm the planner uses the trigram index on a real org):
--   EXPLAIN ANALYZE
--   SELECT id FROM patients
--    WHERE org_id = '<staging-org-uuid>'
--      AND (full_name ILIKE '%ali%' OR phone ILIKE '%770%');

-- ROLLBACK (if needed):
--   DROP INDEX IF EXISTS patients_full_name_trgm_idx;
--   DROP INDEX IF EXISTS patients_phone_trgm_idx;
--   -- pg_trgm can be left installed (harmless); to fully revert:
--   -- DROP EXTENSION IF EXISTS pg_trgm;
