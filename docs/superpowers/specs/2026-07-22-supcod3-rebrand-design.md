# SupCod3 Dental — Rebrand + Token Consolidation + Motion System

**Date:** 2026-07-22
**Source brief:** `REBRAND-BRIEF.md` · **Reference:** `supcod3-dental-preview.html` (repo root)
**Approach:** C — re-skin behind one token layer, incremental screen migration.

## Problem

The brief assumes the codebase already implements the CLAUDE.md brand book
(navy `#0A2540` / teal `#14B8A6`, `#F8FAFC` bg, IBM Plex). Audit proved it does
not. **Three** color systems are live, none matching the brand book:

| System | File | Accent | Background | Fonts |
|---|---|---|---|---|
| "Clinical Luxury" | `src/styles/theme.css` | mint `#00FFB2` | `#07080E` dark | Syne / DM Sans |
| `--velo-*` (70 tokens) | `src/index.css` | mint `#00FFB2` | warm paper `250 248 245` | Inter |
| Tailwind theme | `tailwind.config.js` | cyan `#06B6D4` ("spec accent"), mint ramp | navy ramp OK | Inter / DM Sans / Syne |
| **TARGET (brand book + preview)** | — | **teal `#14B8A6`** | **`#F8FAFC`** | **IBM Plex Sans / Mono** |

Fonts actually in use: 48× Inter, 30× DM Sans, 10× Syne, **0× IBM Plex**.
335 raw-hex occurrences across 20 files. `navy-800` in Tailwind = `#0A2540`
(correct); the accent and fonts are wrong everywhere.

The app is **light-only** (App.jsx removes `[data-theme="dark"]`), so `:root`
light values always win despite theme.css's dark declarations.

## Goal (this pass)

1. One token layer (`src/styles/tokens.css`) as the single source of truth for
   brand hexes + type. Every other system **aliases into it** — unmigrated
   screens recolor for free where aliases map cleanly.
2. Identity swap: `Velo` → `SupCod3 Dental` (display layer only), behind a
   `src/config/brand.js` white-label seam.
3. A shared GSAP motion module (`src/lib/motion.js`) — the brief's six exports,
   reduced-motion-safe.
4. Fully migrate the daily front-desk surfaces to match the preview: **shell
   chrome, Auth, Dashboard, Patients list, Patient profile, Appointments**.
5. Everything else remains functional on aliases, tracked in
   `MIGRATION-STATUS.md`.

## Confirmed decisions

- **Approach C** (token layer + incremental migration).
- **Alias recolor: FULL remap.** Remap both `mint-*` and `accent-cyan-*`
  primitive ramps to teal-family so the whole app reads as one teal brand.
- **App.jsx scope: shell + PatientsPage + patient profile** all migrated.
- **Logo: correct-on-drop.** Text wordmark now; favicon/mark paths point at
  `public/brand/` so images render the instant the PNG pack is dropped.
- **Fonts: keep the Google Fonts `<link>`**, swapped to IBM Plex Sans + Mono
  (+ keep Tajawal for Arabic).
- **Money/times:** IBM Plex Mono + `tabular-nums`. IQD = thousands separators,
  no decimals (existing `src/lib/money.js` rules unchanged).
- **No TypeScript, no Vitest** this pass. Motion module is `.js`. Tests run on
  `node --test`. CLAUDE.md gets corrected to match.

## Out of scope (from brief §5)

- Changing the *design values* themselves (teal/navy/Plex are the target, not a
  redesign). No new features, no layout redesigns.
- Repo / package.json name / DB object / env var renames.
- Tenant-level white-label *config UI* (seam is built; the settings screen for
  it is a later pass).
- SVG marks (follow-up when exported from Illustrator). PNG pack only.

## Architecture

### Token layer — `src/styles/tokens.css` (NEW, single source of truth)

