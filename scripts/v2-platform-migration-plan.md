# V2 Platform Migration — Plan & Delta Report (Phase 1A)

**Companion to:** `scripts/v2-platform-migration.sql`
**Source of truth:** `ARCH-V2-PLATFORM.md` (master @ `fec1fe6`)
**Status:** DRAFT — not executed anywhere. Review gate before Phase 1B.
**Drafted:** 2026-06-13

> This session produced *only* a draft. **No SQL was run against Supabase.** The
> current production schema was reconstructed from the repo's authoritative
> schema file (`src/lib/schema.sql`, 94 KB) plus the committed migration scripts
> in `scripts/` — **not** from a live database query. Live introspection was
> deliberately skipped because (a) the top-level constraint forbids executing any
> SQL against Supabase, and (b) there is no DB connection string in `.env.local`
> and no `exec_sql`-style RPC, so `supabase-js` cannot read `pg_catalog` / RLS
> policies anyway. **Live verification is the job of Phase 1B** (apply to a
> Supabase branch). See *Instance safety* below — this is important.

---

## 0. TL;DR for the reviewer (Ali)

This migration inverts V1's clinic-centric (`org_id` + `current_org_id()`) model
into V2's doctor-centric model, by **wiping Le Royal test data** and rebuilding
the schema around `doctor_id` ownership, `patient_shares`, `receptionist_
assignments`, and `clinic_groups`.

**The ARCH doc's "V1 assumptions" were materially simpler than the real schema.**
Production has **27 tables**, a **separate `operators` table**, a **`current_
org_id()` function wired into ~80 RLS policies**, **no `treatments` table**, and
**17 org-scoped tables the ARCH migration plan never mentioned.** The SQL handles
all of them, but several required judgment calls. **Nine are flagged below as
`[JUDGMENT n]`. Read those before greenlighting Phase 1B.** Three are true forks
that could invalidate the draft if my guess is wrong — they're called out under
*Questions for Ali*.

---

## 1. Current schema delta report (production V1 vs what V2 needs)

### 1.1 Tables that exist in production today (27)

`operators`, `orgs`, `profiles`, `patients`, `appointments`, `treatment_plans`,
`treatment_plan_items`, `dental_chart_entries`, `payments`, `expenses`, `tasks`,
`inventory_items`, `forms`, `form_submissions`, `audit_log`, `org_secrets`,
`automations`, `conversations`, `messages`, `ai_usage`, `whatsapp_usage`,
`social_connections`, `invitations`, `prescriptions`, `prescription_items`,
`documents`, `notes`.

### 1.2 Divergences from ARCH doc (each drives a decision in the SQL)

