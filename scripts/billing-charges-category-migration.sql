-- ============================================================================
-- V1.5 Billing — Slice 4b: income category on charges (+ doctor optional)
-- Additive follow-up to the Slice 1 ledger (billing-charges-payments-migration.sql).
--
-- Goal: let a charge be classified as clinical vs non-clinical "other income"
--   (products sold, consultation-only, misc), and make doctor_id OPTIONAL so a
--   non-clinical charge need not name a rendering dentist.
--
-- ⛔ DRAFT — DO NOT RUN. Staging clone first (dujnbboyeugrisgewnqu), dry-run,
--    verify, THEN prod (aajwuwjxpmmqcwhiynla) via the human-runs-it ceremony
--    (CLAUDE.md net-new-schema protocol). Then build the form.
--
-- Trace-confirmed facts baked in (from the APPLIED Slice 1 migration):
--   • charges columns NOW: id, org_id, patient_id, treatment_plan_item_id,
--     doctor_id, kind, reverses_id, description, amount_minor, currency,
--     created_by, created_at.  → no `category` column yet.
--   • doctor_id is currently `uuid NOT NULL` (line 52 of the Slice 1 file) →
--     MUST be relaxed to nullable for no-doctor "other income".
--   • charges_insert_own_org RLS checks org_id / kind='charge' / created_by /
--     role∈(doctor,owner). It does NOT reference doctor_id → relaxing NOT NULL
--     needs NO RLS change; a null-doctor owner-entered charge still passes.
--   • Append-only lock (REVOKE UPDATE/DELETE on charges) is untouched here — this
--     migration is purely additive (ADD COLUMN + relax a NOT NULL + one CHECK).
--   • currency is a native enum (public.currency_code); kind is text+CHECK.
--     category follows the `kind` pattern (text+CHECK) — see DECISION below.
--
-- DECISION 1 — enum vs text+CHECK for category:  RECOMMEND text + CHECK.
--   • text+CHECK matches the existing `kind` column and is trivially extensible:
--     add a value = DROP CONSTRAINT + ADD CONSTRAINT in one tx (this file's shape).
--   • A native enum (like currency_code) is forward-only: ALTER TYPE ADD VALUE
--     cannot run inside a transaction block on older PG and values can't be
--     removed/renamed cleanly — heavier ceremony for a set we expect to tweak.
--   • Tradeoff: text+CHECK allows any string at the storage layer until the CHECK
--     rejects it (enum rejects at the type layer, marginally "tighter"). For a
--     small UI-driven allow-list the difference is cosmetic. → text+CHECK.
--
-- DECISION 2 — enforce "clinical charge must have a doctor" at the DB?  REPORT ONLY.
--   Left COMMENTED at the bottom (charges_clinical_doctor_check). Recommendation
--   and tradeoff written there; the human decides before we finalize.
-- ============================================================================
BEGIN;

-- ── 1. category column ───────────────────────────────────────────────────────
-- ADD COLUMN IF NOT EXISTS is idempotent. NOT NULL DEFAULT 'clinical' backfills
-- every existing row to 'clinical' (they predate categories and were all clinical
-- work rendered by a doctor) in a single safe rewrite-free step.
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'clinical';

-- CHECK constraint (idempotent via guard: ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'charges_category_check'
    ) THEN
        ALTER TABLE public.charges
            ADD CONSTRAINT charges_category_check
            CHECK (category IN ('clinical', 'product', 'consultation', 'other'));
    END IF;
END$$;

-- ── 2. doctor_id → nullable ──────────────────────────────────────────────────
-- Needed so non-clinical "other income" charges need not name a dentist.
-- DROP NOT NULL is a no-op if already nullable, so this is safe to re-run.
-- Existing rows are unaffected (they keep their non-null doctor_id).
ALTER TABLE public.charges
    ALTER COLUMN doctor_id DROP NOT NULL;

COMMIT;

-- ── VERIFY (run separately, AFTER commit, on the staging clone) ──────────────
-- 1) category column exists, NOT NULL, default 'clinical':
--   SELECT column_name, is_nullable, column_default, data_type
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='charges' AND column_name='category';
--   -- EXPECT: category | NO | 'clinical'::text | text
--
-- 2) CHECK constraint present with the 4-value allow-list:
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint WHERE conname='charges_category_check';
--   -- EXPECT: CHECK ((category = ANY (ARRAY['clinical','product','consultation','other'])))
--
-- 3) doctor_id is now NULLABLE:
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='charges' AND column_name='doctor_id';
--   -- EXPECT: YES
--
-- 4) every pre-existing row backfilled to 'clinical' (none NULL, none off-list):
--   SELECT category, count(*) FROM public.charges GROUP BY category ORDER BY category;
--   -- EXPECT: only 'clinical' rows on prod at apply time (Le Royal + test rows).
--
-- 5) APPEND-ONLY LOCK still intact (this file must NOT have granted UPDATE/DELETE):
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_schema='public' AND table_name='charges'
--    ORDER BY privilege_type;
--   -- EXPECT: INSERT, SELECT only.
--
-- 6) INSERT smoke (staging):
--   • as owner/doctor: INSERT a category='product' charge with doctor_id = NULL
--       → SUCCEEDS (relaxed NOT NULL + RLS ignores doctor_id).
--   • as owner/doctor: INSERT category='clinical' with a real doctor_id → SUCCEEDS.
--   • INSERT category='bogus' → REJECTED by charges_category_check.
--   • confirm getPatientBalance still nets per-currency (category is orthogonal to
--     the active-row math; a category='other' charge still counts as an active charge).

