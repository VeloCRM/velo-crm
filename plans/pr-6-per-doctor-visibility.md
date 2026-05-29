# PR 6 — Per-Doctor Patient Visibility (Path A)

**Branch:** `feat/per-doctor-patient-visibility`
**Status:** plan
**Date:** 2026-05-29
**Author:** Ali (decisions) + Claude (drafting)

## Goal

Let a clinic assign each patient a **primary doctor**, and let doctors filter the
Patients list down to their own caseload via a "My patients" toggle:

- New nullable `patients.primary_doctor_id` column (FK → `profiles`, `ON DELETE SET NULL`) + a `(org_id, primary_doctor_id)` index for filtered list queries
- **No RLS change** — reads stay org-scoped; `primary_doctor_id` is a *filter*, not a security boundary (any same-org member can still read any patient)
- Data layer: `fetchPatients` gains an optional `{ primaryDoctorId }` filter; `getMyPatientsCount(doctorId)` for the toggle badge; create/update pass the column through
- UI: a role-defaulted "My patients" toggle in the Patients page header (doctor = ON, owner/receptionist = OFF), persisted per-user in localStorage; a Primary Doctor selector in the add/edit patient modal

**Out of scope (V2):**
- An "Unassigned" third filter state (toggle is binary: all / mine; NULL-assignee patients show under "all" only)
- Doctor-handoff / reassignment workflow
- Primary-doctor change history / audit timeline
- Making visibility a security boundary (would require RLS + a per-doctor read policy)

## Architectural decisions table

| Question | Decision | Why |
|----------|----------|-----|
| Column on `patients` vs a join table | **Column `primary_doctor_id` on `patients`.** | One patient has exactly one primary doctor — a scalar FK, not a many-to-many. A join table would be over-engineering and complicate the list query. |
| Security model | **No RLS change. Filter-only.** | The clinic is a single trust domain; all staff can already read all patients (org-scoped RLS). "My patients" is a convenience view, not an access control. Making it a boundary would need a new per-doctor read policy and would break receptionists/owners who must see everyone. Documented explicitly so a future reader doesn't mistake it for security. |
| FK `ON DELETE` behavior | **`ON DELETE SET NULL`.** | A deleted doctor profile must not cascade-delete patient rows (live clinical data). The patient simply becomes unassigned. |
| Filtering: client-side vs server-side | **Server-side** — `fetchPatients` adds `.eq('primary_doctor_id', …)`. | The list is paginated (`PATIENTS_PAGE_SIZE`); a client-side filter over only-loaded rows would silently hide a doctor's patients on unfetched pages. The existing *search* is client-side (a known limitation over loaded rows), but correctness for a caseload filter requires the DB to filter + count. |
| Where filter state lives | **App.jsx owns `patientFilterDoctorId`** (the patients list + its paginated fetch live in App.jsx); **PatientsPage owns the toggle UI, role-default, and localStorage**, lifting the resulting doctor id up via a setter prop. | Single source of truth for the list. Changing the filter triggers a re-fetch from offset 0; `loadMorePatients` applies the active filter. A first-run guard skips the initial mount so the default unfiltered `loadAllData` isn't duplicated. |
| Toggle default by role | **doctor = ON, owner/receptionist/other = OFF**, overridable and remembered. | A doctor's default mental model is "my chairside list"; admins/front-desk need everyone. |
| Persistence | **localStorage key `velo:patients:my_filter:<userId>`**, read on mount, written on toggle. | Per-user sticky preference; survives reloads. Falls back to the role default when absent. |
| Badge count | **`getMyPatientsCount(doctorId)`** — a dedicated `count: 'exact'` query, shown when the toggle is ON. | Gives a stable "My patients: N" independent of how many list pages are loaded. (After a filtered fetch `patientsTotal` also reflects N, but the dedicated count is robust regardless of list timing — and is the helper the spec calls for.) |
| Modal selector default | **Current user if their role = 'doctor', else blank.** Populated from `listDoctorsInOrg()` filtered to `role === 'doctor'`. | A doctor adding a patient almost always assigns themselves; admins pick explicitly. `listDoctorsInOrg` returns owner+doctor — filter to doctors for the prescriber list. |
| Impersonation (operator) path | **Filter not applied** — operators viewing an org via `fetchPatientsForOrg` don't get the `primaryDoctorId` filter (they aren't a doctor in that org; toggle defaults OFF). | "My patients" is meaningless for an operator; scope the filter to the normal `fetchPatients` path only. |

## Schema spec

```sql
-- In schema.sql, added to the patients CREATE TABLE (profiles is defined above it):
primary_doctor_id uuid REFERENCES profiles(id) ON DELETE SET NULL
-- + after the table:
CREATE INDEX patients_primary_doctor_idx ON patients (org_id, primary_doctor_id);
```