| # | ARCH doc assumed | Production reality | Migration response |
|---|------------------|--------------------|--------------------|
| **D1** | Operator = `profiles.role='operator'`; super-admin policy checks that role | Operators are a **separate `operators` table** keyed by `auth.users(id)`, checked by `is_operator()`. `profile_role` enum is `('owner','doctor','receptionist','assistant')` — **no `'operator'`, no `'admin'`** | **[JUDGMENT 1]** Keep `operators` + `is_operator()`. All super-admin branches use `is_operator()`, not the ARCH role check (which would never match). Existing `*_operator` policies retained. |
| **D2** | "Drop `profiles.org_id`" | `profiles.org_id` is read by `current_org_id()`, which is referenced by **~80 RLS policies across 19 tables** + the `enforce_profile_immutable_fields()` trigger | **[JUDGMENT 2]** Renaming `org_id` requires first dropping every dependent policy + retiring `current_org_id()` + editing the trigger. SQL §8 does this explicitly so the diff shows exactly what authorization is removed. |
| **D3** | Add `doctor_id` to a `treatments` table | **No `treatments` table exists.** It's `treatment_plans` + `treatment_plan_items` + `dental_chart_entries` | **[JUDGMENT 3]** "treatments" mapped to all three. `treatment_plans` already had nullable `doctor_id`; the other two get it added. `xrays.treatment_id` FKs to `treatment_plans`. |
| **D4** | Migration covers ~8 clinical tables | **17 additional org-scoped tables** (expenses, tasks, inventory_items, forms, form_submissions, invitations, audit_log, org_secrets, automations, conversations, messages, ai_usage, whatsapp_usage, social_connections, …) all depend on `org_id` | **[JUDGMENT 4]** Integration/messaging tables (Phase-5-doomed) wiped now. Operational tables with no V2 owner yet (forms/expenses/tasks/inventory/invitations/org_secrets/audit_log) become **operator-only** automatically — only their `*_own_org` policies are dropped; their V1 `*_operator` policies (which use `is_operator()`) survive, so regular users get deny-all until Phase 2/3 assigns ownership. `audit_log` additionally gets an authed-insert for the Phase 2 data layer. |
| **D5** | `patients.date_of_birth`; `doctor_id` "already exists from PR #26"; gender `('male','female','other')` | `patients` has `dob` (not `date_of_birth`), **`primary_doctor_id` (not `doctor_id`)** from PR #26, `phone NOT NULL`, `UNIQUE(org_id,phone)`, plus `medical_history`/`allergies` jsonb, gender enum has **4** values incl `'prefer_not_to_say'` | **[JUDGMENT 5]** `doctor_id` is **added new** (PR #26 added `primary_doctor_id`, a filter field, not ownership). `primary_doctor_id` kept. `UNIQUE(org_id,phone)` → partial `UNIQUE(doctor_id,phone) WHERE phone IS NOT NULL`; `phone` relaxed to nullable. `dob`/`medical_history`/`allergies` untouched. |
| **D6** | `locale enum('en','ar','ku')` | `locale_code` is `('en','ar')` | **[JUDGMENT 6]** `ALTER TYPE … ADD VALUE 'ku'`. |
| **D7** | `doctor_id … NOT NULL` on clinical tables | `appointments.doctor_id` & `treatment_plans.doctor_id` exist but **nullable, `ON DELETE SET NULL`** | **[JUDGMENT 7]** FK action changed to `RESTRICT`, column set `NOT NULL` (post-wipe, so no legacy-row violation). |
| **D8** | (not considered) | `enforce_profile_immutable_fields()` trigger references `NEW.org_id` | Trigger redefined to drop the org_id check, keep role gating. |
| **D9** | "Le Royal is test data, no real patients" | **`CLAUDE.md` says "3,000+ real patient records"** | **SAFETY GATE.** Pre-flight aborts if `patients > 50`. **Must confirm which Supabase instance / that it holds no real data before Phase 1B.** See *Instance safety*. |
| **D10** | `clinic_groups.industry`, new enums | `orgs` has no `industry`; none of the V2 enums exist | All new enums created in §2. `clinic_groups` is a fresh table. |
| **D11** | Build a receptionist invite flow (Phase 4) | An org-scoped `invitations` table + `accept_invitation()`/`get_invitation_preview()` RPCs already exist | Noted, not blocking. Phase 4 should reuse/extend rather than rebuild. Its org policies are dropped here; table kept (operator-only placeholder). |

### 1.3 `doctor_id` status per clinical table (going in)

| Table | Has `doctor_id`? | Action |
|-------|------------------|--------|
| `prescriptions` | ✅ `NOT NULL`, RESTRICT | none (already V2-shaped) |
| `appointments` | ⚠️ nullable, SET NULL | tighten → NOT NULL + RESTRICT |
| `treatment_plans` | ⚠️ nullable, SET NULL | tighten → NOT NULL + RESTRICT |
| `patients` | ❌ (only `primary_doctor_id`) | add → NOT NULL |
| `treatment_plan_items` | ❌ | add (denormalized) → NOT NULL |
| `dental_chart_entries` | ❌ | add → NOT NULL |
| `payments` | ❌ (has `recorded_by`) | add → NOT NULL |
| `documents` | ❌ (has `uploaded_by`) | add → NOT NULL |
| `notes` | ❌ (has `created_by`) | add → NOT NULL |
| `form_submissions` | ❌ | add → NOT NULL |
| `prescription_items` | ❌ (child) | none — resolves via parent |

---

## 2. What the SQL does, in execution order

The whole thing runs in **one transaction** (`BEGIN … COMMIT`). If any statement
raises, production stays on V1.

| § | Step | Why here |
|---|------|----------|
| 0 | **Backup** (manual, outside txn) | Snapshot is the only true rollback for wiped data. |
| 1 | **Pre-flight checks** | Abort if not V1 shape, if operator/doctor missing, or if `patients > 50` (wrong-instance guard). |
| 2 | **New enum types** + `ADD VALUE 'ku'` | Types must exist before columns reference them. |
| 3 | **Create 5 new tables** | Created before altering existing tables so FKs resolve. |
| 4 | **Add V2 columns** (nullable first) | `doctor_id` added nullable so the wipe can run before `NOT NULL`. |
| 5 | **Wipe + reseed** | Delete tenant rows (children→parents), keep operator + doctor, demote doctor to solo `role='doctor'`. |
| 6 | **Enforce `NOT NULL`** | Safe only after wipe — empty tables can't violate the constraint. |
| 7/8 | **Drop V1 policies, retire `current_org_id()`, fix trigger, then rename `org_id`→`org_id_v1`** | **Order is critical** — see below. |
| 8b | **New per-doctor `UNIQUE(doctor_id,phone)`** | Replaces the dropped `UNIQUE(org_id,phone)`. |
| 9 | **New indexes** | Per ARCH index strategy + RLS support. |
| 10 | **`can_access_patient()` + `can_write_patient()`** | SECURITY DEFINER helpers the new policies delegate to. |
| 11 | **New doctor-centric RLS** | All new policies; operator-only placeholders for ownerless tables. |
| 12 | **Verification queries** (commented) | Run post-commit. |
| 13 | **Rollback procedure** (commented) | Snapshot-restore preferred. |

