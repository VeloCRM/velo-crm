-- ============================================================================
-- v2-platform-migration.sql
-- ----------------------------------------------------------------------------
-- Velo Dental V2 — Doctor-Centric Platform Schema Migration (Phase 1A DRAFT)
--
--   Source of truth : ARCH-V2-PLATFORM.md (committed to master @ fec1fe6)
--   Drafted         : 2026-06-13
--   Status          : DRAFT — NOT YET RUN ANYWHERE. Review gate before Phase 1B.
--   Target          : ⚠️ UNCONFIRMED. See PRE-FLIGHT + plan doc §"Instance safety".
--   Est. runtime    : < 60 s on Le Royal (test-sized data; mostly DDL)
--
-- WHAT THIS DOES (high level)
--   Inverts the V1 clinic-centric (org_id + current_org_id()) model into the V2
--   doctor-centric model (doctor_id ownership + patient_shares + receptionist_
--   assignments + clinic_groups). Le Royal is test data, so this is a
--   WIPE-AND-REBUILD, not an in-place data migration (ARCH Decision #2).
--
-- ROLLBACK POSTURE
--   V1 org columns are RENAMED to *_v1 (never dropped here) so a rollback can
--   restore them. The authoritative rollback path is the pre-migration snapshot
--   (see §0). Full rollback procedure: v2-platform-migration-plan.md §Rollback.
--
-- ⚠️ READ BEFORE RUNNING — this script encodes JUDGMENT CALLS where production
--    diverged from the ARCH doc's V1 assumptions. Each is tagged  [JUDGMENT n]
--    and listed in the plan doc's delta report. Confirm them before Phase 1B.
-- ============================================================================


-- ============================================================================
-- §0. BACKUP — MANUAL STEP, **NOT PART OF THE TRANSACTION BELOW**
-- ----------------------------------------------------------------------------
-- Run these OUTSIDE this script, BEFORE you BEGIN. Do not skip.
--
--   1. Supabase dashboard → Database → Backups → take an on-demand backup,
--      OR via pg_dump from a trusted admin host (NOT from app code):
--
--        pg_dump "$SUPABASE_DB_URL" \
--          --schema=public --no-owner --no-privileges \
--          -f velo-v1-preV2-$(date +%Y%m%d-%H%M).sql
--
--   2. Snapshot Le Royal's row counts for post-migration comparison:
--
--        SELECT 'patients' t, count(*) FROM patients
--        UNION ALL SELECT 'appointments', count(*) FROM appointments
--        UNION ALL SELECT 'treatment_plans', count(*) FROM treatment_plans
--        UNION ALL SELECT 'payments', count(*) FROM payments
--        UNION ALL SELECT 'prescriptions', count(*) FROM prescriptions
--        UNION ALL SELECT 'documents', count(*) FROM documents
--        UNION ALL SELECT 'notes', count(*) FROM notes
--        UNION ALL SELECT 'profiles', count(*) FROM profiles
--        UNION ALL SELECT 'operators', count(*) FROM operators
--        UNION ALL SELECT 'orgs', count(*) FROM orgs;
--
--   3. Record the two accounts we MUST preserve (used by §6 pre-flight):
--        - Doctor (kept, reseeded): alialjobory89@gmail.com
--        - Operator (never touched): madmaxali@gmail.com
-- ============================================================================


-- ============================================================================
-- TRANSACTION START
-- All schema changes + the data wipe run in ONE transaction. If any statement
-- raises, the whole migration rolls back and production is left on V1.
-- ============================================================================
BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout      = '15s';


-- ============================================================================
-- §1. PRE-FLIGHT CHECKS — abort early if production isn't the V1 shape we expect
-- ----------------------------------------------------------------------------
-- These RAISE (and thus roll back) if a core assumption is violated. They are
-- cheap insurance against running this against the wrong database.
-- ============================================================================
DO $preflight$
DECLARE
  v_doctor_id   uuid;
  v_operator_id uuid;
BEGIN
  -- 1a. The V1 org-centric tables must exist (else this is not V1 — abort).
  IF to_regclass('public.orgs')     IS NULL THEN RAISE EXCEPTION 'PRE-FLIGHT: orgs table not found — not a V1 database, aborting'; END IF;
  IF to_regclass('public.profiles') IS NULL THEN RAISE EXCEPTION 'PRE-FLIGHT: profiles table not found, aborting'; END IF;
  IF to_regclass('public.patients') IS NULL THEN RAISE EXCEPTION 'PRE-FLIGHT: patients table not found, aborting'; END IF;

  -- 1b. profiles.org_id must still exist (i.e. migration not already applied).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='org_id') THEN
    RAISE EXCEPTION 'PRE-FLIGHT: profiles.org_id missing — V2 migration may already be applied, aborting';
  END IF;

  -- 1c. The operator account must exist as a row in `operators` (V1 operator
  --     model — see [JUDGMENT 1]). Check the operators table DIRECTLY via
  --     auth.users — operators may have NO profiles row (they are platform-level,
  --     not org-scoped), so we must not route this check through profiles.
  --     We refuse to proceed without it, to avoid locking out super-admin access.
  SELECT o.user_id INTO v_operator_id
    FROM public.operators o JOIN auth.users u ON u.id = o.user_id
   WHERE u.email = 'madmaxali@gmail.com';
  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT: operator madmaxali@gmail.com not found in operators table — aborting to avoid lockout';
  END IF;

  -- 1d. The doctor account we will keep + reseed must exist.
  SELECT id INTO v_doctor_id FROM auth.users WHERE email = 'alialjobory89@gmail.com';
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT: doctor alialjobory89@gmail.com not found in auth.users — aborting';
  END IF;

  -- 1e. SAFETY: this migration WIPES all patient data. It is written for the
  --     Le Royal *test* instance only. If patient volume looks like real data,
  --     refuse. Threshold is deliberately low — Le Royal carries a handful of
  --     smoke-test patients. RAISE forces a human to confirm the target.
  --     [JUDGMENT 9 / safety gate — see plan doc §Instance safety.]
  IF (SELECT count(*) FROM public.patients) > 50 THEN
    RAISE EXCEPTION 'PRE-FLIGHT: % patients found (>50). This wipe is for the Le Royal TEST instance only. Confirm you are not pointed at a real-data instance, then raise/remove this guard deliberately.',
      (SELECT count(*) FROM public.patients);
  END IF;

  RAISE NOTICE 'PRE-FLIGHT OK: V1 shape confirmed, operator + doctor present, % patients (test-sized).',
    (SELECT count(*) FROM public.patients);
END
$preflight$;


-- ============================================================================
-- §2. NEW ENUM TYPES
-- ----------------------------------------------------------------------------
-- ARCH doc introduces several enums that don't exist in V1.
-- ============================================================================

-- Per-doctor tooth-numbering preference (ARCH profiles.tooth_notation).
CREATE TYPE public.tooth_notation_type AS ENUM ('fdi', 'palmer');

-- Per-doctor billing state (ARCH profiles.subscription_status).
CREATE TYPE public.subscription_status_type AS ENUM ('active', 'past_due', 'canceled', 'trial');

