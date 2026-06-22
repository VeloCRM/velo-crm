# 5-Surface Dental Chart — Phase 1 Diagnostic (read-only)

**Date:** 2026-06-22
**Feedback:** "each tooth has 5 layers, doctors mark per-surface and add comments per layer."
**Greenlit:** Option A — 2D anatomically-simplified tooth illustrations, 5 clickable surface regions,
modal with finding type + free-text comment + per-surface color. NOT 3D, NOT paint-on-image, NOT scanner.
**Status:** DIAGNOSTIC ONLY — no code, no schema changes.

---

## 🚩 Headline (scope-changing discovery — guardrail triggered)

**The backend for per-surface findings + comments ALREADY EXISTS. This is a UI-only change — NO schema
migration, NO data-layer build.** The guardrail "if surface AND comment columns already exist, this is
UI-only — FLAG it" is triggered:

| Layer | Already supports surfaces + comments? | Evidence |
|---|---|---|
| **Schema** | ✅ Yes | `dental_chart_entries.surface text` + `.notes text` — `schema.sql:284, 286` |
| **Data layer** | ✅ Yes | `addDentalChartEntry({tooth_number, surface, finding, notes})` writes both; `fetchDentalChartEntries` selects `surface, notes` — `dental.js:236, 244–276` |
| **Modal capture** | ✅ Yes | The add-finding modal already renders a **Surface `<select>`** (5 surfaces + "whole tooth") AND a **Notes `<textarea>`** — `DentalTabs.jsx:582–590` |
| **Findings list** | ✅ Yes (text) | Recent-findings list already shows `surface` + `notes` per entry — `DentalTabs.jsx:546–547` |
| **Visual chart** | ❌ **No** | The chart renders numbered **square boxes**, one finding per tooth, surface ignored |

So a dentist can *already* record "tooth 16, occlusal, cavity, '...comment'" today — via a dropdown. What's
missing is the **visual**: clickable per-surface regions and per-surface color on the chart. The word
"comment" in the feedback already exists as the **`notes`** column.

---

## 1. Current code state (verified)

### Live chart — `DentalTabs.jsx` `DentalChartTab` (`:361`–`:605`)
- **Tooth cell** (`:439`–`:460`): a square `<button>`, `aspect-ratio 1/1`, `2px solid {findingColor}`
  border, shows the tooth number (now via `<ToothLabel>` after the Palmer PR). One color per tooth.
- **Finding aggregation** (`:390`–`:396`): `findingByTooth` keeps the **most-recent finding per
  `tooth_number`** — `if (!(e.tooth_number in map)) map[e.tooth_number] = e.finding`. **Surface is
  discarded here.** Two findings on different surfaces of the same tooth collapse to whichever is newest.
- **Grid** (`:489`–`:494`): 16-col CSS grid, `UPPER_TEETH` / `LOWER_TEETH` arrays (`:332–333`).
- **Modal** (`:567`–`:602`): opens on `openTooth(n)`; fields = Finding `<select>` (`:576`), **Surface
  `<select>`** (`:582`, options from `SURFACE_OPTIONS`), **Notes `<textarea>`** maxLength 500 (`:588`).
  `handleSubmit` (`:405`) → `addDentalChartEntry`.
- **Surface options** (`SURFACE_OPTIONS`, `:346–353`): `'' (Whole tooth)`, mesial, distal, buccal,
  lingual, occlusal — exactly the standard 5 surfaces + a whole-tooth option, EN/AR.
- **Finding styles / colors** (`FINDING_STYLES`, `:335–344`): cavity (red), restoration (blue), missing
  (grey), crown (amber), bridge (violet), implant (teal), root_canal_done (navy), healthy (green).

### Other tooth-finding render sites
Per the prior Palmer audit, tooth references live only in `DentalTabs.jsx`. Only **one** site needs the
structural rework — the chart cell/grid. `DentalDashboard.jsx` renders appointments, **not** tooth
findings. Recent-findings list + treatment-plan rows are unaffected (well under the 8-site split threshold).

## 2. Data model (verified against `schema.sql`, not assumed)

`dental_chart_entries` (`schema.sql:278–290`):
```
id uuid PK | org_id | patient_id | tooth_number int CHECK 11–48 (NOT NULL)
surface text (nullable, NO db CHECK)   ← per-surface marking, already present
finding dental_finding (enum, NOT NULL)
notes text (nullable)                  ← the per-entry "comment", already present
recorded_at timestamptz | recorded_by uuid→profiles | created_at
```
- **`surface`** is free text in the DB; validity is enforced at the lib layer (`dental.js:43–45`
  `TOOTH_SURFACES = {mesial,distal,buccal,lingual,occlusal}`, asserted in `assertSurface` `:78–85`).
  → New surfaces or relabeling = a lib/UI concern only, no DB change.
- **`notes`** = the comment field. No separate `comment` column needed.
- **`recorded_by`** = the doctor (FK to profiles) — "per doctor" attribution already captured.
- **No upsert**: every save INSERTs a new row. "Latest overrides" is achieved by reading
  most-recent-per-key, exactly as `findingByTooth` does today (just needs to key on tooth+surface).

