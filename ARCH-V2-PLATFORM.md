# ARCH-V2-PLATFORM.md

# Velo Dental V2 — Doctor-Centric Platform Architecture

> **Status: PLANNING ARTIFACT (DEFERRED — June 2026)**
>
> V2 restructure work paused per strategic decision. V1 completion is the current focus. This document remains the canonical reference for V2 work when it resumes — likely 6-12 months out. PR #31 (closed, branch preserved) contains the Phase 1A migration SQL draft for future use.

**Date:** 2026-06-13 (Phase 0); realigned 2026-06-13 (Phase 1A.5)
**Author:** Ali Al-Jobori + Claude
**Status:** Phase 1A complete (draft migration, PR #31). This doc realigned to live schema reality in Phase 1A.5.
**Estimated execution:** 4–8 weeks across 6 phases

---

## Reality vs original plan (read this first)

This document was originally authored in Phase 0 **before the live production
schema had been fully explored**. The Phase 0 Entity Model was a clean
first-principles sketch. **Phase 1A (the draft migration, PR #31) then read the
actual schema** (`src/lib/schema.sql`, 27 tables) and found material divergences
between the sketch and reality.

This Phase 1A.5 revision corrects the doc so it matches what the migration SQL
in PR #31 actually does. Where Phase 0 and reality disagreed, **reality wins and
is documented here**; the 8 strategic Decisions Taken are unchanged. The Phase 1A
investigation produced **9 judgment calls** — see `scripts/v2-platform-migration-plan.md`
(the delta report) for the full table. The headline corrections:

- Operators are a **separate `operators` table** + `is_operator()` helper — not a
  `profiles.role` value.
- There is **no `treatments` table** — it's `treatment_plans` +
  `treatment_plan_items` + `dental_chart_entries`.
- `patients` already has `primary_doctor_id` (a filter field from an earlier PR),
  **not** `doctor_id` — V2 *adds* `doctor_id` as the ownership boundary.
- **17 org-scoped tables** the Phase 0 plan never mentioned exist and need a
  V2 fate (wiped, or operator-only holding pattern).
- `current_org_id()` is the linchpin of ~80 V1 RLS policies; retiring it is the
  central act of the migration.

**Canonical Phase 1A artifacts:** PR #31 — `scripts/v2-platform-migration.sql` +
`scripts/v2-platform-migration-plan.md`.

> **Note on data scale:** production is test-scale (~6 patients across Le Royal +
> My Test Clinic). Historical context on the decommissioned Supabase instance and
> Saif's planned 3,171-contact GHL migration lives in `docs/DATA-HISTORY.md`. The
> Phase 1A migration SQL includes a 50-patient pre-flight guard to catch
> wrong-instance mistakes.

---

## Executive Summary

Velo Dental V1 was a **clinic-centric SaaS** where the organization owned patients and all doctors in an org shared visibility. This matched traditional family-practice clinics but didn't fit how dental practice actually operates in the Iraqi market — where most doctors are **independent practitioners** who own their own patient relationships, hire their own receptionists, and may share clinic space (and selected patients) with other doctors through loose associations.

V2 inverts the model. **The doctor is the primary unit.** Patients are owned by doctors. Receptionists are hired by doctors. Clinics become **optional associations** ("clinic groups") of doctors who explicitly negotiate what data they share.

This document is the canonical reference for V2 architecture and its phased rollout. Every Phase 1+ PR must align with this document; deviations require updating this document first.

---

## The Strategic Shift

### V1 model (clinic-centric)

```
Org (Clinic)
├── Profile (Doctor) ──┐
├── Profile (Doctor) ──┼─► All see all patients (org-scoped)
├── Profile (Reception)─┘
└── Patients ──────────► Owned by Org
```

- Org is the billing entity
- All members of the org see all patients
- Receptionist hired by org
- Single account per clinic

### V2 model (doctor-centric)

```
Users (everyone)
├── Doctor (Solo by default)
│   ├── Patients (owned)
│   ├── Receptionist(s) (hired)
│   └── Optional: Clinic Group (joined)
├── Doctor (joined a clinic group)
│   ├── Patients (own + shared in)
│   └── Receptionist(s)
└── Receptionist (hired by N doctors)

Clinic Groups (optional associations)
├── Members: Doctors
└── Sharing rules: per-data-type + per-patient
```

- Doctor is the billing entity (per-doctor seat)
- Doctor owns patients by default
- Sharing is explicit (patient-level or clinic-group-level)
- Receptionist hired by doctors (can work for multiple)

### Why this matters

The Iraqi dental market is dominated by **chair-rental and independent-contractor models**. A typical clinic in Erbil or Baghdad:

- One owner provides the space, equipment, sterilization, reception desk
- 2–4 doctors rent chairs and bring their own patients
- Each doctor manages their own patient relationships
- Doctors occasionally refer patients to each other for specialized work
- The "clinic" identity is a soft association, not a corporate entity that owns patient files

V2 matches this reality. V1 didn't.

---

## Entity Model

### `profiles` (revised — auth-backed, clinic users)

Every **clinic** user — doctor, receptionist — is a row in `profiles` (existing
table, restructured). **Operators are NOT in `profiles`** — they are a separate
`operators` table (see below). The live `profile_role` enum is
`('owner', 'doctor', 'receptionist', 'assistant')`; V2 uses `doctor` and
`receptionist`. (`owner`/`assistant` are V1 leftovers; clinic-group ownership is
modeled in `clinic_memberships.role`, not the profile role. The enum is left
intact — Postgres can't easily drop enum values — but V2 only assigns
`doctor`/`receptionist`.)

```sql
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role profile_role NOT NULL,           -- enum: owner|doctor|receptionist|assistant (V2 uses doctor|receptionist)
  full_name text,
  -- NB: no `email` column in V1 profiles; email lives in auth.users (read-only in UI)
  locale locale_code DEFAULT 'en',      -- enum gains 'ku' in V2 (was 'en'|'ar')
  avatar_url text,
  tooth_notation enum('fdi', 'palmer') DEFAULT 'fdi',  -- NEW V2
  subscription_status enum('active', 'past_due', 'canceled', 'trial') DEFAULT 'trial',  -- NEW V2
  plan_tier enum('free', 'pro', 'clinic') DEFAULT 'free',  -- NEW V2
  org_id_v1 uuid,                       -- V1 org_id RENAMED (NOT dropped) — rollback safety; FK + NOT NULL dropped
  created_at  -- (no updated_at column in V1 profiles)
)
```

Key changes vs V1:
- `org_id` is **renamed to `org_id_v1`** (kept for rollback, FK + `NOT NULL`
  dropped), not removed outright. The doctor-centric model ignores it.
- `tooth_notation` added (per-doctor preference)
- Subscription state added for per-doctor billing
- `locale_code` enum gains `'ku'` (Kurdish)

### `operators` (existing — platform super-admins, separate from profiles)

Operators (e.g. the agency/support account) are **not** clinic users and have
**no `profiles` row**. They live in their own table and are detected by the
`is_operator()` SECURITY DEFINER helper, which every super-admin RLS branch
calls. V2 keeps this unchanged (Decision #9).

```sql
operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz
)
-- is_operator() RETURNS boolean — true when auth.uid() is a row in operators.
```

### `clinic_groups` (new — replaces `orgs`)

Optional association of doctors. Doctors form one or join one. Independent doctors don't have one.

```sql
clinic_groups (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid REFERENCES profiles(id),  -- founding doctor
  industry enum('dental') DEFAULT 'dental',
  brand_color text,
  logo_url text,
  created_at, updated_at
)
```

Replaces V1 `orgs` semantically. Different role (optional association, not the
unit of ownership). The V1 `orgs` table itself is **renamed to `orgs_v1`** in the
migration (kept for rollback, not dropped); `clinic_groups` is a brand-new table.

### `clinic_memberships` (new)

Doctor → clinic group with role and sharing preferences.

```sql
clinic_memberships (
  id uuid PRIMARY KEY,
  doctor_id uuid REFERENCES profiles(id),
  clinic_group_id uuid REFERENCES clinic_groups(id),
  role enum('owner', 'member') NOT NULL,
  share_calendar boolean DEFAULT true,
  share_patient_visibility boolean DEFAULT false,
  share_full_records boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz NULL,  -- soft delete

  UNIQUE (doctor_id, clinic_group_id, left_at)
)
```

Granularity:
- `share_calendar` — other clinic members can see this doctor's appointment slots (for scheduling coordination). Default ON.
- `share_patient_visibility` — other clinic members can see existence of this doctor's patients (names only, no medical details). Default OFF.
- `share_full_records` — other clinic members can see full patient records. Default OFF.

Plus per-patient `clinic_visible` flag (see `patients` below) — patients explicitly marked available to clinic group regardless of doctor-level setting.

### `receptionist_assignments` (new)

Doctor hires a receptionist. One receptionist can work for multiple doctors with different permissions per doctor.

```sql
receptionist_assignments (
  id uuid PRIMARY KEY,
  doctor_id uuid REFERENCES profiles(id),
  receptionist_id uuid REFERENCES profiles(id),

  -- Permission flags (per-doctor)
  can_view_calendar boolean DEFAULT true,
  can_edit_calendar boolean DEFAULT true,
  can_view_patients boolean DEFAULT true,
  can_add_patients boolean DEFAULT true,
  can_edit_patients boolean DEFAULT true,
  can_view_payments boolean DEFAULT true,
  can_add_payments boolean DEFAULT true,
  can_remove_payments boolean DEFAULT false,  -- doctor-only by default
  can_view_financial_reports boolean DEFAULT false,  -- doctor-only by default

  hired_at timestamptz DEFAULT now(),
  terminated_at timestamptz NULL,  -- soft delete

  UNIQUE (doctor_id, receptionist_id, terminated_at)
)
```

Defaults match what was specified: receptionist can manage appointments + add payments + view patient data, but cannot remove payments or see financial reports.

### `patients` (revised)

```sql
patients (
  id uuid PRIMARY KEY,
  -- ── V1 columns (real) ────────────────────────────────────────────────
  org_id_v1 uuid,                       -- V1 org_id RENAMED (kept for rollback; FK + NOT NULL dropped)
  full_name text NOT NULL,
  phone text,                           -- V1 was NOT NULL; V2 RELAXES to nullable
  email text,
  dob date,                             -- NB: column is `dob`, NOT `date_of_birth`
  gender patient_gender,                -- enum: male|female|other|prefer_not_to_say (4 values)
  medical_history jsonb DEFAULT '{}',   -- existing V1 column (kept)
  allergies jsonb DEFAULT '[]',         -- existing V1 column (kept)
  primary_doctor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,  -- V1 (PR #26): a FILTER field, NOT ownership
  created_at, updated_at,
  -- ── V2 additions ─────────────────────────────────────────────────────
  doctor_id uuid REFERENCES profiles(id) ON DELETE RESTRICT NOT NULL,  -- NEW V2: the ownership boundary
  clinic_visible boolean DEFAULT false,  -- NEW V2: "this patient available to clinic group"
  family_group_id uuid NULL             -- NEW V2: schema-ready; family-grouping UI deferred to V2.1
)
-- V1 UNIQUE(org_id, phone) is dropped; V2 uses partial UNIQUE(doctor_id, phone) WHERE phone IS NOT NULL
```

Key changes:
- `org_id` → `org_id_v1` (renamed, kept for rollback); **`doctor_id` is ADDED**
  as the required ownership boundary.
- ⚠️ **`doctor_id` did NOT already exist** (Phase 0 assumed it did). PR #26
  added `primary_doctor_id` — a nullable *filter* field, not a security boundary.
  Both columns coexist in V2: `doctor_id` owns, `primary_doctor_id` drives the
  existing "My patients" filter UI.
- `phone` relaxed to nullable; the `UNIQUE(org_id, phone)` constraint is replaced
  by a partial `UNIQUE(doctor_id, phone)` (non-null phones).
- `clinic_visible` flag for patient-level clinic-group opt-in.
- `family_group_id` for family grouping (UI deferred, schema ready).
- ⚠️ **No `external_id`/`external_source`/`created_by` on `patients`** (Phase 0
  sketched them; they don't exist). GHL patient-import idempotency keys are a
  **Phase 2** addition if needed — those columns exist on `prescriptions`,
  `documents`, `notes` today, but not `patients`.

### `patient_shares` (new)

Explicit doctor → other user patient access grants.

```sql
patient_shares (
  id uuid PRIMARY KEY,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  shared_with_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES profiles(id),
  reason text,
  read_only boolean DEFAULT false,
  granted_at timestamptz DEFAULT now(),
  revoked_at timestamptz NULL,  -- soft delete

  UNIQUE (patient_id, shared_with_user_id, revoked_at)
)
```

### Clinical tables (revised)

⚠️ **There is no `treatments` table.** Phase 0 assumed one; the live schema splits
clinical treatment data across three tables. The full clinical set that gets
`org_id`→`org_id_v1` and a `doctor_id` ownership column is:

| Table | `doctor_id` status going in | Action |
|-------|-----------------------------|--------|
| `appointments` | exists, nullable, `ON DELETE SET NULL` | tighten → `NOT NULL` + `RESTRICT` |
| `treatment_plans` | exists, nullable, `ON DELETE SET NULL` | tighten → `NOT NULL` + `RESTRICT` |
| `treatment_plan_items` | none (child of `treatment_plans`) | **add** (denormalized) → `NOT NULL` |
| `dental_chart_entries` | none | **add** → `NOT NULL` |
| `prescriptions` | already `NOT NULL`, `RESTRICT` | none (already V2-shaped) |
| `prescription_items` | none (child of `prescriptions`) | none — resolves via parent |
| `documents` | none (has `uploaded_by`) | **add** → `NOT NULL` |
| `notes` | none (has `created_by`) | **add** → `NOT NULL` |
| `payments` | none (has `recorded_by`) | **add** → `NOT NULL` |
| `form_submissions` | none | **add** → `NOT NULL` (patient-scoped) |

The `doctor_id` is **denormalized** from `patients.doctor_id` so RLS policies can
scope without a join. The shape on each is:

```sql
doctor_id uuid REFERENCES profiles(id) ON DELETE RESTRICT NOT NULL
```

The V1 `org_id` on every one of these is **renamed to `org_id_v1`** (kept for
rollback), not dropped.

### Other V1 tables (previously unaccounted — 17 tables)

Phase 0 didn't enumerate these, but they exist and all depend on `org_id` /
`current_org_id()`, so the migration must handle them. Their V2 fate:

**Wiped now** (integration/messaging — slated for removal in Phase 5 anyway, and
they back killed connectors). Rows deleted; tables retained with `org_id_v1`:
- `conversations`, `messages` (WhatsApp inbox)
- `automations`
- `social_connections`
- `ai_usage`, `whatsapp_usage` (usage meters)

**Operator-only holding pattern** (V2 ownership undecided — a genuine product
call deferred to Phase 2/3). Their `*_own_org` policies are dropped, but their
existing `*_operator` policies (which use `is_operator()`) survive, so regular
users get deny-all until a doctor/clinic owner is assigned:
- `forms`, `expenses`, `tasks`, `inventory_items`
- `invitations` (an org-scoped invite table + `accept_invitation()` RPC already
  exists; Phase 4 receptionist invites should **reuse/extend** this, not rebuild)
- `org_secrets`
- `audit_log` — kept as the compliance trail (operator-readable); additionally
  gets an authenticated-INSERT policy so the Phase 2 data layer can keep writing.

> These are flagged, not silently decided. Whether `expenses`/`inventory` become
> doctor-owned or clinic-group-shared is an open product question (chair-rental
> clinics could go either way).

### `xrays` (new V2)

Dedicated table for radiographic imaging, separate from generic documents.

```sql
xrays (
  id uuid PRIMARY KEY,
  doctor_id uuid REFERENCES profiles(id) NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES treatment_plans(id) NULL,  -- optional link (no `treatments` table — see Clinical tables)

  file_path text NOT NULL,  -- storage bucket key
  file_name text NOT NULL,
  mime_type text,
  file_size integer,

  xray_type enum('bitewing', 'periapical', 'panoramic', 'occlusal', 'cbct', 'other') NOT NULL,
  date_taken date NOT NULL,
  teeth_shown text[],  -- FDI tooth numbers, e.g. ['16','17','46','47']
  notes text,
  batch_id uuid NULL,  -- group xrays uploaded together

  uploaded_by uuid REFERENCES profiles(id),
  created_at, updated_at
)
```

**Storage bucket:** `patient-xrays`
**Path pattern:** `{doctor_id}/{patient_id}/{xray_id}.{ext}`
**Max file size:** 25 MB per xray
**Allowed MIME types:** image/jpeg, image/png, image/tiff, application/dicom (V2.1)

### Index strategy

Critical indexes for RLS + UI performance:

```sql
-- Patient ownership + sharing
CREATE INDEX idx_patients_doctor ON patients(doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX idx_patient_shares_recipient ON patient_shares(shared_with_user_id, patient_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_patient_shares_patient ON patient_shares(patient_id, shared_with_user_id) WHERE revoked_at IS NULL;

-- Receptionist lookups
CREATE INDEX idx_receptionist_active ON receptionist_assignments(receptionist_id, doctor_id) WHERE terminated_at IS NULL;
CREATE INDEX idx_receptionist_by_doctor ON receptionist_assignments(doctor_id, receptionist_id) WHERE terminated_at IS NULL;

-- Clinic group membership
CREATE INDEX idx_clinic_memberships_active ON clinic_memberships(doctor_id, clinic_group_id) WHERE left_at IS NULL;

-- Clinical tables (doctor scoping) — note treatment_plans, not "treatments"
CREATE INDEX idx_appointments_doctor    ON appointments(doctor_id, scheduled_at);
CREATE INDEX idx_treatment_plans_doctor ON treatment_plans(doctor_id, patient_id);
CREATE INDEX idx_payments_doctor        ON payments(doctor_id, patient_id);
CREATE INDEX idx_documents_doctor       ON documents(doctor_id, patient_id);
CREATE INDEX idx_notes_doctor           ON notes(doctor_id, patient_id);
CREATE INDEX idx_xrays_patient_date     ON xrays(patient_id, date_taken DESC);
CREATE INDEX idx_xrays_doctor           ON xrays(doctor_id, patient_id);
CREATE INDEX idx_xrays_batch            ON xrays(batch_id) WHERE batch_id IS NOT NULL;
```

The migration creates **16 indexes** total (the above plus the
sharing/receptionist/clinic-membership indexes listed earlier).

---

## RLS Strategy

### Core principle

Every clinical/patient table follows the same RLS shape for SELECT:

```
SELECT WHERE
  is_operator()                                       -- super-admin (operators table)
  OR doctor_id = auth.uid()                           -- doctor sees own
  OR EXISTS (patient_shares with shared_with = uid)   -- shared with me
  OR EXISTS (receptionist_assignment + perm)          -- hired with view perm
  OR EXISTS (clinic_membership + share rule)          -- shared via clinic group
```

In practice this logic is centralized in the `can_access_patient()` helper
(below); most table policies just call it. The migration **drops 89 V1
`*_own_org` policies and creates 50 new V2 policies** in their place.

Write operations are more restrictive:
- INSERT/UPDATE/DELETE typically require `doctor_id = auth.uid()` (the doctor)
- Some receptionist writes allowed per-permission (e.g., `can_add_patients`, `can_add_payments`)
- DELETE on payments restricted to doctor only (per spec)

### Worked example: `patients` SELECT

```sql
CREATE POLICY patients_select_own ON patients
FOR SELECT TO authenticated USING (
  -- I'm the doctor who owns this patient
  doctor_id = auth.uid()

  -- OR patient is shared with me
  OR EXISTS (
    SELECT 1 FROM patient_shares ps
    WHERE ps.patient_id = patients.id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.revoked_at IS NULL
  )

  -- OR I'm a receptionist for this doctor with view permission
  OR EXISTS (
    SELECT 1 FROM receptionist_assignments ra
    WHERE ra.doctor_id = patients.doctor_id
      AND ra.receptionist_id = auth.uid()
      AND ra.terminated_at IS NULL
      AND ra.can_view_patients = true
  )

  -- OR patient is clinic_visible AND we're in the same clinic group
  OR (
    patients.clinic_visible = true
    AND EXISTS (
      SELECT 1
      FROM clinic_memberships m1
      JOIN clinic_memberships m2 ON m1.clinic_group_id = m2.clinic_group_id
      WHERE m1.doctor_id = patients.doctor_id
        AND m1.left_at IS NULL
        AND m2.doctor_id = auth.uid()
        AND m2.left_at IS NULL
        AND m2.share_full_records = true
    )
  )

  -- OR I'm a super-admin (operator) — via the operators table, NOT a profile role
  OR public.is_operator()
);
```

### Worked example: `payments` DELETE (restricted)

Receptionist with `can_add_payments` can INSERT, but NOT DELETE. Doctor can do both.

```sql
CREATE POLICY payments_delete_doctor_only ON payments
FOR DELETE TO authenticated USING (
  doctor_id = auth.uid()
);
```

Receptionists are not in this policy at all → DELETE returns 0 rows for them under RLS, which surfaces as an error in the UI. Honest enforcement.

### Worked example: `xrays` SELECT (mirrors patients)

```sql
CREATE POLICY xrays_select ON xrays
FOR SELECT TO authenticated USING (
  doctor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM patient_shares ps
    WHERE ps.patient_id = xrays.patient_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM receptionist_assignments ra
    WHERE ra.doctor_id = xrays.doctor_id
      AND ra.receptionist_id = auth.uid()
      AND ra.terminated_at IS NULL
      AND ra.can_view_patients = true
  )
  -- clinic-group visibility delegates to patient's clinic_visible flag
  OR EXISTS (
    SELECT 1 FROM patients p
    WHERE p.id = xrays.patient_id
      AND p.clinic_visible = true
      AND EXISTS (
        SELECT 1
        FROM clinic_memberships m1
        JOIN clinic_memberships m2 ON m1.clinic_group_id = m2.clinic_group_id
        WHERE m1.doctor_id = xrays.doctor_id
          AND m1.left_at IS NULL
          AND m2.doctor_id = auth.uid()
          AND m2.left_at IS NULL
          AND m2.share_full_records = true
      )
  )
);
```

### Helper functions

To DRY the RLS, Phase 1A created **two** SECURITY DEFINER helpers. The READ
helper (completed from the Phase 0 sketch — operator branch added, clinic-group
branch filled in):

```sql
CREATE FUNCTION public.can_access_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_operator()                                          -- 0. super-admin
    OR EXISTS (SELECT 1 FROM patients p WHERE p.id = p_patient_id AND p.doctor_id = auth.uid())  -- 1. owner
    OR EXISTS (SELECT 1 FROM patient_shares ps WHERE ps.patient_id = p_patient_id  -- 2. shared with me
                 AND ps.shared_with_user_id = auth.uid() AND ps.revoked_at IS NULL)
    OR EXISTS (SELECT 1 FROM patients p                                            -- 3. permitted receptionist
                 JOIN receptionist_assignments ra ON ra.doctor_id = p.doctor_id
                 WHERE p.id = p_patient_id AND ra.receptionist_id = auth.uid()
                   AND ra.terminated_at IS NULL AND ra.can_view_patients = true)
    OR EXISTS (SELECT 1 FROM patients p                                            -- 4. clinic-group full-record share
                 JOIN clinic_memberships m_owner ON m_owner.doctor_id = p.doctor_id AND m_owner.left_at IS NULL
                 JOIN clinic_memberships m_me ON m_me.clinic_group_id = m_owner.clinic_group_id AND m_me.left_at IS NULL
                 WHERE p.id = p_patient_id AND p.clinic_visible = true
                   AND m_me.doctor_id = auth.uid() AND m_me.share_full_records = true);
$$;
```

And a **WRITE** helper — kept strict (owner, non-read-only share, or operator;
receptionist write permission is checked per-table via the specific flag):

```sql
CREATE FUNCTION public.can_write_patient(p_patient_id uuid)  -- NEW in Phase 1A
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.is_operator()
    OR EXISTS (SELECT 1 FROM patients p WHERE p.id = p_patient_id AND p.doctor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM patient_shares ps WHERE ps.patient_id = p_patient_id
                 AND ps.shared_with_user_id = auth.uid() AND ps.revoked_at IS NULL AND ps.read_only = false);
$$;
```

Clinical-table SELECT policies (`xrays`, `treatment_plans`, `documents`, …) call
`can_access_patient(patient_id)` rather than duplicating logic. Child tables
(`prescription_items`, `treatment_plan_items`) resolve via their parent.
`current_org_id()` — the V1 linchpin called by ~80 old policies — is **retired**
once those policies are dropped.

---

## Migration Plan

### Le Royal (test data) — wipe and restart

Le Royal is your test/development account, not real patient data. The Phase 1A
migration SQL (PR #31) implements this as a **single transaction**:

1. **Pre-flight guard:** abort if the DB isn't V1-shaped, if the operator/doctor
   accounts are missing, or if **patient count > 50** (a wrong-instance safety —
   real data would blow past 50; test data stays under it).
2. **Pre-migration snapshot:** `pg_dump` / Supabase backup (manual, outside the
   transaction) — the authoritative rollback path, since the wipe deletes rows.
3. **Apply V2 schema:** new enums, 5 new tables, new columns, new RLS, indexes.
4. **Wipe + rename, not drop:** delete tenant rows; **rename `org_id`→`org_id_v1`
   on every table and `orgs`→`orgs_v1`** (kept for rollback). Retire
   `current_org_id()` after dropping the 89 V1 policies that reference it.
5. **Preserve two accounts:**
   - `madmaxali@gmail.com` — **operator** (separate `operators` table) — untouched.
   - `alialjobory89@gmail.com` — **kept and set to `role='doctor'`** (demoted from
     its V1 role, e.g. `owner`), solo by default — no clinic group, no
     receptionists. Patients reseeded (2–3) post-migration via UI / seed script.
6. **Verify:** schema assertions + **RLS denial tests with simulated user JWTs**
   (cannot be asserted from a service-role session, which bypasses RLS) — this is
   Phase 1B. Smoke-test patient CRUD, X-ray upload, treatment-plan creation,
   prescription entry.

### Saif (planned, not yet onboarded)

The 3,171 historical GHL contacts are NOT in current production — they're on an older Supabase instance. Approach:

1. **Communicate to Saif:** "We're building the right system for your model. 4-6 week timeline. We'll onboard you fresh under V2 with your GHL contacts migrated cleanly."
2. **GHL import pipeline** gets rewritten in Phase 2 against V2 schema:
   - Each GHL contact → patient row with `doctor_id` set to Saif (or whichever doctor owns that patient based on GHL tags)
   - Notes, documents, prescriptions imported with same `doctor_id`
   - Family relationships detected (same phone/last name?) → `family_group_id`
3. **Onboarding:** Saif signs up, creates Saif Dental clinic group, invites his other doctors, runs import script

### Production cutover plan

Since Le Royal is the only live data and it's test:

- **T-7 days:** notify (just you)
- **T-1 day:** final V2 PR ready, smoke tested in Vercel Preview
- **T0:** schedule 1-hour migration window
  - Lock production (Vercel maintenance page)
  - Run wipe + new schema migration SQL
  - Reseed Le Royal
  - Verify end-to-end as `alialjobory89`
  - Unlock production
- **T+1:** sanity check next day, look for any errors in logs

**Downtime:** ~1 hour, **dominated by manual steps** (snapshot + reseed + smoke).
The SQL itself runs in **< 1 minute** (Le Royal is test-sized; almost all DDL).
⚠️ The app is **intentionally broken between Phase 1 and Phase 2** — the V1
`src/lib/*` still expects `org_id`/`current_org_id()`. Recommend bundling
Phases 1→3 into one window, or keeping prod down until Phase 2 ships.

If anything goes wrong, restore from the pre-migration snapshot (authoritative,
since the wipe deletes data the `_v1` columns can't reconstruct).

---

## Rollout Phases

| Phase | Scope | Sessions | Deliverable |
|-------|-------|----------|-------------|
| **0** | Architecture document (this) | 1 | `ARCH-V2-PLATFORM.md` committed to master |
| **1** | Schema migration + RLS | 2–3 | Production runs V2 schema; Le Royal reseeded; RLS verified |
| ↳ **1A** | Draft migration SQL + delta report | ✅ done | PR #31 — `scripts/v2-platform-migration.{sql,md}` (no execution) |
| ↳ **1A.5** | Realign this ARCH doc with schema reality | ✅ this PR | Entity model / RLS / migration sections corrected to the 27-table reality |
| ↳ **1B** | Apply to a Supabase **test environment** + JWT RLS tests | 1 | **Requires a test/branch Supabase instance separate from production.** Clean execution verified; simulated-JWT denial tests pass (can't be done from a service-role session) |
| ↳ **1C** | Minimal app stub for Vercel Preview | 1 | V2 schema reachable from a preview deploy |
| ↳ **1D** | Production migration window | 1 | V2 schema live on prod; Le Royal reseeded |
| **2** | Data layer + library functions | 2–3 | All `src/lib/*.js` rewritten for V2; smoke-tested |
| **3** | UI rewrite | 3–5 | Full UI works on V2; sidebar restructured; new tabs (X-ray, clinic group, receptionist mgmt) |
| **4** | Onboarding flow rewrite | 1–2 | End-to-end doctor signup, clinic-group create/join, receptionist invite |
| **5** | Remove deprecated features | 1 | Social Pages + all connectors removed; dead code cleaned |
| **6** | Launch prep | 1–2 | Marketing copy refresh, pricing page, docs, Saif onboarded |

### Phase 1 — Schema migration + RLS (detailed)

**Sessions:** 2–3

**Tasks:**
- Write migration SQL in `scripts/v2-platform-migration.sql` ✅ (PR #31)
- **Rename** V1 org columns to `org_id_v1` (and `orgs`→`orgs_v1`) for rollback —
  not dropped; drop the 89 V1 `*_own_org` policies; **retire `current_org_id()`**
- Create new tables: `clinic_groups`, `clinic_memberships`, `receptionist_assignments`, `patient_shares`, `xrays`
- Add new columns: `profiles.tooth_notation`, `profiles.subscription_status`, `profiles.plan_tier`, **`patients.doctor_id`**, `patients.clinic_visible`, `patients.family_group_id`
- Add `doctor_id` to all clinical tables (NOT NULL, FK `RESTRICT`); `appointments`/`treatment_plans` already had it nullable → tightened
- Create 16 indexes (per index strategy section)
- Apply 50 new RLS policies (SELECT + INSERT + UPDATE + DELETE per table)
- Create `can_access_patient()` + `can_write_patient()` helper functions
- Reseed Le Royal under new schema (keep operator `madmaxali`; doctor `alialjobory89` → `role='doctor'`)
- Smoke test via SQL: super-admin queries return all, doctor queries return scoped, RLS denials confirmed (Phase 1B, simulated JWTs)

**Risks:**
- Wrong RLS = data leakage between doctors (HIGH severity — verify exhaustively)
- Wrong RLS = doctors can't see their own data (BLOCKING — verify with simulated JWT)
- Migration mid-run failure = production broken (mitigate: atomic transaction, pre-migration snapshot)

### Phase 2 — Data layer + library functions (detailed)

**Sessions:** 2–3

**Tasks:**
- Rewrite `src/lib/database.js`: patients/appointments queries use doctor_id
- Rewrite `src/lib/dental.js`: dental chart, treatment plans (+ items), prescriptions, notes, documents — all doctor-scoped
- Rewrite `src/lib/profiles.js`: tooth_notation read/write, doctor flag
- Rewrite `src/lib/audit.js`: entity types updated for V2
- New libs:
  - `src/lib/xrays.js` — upload, list, view, link to treatment, batch upload
  - `src/lib/clinic_groups.js` — create, join, invite, share settings
  - `src/lib/receptionist_assignments.js` — hire, set permissions, terminate
  - `src/lib/patient_shares.js` — grant, revoke, list shares
- Update `api/admin.js` (operator endpoints) for V2 schema
- Smoke test each function with happy path + RLS-denied path

### Phase 3 — UI rewrite (detailed)

**Sessions:** 3–5

**Sub-phases:**

**3a. Sidebar + navigation restructure**
- Remove: Inbox (deferred to V2.1 redesign), Social Pages, Integrations (Phase 5 removes officially)
- Restructure: Dashboard, Patients, Calendar, Tasks, Goals, Docs (renamed?), Automations (kept stub), Reports, Finance, Settings
- Settings restructure:
  - Profile (with tooth_notation toggle)
  - Receptionists (manage assignments)
  - Clinic Group (join/create/manage)
  - Billing
  - Notifications

**3b. Patient profile**
- Existing tabs: Overview, Appointments, Payments, Medical History, Dental Chart, Treatment Plan, Prescriptions, Notes, Documents
- NEW tab: **X-rays** (between Dental Chart and Treatment Plan)
- Patient header: add "Shared with..." badge if shared from another doctor
- Patient header: medical alert flags (allergy, conditions) — deferred to V2.1 polish

**3c. Patient list (doctor view)**
- Default: own patients only
- Filter: "Show clinic patients" → adds clinic_visible patients
- Filter: "Show shared with me" → adds patient_shares results
- "+ New patient" sets doctor_id = self automatically

**3d. Patient list (receptionist view)**
- Sees patients across all doctors who hired her
- Group by doctor name
- Cannot create patient if `can_add_patients = false`

**3e. Clinic group dashboard (NEW page)**
- Members list
- Sharing rules (per-member)
- Invite new doctors (generates invite code)
- Leave clinic group

**3f. Receptionist UI**
- Limited dashboard: today's appointments across her assigned doctors
- Patient list grouped by doctor
- Calendar with all assigned doctors' schedules
- Payments tab (add only, not remove)
- No financial reports tab

### Phase 4 — Onboarding flow rewrite (detailed)

**Sessions:** 1–2

**Doctor signup:**
1. Email + password
2. Full name + tooth notation preference (FDI/Palmer)
3. Choose: Solo practice (default) OR "I'll join a clinic" (invite code entry)
4. Lands on empty dashboard, prompts to add first patient

**Clinic group creation (from existing doctor):**
1. Settings → Clinic Group → "Create new clinic group"
2. Name + slug + brand
3. Doctor is auto-set as owner member
4. "Invite other doctors" → generate invite codes

**Receptionist invitation flow:**
1. Doctor: Settings → Receptionists → "Invite receptionist"
2. Enter email + select permissions
3. System sends invite email with unique link
4. Receptionist clicks link → creates account → lands on doctor's dashboard with assigned permissions
5. Doctor can later add more doctors to the same receptionist's assignments (Settings → Receptionists → existing receptionist → "Add another doctor she works for")

**Fix existing pre-onboarding blockers (folded in):**
- Onboarding submit (currently silently fails) — fix as part of V2 rewrite
- Agency "+ Add Organization" button — replaced with "+ Add Clinic Group" operator-side
- TeamTab invite flow 404 — replaced with new invite-by-email flow

### Phase 5 — Remove deprecated features (detailed)

**Session:** 1

**Pages to remove:**
- `src/pages/SocialPagesPage.jsx` (and components)
- Inbox UI (deferred to V2.1 — placeholder page until then)

**Integrations to remove (all connectors):**
- WhatsApp Business (settings + API code)
- Gmail / Google Calendar
- Meta Ads / Facebook Messenger / Instagram DM
- Twilio SMS
- Zapier / Make (Integromat)
- Stripe stubs

**Code cleanup carried from earlier audits:**
- `src/design.js` dead code: `C.sidebar*`, `CAT_COLORS`, `STAGE_COLORS`, `statusBadgeStyle`, dead accent keys
- `src/styles/theme.css` legacy palette (deprecate fully)
- Connector cron jobs in `api/cron/*`
- `vercel.json` cron config entries

**Database cleanup:**
- Drop `agency_settings` if still present
- Drop any tables relating to removed integrations

**Storage buckets:** none affected (current buckets — avatars, documents, x-rays, prescription templates — all stay)

### Phase 6 — Launch prep (detailed)

**Sessions:** 1–2

**Tasks:**
- Marketing site (separate repo) copy refresh: "platform for dental practitioners"
- Pricing page: per-doctor seat tiers
- User documentation: doctor guide, receptionist guide, clinic group guide
- Saif Dental onboarded as first paying clinic group
- Public launch announcement (if applicable)

---

## Breaking Changes Catalog

These will break and require explicit handling during the migration:

1. **Every API call referencing `org_id`** → replaced with `doctor_id` scoping
2. **All RLS policies (every table)** → full rewrite
3. **`profiles.org_id`** → **renamed to `profiles.org_id_v1`** (kept for rollback; FK + `NOT NULL` dropped), not dropped outright
4. **`orgs` table** → **renamed to `orgs_v1`** (kept for rollback); replaced semantically by `clinic_groups`
5. **`api/admin.js` operator endpoints** → rewritten for new schema
6. **Onboarding flow** → entirely rewritten
7. **Impersonation context** → operator now impersonates user (doctor or receptionist), not org
8. **GHL import scripts** → rewritten for V2
9. **Audit log entity types** → updated to V2 entity names
10. **Storage bucket paths** → `{org_id}/...` becomes `{doctor_id}/...` in all buckets (xrays, documents, prescription-templates, avatars)
11. **All connectors** → removed (Phase 5); to be redesigned later under doctor-owned model
12. **Pricing model** → per-org → per-doctor seat (UI + Stripe integration if/when added)
13. **TeamTab** → replaced with Receptionists tab + Clinic Group members
14. **Settings → Clinic** → split into Settings → Profile (doctor) + Settings → Clinic Group (members + sharing) + Settings → Receptionists

---

## Decisions Taken (8 Phase 0 strategic + 1 Phase 1A architectural)

1. **Pricing model:** per-doctor seat with three tiers — **Free** (1 doctor, ~100 patients, basic features), **Pro** (per-doctor monthly, all features), **Clinic** (per-doctor with discount + clinic-group features). Specific prices set in Phase 6; targeting Iraqi market norms.

2. **Le Royal migration:** wipe and restart under V2 schema. Le Royal is test data with no real patients; clean cutover is safer than incremental migration.

3. **Saif onboarding timing:** delay 4–6 weeks until V2 ships. Honest communication; onboard Saif fresh under V2 with GHL contacts migrated cleanly via the rewritten import pipeline.

4. **Solo doctor vs clinic at signup:** always start solo. Clinic group creation/joining is a separate Settings action. Lower signup friction.

5. **Receptionist signup:** invitation-driven. Doctor invites by email, account auto-created via invite link with assigned permissions.

6. **Clinic group sharing granularity:** per-data-type toggles (calendar, patient visibility, full records) AND per-patient `clinic_visible` flag. Defaults privacy-first: calendar ON, records OFF, individual patients opt in to clinic visibility.

7. **Integrations during restructure:** kill ALL connectors temporarily. Re-add later under doctor-owned model (each doctor connects own Gmail, own WhatsApp, etc.).

8. **Brand:** "Velo Dental" stays. Repositioning happens in Phase 6 — from "clinic SaaS" to "platform for dental practitioners."

9. **Operator architecture (Phase 1A):** operators stay a **separate `operators`
   table** detected via the `is_operator()` helper — **not** folded into a
   `profiles.role` value. The V1 design is battle-tested, cleanly preserves the
   `madmaxali` super-admin account through the wipe, and avoids migrating operator
   identity. All super-admin RLS branches call `is_operator()`. (The 8 strategic
   decisions above are unchanged; this one records the architectural call made
   when reality diverged from the Phase 0 sketch.)

---

## Open Questions / Deferred Decisions

Don't block Phase 1 but need resolution before later phases:

- **Pricing exact numbers** (Phase 6)
- **Marketing site copy** (Phase 6)
- **DICOM/CBCT X-ray support** (V2.1)
- **AI-driven X-ray analysis** (V3)
- **Insurance integration** (Iraqi market is cash-pay; revisit only if expanding)
- **Multi-location clinic groups** (one clinic-group with multiple physical locations) (defer until requested)
- **Patient self-service portal** (defer)
- **Mobile native app** (defer; web-responsive sufficient for V2)
- **Lab orders module** (V2.1 or later)
- **Inventory module** (V2.1; current skeleton removed or kept stub in Phase 5)
- **Family grouping UI** (schema ready in `patients.family_group_id`; UI deferred to V2.1)
- **Medical alert flags on patient header** (V2.1)
- **Pre/post photos for cosmetic cases** (V2.1)
- **Recall/recare reminders** (V2.1)
- **Doctor commission/revenue reports per doctor** (V2.0 if low effort, otherwise V2.1)

---

## X-Ray Module Detailed Spec

### Tab placement
Between **Dental Chart** and **Treatment Plan** in patient profile tabs. Clinical flow: assess (chart) → image (X-ray) → plan (treatment).

### Upload flow
1. Doctor clicks "Upload X-ray" in X-rays tab
2. Modal opens with form:
   - **Type** — dropdown: Bitewing / Periapical / Panoramic / Occlusal / CBCT / Other
   - **Date taken** — date picker, defaults to today
   - **Teeth shown** — multi-select, visually linked to FDI chart (click teeth on a mini chart, those numbers selected)
   - **Linked treatment** — optional dropdown of patient's recent treatments
   - **Files** — dropzone, multi-file (batch upload)
   - **Notes** — optional textarea
3. On submit:
   - Upload each file to `patient-xrays/{doctor_id}/{patient_id}/{xray_id}.{ext}`
   - INSERT xrays row(s) — same `batch_id` for batch uploads
   - Generate thumbnail client-side via canvas API
   - Toast on success

### View (grid)
- Thumbnails grouped by date (newest first)
- Filter chips: All / Bitewing / Periapical / Panoramic / Occlusal / CBCT
- Search by date range
- Click thumbnail → opens lightbox

### View (lightbox)
- Full-size image with zoom + pan
- Sidebar: metadata (type, date, teeth, linked treatment, notes)
- Edit button: opens edit modal
- Delete button (doctor only): confirm dialog

### Comparison view (V2.1)
- Select 2–4 X-rays via checkbox in grid
- "Compare" button → side-by-side viewer
- Synchronized pan/zoom
- Useful for before/after, progression tracking

### Permissions
- **Doctor (owner):** full CRUD
- **Receptionist (with `can_view_patients`):** READ only
- **Shared user (via `patient_shares`):** READ; WRITE if `read_only = false`
- **Clinic group member (with `share_full_records`):** READ if patient is `clinic_visible`

---

## Removed Features Catalog (Phase 5)

**Pages:**
- Social Pages (page + all subcomponents)
- Inbox (placeholder until V2.1 redesigns as doctor-doctor messaging)

**Integrations (all):**
- WhatsApp Business
- Gmail / Google Calendar
- Meta Ads / Facebook Messenger / Instagram DM
- Twilio SMS
- Stripe stubs
- Zapier / Make

**Code cleanups:**
- `design.js` dead code: `C.sidebar*`, `CAT_COLORS`, `STAGE_COLORS`, `statusBadgeStyle`, unused accent keys
- `theme.css` legacy palette
- Connector cron jobs (`api/cron/*` related to removed connectors)
- `vercel.json` cron config

**Database:**
- Drop `agency_settings` if still present
- Drop any tables relating to removed integrations

**Storage buckets:** unchanged (avatars, documents, x-rays, prescription-templates all kept)

---

## Test Plan / Validation Strategy

### Phase 1 (schema)
- Manual SQL validation against freshly-seeded Le Royal
- Smoke test: create doctor, create patient, create appointment, all via raw SQL with simulated user JWTs
- **RLS denial verification (critical):**
  - As Dr. A, attempt to SELECT Dr. B's patients → 0 rows
  - As Dr. A, attempt to UPDATE Dr. B's patient → 0 rows affected
  - As Dr. A, attempt to INSERT into Dr. B's appointments → 42501 RLS violation
- Index verification: `EXPLAIN ANALYZE` on common queries

### Phase 2 (data layer)
- Manual function-level testing in Node REPL or Vite dev mode
- Each new lib function tested with happy path + RLS-denial path + edge cases

### Phase 3 (UI)
- E2E smoke per major flow:
  - Doctor signs up → creates patient → books appointment → charts a treatment → uploads X-ray → adds prescription
  - Doctor invites receptionist → receptionist logs in → sees calendar → adds payment
  - Doctor creates clinic group → invites another doctor → shares patient → second doctor sees shared patient
- Vercel Preview deploys for visual review per sub-phase

### Phase 4 (onboarding)
- Walk full doctor signup with fresh email
- Walk receptionist invitation accept
- Walk clinic group create + invite + join

### Pre-launch (Phase 6)
- Cross-browser check (Chrome, Firefox, Safari)
- Mobile-responsive sanity (target: tablet+ since dental clinics use tablets chair-side)
- Performance: first load <3s, navigation <1s on subsequent pages
- Saif Dental onboarding as final integration test

---

## Document Status

| Section | Status |
|---------|--------|
| Reality vs original plan | ✅ Added (1A.5) |
| Executive Summary | ✅ Draft 1 |
| Strategic Shift | ✅ Draft 1 |
| Entity Model | ✅ Realigned to schema (1A.5) |
| RLS Strategy | ✅ Realigned to schema (1A.5) |
| Migration Plan | ✅ Realigned to schema (1A.5) |
| Rollout Phases | ✅ Realigned (1A.5 — 1A/1A.5/1B–1D sub-phases) |
| Breaking Changes | ✅ Realigned (1A.5) |
| Decisions Taken | ✅ +Decision #9 (1A.5) |
| Open Questions | ✅ Draft 1 |
| X-Ray Module | ✅ Draft 1 |
| Removed Features | ✅ Draft 1 |
| Test Plan | ✅ Draft 1 |

**Next action:** Phase 1A (PR #31) and Phase 1A.5 (this PR) are complete. **Phase
1B** is next — it needs a Supabase **test environment** (separate from production)
to apply the migration and run the simulated-JWT RLS denial tests.
