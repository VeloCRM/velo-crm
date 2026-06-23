# Diagnostic — Tooth surface divider line visibility

**Phase 1 (read-only scope map). No code/schema/Supabase changed.**
Date: 2026-06-24 · Project: `velo-crm/`

## TL;DR

The wedge dividers are faint because of **one hardcoded stroke value**: resting wedges draw at `stroke="#94a3b8"` (Tailwind slate-400) `strokeWidth="1"`. Against the near-white empty-wedge fill that's only a **~2.2:1 contrast ratio — below the WCAG 1.4.11 non-text minimum of 3:1**, which is exactly why empty teeth read as a blank box at arm's length on a clinic tablet. The fix is isolated to **`src/components/ToothSurfaces.jsx`** (the only component that renders wedges), it's a **static SVG attribute (not React state, not a shared design token)**, and the change is **~2–4 lines**. Recommended: darken to slate-500 `#64748b` **and** bump width to `1.5` (Option C) → ~4.2:1 contrast + a slightly bolder line, matching Open Dental/Dentrix convention. Hover stays distinct. No accessibility, print, or multi-component regressions.

## §1 — Where the dividers are rendered (single source)

`src/components/ToothSurfaces.jsx` is the **only** component drawing surface wedges. Grep for `WEDGE_POLYGONS|surfaceLayout|ToothSurfaces|groupBySurface` returns just 3 files: `ToothSurfaces.jsx` (renders), `lib/toothSurfaces.js` (geometry), `DentalTabs.jsx` (passes data/styles).

**Guardrail cleared — no second divider renderer.** `MiniToothChart.jsx` (X-ray tooth picker) draws each tooth as a **single `<button>`** (`MiniToothChart.jsx:40-56`) with **no surface wedges** — nothing to keep consistent. The change lives in one place.

## §2 — Current stroke attributes (file:line)

| Element | Stroke color | Width | Location |
|---|---|---|---|
| **Resting wedge** (the problem) | `#94a3b8` (slate-400) | `1` | `ToothSurfaces.jsx:98-99` |
| Whole-tooth polygon | `#64748b` (slate-500) | `1.5` | `ToothSurfaces.jsx:69-70` |
| Hover / focus-visible (all) | `#06b6d4` (cyan-500) | `2.5` | `ToothSurfaces.jsx:31` (`WEDGE_CLASS`) |
| Empty-wedge fill | `rgba(148,163,184,0.16)` (slate-400 @16%) | — | `ToothSurfaces.jsx:28` (`EMPTY_FILL`) |

`WEDGE_CLASS` (line 31), verbatim:
```
'cursor-pointer transition-all duration-100 hover:[stroke:#06b6d4] hover:[stroke-width:2.5] focus:outline-none focus-visible:[stroke:#06b6d4] focus-visible:[stroke-width:2.5]'
```
Hover is Tailwind arbitrary-value classes that override the static `stroke`/`stroke-width` attributes on `:hover`/`:focus-visible`.

**Guardrail cleared — not React state.** Stroke is a static SVG attribute; hover is pure CSS. No state machine, no prop threading. Editing the literal values is the entire change.

## §3 — Token usage / resolution

**The tooth strokes do NOT use a design-system token.** They are raw Tailwind-palette hex literals (`#94a3b8` = slate-400, `#64748b` = slate-500), independent of the `--velo-border-*` family.

- `--velo-border-*` tokens (`index.css:28-31` light / `74-77` dark) are **warm ink greys** (e.g. `--velo-border-default: 209 203 191`), a different hue from the cool slate strokes. Card borders use these; the tooth strokes do not.
- **Guardrail cleared — stroke color is NOT shared with card borders.** Changing the tooth stroke literal has **zero collateral** on the design system. A dedicated `--velo-tooth-divider` token is therefore *optional* (nice for cleanliness), **not required**.
- Cross-references of the same hexes are all independent literals, not a shared token: `#94a3b8` also at `ReportsPage.jsx:551` (an unrelated progress bar); `#64748b` reused as the "Missing" finding color (`DentalTabs.jsx:343`), task low-priority, no-show, etc. None are affected by editing the `ToothSurfaces.jsx` attribute.

**Dark mode is irrelevant.** App is light-only (`App.jsx` strips `[data-theme="dark"]`; per project memory) → only the light-mode values resolve. No dark-mode contrast to balance.

## §4 — Quantified contrast problem (light mode)

Empty wedge = `EMPTY_FILL` (slate-400 @ 16%) composited over the white card ≈ **rgb(238, 240, 244)**, relative luminance ≈ **0.868**.