Standalone migration (`scripts/patients-primary-doctor-id-migration.sql`) uses
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` so prod
(which already has the table) is patched idempotently. Existing rows get `NULL`
(unassigned) — the default, no backfill. **RLS unchanged.**

## Data layer spec (`src/lib/database.js`)

> Naming note: the patient helpers are actually `insertPatient(patient, orgId)`
> and `patchPatient(id, updates)` (the brief's "createPatient/updatePatient" map
> to these). This module uses camelCase mappers (`mapPatient`), unlike the
> dental/prescriptions/notes modules.

- `mapPatient` → add `primaryDoctorId: row.primary_doctor_id || null`.
- `sanitizePatient` → pass `primary_doctor_id` through (`p.primary_doctor_id ?? p.primaryDoctorId ?? null`); a UUID from the trusted in-app dropdown, NULL allowed (unassign).
- `fetchPatients(offset, limit, { primaryDoctorId } = {})` → when `primaryDoctorId` is provided, append `.eq('primary_doctor_id', primaryDoctorId)`. Backward-compatible (existing 0/1-arg callers unaffected).
- `insertPatient` → `sanitizePatient` now carries the column; audit `patient.create` payload gains `primary_doctor_id` when set.
- `patchPatient` → handle `primary_doctor_id`/`primaryDoctorId` (including explicit `null` to unassign); already audits changed `fields`.
- `getMyPatientsCount(doctorId)` → `count: 'exact', head: true` over `patients` where `org_id = current_org_id()` AND `primary_doctor_id = doctorId`; returns a number.

## UI spec (App.jsx — PatientsPage + PatientFormModal)

**App.jsx:**
- Import `listDoctorsInOrg` from `./lib/profiles`.
- New state `patientFilterDoctorId` (null = all).
- Reload effect on `patientFilterDoctorId` (first-run-guarded) → `fetchPatients(0, _, { primaryDoctorId })`, replacing `patients` + `patientsTotal`.
- `loadMorePatients` → pass `{ primaryDoctorId: patientFilterDoctorId }` on the non-impersonation branch.
- `addPatient` optimistic row includes `primaryDoctorId`; `raw` already flows to `insertPatient`.
- Pass to PatientsPage: `patientFilterDoctorId`, `setPatientFilterDoctorId`, `currentUserId={user?.id}`, `currentUserRole={effectiveRole}`.

**PatientsPage:**
- "My patients" toggle (pill) on the controls row beside the search; visible to all non-operator users.
- On mount: read `localStorage['velo:patients:my_filter:<userId>']`; absent → role default (doctor ON). If resolved ON, call `setPatientFilterDoctorId(userId)`.
- Toggle handler: update local state, write localStorage, call `setPatientFilterDoctorId(on ? userId : null)`.
- Badge: when ON, fetch `getMyPatientsCount(userId)` and show "My patients: N".
- Pass `currentUserId` / `currentUserRole` down to `PatientFormModal`.

**PatientFormModal:**
- Load doctors via `listDoctorsInOrg()` → filter `role === 'doctor'`.
- `form.primary_doctor_id` default: existing patient's value, else (`currentUserRole === 'doctor' ? currentUserId : ''`).
- A "Primary Doctor" `FormField` `<select>` (with a blank "— Unassigned —" option) below the existing fields.
- `onSave` payload includes `primary_doctor_id` (`'' → null`).
- EN/AR strings inline.

## Backlog implications

- **Vercel function count:** no serverless function added — stays 12/12.
- **"Unassigned" third state (V2):** a tri-state filter (all / mine / unassigned) for triaging newly-imported patients.
- **Doctor handoff (V2):** bulk reassignment when a doctor leaves; today they go `NULL` via the FK on delete.
- **Primary-doctor history (V2):** audit timeline of assignment changes (currently only the latest value is stored).
- **GHL import:** the importer can set `primary_doctor_id` when the source carries an assignee.

## Commits (4)

| # | Commit | Files | Why this boundary |
|---|--------|-------|-------------------|
| 0 | `docs(plan): PR 6 per-doctor visibility` | `plans/pr-6-per-doctor-visibility.md` | Plan first. |
| 1 | `feat(schema): patients.primary_doctor_id column + index` | `src/lib/schema.sql`, `scripts/patients-primary-doctor-id-migration.sql` | DB shape in isolation; idempotent. |
| 2 | `feat(database): patient query + assignment helpers` | `src/lib/database.js` | Data layer builds on schema. |
| 3 | `feat(patients): My-patients filter + primary-doctor selector` | `src/App.jsx` | UI last, builds on data layer. |

## Post-merge runbook (Ali performs)

1. Run `scripts/patients-primary-doctor-id-migration.sql`. Verify:
   ```sql
   SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='patients' AND column_name='primary_doctor_id'; -- 1 row
   SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND indexname='patients_primary_doctor_idx';                    -- 1 row
   ```
2. Smoke test (after Vercel deploy): as a doctor, Patients tab defaults to "My patients" (and remembers the choice); assign a patient's primary doctor in the edit modal → it persists; owner sees all patients with the toggle OFF.
