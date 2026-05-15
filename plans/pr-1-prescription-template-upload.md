# PR 1 — Prescription Template Upload Infrastructure

**Branch:** `feat/prescription-template-upload`
**Status:** plan
**Date:** 2026-05-15
**Author:** Ali (decisions) + Claude (drafting)

## Goal

Add the upload-side groundwork for the per-doctor prescription print feature:

- A private Supabase Storage bucket (`prescription-templates`) where each doctor's prescription pad PNG/JPG lives
- A nullable `prescription_template_url` column on `public.profiles` to track which doctors have one
- RLS that lets same-org members read but only the doctor themselves (role-tightened) or a same-org clinic owner write
- A UI for upload/preview/remove inside DoctorForm

**Out of scope for PR 1:** the prescription print flow itself (patient profile → render template + overlay name/date → `window.print()`). That's PR 2.

## Approved decisions

1. **Write authority:** doctor themselves OR same-org clinic `owner` only. Agency operators (cross-org role) excluded by design — they shouldn't be uploading clinic-doctor prescription pads.
2. **Role-tightened self-upload:** the self-branch is restricted to `role = 'doctor'`. A receptionist with a matching `auth.uid()` cannot upload to their own slot.
3. **Audit-log namespace:** deeper, three-segment names — `profile.prescription_template.upload` and `profile.prescription_template.delete`. Searchability over alignment with the prevailing two-segment convention.
4. **Bucket setup automation:** `scripts/prescription-templates-bucket.sql` committed alongside the schema commit; the bucket itself is created manually via Supabase dashboard (size/MIME limits aren't cleanly settable via SQL). PR description carries the dashboard runbook.
5. **Plan location:** `plans/pr-1-prescription-template-upload.md` (this file). No conflicting convention in CLAUDE.md.

## Architectural decisions

| Question | Decision | Why |
|----------|----------|-----|
| Storage location | Supabase Storage bucket `prescription-templates`, private | RLS gates reads (no signed URLs leaked publicly); aligns with existing tenant-scoped data invariants |
| Path scheme | `{org_id}/{doctor_id}/template.{ext}` (3-segment, mirrors dental_xrays convention) | RLS extracts both org_id and doctor_id via `storage.foldername` — the helper returns folder segments only, NOT basenames. doctor_id therefore lives as a folder, not a basename. Predictable URLs → simple preview rendering. Basename `template.{ext}` is a fixed placeholder; basename slot stays free for future versioning |
| File types | PNG, JPG only | Print-ready raster; PDF would change the print pipeline |
| File size cap | 5 MB | Generous for high-DPI A4 templates; protects free-tier storage quota |
| Filename collision | Overwrite (single template per doctor) | One pad per doctor; new upload replaces old. No versioning needed in PR 1 |
| Column type | `prescription_template_url TEXT NULL` on `profiles` | Mirrors `avatar_url` pattern. NULL = no template uploaded. Stores the storage path, not a full URL — front-end calls `createSignedUrl` for previews |

## Pre-flight findings

### `logAuditEvent` signature (confirmed)

Lives in **`src/lib/audit.js:56`** (NOT `database.js` — database.js imports it). Signature:

```js
export async function logAuditEvent({
  orgId,           // required — throws if missing
  action,          // required — short verb like 'patient.create'
  entityType,      // required — e.g. 'patient', 'profile'
  entityId = null, // optional — uuid of affected row
  payload = null,  // optional — small JSON, NEVER include secrets
})
```

Behavior: resolves `acting_user_id` from `auth.uid()`, resolves `effective_user_id` from operator-impersonation context, writes to `audit_log`, **throws on failure** ("silent audit gaps are unacceptable"). All plan helpers obey this.

### Storage RLS pattern (mirrored from parallel-branch convention)

The canonical schema (`src/lib/schema.sql`) has zero storage references — this PR introduces the first storage-using feature. The repo's only storage RLS pattern is in `scripts/dental-persistence-migration.sql:178-218` (the parallel-branch migration). That file is **NOT usable for table/schema reference** (its CREATE TABLE statements describe tables that don't exist on this branch), but its **storage RLS policy structure is sound and mirrors Supabase conventions** — those structural elements (`storage.foldername` helper, idempotent `DO $$ BEGIN ... IF NOT EXISTS` wrapper) are framework conventions, not branch-specific schema claims.