-- Per-doctor plan tier (ARCH profiles.plan_tier; prices set in Phase 6).
CREATE TYPE public.plan_tier_type AS ENUM ('free', 'pro', 'clinic');

-- clinic_groups.industry (ARCH only defines 'dental' today; kept as enum so
-- adding verticals later is an ALTER TYPE, not a column rewrite).
CREATE TYPE public.clinic_industry AS ENUM ('dental');

-- clinic_memberships.role — a doctor's role *within a clinic group* (NOT a
-- platform role). [JUDGMENT 1] V1's profile_role already has 'owner', but that
-- is the platform role; clinic-group ownership is a separate concept.
CREATE TYPE public.clinic_member_role AS ENUM ('owner', 'member');

-- xrays.xray_type (ARCH X-Ray module spec). DICOM/CBCT support is V2.1 but the
-- enum value exists now so we don't ALTER later.
CREATE TYPE public.xray_type AS ENUM ('bitewing', 'periapical', 'panoramic', 'occlusal', 'cbct', 'other');

-- [JUDGMENT 6] V1 locale_code is ('en','ar'). ARCH wants Kurdish too. ADD VALUE
-- is transactional in PG12+, but cannot be used in the same txn as the value is
-- then referenced. We only ALTER the type here; no row uses 'ku' yet, so it's safe.
ALTER TYPE public.locale_code ADD VALUE IF NOT EXISTS 'ku';


-- ============================================================================
-- §3. NEW TABLES (doctor-centric core)
-- ----------------------------------------------------------------------------
-- Created BEFORE we touch existing tables so FKs from migrated columns resolve.
-- ============================================================================

-- ── clinic_groups — optional association of doctors (replaces orgs semantically)
CREATE TABLE public.clinic_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- founding doctor
  industry    public.clinic_industry NOT NULL DEFAULT 'dental',
  brand_color text,
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── clinic_memberships — doctor ↔ clinic group, with per-doctor sharing prefs
CREATE TABLE public.clinic_memberships (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  clinic_group_id          uuid NOT NULL REFERENCES public.clinic_groups(id) ON DELETE CASCADE,
  role                     public.clinic_member_role NOT NULL DEFAULT 'member',
  -- Sharing granularity (ARCH Decision #6) — privacy-first defaults.
  share_calendar           boolean NOT NULL DEFAULT true,   -- slots visible to co-members
  share_patient_visibility boolean NOT NULL DEFAULT false,  -- patient *names* visible
  share_full_records       boolean NOT NULL DEFAULT false,  -- full record access
  joined_at                timestamptz NOT NULL DEFAULT now(),
  left_at                  timestamptz NULL,                -- soft delete
  -- One active membership per (doctor, group). left_at in the key lets a doctor
  -- re-join after leaving without violating uniqueness (NULL != NULL in UNIQUE).
  UNIQUE (doctor_id, clinic_group_id, left_at)
);

-- ── receptionist_assignments — doctor hires a receptionist (per-doctor perms)
CREATE TABLE public.receptionist_assignments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receptionist_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Permission flags (ARCH defaults: manage calendar + add payments + view
  -- patients YES; remove payments + financial reports NO).
  can_view_calendar         boolean NOT NULL DEFAULT true,
  can_edit_calendar         boolean NOT NULL DEFAULT true,
  can_view_patients         boolean NOT NULL DEFAULT true,
  can_add_patients          boolean NOT NULL DEFAULT true,
  can_edit_patients         boolean NOT NULL DEFAULT true,
  can_view_payments         boolean NOT NULL DEFAULT true,
  can_add_payments          boolean NOT NULL DEFAULT true,
  can_remove_payments       boolean NOT NULL DEFAULT false,  -- doctor-only by default
  can_view_financial_reports boolean NOT NULL DEFAULT false, -- doctor-only by default
  hired_at                  timestamptz NOT NULL DEFAULT now(),
  terminated_at             timestamptz NULL,                -- soft delete
  -- A receptionist can't hold two ACTIVE assignments for the same doctor.
  UNIQUE (doctor_id, receptionist_id, terminated_at),
  -- A doctor cannot "hire themselves".
  CONSTRAINT receptionist_not_self CHECK (doctor_id <> receptionist_id)
);

-- ── patient_shares — explicit doctor → user grant of access to one patient
CREATE TABLE public.patient_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason              text,
  read_only           boolean NOT NULL DEFAULT false,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz NULL,                      -- soft delete
  UNIQUE (patient_id, shared_with_user_id, revoked_at)
);

-- ── xrays — dedicated radiographic imaging table (ARCH X-Ray module)
CREATE TABLE public.xrays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  treatment_id uuid NULL REFERENCES public.treatment_plans(id) ON DELETE SET NULL,  -- [JUDGMENT 3]
  file_path    text NOT NULL,        -- storage bucket key: {doctor_id}/{patient_id}/{xray_id}.{ext}
  file_name    text NOT NULL,
  mime_type    text,
  file_size    integer,
  xray_type    public.xray_type NOT NULL,
  date_taken   date NOT NULL,
  teeth_shown  text[],               -- FDI tooth numbers, e.g. {'16','17','46','47'}
  notes        text,
  batch_id     uuid NULL,            -- groups files uploaded together
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers for the new tables that have the column.
CREATE TRIGGER clinic_groups_set_updated_at BEFORE UPDATE ON public.clinic_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER xrays_set_updated_at BEFORE UPDATE ON public.xrays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- §4. ALTER EXISTING TABLES — add V2 columns
-- ----------------------------------------------------------------------------
-- New columns are added NULLABLE / with defaults first; NOT NULL is enforced
-- in §6 AFTER the wipe+reseed has populated doctor_id, to avoid violating the
-- constraint on the (about-to-be-deleted) legacy rows.
-- ============================================================================

-- ── profiles: per-doctor preferences + billing state
ALTER TABLE public.profiles
  ADD COLUMN tooth_notation      public.tooth_notation_type     NOT NULL DEFAULT 'fdi',
  ADD COLUMN subscription_status public.subscription_status_type NOT NULL DEFAULT 'trial',
  ADD COLUMN plan_tier           public.plan_tier_type          NOT NULL DEFAULT 'free';

-- ── patients: doctor ownership + clinic visibility + family grouping
-- [JUDGMENT 5] ARCH assumed patients.doctor_id already exists from PR #26. It
-- does NOT — PR #26 added patients.primary_doctor_id (a nullable FILTER field,
-- not an ownership boundary). We ADD doctor_id here as the true owner. The wipe
-- means there are no legacy rows to backfill; reseeded patients set doctor_id
-- explicitly. primary_doctor_id is kept (renamed concept: now == doctor_id by
-- default, but retained for the existing "My patients" filter UI).
ALTER TABLE public.patients
  ADD COLUMN doctor_id       uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,  -- NOT NULL set in §6
  ADD COLUMN clinic_visible  boolean NOT NULL DEFAULT false,
  ADD COLUMN family_group_id uuid NULL;  -- schema-ready; family-grouping UI deferred to V2.1

