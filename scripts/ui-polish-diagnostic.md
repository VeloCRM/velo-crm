# Diagnostic — Patient Profile UI polish (7 targets)

**Phase 1 (read-only scope map). No code changed.**
Date: 2026-06-24 · Project: `velo-crm/`

## TL;DR

All 7 targets are **small, surgical, token-safe** changes. **Six of seven live in one file — `src/App.jsx`** (the `PatientProfile` component, ~line 1657); the seventh (sidebar logo) is also in `App.jsx` but renders on every page. The design system already has every token needed — Syne (`font-display`), the navy/accent-cyan ramps, and a full glass shadow scale (`shadow-glass` / `shadow-glass-lg`) — so **no new tokens, no palette/font changes, no new deps**. Two items need a note: (a) the patient name is already Syne `font-semibold` (not bold), so the "too heavy" fix is a weight/size nudge; (b) the header-card depth bump must be scoped to the one card instance, **not** the global `.glass-card` rule. Recommended as a **single cohesive PR** (only the sidebar logo is cross-page; everything else is patient-profile-local — within the 3–4 cross-page guardrail).

**No brand-identity decision is required** — the accent is already cyan (`#06B6D4`, `accent-cyan-500`) and the "Velo" wordmark already exists; every proposal reuses existing tokens. (Logo *image* upload is noted as V1.5 backlog, not in scope.)

---

## Shared facts (apply to multiple targets)

- **Container:** `PatientProfile` component, `src/App.jsx` ~1657. State for tabs: `profileTab`/`setProfileTab` (decl. ~1274); tab list array ~1710–1721.
- **Fonts:** global `h1–h6 { font-family: 'Syne' }` (`index.css:372–377`); body = DM Sans. Tailwind: `font-display`=Syne, `font-sans`=DM Sans (`tailwind.config.js:185–196`). **The patient name is an `<h2>` → already Syne.**
- **Muted text token in this view:** the page uses the **Tailwind `navy-*` ramp** (e.g. `text-navy-500` = `#2F5C92`, `text-navy-600`=`#1B4477`), not `--velo-*` vars. Stay on `navy-*` for consistency.
- **Elevation tokens (already exist):** `shadow-glass-sm` / `shadow-glass` / `shadow-glass-lg` (`tailwind.config.js:273–289`); `.glass-card` hardcodes the `shadow-glass` recipe (`index.css:204–208`).
- **GlassCard is global.** Its surface lives in `.glass-card` (`index.css:197–214`): `rgba(255,255,255,0.70)` glass bg, blur+saturate, 1px white top / ink bottom border, `border-radius:16px`, multi-layer soft shadow. **Editing `.glass-card` changes every card app-wide — out of scope. Scope all card tweaks to the instance via className/`tone`.**

---

## Target 1 — Patient name page title

- **Current** (`App.jsx:1764–1766`): `<h2 className="text-3xl font-semibold text-navy-900 leading-tight tracking-tight m-0">` → renders in **Syne** (global h2), 30px, weight 600.
- **Proposed:** `font-semibold` → **`font-medium`** (500), optionally `text-3xl` → **`text-2xl`** (24px). Keep `text-navy-900 tracking-tight`.
- **Reasoning:** Syne is a geometric *display* face; at 30px/600 a person's name reads like a section heading. 500 (and a slightly smaller size) makes it feel like *content* — a name — while staying clearly the page's primary label.
- **Cross-cutting:** none — this `<h2>` is unique to the profile header.
- **Complexity: XS** (1–2 class tokens).

## Target 2 — Patient header card depth

- **Current** (`App.jsx:1749`): `<GlassCard padding="lg" className="relative overflow-hidden">`. Already carries the `.glass-card` soft shadow + a decorative navy→white gradient wash (`App.jsx:1751–1755`) and a `shadow-glass-lg` avatar tile (`:1759`).
- **Why it "feels flat":** every card on the page shares the **same** `shadow-glass` elevation, so the hero header doesn't out-rank the content cards; and the translucent 0.70 white bg lowers edge contrast against the canvas.
- **Proposed (pick one):**
  - **2a (recommended):** add `tone="strong"` → bumps the fill to `rgba(255,255,255,0.85)`, reading as a more solid, raised hero surface. Clean, supported GlassCard prop, no specificity fight.
  - **2b:** add a stronger drop via className `shadow-glass-lg`. ⚠️ **Specificity caveat:** `.glass-card`'s own `box-shadow` and the `.shadow-glass-lg` utility are equal specificity (1 class each) — order-dependent; the utility may **not** override. If chosen, verify in-browser; may need a tiny scoped rule or a GlassCard `elevation` variant rather than a raw utility. **Flagged.**
  - **2c:** keep elevation, lift hierarchy cheaply with a top accent hairline (e.g. an inset `border-top` in accent-cyan via an existing decorative span). Lowest risk.
