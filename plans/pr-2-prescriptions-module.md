# PR 2 — Prescriptions Module (Path A)

**Branch:** `feat/prescriptions-module` (not yet created)
**Status:** plan
**Date:** 2026-05-16
**Author:** Ali (decisions) + Claude (drafting)

## Goal

Build a complete per-patient prescriptions module on the existing PR #17 template infrastructure:

- New `public.prescriptions` table (parent: header) and `public.prescription_items` table (child: line items, 1:N) with RLS that mirrors PR #17's "same-org read, doctor-self-OR-same-org-owner write" pattern
- Data layer (`createPrescription` with items array, `fetchPrescriptionsForPatient`, `updatePrescription`, `deletePrescription`, `fetchPrescriptionForPrint`) following the established `requireUser → orgId → sanitize → supabase → audit` envelope
- A 4th tab inside `DentalTabs.jsx` — `PrescriptionsTab` — listing past prescriptions, a "New Prescription" modal with dynamic line-item rows (modelled on `NewTreatmentPlanModal`), and a per-row "Print" button
- A print component that fetches the prescription + doctor + patient, retrieves a signed URL for the doctor's prescription-template image (PR #17 infrastructure), and renders an A4 layout with the template as a background and the patient/date/medications overlaid → `window.print()`

This is **PR 1 of the 3-module revival initiative** (Prescriptions → Notes → Documents). After this lands, GHL imports can route to PrescriptionsTab.