| Stroke | Rel. luminance | Contrast vs empty fill | WCAG 1.4.11 (≥3:1) |
|---|---|---|---|
| **`#94a3b8` (current)** | 0.359 | **~2.2 : 1** | ❌ **FAIL** |
| `#64748b` slate-500 (proposed) | 0.170 | **~4.2 : 1** | ✅ pass |
| `#475569` slate-600 (bolder alt) | ~0.13 | **~4.8 : 1** | ✅ pass |

So the root cause is **contrast, not just width** — a thicker line in the same slate-400 still sits at ~2.2:1. The color must darken to clear 3:1; width adds perceived weight on top.

## §5 — Industry convention

Dentrix / Eaglesoft / Open Dental render surface dividers at **~1.5–2px in a clearly visible mid-grey** — these are clinical tools read at arm's length, not "thin elegant line" marketing UI. Current 1px slate-400 is below that bar. Target: **1.5–2px, slate-500/600.**

## §6 — Options

| Option | Change | Contrast | Verdict |
|---|---|---|---|
| **A** — width only | `strokeWidth` 1 → 1.5/2, keep `#94a3b8` | still ~2.2:1 | ❌ doesn't fix the real issue (contrast unchanged) |
| **B** — color only | keep width 1, `#94a3b8` → `#64748b` | ~4.2:1 | ✅ passes, but still a thin line |
| **C — both (RECOMMENDED)** | width 1 → **1.5**, stroke `#94a3b8` → **`#64748b`** | ~4.2:1 | ✅ passes + bolder; matches Open Dental |

**Clutter check (32 teeth):** the SVG is capped at `maxWidth: 46px` per tooth (`ToothSurfaces.jsx:64`) over a `0 0 100 100` viewBox, so a `strokeWidth="1.5"` renders ≈0.7px on-screen per tooth — crisp, not heavy. `2px` (≈0.9px on-screen) starts to feel dense across a full arch; **1.5px is the sweet spot**, with 2px available if Ali wants it bolder after seeing it live.

## §7 — Edge cases

- **Filled wedges:** a darker `#64748b` stroke stays visible against most finding fills. Against the darkest fills (root-canal `#1e40af`, wear `#78350f`) divider/fill contrast is lower, but those wedges are already distinguished from neighbors by their *color*, so the divider matters less there. The empty-wedge case (no color cue) is the priority and is what this fixes.
- **Hover-vs-rest distinction stays intact.** Rest (slate-500, 1.5px) → hover (cyan `#06b6d4`, 2.5px) still differs by **both hue and +1px width**; hue is the dominant signal. ⚠️ **Only if** Ali chooses a 2px resting width, bump hover to `3px` to preserve the width gap (guardrail: hover currently 2.5px). At 1.5px rest, no hover change needed.
- **Read-only (`disabled`) charts benefit most.** When `disabled`, `WEDGE_CLASS` is dropped (no hover) but the base `stroke`/`strokeWidth` attributes still apply — so the doctor *reviewing* a read-only chart (no hover to compensate) is exactly who gains from a stronger resting stroke.
- **Print: not applicable.** `@media print` (`index.css:460-475`) hides everything except `.rx-print` (the prescription overlay); the dental chart never prints. No print implication.
- **Tablet pixel density:** the on-screen-px estimates above are CSS px; on a 2× tablet the line is sharper, not thinner. 1.5px holds up.

## §8 — Complexity

**Very small — ~2–4 lines, one file.**
- Required: `ToothSurfaces.jsx:98-99` (resting wedge `stroke` + `strokeWidth`).
- Optional consistency: `ToothSurfaces.jsx:69-70` (whole-tooth — already 1.5px/`#64748b`, adequate; bump only if matching a 2px choice).
- Optional, only if resting → 2px: `ToothSurfaces.jsx:31` (hover `stroke-width` 2.5 → 3).
- Optional cleanup: hoist `WEDGE_STROKE` / `WEDGE_STROKE_WIDTH` consts to DRY the two polygons (the two sites currently repeat the literal). Not required.

No new token, no schema, no data, no `api/` (Vercel 12/12 untouched). Pure visual polish.

## §9 — Open questions for Ali

1. **Direction:** confirm **Option C** (darken + slightly bolder)? Or color-only (B) to stay minimal?
2. **Width:** **1.5px** (recommended, Open-Dental-like) or **2px** (bolder, Dentrix-like)?
3. **Color:** **`#64748b`** slate-500 (~4.2:1, recommended) or darker **`#475569`** slate-600 (~4.8:1, more clinical)?
4. **Hover:** leave at cyan 2.5px (fine for 1.5px rest), or bump to 3px (only if you pick 2px rest)?
5. **Implementation:** edit the literals in place / hoist to local `WEDGE_STROKE` consts (recommended), or introduce a global `--velo-tooth-divider` token (not needed — stroke isn't shared)?
6. **Whole-tooth polygon:** leave as-is (already 1.5px/slate-500), or bump to match if you choose a 2px wedge width?