This PR mirrors the structural shape (foldername + idempotent block) and supplies its own semantic content (role-tightened self-upload, owner-only admin branch, doctor-vs-org-membership predicates).

## Files touched

| File | Operation | Notes |
|------|-----------|-------|
| `src/lib/schema.sql` | Edit | Append the new column + RLS section as the canonical schema record |
| `scripts/prescription-templates-bucket.sql` | New | Standalone re-runnable SQL for Ali to paste into Supabase SQL editor |
| `src/lib/database.js` | Edit | Add `uploadPrescriptionTemplate`, `deletePrescriptionTemplate`, `getPrescriptionTemplateSignedUrl` helpers |
| `src/pages/SettingsPage.jsx` | Edit | DoctorForm becomes 2-tab (Profile / Prescription Template) at L1546-1602 |
| `plans/pr-1-prescription-template-upload.md` | New | This file |

## Migration SQL

### Part 1 — column on `profiles`

```sql
-- Per-doctor prescription pad template stored in Supabase Storage.
-- Path: prescription-templates/{org_id}/{doctor_id}/template.{ext}
-- NULL = doctor has not uploaded a template yet.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prescription_template_url TEXT;
```

Backwards-compatible: nullable, no default. `ADD COLUMN ... IF NOT EXISTS` is idempotent. `ALTER TABLE` with a nullable column and no default is a metadata-only change in Postgres — safe under load against 3,000+ patient orgs.

### Part 2 — storage bucket + RLS

The `storage.buckets` row is created via Supabase dashboard (size/MIME constraints aren't cleanly settable via SQL). Once the bucket exists, these policies go on `storage.objects`:

```sql
-- prescription-templates bucket RLS
-- Path shape: {org_id}/{doctor_id}/template.{ext}
--   - segment 1 (storage.foldername(name)[1]): org UUID
--   - segment 2 (storage.foldername(name)[2]): doctor UUID
--   - basename: 'template.{ext}' (placeholder; not used by RLS)
-- NOTE: storage.foldername returns FOLDER segments only, excluding the basename.
-- doctor_id therefore lives as a folder segment, not as a basename prefix —
-- the 2-segment scheme {org_id}/{doctor_id}.{ext} would NOT work because
-- foldername[2] would be NULL.
-- Any deviation from this shape will fail the UUID cast and deny access (fail-closed).

-- READ: any authenticated member of the org can preview templates.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_select' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: doctor uploading their own template (role-tightened), OR same-org owner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          -- self-upload branch: doctor uploading to their own folder, role-tightened
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR
          -- admin branch: same-org clinic owner (explicit org_id binding for defense-in-depth)
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;

-- UPDATE: same predicate as INSERT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_update' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;

-- DELETE: same predicate as INSERT/UPDATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
        AND (
          (
            (storage.foldername(name))[2]::uuid = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'doctor'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'owner'
              AND org_id = (storage.foldername(name))[1]::uuid
          )
        )
      );
  END IF;
END $$;
```

**Validation gaps RLS cannot close (acknowledged):**

- MIME type validation — RLS sees only the path string, not binary. MIME enforcement happens at bucket level (Supabase enforces `allowed_mime_types`) and client level (`uploadPrescriptionTemplate` checks `file.type` before the call).
- File size — same story. Bucket-level (`file_size_limit`) and client-side fast-fail.
- Path UUID validity — `::uuid` cast fails closed: if a hand-crafted path isn't a UUID, the policy denies. Safe.

## Storage bucket setup (Supabase dashboard — manual, one-time)

Steps Ali performs against the live Supabase project:

1. supabase.com → velo-crm project → Storage → New bucket
2. **Name:** `prescription-templates`
3. **Public:** OFF (private)
4. **File size limit:** `5242880` (5 MB)
5. **Allowed MIME types:** `image/png, image/jpeg`
6. Create bucket
7. SQL editor → paste contents of `scripts/prescription-templates-bucket.sql` → run
8. Verify: Storage → prescription-templates → Policies tab shows 4 policies (select/insert/update/delete)

## Data layer

All helpers follow the standard envelope (`requireUser` → `getCurrentOrgId` → operation → `logAuditEvent`). They live in `src/lib/database.js` and use the existing `logAuditEvent` import (already wired at L29: `import { logAuditEvent } from './audit'`).

```js
// Upload (or replace) the prescription template for a doctor.
// Returns the storage path, also persisted to profiles.prescription_template_url.
// Errors: file-too-large, file-wrong-type, storage error, profile update error.
export async function uploadPrescriptionTemplate(doctorId, file) {
  if (!doctorId) throw new Error('uploadPrescriptionTemplate: doctorId required')
  if (!file) throw new Error('uploadPrescriptionTemplate: file required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Client-side fast-fail (RLS + bucket-level limits are the real gate)
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPG are accepted.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File exceeds 5 MB.')
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${orgId}/${doctorId}/template.${ext}`

  const { error: upErr } = await supabase.storage
    .from('prescription-templates')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr

  // Persist path on the profile row (RLS enforces same-org).
  const { error: pErr } = await supabase
    .from('profiles')
    .update({ prescription_template_url: path })
    .eq('id', doctorId)
    .eq('org_id', orgId)
  if (pErr) throw pErr

  await logAuditEvent({
    orgId,
    action: 'profile.prescription_template.upload',
    entityType: 'profile',
    entityId: doctorId,
    payload: { ext, size_bytes: file.size },
  })

  return path
}