**Out of scope for PR 2:**
- Notes module (PR #3)
- Documents module (PR #4)
- X-rays revival (future)
- GHL import pipeline (future — depends on all three modules landing)
- Editing of issued prescriptions older than 24h (treat as immutable once printed — clarify in open decisions)
- Prescription versioning / amendments
- Drug-interaction checks or formulary integration
- Print-history audit table (audit-log entries are sufficient for V1)

## Approved decisions (locked by Ali on 2026-05-16)

1. **Structured line items.** Parent `prescriptions` + child `prescription_items`. 1 prescription = 1 parent + N items. FK with `ON DELETE CASCADE` on the child.
2. **FK linkage scope.** `prescriptions.patient_id` only. No `appointment_id` in V1.
3. **`general_instructions`** lives on the parent, nullable TEXT.
4. **`doctor_id` is required and must reference a profile whose `role = 'doctor'`.** Enforcement strategy chosen below.
5. **`created_by`** audit column on the parent. Nullable FK to `auth.users(id)` with `ON DELETE SET NULL`.
6. **RLS write predicate** mirrors PR #17: `doctor themselves (auth.uid() = doctor_id AND role='doctor') OR same-org owner`. SELECT is permissive (any same-org member).
7. **Child items inherit write/read authority via parent FK** — child RLS policies delegate to the parent row's `org_id` and write-predicate.
8. **Commit boundaries:** plan → schema → data → UI (4 commits, mirrors PR #17).

## Architectural decisions table

| Question | Decision | Why |
|----------|----------|-----|
| RLS write authority (parent + items) | **Codebase convention: same-org membership only** (`org_id = public.current_org_id()`), matching `treatment_plans` / `appointments` / `patients` / `payments` precedent. Doctor-role integrity is enforced via a DB trigger (`enforce_prescription_doctor_role`), not RLS. Compensating defense-in-depth: every write goes through `logAuditEvent` in the data layer. | Schema-wide consistency. Verified during commit 1 execution that no per-tenant table in this schema role-tightens via RLS — every table uses the simple `org_id = current_org_id()` predicate + two policy sets (`_own_org` + `_operator`). Trigger fires only when `doctor_id`/`org_id` change, so general_instructions-only UPDATEs aren't penalized. |
| Why NOT the /plan's original role-tightened RLS? | **Pattern doesn't fit per-tenant tables in this codebase.** | (1) No existing tenant table role-tightens via RLS — `treatment_plans`, `appointments`, `patients`, `payments`, `dental_chart_entries`, `expenses`, `tasks`, `inventory_items`, `forms` all use the same simple `org_id = current_org_id()` shape. (2) PR #17's role-tightening was for `storage.objects` (a system table with no tenant-shaped alternative). (3) Per-tenant tables in this schema rely on UI/data-layer role gates (`EDIT_ROLES` in DentalTabs.jsx) + audit log + trigger-enforced integrity for the same protection envelope. (4) Confirmed during commit 1 execution that `treatment_plan_items` denormalizes `org_id` — `prescription_items` mirrors that, ruling out the /plan's parent-EXISTS items design. |
| `doctor_id` role enforcement (CHECK vs trigger vs RLS) | **Trigger** — `enforce_prescription_doctor_role()` raises if `NEW.doctor_id` doesn't reference a profile with `role='doctor'` AND `org_id = NEW.org_id`. Fires `BEFORE INSERT OR UPDATE OF doctor_id, org_id` (not every UPDATE). | CHECK constraints cannot cross tables. Trigger co-locates the check with the table, is idempotent (`DO $$ pg_trigger IF NOT EXISTS`), and the column-scoped firing (`UPDATE OF doctor_id, org_id`) avoids overhead on general_instructions/issued_at-only UPDATEs. Defends against direct-API insertion bypassing the data layer + future GHL importers that may skip role checks. |
| Data-layer file | **NEW `src/lib/prescriptions.js`** mirroring `src/lib/dental.js` structure | `database.js` already houses 7 unrelated concern-blocks (patients, payments, audit, orgs, profiles, test-limits, prescription-templates) and is approaching unwieldy. Prescriptions is a clean discrete module with 5 helpers. Keeps `database.js` from accreting further. |
| Audit-trail columns on parent | **Add `updated_at timestamptz NULL` (set by data layer on UPDATE) and `updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`.** Relaxed from the original `NOT NULL DEFAULT now()` so a NULL value clearly signals "never updated since creation." | Partial audit trail (who modified, when) without full clone-and-supersede version history. Compliance can demand this later without a schema migration backfill. |
| External-system import columns | **Add `external_id text NULL` and `external_source text NULL` to `prescriptions` only.** Partial unique index on `(external_source, external_id) WHERE external_id IS NOT NULL`. Items do NOT get these in V1. | Cheap to add now (2 nullable columns + 1 partial index), expensive to retrofit once GHL imports start producing rows. Items aren't expected to be referenced individually by external systems in V1 (GHL prescriptions are header-level imports); revisit in V2 if that assumption breaks. |
| Print overlay positioning | **Percentage-based positioning hardcoded for Dr. Saif's template geometry** (V1 reference template). Saif's template: header ~22% of page height, footer ~17%. Overlay places: patient name + date at ~24% from top, medications list starting at ~30%, general instructions at ~70%. Exact percentages tuned visually during Commit 3 dev. | mm-based padding would have collided with Dr. Saif's heavy blue-wave header. Per-template coordinate maps (each doctor's template defines its own offsets) are V2 — premature when V1 serves a single clinic. |
| `prescription.print` audit event timing | **Fire on the user clicking the Print button inside the print preview modal** (the moment that triggers `window.print()`), NOT on `fetchPrescriptionForPrint` data load. Implemented via a dedicated helper `logPrescriptionPrint(id)` called from the modal's onClick. | The fetch is just data loading; the button click is unambiguous user intent. Avoids logging cancelled-print noise (user opens preview, decides not to print). |
| Immutability window | **None in V1 — edit-in-place.** Anyone with write authority can edit forever. The new `updated_at` / `updated_by` columns preserve who-last-changed-when for review without full versioning. Clone-and-supersede deferred to V2 if compliance demands it. | Simpler than versioning. The partial audit trail meets a "lightweight clinical-history preservation" bar without immutable-record complexity. |
| `prescription_items.org_id` (denormalize for RLS perf?) | **Do not denormalize.** Items get `org_id` access via the parent FK lookup in the policy. | Mirrors the treatment_plan_items convention in the existing dental schema (per pre-flight finding). Avoids two-source-of-truth drift. Single-row lookups via the FK are fast. |
| Atomicity of parent + items insert | **Best-effort sequential write** in a try/catch — insert parent, then items; on items-failure attempt to delete the orphan parent. Matches `createTreatmentPlan` pattern. | Building a `SECURITY DEFINER` RPC for transactional insert is a meaningful surface-area expansion and a precedent not yet set in this codebase. The orphan-cleanup is good enough for V1; partial writes are recoverable (parent shows in list with zero rows, owner can delete + retry). |
| `issued_at` field | **`timestamptz NOT NULL DEFAULT now()`** | The prescription's clinical date (separate from `created_at` which is when it was entered into Velo). Defaults to "now" for the common case; entry form exposes a date picker for backdated entries. |
| `general_instructions` field | **TEXT nullable, sanitized via `sanitizeNotes`** (1000 char cap from convention) | Long-form free text; same treatment as `treatment_plans.notes`. |
| Per-item free-text fields | `drug_name TEXT NOT NULL` (200, `sanitizeText`), `dose TEXT NULL` (64, `sanitizeText`), `frequency TEXT NULL` (64, `sanitizeText`), `duration TEXT NULL` (64, `sanitizeText`), `route TEXT NULL` (32, `sanitizeText`), `instructions TEXT NULL` (500, `sanitizeNotes`) | Tight caps prevent oversized prints overflowing the template. `drug_name` is the only required item field. |
| `sequence` field on items | `INTEGER NOT NULL DEFAULT 0` | Preserves the order in which the doctor entered them; the form sets sequence = index. Mirrors `treatment_plan_items`. |
| `doctor_id` ON DELETE behavior | `ON DELETE RESTRICT` | A doctor with issued prescriptions cannot be deleted from `profiles` until those prescriptions are reassigned or removed. Protects against accidental orphaning of clinical records. Operator path can override via service-role if needed. |
| `patient_id` ON DELETE behavior | `ON DELETE CASCADE` | If a patient is deleted (rare, mostly test orgs), prescriptions should follow — consistent with how dental_chart_entries / treatment_plans behave today. |
| Print component delivery | **Inline render via React + `window.print()`** — no PDF library | The doctor's PNG/JPG template IS the print canvas; we overlay HTML on top via absolute positioning inside a `@media print` stylesheet. No PDF library, no headless render. Zero added dependencies. |
| Print signed-URL TTL | **60s** (reuse `getPrescriptionTemplateSignedUrl`) | Same as PR #17 preview. Print dialog opens within ms; 60s is generous. |
| Template-missing fallback | If `doctor.prescription_template_url IS NULL`, **disable the per-row Print button** with a tooltip ("Doctor has not uploaded a prescription template. Settings → Doctors → [Doctor] → Prescription Template."). | A blank A4 with text-only fields is technically possible but defeats the per-doctor-pad design. Better UX: hard-block until template exists. |
| RTL/locale | English + Arabic strings inline in the components (mirrors all other dental tabs). Date formatting via `Intl.DateTimeFormat` with `ar-IQ-u-ca-gregory` (Gregorian dates rendered in Arabic numerals). | Consistent with `DentalTabs.jsx` patterns. |
| Audit events | `prescription.create`, `prescription.update`, `prescription.delete`, `prescription.print` (logged on print-button click before `window.print()`) | Print audit is a defensive-medicine concern — clinic owners may need to know which prescriptions were physically printed. Lightweight payload (no PHI in the audit row beyond `entity_id`). |

## Pre-flight findings

### Confirmed from reads (2026-05-16)

| Finding | Source | Implication |
|---------|--------|-------------|
| `requireUser` + `getCurrentOrgId` envelope is the canonical CRUD pattern | `src/lib/database.js:68-165` (Patient helpers) | New `prescriptions.js` mirrors this exactly. |
| `logAuditEvent({ orgId, action, entityType, entityId, payload })` throws on failure — silent audit gaps unacceptable | `src/lib/database.js:101-106`, PR #17 plan §"Pre-flight findings" | All 4 mutation helpers (create/update/delete + print) wire audit. |
| `sanitizeText`, `sanitizeNotes`, `sanitizeName` are the standard sanitizers; `toSafeNumber` for numerics | `src/lib/database.js:20-27` import block | All free-text fields sanitized before insert/update. |
| Sub-tab registration in `DentalTabs.jsx` is just a named export — App.jsx wires the tab bar | `src/components/DentalTabs.jsx` exports `MedicalHistoryTab`, `DentalChartTab`, `TreatmentPlanTab` as named exports | Add `export function PrescriptionsTab` in the same file; wiring in App.jsx (tab list, route) is a one-liner per location. |
| `NewTreatmentPlanModal` is the structural template for the entry form | `src/components/DentalTabs.jsx:853-1037` | Dynamic line-item rows + add/remove + final summary card. Reuse the layout idioms verbatim where possible. |
| PR #17 prescription-template helpers already live in `database.js` (NOT `dental.js`) | `src/lib/database.js:560-663` | Argument FOR putting `prescriptions.js` separate: by the time PR #2 lands, `database.js` will house ~700+ lines across 7 unrelated concerns. Recommend a clean split (flagged as open decision). |
| `formatMoney(amount_minor, currency)` is the money-display convention | `src/components/DentalTabs.jsx:33` import + L713 usage | Prescriptions don't carry money (out of scope), so this is irrelevant for V1, but worth noting if a future "private prescription with fees" feature comes back into scope. |
| `listDoctorsInOrg()` is the doctor-selector convention but **only selects `id, full_name, role`** (known bug from prior session — `avatar_url`, `locale`, `prescription_template_url` NOT widened) | Memory note from 2026-05-15 | The entry form's doctor dropdown is fine with this minimal SELECT. The print component needs `prescription_template_url` separately via `fetchPrescriptionTemplatePath(doctorId)`. **Do not depend on `listDoctorsInOrg` returning the template URL.** |

### Resolved during commit 1 execution (2026-05-16)

| Item | Resolution |
|------|------------|
| Exact schema-file location | **`src/lib/schema.sql`** confirmed. Appended self-contained `prescriptions / prescription_items` section at L1549–L1820 (after PR #17's storage policies, mirroring the "append complete section at end" pattern PR #17 established). |
| Policy-naming convention for table policies | **`<table>_<op>_<scope>`** — e.g. `prescriptions_select_own_org`, `prescriptions_select_operator`. Mirrors `treatment_plans_select_own_org` etc. Two policy sets per table (8 each, 16 total). |
| Whether `treatment_plan_items` denormalizes `org_id` | **Confirmed denormalized org_id** at `schema.sql:250`. `prescription_items` mirrors that pattern — has its own `org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE` column and uses the simple `org_id = public.current_org_id()` RLS predicate (NOT the parent-EXISTS pattern from the original /plan draft). |

## Files touched

| File | Operation | Notes |
|------|-----------|-------|
| `plans/pr-2-prescriptions-module.md` | New | This file |
| `src/lib/schema.sql` | Edit | Append `prescriptions` + `prescription_items` table definitions, indexes, and RLS policies. Canonical schema record. |
| `scripts/prescriptions-tables.sql` | New | Standalone re-runnable SQL for Ali to paste into Supabase SQL editor. Idempotent DO-block wrappers for policies. |
| `src/lib/prescriptions.js` | New | 5 CRUD helpers + one print-helper, all following the standard envelope. (Pending confirmation — see open decisions; fallback location is `src/lib/database.js` if Ali prefers no new module file.) |
| `src/components/DentalTabs.jsx` | Edit | Append `PrescriptionsTab` named export + `NewPrescriptionModal` helper + `PrescriptionPrintView` component. Roughly +400 LOC. |
| `src/App.jsx` | Edit | Register the new tab in the patient-profile tab-bar configuration. Locate via search; expected to be a 2–3 line change. |
| `src/translations.js` | Edit (optional) | If shared strings are added — most strings can be inlined in DentalTabs.jsx like the others, but section labels touched by App.jsx may need translations entries. |

## Migration SQL

> **Updated during commit 1 execution (2026-05-16):** RLS uses codebase convention (helper functions + `_own_org` / `_operator` policy sets), NOT the originally-sketched role-tightened pattern. `prescription_items` denormalizes `org_id` to match `treatment_plan_items` precedent. Doctor-role integrity moves to a dedicated trigger (Part 5).

### Part 1 — `prescriptions` parent table

```sql
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  general_instructions  text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Partial audit trail: NULL = never updated since creation.
  updated_at            timestamptz,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- External-system import idempotency (e.g. GHL). Both NULL for native creates.
  external_id           text,
  external_source       text
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at
  ON public.prescriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_org_patient_issued
  ON public.prescriptions (org_id, patient_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor
  ON public.prescriptions (doctor_id);

-- Partial unique: enforces (external_source, external_id) uniqueness only
-- when external_id IS NOT NULL. Native creates (NULL pair) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_external_uniq
  ON public.prescriptions (external_source, external_id)
  WHERE external_id IS NOT NULL;

-- updated_at maintenance — defense-in-depth alongside the data layer.
DROP TRIGGER IF EXISTS prescriptions_set_updated_at ON public.prescriptions;
CREATE TRIGGER prescriptions_set_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
```

### Part 2 — `prescription_items` child table

```sql
-- Denormalizes org_id (matches treatment_plan_items precedent, confirmed
-- during commit 1 execution at schema.sql:250). Cascade-deleted when parent
-- is removed. Item columns per commit-1 spec: dosage/sort_order naming, no
-- 'route' field (collapsed into 'instructions' free-text).
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  drug_name       text NOT NULL,
  dosage          text,
  frequency       text,
  duration        text,
  instructions    text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_items_created_at
  ON public.prescription_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription
  ON public.prescription_items (prescription_id, sort_order);

ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
```

### Part 3 — RLS policies on `prescriptions` (codebase convention, 8 policies)

Two policy sets per CRUD op: `_own_org` for clinic users + `_operator` for super-admin bypass. Both wrap in idempotent DO blocks against `pg_policies`.

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_own_org ON public.prescriptions
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_insert_own_org ON public.prescriptions
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_update_own_org ON public.prescriptions
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_delete_own_org ON public.prescriptions
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

-- Operator (super-admin) bypass — 4 mirror policies. Predicate is just
-- public.is_operator() — no org_id constraint, super-admins cross orgs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_operator ON public.prescriptions
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;
-- (insert_operator / update_operator / delete_operator follow the same shape;
-- 8 policies total per table.)
```

### Part 4 — RLS policies on `prescription_items` (codebase convention, 8 policies)

Same pattern — `prescription_items` has its own denormalized `org_id`, so the predicates are identical in shape to the parent's.

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_select_own_org ON public.prescription_items
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;
-- (insert_own_org / update_own_org / delete_own_org + 4 operator mirrors
-- follow the identical shape to the parent; 16 policies total across the
-- two tables. Full SQL in src/lib/schema.sql L1645-1786 and
-- scripts/prescriptions-migration.sql.)
```

### Part 5 — Trigger: `doctor_id` semantic integrity

RLS only enforces tenancy (`org_id = current_org_id()`). The clinical-safety requirement "`doctor_id` must reference a profile whose `role = 'doctor'` in the same org" needs cross-row checks against `profiles`. The codebase pattern (per `enforce_profile_immutable_fields` at `schema.sql:522`) is to use a trigger for cross-table integrity.

```sql
CREATE OR REPLACE FUNCTION public.enforce_prescription_doctor_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.doctor_id
      AND role = 'doctor'
      AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'doctor_id must reference a profile with role=''doctor'' in the same org (got doctor_id=%, org_id=%)', NEW.doctor_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prescriptions_enforce_doctor_role'
      AND tgrelid = 'public.prescriptions'::regclass
  ) THEN
    CREATE TRIGGER prescriptions_enforce_doctor_role
      BEFORE INSERT OR UPDATE OF doctor_id, org_id ON public.prescriptions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_prescription_doctor_role();
  END IF;
END $$;
```

**Why `UPDATE OF doctor_id, org_id` and not plain `UPDATE`:** the trigger only needs to fire when the columns it validates change. Updates to `general_instructions`, `issued_at`, `updated_by`, etc. don't change the doctor reference, so the trigger is skipped — no profiles lookup per update.

**Failure mode:** trigger raises a plain `RAISE EXCEPTION`. Supabase surfaces this as an error on the failed insert/update. The data layer (`createPrescription` / `updatePrescription`) should catch and surface a user-friendly toast.

**Validation gaps still acknowledged:**

- `created_by` / `updated_by` cannot be trigger-enforced to equal `auth.uid()` without another trigger. Data layer is the gate (mirrors `payments.recorded_by` pattern).
- `issued_at` may be backdated by users with write authority. Intentional — clinics enter old prescriptions retroactively. Audit-log captures the actual write timestamp via `created_at` and the audit event's own timestamp.
- Items have no equivalent trigger — `prescription_items` has no `doctor_id` (the doctor is on the parent). FK + RLS + cascade are sufficient.

## Data layer signatures

Location: **`src/lib/prescriptions.js`** (locked — decision 1). 6 helpers total: `createPrescription`, `fetchPrescriptionsForPatient`, `updatePrescription`, `deletePrescription`, `fetchPrescriptionForPrint`, `logPrescriptionPrint`. All follow the standard envelope.

```js
import { supabase } from './supabase'
import { sanitizeText, sanitizeNotes } from './sanitize'
import { requireUser, getCurrentOrgId } from './auth_session'
import { logAuditEvent } from './audit'

// Shape returned to the UI (camelCase). Same convention as mapPatient/mapPayment.
function mapPrescription(row) {
  if (!row) return null
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    issuedAt: row.issued_at,
    generalInstructions: row.general_instructions || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,   // null = never modified since creation
    updatedBy: row.updated_by || null,
    externalId: row.external_id || null,         // GHL / external import id
    externalSource: row.external_source || null, // e.g. 'ghl'
    items: (row.prescription_items || []).map(mapPrescriptionItem),
    // Joined data when fetched-for-print:
    doctor: row.doctor || null,   // { id, full_name, prescription_template_url } when embedded
    patient: row.patient || null, // { id, full_name, dob, gender } when embedded
  }
}

function mapPrescriptionItem(row) {
  if (!row) return null
  return {
    id: row.id,
    prescriptionId: row.prescription_id,
    drugName: row.drug_name,
    dose: row.dose || '',
    frequency: row.frequency || '',
    duration: row.duration || '',
    route: row.route || '',
    instructions: row.instructions || '',
    sequence: row.sequence ?? 0,
    createdAt: row.created_at,
  }
}

function sanitizeItem(it) {
  return {
    drug_name:    sanitizeText(it.drug_name || it.drugName || '', 200),
    dose:         it.dose         ? sanitizeText(it.dose, 64)         : null,
    frequency:    it.frequency    ? sanitizeText(it.frequency, 64)    : null,
    duration:     it.duration     ? sanitizeText(it.duration, 64)     : null,
    route:        it.route        ? sanitizeText(it.route, 32)        : null,
    instructions: it.instructions ? sanitizeNotes(it.instructions)    : null,
  }
}

// ─── createPrescription ─────────────────────────────────────────────────────
// Inserts parent + N items. Best-effort atomicity: if items fail, deletes the
// orphan parent. RLS gates write authority (doctor-self OR same-org owner).
export async function createPrescription(patientId, payload) {
  if (!patientId) throw new Error('createPrescription: patientId is required')
  if (!payload?.doctor_id && !payload?.doctorId) {
    throw new Error('createPrescription: doctor_id is required')
  }
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = (await supabase.auth.getUser()).data.user?.id

  const items = Array.isArray(payload.items) ? payload.items : []
  const cleanItems = items
    .filter(it => (it.drug_name || it.drugName || '').trim())
    .map((it, idx) => ({ ...sanitizeItem(it), sequence: idx }))

  if (cleanItems.length === 0) {
    throw new Error('createPrescription: at least one item with drug_name is required')
  }

  const parentInsert = {
    org_id: orgId,
    patient_id: patientId,
    doctor_id: payload.doctor_id || payload.doctorId,
    issued_at: payload.issued_at || payload.issuedAt || new Date().toISOString(),
    general_instructions: payload.general_instructions || payload.generalInstructions
      ? sanitizeNotes(payload.general_instructions || payload.generalInstructions)
      : null,
    created_by: userId || null,
  }

  const { data: parent, error: pErr } = await supabase
    .from('prescriptions')
    .insert(parentInsert)
    .select()
    .single()
  if (pErr) throw pErr

  const itemsInsert = cleanItems.map(it => ({ ...it, prescription_id: parent.id }))
  const { error: iErr } = await supabase
    .from('prescription_items')
    .insert(itemsInsert)

  if (iErr) {
    // Best-effort orphan cleanup; if this fails too, log and continue —
    // RLS may have torn down access mid-flight (rare, recoverable).
    try {
      await supabase.from('prescriptions').delete().eq('id', parent.id).eq('org_id', orgId)
    } catch (cleanupErr) {
      console.error('[createPrescription] orphan-cleanup failed:', cleanupErr)
    }
    throw iErr
  }

  await logAuditEvent({
    orgId,
    action: 'prescription.create',
    entityType: 'prescription',
    entityId: parent.id,
    payload: { item_count: cleanItems.length, doctor_id: parentInsert.doctor_id },
  })

  // Re-fetch with items embedded for the optimistic UI update.
  const { data: full, error: fErr } = await supabase
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .eq('id', parent.id)
    .single()
  if (fErr) throw fErr
  return mapPrescription(full)
}

// ─── fetchPrescriptionsForPatient ──────────────────────────────────────────
// Returns prescriptions DESC by issued_at, with items + doctor embedded.
export async function fetchPrescriptionsForPatient(patientId) {
  if (!patientId) throw new Error('fetchPrescriptionsForPatient: patientId is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_items ( * ),
      doctor:doctor_id ( id, full_name )
    `)
    .eq('org_id', orgId)
    .eq('patient_id', patientId)
    .order('issued_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapPrescription)
}

// ─── updatePrescription ────────────────────────────────────────────────────
// Updates parent header fields. Items are managed via a wholesale replace:
// if `items` is present in the patch, deletes all current items and re-inserts.
// This avoids per-item diff logic for V1; trade-off is non-atomic write.
export async function updatePrescription(id, patch) {
  if (!id) throw new Error('updatePrescription: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  const userId = (await supabase.auth.getUser()).data.user?.id

  const parentPatch = {}
  if (patch.doctor_id !== undefined || patch.doctorId !== undefined) {
    parentPatch.doctor_id = patch.doctor_id ?? patch.doctorId
  }
  if (patch.issued_at !== undefined || patch.issuedAt !== undefined) {
    parentPatch.issued_at = patch.issued_at ?? patch.issuedAt
  }
  if (patch.general_instructions !== undefined || patch.generalInstructions !== undefined) {
    const v = patch.general_instructions ?? patch.generalInstructions
    parentPatch.general_instructions = v ? sanitizeNotes(v) : null
  }
  // Partial audit trail: every UPDATE captures who + when, regardless of fields.
  parentPatch.updated_at = new Date().toISOString()
  parentPatch.updated_by = userId || null

  const { error: uErr } = await supabase
    .from('prescriptions')
    .update(parentPatch)
    .eq('id', id)
    .eq('org_id', orgId)
  if (uErr) throw uErr

  // Wholesale item replace if items provided.
  if (Array.isArray(patch.items)) {
    const cleanItems = patch.items
      .filter(it => (it.drug_name || it.drugName || '').trim())
      .map((it, idx) => ({ ...sanitizeItem(it), sequence: idx, prescription_id: id }))

    const { error: dErr } = await supabase
      .from('prescription_items').delete().eq('prescription_id', id)
    if (dErr) throw dErr

    if (cleanItems.length > 0) {
      const { error: iErr } = await supabase
        .from('prescription_items').insert(cleanItems)
      if (iErr) throw iErr
    }
  }

  await logAuditEvent({
    orgId,
    action: 'prescription.update',
    entityType: 'prescription',
    entityId: id,
    payload: { fields: Object.keys(parentPatch), items_replaced: Array.isArray(patch.items) },
  })

  // Re-fetch the full row.
  const { data, error: fErr } = await supabase
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .eq('id', id)
    .single()
  if (fErr) throw fErr
  return mapPrescription(data)
}

// ─── deletePrescription ────────────────────────────────────────────────────
// Cascade deletes child items via FK ON DELETE CASCADE.
export async function deletePrescription(id) {
  if (!id) throw new Error('deletePrescription: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { error } = await supabase
    .from('prescriptions')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error

  await logAuditEvent({
    orgId,
    action: 'prescription.delete',
    entityType: 'prescription',
    entityId: id,
  })
}

// ─── fetchPrescriptionForPrint ─────────────────────────────────────────────
// Single-shot fetch for the print component. Embeds doctor (incl. template
// path) + patient. The signed URL for the template is a separate call by the
// caller (getPrescriptionTemplateSignedUrl) so the URL can be regenerated on
// retry without re-hitting this query.
// NOTE: Does NOT log a print audit event — the fetch happens when the print
// preview modal opens, which is not yet a print-intent signal. The audit
// event fires from logPrescriptionPrint() below, called by the modal's
// "Print" button onClick (the unambiguous user intent).
export async function fetchPrescriptionForPrint(id) {
  if (!id) throw new Error('fetchPrescriptionForPrint: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_items ( * ),
      doctor:doctor_id ( id, full_name, prescription_template_url ),
      patient:patient_id ( id, full_name, dob, gender )
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()
  if (error) throw error

  // Sort items by sequence for stable rendering.
  if (Array.isArray(data?.prescription_items)) {
    data.prescription_items.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  }
  return mapPrescription(data)
}

// ─── logPrescriptionPrint ──────────────────────────────────────────────────
// Called by the print preview modal's "Print" button at the moment
// window.print() is invoked. Separating this from fetchPrescriptionForPrint
// keeps the audit event tied to actual user intent rather than passive
// data loading. Idempotent in the sense that repeated print clicks log
// repeated events — intentional, since each click IS a separate print.
export async function logPrescriptionPrint(id) {
  if (!id) throw new Error('logPrescriptionPrint: id is required')
  await requireUser()
  const orgId = await getCurrentOrgId()
  await logAuditEvent({
    orgId,
    action: 'prescription.print',
    entityType: 'prescription',
    entityId: id,
  })
}
```

## PrescriptionsTab UI sketch (text-only)

Mounted as a 4th tab in `DentalTabs.jsx`. Wired into App.jsx alongside Medical / Chart / Treatment.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [ Medical ] [ Chart ] [ Plan ] [ Prescriptions ]                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Prescriptions                                       [ + New Rx ]    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Dr. Sara Hassan · 2026-05-12 · 3 items                         │  │
│  │ ─────────────────────────────────────────────────────────      │  │
│  │ Amoxicillin 500mg · TID · 7 days                               │  │
│  │ Ibuprofen 400mg · PRN · for pain                               │  │
│  │ Chlorhexidine 0.12% · rinse BID · 14 days                      │  │
│  │ ─────────────────────────────────────────────────────────      │  │
│  │ Take with food.                            [ Print ]  [ ⋯ ]    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Dr. Sara Hassan · 2026-04-30 · 1 item                          │  │
│  │ ─────────────────────────────────────────────────────────      │  │
│  │ Paracetamol 500mg · QID · 5 days                               │  │
│  │                                            [ Print ]  [ ⋯ ]    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Print button states:**
- Doctor has template uploaded → enabled, primary color
- Doctor has no template → disabled, tooltip ("Doctor has not uploaded a prescription template. Settings → Doctors → [Dr. Name] → Prescription Template.")

**Overflow menu `[ ⋯ ]` (only for owner OR the issuing doctor):**
- Edit
- Delete (with confirm modal)

**Empty state:** "No prescriptions yet" centered card, same idiom as `TreatmentPlanTab`.

**Load + reload pattern:** `useCallback` `reload`, `useEffect(() => reload(), [reload])`, identical to `TreatmentPlanTab`.

## Entry form structure (text-only)

Modeled on `NewTreatmentPlanModal`. Modal width 720px.

```
┌──────────────────────────────────────────────────────────────────────┐
│  New Prescription                                                    │
│                                                                      │
│  ┌────────────────────────────┬──────────────────────────────────┐   │
│  │  Doctor                    │  Date                            │   │
│  │  [ Dr. Sara Hassan    ▾ ]  │  [ 2026-05-16            ]       │   │
│  └────────────────────────────┴──────────────────────────────────┘   │
│                                                                      │
│  Medications                                                         │
│  ┌────────────┬───────┬───────────┬──────────┬──────┬──────────────┐ │
│  │ Drug       │ Dose  │ Frequency │ Duration │ Route│ Instructions │ │
│  ├────────────┼───────┼───────────┼──────────┼──────┼──────────────┤ │
│  │ Amox..     │ 500mg │ TID       │ 7 days   │ Oral │ With food  ✗ │ │
│  │ Ibu..      │ 400mg │ PRN       │ —        │ Oral │ For pain   ✗ │ │
│  └────────────┴───────┴───────────┴──────────┴──────┴──────────────┘ │
│  [ + Add row ]                                                       │
│                                                                      │
│  General instructions                                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Avoid alcohol. Complete the full antibiotic course.            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                       [ Cancel ]  [ Save Rx ]        │
└──────────────────────────────────────────────────────────────────────┘
```

**Field validation (client-side):**
- At least one row must have `drug_name` non-empty (server-side empty-row filter in `createPrescription` removes blanks; UI rejects all-blank submission with a toast)
- Date defaults to today; user can backdate
- Doctor selector pre-populated from `listDoctorsInOrg()`, filtered to `role === 'doctor'` (defensive — the function already excludes non-doctors but the schema doesn't formally guarantee it)

**Edit form:** same modal, pre-populated, calls `updatePrescription` instead of `createPrescription`.

## Print component sketch

A separate React component `PrescriptionPrintView` rendered into a print-only route or a hidden div toggled by the print button. The simplest implementation: render in-place under a top-level `display: none` until print intent, then `useEffect` toggles to a `position: fixed; inset: 0; background: white;` overlay and calls `window.print()`.

**Render structure (A4 portrait, ≈210×297mm, 96dpi → 794×1123px logical):**

```
┌─────────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════════╗  │  ← absolute layer 0:
│  ║                                                           ║  │     <img src={signedUrl}>
│  ║         [ Doctor's prescription template image ]          ║  │     (the doctor's PNG/JPG
│  ║              (clinic logo, doctor name, header,           ║  │      filling the whole A4)
│  ║               license info, footer — pre-printed)         ║  │
│  ║                                                           ║  │
│  ║                                                           ║  │
│  ║  Patient: [Patient Name]              Date: 2026-05-16    ║  │  ← absolute layer 1:
│  ║                                                           ║  │     HTML overlay positioned
│  ║                                                           ║  │     with coordinates chosen
│  ║  Rx                                                       ║  │     to clear the template's
│  ║  1. Amoxicillin 500mg                                     ║  │     header/footer regions
│  ║     TID × 7 days · Oral · With food                       ║  │
│  ║                                                           ║  │
│  ║  2. Ibuprofen 400mg                                       ║  │
│  ║     PRN for pain · Oral                                   ║  │
│  ║                                                           ║  │
│  ║  3. Chlorhexidine 0.12%                                   ║  │
│  ║     Rinse BID × 14 days · Oral                            ║  │
│  ║                                                           ║  │
│  ║                                                           ║  │
│  ║  General: Avoid alcohol. Complete full antibiotic course. ║  │
│  ║                                                           ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
└─────────────────────────────────────────────────────────────────┘
```

**Positioning approach — percentage-based, hardcoded for Dr. Saif's template (decision 2):**

Dr. Saif's prescription template (the V1 reference) has a heavy blue-wave header occupying ~22% of page height and a footer occupying ~17%. mm-based padding would either overlap the header or waste vertical real estate. Solution: place overlay regions as percentage offsets from the top.

| Region | Top offset (%) | Notes |
|--------|----------------|-------|
| Patient name + date row | ~24% | Just below the header band; tuned visually during Commit 3 dev |
| Medications list (start) | ~30% | Wraps naturally; will scroll into the footer if list gets long — V1 accepts; long-prescription pagination is V2 |
| General instructions block | ~70% | Sits above the footer's ~83% boundary |

Horizontal padding stays mm-based (16mm L/R) since the template's left/right safe area is uniform.

**Critical CSS:**

```css
@media print {
  @page { size: A4 portrait; margin: 0; }
  body * { visibility: hidden; }
  .rx-print, .rx-print * { visibility: visible; }
  .rx-print { position: fixed; inset: 0; width: 210mm; height: 297mm; }
  .rx-print__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .rx-print__patient    { position: absolute; top: 24%; left: 16mm; right: 16mm; }
  .rx-print__meds       { position: absolute; top: 30%; left: 16mm; right: 16mm; bottom: 30%; overflow: hidden; }
  .rx-print__general    { position: absolute; top: 70%; left: 16mm; right: 16mm; }
}
```

**V2 future work (documented, not in V1 scope):** per-template coordinate configuration — each doctor's template would define its own offsets (e.g. a JSON blob on `profiles` like `prescription_template_layout`), so multiple clinics with different template geometries can co-exist. V1 ships single-clinic with hardcoded values for Dr. Saif.

**Flow:**
1. User clicks the "Print" button on a row in the PrescriptionsTab list → opens print preview modal
2. `fetchPrescriptionForPrint(prescriptionId)` loads data (no audit event yet)
3. `getPrescriptionTemplateSignedUrl(doctor.prescription_template_url)` → 60s signed URL
4. Mount `<PrescriptionPrintView />` modal showing the rendered A4 preview (background image + overlay)
5. User reviews the preview and clicks the modal's **"Print"** button:
   - a. `logPrescriptionPrint(prescriptionId)` fires the `prescription.print` audit event (the unambiguous intent)
   - b. `window.print()` opens the browser print dialog
6. After print dialog closes (`afterprint` event), unmount the print view. If the user cancels the dialog, no rollback needed — audit was for the intent, which still happened.

**Note on the two-button model:** the row's "Print" button opens the preview; the modal's "Print" button does the audit + window.print(). This gives a sanity-check moment (catches "wrong patient row" mistakes) and aligns the audit with deliberate user intent.

**RTL:** if `lang === 'ar'`, set `dir="rtl"` on the overlay container and right-align all text. Date format `ar-IQ-u-ca-gregory`.

## Dry-run plan

`prescriptions` and `prescription_items` are NEW tables (zero existing rows). Lower-risk than the `profiles` ALTER in PR #17, but still treat with full ceremony per CLAUDE.md (multi-tenant, live patient data being referenced via FK).

### Pre-flight checks (run before any execution)

```sql
-- 1. Tables don't already exist (re-run safety)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('prescriptions', 'prescription_items');
-- Expect: 0 rows

-- 2. Policies don't already exist
SELECT policyname FROM pg_policies
WHERE schemaname = 'public'
  AND (policyname LIKE 'prescriptions_%' OR policyname LIKE 'prescription_items_%');
-- Expect: 0 rows

-- 3. Confirm doctor profiles exist in the target org (sanity check for the test phase)
SELECT id, full_name FROM profiles WHERE role = 'doctor' AND org_id = '<target-org>';
-- Expect: ≥1 row
```

### Test on a dev/branch copy first

1. Apply `scripts/prescriptions-tables.sql` on the dev branch copy (or a fresh Supabase project clone)
2. Test from multiple identities:

| Identity | Action | Expected |
|----------|--------|----------|
| Doctor (`role=doctor`) in org A | INSERT prescription where `doctor_id = self.id` | ✅ success |
| Doctor in org A | INSERT prescription where `doctor_id = other_doctor_in_org_A.id` | ❌ RLS denial (self-write branch fails because doctor_id ≠ auth.uid(); owner branch fails because role ≠ owner) |
| Owner in org A | INSERT prescription where `doctor_id` references a doctor in org A | ✅ success |
| Owner in org A | INSERT prescription where `doctor_id` references a receptionist in org A | ❌ RLS denial (doctor-role assertion in WITH CHECK fails) |
| Owner in org A | INSERT prescription where `doctor_id` references a doctor in org B | ❌ RLS denial (org_id assertion in doctor-role check fails) |
| Receptionist in org A | INSERT prescription where `doctor_id = doctor_in_org_A.id` | ❌ RLS denial (neither doctor-self nor owner branch) |
| Doctor in org A | SELECT all prescriptions for patient in org A | ✅ returns prescriptions |
| Doctor in org A | SELECT prescriptions for patient in org B | ❌ returns 0 rows (RLS filters out) |
| Doctor in org A | INSERT prescription_items linked to a prescription in org A authored by self | ✅ success |
| Doctor in org A | INSERT prescription_items linked to a prescription in org B | ❌ RLS denial (parent EXISTS fails) |
| Doctor in org A | DELETE prescription authored by another doctor in org A (not owner) | ❌ RLS denial |
| Owner in org A | DELETE prescription authored by any doctor in org A | ✅ cascade-deletes items |
| Doctor in org A | UPDATE own prescription, changing `doctor_id` to a non-doctor profile | ❌ RLS denial (WITH CHECK doctor-role assertion fails) |

3. UI smoke test on dev branch copy: create → list → edit → print → delete cycle, confirming audit log gets 4 entries (`prescription.create`, `prescription.update`, `prescription.print`, `prescription.delete`).

4. Print verification: upload a test PNG template via PR #17 UI, then print a test prescription. Inspect rendered output in browser print preview. Tune overlay padding if header/footer collisions.

### Rollback strategy

```sql
-- Drop policies first (children before parent for clarity, though order
-- doesn't matter for policies)
DROP POLICY IF EXISTS "prescription_items_delete" ON public.prescription_items;
DROP POLICY IF EXISTS "prescription_items_update" ON public.prescription_items;
DROP POLICY IF EXISTS "prescription_items_insert" ON public.prescription_items;
DROP POLICY IF EXISTS "prescription_items_select" ON public.prescription_items;

DROP POLICY IF EXISTS "prescriptions_delete" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_update" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_insert" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_select" ON public.prescriptions;

-- Drop tables (cascade handles indexes + child)
DROP TABLE IF EXISTS public.prescription_items;
DROP TABLE IF EXISTS public.prescriptions;
```

Rollback is safe: the tables are new, no other queries reference them yet, and the storage bucket from PR #17 is independent (it survives).

### Risks acknowledged

- **Non-atomic createPrescription:** parent insert + items insert in two round-trips. Orphan-cleanup is best-effort. Acceptable for V1 given the precedent (treatment_plans behave the same way per pre-flight finding).
- **Wholesale item-replace on update:** simpler than diff logic but means any concurrent update would clobber. Single-doctor workflow makes concurrent edits unlikely; acceptable for V1.
- **Print overlay padding hardcoded:** templates from different clinics may have different header/footer regions. V1 ships with a single padding set; per-clinic tuning is a future enhancement.
- **`prescription.print` audit event fires on `fetchPrescriptionForPrint` BEFORE the user actually prints.** A user who opens the print dialog and cancels still gets logged. Acceptable trade-off: simpler than gating on the `afterprint` browser event, which can be unreliable.

## Commits (4)

| # | Commit | Files | Why this boundary |
|---|--------|-------|-------------------|
| 0 | `docs(plan): PR 2 prescriptions module` | `plans/pr-2-prescriptions-module.md` | Plan first — captures decisions before code, reviewable as a standalone artifact (mirrors PR #17 commit 0) |
| 1 | `feat(schema): add prescriptions + prescription_items tables with RLS` | `src/lib/schema.sql`, `scripts/prescriptions-tables.sql` | DB shape is the foundation; reviewers can audit table + RLS together in isolation. Idempotent DO-blocks mean safe re-runs on Supabase |
| 2 | `feat(database): prescription CRUD helpers` | `src/lib/prescriptions.js` (new) | Data layer next, builds on schema; tested by the UI commit. (Open: see decisions; could be appended to `database.js` instead) |
| 3 | `feat(dental): prescriptions tab with entry form and print view` | `src/components/DentalTabs.jsx`, `src/App.jsx` (tab wiring), `src/translations.js` (any new shared strings) | UI last, builds on data layer |

**Branch:** `feat/prescriptions-module`

## Post-merge runbook (Ali performs)

1. **Pre-flight on production Supabase** (read-only, verify nothing collides):
   - Run the 3 SELECT pre-flight checks above against production
   - Expect: 0 tables, 0 policies, ≥1 doctor in the test org
2. **Apply schema to production**:
   - Open Supabase SQL editor → paste `scripts/prescriptions-tables.sql` → run
   - Verify: `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (policyname LIKE 'prescriptions_%' OR policyname LIKE 'prescription_items_%')` returns 8
3. **Verify deployed UI**: visit a patient profile → Prescriptions tab loads → "New Prescription" modal opens → create a test prescription → print preview renders with the test doctor's template overlaid
4. **Cleanup test data**: delete the test prescription via UI; verify `audit_log` has the 4 expected events
5. **Mark the URGENT memory item resolved** (Vercel `SUPABASE_SERVICE_ROLE_KEY` verification stays separate — different scope)

## Decision points (all resolved 2026-05-16)

All 6 plan-time open decisions are locked. See the **Architectural decisions table** at the top of the doc for the canonical record. Brief recap:

| # | Decision | Resolution |
|---|----------|-----------|
| 1 | Data-layer location | **NEW `src/lib/prescriptions.js`** (not appended to `database.js`) |
| 2 | Print overlay positioning | **Percentage-based, hardcoded for Dr. Saif's template geometry**. ~24% / ~30% / ~70% top offsets for patient row / meds list / general instructions. Per-template configurable layout = V2. |
| 3 | `prescription.print` audit timing | **On modal's Print button click** (via `logPrescriptionPrint(id)`), not on the `fetchPrescriptionForPrint` load |
| 4 | Immutability + audit-trail | **Edit-in-place in V1.** Added `updated_at` (nullable) + `updated_by` (FK to auth.users, ON DELETE SET NULL) for partial audit trail. Clone-and-supersede = V2 if compliance demands. |
| 5 | GHL import compatibility | **Add `external_id text NULL` + `external_source text NULL` to `prescriptions`** + partial unique index `(external_source, external_id) WHERE external_id IS NOT NULL`. Items do NOT get these columns in V1 (assumption: GHL imports are header-level). |
| 6 | Amendments | Covered by decision 4: edit-in-place. |

### Items to verify during execution (not blockers)

These are pre-flight items called out in "Pre-flight findings → Open knowns to verify during execution":

1. Confirm exact location and structure of `src/lib/schema.sql` and append the prescriptions section consistently with the existing treatment_plans section.
2. Confirm the policy-naming convention used for other tenant tables (e.g., `treatment_plans_select` vs alternative naming) and align.
3. Confirm whether `treatment_plan_items` denormalizes `org_id` or delegates via parent FK — match its convention for `prescription_items` (the proposal here assumes delegation; adjust if precedent differs).
