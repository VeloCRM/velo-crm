# PR 4 — Documents Module (Path A)

**Branch:** `feat/documents-module`
**Status:** plan
**Date:** 2026-05-29
**Author:** Ali (decisions) + Claude (drafting)

## Goal

Build a per-patient documents module — arbitrary file attachments (PDFs, images,
Office docs, plain text) stored in Supabase Storage, listed in a new tab inside
the patient profile:

- New `public.documents` table (flat: one row per uploaded file) with RLS that
  mirrors PR #2's prescriptions pattern (`org_id = public.current_org_id()` +
  `_own_org` / `_operator` policy sets)
- A new private Storage bucket `patient-documents` (25 MB cap, MIME-restricted)
  with org-scoped + role-gated RLS on `storage.objects`
- Data layer (`src/lib/documents.js`, NEW file) following the established
  `requireUser → orgId → sanitize → supabase → audit` envelope — 4 public
  helpers + 2 internal helpers
- A `DocumentsTab` inside `DentalTabs.jsx`, slotted **last** in the patient
  tab order, with upload (button + drag-and-drop), list, view, download, and
  delete

This is **PR 3 of the 3-module revival initiative** (Prescriptions → Notes →
Documents). After this lands, GHL imports can route document attachments to
DocumentsTab via the `external_id` / `external_source` keys.