// Delete the prescription template for a doctor. Clears the column too. Idempotent.
export async function deletePrescriptionTemplate(doctorId) {
  if (!doctorId) throw new Error('deletePrescriptionTemplate: doctorId required')
  await requireUser()
  const orgId = await getCurrentOrgId()

  // Fetch current path so the storage delete is precise.
  const { data: profile, error: fetchErr } = await supabase
    .from('profiles')
    .select('prescription_template_url')
    .eq('id', doctorId)
    .eq('org_id', orgId)
    .single()
  if (fetchErr) throw fetchErr
  const path = profile?.prescription_template_url
  if (!path) return // already cleared — idempotent, no audit-log event

  const { error: delErr } = await supabase.storage
    .from('prescription-templates')
    .remove([path])
  if (delErr) throw delErr

  const { error: pErr } = await supabase
    .from('profiles')
    .update({ prescription_template_url: null })
    .eq('id', doctorId)
    .eq('org_id', orgId)
  if (pErr) throw pErr

  await logAuditEvent({
    orgId,
    action: 'profile.prescription_template.delete',
    entityType: 'profile',
    entityId: doctorId,
  })
}

// Get a short-lived signed URL for previewing the template.
// 60-second TTL — enough for render, short enough to limit leak risk.
// Used by DoctorForm preview (PR 1) and the print render (PR 2).
export async function getPrescriptionTemplateSignedUrl(path) {
  if (!path) return null
  await requireUser()
  const { data, error } = await supabase.storage
    .from('prescription-templates')
    .createSignedUrl(path, 60)
  if (error) throw error
  return data?.signedUrl || null
}
```

## DoctorForm UI sketch (text-only, no JSX yet)

Current form (`src/pages/SettingsPage.jsx:1546-1602`) is a single flat block. PR 1 converts to tabbed:

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Doctor                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [ Profile ]  [ Prescription Template ]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ── Profile tab (default) ────────────────────────────────      │
│   • Name           [ Dr. ...              ]                     │
│   • Locale         [ — Auto — ▾ ]                               │
│   • Avatar URL     [ https://...          ]                     │
│   (existing operator-managed role note here)                    │
│                                                                 │
│  ── Prescription Template tab ───────────────────────────       │
│   • If no template:                                             │
│       [ Upload PNG or JPG ]                                     │
│       Hint: 5 MB max. Recommended 2480×3508 (A4 @ 300 DPI).     │
│                                                                 │
│   • If template exists:                                         │
│       ┌──────────┐                                              │
│       │ preview  │   Uploaded                                   │
│       │ 240×320  │   [ Replace ] [ Remove ]                     │
│       └──────────┘                                              │
│                                                                 │
│  [ Cancel ]                              [ Update ]             │
└─────────────────────────────────────────────────────────────────┘
```

Tab implementation: simple internal state (`useState`), no router push. Use existing GlassCard / Button / pill-style aesthetic from elsewhere in SettingsPage.

**Preview rendering:**
- On Prescription Template tab open + after upload, call `getPrescriptionTemplateSignedUrl(profile.prescription_template_url)` → set `<img src={signedUrl}>` for the preview
- 60s TTL is fine for the initial render; re-fetch on any user re-interaction

