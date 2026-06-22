# X-ray Tab — Phase 1 Diagnostic (read-only)

**Date:** 2026-06-23 · **Status:** DIAGNOSTIC ONLY — no code, no schema, no Supabase changes.
Third/final dentist V1 ask: a dedicated **X-rays tab** in the patient profile (type / date / teeth /
notes + image). Greenfield. Closest existing pattern = the **Documents** feature.

---

## 🚩 Headline findings (verify before building)

1. **A legacy `xrays` table + `dental-xrays` bucket already exist *in an old migration script* —
   `scripts/dental-persistence-migration.sql` (lines 124-198).** It is **NOT** in the canonical
   `src/lib/schema.sql` (which is the source of truth), and it uses the **pre-rebuild "contacts"
   model**: `contact_id → contacts(id)`, `organizations(id)` (not `orgs`), bucket `dental-xrays`,
   columns `taken_date`/`size_bytes`/`notes` — **no** `xray_type`, `teeth_shown`, `treatment` link, or
   `batch_id`. There is **no `src/lib/xrays.js`** (confirmed). So this script is almost certainly a
   **dead, never-applied artifact** from before the 23-table schema rebuild.
   - **MUST verify in production (human SQL):** does a `public.xrays` table and/or a `dental-xrays`
     Storage bucket actually exist? `\d public.xrays` + Storage → buckets list.
     - **If absent (expected):** build the V1 table fresh (below); ignore/delete the legacy script.
     - **If present:** it has the wrong shape (`contact_id`, no enum). Reconcile first — drop it (after
       confirming empty) so the V1 `CREATE TABLE` doesn't collide, or write the V1 migration as an
       `ALTER`. Do NOT silently `CREATE TABLE IF NOT EXISTS` over a differently-shaped legacy table.
   - **Bucket name decision:** use **`patient-xrays`** (matches the V2 plan + the `patient-documents`
     naming convention), NOT the legacy `dental-xrays`. Flag for Ali.

2. **Guardrail — could `documents` absorb X-rays instead of a new table?** No (verify-confirmed): the
   `documents` table (`schema.sql:1897`) has only `file_name, storage_path, mime_type, file_size,
   uploaded_by` + external-import keys. It has **no** `xray_type`, `date_taken`, `teeth_shown`,
   treatment link, or `batch_id` — the clinical metadata the dentist asked for. Image MIME types *are*
   allowed in documents, so xray JPEGs could technically land there, but the metadata + the
   grouped-by-date/type display + the read-only-receptionist rule justify a **dedicated table**.
   Recommend the new table; confirm with Ali.

3. **Permission divergence from Documents (important).** The `patient-documents` storage RLS allows
   **owner / doctor / receptionist** writes (`scripts/patient-documents-bucket.sql:76`). The X-ray ask
   is **doctors full CRUD, receptionists READ-only**. So the X-ray write policies must be
   **owner / doctor ONLY** (drop `receptionist`). This matches the clinical dental tabs, which use
   `EDIT_ROLES = new Set(['owner','doctor'])` (`DentalTabs.jsx:58`) — X-rays should use **that**
   `EDIT_ROLES`, not the Documents one.

---

## Patterns to mirror (verified)