-- ── Clinical tables: add denormalized doctor_id (NOT NULL set in §6).
-- ARCH §"Clinical tables (revised)" lists appointments, treatments,
-- prescriptions(+items), notes, documents, payments. Production reality
-- ([JUDGMENT 3 / 4]) maps "treatments" → treatment_plans + treatment_plan_items
-- + dental_chart_entries. We add doctor_id to every table that holds
-- patient-scoped clinical data so RLS can scope without joining to patients.
--
--   appointments      — HAS nullable doctor_id already (FK SET NULL). §6 tightens it.
--   treatment_plans   — HAS nullable doctor_id already (FK SET NULL). §6 tightens it.
--   prescriptions     — already NOT NULL doctor_id (V2-shaped). No change needed.
--   prescription_items — child of prescriptions; doctor_id reachable via parent.
--   treatment_plan_items — child of treatment_plans; add doctor_id (denormalized).
--   dental_chart_entries — add doctor_id.
--   payments          — add doctor_id (has recorded_by, not owner).
--   documents         — add doctor_id (has uploaded_by, not owner).
--   notes             — add doctor_id (has created_by, not owner).
--   form_submissions  — add doctor_id (patient-scoped). [JUDGMENT 4 — forms fate TBD]
ALTER TABLE public.treatment_plan_items ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.dental_chart_entries ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.payments            ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.documents           ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.notes               ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.form_submissions    ADD COLUMN doctor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;


-- ============================================================================
-- §5. DATA WIPE + RESEED (Le Royal — ARCH Decision #2: wipe and restart)
-- ----------------------------------------------------------------------------
-- Le Royal is test data. We delete all tenant rows, keep the operator
-- (madmaxali) and the doctor (alialjobory89), and reseed the doctor as a solo
-- V2 doctor. Patients are reseeded later via UI / a separate seed script.
--
-- Deletion order respects FKs (children first). Most clinical tables CASCADE
-- from patients, but we delete explicitly for clarity + to be order-independent.
-- ============================================================================

-- Integration / messaging tables (Phase 5 removes these entirely; wipe rows now).
DELETE FROM public.messages;
DELETE FROM public.conversations;
DELETE FROM public.automations;
DELETE FROM public.ai_usage;
DELETE FROM public.whatsapp_usage;
DELETE FROM public.social_connections;

-- Clinical + patient-scoped data.
DELETE FROM public.form_submissions;
DELETE FROM public.prescription_items;
DELETE FROM public.prescriptions;
DELETE FROM public.treatment_plan_items;
DELETE FROM public.treatment_plans;
DELETE FROM public.dental_chart_entries;
DELETE FROM public.documents;
DELETE FROM public.notes;
DELETE FROM public.payments;
DELETE FROM public.appointments;
DELETE FROM public.patients;

-- Org-scoped operational tables whose V2 ownership model is undecided
-- ([JUDGMENT 4]). Wiped now (test data); their RLS is rebuilt operator-only in
-- §9/§11 until Phase 2/3 assigns them a doctor/clinic owner.
DELETE FROM public.forms;
DELETE FROM public.expenses;
DELETE FROM public.tasks;
DELETE FROM public.inventory_items;
DELETE FROM public.invitations;
DELETE FROM public.org_secrets;

-- Audit log: keep the historical trail (operator-readable). It references
-- auth.users, not orgs in its actor columns, so it survives the org wipe.
-- [JUDGMENT 4] We do NOT delete audit_log — it is the compliance record.

-- Demote / normalize the kept doctor profile to a solo V2 doctor.
-- role → 'doctor', tooth_notation → 'fdi' (default already), trial plan.
-- org_id is cleared in §7 (renamed to org_id_v1). The immutable-fields trigger
-- gates role changes to operators only; this migration runs as the service role
-- (operator-equivalent / RLS-bypassing), so the role change is permitted.
UPDATE public.profiles
   SET role = 'doctor'
 WHERE id = (SELECT id FROM auth.users WHERE email = 'alialjobory89@gmail.com');

-- Any OTHER non-operator profiles (old Le Royal staff) are deleted — V2 reseeds
-- staff via the receptionist invite flow. The operator profile is preserved.
DELETE FROM public.profiles p
 WHERE p.id <> (SELECT id FROM auth.users WHERE email = 'alialjobory89@gmail.com')
   AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.user_id = p.id);

-- Now that no patient/clinical rows remain, backfill doctor_id on the (empty)
-- tables is a no-op, so we can safely tighten constraints in §6.


-- ============================================================================
-- §6. ENFORCE NOT NULL on the new ownership columns
-- ----------------------------------------------------------------------------
-- Safe now: the tables are empty post-wipe, so NOT NULL can't fail on legacy
-- rows. Reseeded rows must always carry doctor_id.
-- ============================================================================

-- patients.doctor_id becomes the required ownership boundary.
ALTER TABLE public.patients ALTER COLUMN doctor_id SET NOT NULL;

-- appointments / treatment_plans already had doctor_id but as nullable with
-- ON DELETE SET NULL. Tighten to NOT NULL and change FK action to RESTRICT
-- (an owned clinical row must not silently lose its owner). [JUDGMENT 7]
ALTER TABLE public.appointments    DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE public.appointments    ADD  CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.appointments    ALTER COLUMN doctor_id SET NOT NULL;

ALTER TABLE public.treatment_plans DROP CONSTRAINT IF EXISTS treatment_plans_doctor_id_fkey;
ALTER TABLE public.treatment_plans ADD  CONSTRAINT treatment_plans_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.treatment_plans ALTER COLUMN doctor_id SET NOT NULL;

-- Newly added doctor_id columns → NOT NULL.
ALTER TABLE public.treatment_plan_items ALTER COLUMN doctor_id SET NOT NULL;
ALTER TABLE public.dental_chart_entries ALTER COLUMN doctor_id SET NOT NULL;
ALTER TABLE public.payments             ALTER COLUMN doctor_id SET NOT NULL;
ALTER TABLE public.documents            ALTER COLUMN doctor_id SET NOT NULL;
ALTER TABLE public.notes                ALTER COLUMN doctor_id SET NOT NULL;
ALTER TABLE public.form_submissions     ALTER COLUMN doctor_id SET NOT NULL;
-- prescriptions.doctor_id is already NOT NULL (no change).


-- ============================================================================
-- §7. RETIRE V1 ORG COLUMNS — rename to *_v1 (rollback safety; never dropped here)
-- ----------------------------------------------------------------------------
-- ⚠️ BLAST RADIUS [JUDGMENT 2]: profiles.org_id is read by current_org_id(),
--    which is referenced by EVERY V1 *_own_org RLS policy on ~19 tables, plus
--    the enforce_profile_immutable_fields() trigger. Renaming the column would
--    break all of them. Therefore the correct ORDER is:
--      §8  drop the V1 policies + retire current_org_id()
--      §7  (here) rename the columns
--    We physically place §7 AFTER dropping dependents — but for readability the
--    rename statements live here and are executed only once §8 has run. To keep
--    a single linear script, §8 is emitted BEFORE these renames at run time.
--    (See the actual ordering: §8 block precedes the rename block below.)
-- ============================================================================