**Production caveat:** schema.sql is the declared source of truth and the live code demonstrably reads
`surface`/`notes` (the chart would error otherwise), so the columns exist in prod. A human can confirm
with `\d dental_chart_entries` in the Supabase SQL editor, but no migration is anticipated.

## 3. Surface rendering recommendation

**Use the diamond / 5-wedge cell — the Dentrix / Eaglesoft / Open Dental convention** — NOT 4 anatomical
SVG templates for V1. Reasoning:
- It is the format dentists already expect: each tooth is a square/diamond split into 5 zones — top =
  buccal/labial, bottom = lingual/palatal, left = mesial, right = distal, center = occlusal/incisal.
- It is **one reusable SVG** (5 `<path>` wedges with `onClick`), not 4 type-specific vectors — far cheaper
  and avoids the "anatomy textbook" over-engineering the guardrail warns against.
- It maps 1:1 onto the existing 5 surfaces and the existing square grid positions.
- Anatomically-shaped per-type SVGs (incisor/canine/premolar/molar) can be a **deferred V1.5 polish** on top
  of the same hit-region model — the data and interaction don't change.

(If Ali specifically wants tooth-type silhouettes for V1, that's the "4 templates + per-tooth scaling"
option — bumps Phase B from M to L. Recommend deferring; confirm.)

## 4. Modal expansion — mostly already done
- Finding type ✅ exists. Surface ✅ exists (dropdown). Free-text comment ✅ exists (`notes` textarea).
- **Per-surface color** ✅ exists as data (`FINDING_STYLES`); only needs to be *applied to the wedge* on
  the chart.
- **The only modal change:** when the doctor clicks a *wedge*, pre-fill `form.surface` from the click
  (and optionally hide/disable the now-redundant Surface dropdown, or keep it as an override). Small.
- **Multi-surface:** keep one entry per (tooth, surface); latest overrides (V1). History = V1.5. Matches
  the current INSERT-only + most-recent-read model.

## 5. Implementation phases + complexity

| Phase | Work | Complexity | Note |
|---|---|---|---|
| **A. Schema** | none | **NONE** | surface + notes already exist |
| **B. Surface SVG** | one reusable diamond/5-wedge SVG with clickable `<path>` regions + per-surface fill | **M** | (4 anatomical templates = L, deferred) |
| **C. Render component** | `<ToothSurfaces fdi findingsBySurface onSurfaceClick wholeToothFinding />` | **M** | |
| **D. Modal** | pre-fill surface from wedge click; keep finding + notes as-is | **S** | already captures everything |
| **E. Chart layout** | swap the box grid for `<ToothSurfaces>`; add `findingsBySurface` aggregation (most-recent per tooth+surface) replacing `findingByTooth` | **M** | one component |
| **F. Data layer** | none required; optionally a `findingsBySurface` selector | **NONE–S** | dental.js already reads/writes surface+notes |
| **G. Legend** | unchanged finding colors; add a small surface-key diagram | **S** | |

**Overall: M** (not XL). The "build a whole new chart + schema + data layer" framing is wrong — backend is
done; this is a focused front-end visualization swap.

## 6. Open questions for Ali
1. **Whole-tooth vs surface findings.** Some findings are inherently whole-tooth (missing, implant, crown,
   bridge, root_canal_done) and some are surface-specific (cavity, restoration). Render whole-tooth findings
   as the entire tooth tinted, and only cavity/restoration as wedges? (Recommended.) Confirm the split.
2. **Diamond-wedge (recommended, cheap, dentist-standard) vs anatomical per-type silhouettes for V1?**
3. **One finding per surface, latest overrides** (V1) — confirm; defer per-surface history to V1.5.
4. **Surface dropdown** — after wedge-click pre-fills the surface, keep the dropdown as an override or
   remove it?
5. **Occlusal vs incisal** label for anterior teeth (incisors/canines) — keep the current generic
   "occlusal", or label "incisal" for the front teeth? (Cosmetic; current code uses occlusal only.)

## 7. Recommended PR shape
**One PR, UI-only, M-sized** — no schema migration, no data-layer migration:
- diamond/5-wedge `<ToothSurfaces>` component + `findingsBySurface` aggregation + chart-grid swap +
  wedge-click-prefilled modal + legend update.
Optionally split off **PR2 (deferred): anatomical per-type tooth silhouettes** if Ali wants them — same
hit-region model, pure visual upgrade. Dental + live → `/code-review` mandatory; bilingual EN/AR;
hold lint baseline.

---

## Findings count
- **1 scope-changing discovery:** backend (schema + data layer + modal capture) for per-surface findings
  with comments **already exists** → UI-only change, no migration.
- **1 real gap:** the chart visualizes one finding per *tooth* (`findingByTooth`, `DentalTabs.jsx:390`),
  discarding `surface`; no clickable surface regions, no per-surface color.
- **1 site** needs structural rework (the chart grid in `DentalChartTab`); <8 → single PR.
- **5 open questions** for Ali (above).

## Recommended next steps
1. Get Ali's answers to the 5 open questions (esp. #1 whole-tooth-vs-surface and #2 diamond-vs-anatomical).
2. Phase 2: build the diamond/5-wedge `<ToothSurfaces>` component + `findingsBySurface` aggregation +
   modal wedge-prefill, in one UI-only PR. No schema work.