| Concern | Reuse from | Ref |
|---|---|---|
| Data-layer shape (upload→storage-first→insert; signed-URL view; delete storage-first) | `src/lib/documents.js` | whole file |
| Storage path `{org_id}/{patient_id}/{id}.{ext}`, UUID basename, 25 MB cap | `documents.js:120-181` | |
| Storage bucket RLS (seg-1 org guard + role gate, 4 policies, idempotent DO blocks) | `scripts/patient-documents-bucket.sql` | swap bucket name + drop receptionist |
| Table RLS (`current_org_id()` + `is_operator()`, _own_org + _operator, 8 policies) | `documents` table block | `schema.sql:1925+` |
| Tab component shape (`{patient, lang, dir, toast}`, `useMyRole`, `EDIT_ROLES`, reload/toast) | `DocumentsTab` | `DentalTabs.jsx:1817` |
| Clinical edit-role gate (owner/doctor) | `EDIT_ROLES` | `DentalTabs.jsx:58` |
| FDI tooth UI for the teeth multi-select | `ToothLabel` / `surfaceLayout` / the chart grid (PR #36/#37) | `src/lib/toothSurfaces.js`, `ToothLabel.jsx` |

---

## Proposed V1 schema (org-scoped — convert V2 doctor-centric → V1)

```sql
CREATE TYPE xray_type AS ENUM ('bitewing','periapical','panoramic','occlusal','cbct','other');

CREATE TABLE IF NOT EXISTS public.xrays (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id)           ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES public.patients(id)       ON DELETE CASCADE,
  treatment_plan_id uuid          REFERENCES public.treatment_plans(id) ON DELETE SET NULL, -- optional link
  file_name         text NOT NULL,
  storage_path      text NOT NULL,                 -- {org_id}/{patient_id}/{xray_id}.{ext}
  mime_type         text,
  file_size         bigint,
  xray_type         xray_type NOT NULL DEFAULT 'other',
  date_taken        date NOT NULL DEFAULT current_date,
  teeth_shown       text[] NOT NULL DEFAULT '{}',  -- FDI codes, e.g. {'16','17','46'}
  notes             text,
  batch_id          uuid,                          -- groups a multi-file upload
  uploaded_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()  -- xrays are editable (lightbox metadata edit)
);
CREATE INDEX xrays_patient_idx       ON public.xrays(patient_id);
CREATE INDEX xrays_org_idx           ON public.xrays(org_id);
CREATE INDEX xrays_patient_date_idx  ON public.xrays(org_id, patient_id, date_taken DESC);
CREATE INDEX xrays_batch_idx         ON public.xrays(batch_id) WHERE batch_id IS NOT NULL;
ALTER TABLE public.xrays ENABLE ROW LEVEL SECURITY;
-- 8 RLS policies mirroring documents: _own_org via current_org_id(), _operator via is_operator().
-- TABLE RLS is org-scoped (any org member reads+writes); the owner/doctor-only clinical gate +
-- receptionist-read-only live in the UI (EDIT_ROLES) and the Storage write policies.
```
Differences vs V2 spec (`ARCH-V2-PLATFORM.md:361`): `doctor_id NOT NULL` → **`org_id NOT NULL`**;
`treatment_id` → **`treatment_plan_id`** (V1 has `treatment_plans`, not `treatments`); storage path
`{doctor_id}/…` → **`{org_id}/…`**. `xray_type`, `teeth_shown`, `batch_id`, `date_taken` carry forward.
`updated_at` added (V2 spec omitted it but xrays are editable) — maintain in `updateXray` or a trigger.

## Proposed Storage (mirror `patient-documents-bucket.sql`)
- Bucket **`patient-xrays`**, private, 25 MB, MIME `image/jpeg`, `image/png` only (**DICOM/CBCT deferred
  to V2.1** — most intraoral/phone-camera images are JPEG; `cbct`/`other` stay as `xray_type` *labels*
  on a JPEG export). Manual dashboard creation.
- 4 storage.objects policies, seg-1 org guard identical to documents, **write roles `('owner','doctor')`
  only** (drop `receptionist`). Path `{org_id}/{patient_id}/{xray_id}.{ext}`.

## UI slot points (file:line)
- **Tab nav array** — `App.jsx:1709-1719`. Insert between `dental_chart` (1714) and `treatments` (1715):
  `{ id: 'xrays', label: isRTL ? 'الأشعة' : 'X-rays' }`.
- **Lazy import** — `App.jsx:36-52` (add an `XraysTab` lazy import alongside the others).
- **Render block** — mirror `App.jsx:1982` (`{profileTab === 'xrays' && <Suspense><XraysTab …/></Suspense>}`).
- **`heavyTab`** — `App.jsx:1725` (add `profileTab === 'xrays'`).
- **Component file** — recommend a **new `src/components/XraysTab.jsx`** (NOT another export in
  `DentalTabs.jsx`, already ~2160 lines — well over the 800-line guideline). Data layer: new
  **`src/lib/xrays.js`** mirroring `documents.js`.

## Phased implementation + complexity
| Phase | Work | Complexity |
|---|---|---|
| **A. Schema** | `xray_type` enum + `xrays` table + indexes + 8 RLS policies; reconcile legacy table first | **S–M** (human-run SQL; risk is the legacy-table reconciliation) |
| **B. Storage** | `patient-xrays` bucket + 4 RLS policies (owner/doctor writes) | **S** (copy documents bucket script) |
| **C. Data layer** `src/lib/xrays.js` | `uploadXray` (+`batch_id`, `teeth_shown`, `treatment_plan_id`, `xray_type`, `date_taken`), `fetchXraysForPatient`, `getXraySignedUrl`, `updateXray` (metadata edit), `deleteXray`; batch upload helper | **M** (more than documents.js — metadata + batch) |
| **D. UI** `src/components/XraysTab.jsx` | grid grouped by date + filter chips; upload modal (type/date/teeth-multiselect/treatment-link/multi-file dropzone/notes); **lightbox** (full image, zoom/pan, metadata sidebar, edit + delete) | **L** (lightbox + zoom/pan + teeth picker + batch dropzone — the bulk of the work) |
| **E. Tab wiring** | `App.jsx` tabs array + lazy import + render block + `heavyTab` | **S** |
| **F. Tests** | none configured (CLAUDE.md) → manual Preview verification | **N/A** |

**No `api/` functions** (client → Supabase, like documents) → **Vercel stays 12/12.**

**Recommended PR shape: split into 2 (or 3).** This is larger than PR #36/#37.
- **PR-1: backend** — schema + storage + `xrays.js` (verifiable without UI).
- **PR-2: UI** — `XraysTab` grid + upload modal + lightbox + tab wiring.
- Optionally split PR-2 into *upload+grid* then *lightbox+edit* if the lightbox grows. Dental + Storage
  + RLS → `/code-review` **and** `/security-review` (new bucket + RLS) before each merge.

## Open questions for Ali
1. **Legacy reconciliation:** confirm whether `xrays`/`dental-xrays` exist in prod (I can't query). Drives whether Phase A is a clean CREATE or a reconcile.
2. **Bucket name:** `patient-xrays` (recommended) vs reuse legacy `dental-xrays`?
3. **DICOM/CBCT:** JPEG/PNG only for V1 (recommended), DICOM → V2.1? (`cbct` stays a type label.)
4. **Thumbnails:** (a) client-side canvas thumbnail uploaded as a separate `{id}_thumb.jpg` object (lean rows, one extra signed-URL per grid item — recommended), (b) a small `thumbnail_data_url text` column (no extra fetch, heavier rows), or (c) V1-simplest: no thumbnails, lazy-load originals at small CSS size (fine for the handful of xrays per patient; intraoral JPEGs are usually 0.5–3 MB)? Recommend (c) for V1 simplicity, (a) if grids feel heavy.
5. **Teeth multi-select UI:** reuse a clickable **mini FDI chart** (reuses `ToothLabel`/chart grid from PR #36/#37 — nicer but more work) vs a **chip/multi-select of FDI codes** (simpler fallback)? Guardrail tradeoff — your call.
6. **Batch partial failure:** strict **all-or-nothing** (roll back uploaded objects + rows on any failure) vs **per-file best-effort** with a summary toast ("3 of 5 uploaded", shared `batch_id` on successes)? Documents uploads one-at-a-time aggregating `firstError`; recommend per-file best-effort + summary for resilience, or all-or-nothing if you want atomic batches.
7. **Lightbox zoom/pan:** build a minimal transform-based lightbox (no dep, keeps bundle lean) vs add a small image-viewer library? Recommend custom/minimal for V1.

## Recommended next steps
1. Get Ali's answers (esp. #1 legacy check, #4 thumbnails, #5 teeth UI, #6 batch).
2. Phase 2a: backend PR (schema + storage + `xrays.js`).
3. Phase 2b: UI PR (`XraysTab`). `/code-review` + `/security-review` before each merge.