-- NOTE: ordering — drop dependents first. The DROP POLICY / DROP FUNCTION work
-- of §8 is inlined here to guarantee renames don't fail on dependency.


-- ── §8 (executed first): drop V1 RLS policies + retire current_org_id() ──────
-- The V1 model authorized access via `org_id = current_org_id()`. All of these
-- are replaced by doctor-centric policies in §11. We drop them explicitly so the
-- review diff shows exactly what authorization is being removed.

-- profiles
DROP POLICY IF EXISTS profiles_select_own_org ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self    ON public.profiles;
-- (operator policies on profiles are kept — they use is_operator(), not org_id)

-- patients
DROP POLICY IF EXISTS patients_select_own_org ON public.patients;
DROP POLICY IF EXISTS patients_insert_own_org ON public.patients;
DROP POLICY IF EXISTS patients_update_own_org ON public.patients;
DROP POLICY IF EXISTS patients_delete_own_org ON public.patients;

-- appointments
DROP POLICY IF EXISTS appointments_select_own_org ON public.appointments;
DROP POLICY IF EXISTS appointments_insert_own_org ON public.appointments;
DROP POLICY IF EXISTS appointments_update_own_org ON public.appointments;
DROP POLICY IF EXISTS appointments_delete_own_org ON public.appointments;

-- treatment_plans
DROP POLICY IF EXISTS treatment_plans_select_own_org ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_insert_own_org ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_update_own_org ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_delete_own_org ON public.treatment_plans;

-- treatment_plan_items
DROP POLICY IF EXISTS treatment_plan_items_select_own_org ON public.treatment_plan_items;
DROP POLICY IF EXISTS treatment_plan_items_insert_own_org ON public.treatment_plan_items;
DROP POLICY IF EXISTS treatment_plan_items_update_own_org ON public.treatment_plan_items;
DROP POLICY IF EXISTS treatment_plan_items_delete_own_org ON public.treatment_plan_items;

-- dental_chart_entries
DROP POLICY IF EXISTS dental_chart_entries_select_own_org ON public.dental_chart_entries;
DROP POLICY IF EXISTS dental_chart_entries_insert_own_org ON public.dental_chart_entries;
DROP POLICY IF EXISTS dental_chart_entries_update_own_org ON public.dental_chart_entries;
DROP POLICY IF EXISTS dental_chart_entries_delete_own_org ON public.dental_chart_entries;

-- payments
DROP POLICY IF EXISTS payments_select_own_org ON public.payments;
DROP POLICY IF EXISTS payments_insert_own_org ON public.payments;
DROP POLICY IF EXISTS payments_update_own_org ON public.payments;
DROP POLICY IF EXISTS payments_delete_own_org ON public.payments;

-- prescriptions / prescription_items
DROP POLICY IF EXISTS prescriptions_select_own_org      ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_insert_own_org      ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_update_own_org      ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_delete_own_org      ON public.prescriptions;
DROP POLICY IF EXISTS prescription_items_select_own_org ON public.prescription_items;
DROP POLICY IF EXISTS prescription_items_insert_own_org ON public.prescription_items;
DROP POLICY IF EXISTS prescription_items_update_own_org ON public.prescription_items;
DROP POLICY IF EXISTS prescription_items_delete_own_org ON public.prescription_items;

-- documents
DROP POLICY IF EXISTS documents_select_own_org ON public.documents;
DROP POLICY IF EXISTS documents_insert_own_org ON public.documents;
DROP POLICY IF EXISTS documents_update_own_org ON public.documents;
DROP POLICY IF EXISTS documents_delete_own_org ON public.documents;

-- notes
DROP POLICY IF EXISTS notes_select_own_org ON public.notes;
DROP POLICY IF EXISTS notes_insert_own_org ON public.notes;
DROP POLICY IF EXISTS notes_update_own_org ON public.notes;
DROP POLICY IF EXISTS notes_delete_own_org ON public.notes;

-- form_submissions / forms
DROP POLICY IF EXISTS form_submissions_select_own_org ON public.form_submissions;
DROP POLICY IF EXISTS form_submissions_insert_own_org ON public.form_submissions;
DROP POLICY IF EXISTS form_submissions_update_own_org ON public.form_submissions;
DROP POLICY IF EXISTS form_submissions_delete_own_org ON public.form_submissions;
DROP POLICY IF EXISTS forms_select_own_org ON public.forms;
DROP POLICY IF EXISTS forms_insert_own_org ON public.forms;
DROP POLICY IF EXISTS forms_update_own_org ON public.forms;
DROP POLICY IF EXISTS forms_delete_own_org ON public.forms;

-- expenses / tasks / inventory_items (org-scoped operational tables)
DROP POLICY IF EXISTS expenses_select_own_org ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_own_org ON public.expenses;
DROP POLICY IF EXISTS expenses_update_own_org ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_own_org ON public.expenses;
DROP POLICY IF EXISTS tasks_select_own_org ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own_org ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own_org ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own_org ON public.tasks;
DROP POLICY IF EXISTS inventory_items_select_own_org ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_insert_own_org ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_update_own_org ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_delete_own_org ON public.inventory_items;

-- audit_log
DROP POLICY IF EXISTS audit_log_select_own_org ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert_own_org ON public.audit_log;
DROP POLICY IF EXISTS audit_log_update_own_org ON public.audit_log;
DROP POLICY IF EXISTS audit_log_delete_own_org ON public.audit_log;

-- automations / conversations / messages / org_secrets / ai_usage / whatsapp_usage
-- / social_connections — these back Phase-5-removed features. Drop their org
-- policies now; the tables are dropped/retired in a later phase, but their RLS
-- must not reference current_org_id() once we retire it below.
DROP POLICY IF EXISTS automations_select_own_org ON public.automations;
DROP POLICY IF EXISTS automations_insert_own_org ON public.automations;
DROP POLICY IF EXISTS automations_update_own_org ON public.automations;
DROP POLICY IF EXISTS automations_delete_own_org ON public.automations;
DROP POLICY IF EXISTS conversations_select_own_org ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_own_org ON public.conversations;
DROP POLICY IF EXISTS conversations_update_own_org ON public.conversations;
DROP POLICY IF EXISTS conversations_delete_own_org ON public.conversations;
DROP POLICY IF EXISTS messages_select_own_org ON public.messages;
DROP POLICY IF EXISTS messages_insert_own_org ON public.messages;
DROP POLICY IF EXISTS messages_update_own_org ON public.messages;
DROP POLICY IF EXISTS messages_delete_own_org ON public.messages;
DROP POLICY IF EXISTS ai_usage_org_select ON public.ai_usage;
DROP POLICY IF EXISTS whatsapp_usage_org_select ON public.whatsapp_usage;
DROP POLICY IF EXISTS social_connections_org_select ON public.social_connections;
DROP POLICY IF EXISTS social_connections_org_insert ON public.social_connections;
DROP POLICY IF EXISTS social_connections_org_update ON public.social_connections;
DROP POLICY IF EXISTS social_connections_org_delete ON public.social_connections;

