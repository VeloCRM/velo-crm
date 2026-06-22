# 5-Surface Chart — Preview Bug Diagnostic (read-only)

**Date:** 2026-06-22  · **Branch:** `feat/5-surface-dental-chart` (PR #37) · **Status:** DIAGNOSTIC ONLY, no code changed.
4 issues reported by Ali via Preview screenshots. Root causes below; fixes proposed, awaiting greenlight.

---

## Issue 1 + 2 (HIGH, same root cause) — surface findings tint the WHOLE tooth

### Root cause — `src/lib/toothSurfaces.js:82` (render/aggregation, NOT data fetch)

```js
const isWhole = WHOLE_TOOTH_FINDINGS.has(e.finding) || !e.surface
```

The classification is **finding-TYPE-driven**: any entry whose *finding* is in
`WHOLE_TOOTH_FINDINGS` (`missing, implant, crown, bridge, root_canal_done`) is bucketed as a
whole-tooth entry **regardless of the surface chosen**. Then `ToothSurfaces.jsx` (`wholeTinted = whole && whole.finding !== 'healthy'`) tints the entire tooth and hides the wedges.

So Ali's test cases land exactly on the first clause:
- **Crown / Mesial on 13** → `crown ∈ WHOLE_TOOTH_FINDINGS` → whole bucket → whole tint (mesial ignored).
- **Bridge / Distal on 23** → `bridge ∈ WHOLE_TOOTH_FINDINGS` → whole tint (distal ignored).

Issue 2 (notes don't associate with the surface) is the **same bug** — the note rides on the same entry, which renders as a whole-tooth tint, so it never visually attaches to the mesial/distal wedge.

**Confirmed NOT a data bug:** `fetchDentalChartEntries` returns `surface` correctly; `surface=mesial` is stored and read fine. The defect is purely the render-side classification. No schema/fetch/query change needed. (Surface-typed findings — cavity/restoration on a wedge — *do* render correctly today; only the 5 whole-type findings misbehave when a surface is also set.)

### ⚠️ Spec tension to resolve before fixing (needs Ali's explicit call)
This behavior is what greenlit **Q1** literally said — *"Whole-tooth findings (missing/implant/crown/bridge/root_canal) tint the entire tooth shape."* Q1 classified by **finding type**. Ali's testing now wants classification by **surface**: a chosen surface → color that wedge, even for a crown/bridge. These conflict; the report is effectively revising Q1. The fix below adopts the **surface-driven** rule per the report — please confirm, since it means a crown recorded on "mesial" will color only the mesial wedge (clinically a crown covers the whole tooth).

### Proposed fix (Issue 1+2)
Make whole-vs-wedge depend **only on whether a surface is set** — `toothSurfaces.js:82`:
```js
const isWhole = !e.surface            // surface set → wedge; null/'whole' → whole-tooth tint
```
- Result: Crown/Mesial → mesial wedge colored; Bridge/Distal → distal wedge; cavity/restoration unchanged. Whole-tooth findings still tint the whole tooth **when recorded via the tooth-number ("add finding") path**, where surface defaults to "Whole tooth" (`''` → null).
- `WHOLE_TOOTH_FINDINGS` becomes unused in the renderer → remove it, **or** repurpose it as a UX default (auto-select "Whole tooth" + lock the surface dropdown when a whole-type finding is picked — see Alternative).
- **Alternative (hybrid, if Ali wants crowns to stay whole-tooth):** keep surface-driven rendering BUT, in the modal, when the doctor picks a whole-type finding, auto-set surface→"Whole tooth". This honors Q1 clinically while fixing cavity/restoration wedges. Pick one; the report points at the pure surface-driven version.

---

## Issue 3 (MEDIUM, UX) — locked surface dropdown looks broken, not intentional

### Current state — `src/components/DentalTabs.jsx` (modal Surface field)
The lock **is** correctly implemented (verified): when `prefillSurface != null` (wedge-click path) the
`<select>` has `disabled` + `aria-readonly="true"` + `opacity:0.75` + `cursor:not-allowed`. It is genuinely disabled and shows the clicked surface — Ali is seeing the real (greyed) disabled control and reading it as broken, not an empty/non-functioning dropdown.

### Proposed fix (keep the lock — guardrail: do NOT remove it)
Make the intent explicit:
- Add a small **lock icon** (`Icons.lock` if present, else a 🔒 glyph) inline with the field label, and
- a hint line below the select: EN *"Surface set by the wedge you clicked"* / AR *"السطح محدد من السن الذي نقرت عليه"*, and
- a distinct locked style (subtle accent border instead of plain greyed) so it reads as "fixed" not "dead".

---

## Issue 4 (MEDIUM, UX) — no visible hover feedback / no surface tooltip

### Current state — `src/components/ToothSurfaces.jsx` (`activate()` className)
Hover **is** pure-CSS (`transition-opacity hover:opacity-60`) — but it's weak and partly counterproductive:
- Empty wedges have a faint fill (`rgba(148,163,184,0.16)`); dropping them to 60% opacity makes them *fainter*, not highlighted.
- There is **no `title` attribute** on the wedges, so mouse users get no tooltip naming the surface (only the `aria-label`, which screen readers read but isn't shown visually).

### Proposed fix (Issue 4)
- Add `title={aria}` (reuse the existing per-wedge label string, e.g. "Mesial" / the full "Tooth 16, mesial surface") → native tooltip baseline, no layout cost.
- Replace the opacity-down hover with a **visible highlight**: thicker/darker stroke on hover (e.g. `hover:[stroke:#0A2540] hover:[stroke-width:2]`) and/or brighten the fill — works for both filled and empty wedges.
- **Touch fallback (guardrail):** `title`/`:hover` don't fire on touch. On a wedge tap the modal opens (which names the surface), so touch users still get the surface context. If Ali tests on tablet and wants a pre-modal tooltip, add tap-to-reveal — flag for a follow-up rather than complicating V1.

---

## PR #37 code-review deferred items — relation to these bugs
The deferred review notes (SURFACE_LABELS vs SURFACE_OPTIONS duplication; `FINDING_STYLES`/`WHOLE_TOOTH_FINDINGS` split across files; incisal-threshold duplication) are maintainability nits and **did not cause** these bugs — except that `WHOLE_TOOTH_FINDINGS` is the constant in the Issue-1 root cause. The surface-driven fix removes that dependency, incidentally resolving part of that deferred coupling.

---

## Fix order (Phase 2, after greenlight)
1. **Issue 1+2** — `toothSurfaces.js:82` surface-driven classification (one-line change + remove/repurpose `WHOLE_TOOTH_FINDINGS`). **Blocked on Ali confirming the Q1 → surface-driven revision** (and pure vs hybrid).
2. **Issue 4** — `title` tooltip + stronger hover highlight in `ToothSurfaces.jsx`.
3. **Issue 3** — lock icon + hint text + distinct locked style on the modal surface dropdown.
Each: rebuild + lint (hold 46/37/9) + `/code-review` (live dental). DO NOT MERGE #37 until all four are resolved and re-verified on Preview.

## Open question for Ali (blocks Issue 1+2 fix)
**Confirm the Q1 revision:** render whole-vs-wedge by **surface** (chosen surface always colors that wedge, even for crown/bridge) — *pure surface-driven*? Or the *hybrid* (whole-type findings auto-force "Whole tooth")? The report points at pure surface-driven; I'll implement whichever you pick.
