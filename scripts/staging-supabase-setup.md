# Staging Supabase Setup — V1.5

**Stage:** V1.5 Stage 1 (plan; Ali executes the manual steps)
**Created:** 2026-06-26
**Why:** Every import is rehearsed on staging first (master-plan "Data integrity above all"). Stage 7 runs the full 3,171-contact import to staging for Saif's review **before** production ever sees the data. Staging must be a faithful clone of the production schema with **zero production data**.

> Ali performs the dashboard steps (project creation, key generation). This doc is the runbook + verification checklist. **No production database changes.**

## 1. Create the staging project

- Supabase dashboard → New project.
- **Name:** `velo-staging` (clearly distinct from production `aajwuwjxpmmqcwhiynla`).
- **Region:** match production's region (lowest surprise on latency/behavior).
- **DB password:** strong, stored in Ali's password manager (not the repo).
- Note the new **project ref** (the `xxxx` in `https://xxxx.supabase.co`).

## 2. Clone the production SCHEMA (no data)

Goal: identical tables, enums, functions, triggers, RLS policies, indexes — **structure only**.

**Option A — apply the repo's SQL (preferred; reviewable, deterministic):**
Run, in order, in the **staging** SQL editor:
1. `src/lib/schema.sql` (base: enums, tables, helpers, triggers, all RLS).
2. The additive migrations that production has already had applied, in chronological order:
   - `scripts/multi-doctor-migration.sql` (patients.primary_doctor_id) — *if not already folded into schema.sql; it is present there, so skip if duplicate.*
   - `scripts/prescriptions-migration.sql`
   - `scripts/documents-migration.sql` (+ `scripts/patient-documents-bucket.sql`)
   - `scripts/notes-migration.sql`
   - `scripts/xray-module-migration.sql` (+ `scripts/xray-fix-storage-insert-policy.sql`)
   - `scripts/add-fracture-wear-finding-types.sql`
   - `scripts/add-tooth-notation-column.sql`
   - `scripts/prescription-template-url-rpc.sql`, `scripts/prescription-templates-bucket.sql`, `scripts/prescription-templates-rls-fix.sql`
   - `scripts/security-migration.sql`, `scripts/fix-payments-currency-not-null.sql`, `scripts/migration-fixes.sql`
   - `scripts/v1.5-add-xray-tech-role.sql` (the two-phase `xray_tech` migration — Phase A then Phase B)
   > ⚠️ The exact set/order must match what production actually had applied. Before relying on Option A, reconcile this list against production (Option B's dump is the ground truth).

**Option B — pg_dump the production schema (ground-truth clone):**
```
# Structure ONLY — no rows. Run against PRODUCTION (read-only dump).
pg_dump \
  --schema-only \
  --no-owner --no-privileges \
  --schema=public \
  "postgresql://postgres:<PROD_DB_PASSWORD>@db.aajwuwjxpmmqcwhiynla.supabase.co:5432/postgres" \
  > scripts/_prod-schema-snapshot.sql      # gitignored — may reveal internal structure

# Then apply to STAGING:
psql "postgresql://postgres:<STAGING_DB_PASSWORD>@db.<STAGING_REF>.supabase.co:5432/postgres" \
  -f scripts/_prod-schema-snapshot.sql
```
Notes:
- `--schema-only` guarantees **no patient data** crosses over.
- Supabase-managed schemas (`auth`, `storage`, `realtime`) already exist on the new project — keep `--schema=public` to avoid clobbering them. Cross-schema FKs (`profiles.id → auth.users`) re-resolve because `auth.users` exists on staging too.
- `_prod-schema-snapshot.sql` should be gitignored (see §7).

**Recommended:** use Option B to produce the canonical clone, and keep Option A's ordered list as the human-readable record of what's in it.

## 3. Verify the schema matches (hard gate)

Run in the **staging** SQL editor and compare counts/names against production:
```
-- Tables (expect the full set: patients, notes, documents, payments, xrays,
-- conversations, messages, treatment_plans, ... + operators/orgs/profiles)
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' ORDER BY 1;

-- Enums (expect profile_role to INCLUDE 'xray_tech')
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
 WHERE t.typtype='e' GROUP BY 1 ORDER BY 1;

-- RLS policies present on every table (spot-check a few)
SELECT tablename, count(*) FROM pg_policies
 WHERE schemaname='public' GROUP BY 1 ORDER BY 1;

-- Helper functions exist
SELECT proname FROM pg_proc WHERE proname IN ('is_operator','current_org_id');

-- Idempotency indexes exist
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND indexname LIKE '%external%';
```
**Pass criteria:** table set, enum labels (incl. `xray_tech`), policy presence, helpers, and external-idempotency indexes all match production.

## 4. Storage buckets

Recreate production's buckets on staging (private, same limits):
- `patient-documents` (private, 25 MB, 8-MIME allowlist) — Stage-7 doc import target.
- `patient-xrays` (private) — X-ray module.
- `prescription-templates` (private) — Rx pads.
- Re-create the storage RLS policies (`scripts/patient-documents-bucket.sql`, `scripts/xray-module-migration.sql` storage section, `scripts/prescription-templates-bucket.sql`).
Verify: Storage → buckets list matches; a test upload under a fake `{org}/{patient}/` path obeys RLS.

## 5. Auth settings

Match production: 8-char min + special-char password policy, JWT 1h, OTP 1h, email confirmations, rate limits at defaults (per the security audit). For staging, email confirmation can optionally be relaxed to speed up test-account creation — **document the difference if so**.

## 6. Keys & environment

Generate on staging (dashboard → Settings → API):
- **anon key** → for a staging Vercel preview deploy (client).
- **service-role key** → for the Stage-2 import script ONLY. Server/CLI use; never in the bundle, never `VITE_`-prefixed.

Local `.env.staging.local` (gitignored) for the import CLI:
```
STAGING_SUPABASE_URL=https://<STAGING_REF>.supabase.co
STAGING_SUPABASE_SERVICE_ROLE_KEY=...        # server-only
STAGING_SUPABASE_ANON_KEY=...                # for preview deploy
```
**Staging Vercel preview (optional but recommended):** connect a `staging` branch to a Vercel preview with the staging anon key + URL as preview-scoped env vars, so Saif's Stage-7 review uses a real URL pointed at staging — production env untouched.

## 7. Gitignore additions (credentials & PHI)

Ensure these never get committed (added to `.gitignore` in Stage 1):
- `scripts/ghl-sample-data.json` (real patient data)
- `.env.staging.local`, `.env.local` (already covered by `.env*`)
- `scripts/_prod-schema-snapshot.sql` (internal structure)
- `export/` (already gitignored — legacy GHL dumps)

## 8. Provisioning checklist (Stage-1 gate)

- [ ] `velo-staging` project created; ref recorded.
- [ ] Public schema cloned (Option B dump applied) — **no rows**.
- [ ] §3 verification queries pass vs production (incl. `xray_tech` enum + external-idempotency indexes).
- [ ] Storage buckets + policies recreated.
- [ ] Auth settings matched (differences documented).
- [ ] anon + service-role keys generated; stored in `.env.staging.local` (gitignored).
- [ ] (Optional) staging Vercel preview reachable.
- [ ] Confirmed: production project `aajwuwjxpmmqcwhiynla` was **not modified** at any step.