-- invitations (org-scoped owner policies — V2 reuses/replaces in Phase 4)
DROP POLICY IF EXISTS invitations_owner_select ON public.invitations;
DROP POLICY IF EXISTS invitations_owner_insert ON public.invitations;
DROP POLICY IF EXISTS invitations_owner_update ON public.invitations;

-- orgs (the unit being retired)
DROP POLICY IF EXISTS orgs_select_member ON public.orgs;

-- Retire the immutable-fields trigger's org_id dependency by redefining it to
-- drop the org_id check (org model is gone). Role gating is preserved.
CREATE OR REPLACE FUNCTION public.enforce_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;
  IF NOT public.is_operator() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'profiles.role can only be changed by an operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Redefine enforce_prescription_doctor_role(): the V1 version checks the doctor
-- belongs to NEW.org_id, and its trigger fires `UPDATE OF doctor_id, org_id`.
-- Both reference org_id, which we are about to rename. Drop the org check (org
-- model gone) — keep the role='doctor' guard — and recreate the trigger to fire
-- on doctor_id only. (My earlier claim that this trigger "survives unchanged"
-- was wrong; org_id is referenced in both the body and the trigger column list.)
CREATE OR REPLACE FUNCTION public.enforce_prescription_doctor_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.doctor_id AND role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'doctor_id must reference a profile with role=''doctor'' (got doctor_id=%)', NEW.doctor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prescriptions_enforce_doctor_role ON public.prescriptions;
CREATE TRIGGER prescriptions_enforce_doctor_role
  BEFORE INSERT OR UPDATE OF doctor_id ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_prescription_doctor_role();

-- Now no policy or trigger references current_org_id(); retire it.
DROP FUNCTION IF EXISTS public.current_org_id();


-- ── §7 renames (now safe — all dependents removed above) ────────────────────
-- profiles.org_id was NOT NULL + FK to orgs. Drop NOT NULL + the FK as part of
-- the rename so the kept doctor profile survives the orgs retirement.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.profiles RENAME COLUMN org_id TO org_id_v1;

-- patients.org_id (NOT NULL + FK + part of UNIQUE(org_id,phone)).
-- Drop the org-scoped unique constraint; V2 uniqueness is per-doctor (§8b below).
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_org_id_phone_key;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_org_id_fkey;
ALTER TABLE public.patients ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.patients RENAME COLUMN org_id TO org_id_v1;

-- Clinical + operational tables: rename org_id → org_id_v1 (drop FK/NOT NULL).
DO $rename$
DECLARE
  t text;
  tables text[] := ARRAY[
    'appointments','treatment_plans','treatment_plan_items','dental_chart_entries',
    'payments','prescriptions','prescription_items','documents','notes',
    'form_submissions','forms','expenses','tasks','inventory_items',
    'audit_log','automations','conversations','messages','org_secrets',
    'invitations','ai_usage','whatsapp_usage','social_connections'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only act if the table still has an org_id column.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='org_id') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_org_id_fkey');
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id DROP NOT NULL', t);
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN org_id TO org_id_v1', t);
      RAISE NOTICE 'renamed %.org_id -> org_id_v1', t;
    END IF;
  END LOOP;
END
$rename$;

-- Retire the orgs table itself (rename, don't drop — rollback safety).
ALTER TABLE public.orgs RENAME TO orgs_v1;


-- ============================================================================
-- §8b. NEW UNIQUE CONSTRAINT — patient phone uniqueness is now per-doctor
-- ----------------------------------------------------------------------------
-- V1 enforced UNIQUE(org_id, phone). V2 ownership is the doctor, so a phone is
-- unique within a doctor's patient list. NULL phones are allowed (V1 forced
-- phone NOT NULL; [JUDGMENT 5] we relax to nullable to match ARCH's optional
-- phone — but keep the partial unique for non-null phones).
ALTER TABLE public.patients ALTER COLUMN phone DROP NOT NULL;
CREATE UNIQUE INDEX patients_doctor_phone_uidx
  ON public.patients (doctor_id, phone) WHERE phone IS NOT NULL;


-- ============================================================================
-- §9. NEW INDEXES (ARCH §"Index strategy" + RLS support)
-- ============================================================================

