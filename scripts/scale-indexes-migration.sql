-- scale-indexes-migration.sql
-- Scale fixes for Saif Dental onboarding (~3,000 patients). Adds the indexes that
-- back the hot query patterns in src/lib which are UNINDEXED today.
--
-- READ-ONLY DRAFT — NOT applied. Review → dry-run on staging → apply to prod.
--
-- LOCKING: applying to a POPULATED table (e.g. Le Royal prod) briefly locks writes
-- while the index builds. To avoid the lock, use CONCURRENTLY (must run OUTSIDE a
-- transaction, one statement at a time):
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS <name> ON ...
-- On the fresh Saif org the tables are near-empty at import time, so plain builds are
-- instant — prefer running this BEFORE the GHL import. Every statement is idempotent.

-- ── appointments ─────────────────────────────────────────────────────────────
-- Calendar day/week/month: eq(org_id) + range(scheduled_at) + order(scheduled_at)
--   src/lib/appointments.js:95  (existing indexes are on created_at only)
CREATE INDEX IF NOT EXISTS appointments_org_scheduled_idx
  ON public.appointments (org_id, scheduled_at);

-- A patient's appointment history: eq(org_id) + eq(patient_id) + order(scheduled_at DESC)
--   src/lib/appointments.js:223
CREATE INDEX IF NOT EXISTS appointments_org_patient_idx
  ON public.appointments (org_id, patient_id, scheduled_at DESC);

-- ── charges ──────────────────────────────────────────────────────────────────
-- Finance All-Charges ledger + per_doctor_production: eq(org_id) + range/order(created_at)
--   src/lib/billing.js:486 fetchAllCharges ; scripts/per-doctor-production-report.sql
CREATE INDEX IF NOT EXISTS charges_org_created_idx
  ON public.charges (org_id, created_at DESC);

-- Active-row rule anti-join: NOT EXISTS (SELECT 1 FROM charges r WHERE r.reverses_id = c.id)
-- Partial — only void rows carry reverses_id, so the index stays tiny and the probe is O(1).
--   finance_ledger_totals (billed CTE) ; billing.js activeRows / getOutstandingCollections
CREATE INDEX IF NOT EXISTS charges_reverses_idx
  ON public.charges (reverses_id) WHERE reverses_id IS NOT NULL;

-- ── payments ─────────────────────────────────────────────────────────────────
-- Finance All-Payments ledger: eq(org_id) + range/order(recorded_at).
-- NOTE: existing idx_payments_org_created is on created_at, NOT recorded_at — it does
-- NOT serve this ordering. Distinct sort column → distinct index.
--   src/lib/billing.js:509 fetchAllPayments ; src/lib/database.js:284,326
CREATE INDEX IF NOT EXISTS payments_org_recorded_idx
  ON public.payments (org_id, recorded_at DESC);

-- Active-row rule anti-join: NOT EXISTS (SELECT 1 FROM payments r WHERE r.reverses_id = p.id)
--   finance_ledger_totals (collected CTE) ; billing.js reversePayment / getOutstandingCollections
CREATE INDEX IF NOT EXISTS payments_reverses_idx
  ON public.payments (reverses_id) WHERE reverses_id IS NOT NULL;

-- ── treatment_plans ──────────────────────────────────────────────────────────
-- A patient's plans: eq(org_id) + eq(patient_id) + order(created_at DESC)
--   src/lib/dental.js:333 fetchTreatmentPlansForPatient
CREATE INDEX IF NOT EXISTS treatment_plans_org_patient_idx
  ON public.treatment_plans (org_id, patient_id, created_at DESC);

-- ── treatment_plan_items ─────────────────────────────────────────────────────
-- PostgREST embed fetches children by parent id: treatment_plan_id IN (...parent ids).
-- The FK column is unindexed today → seq scan of the whole items table per plan fetch.
--   embedded resource in src/lib/dental.js:333 (treatment_plan_items(...))
CREATE INDEX IF NOT EXISTS treatment_plan_items_plan_idx
  ON public.treatment_plan_items (treatment_plan_id);

-- ── patients — OPTIONAL (search; needs pg_trgm) ──────────────────────────────
-- Server-side search does full_name/phone ILIKE '%term%' (LEADING wildcard) which
-- btree cannot serve; at ~3,000 patients/org that is a seq scan per keystroke. Trigram
-- GIN makes it index-assisted. Left commented — enabling adds the pg_trgm extension.
--   src/lib/database.js:118-130 searchPatients  ( .or(full_name.ilike, phone.ilike) )
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS patients_full_name_trgm_idx
--   ON public.patients USING gin (full_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS patients_phone_trgm_idx
--   ON public.patients USING gin (phone gin_trgm_ops);

-- ── profiles — intentionally NOT indexed for scale ──────────────────────────
-- Queried by org_id (team list) but profiles is STAFF-bounded (a handful of rows per
-- org) and does not grow with patient count. No scale index warranted.