### 2.1 Why the ordering in §7/§8 matters (the linchpin)

`current_org_id()` reads `profiles.org_id`. **Every** V1 `*_own_org` policy calls
it. So you cannot rename `profiles.org_id` while those policies + the function
exist — Postgres blocks the rename on dependency, and a renamed column would
break the function silently. Correct order, which the SQL follows:

1. **Drop all V1 `*_own_org` policies** (§8) — removes the references.
2. **Redefine the immutable-fields trigger** to stop reading `org_id`.
3. **`DROP FUNCTION current_org_id()`** — now safe, nothing references it.
4. **Rename `org_id`→`org_id_v1`** on every table; drop the `orgs` FKs/NOT NULL.
5. **Rename `orgs`→`orgs_v1`**.

FK dependency also dictates **§3 (create new tables) before §4 (add FKs to them)**
and **children-before-parents in the §5 deletes**.

---

## 3. Risks per section + mitigations

| Section | Risk | Severity | Mitigation |
|---------|------|----------|------------|
| §0 backup | No snapshot → wiped data unrecoverable | **CRITICAL** | Mandatory `pg_dump`/Supabase backup gate; §13 rollback assumes it exists. |
| §1 pre-flight | Run against wrong (real-data) instance | **CRITICAL** | `patients > 50` abort + operator/doctor existence checks. Still requires human instance confirmation (D9). |
| §5 wipe | Deletes data that turns out to be real | **CRITICAL** | Pre-flight guard + Decision #2 (Le Royal is test). **Blocked on D9 confirmation.** |
| §8 policy drop | Window where tables have no policy = deny-all | HIGH | All inside one txn; app is in maintenance mode during cutover; tables empty anyway. |
| §10/§11 RLS | Wrong policy → cross-doctor leakage **or** doctor locked out of own data | **HIGH** | Phase 1B must run the simulated-JWT denial tests (§12i) — **cannot** be verified from a service-role session (it bypasses RLS). |
| §6 NOT NULL | Constraint fails on a stray row | MED | Enforced only post-wipe; tables empty. |
| §4/§7 ALTER | Long lock on a big table | LOW | Le Royal is tiny; `lock_timeout=15s` guards. |
| Trigger redefine | `enforce_prescription_doctor_role` references `NEW.org_id` (body) **and** fires `UPDATE OF doctor_id, org_id` | MED | SQL §8 redefines the function to drop the org check (keep role=`doctor`) and recreates the trigger to fire on `doctor_id` only — done **before** the `org_id` rename so it doesn't break prescription writes. |

---

## 4. Verification (run AFTER commit)

Queries are in SQL §12 (commented). Two classes:

- **Schema assertions** (12a–12h) — run as any admin; confirm tables/columns/
  functions/RLS-enabled are as expected.
- **RLS behavior** (12i) — **must** run with **simulated user JWTs**, not the
  service role (which bypasses RLS). Minimum set from ARCH Test Plan:
  - As Dr. A: `SELECT count(*) FROM patients` → only own rows.
  - As Dr. A: `INSERT INTO patients(doctor_id=DrB,…)` → `WITH CHECK` violation.
  - As Dr. A: `UPDATE` Dr. B's patient → 0 rows.
  - As Receptionist (no `can_remove_payments`): `DELETE FROM payments` → 0 rows.
  - As Receptionist (with `can_add_payments`): `INSERT INTO payments` → succeeds.
  - As clinic co-member with `share_full_records`: SELECT a `clinic_visible`
    patient of the other doctor → visible; a non-`clinic_visible` one → hidden.

This is **Phase 1B** work (apply to a Supabase branch, seed two doctors, mint
JWTs). It cannot be done from this chat.

---

## 5. Rollback procedure

**Preferred — restore the §0 snapshot.** Because §5 wipes patient/clinical rows,
the `*_v1` columns preserve *org linkage* but **not the deleted rows**. Only the
snapshot restores data.

