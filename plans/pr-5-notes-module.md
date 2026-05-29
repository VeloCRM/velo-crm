# PR 5 — Notes Module (Path A)

**Branch:** `feat/notes-module`
**Status:** plan
**Date:** 2026-05-29
**Author:** Ali (decisions) + Claude (drafting)

## Goal

Per-patient clinical notes — short free-text entries (optional title, pinnable)
listed in a new tab inside the patient profile:

- New `public.notes` table (flat: one row per note) with RLS mirroring the
  prescriptions (PR #2) and documents (PR #4) convention (`org_id =
  public.current_org_id()` + `_own_org` / `_operator` policy sets)
- Data layer (`src/lib/notes.js`, NEW file) following the established
  `requireUser → orgId → sanitize → supabase → audit` envelope — 4 helpers
- A `NotesTab` inside `DentalTabs.jsx`, slotted **between** PrescriptionsTab and
  DocumentsTab, with create / list / pin / edit / delete

This is the last of the 3-module revival initiative (Prescriptions → Notes →
Documents). With all three landed, GHL imports can route note content to
NotesTab via the `external_id` / `external_source` keys (and `external_user_id`
preserves the GHL author for traceability).

**Out of scope for PR 5:**
- Note categories / tags / folders (V2)
- Attachments on notes (use the Documents tab for files)
- Rich-text / markdown rendering (plain text in V1)
- Note threading / replies / mentions
- Versioning beyond the `updated_at` / `updated_by` partial audit trail
- GHL import pipeline (future — depends on all modules landing)

## Architectural decisions table

| Question | Decision | Why |
|----------|----------|-----|
| Table RLS pattern | **Codebase convention: `org_id = public.current_org_id()` + `_own_org` / `_operator` policy sets** (8 policies, 4 CRUD × 2 audiences). Mirrors `prescriptions` and `documents`. | Schema-wide consistency; no per-tenant table role-tightens via RLS. Role gating happens at the UI layer (`EDIT_ROLES`) + audit log. |
| No trigger | **No DB trigger for `notes`.** | Notes carry no cross-table semantic invariant (unlike prescriptions' doctor-role check). FK + RLS are sufficient. `updated_at` is set explicitly by the data layer (no `set_updated_at` trigger needed — keeps the table trigger-free and the partial-audit-trail NULL semantics intact). |
| No Storage | **Pure text rows, no Storage bucket.** | Notes are free text. File attachments belong in the Documents module (PR #4). |
| Role gate (UI `EDIT_ROLES`) | **`new Set(['owner', 'doctor'])`** — narrower than Documents (`owner`/`doctor`/`receptionist`). | Clinical notes are doctor-authored medical record; receptionists don't write them. Matches the prescriptions gate. NotesTab uses the file-level `EDIT_ROLES` constant directly (same value), not a local override. |
| `pinned` as a column vs separate table | **Boolean column on `notes`, default false.** | A single boolean is the simplest representation of "pin to top". A separate pin-state table would be over-engineering for a per-note flag with no extra metadata. |
| List ordering | **`pinned DESC, created_at DESC`** — pinned notes float to the top, newest-first within each group. | Pinned = "keep visible"; recency is the natural secondary sort. Backed by a composite index. |
| Data-layer file | **NEW `src/lib/notes.js`** mirroring `dental.js` / `prescriptions.js` / `documents.js`. | Clean discrete module; keeps `database.js` from accreting. |
| Audit columns | `updated_at timestamptz NULL` + `updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`. NULL `updated_at` = never edited since creation. | Same partial-audit-trail pattern as `prescriptions`. |
| External-system import columns | `external_id text NULL` + `external_source text NULL` + partial unique index on `(external_source, external_id) WHERE external_id IS NOT NULL`, **plus** `external_user_id text NULL` (no FK). | Same forward-compat reasoning as PR #2/#4. `external_user_id` additionally preserves the GHL note author — GHL users don't exist in our `auth.users`, so it's a bare text column for traceability, not a FK. |
| `created_by` / `updated_by` ON DELETE | `REFERENCES auth.users(id) ON DELETE SET NULL`. | A deleted author account must not cascade-delete clinical records. |
| Audit events | `note.create`, `note.update`, `note.delete`. No event on list fetch. | Notes are PHI; create/update/delete are the meaningful mutations. List-load is passive. |
| RTL / locale | English + Arabic strings inline (mirrors all other dental tabs). Dates via `toLocaleDateString` with `ar-IQ-u-ca-gregory`. | Consistent with DentalTabs.jsx. |

## Schema spec

`public.notes` — 12 columns:

```sql
CREATE TABLE public.notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  body             text NOT NULL,
  title            text,
  pinned           boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id      text,
  external_source  text,
  external_user_id text
);
```

Indexes:
- `notes_patient_idx` on `(patient_id)`
- `notes_org_idx` on `(org_id)`
- `notes_pinned_idx` on `(patient_id, pinned DESC, created_at DESC)` — backs the list query
- `notes_external_uidx` UNIQUE on `(external_source, external_id) WHERE external_id IS NOT NULL`

RLS: `ENABLE ROW LEVEL SECURITY` + 8 policies (`notes_{select,insert,update,delete}_{own_org,operator}`), all idempotent `DO` blocks guarded against `pg_policies`.

No trigger.

## Data layer spec (`src/lib/notes.js`)

Standard envelope: `requireUser()` → `getCurrentOrgId()` → sanitize → supabase call → `logAuditEvent` on mutations. snake_case in/out (matches sibling modules — no camelCase mappers).

1. `createNote(patientId, { body, title?, pinned? })` — `body` required (throws if empty after trim); `title` / `pinned` optional. `body` sanitized via `sanitizeNotes` (5000-char cap); `title` via `sanitizeText` (200). Inserts with `created_by`. Returns the row. Audit: `note.create`, payload `{ patient_id, has_title, pinned }`.
2. `fetchNotesForPatient(patientId)` — returns notes ordered `pinned DESC, created_at DESC`. No audit (passive load).
3. `updateNote(id, { body?, title?, pinned? })` — partial patch; always sets `updated_at` + `updated_by`. `body`/`title` sanitized when present. Audit: `note.update`, payload `{ fields: [...changed] }`.
4. `deleteNote(id)` — single-row delete (no cascade concerns). Audit: `note.delete`.

## UI spec (`NotesTab` in `DentalTabs.jsx`)

- Named export `NotesTab`, slotted between `PrescriptionsTab` and `DocumentsTab`.
- Uses the file-level `EDIT_ROLES` (`owner`/`doctor`).
- Header: "Notes" / "الملاحظات" title + (canEdit) "+ New Note" / "+ ملاحظة جديدة" button.
- States: loading | empty | list (pinned first, then `created_at DESC`).
- Per-note card: title (bold, if present), a pinned badge when pinned, full body (short notes — no truncation in V1), footer with author name + relative/medium date.
- Per-card actions (canEdit only): Pin/Unpin toggle (single click → `updateNote(id, { pinned: !pinned })`), Edit, Delete (confirm modal).
- `NoteEntryModal` handles both new and edit (via an `existing` prop, same idiom as `PrescriptionEntryModal`): optional title input (maxLength 200), required body textarea (autoFocus, maxLength 5000), pinned checkbox; Cancel + Save/Update footer.
- Bilingual strings inline.

### App.jsx integration
- `lazy()` shim `DentalNotes` → `m.NotesTab`
- `tabs[]` entry `{ id: 'notes', label: isRTL ? 'الملاحظات' : 'Notes' }`, ordered **between** `prescriptions` and `documents`
- Extend `heavyTab` with `|| profileTab === 'notes'`
- Render branch `{profileTab === 'notes' && <Suspense…><DentalNotes …/></Suspense>}`

## Items to verify during execution

1. Confirm `schema.sql` append point (was line 1969 — end of the documents storage-RLS note).
2. Confirm `sanitizeNotes` (5000 cap) + `sanitizeText` exist in `src/lib/sanitize.js` — confirmed in PR #4.
3. Confirm `Icons` for pin/edit — check `shared.jsx`; use an inline pin glyph if none exists.
4. Build/lint baseline 46/37/9 — keep unchanged.

## Backlog implications

- **Vercel function count:** NO serverless function added (pure client + Supabase + RLS), so the 12/12 Hobby-tier limit is untouched.
- **Categories / tags (V2):** would add a `category` column or join table; deferred.
- **Attachments:** intentionally not on notes — the Documents tab (PR #4) owns files.
- **GHL import pipeline (future):** `external_id` / `external_source` dedupe + route imported notes; `external_user_id` preserves the GHL author.

## Commits (4)

| # | Commit | Files | Why this boundary |
|---|--------|-------|-------------------|
| 0 | `docs(plan): PR 5 notes module` | `plans/pr-5-notes-module.md` | Plan first — locked decisions as a reviewable artifact. |
| 1 | `feat(schema): notes table + RLS` | `src/lib/schema.sql`, `scripts/notes-migration.sql` | DB shape reviewable in isolation; idempotent for safe re-runs. |
| 2 | `feat(database): src/lib/notes.js` | `src/lib/notes.js` (new) | Data layer builds on schema. |
| 3 | `feat(dental): NotesTab in DentalTabs.jsx` | `src/components/DentalTabs.jsx`, `src/App.jsx` | UI last, builds on data layer. |

## Post-merge runbook (Ali performs)

1. Run `scripts/notes-migration.sql` in the Supabase SQL editor. Verify: `notes` table exists; `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'notes_%'` returns **8**. (No bucket needed — pure text.)
2. After Vercel auto-deploys: open a patient → Notes tab → create a note → pin it → edit → delete; confirm `audit_log` has `note.create`, `note.update`, `note.delete`.
