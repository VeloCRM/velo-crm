# X-ray UI Tab (PR-B) — Phase 1 Diagnostic (read-only)

**Date:** 2026-06-23 · **Status:** DIAGNOSTIC ONLY — no code/schema/Supabase changes.
PR-B activates the live X-ray backend (PR #38: `xrays` table + `patient-xrays` bucket + `src/lib/xrays.js`,
dormant on master). Greenfield UI. Decisions carried from PR #38: bucket `patient-xrays`; MIME jpeg/png/webp;
thumbnails via `thumbnail_data_url` (client canvas); batch = per-file best-effort + summary toast; mini-FDI
teeth picker; doctor CRUD / receptionist read-only.

---

## Backend API surface (verified on master — `src/lib/xrays.js`)
All exports the UI needs exist with matching signatures — **no `xrays.js` changes required:**
| Export | Signature | UI use |
|---|---|---|
| `fetchXrays` | `(patientId)` → rows[] (uploader embedded, `date_taken` DESC) | grid load |
| `fetchXraysByBatch` | `(batchId)` → rows[] | batch retry/review |
| `uploadXray` | `({patientId, file, metadata, thumbnailDataUrl, batchId})` → row | upload |
| `updateXray` | `(xrayId, updates)` → row | lightbox metadata edit |
| `deleteXray` | `(xrayId)` → void | lightbox delete |
| `getXraySignedUrl` | `(xrayId, expiresIn=3600)` → `{url, fileName}` | full-size view |
| `generateThumbnail` | `(file)` → base64 JPEG data URL (EXIF-aware; may throw → caller falls back to null) | upload preview/thumb |