1. Restore `velo-v1-preV2-<stamp>.sql` into a clean database.
2. Repoint the app's Supabase connection at the restored DB.
3. Confirm login as `alialjobory89` + operator access.

**Schema-only fallback** (rehearsal/no snapshot): SQL §13 OPTION B renames
`*_v1` back, recreates `current_org_id()`, drops the 5 V2 tables, and re-applies
V1 policies from `src/lib/schema.sql`. Restores shape, **not data**.

---

## 6. Estimated runtime & downtime window

- **SQL runtime:** < 60 s (Le Royal is test-sized; almost all DDL + tiny deletes).
- **Cutover window (ARCH T0):** ~1 hour, dominated by manual steps, not SQL:
  - Vercel maintenance page up.
  - `pg_dump` snapshot (§0).
  - Run migration (~1 min).
  - Reseed 2–3 test patients (UI or seed script).
  - End-to-end smoke as `alialjobory89`.
  - Maintenance page down.
- **App is broken between Phase 1 and Phase 2** by design — the V1 `src/lib/*`
  still expects `org_id`/`current_org_id()`. Don't run Phase 1 against the live
  instance until Phase 2 (data layer) is ready to deploy in the same window, or
  accept that the app is down until then. (Recommend bundling 1→3 into one
  cutover; ARCH's phase table treats them as separate deliverables but a single
  downtime window.)

---

## 7. Manual steps required outside the SQL

1. **Confirm the target instance + that it holds no real patient data (D9).**
2. Take the §0 snapshot.
3. Put Vercel into maintenance mode.
4. Run the SQL in the Supabase SQL editor (service role).
5. Run §12 verification (schema) + the simulated-JWT denial tests.
6. Reseed 2–3 test patients.
7. Create the `patient-xrays` storage bucket (private, 25 MB, MIME allowlist
   `image/jpeg,image/png,image/tiff,application/dicom`) — **not in this SQL**
   (Storage buckets are managed via the Storage API / dashboard, like the
   existing `patient-documents` bucket). Storage RLS policies are a follow-up,
   modeled on `scripts/patient-documents-bucket.sql`.
8. Smoke test, then lift maintenance mode.

---

## 8. Questions for Ali (resolve before Phase 1B)

These are the forks where I made a provisional call but your answer could change
the SQL materially:

1. **Instance / real-data confirmation (D9, blocking, safety):** Which Supabase
   project does Phase 1B/1D target, and do you confirm it holds **only** Le Royal
   test patients (the `>50` guard is a backstop, not a substitute for your
   confirmation)? `CLAUDE.md` still says "3,000+ real patient records" — is that
   stale, or on a different instance?
2. **Scope of the cutover (D2/D4):** I treated Phase 1 as a *full* schema cutover
   (org model fully retired, `current_org_id()` dropped) because dropping
   `profiles.org_id` forces it. The alternative is an **expand/contract** approach
   — keep `org_id` + `current_org_id()` alive alongside the new doctor columns
   and only drop org in a later phase (safer, but contradicts ARCH Breaking
   Change #3). **Confirm: full cutover now, or expand/contract?**
3. **Ownerless operational tables (D4):** forms/expenses/tasks/inventory_items
   become **operator-only** (their surviving V1 `*_operator` policies; regular
   users lose access until Phase 2/3 gives them a doctor/clinic owner). Is that
   acceptable, or should
   any of these be doctor-owned **now**? (`expenses`/`inventory` in a chair-rental
   clinic could be doctor-owned *or* clinic-group-shared — genuine product call.)
4. **Operator model (D1):** Confirm we keep the `operators` table + `is_operator()`
   rather than migrating operators into `profiles.role`. (I recommend keeping it.)
5. **ARCH doc updates:** Given D1/D3/D4/D5, the ARCH doc's Entity Model section
   is now known to be simplified. Want me to open a follow-up PR aligning the
   ARCH doc with the real schema (rename "treatments"→treatment_plans family,
   note the operators table, enumerate the 17 extra tables), per the guardrail
   "update the ARCH doc first if needed"?

---

## 9. What this draft deliberately did **not** do

- **Did not** execute any SQL against Supabase (top constraint).
- **Did not** touch `src/lib/` or any app code (Phase 2).
- **Did not** create the `patient-xrays` storage bucket or its RLS (manual /
  follow-up; Storage isn't managed in a SQL migration here).
- **Did not** invent ownership for tables whose V2 model is undecided — flagged
  instead (D4 / Q3).
- **Did not** drop any `*_v1` column or the `orgs_v1` table — kept for rollback.