`:root` block; the **only** file allowed to contain brand hex literals. Both
raw hex (for `<link>`/inline needs) and RGB-triplet forms (for Tailwind's
`rgb(var(--x) / <alpha>)` consumption).

```
/* Brand */
--brand-navy: #0A2540;      --brand-navy-rgb: 10 37 64;
--brand-teal: #14B8A6;      --brand-teal-rgb: 20 184 166;
--brand-teal-hover: #0F8F82;
--brand-teal-tint: #CCFBF1;  /* confirmed-status bg */
--brand-white: #FFFFFF;

/* Surfaces / borders */
--surface-canvas: #F8FAFC;  --surface-raised: #FFFFFF;
--surface-sunken: #F1F5F9;  --border-default: #E2E8F0;

/* Text */
--text-primary: #0F172A; --text-secondary: #475569; --text-tertiary: #64748B;

/* Status (brand book): confirmed teal / in-progress navy-blue / waiting amber / danger red */
--status-confirmed-fg: #0F8F82; --status-confirmed-bg: #CCFBF1;
--status-progress-fg:  #1D4ED8; --status-progress-bg:  #DBEAFE;
--status-waiting-fg:   #B45309; --status-waiting-bg:   #FEF3C7;
--status-danger-fg:    #B91C1C; --status-danger-bg:    #FEE2E2;

/* Type */
--font-sans: 'IBM Plex Sans', system-ui, sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, monospace;
```

Values are taken verbatim from `supcod3-dental-preview.html` `:root` so migrated
screens match pixel-for-pixel.

### Aliasing (recolor without rewrite)

`tokens.css` is imported **first** (before index.css/theme.css) so aliases
resolve to it.

1. **`src/index.css` `--velo-*`** — repoint the brand/accent semantic vars to
   teal:
   - `--velo-accent-solid` `0 255 178` → `20 184 166`
   - `--velo-accent-solid-hover` → `15 143 130`
   - `--velo-accent-fg`, `--velo-text-brand` → teal-700 `13 148 136`
   - `--velo-border-brand` → `20 184 166`
   - `--velo-surface-canvas` → `248 250 252` (F8FAFC), `--velo-surface-raised`
     → `255 255 255`, `--velo-border-*` → slate `226 232 240` family.
   Tailwind `accent.*`, `stroke.brand`, `content.brand` read these → recolor
   automatically.
2. **`tailwind.config.js` primitive ramps (FULL remap):**
   - `accent-cyan` ramp → teal ramp (500 `#14B8A6`, 600 `#0F8F82`, etc.).
   - `mint` ramp → teal-family equivalents (500 `#14B8A6`, 700 `#0D9488`,
     800 `#0F766E`).
   - `navy` ramp unchanged (already anchored on `#0A2540`).
   - `fontFamily.sans/inter/display` → IBM Plex Sans; add `fontFamily.mono` →
     IBM Plex Mono; `fontFamily.ar` (Tajawal) unchanged.
   - Focus-ring / glow shadow rgba values that hardcode mint `0,255,178` →
     teal `20,184,166`.
3. **`src/styles/theme.css`** — `--accent-primary/green/cyan` mint → teal;
   `--font-display` Syne → IBM Plex Sans; `--font-body/data` → IBM Plex Sans.
   (Dark bg vars left; app is light-only so they never resolve.)

### Fonts — `index.html`

Replace the Syne/DM Sans/Inter/Tajawal Google Fonts `<link>` with:
`IBM Plex Sans:wght@400;500;600;700` + `IBM Plex Mono:wght@500;600` +
`Tajawal:wght@400;500;700` (Arabic). Remove the duplicate `@import` in
`src/index.css:1`. `<title>` → `SupCod3 Dental`.

### Identity — `src/config/brand.js` (NEW, white-label seam)