-- Patient ownership + sharing
CREATE INDEX idx_patients_doctor          ON public.patients (doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX idx_patient_shares_recipient ON public.patient_shares (shared_with_user_id, patient_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_patient_shares_patient   ON public.patient_shares (patient_id, shared_with_user_id) WHERE revoked_at IS NULL;

-- Receptionist lookups
CREATE INDEX idx_receptionist_active    ON public.receptionist_assignments (receptionist_id, doctor_id) WHERE terminated_at IS NULL;
CREATE INDEX idx_receptionist_by_doctor ON public.receptionist_assignments (doctor_id, receptionist_id) WHERE terminated_at IS NULL;

-- Clinic group membership
CREATE INDEX idx_clinic_memberships_active ON public.clinic_memberships (doctor_id, clinic_group_id) WHERE left_at IS NULL;
CREATE INDEX idx_clinic_memberships_group  ON public.clinic_memberships (clinic_group_id, doctor_id) WHERE left_at IS NULL;

-- Clinical tables (doctor scoping for RLS + list queries)
CREATE INDEX idx_appointments_doctor       ON public.appointments (doctor_id, scheduled_at);
CREATE INDEX idx_treatment_plans_doctor    ON public.treatment_plans (doctor_id, patient_id);
CREATE INDEX idx_payments_doctor           ON public.payments (doctor_id, patient_id);
CREATE INDEX idx_documents_doctor          ON public.documents (doctor_id, patient_id);
CREATE INDEX idx_notes_doctor              ON public.notes (doctor_id, patient_id);
CREATE INDEX idx_xrays_patient_date        ON public.xrays (patient_id, date_taken DESC);
CREATE INDEX idx_xrays_doctor              ON public.xrays (doctor_id, patient_id);
CREATE INDEX idx_xrays_batch               ON public.xrays (batch_id) WHERE batch_id IS NOT NULL;


-- ============================================================================
-- §10. HELPER FUNCTION — can_access_patient() (completes ARCH's partial version)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so clinical-table policies can call it without each caller
-- needing direct SELECT on patient_shares / receptionist_assignments /
-- clinic_memberships. STABLE: result constant within a statement.
--
-- Branches (matches ARCH §"Worked example: patients SELECT"):
--   0. operator (super-admin)          → is_operator()
--   1. I own the patient               → patients.doctor_id = auth.uid()
--   2. patient shared with me          → patient_shares (active)
--   3. I'm a permitted receptionist    → receptionist_assignments (active + view)
--   4. clinic-group full-record share  → patient.clinic_visible + both active
--                                         memberships in same group + my
--                                         membership has share_full_records
-- [JUDGMENT 1] super-admin branch uses is_operator(), NOT profiles.role='operator'
--              (production has no such role value; operators live in a table).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_access_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_operator()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = p_patient_id AND p.doctor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_shares ps
      WHERE ps.patient_id = p_patient_id
        AND ps.shared_with_user_id = auth.uid()
        AND ps.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.patients p
      JOIN public.receptionist_assignments ra ON ra.doctor_id = p.doctor_id
      WHERE p.id = p_patient_id
        AND ra.receptionist_id = auth.uid()
        AND ra.terminated_at IS NULL
        AND ra.can_view_patients = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      JOIN public.clinic_memberships m_owner
        ON m_owner.doctor_id = p.doctor_id AND m_owner.left_at IS NULL
      JOIN public.clinic_memberships m_me
        ON m_me.clinic_group_id = m_owner.clinic_group_id AND m_me.left_at IS NULL
      WHERE p.id = p_patient_id
        AND p.clinic_visible = true
        AND m_me.doctor_id = auth.uid()
        AND m_me.share_full_records = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated;

-- Write-side helper: may the caller WRITE clinical data for this patient?
-- Doctor-owner OR a receptionist with the relevant add/edit permission OR a
-- non-read-only share OR operator. Per-table policies pass the specific perm.
-- Kept separate from can_access_patient (which is READ scope) so writes stay
-- strict. [JUDGMENT 4 — receptionist write granularity per ARCH defaults.]
CREATE OR REPLACE FUNCTION public.can_write_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_operator()
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = p_patient_id AND p.doctor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_shares ps
      WHERE ps.patient_id = p_patient_id
        AND ps.shared_with_user_id = auth.uid()
        AND ps.revoked_at IS NULL
        AND ps.read_only = false
    );
$$;
REVOKE ALL ON FUNCTION public.can_write_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_patient(uuid) TO authenticated;


-- ============================================================================
-- §11. NEW RLS POLICIES (doctor-centric)
-- ----------------------------------------------------------------------------
-- Conventions:
--   * Every new table gets RLS enabled.
--   * SELECT on clinical/patient tables delegates to can_access_patient().
--   * Writes require doctor ownership (or specific receptionist permission).
--   * Operators retain full access — either via is_operator() inside the helper,
--     or via explicit *_operator policies already present (kept from V1).
-- ============================================================================

-- ── Enable RLS on the 5 new tables ──────────────────────────────────────────
ALTER TABLE public.clinic_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptionist_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_shares           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xrays                    ENABLE ROW LEVEL SECURITY;


-- ── profiles ────────────────────────────────────────────────────────────────
-- A user can always see + update their own profile. Operators keep full access
-- via the existing profiles_*_operator policies. Doctors can additionally see
-- profiles of receptionists they've hired and co-members of their clinic groups
-- (needed to render names) — read-only.
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY profiles_select_related ON public.profiles
  FOR SELECT TO authenticated USING (
    -- receptionists I employ, or doctors who employ me
    EXISTS (
      SELECT 1 FROM public.receptionist_assignments ra
      WHERE ra.terminated_at IS NULL
        AND ((ra.doctor_id = auth.uid() AND ra.receptionist_id = profiles.id)
          OR (ra.receptionist_id = auth.uid() AND ra.doctor_id = profiles.id))
    )
    -- co-members of a clinic group I'm in
    OR EXISTS (
      SELECT 1
      FROM public.clinic_memberships m_me
      JOIN public.clinic_memberships m_other
        ON m_other.clinic_group_id = m_me.clinic_group_id
      WHERE m_me.doctor_id = auth.uid() AND m_me.left_at IS NULL
        AND m_other.doctor_id = profiles.id AND m_other.left_at IS NULL
    )
  );

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());


-- ── patients ──────────────────────────────────────────────────────────────
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated USING (public.can_access_patient(id));

-- INSERT: the doctor creating their own patient, OR a receptionist with
-- can_add_patients for the doctor named in the new row.
CREATE POLICY patients_insert ON public.patients
  FOR INSERT TO authenticated WITH CHECK (
    doctor_id = auth.uid()
    OR public.is_operator()
    OR EXISTS (
      SELECT 1 FROM public.receptionist_assignments ra
      WHERE ra.doctor_id = patients.doctor_id
        AND ra.receptionist_id = auth.uid()
        AND ra.terminated_at IS NULL
        AND ra.can_add_patients = true
    )
  );

-- UPDATE: doctor-owner, operator, or receptionist with can_edit_patients.
CREATE POLICY patients_update ON public.patients
  FOR UPDATE TO authenticated USING (
    doctor_id = auth.uid()
    OR public.is_operator()
    OR EXISTS (
      SELECT 1 FROM public.receptionist_assignments ra
      WHERE ra.doctor_id = patients.doctor_id
        AND ra.receptionist_id = auth.uid()
        AND ra.terminated_at IS NULL
        AND ra.can_edit_patients = true
    )
  ) WITH CHECK (
    -- cannot reassign a patient to a different doctor via UPDATE
    doctor_id = auth.uid()
    OR public.is_operator()
    OR EXISTS (
      SELECT 1 FROM public.receptionist_assignments ra
      WHERE ra.doctor_id = patients.doctor_id
        AND ra.receptionist_id = auth.uid()
        AND ra.terminated_at IS NULL
        AND ra.can_edit_patients = true
    )
  );

-- DELETE: doctor-owner or operator only (receptionists never delete patients).
CREATE POLICY patients_delete ON public.patients
  FOR DELETE TO authenticated USING (doctor_id = auth.uid() OR public.is_operator());


-- ── Generic clinical-table policies ─────────────────────────────────────────
-- appointments / treatment_plans / treatment_plan_items / dental_chart_entries
-- / documents / notes / prescriptions / prescription_items / form_submissions.
-- SELECT delegates to can_access_patient(patient_id). Child tables that lack a
-- direct patient_id (prescription_items, treatment_plan_items) resolve via parent.

-- appointments
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY appointments_write ON public.appointments
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator()
    OR EXISTS (SELECT 1 FROM public.receptionist_assignments ra
               WHERE ra.doctor_id = appointments.doctor_id AND ra.receptionist_id = auth.uid()
                 AND ra.terminated_at IS NULL AND ra.can_edit_calendar = true))
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator()
    OR EXISTS (SELECT 1 FROM public.receptionist_assignments ra
               WHERE ra.doctor_id = appointments.doctor_id AND ra.receptionist_id = auth.uid()
                 AND ra.terminated_at IS NULL AND ra.can_edit_calendar = true));

-- treatment_plans (clinical write = doctor/operator only; receptionists don't chart)
CREATE POLICY treatment_plans_select ON public.treatment_plans
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY treatment_plans_write ON public.treatment_plans
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- treatment_plan_items (child of treatment_plans; doctor_id denormalized)
CREATE POLICY treatment_plan_items_select ON public.treatment_plan_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.treatment_plans tp
            WHERE tp.id = treatment_plan_items.treatment_plan_id
              AND public.can_access_patient(tp.patient_id)));