- **Reasoning:** the header should be the page's most-elevated surface; `tone="strong"` achieves that without touching the global card recipe.
- **Cross-cutting:** **do not** change `.glass-card` globally. Instance-only.
- **Complexity: S** (one prop for 2a; 2b needs a render-verify).

## Target 3 — Tab navigation active state

- **Current** (`App.jsx:1842–1873`): strip `border-b border-navy-100/80`; active text `text-navy-900 font-semibold`, inactive `text-navy-500 hover:text-navy-700 font-medium`; active underline is a **navy→cyan gradient `<span>`** (`:1862–1868`) — `absolute inset-x-3 -bottom-px h-0.5 rounded-full`, `background: linear-gradient(90deg, #103562, #06B6D4)` (2px tall, inset 12px).
- **Proposed:** underline `h-0.5` → **`h-[3px]`** and `inset-x-3` → **`inset-x-2`** (slightly bolder + spans more of the tab). Optionally add a subtle active-tab tint: append **`bg-navy-50/60 rounded-t-md`** to the active branch; and a hover tint on inactive: **`hover:bg-navy-50/40`**.
- **Reasoning:** a 3px gradient bar reads as a deliberate active indicator at tablet distance; the active/hover background tints reinforce which tab is selected without color-palette changes.
- **RTL:** `inset-x-*` is symmetric → safe in RTL. The gradient direction is decorative; no flip needed.
- **Cross-cutting:** this tab strip is specific to `PatientProfile` (`profileTab`); other pages have their own tab patterns — **not** auto-applied. Note for a future consistency sweep if desired.
- **Complexity: XS–S** (2–4 class tokens).

## Target 4 — Patient Information field labels