```js
export const BRAND = {
  appName: 'SupCod3 Dental',
  vendorTagline: 'by SupCod3',
  marks: {
    white: '/brand/sc-mark-white.png', // navy header, dark surfaces
    navy:  '/brand/sc-mark-navy.png',  // white/light surfaces, print
    teal:  '/brand/sc-mark-teal.png',  // light surfaces with teal contrast
  },
  favicons: { 16:'/brand/favicon-16.png', 32:'/brand/favicon-32.png',
              48:'/brand/favicon-48.png', apple:'/brand/apple-touch-180.png',
              app:'/brand/app-icon-512.png' },
}
```

- `translations.appName` (en `'Velo'`, ar `'فيلو'`) → re-export `BRAND.appName`
  so all existing `t.appName` consumers update for free (single edit point).
- Logo slots (App.jsx sidebar ~L867, mobile header ~L958-959, Join ~L499,
  Auth "Welcome to Velo") render `BRAND.appName` + `vendorTagline`, with a
  `<Logo variant>` that shows the correct mark per surface **when the file
  exists**; falls back to a styled text wordmark (no broken-image icon).
- **Clinic name (`orgSettings.name`) stays** — it is the tenant (Le Royal /
  Saif Dental), rendered as the secondary label next to the product wordmark,
  matching the preview header (`.logo` product mark + `.clinic` divider).
- `index.html` favicon/apple-touch/app-icon `<link>`s point at
  `BRAND.favicons` paths; keep `favicon.svg` as the last fallback so no 404
  breaks the tab before the pack lands.
- `AIAssistant.jsx` "Velo AI" → "SupCod3 AI".

**Asset dependency:** the PNG pack (`sc-mark-white/navy/teal.png`, favicons
16/32/48, apple-touch 180, app-icon 512) is **not in the repo**. Wiring is
correct-on-drop; images appear when the pack is added to `public/brand/`.
This is called out in MIGRATION-STATUS.md and the PR body.

### Motion — `src/lib/motion.js` (NEW)

Install `gsap` + `@gsap/react`. Every animation lives inside
`gsap.matchMedia()` with a `(prefers-reduced-motion: reduce)` branch that sets
final states instantly and never blocks interaction.

**Pure helpers (unit-tested, no DOM):**
- `formatIQD(n)` → thousands-separated, no decimals (delegates to
  `src/lib/money.js` if a formatter exists there; otherwise local).
- `clampPct(n)` → clamp 0–100.
- `resolveMotion(prefersReduced)` → returns the tween config object, or a
  `{ instant: true }` sentinel when reduced — the single decision point the
  wrappers consume, so reduced-motion behaviour is testable without a browser.

**GSAP wrappers (browser-verified, not unit-tested):**
- `entrance(scope)` — header/title 0.25s; cards stagger 0.06s y:16→0; lists
  stagger 0.05s y:12→0; ease `power2.out`.
- `countUp(el, target, {format})` — 0.9s `power1.out`, IQD format, tabular nums.
- `progressBar(el, pct)` — 0.7s width tween (clamped).
- `pulse(el)` — infinite yoyo opacity 1→0.55, 0.9s `sine.inOut`. Live states
  only ("In chair"); **max one pulsing element per view** (caller-enforced).
- `pressFeedback(el)` — scale 0.96 tap, 0.08s yoyo.
- `toast(el)` — in 0.25s / hold 2.2s / out 0.3s.

Hard limits (CLAUDE.md): UI feedback 150–300ms; stagger ≤0.06s/item; transform
+ opacity only (no layout props → no CLS); no parallax, scroll-jack, or springy
overshoot on data surfaces. React usage via `useGSAP` (scope + auto cleanup),
per `.claude/skills/gsap-react`.

### Screen migration (match preview on these)

Order = shared frame first, then screens:

1. **Shell chrome** (App.jsx header + sidebar): SC logo/wordmark, teal accents,
   Plex, token-driven surfaces. Frames every migrated screen.
2. **Auth** (`src/pages/Auth.jsx` + `components/ui`): "SupCod3 Dental" wordmark,
   navy mark on light card, teal focus rings, Plex. Security-sensitive → in the
   /security-review diff.