CREATE POLICY treatment_plan_items_write ON public.treatment_plan_items
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- dental_chart_entries
CREATE POLICY dental_chart_entries_select ON public.dental_chart_entries
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY dental_chart_entries_write ON public.dental_chart_entries
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- documents (doctor write; receptionist read covered by can_access_patient)
CREATE POLICY documents_select ON public.documents
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY documents_write ON public.documents
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- notes
CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY notes_write ON public.notes
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- prescriptions (doctor-only write; trigger enforce_prescription_doctor_role
-- from V1 still applies and is org-agnostic, so it survives).
CREATE POLICY prescriptions_select ON public.prescriptions
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY prescriptions_write ON public.prescriptions
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- prescription_items (child of prescriptions)
CREATE POLICY prescription_items_select ON public.prescription_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.prescriptions pr
            WHERE pr.id = prescription_items.prescription_id
              AND public.can_access_patient(pr.patient_id)));
CREATE POLICY prescription_items_write ON public.prescription_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.prescriptions pr
                 WHERE pr.id = prescription_items.prescription_id
                   AND (pr.doctor_id = auth.uid() OR public.is_operator())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.prescriptions pr
                 WHERE pr.id = prescription_items.prescription_id
                   AND (pr.doctor_id = auth.uid() OR public.is_operator())));

-- form_submissions ([JUDGMENT 4] forms feature fate undecided; scoped to doctor)
CREATE POLICY form_submissions_select ON public.form_submissions
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY form_submissions_write ON public.form_submissions
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());


-- ── payments (special: DELETE restricted to doctor; INSERT allows receptionist)
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));

CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    doctor_id = auth.uid()
    OR public.is_operator()
    OR EXISTS (SELECT 1 FROM public.receptionist_assignments ra
               WHERE ra.doctor_id = payments.doctor_id AND ra.receptionist_id = auth.uid()
                 AND ra.terminated_at IS NULL AND ra.can_add_payments = true)
  );

CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());

-- DELETE: doctor or operator ONLY. Receptionists are absent → 0 rows under RLS
-- (ARCH §"payments DELETE restricted"). can_remove_payments flag exists for a
-- future "trusted receptionist" branch but defaults false; not wired here so
-- the strict default holds. [JUDGMENT 4]
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated USING (doctor_id = auth.uid() OR public.is_operator());


-- ── xrays (mirrors patients; doctor full CRUD, receptionist/shared/clinic READ)
CREATE POLICY xrays_select ON public.xrays
  FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY xrays_insert ON public.xrays
  FOR INSERT TO authenticated WITH CHECK (doctor_id = auth.uid() OR public.is_operator());
CREATE POLICY xrays_update ON public.xrays
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.can_write_patient(patient_id) OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.can_write_patient(patient_id) OR public.is_operator());
CREATE POLICY xrays_delete ON public.xrays
  FOR DELETE TO authenticated USING (doctor_id = auth.uid() OR public.is_operator());


-- ── clinic_groups ───────────────────────────────────────────────────────────
-- Visible to members + operators. Created by any authenticated doctor. Updated
-- by the group's owner-member. Deleted by owner-member or operator.
CREATE POLICY clinic_groups_select ON public.clinic_groups
  FOR SELECT TO authenticated USING (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships m
               WHERE m.clinic_group_id = clinic_groups.id
                 AND m.doctor_id = auth.uid() AND m.left_at IS NULL)
  );
CREATE POLICY clinic_groups_insert ON public.clinic_groups
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_operator());
CREATE POLICY clinic_groups_update ON public.clinic_groups
  FOR UPDATE TO authenticated USING (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships m
               WHERE m.clinic_group_id = clinic_groups.id AND m.doctor_id = auth.uid()
                 AND m.role = 'owner' AND m.left_at IS NULL)
  );
CREATE POLICY clinic_groups_delete ON public.clinic_groups
  FOR DELETE TO authenticated USING (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships m
               WHERE m.clinic_group_id = clinic_groups.id AND m.doctor_id = auth.uid()
                 AND m.role = 'owner' AND m.left_at IS NULL)
  );


-- ── clinic_memberships ──────────────────────────────────────────────────────
-- A doctor sees their own memberships + memberships of groups they own. Inserts:
-- a doctor adds themselves (join), or an owner adds members. Update/delete:
-- self (e.g. set left_at, change own sharing prefs) or the group owner.
CREATE POLICY clinic_memberships_select ON public.clinic_memberships
  FOR SELECT TO authenticated USING (
    public.is_operator()
    OR doctor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships owner_m
               WHERE owner_m.clinic_group_id = clinic_memberships.clinic_group_id
                 AND owner_m.doctor_id = auth.uid() AND owner_m.role = 'owner'
                 AND owner_m.left_at IS NULL)
  );
CREATE POLICY clinic_memberships_insert ON public.clinic_memberships
  FOR INSERT TO authenticated WITH CHECK (
    public.is_operator()
    OR doctor_id = auth.uid()  -- joining a group myself
    OR EXISTS (SELECT 1 FROM public.clinic_memberships owner_m
               WHERE owner_m.clinic_group_id = clinic_memberships.clinic_group_id
                 AND owner_m.doctor_id = auth.uid() AND owner_m.role = 'owner'
                 AND owner_m.left_at IS NULL)
  );
CREATE POLICY clinic_memberships_update ON public.clinic_memberships
  FOR UPDATE TO authenticated USING (
    public.is_operator()
    OR doctor_id = auth.uid()  -- change my own sharing prefs / leave
    OR EXISTS (SELECT 1 FROM public.clinic_memberships owner_m
               WHERE owner_m.clinic_group_id = clinic_memberships.clinic_group_id
                 AND owner_m.doctor_id = auth.uid() AND owner_m.role = 'owner'
                 AND owner_m.left_at IS NULL)
  ) WITH CHECK (
    public.is_operator() OR doctor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships owner_m
               WHERE owner_m.clinic_group_id = clinic_memberships.clinic_group_id
                 AND owner_m.doctor_id = auth.uid() AND owner_m.role = 'owner'
                 AND owner_m.left_at IS NULL)
  );
CREATE POLICY clinic_memberships_delete ON public.clinic_memberships
  FOR DELETE TO authenticated USING (
    public.is_operator() OR doctor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.clinic_memberships owner_m
               WHERE owner_m.clinic_group_id = clinic_memberships.clinic_group_id
                 AND owner_m.doctor_id = auth.uid() AND owner_m.role = 'owner'
                 AND owner_m.left_at IS NULL)
  );


-- ── receptionist_assignments ────────────────────────────────────────────────
-- The doctor (employer) manages assignments. The receptionist can READ their
-- own assignments (to know their permissions) but not edit them.
CREATE POLICY receptionist_assignments_select ON public.receptionist_assignments
  FOR SELECT TO authenticated USING (
    public.is_operator() OR doctor_id = auth.uid() OR receptionist_id = auth.uid()
  );
CREATE POLICY receptionist_assignments_insert ON public.receptionist_assignments
  FOR INSERT TO authenticated WITH CHECK (doctor_id = auth.uid() OR public.is_operator());
CREATE POLICY receptionist_assignments_update ON public.receptionist_assignments
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.is_operator())
  WITH CHECK (doctor_id = auth.uid() OR public.is_operator());
CREATE POLICY receptionist_assignments_delete ON public.receptionist_assignments
  FOR DELETE TO authenticated USING (doctor_id = auth.uid() OR public.is_operator());