**One adjacency (NOT a backend gap):** `fetchXrays` returns `treatment_plan_id` (a UUID) but not the plan's
label. The upload modal's optional treatment dropdown AND the lightbox's "linked treatment" display both need
plan names → use `fetchTreatmentPlansForPatient(patientId)` from `src/lib/dental.js` (already exists) and map
by id client-side. **Do not add an embed to `xrays.js`** (it's merged; would need its own PR) — the dental.js
helper covers it.

## Slot points (file:line, verified)
- **Tab nav array** — `App.jsx:1709-1719`. Insert between `dental_chart` (1714) and `treatments` (1715):
  `{ id: 'xrays', label: isRTL ? 'الأشعة' : 'X-rays' }`.
- **Lazy import** — `App.jsx:36-52` (add an `XraysTab` lazy alongside the other dental tabs).
- **Render block** — mirror `App.jsx:~1982` (`{profileTab === 'documents' && <Suspense>…}`) → add an `xrays` block.
- **`heavyTab`** — `App.jsx:1725` (add `profileTab === 'xrays'`).

## Reusable (verified)
- **Upload pattern** — `DocumentsTab` dropzone + per-file loop + summary toast (`DentalTabs.jsx:1846-1946`):
  `dropZone`, `handleFiles` (per-file try/catch, `firstError` aggregation), `fileInputRef`, drag handlers,
  role-gated. Adapt for the modal (+ metadata, + `batchId`, + per-file `generateThumbnail`, + per-file retry).
- **`ToothLabel`** (`src/components/ToothLabel.jsx`) — FDI/Palmer-aware tooth label for `MiniToothChart`.
- **`useMyToothNotation`** (`src/hooks/useMyToothNotation.js`) — notation-aware labels.
- **`Modal`, `FormField`, `inputStyle`, `selectStyle`** (`src/components/shared`) — modal + form fields.
- **`fetchTreatmentPlansForPatient`** (`src/lib/dental.js`) — treatment dropdown + lightbox label.

## ❌ NOT reusable / net-new
- **Lightbox.** Documents has NO in-app viewer — it `window.open`s a signed URL (`DentalTabs.jsx:1887-1911`).
  X-rays need zoom/pan/pinch + metadata sidebar → **build new**. No `react-zoom-pan-pinch`/lightbox dep exists
  (project runtime deps: supabase, react, react-dom, react-router, tailwind only). **Recommend a custom
  transform-based viewer** (wheel zoom, drag pan, touch pinch via pointer events) to keep the lean dep tree;
  if pinch/inertia balloons, `react-zoom-pan-pinch` is the fallback — **flag the ~bundle cost first.**

## 🚩 Gaps to resolve (guardrail: not silent additions)
1. **`useMyRole` + `EDIT_ROLES` are inline in `DentalTabs.jsx` (not exported).** `XraysTab` (new file) needs
   role gating. Recommend a small **`src/hooks/useMyRole.js`** (mirrors `useMyToothNotation`) + a local
   `XRAY_EDIT_ROLES = new Set(['owner','doctor'])` in the xray feature. New hook file, not a backend change.
2. **`UPPER_TEETH`/`LOWER_TEETH` FDI arrays are inline in `DentalTabs.jsx` (not exported).** `MiniToothChart`
   can redefine them trivially (4 lines) or they can be lifted to a shared const — minor.

## Component breakdown (proposed: `src/components/xray/` feature folder)
| Component | Role | Complexity |
|---|---|---|
| `XraysTab.jsx` | orchestrator: `useMyRole` gate, `fetchXrays` on mount, owns grid/modal/lightbox state | **M** |
| `XrayGrid.jsx` | thumbnails grouped by `date_taken` (newest first) + filter chips by `xray_type`; `thumbnail_data_url` img with placeholder fallback | **M** |
| `XrayUploadModal.jsx` | multi-file dropzone (reuse Documents pattern) + per-file thumb preview + form (type/date/`MiniToothChart`/treatment/notes) + per-file `uploadXray` with shared `batchId` + summary toast + retry | **L** |
| `XrayLightbox.jsx` | `getXraySignedUrl` full image + zoom/pan/pinch + metadata sidebar (date/type/teeth via `ToothLabel`/treatment label/notes) + edit (`updateXray`) + delete (`deleteXray`), Esc/backdrop close | **L** |
| `MiniToothChart.jsx` | clickable FDI grid (toggle select) → FDI string[] for `teeth_shown`; reuses `ToothLabel`; simpler than `ToothSurfaces` (no wedges) | **M** (fallback chip selector = **S**) |
| `src/hooks/useMyRole.js` | shared role hook (gap #1) | **S** |
| App.jsx wiring | tabs array + lazy import + render block + `heavyTab` | **S** |

## UX state flow
`empty` → `loading` → `loaded` → (`upload` modal) → `loaded` → (`lightbox`) → (`edit`/`delete`) → `loaded`
- **empty (role-aware):** doctor → "No X-rays yet" + prominent Upload; receptionist → "X-rays will appear here
  once your doctor uploads them" (no Upload).
- **loading:** skeleton grid placeholders.
- **loaded:** date-grouped thumbnail grid + `xray_type` filter chips; hover → date+type; click → lightbox.
- **upload:** dropzone (drag/browse, multi) → per-file thumbnail preview → type/date/teeth/treatment/notes →
  Save → per-file upload (shared `batchId`) → summary toast "4 of 5 uploaded — 1 failed: <name>" + retry-failed.
- **lightbox:** full image, zoom (wheel/±), pan (drag), pinch (touch), Esc/backdrop close, metadata sidebar;
  doctor sees Edit + Delete (Edit → inline metadata form via `updateXray`; Delete → confirm → `deleteXray`).

## Permissions (receptionist read-only)
Backend RLS already denies receptionist writes (PR #38, table + storage). UI mirrors via `useMyRole`:
`canEdit = role ∈ {owner, doctor}` → hide Upload / Edit / Delete; receptionist gets the read-only empty state
and a view-only lightbox. Defense in depth (UI hides; RLS enforces).

## Mobile / tablet (Iraqi clinics, chairside tablets)
- Lightbox: **touch pinch-zoom** is the main complexity (pointer events / `touch-action`); double-tap to
  reset. Grid: responsive reflow (CSS grid auto-fill). Upload modal: full-screen on narrow widths.

## Edge cases
- Thumbnail gen fails / `thumbnail_data_url` null → grid shows an "Image" icon placeholder (still clickable).
- Signed-URL fetch fails in lightbox → retry once, then an error state with a manual retry button.
- Very large batch (>20 files) → warn + recommend chunking (uploads are sequential per-file already).
- Concurrent uploads from multiple tabs → low priority; `batch_id` is per-tab so no collision (flag only).

## Recommended PR shape — SPLIT (recommended) vs single
This is 5 components + a hook + wiring + a net-new zoom lightbox → larger than PR #36/#37. Recommend **2 PRs**:
- **PR-B1 (L):** `useMyRole` hook + `XraysTab` + `XrayGrid` + `XrayUploadModal` + `MiniToothChart` + App wiring.
  Interim full-size view = `getXraySignedUrl` → `window.open` (same as Documents). Ships a *usable* feature:
  doctors upload, everyone browses thumbnails grouped by date with type filters.
- **PR-B2 (M-L):** `XrayLightbox` (zoom/pan/pinch + metadata sidebar + inline edit/delete), replacing the
  new-tab open. Isolates the riskiest piece (touch zoom) so B1 isn't blocked on it.
Single combined PR-B is viable if Ali prefers one ship (L-XL). `/code-review` + (B1) `/security-review` not
needed (no new RLS/bucket — backend already reviewed); `/code-review` each. No `api/` files → Vercel 12/12.

## Open questions for Ali
1. **PR shape:** B1 (tab+grid+upload, interim new-tab view) then B2 (lightbox), or one combined PR-B?
2. **Lightbox:** custom transform-based zoom/pan (recommended, no dep) vs `react-zoom-pan-pinch` (bundle cost)?
3. **Edit scope in lightbox:** full metadata edit (type/date/teeth/treatment/notes — `updateXray` supports all) or notes-only for V1?
4. **Date grouping:** by exact `date_taken` or by month? Filter chips = all 6 types always, or only types present?
5. **Batch cap:** >20 files → hard cap / warn / chunk?
6. **MiniToothChart:** respect the doctor's FDI/Palmer pref for labels (store FDI always) — confirm; and confirm mini-chart over chip-selector for V1 (fallback if it exceeds ~4h).

## Recommended next steps
1. Get Ali's answers (esp. #1 PR shape, #2 lightbox approach, #3 edit scope).
2. Phase 2 → PR-B1 (tab + grid + upload), then PR-B2 (lightbox). `/code-review` before each merge.