-- ── ROLLBACK (if the dry-run is rejected) ───────────────────────────────────
-- ⚠️ Restoring doctor_id NOT NULL only works if NO null-doctor rows were inserted
--    in the meantime; on a clean dry-run clone that holds. Order matters: drop the
--    check + column, then re-assert NOT NULL.
--   BEGIN;
--     ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_category_check;
--     ALTER TABLE public.charges DROP COLUMN IF EXISTS category;
--     -- Re-assert only if you are certain no null-doctor charges exist:
--     -- ALTER TABLE public.charges ALTER COLUMN doctor_id SET NOT NULL;
--   COMMIT;

-- ── OPTIONAL: DB-enforced "clinical charge must name a doctor" (DECISION 2) ──
-- NOT applied. Reported for the human to decide before we finalize this file.
--
--   ALTER TABLE public.charges
--     ADD CONSTRAINT charges_clinical_doctor_check
--     CHECK (category <> 'clinical' OR doctor_id IS NOT NULL);
--
-- RECOMMENDATION: keep this rule in the UI ONLY (do NOT add the constraint), because:
--   • Flexibility: the category allow-list is expected to grow; hard-wiring a
--     doctor-required rule to one category value couples data-shape to policy and
--     makes every future category tweak a schema migration.
--   • Correction rows: a void (kind='void') of a clinical charge is an operator
--     correction; a DB CHECK would force the operator to also supply doctor_id on
--     the void row, complicating the append-only correction path for no real gain.
--   • It's data-quality, not a security/integrity boundary: RLS already gates WHO
--     may insert, and the append-only ledger's correctness (per-currency netting of
--     active rows) does not depend on this rule. The form can require a doctor when
--     category='clinical' and omit it otherwise — same UX outcome, no rigidity.
--   TRADEOFF (why one might still enforce it in the DB): UI-only means a bug in the
--     client, a future endpoint, or a direct service-role insert could persist a
--     clinical charge with a null doctor. DB-enforced makes that impossible at the
--     cost of the rigidity above. Given the low blast radius (a mis-tagged charge is
--     correctable via void+reissue, not a data-loss event), UI-only is the pragmatic
--     call — but this is the human's decision.