-- ── patient_shares ──────────────────────────────────────────────────────────
-- The sharing doctor manages shares for patients they own; the recipient can
-- READ shares granted to them. Insert/update/delete limited to the patient's
-- owning doctor (or operator).
CREATE POLICY patient_shares_select ON public.patient_shares
  FOR SELECT TO authenticated USING (
    public.is_operator()
    OR shared_with_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p
               WHERE p.id = patient_shares.patient_id AND p.doctor_id = auth.uid())
  );
CREATE POLICY patient_shares_insert ON public.patient_shares
  FOR INSERT TO authenticated WITH CHECK (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.patients p
               WHERE p.id = patient_shares.patient_id AND p.doctor_id = auth.uid())
  );
CREATE POLICY patient_shares_update ON public.patient_shares
  FOR UPDATE TO authenticated USING (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.patients p
               WHERE p.id = patient_shares.patient_id AND p.doctor_id = auth.uid())
  ) WITH CHECK (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.patients p
               WHERE p.id = patient_shares.patient_id AND p.doctor_id = auth.uid())
  );
CREATE POLICY patient_shares_delete ON public.patient_shares
  FOR DELETE TO authenticated USING (
    public.is_operator()
    OR EXISTS (SELECT 1 FROM public.patients p
               WHERE p.id = patient_shares.patient_id AND p.doctor_id = auth.uid())
  );


-- ── Operational tables with NO V2 owner yet — [JUDGMENT 4]
-- forms / expenses / tasks / inventory_items / invitations / org_secrets /
-- audit_log. We dropped only their *_own_org policies in §8; their V1
-- *_operator policies (which use is_operator(), not current_org_id()) SURVIVE
-- unchanged. The net effect is exactly the placeholder we want: OPERATOR-ONLY
-- access, regular users deny-all (no leakage). Phase 2/3 assigns the real
-- doctor/clinic ownership model + reinstates user access. Tables are empty
-- post-wipe, so deny-all blocks nothing today. No new policies are needed here
-- (and creating `<t>_op_*` policies would collide with V1's existing
-- invitations_op_* / ai_usage_op_* etc. — left intentionally untouched).
--
-- audit_log only: ADD an authenticated-insert so the rewritten data layer
-- (Phase 2) can keep writing audit rows. The row records the acting user from
-- auth.uid(); trigger-side hardening is Phase 2 work. (Operator SELECT/INSERT/
-- UPDATE/DELETE already exist from V1's audit_log_*_operator policies.)
CREATE POLICY audit_log_insert_auth ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (acting_user_id = auth.uid() OR public.is_operator());


-- ============================================================================
-- §12. VERIFICATION QUERIES (run AFTER commit; read-only; see plan doc §Verify)
-- ----------------------------------------------------------------------------
-- These are commented so this script stays pure DDL/DML. Copy-run them in the
-- SQL editor post-migration. Expected results noted inline.
-- ============================================================================
-- -- 12a. New tables exist (expect 5 rows):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('clinic_groups','clinic_memberships','receptionist_assignments','patient_shares','xrays')
--  ORDER BY 1;
--
-- -- 12b. doctor_id is NOT NULL everywhere it should be (expect 0 rows):
-- SELECT table_name FROM information_schema.columns
--  WHERE table_schema='public' AND column_name='doctor_id' AND is_nullable='YES'
--    AND table_name IN ('patients','appointments','treatment_plans','treatment_plan_items',
--                       'dental_chart_entries','payments','documents','notes','prescriptions',
--                       'form_submissions','xrays');
--
-- -- 12c. org_id columns renamed to org_id_v1 (expect 0 rows named 'org_id'):
-- SELECT table_name FROM information_schema.columns
--  WHERE table_schema='public' AND column_name='org_id';
--
-- -- 12d. current_org_id() is gone (expect 0 rows):
-- SELECT proname FROM pg_proc WHERE proname='current_org_id';
--
-- -- 12e. can_access_patient() exists (expect 1 row):
-- SELECT proname FROM pg_proc WHERE proname='can_access_patient';
--
-- -- 12f. Kept accounts (expect doctor role='doctor', operator present):
-- SELECT u.email, p.role FROM public.profiles p JOIN auth.users u ON u.id=p.id
--  WHERE u.email IN ('alialjobory89@gmail.com','madmaxali@gmail.com');
-- SELECT u.email FROM public.operators o JOIN auth.users u ON u.id=o.user_id;
--
-- -- 12g. Tenant data wiped (expect 0):
-- SELECT (SELECT count(*) FROM public.patients) patients,
--        (SELECT count(*) FROM public.appointments) appts,
--        (SELECT count(*) FROM public.payments) pays;
--
-- -- 12h. RLS-enabled on new tables (expect rowsecurity=true for all 5):
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('clinic_groups','clinic_memberships','receptionist_assignments','patient_shares','xrays');
--
-- -- 12i. RLS denial smoke (run with simulated JWTs — see plan doc; cannot be
-- --      asserted from a service-role session because it bypasses RLS):
-- --   As Dr.A:  SELECT count(*) FROM patients;                 -- only own
-- --   As Dr.A:  INSERT INTO patients(doctor_id,...) VALUES (DrB,...);  -- WITH CHECK fail
-- --   As Recep: DELETE FROM payments WHERE id=...;             -- 0 rows


COMMIT;
-- ============================================================================
-- TRANSACTION END
-- ============================================================================


-- ============================================================================
-- §13. ROLLBACK PROCEDURE (manual — NOT part of the transaction above)
-- ----------------------------------------------------------------------------
-- If COMMIT succeeded but verification reveals a problem, roll back via ONE of:
--
--   OPTION A — restore the pre-migration snapshot (authoritative, fastest path
--   to a known-good V1). Use the §0 pg_dump / Supabase backup:
--       psql "$SUPABASE_DB_URL" -f velo-v1-preV2-<stamp>.sql   # into a clean db
--   then point the app back at the restored database.
--
--   OPTION B — in-place partial rollback (only if snapshot is unavailable). The
--   *_v1 columns and orgs_v1 table retain the V1 org linkage, BUT the wiped rows
--   (patients, clinical data) are GONE and cannot be reconstructed from columns.
--   In-place rollback therefore only restores SCHEMA shape, not data:
--       BEGIN;
--       -- recreate current_org_id()
--       CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid
--         LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public
--         AS $$ SELECT org_id_v1 FROM public.profiles WHERE id = auth.uid() $$;
--       -- rename columns back
--       ALTER TABLE public.profiles RENAME COLUMN org_id_v1 TO org_id;
--       ALTER TABLE public.patients RENAME COLUMN org_id_v1 TO org_id;
--       -- ...repeat for every renamed table...
--       ALTER TABLE public.orgs_v1 RENAME TO orgs;
--       -- recreate V1 policies from src/lib/schema.sql (§ RLS)
--       -- drop V2 tables: xrays, patient_shares, receptionist_assignments,
--       --   clinic_memberships, clinic_groups
--       COMMIT;
--   ⚠️ Because data was wiped, OPTION A (snapshot restore) is STRONGLY preferred.
--   Treat OPTION B as schema-only recovery for a non-production rehearsal.
-- ============================================================================
