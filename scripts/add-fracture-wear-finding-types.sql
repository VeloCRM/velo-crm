-- ═══════════════════════════════════════════════════════════════════════════
-- Velo Dental CRM — Add Fracture + Wear finding types
-- Run this in the Supabase SQL Editor BEFORE merging feat/fracture-wear-finding-types.
-- Companion to scripts/structural-loss-findings-diagnostic.md (Phase 1 scope map).
--
-- What this does:
--   Adds two surface-specific values to the dental_finding ENUM:
--     'fracture'  (fuchsia wedge, AR: كسر)
--     'wear'      (deep-brown wedge, AR: تآكل)
--   Both render per-surface (NOT whole-tooth) — they are intentionally NOT
--   added to WHOLE_TOOTH_FINDINGS in src/lib/toothSurfaces.js.
--
-- ⚠️ FORWARD-ONLY MIGRATION — enum values CANNOT be removed cleanly.
--   Postgres has no `ALTER TYPE ... DROP VALUE`. Rolling back means recreating
--   the type (new enum without the values → ALTER COLUMN ... TYPE with a cast →
--   drop old type → rename), and that is only possible while NO row uses
--   'fracture'/'wear'. Treat this as one-way once any finding is recorded.
--
-- ⚠️ TRANSACTION NOTE (Postgres enum quirk):
--   `ALTER TYPE ... ADD VALUE` is committed here OUTSIDE any wrapping
--   transaction. A newly added enum value cannot be USED (inserted/compared)
--   until the transaction that added it has COMMITTED. The Supabase SQL Editor
--   auto-commits each top-level statement, so running this whole script then
--   running the verification block as a SEPARATE execution is safe. If you ever
--   wrap this in an explicit BEGIN/COMMIT, the verification SELECT must run in a
--   later transaction. `IF NOT EXISTS` makes both ADDs idempotent.
--
-- Idempotent: re-running is a no-op (ADD VALUE IF NOT EXISTS).
--
-- ── DENTAL CEREMONY (CLAUDE.md: "Schema changes to dental tables require
--    dry-run on a copy + written rollback plan") ──────────────────────────────
--   DRY-RUN: run this whole script first against a non-prod copy of the DB
--   (Supabase branch or a restored snapshot), then run the verification block.
--   Confirm both values appear and that an existing-row read still works.
--
--   ROLLBACK PLAN (only valid while NO dental_chart_entries row uses the new
--   values — check first: SELECT count(*) FROM dental_chart_entries
--   WHERE finding IN ('fracture','wear'); must be 0). Postgres has no DROP
--   VALUE, so reversal rebuilds the type:
--     1. ALTER TABLE dental_chart_entries ALTER COLUMN finding TYPE text;
--     2. DROP TYPE dental_finding;
--     3. CREATE TYPE dental_finding AS ENUM (
--          'cavity','restoration','missing','crown','bridge','implant',
--          'root_canal_done','healthy');           -- pre-migration value list
--     4. ALTER TABLE dental_chart_entries
--          ALTER COLUMN finding TYPE dental_finding USING finding::dental_finding;
--   If any row already uses 'fracture'/'wear', this is NOT reversible without
--   first re-mapping or deleting those rows — treat the migration as one-way.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Pre-flight check ───────────────────────────────────────────────────────
-- Confirms the dental_finding ENUM exists before we mutate it. Raises a clear
-- error (instead of a cryptic "type does not exist") if the schema diverged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'dental_finding'
      AND typtype = 'e'                              -- 'e' = enum
      AND typnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION
      'Pre-flight failed: enum type public.dental_finding not found. Schema diverged from expected state — STOP and investigate before migrating.';
  END IF;
END
$$;

-- ── Additive migration ─────────────────────────────────────────────────────
ALTER TYPE dental_finding ADD VALUE IF NOT EXISTS 'fracture';
ALTER TYPE dental_finding ADD VALUE IF NOT EXISTS 'wear';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run as a SEPARATE execution AFTER the ALTERs commit)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. List every value of the enum — expect 'fracture' and 'wear' present:
--
--    SELECT unnest(enum_range(NULL::dental_finding)) AS finding_values
--    ORDER BY finding_values;
--
--    Expected rows include: bridge, cavity, crown, fracture, healthy, implant,
--    missing, restoration, root_canal_done, wear
--
-- 2. Targeted presence check — expect a single row with count = 2:
--
--    SELECT count(*) AS added_values
--    FROM unnest(enum_range(NULL::dental_finding)) AS v
--    WHERE v IN ('fracture', 'wear');
--
-- ═══════════════════════════════════════════════════════════════════════════