3. **Dashboard** (`src/pages/DentalDashboard.jsx`): the preview's "Today" —
   KPIs (countUp + progressBar), appointment list (entrance stagger, status
   chips per brand-book colors, pulse on "In chair"), toast on check-in.
4. **Patients list** (`PatientsPage`, defined inside App.jsx ~L1081): entrance
   stagger on the initially-visible row window only (list is virtualized —
   never per-scroll-item).
5. **Patient profile** (App.jsx profile tabs ~L1900-2100): tokens/teal/Plex;
   tooth chart uses `pressFeedback` for selection only — **no decorative motion
   on medical data**.
6. **Appointments** (`src/pages/AppointmentsPage.jsx` + `calendar` route +
   `AddAppointmentModal`): modal 0.2s fade+scale(0.98→1) in / 0.15s out; status
   chips; teal.

Route transitions: 0.15s fade only.

### Docs

- **`MIGRATION-STATUS.md` (NEW):** table of every screen/component →
  `migrated` | `aliased`, plus the outstanding PNG-pack dependency and the
  SVG-marks follow-up. The checklist future passes work from.
- **`CLAUDE.md` corrections:** Vitest → `node --test`; note `src/lib/motion.js`
  (not `.ts`); no TypeScript this pass. Add `"test": "node --test"` (glob for
  `*.test.mjs`/`*.test.js`) to `package.json` scripts.

## Data flow / interfaces

- Components consume **Tailwind semantic classes** (`bg-accent`, `text-content-*`,
  `border-stroke`) or `--velo-*`/tokens vars — never raw hex. `tokens.css` →
  aliases → components is one-directional.
- `BRAND` is imported where identity strings/marks render; `orgSettings.name`
  (tenant) remains a separate, orthogonal value.
- `motion.js` is imported by screens; pure helpers are independently importable
  for tests.

## Error handling / resilience

- Missing logo PNG → text-wordmark fallback (no broken-image glyph); favicon
  falls back to `favicon.svg`. App never depends on an asset that isn't there.
- Reduced-motion → `resolveMotion` short-circuits every wrapper to final state.
- `progressBar`/`countUp` clamp/guard against NaN and out-of-range inputs.
- Unmigrated screens must stay **functional and not visually broken** after the
  alias remap — verified by loading each top-level route.

## Testing (evidence required — verification-before-completion)

- **Unit (`node --test`):** `motion.test.mjs` for `formatIQD`, `clampPct`,
  `resolveMotion` (reduced vs normal). Existing `conflicts.test.mjs` stays green
  (currently 5/5). Paste output.
- **Build:** `npm run build` clean. Paste tail.
- **Reduced-motion:** DevTools emulate `prefers-reduced-motion: reduce` →
  zero motion, correct final states on Dashboard. Screenshot/record.
- **No-CLS:** confirm entrance animations touch only transform/opacity (grep +
  visual); no layout-property tweens.
- **Raw-hex gate:** `grep` proving migrated screens carry zero raw hex in
  component code (tokens only) — report count for migrated set.
- **/security-review** on the diff (auth screens touched → mandatory) before
  push.
- Browser check of migrated screens vs preview; favicon/tab in a real browser
  (will show text/SVG fallback until the PNG pack is dropped — noted, not a
  failure).

## Risks

- **Full ramp remap** may recolor a stray unmigrated screen oddly. Mitigation:
  route-by-route smoke check; teal-family stays within the same hue band as the
  old cyan/mint so shifts are muted, not jarring.
- **App.jsx (3019 lines)** is a large surface. Mitigation: migrate in the fixed
  order above, commit per screen group, keep the shell change isolated first.
- **theme.css `!important` rules** may fight token colors on some inputs.
  Mitigation: repoint the theme.css vars themselves (not add overrides), as the
  prior `--velo` migration did.
- **PNG pack absent** — accepted; correct-on-drop wiring + fallbacks.