**Out of scope for PR 4:**
- Notes module (PR #3 — separate)
- GHL import pipeline (future — depends on all modules landing)
- Document versioning / replace-in-place (uploads are immutable; replace = delete + re-upload)
- Folders / tagging / categorization beyond the flat list
- Inline preview/rendering of document contents (View opens the signed URL in a new tab — the browser renders it)
- Thumbnail generation
- Virus scanning (deferred — relies on MIME whitelist + size cap + bucket privacy for V1)

## Architectural decisions table

| Question | Decision | Why |
|----------|----------|-----|
| Table RLS pattern | **Codebase convention: `org_id = public.current_org_id()` + `_own_org` / `_operator` policy sets** (8 policies, 4 CRUD × 2 audiences). Mirrors PR #2's `prescriptions`. | Schema-wide consistency. No per-tenant table in this schema role-tightens via RLS; role gating happens at the UI layer (`EDIT_ROLES`) + audit log. UPDATE policies included even though uploads are immutable — cheap, idempotent, and forward-compatible if metadata edits are added later. |
| Storage RLS pattern | **Org-only guard on path segment 1 for all 4 ops; role check (`owner`/`doctor`/`receptionist`) added to INSERT/UPDATE/DELETE.** No "uploader = patient" or "uploader = self" restriction. | Documents are clinic-shared, not personal like prescription-pad templates. Any same-org clinical staff should read/write any patient's documents. Diverges deliberately from PR #17's self-folder role-tightening (that was for per-doctor pads). Role check inlined via a `profiles` EXISTS subquery — the established pattern (PR #17 `prescription_templates_insert`); no `is_org_member` helper exists in this schema, so inlining matches precedent rather than inventing a function. |
| Role gate width (UI `EDIT_ROLES`) | **`new Set(['owner', 'doctor', 'receptionist'])`** — wider than Prescriptions (`owner`/`doctor`). | Receptionists routinely handle paperwork (scans, ID copies, consent forms, insurance). The module-level `EDIT_ROLES` in DentalTabs.jsx stays at `owner`/`doctor`; DocumentsTab defines its own wider local constant. |
| Data-layer file | **NEW `src/lib/documents.js`** mirroring `src/lib/dental.js` + `src/lib/prescriptions.js`. | Clean discrete module. Keeps `database.js` from accreting further (same reasoning as PR #2). |
| Upload atomicity (storage vs row) | **Storage upload FIRST, then DB row insert.** On row-insert failure, best-effort delete the orphaned storage object so no ghost blob is billed/left. | A ghost storage object (no row) is invisible to the UI and wastes quota; a ghost row (no object) produces broken View/Download. Uploading first + cleaning up on row failure leaves the cleaner of the two failure modes recoverable, and the unique `{document_id}` path means a retry never collides. |
| Delete atomicity (object vs row) | **Storage delete FIRST, then row delete. If storage delete fails, do NOT delete the row.** | Prevents ghost rows pointing at missing objects. A failed storage delete leaves the row intact so the user sees the document still present and can retry — better than a row that 404s on View. |
| File size cap | **25 MB**, enforced client-side (fast-fail) + bucket-level limit (real gate). | Generous for scans/PDFs; bucket limit is the authoritative enforcement (client check is trivially bypassable). |
| MIME whitelist | `application/pdf`, `image/jpeg`, `image/png`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx), `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx), `text/plain`. Enforced in `uploadDocument` + bucket allowed-MIME list. | Covers the realistic clinical paperwork set (PDF scans, photos, Word/Excel, text). Rejects executables/archives/SVG (XSS vector). |
| Storage path scheme | **`{org_id}/{patient_id}/{document_id}.{ext}`** — 3 segments, document_id (a client-generated UUID) as the basename. | Org segment 1 drives the RLS guard (mirrors PR #17). patient_id segment 2 groups a patient's files for easy manual inspection. The UUID basename guarantees uniqueness so concurrent uploads of the same original filename never collide; the human-readable `file_name` lives in the DB column. |
| Client-side UUID | **`crypto.randomUUID()`** for the storage-path document_id; the DB row's own `id` is a separate server-generated `gen_random_uuid()`. | `crypto.randomUUID()` is available in all Vite-8/React-19 target browsers. The path UUID and row id are intentionally independent — the path is computed before the insert, so it can't depend on the row id. |
| No trigger | **No DB trigger for `documents`.** | Unlike prescriptions (doctor-role invariant), documents have no cross-table semantic invariant to enforce. FK + RLS + cascade are sufficient. |
| `uploaded_by` ON DELETE | `REFERENCES auth.users(id) ON DELETE SET NULL`. | Matches `prescriptions.created_by` — a deleted uploader shouldn't cascade-delete clinical records; NULL signals "uploader account removed". |
| External-system import columns | `external_id text NULL` + `external_source text NULL` + partial unique index on `(external_source, external_id) WHERE external_id IS NOT NULL`. | Same forward-compat reasoning as PR #2 — cheap now, expensive to retrofit once GHL document imports start. |
| View vs Download | **Both use a 1-hour signed URL** from `getDocumentSignedUrl(id)`. View opens it in a new tab (browser renders/inline); Download forces a save via an anchor `download` attribute. | Single signed-URL helper serves both. 1-hour TTL is generous for a user who opens then downloads. `document.view` audit fires on signed-URL generation (the unambiguous access-intent signal). |
| Audit events | `document.upload`, `document.view`, `document.delete`. No event on plain list fetch. | View is audited because accessing a patient document is a PHI-access event clinics may need to trace. List-load is passive. |
| RTL / locale | English + Arabic strings inline (mirrors all other dental tabs). Dates via `toLocaleDateString` with `ar-IQ-u-ca-gregory`. | Consistent with DentalTabs.jsx. |

## Schema spec

`public.documents` — 11 columns:

```sql
CREATE TABLE public.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  mime_type       text,
  file_size       bigint,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  external_id     text,
  external_source text
);
```

Indexes:
- `documents_patient_idx` on `(patient_id)`
- `documents_org_idx` on `(org_id)`
- `documents_external_uidx` UNIQUE on `(external_source, external_id) WHERE external_id IS NOT NULL`

RLS: `ENABLE ROW LEVEL SECURITY` + 8 policies (`documents_{select,insert,update,delete}_{own_org,operator}`), all in idempotent `DO` blocks guarded against `pg_policies`.

## Storage spec

Bucket `patient-documents`:
- Public: OFF (private)
- File size limit: 26214400 (25 MB)
- Allowed MIME types: the 8-type whitelist above
- Created manually via Supabase dashboard (size/MIME not cleanly settable via SQL — same as PR #17)

Path: `{org_id}/{patient_id}/{document_id}.{ext}` — `storage.foldername(name)[1]` = org UUID, `[2]` = patient UUID, basename = `{document_id}.{ext}`.

4 RLS policies on `storage.objects` for `bucket_id = 'patient-documents'`, all idempotent `DO` blocks:
- `documents_storage_select` — caller's `profiles.org_id` ∈ segment-1 match (any authenticated org member can read)
- `documents_storage_insert` — segment-1 org match **AND** caller role ∈ (`owner`,`doctor`,`receptionist`)
- `documents_storage_update` — same predicate as insert
- `documents_storage_delete` — same predicate as insert

## Data layer spec (`src/lib/documents.js`)

Standard envelope: `requireUser()` → `getCurrentOrgId()` → sanitize → supabase call → `logAuditEvent` on mutations. snake_case in/out (matches dental.js + prescriptions.js — no camelCase mappers).

Public helpers (4):
1. `uploadDocument(patientId, file)` — validates MIME + size; generates `crypto.randomUUID()`; uploads to `{org_id}/{patientId}/{uuid}.{ext}`; inserts the row (`file_name`, `storage_path`, `mime_type`, `file_size`, `uploaded_by`); on row-insert failure best-effort removes the orphaned object. Returns the inserted row. Audit: `document.upload`.
2. `fetchDocumentsForPatient(patientId)` — returns the patient's documents ordered by `created_at DESC`. No audit (passive load).
3. `getDocumentSignedUrl(id)` — fetches the row's `storage_path`, returns a 1-hour signed URL. Audit: `document.view`.
4. `deleteDocument(id)` — fetches `storage_path`; deletes the storage object FIRST; only if that succeeds, deletes the row. Audit: `document.delete`.

Internal helpers (2):
5. `deriveExt(fileName)` — extracts the extension, lowercased, validated against `/^[a-z0-9]+$/i`; throws/falls back if the "extension" isn't alphanumeric (guards against path-injection via crafted filenames).
6. `sanitizeFileName(fileName)` — strips HTML and path separators, caps length, for the stored `file_name` display column.

MIME whitelist + 25 MB size check live in `uploadDocument`, throwing clear user-facing error messages.

## UI spec (`DocumentsTab` in `DentalTabs.jsx`)

- Named export `DocumentsTab`, slotted last in tab order.
- Local `DOCUMENTS_EDIT_ROLES = new Set(['owner', 'doctor', 'receptionist'])` (wider than the file-level `EDIT_ROLES`).
- Header: "Documents" title + (canEdit) "Upload" button that triggers a hidden `<input type="file">` with an `accept` attribute restricting to the whitelist.
- States: loading | empty | list.
- Per-row: mime-based icon, `file_name`, human-formatted `file_size` (a `formatFileSize` helper), relative/medium `created_at`, uploaded-by name.
- Per-row actions: **View** (open signed URL in new tab), **Download** (force download via signed URL + `download` attr), **Delete** (canEdit only, confirm modal).
- Upload UX: button + drag-and-drop zone. When empty, the drop-zone fills the tab body; when documents exist, it's a thin strip above the list. On file pick/drop → `uploadDocument(patient.id, file)` → toast success/error → reload.

### App.jsx integration
- `lazy()` shim `DentalDocuments` → `m.DocumentsTab`
- `tabs[]` entry `{ id: 'documents', label: isRTL ? 'الوثائق' : 'Documents' }` (last)
- Extend `heavyTab` condition with `|| profileTab === 'documents'`
- Render branch `{profileTab === 'documents' && <Suspense…><DentalDocuments …/></Suspense>}`

## Items to verify during execution

1. Confirm `schema.sql` end (append point) — was line 1825 at planning time; append the documents section after the prescriptions section.
2. Confirm `crypto.randomUUID()` is acceptable (no uuid lib in repo) — confirmed: no uuid dependency, browser API is fine.
3. Confirm `Icons` available for file/view/download — `Icons.image`, `Icons.eye`, `Icons.download`, `Icons.upload`, `Icons.externalLink`, `Icons.trash`, `Icons.x`, `Icons.plus` exist; no generic "file" icon, so render a small inline SVG glyph for non-image mime types.
4. Confirm storage RLS role-check inlining vs a helper — no `is_org_member` helper exists; inline the `profiles` EXISTS subquery (PR #17 precedent).
5. Build/lint baseline 46/37/9 — keep unchanged.

## Backlog implications

- **Vercel function count:** this PR adds NO serverless function (pure client + Storage + RLS), so it does NOT touch the 12/12 Hobby-tier limit. Safe.
- **GHL import pipeline (future):** the `external_id` / `external_source` keys let imported document attachments dedupe and route to DocumentsTab.
- **PR #17 upload-bug parallel:** the silent-RLS-rejection failure mode (toast says success but row/URL stays empty) is the kind of bug PR #17 hit. The storage-first + orphan-cleanup ordering and the explicit row-insert error surfacing here are designed to avoid the same class of silent failure.

## Commits (4)

| # | Commit | Files | Why this boundary |
|---|--------|-------|-------------------|
| 0 | `docs(plan): PR 4 documents module` | `plans/pr-4-documents-module.md` | Plan first — captures locked decisions as a reviewable artifact. |
| 1 | `feat(schema): documents table + bucket + RLS` | `src/lib/schema.sql`, `scripts/documents-migration.sql`, `scripts/patient-documents-bucket.sql` | DB shape + storage policies reviewable in isolation; idempotent for safe re-runs. |
| 2 | `feat(database): src/lib/documents.js` | `src/lib/documents.js` (new) | Data layer builds on the schema. |
| 3 | `feat(dental): DocumentsTab in DentalTabs.jsx` | `src/components/DentalTabs.jsx`, `src/App.jsx` | UI last, builds on the data layer. |

## Post-merge runbook (Ali performs)

1. Run `scripts/documents-migration.sql` in the Supabase SQL editor. Verify: `documents` table exists; `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'documents_%'` returns 8.
2. Create the `patient-documents` bucket via the dashboard (private, 25 MB, 8-MIME whitelist).
3. Run `scripts/patient-documents-bucket.sql`. Verify Storage → patient-documents → Policies shows 4 policies.
4. After Vercel auto-deploys: open a patient → Documents tab → upload a test PDF → View → Download → Delete; confirm `audit_log` has `document.upload`, `document.view`, `document.delete`.