**Upload flow:**
- File input → client-side `file.type` + `file.size` checks (mirror server-side gates for fast UX fail)
- Call `uploadPrescriptionTemplate(doc.id, file)` → on success, refresh preview, toast success
- On error: toast specific message

**Remove flow:**
- Confirm modal ("Remove prescription template? The doctor will need to re-upload to print prescriptions.")
- Call `deletePrescriptionTemplate(doc.id)` → on success, clear preview, toast success

## Dry-run plan

Per CLAUDE.md "Schema changes to dental tables require dry-run on a copy + written rollback plan." `profiles` isn't strictly `dental_*`, but it's tenant-scoped with 3,000+ live rows — treat with full ceremony.

### Pre-flight checks
1. `SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'prescription_template_url';` → expect zero rows
2. `SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'prescription_templates_%';` → expect zero rows
3. `SELECT * FROM storage.buckets WHERE id = 'prescription-templates';` → expect zero rows

### Test on a dev/branch copy first
1. Run `ALTER TABLE` — verify zero rows affected at the data level (column defaults NULL for all existing rows)
2. Create the bucket via dashboard, apply RLS from `scripts/prescription-templates-bucket.sql`
3. Test from multiple identities:
   - Doctor in org A uploading own template → expect success
   - Same doctor uploading at path `{org_B}/{doctor_id}/template.png` → expect RLS denial
   - Receptionist in org A uploading to own slot → expect denial (role-tightened)
   - Clinic owner in org A uploading on behalf of doctor in org A → expect success
   - Doctor in org A downloading template from org B → expect denial

### Rollback strategy

```sql
-- Drop the policies first
DROP POLICY IF EXISTS "prescription_templates_select" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_insert" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_update" ON storage.objects;
DROP POLICY IF EXISTS "prescription_templates_delete" ON storage.objects;

-- Drop the column (data loss for any URLs stored)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS prescription_template_url;

-- Bucket deletion (manual via dashboard if needed; must empty objects first)
```

Rollback is safe because the column is nullable and isolated — no foreign keys depend on it, no other queries reference it yet (PR 2 isn't shipped).

### Risks acknowledged

- **MIME whitelist strictness:** Supabase enforces `image/png, image/jpeg` literally. Mitigation: client uses `file.type` which browsers report canonically.
- **First-storage-feature surprises:** Env-var assumptions about anon-key storage permissions haven't been exercised. Mitigation: dry-run on a dev project first.
- **3000+ patient orgs reading the schema during migration:** `ADD COLUMN` nullable + no default is metadata-only in Postgres. Safe under load.

## Commits (4)

| # | Commit | Files | Why this boundary |
|---|--------|-------|-------------------|
| 0 | `docs(plan): PR 1 prescription template upload` | `plans/pr-1-prescription-template-upload.md` | Plan first — captures decisions before code, reviewable as a standalone artifact |
| 1 | `feat(schema): add prescription_template_url column + storage RLS` | `src/lib/schema.sql`, `scripts/prescription-templates-bucket.sql` | DB shape is the foundation everything else builds on; reviewers can audit RLS in isolation |
| 2 | `feat(database): prescription template upload/delete/signed-url helpers` | `src/lib/database.js` | Data layer next, builds on schema; tested by the UI commit |
| 3 | `feat(settings): tabbed DoctorForm with prescription template upload UI` | `src/pages/SettingsPage.jsx` | UI last, builds on data layer |

**Branch:** `feat/prescription-template-upload`

## Post-merge follow-up (not part of PR 1)

Ali performs these once PR 1 is merged but BEFORE PR 2 development starts:

1. Create the `prescription-templates` bucket via Supabase dashboard (5 MB, PNG/JPG, private)
2. Run `scripts/prescription-templates-bucket.sql` in Supabase SQL editor
3. Apply the `ALTER TABLE` portion of the migration to production (the schema.sql edit is the canonical record; production needs an explicit migration run)
4. Verify by uploading a test template via DoctorForm, confirming the row appears, and re-verifying RLS denials via SQL queries against a non-org-member identity

## Decision points still open

None at plan-acceptance time. All 5 architectural decisions resolved in the "Approved decisions" section above.