- **Current** (`App.jsx:1891–1894`, one template `.map`'d over all fields):
  - Label `<dt>`: `text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-500 mb-1`
  - Value `<dd>`: `text-sm text-navy-800 m-0`
  - `<dl>` grid `:1882`: `grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5`
- **Proposed:** label `text-[11px]` → **`text-xs`** (12px); `text-navy-500` → **`text-navy-600`** (`#1B4477`, higher contrast); `tracking-[0.12em]` → **`tracking-[0.08em]`** (wide tracking on tiny uppercase hurts legibility). Value unchanged.
- **Reasoning:** 12px + darker navy + tighter tracking makes labels clearer in clinic lighting while preserving the quiet "label vs value" hierarchy.
- **Cross-cutting:** the `text-[11px] uppercase tracking-… text-navy-500` label idiom recurs elsewhere (e.g. other cards). This change is **inline to the patient-info template only**; a global label restyle is a separate, larger sweep — keep out of scope.
- **Complexity: XS** (2–3 class tokens).

## Target 5 — Empty-field placeholder ("—")

- **Current** (`App.jsx:1884–1889`): the em-dash is **inline per-field**, baked into the data array as a string (`value || '—'`, or `cond ? val : '—'`). **No shared helper.** When empty, `'—'` renders with full value styling (`text-sm text-navy-800`) — indistinguishable from real data.
- **Proposed:** render empties as a **muted italic placeholder**, e.g. `<span className="italic text-navy-400">{isRTL ? 'غير محدد' : 'Not specified'}</span>`. EN **"Not specified"** / AR **"غير محدد"**.
- **Implementation note:** the value slot currently flattens to a *string*, so styling the empty state differently requires returning a small **JSX element** instead of `'—'` (the `<dd>` already renders `{value}`, so a node works). Cleanest as a tiny local helper reused by all 6 fields (e.g. `const notSpecified = <span class="italic text-navy-400">…</span>`) — minor refactor of the array, not a structural change.
- **Reasoning:** "Not specified" is more intentional and accessible than a bare dash, and the muted italic signals "absent" vs "value" at a glance — in both EN and AR.
- **Cross-cutting:** other `'—'` strings exist (edit-modal `<select>` placeholders `:1622/:1631`) — **different surface, leave alone.** Scope to the Overview display only.
- **Complexity: S** (small array refactor + 2 strings).

## Target 6 — "Back to Patients" link

- **Current** (`App.jsx:1739–1746`): `<button>` `self-start inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800 transition-colors`; icon `Icons.arrowLeft(16)` (LTR) / `Icons.arrowRight(16)` (RTL); label EN "Back to Patients" / AR "العودة إلى المرضى".
- **Proposed:** make it read as nav with a hover surface + bigger touch target: add **`px-2.5 py-1.5 -ms-2.5 rounded-lg hover:bg-navy-50`** (keep the arrow + `transition-colors`, add `transition` for bg). Use logical `-ms-2.5` (not `-ml`) so the negative inset flips correctly in RTL.
- **Reasoning:** a padded, hover-tinted pill with a ~36px tap height feels like a back affordance on tablet, vs. bare text; the negative margin keeps it visually flush with the content edge.
- **RTL:** already direction-aware (arrow swaps). Use `-ms-*`/`ps-*` logical utilities for the new padding/inset.
- **Cross-cutting:** this back button is profile-specific. If other detail pages have the same bare-text back link, apply the same treatment in a follow-up for consistency (note, not blocker).
- **Complexity: XS** (className only).

## Target 7 — Sidebar logo typography (Le Royal + Velo stack)

- **Current** (`App.jsx:840–852`, clinic/org mode; mark is an inline **SVG tooth glyph**, no image file):
  - Org name `:848` (`{orgSettings.name || t.appName}`): `font-display text-[19px] font-extrabold tracking-[-0.03em] text-navy-900 leading-tight truncate` (Syne, 19px, **800**).
  - "Velo" sub-line `:849` (`{orgSettings.name ? t.appName : t.appTagline}`): `text-[11px] mt-1 font-sans font-medium tracking-wide text-navy-500 truncate` (DM Sans, 11px, 500, muted).
- **Proposed (hierarchy: clinic = hero, Velo = labeled product):**
  - Org name: `font-extrabold` → **`font-bold`** (700) — 800 Syne at 19px is heavy for a clinic name; 700 keeps presence, less density.
  - Velo line: → **`text-[10px] uppercase tracking-[0.14em] font-semibold text-accent-cyan-700`** — turns the muted afterthought into an intentional product label that ties to the cyan accent.
- **Reasoning:** clear two-tier hierarchy (bold navy clinic name + small cyan uppercase "VELO" tag) reads as "clinic, powered by Velo" instead of two competing greys.
- **Cross-cutting:** this is the **only cross-page item** — the sidebar shows on every authenticated page. One small typography change; well within the cross-page guardrail. (Agency-mode variant `:832–836` is separate — leave unless parity is wanted.)
- **Brand note / V1.5 backlog:** clinics may later upload their own logo image; today it's text + inline SVG. **Logo-upload pipeline = V1.5 backlog**, not this PR. No brand-color decision needed (accent already cyan).
- **Complexity: XS–S** (typography on 2 text nodes).

---

## Complexity summary

| # | Target | File:line | Complexity |
|---|---|---|---|
| 1 | Name weight | `App.jsx:1764` | XS |
| 2 | Header card depth | `App.jsx:1749` | S (2b needs render-verify) |
| 3 | Tab active state | `App.jsx:1842–1868` | XS–S |
| 4 | Field labels | `App.jsx:1892` | XS |
| 5 | Empty placeholder | `App.jsx:1884–1894` | S (small refactor + AR string) |
| 6 | Back link | `App.jsx:1739–1746` | XS |
| 7 | Sidebar logo | `App.jsx:848–849` | XS–S |

All changes: no new tokens, no palette/font swaps, no new deps, no `api/` files (Vercel 12/12 untouched), RTL-safe (use logical `-ms`/`ps` utilities where adding insets).

## Recommended PR shape

**Single PR** — "Patient profile UI polish (+ sidebar logo)". Rationale: 6/7 targets are patient-profile-local and all live in `App.jsx`; only the sidebar logo is cross-page (1 location), within the 3–4 cross-page guardrail. Splitting would fragment a cohesive visual pass. Suggested commit grouping inside the PR: (a) profile header — name + card + back link; (b) tabs; (c) patient-info labels + empty state; (d) sidebar logo. Visual polish at this scope → `/code-review` optional (no logic/RLS/dental-data changes).

## Open questions for Ali

1. **Name (T1):** weight 500 only, or also drop to `text-2xl` (24px)? (Recommend both.)
2. **Header depth (T2):** go with `tone="strong"` (2a, clean) — or do you want a heavier drop shadow (2b) despite the specificity verify step?
3. **Tabs (T3):** underline-only bump, or also add the active/hover background tint?
4. **Labels (T4):** 12px + navy-600 acceptable, or keep 11px and only darken the color?
5. **Empty state (T5):** "Not specified" / "غير محدد" wording OK? Italic-muted styling OK?
6. **Sidebar (T7):** confirm the cyan uppercase "VELO" tag direction (vs. just de-bolding the org name and leaving the sub-line grey)?
7. **PR shape:** single PR as recommended, or do you want the sidebar logo split out (since it's the only global change)?
