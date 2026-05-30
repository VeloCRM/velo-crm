# UI/UX Audit — Post PR #27 (Phase 2)

**Date:** 2026-05-30
**Branch/commit audited:** `master` @ `be8f977` (PR #27 merged: inbox `--velo-*` tokens, Kanban header contrast, sidebar branding)
**Auditor:** source-grounded review across 7 parallel passes
**Scope:** Dashboard, Patients (list + profile + all tabs), Inbox, Calendar, Tasks, Goals, Docs, Automations, Forms, Social Pages, Integrations, Reports, Finance, Settings (all tabs)

## Methodology & caveats

This is a **source-grounded audit**: the production CRM at `velo-crm-coral.vercel.app` is behind auth, so findings were derived by reading the actual page source and grepping for token bypasses, hardcoded colors, missing states, and primitive divergence — not by inspecting rendered pixels. Six of the seven requested criteria (dark-mode bleed, hardcoded colors, token bypass, contrast, button consistency, missing loading/empty states) are reliably code-detectable; this method has *higher* fidelity than eyeballing for those. Items that genuinely need a rendered check (exact contrast ratios, overflow at narrow widths, whether a CSS rescue rule visually fires) are tagged **[needs-visual]**.

`InventoryPage.jsx` exists but is **not** in the requested page list, so it was left out of scope.

**Nothing was changed.** This is a pure observational audit per instructions.

---

## Root cause — three competing color systems

Almost every BUG in this report traces to one structural fact: the app contains **three** color systems, and the default theme is **light** (warm-paper canvas `#FAF8F5`).

1. **`--velo-*` token system** (defined `src/index.css` 1–130, mapped in `tailwind.config.js` to utilities like `bg-surface-raised`, `text-content-primary`). Themes light/dark correctly. **This is the target.** Adopted by only **3 files**: `src/index.css`, `src/App.jsx` (Inbox only), `src/pages/TasksPage.jsx` (two Kanban header spans only).
2. **"Liquid Glass" navy/cyan system** (`.ds-root` + `navy-*` / `accent-cyan-*` / `GlassCard`, hardcoded hex). **Light-only — never themes to dark.** Used by Dashboard, Calendar, Patients shell, Reports, Finance, Settings. Internally coherent and well-built, but a strategic inconsistency with the token system and invisible to dark mode.
3. **Legacy dark literals** (`src/lib/design.js` `C`/`card`/`makeBtn`, `src/components/shared.jsx` `inputStyle`/`selectStyle`, `src/theme.css` with `!important`, `DentalSpinner`). These are **dark-tuned constants** (`card` bg `#101422`, text `#E8EAF5`, void `#07080E`). When a page built on system #3 renders inside the **light** app shell, it appears as **dark slabs with light text floating on a light canvas** — the worst, most pervasive bug class.

Two cross-cutting mechanics worth holding in mind while reading:
- **Global dark-input rule:** `input,textarea,select { background:var(--bg-secondary)!important; color:var(--text-primary)!important }` (`theme.css:83`) forces near-black fields *everywhere* unless scoped-overridden. Only `.velo-inbox` (`index.css:124–130`) and `.ds-root` (`index.css:298–303`) override it. Pages lacking either wrapper (e.g. Forms) render dark input fields on a light page.
- **`.ds-root` input rescue:** the `.ds-root`-scoped override forces inputs `background:transparent`. This *saves* most Liquid-Glass forms from the dark-input bleed, but can also **silently kill intended colored field backgrounds** (see Treatment Plan status select).

**Strategic takeaway:** PR #27 converted the Inbox to system #1. The remaining ~12 pages are split between system #2 (light-only, themes-broken-but-legible) and system #3 (dark literals, illegible on the light shell). The highest-leverage follow-up is a `design.js` → `--velo-*` migration, which alone resolves the bulk of the BUGs on Tasks/Goals/Docs/Integrations/Automations/Forms/Social.

---

## Findings by page

### Dashboard — `src/pages/DentalDashboard.jsx`
Rendered entirely in the light-only Liquid Glass system. Internally well-built (clear hierarchy, real hover/focus, proper empty states, uses canonical `GlassCard`/`Button`/`Badge`). Issues are theming + a few hand-rolled controls.

- **[BUG]** Whole page / dark mode — never participates in the theme swap; every color is a light-system literal or the fixed `--ds-canvas-gradient` (white→pale-blue, no dark override at `index.css:166`). In dark mode the dashboard stays a light island clashing with themed chrome. *Fix:* migrate to `--velo-*` semantic utilities or add a `[data-theme="dark"] .ds-root` override. (`DentalDashboard.jsx:223`) [needs-visual]
- **[BUG]** Stat tiles — tints hardcoded as off-palette utilities: `bg-accent-cyan-500/10`, `bg-navy-100 text-navy-700`, `bg-emerald-100 text-emerald-700` (`emerald` isn't in the palette). None invert for dark. *Fix:* use `bg-accent-subtle text-accent-fg` and `bg-status-success-bg text-status-success-fg`. (`DentalDashboard.jsx:194`) [needs-visual]
- **[POLISH]** Quick actions — four large hand-rolled `<button>`s with bespoke `navy-gradient`/`glass-card` styling and a divergent focus ring instead of `ui/Button`. *Fix:* build on `ui/Button` or extract a `QuickActionTile`. (`DentalDashboard.jsx:271`)
- **[POLISH]** Today's Schedule rows — hardcoded `border-navy-100/60 bg-white/60`; inline confirm/cancel/complete controls use ad-hoc `emerald`/`rose` hovers that bypass status tokens and won't theme. *Fix:* token-map surfaces + `status-success`/`status-danger`. (`DentalDashboard.jsx:395`)
- **[POLISH]** Recent-patient timestamp — `text-navy-400` (lightest navy) at `text-[11px]` on a white-ish card = low-contrast candidate. *Fix:* `text-content-tertiary`. (`DentalDashboard.jsx:465`) [needs-visual]
- **[NICE]** Stat-tile value typography — `text-5xl font-bold` sits outside the configured type scale. *Fix:* map to a scale token. (`DentalDashboard.jsx:263`)
- **[NICE]** `AddAppointmentModal` (rendered here) repeats the light-only `text-navy-900`/`bg-white/95` palette; same theming caveat. *Fix:* token migration. (`AddAppointmentModal.jsx:202`) [needs-visual]

### Patients — list & profile shell (`src/App.jsx`)
List, header, "My patients" filter, quick-contact bar, and tab bar are built on Liquid Glass + canonical `ui` primitives — clean and internally coherent. Loading uses `SkeletonContacts`; empty/no-results uses `UIEmptyState` in a `GlassCard`. Real defects are where legacy dark styling leaks into these light shells.

- **[BUG]** Primary Doctor `<select>` + all `PatientFormModal` fields render dark-on-light: `inputStyle`/`selectStyle` set `background:#0C0E1A` + light text, and the global `!important` input rule forces a near-black fill. Inside the white modal these are dark fields with a near-invisible hairline border. *Fix:* use `ui/Input`/`ui/Select`, or add a `.ds-root :is(input,...)` light override. (`App.jsx:1620`, `:1629`, `:137`) [needs-visual]
- **[BUG]** `FormField` labels hardcoded `color:'#7B7F9E'` (mid-grey) instead of a navy token — washed-out grey clashing with the `text-navy-500/900` typography everywhere else. *Fix:* `text-navy-600`. (`App.jsx:132`) [needs-visual]
- **[BUG]** `DentalSpinner` (loading fallback for every heavy profile tab) spreads the legacy dark `card` (`#101422` bg, `#E8EAF5` text) — a dark slab during every tab load inside the light profile shell. *Fix:* replace with `SkeletonGlass`/`GlassCard`. (`App.jsx:1645–1651`, used `:1899`, `:1954`+) [needs-visual]
- **[POLISH]** "My patients" toggle is a hand-rolled `<button>` (well-styled, `aria-pressed`) rather than a `ui/Button` variant. *Fix:* Button variant or shared toggle primitive. (`App.jsx:1378–1396`)
- **[POLISH]** No primary-doctor badge surfaced on patient rows or profile header — assignment is only visible inside the form modal's `<select>`. *Fix:* add a doctor `Badge` when `primary_doctor_id` is set. (`App.jsx:1426–1478`, `:1761–1792`) [needs-visual]
- **[POLISH]** WhatsApp/Call quick-contact buttons hand-rolled with emerald/white utilities rather than `ui/Button` (2 lines from a real Button). *Fix:* wrap in Button or accept as deliberate channel branding. (`App.jsx:1820`, `:1830`)
- **[NICE]** Patient-row shows raw `p.dob` string, unformatted/unlabeled — inconsistent with locale-formatted dates in the profile. *Fix:* `toLocaleDateString` or drop. (`App.jsx:1452`)

### Patients — profile tabs (`src/components/DentalTabs.jsx`)
Cross-cutting pattern: every field uses `inputStyle`/`selectStyle` legacy dark literals, but the `.ds-root` rescue (`index.css:298–303`) forces them transparent/inherit, so they render correctly today — fragile tech-debt, downgraded to POLISH. No tab uses the canonical `SkeletonGlass`/`EmptyState`; all loading/empty states are plain text in a `GlassCard` (consistent → POLISH, since no view lacks both states). Clinical color-coding is hardcoded hex throughout (intentional but off-token).

**Medical History**
- **[POLISH]** All form fields use `inputStyle`/`selectStyle` dark literals (rescued by `.ds-root`). *Fix:* migrate to `ui/Input`+`ui/Select`. (`DentalTabs.jsx:235,248,252,307`)
- **[POLISH]** Loading/empty are plain text in a GlassCard, not `SkeletonGlass`/`EmptyState`. (`DentalTabs.jsx:173–181,204`)
- **[POLISH]** Condition chips / allergy remove (×) / bare allergy input hand-rolled with raw `navy-*`/`rose-*` utils rather than `ui/Badge`/`ui/Button`. (`DentalTabs.jsx:215,229,284`)
- **[NICE]** Pregnancy/condition checkbox uses native `accent-accent-cyan-600` styling, not a shared control. (`DentalTabs.jsx:272`)

**Dental Chart**
- **[POLISH]** Tooth buttons hardcode hex via `FINDING_STYLES` (`#ef4444`, `#3b82f6`, `color:'#0A2540'`) — clinical coding, bypasses tokens. *Fix:* move into token layer / palette. (`DentalTabs.jsx:335–344,448–455`)
- **[POLISH]** `grid-cols-16` is a non-standard, undefined Tailwind class; layout survives only via an inline `gridTemplateColumns` fallback. *Fix:* drop the bogus class or register the utility. (`DentalTabs.jsx:489,493`)
- **[POLISH]** Loading "Loading..." text + plain recent-findings empty state, not the canonical primitives. (`DentalTabs.jsx:481,514`)
- **[NICE]** Recent-findings delete is a hand-rolled icon button (recurring pattern). *Fix:* shared `IconButton`. (`DentalTabs.jsx:542`)

**Treatment Plan**
- **[BUG]** Status `<select>` sets `background:sc.bg` inline, but the `.ds-root` rescue forces `background:transparent !important` — the colored status tint is likely silently killed. *Fix:* move tint to a wrapper/class; verify it renders. (`DentalTabs.jsx:740–744,806–813`) [needs-visual]
- **[POLISH]** Plan/item status pills hardcode hex via `PLAN_STATUS_COLOR`/`ITEM_STATUS_COLOR` into inline styles, bypassing `ui/Badge`. *Fix:* map to Badge variants/tokens. (`DentalTabs.jsx:618–631,740–743,810–824`)
- **[POLISH]** Loading/empty plain text, not `SkeletonGlass`/`EmptyState`. (`DentalTabs.jsx:707–714`)
- **[POLISH]** Items table header/rows use raw `navy-*` utils + inline `textAlign`. (`DentalTabs.jsx:773–826`)
- **[NICE]** NewTreatmentPlanModal line-item grid `grid-cols-[60px_90px_1fr_110px_32px]` has no responsive collapse — narrow-viewport horizontal overflow risk. (`DentalTabs.jsx:974,984`) [needs-visual]

**Prescriptions**
- **[BUG]** "Edit" is a bare `<button>` with hand-rolled `text-xs … text-navy-600` sitting beside real `ui/Button` Print/secondary siblings — unstyled-relative-to-system, height-mismatched. *Fix:* `ui/Button variant="ghost" size="sm"`. (`DentalTabs.jsx:1166–1173`)
- **[POLISH]** Loading/empty plain text, not the primitives. (`DentalTabs.jsx:1122–1129`)
- **[POLISH]** Entry-modal medication grid (6 cols) + plan modal use `inputStyle`/`selectStyle`; narrow-viewport overflow risk. (`DentalTabs.jsx:1404,1413`) [needs-visual]
- **[POLISH]** Print preview text `color:'#475569'` hardcoded (print-specific, acceptable but off-token). (`DentalTabs.jsx:1645`)

**Documents**
- **[POLISH]** Loading plain text; non-editor empty state is a plain GlassCard, not `EmptyState` (editors get the full dropzone — good). (`DentalTabs.jsx:1916–1927`)
- **[POLISH]** Dropzone uses `rounded-xl` while the rest of the file uses `rounded-glass`/`rounded-md` — radius inconsistency. *Fix:* align radius token. (`DentalTabs.jsx:1862–1866`)
- **[NICE]** Document-row delete is the recurring hand-rolled icon button (View/Download correctly use `ui/Button`). (`DentalTabs.jsx:1973`)

**Notes**
- **[POLISH]** Loading/empty plain text, not the primitives. (`DentalTabs.jsx:2099–2106`)
- **[POLISH]** Pin/edit/delete are hand-rolled icon buttons with raw `accent-cyan-*`/`rose-*` utils. (`DentalTabs.jsx:2134,2149,2157`)
- **[POLISH]** Title/body inputs use `inputStyle`/`selectStyle` dark literals (rescued). (`DentalTabs.jsx:2274,2286`)
- **[NICE]** "Pin to top" checkbox is an unstyled native `<input type="checkbox">` (inconsistent with the cyan-accented checkboxes elsewhere). (`DentalTabs.jsx:2291`)

### Inbox — `src/App.jsx` (PR #27 conversion)
**PR #27 landed largely clean.** The `VT` alias object (`App.jsx:2197–2210`) routes every core surface/text/border/accent through `rgb(var(--velo-*))`, so the conversation list, thread pane, search, filter tabs, bubbles, date separators, AI-suggestion panel, and input bar all theme automatically in both themes. Inputs are re-lit via the scoped `.velo-inbox :is(input,textarea)` override. `SkeletonInbox` loading + `EmptyState type="inbox"` both present. Residual issues are a handful of non-token colors that survived the conversion.

- **[BUG]** Chat-header action buttons ("View Profile", "Schedule") use `makeBtn('secondary')` → hardcoded dark-theme literals (`background:rgba(0,255,178,0.09)`, `color:'#00FFB2'`). On the light `VT.raised` header this is mint-on-pale-mint, low contrast. *Fix:* `ui/Button variant="secondary"` or `VT`-based inline style. (`App.jsx:2509`, `:2513`) [needs-visual]
- **[BUG]** "Compose" button uses `makeBtn('primary')` → hardcoded `#00FFB2`/`#07080E`; bypasses both token system and canonical Button, coupled to legacy `velo-btn-primary` CSS for hover glow. *Fix:* `ui/Button variant="primary"`. (`App.jsx:2355`) [needs-visual]
- **[POLISH]** AI-suggestion icon tile + active "AI Reply" toggle use `linear-gradient(135deg, ${C.primary}, #A78BFA)` (mint→hardcoded purple), repeated 3×; the purple has no token. *Fix:* promote to a token/shared constant. (`App.jsx:2588`, `:2663`)
- **[POLISH]** Online-status dot uses `border:'2px solid #fff'` — light-only ring that reads as a stray white halo on a dark `VT.raised` avatar. (Channel brand hex are legitimately fixed.) *Fix:* swap dot border to `VT.raised`. (`App.jsx:2428`, `:2492`) [needs-visual]
- **[POLISH]** "Me" bubble timestamp uses `color:'rgba(0,0,0,.5)'` and bubbles `boxShadow:'0 1px 2px rgba(0,0,0,.05)'` — hardcoded black, not a token. *Fix:* `VT.onAccent` at reduced opacity. (`App.jsx:2555`, `:2560`)
- **[POLISH]** Unread total-count badge uses `color:'#fff'` on `VT.danger` — the one header text color not routed through a token. *Fix:* `VT.onAccent`/inverse. (`App.jsx:2353`)
- **[NICE]** Emoji button is a literal `😊` glyph with no handler — inconsistent with the SVG-icon language around it. *Fix:* replace with an icon or remove until wired. (`App.jsx:2630`)

### Calendar — `src/pages/AppointmentsPage.jsx`
Most complex surface; carefully built but entirely light-only Liquid Glass, with more hardcoded-hex and hand-rolled-button instances than Dashboard.

- **[BUG]** Whole page / dark mode — `.ds-root` light canvas + pervasive `navy-*`/`accent-cyan-*`/`white/*` that never swap. In dark mode the whole calendar is a light island. *Fix:* token-migrate or add a dark `.ds-root` override. (`AppointmentsPage.jsx:375`) [needs-visual]
- **[BUG]** `STATUS_STYLE` (`:24`) hardcodes `bg-amber-50`/`bg-emerald-50`/`bg-rose-50` and `cancelled:'bg-gray-100 text-gray-600'` — raw palette bypassing status tokens; cancelled risks gray-on-gray illegibility, and cards use `bg-gray-100/80 text-gray-500 line-through`. *Fix:* `bg-status-*-bg text-*-fg` + neutral `bg-surface-sunken` for cancelled. (`AppointmentsPage.jsx:24`) [needs-visual]
- **[BUG]** Loading state is a bare `Loading...` / `جاري التحميل...` string, not `SkeletonGlass` — blank flash on a heavy grid. *Fix:* `SkeletonGlass` rows/columns. (`AppointmentsPage.jsx:519`)
- **[POLISH]** Header doctor filter is a hand-rolled native `<select>` with bespoke classes instead of `ui/Select`; won't theme. *Fix:* `ui/Select`. (`AppointmentsPage.jsx:431`)
- **[POLISH]** Detail-panel mixes canonical `ui/Button` (Confirm/Reschedule/Delete) with three hand-rolled buttons (Complete/Cancel/WhatsApp) carrying ad-hoc emerald/rose recipes. *Fix:* add a success/neutral Button variant; remove the bespoke ones. (`AppointmentsPage.jsx:999`)
- **[POLISH]** Hardcoded hex in JS styles: active-tab gradient `#103562,#06B6D4`, current-time line `#06B6D4`, week-view time label `#475569`. Cyan/navy duplicate tokens; `#475569` is off-system. *Fix:* reference `--ds-cyan-500`/`--ds-navy-700` vars; `#475569`→`text-content-secondary`. (`AppointmentsPage.jsx:885`)
- **[POLISH]** Modal mixes token-driven inputs (`FIELD_BASE` uses `--velo-*` — good) with light-only `text-navy-900` headings and `bg-amber-50/80` conflict banner — mixed systems in one modal. *Fix:* make the modal chrome consistent. (`AppointmentsPage.jsx:1167`) [needs-visual]
- **[POLISH]** Mini-calendar weekday/empty-day labels use `text-navy-400` at `text-[10px]/[11px]` — low-contrast candidate; ambiguous single-letter EN labels. *Fix:* `text-content-tertiary`; two-letter labels. (`AppointmentsPage.jsx:604`) [needs-visual]
- **[NICE]** Magic-number layout dims (`w-[240px]`, `w-[340px]`, `SLOT_H=48`) bypass named spacing aliases; note `cal-hour` token is 56px but the grid uses 48px — token and code disagree. *Fix:* reconcile with spacing tokens. (`AppointmentsPage.jsx:55`)
- **[NICE]** Day/week cards print the raw enum (`apt.status`) instead of the localized `L[apt.status]` used in the detail panel — cards show `in_progress`/`no_s` even in Arabic. *Fix:* use the `L` label map. (`AppointmentsPage.jsx:890`)

### Tasks — `src/pages/TasksPage.jsx`
Worst-affected of the token-migration pages. Imports `C`/`makeBtn`/`card` (dark literals) pervasively; **PR #27's `--velo` conversion touched only the two Kanban header spans** (`:271–275`). Everything else is dark slabs on the light shell. (Data is `localStorage`/synchronous, so the absence of a loading skeleton is acceptable; empty states exist.)

- **[BUG]** Kanban columns — `COLUMN_BG` tints (`rgba(255,255,255,0.02)`, `rgba(0,255,178,0.04)`) were tuned for the `#07080E` dark canvas; on a light page they render flat near-white with no visible column separation. *Fix:* map to `--velo` surface/accent-subtle tokens. (`TasksPage.jsx:16`) [needs-visual]
- **[BUG]** Task cards (board) — `...card` spreads `#101422` bg + `#E8EAF5` text: dark slabs with light text in a light column. *Fix:* `bg-surface-raised`/`text-content-primary`. (`TasksPage.jsx:480`, `design.js:155`) [needs-visual]
- **[BUG]** Page header H1/subtitle use `C.text` (`#E8EAF5`) / `C.textMuted` — light-on-light, illegible (PR #27 only patched the column-header chips, not this). *Fix:* `--velo-text-primary`/`-tertiary`. (`TasksPage.jsx:205–209`) [needs-visual]
- **[BUG]** List-view table — header `C.textLabel`, rows `C.text`/`C.textSec`, dividers `C.border` (white-alpha lines invisible on light), hover `rgba(255,255,255,0.02)`. Whole table dark-tuned on a light card. *Fix:* retoken to `--velo`. (`TasksPage.jsx:341–417`) [needs-visual]
- **[BUG]** Both modals (`TaskFormModal`, `TaskDetailModal`) — `C.text`, `C.bg` (`#07080E`) panels, `inputStyle` dark fields with inset black shadow, render dark inside light modals. *Fix:* retoken bodies; use `ui/Input`/`ui/Select`. (`TasksPage.jsx:611–933`) [needs-visual]
- **[POLISH]** Three button systems on one page: hand-rolled Board/List toggle (`C.primary`/`C.white`), `makeBtn(...)`+`velo-btn-primary` for actions, none `ui/Button`. *Fix:* standardize on `ui/Button`. (`TasksPage.jsx:214–239`, `:722–735`)
- **[POLISH]** `StatusBadge` hardcodes a *light* hex palette while `PriorityBadge` hardcodes dark-tuned rgba — two inconsistent badge systems, neither using `ui/Badge`. *Fix:* unify on `ui/Badge` + status tokens. (`TasksPage.jsx:547–578`)
- **[NICE]** Per-column "No tasks" empty state is a bare centered line, not `ui/EmptyState`. (`TasksPage.jsx:289–293`)

### Goals — `src/pages/GoalsPage.jsx`
Same `C`/`card`/`makeBtn` dark-literal foundation on a light page. Plus a real async fetch with no loading affordance.

- **[BUG]** Goal cards/header/empty state all use `...card` (`#101422`/`#E8EAF5`) and `C.text`/`C.textMuted` → dark slabs with light text. *Fix:* retoken to `--velo`. (`GoalsPage.jsx:213–312`) [needs-visual]
- **[BUG]** No loading state for async progress — `computeGoalProgress` runs in `useEffect` against Supabase (`:138–160`); until it resolves every ring shows 0% with no skeleton, reading as "all goals at zero". *Fix:* track a `loading` flag, render pending rings. (`GoalsPage.jsx:138–160`, `:257–298`)
- **[POLISH]** `progressColor`/`ProgressRing` pull `C.success`/`C.primary`/`C.border`; the ring track `C.border` is a white-alpha line nearly invisible on light. *Fix:* `--velo-border-subtle` track + accent/status arc. (`GoalsPage.jsx:68–92`)
- **[POLISH]** Buttons are `makeBtn(...)`+`velo-btn-primary`, not `ui/Button`. *Fix:* adopt `ui/Button`. (`GoalsPage.jsx:227`, `:366–372`)
- **[POLISH]** Modal info banner + Cancel/Create buttons hand-rolled with `C.primaryBg`/`makeBtn`. *Fix:* tokenize. (`GoalsPage.jsx:358–372`)

### Docs — `src/pages/DocsPage.jsx`
Same dark-literal foundation, plus a `contentEditable` editor explicitly painted dark and a hardcoded toolbar palette. (`localStorage`-backed → no loading state needed; empty states exist.)

- **[BUG]** Editor surface explicitly dark — `contentEditable` sets `background:C.white` (`#101422`) + `color:C.text` (`#E8EAF5`); list/folder panels + both modals spread `...card`. *Fix:* retoken to `--velo-surface-raised`/`-text-primary`. (`DocsPage.jsx:430–435`, `:248`, `:321`, `:375`) [needs-visual]
- **[BUG]** Toolbar on `background:C.bg` (`#07080E`) with `C.textSec` labels — a black bar with dim, very-low-contrast B/I/U glyphs on a light page. *Fix:* retoken to a light surface + token text. (`DocsPage.jsx:65–117`) [needs-visual]
- **[BUG]** Color-picker swatches `COLORS = ['#101422', ...]` — the first "black" swatch is actually the dark-theme card hex, so it inserts near-invisible text into documents. *Fix:* use a true ink-900 token for default text color. (`DocsPage.jsx:52`, `:98–113`) [needs-visual]
- **[POLISH]** Header, search input (`inputStyle` dark field), folder buttons, doc rows, empty states all depend on the dark literals; the search field itself is a dark box. *Fix:* migrate inputs to `ui/Input`, retoken. (`DocsPage.jsx:226–240`, `:263–286`, `:329–368`)
- **[POLISH]** All buttons hand-rolled via `makeBtn` (primary/secondary/danger/ghost)+`velo-btn-primary` instead of `ui/Button` (which has a `destructive` variant). (`DocsPage.jsx:237`, `:309–312`, `:465`, `:487`)
- **[POLISH]** Inline `FolderIcon`/`FileIcon` redefined locally instead of added to shared `Icons`. *Fix:* move into `Icons`. (`DocsPage.jsx:18–28`)
- **[NICE]** Doc-list/editor empty states are plain text/icon, not `ui/EmptyState`. (`DocsPage.jsx:322–327`, `:454–468`)

### Automations — `src/pages/AutomationsPage.jsx`
Grep showed "0 hex hits" — **misleading**: it routes everything through `design.js` dark literals (one indirection deeper). Uses shared `Modal`/`Toggle`/`FormField` (more consistent than Social) but those are also legacy-dark. When Supabase is configured the list starts empty with no empty/loading state.

- **[BUG]** Cards, stats row, list rows all use `card` (`#101422`) + `C.text`/`C.textSec` → dark slabs with light-illegible text on the light canvas. *Fix:* migrate to tokens / `ui/GlassCard`. (`AutomationsPage.jsx:60`, `:73`, `:78–82`) [needs-visual]
- **[BUG]** No empty state — when `isSupabaseConfigured()` is true, `automations` starts `[]` and the list renders nothing (stats 0/0/—, blank list, no "create first" guidance). *Fix:* `ui/EmptyState` with the New-automation CTA. (`AutomationsPage.jsx:31`, `:68–94`)
- **[POLISH]** No loading skeleton for the (currently synchronous) list; add `SkeletonGlass` when wired to async. (`AutomationsPage.jsx:31`)
- **[POLISH]** Buttons via `makeBtn`+`velo-btn-primary`, not `ui/Button`. (`AutomationsPage.jsx:50`, `:124–125`)
- **[POLISH]** When/Then condition chips use `C.bg`/`C.border` dark literals. *Fix:* token chip / `ui/Badge`. (`AutomationsPage.jsx:80–82`)
- **[POLISH]** Modal close-X + fields rely on legacy `inputStyle`/`selectStyle`/`C.textMuted`, bypassing `ui/Modal`+`ui/Input`+`ui/Select`. (`AutomationsPage.jsx:105–122`)
- **[NICE]** Stat-card accent colors (`C.success`/`C.primary`/`C.purple`) are mint/purple literals; map to status/accent tokens. (`AutomationsPage.jsx:56–58`) [needs-visual]

### Forms — `src/pages/FormsPage.jsx`
Built **entirely** on legacy dark `design.js` with **no `.ds-root` wrapper** — so unlike Reports/Finance it renders as a dark island inside the light shell, and is NOT scoped-rescued from the global dark-input rule. Worst-category bleed, pervasive; bypasses every canonical primitive.

- **[BUG]** Whole page renders on the dark `design.js` palette (`card` `#101422`, `C.bg` `#07080E`, `C.text` `#E8EAF5`) with no `.ds-root` scope → dark cards/text bleeding into the light shell. *Fix:* restyle onto `--velo-*` (or wrap `.ds-root` + Liquid Glass like Reports/Finance) and adopt `ui/GlassCard`/`Button`/`Input`/`Select`. (`FormsPage.jsx:52–300`) [needs-visual]
- **[BUG]** Builder + Preview fields use `inputStyle`/`selectStyle` whose `var(--bg-void)` is *also* force-overridden by the global `!important` dark-input rule — near-black fills on a light page. Forms has no scoped override. *Fix:* scope-override under a light wrapper or migrate to `ui/Input`/`ui/Select`. (`FormsPage.jsx:155,176–181,194–208,243–249`) [needs-visual]
- **[BUG]** Submissions table header cells hardcode `color:'#374151'` (slate) on a `C.bg` (`#07080E`) header → dark-on-dark, effectively illegible. *Fix:* token text/surface via a migrated table. (`FormsPage.jsx:285–286`)
- **[BUG]** Preview Submit button — hand-rolled `background:C.primary` (`#00FFB2` mint) with `color:'#fff'` → mint-on-white-text, very low contrast. *Fix:* `ui/Button variant="primary"`. (`FormsPage.jsx:254`)
- **[BUG]** Builder field-type buttons / icon buttons / "Add option" / back arrows all hand-rolled with inline `makeBtn`/transparent styles; emoji (`📞📅📎☑`) as field-type icons read as inconsistent low-fi typography. *Fix:* standardize on `ui/Button` + an icon set. (`FormsPage.jsx:81–85,141–146,174,209`)
- **[POLISH]** Empty states (no forms / no fields / no submissions) are plain `card` divs with an emoji, not `ui/EmptyState`. (`FormsPage.jsx:62–68,158–161,276–279`)
- **[POLISH]** Status pill hand-rolled with `C.successBg`/`C.success`, not `ui/Badge`. (`FormsPage.jsx:75–77`)

### Social Pages — `src/pages/SocialMonitor.jsx`
Highest-density offender in the app. Built with hardcoded dark hex **inline** (not even via `design.js`): every surface is a dark slab, body text `#7B7F9E`, headings `#E8EAF5`. On the default light canvas it renders as dark cards with near-white-on-near-white text. Loading + empty states exist but are styled with the same dark literals. Needs a full rewrite onto tokens + `ui/` primitives.

- **[BUG]** Page surfaces & text — hardcoded dark hex (`#0C0E1A`, `rgba(255,255,255,0.03)`, text `#E8EAF5`/`#7B7F9E`) that doesn't theme → dark slabs with low-contrast/illegible text on the light canvas. *Fix:* `--velo-*` token classes (`bg-surface-raised`, `text-content-primary/secondary`, `border-subtle`). (`SocialMonitor.jsx:431,434,507–510`) [needs-visual]
- **[BUG]** Connection-card stat tiles — `rgba(255,255,255,0.02)` fills + `rgba(255,255,255,0.05)` borders near-invisible over light; values `#E8EAF5` illegible. *Fix:* `bg-surface-sunken`/token border/`text-content-primary`. (`SocialMonitor.jsx:572–583`) [needs-visual]
- **[BUG]** ConnectionFormModal inputs hardcode `background:'#0C0E1A'`/`color:'#E8EAF5'`; modal itself `#0C0E1A`. *Fix:* `ui/Input`+`ui/Modal` or token fields. (`SocialMonitor.jsx:121–128,144`) [needs-visual]
- **[BUG]** OperatorContactModal — same hardcoded dark shell. *Fix:* `ui/Modal` + tokens. (`SocialMonitor.jsx:298–306`) [needs-visual]
- **[BUG]** All action buttons hand-rolled with literal mint `#00FFB2` on `#07080E` (Add/Save/Contact/Edit/Cancel/Delete), unthemed. *Fix:* `ui/Button` variants. (`SocialMonitor.jsx:444–448,261–270,233–242,548–556`)
- **[POLISH]** Error banner & warning callout use ad-hoc `rgba(239,68,68,...)`/`rgba(245,158,11,...)` instead of `--velo-status-*`. *Fix:* status tokens / Badge. (`SocialMonitor.jsx:456–459,326–331`)
- **[POLISH]** Loading is a bare "Loading…" line, not `SkeletonGlassCard` grid placeholders. (`SocialMonitor.jsx:465–468`)
- **[POLISH]** Empty state hand-rolled (emoji + inline div), not `ui/EmptyState`. (`SocialMonitor.jsx:469–496`)
- **[NICE]** Platform brand colors are legitimately fixed, but the fallback `#7B7F9E` + icon strokes inherit dark grey; verify icon contrast on light tiles once tokenized. (`SocialMonitor.jsx:9–22`) [needs-visual]

### Integrations — `src/pages/IntegrationsPage.jsx`
Renders through `design.js` (`C`/`card`/`makeBtn`) — all dark literals → dark cards on the light canvas. (Data is a static in-file array, so no loading state needed, but the filtered list can be empty with no empty state.)

- **[BUG]** Integration cards & page — `card` (`#101422`) + `C.text`/`C.textSec` render dark cards with illegible text on warm-paper. *Fix:* migrate to `--velo-*`/`ui/GlassCard`. (`IntegrationsPage.jsx:70,46–47,77–81`) [needs-visual]
- **[BUG]** Search input — `background:C.white` (`#101422`, dark) + `color:C.text` on a light page = dark-field bleed. *Fix:* `ui/Input` or token fields. (`IntegrationsPage.jsx:53–55`) [needs-visual]
- **[BUG]** Category filter pills — inactive use `background:C.bg` (`#07080E`) + `C.textSec`; active uses `C.primary` mint with `#fff` text (low contrast — mint needs dark text per `--velo-text-on-accent`). *Fix:* token segmented control with correct on-accent. (`IntegrationsPage.jsx:59–63`) [needs-visual]
- **[BUG]** No empty state — zero search/category matches render a blank area, no message. *Fix:* `ui/EmptyState` when `filtered.length === 0`. (`IntegrationsPage.jsx:68–93`)
- **[POLISH]** Buttons via `makeBtn` (mint/dark literals), not `ui/Button`. (`IntegrationsPage.jsx:86–89`)
- **[POLISH]** "Connected" status pill uses `C.successBg`/`C.success`, not `ui/Badge`+tokens. (`IntegrationsPage.jsx:83–85`)
- **[NICE]** Connected-dot `border:'2px solid #fff'` assumes a dark card behind it; will look off on a light token surface. *Fix:* border against `--velo-surface-raised`. (`IntegrationsPage.jsx:71`) [needs-visual]

### Reports — `src/pages/ReportsPage.jsx` (+ `ReportBuilder.jsx`)
**Clean.** Fully Liquid Glass: `.ds-root`, `GlassCard`/`ChartCard`/`KPICard`, `ui/Button` range tabs, navy/cyan tokens, tabular-nums money, RTL-aware labels. Loading + per-chart `ChartEmpty` both handled. Chart series colors are intentionally hardcoded (no chart lib, documented).

- **[POLISH]** Page loading is plain "Loading reports..." text in a GlassCard, not `SkeletonGlassCard` placeholders matching the grid. (`ReportsPage.jsx:180–185`)
- **[POLISH]** Chart series colors are raw hex (`#103562`, `#06B6D4`, `#22D3EE`, status rgba) — intentional/on-brand but off-token; would break if themed. *Fix:* promote to a chart-palette token map. (`ReportsPage.jsx:44–60,310,432,488,547–573`)
- **[POLISH]** `ReportBuilder.jsx` placeholder uses legacy dark `design.js` — a dark island inconsistent with the light page it links from (low impact: stub reached only via a voided `onOpenBuilder`). *Fix:* restyle to `.ds-root`+`GlassCard`/`EmptyState`/`ui/Button` when built. (`ReportBuilder.jsx:14,21,26–40`)

### Finance — `src/pages/FinancePage.jsx`
**Cleanest of all.** Fully Liquid Glass: `.ds-root`, `GlassCard`/`KPICard`, `ui/Button`/`Input`/`Select`/`Badge`/`EmptyState`. Currency handling correct (per-currency KPI cards, never summed; `formatMoney` + minor units; tabular-nums). Loading, empty, and zero-revenue fallback all present; modal scopes `.ds-root` so the global dark-input rule doesn't bleed.

- **[POLISH]** Table loading uses plain "Loading..." text rather than row-shaped `SkeletonGlass`. (`FinancePage.jsx:303–306`)
- **[POLISH]** A few inline rgba/hex track colors + navy gradients are raw literals (consistent with Reports' charts, off-token). Cosmetic. (`FinancePage.jsx`, Badge tones via `methodTone` already tokenized) [needs-visual]
- **[NICE]** KPI grid can show 3 cards in a 4-col layout, leaving an empty cell at `lg`. *Fix:* adjust grid span when <4 cards. (`FinancePage.jsx:218–263`) [needs-visual]

### Settings — `src/pages/SettingsPage.jsx` (all tabs)
Fully on the light-only Liquid Glass system (`.ds-root` rescues all inputs, so no dark-input bleed). Clean, well-built visual treatment. The bulk of findings are **non-persisting / mock forms with no save feedback** plus the usual token bypasses.

- **[POLISH]** *(Global)* Entire page hard-bound to light-only Liquid Glass; never themes to dark. *Fix (long-term):* migrate to `--velo-*`. (`SettingsPage.jsx:65`)
- **[NICE]** *(Global)* `tabLabels` is one long literal mixing all 10 entries. *Fix:* move into `TABS`/`translations.js`. (`SettingsPage.jsx:61`)
- **[BUG]** *(Organization)* Industry dental-info card only renders when `industry === 'dental'`, but there is no industry selector and the form defaults to `'general'` → dead, unreachable branch. *Fix:* add an industry `Select` or remove the branch. (`SettingsPage.jsx:136,224`)
- **[POLISH]** *(Organization)* Brand color gradient hardcodes `#103562`; `BRAND_COLORS` hardcoded hex array. *Fix:* source endpoint from a navy token. (`SettingsPage.jsx:41,164`)
- **[POLISH]** *(Organization)* Brand Color label uses `font-semibold` while every other field label is `font-medium` — weight inconsistency. *Fix:* `font-medium`. (`SettingsPage.jsx:181`)
- **[POLISH]** *(Organization)* "Saved!" is a transient 2s label swap with no error path; `onSave` is fire-and-forget — a failed save still shows "Saved!". *Fix:* await + error toast. (`SettingsPage.jsx:146–149`)
- **[POLISH]** *(Clinic)* `DOCTOR_PALETTE` hardcoded hex + alpha-via-string-concat for avatar tints (deliberate, acceptable; optionally tokenize). (`SettingsPage.jsx:1339,1468–1471`)
- **[POLISH]** *(Clinic)* Doctor-list loading is plain "Loading..." text, not `SkeletonGlass`. (`SettingsPage.jsx:1429–1435`)
- **[POLISH]** *(Clinic)* Working hours save to `localStorage` only (not backend); each keystroke fires save+toast → toast spam while dragging the time spinner. *Fix:* debounce/save-on-blur; persist server-side. (`SettingsPage.jsx:1411–1415,1507`)
- **[POLISH]** *(Clinic)* "Days Off" heading duplicates the Notifications section-heading style inline. *Fix:* extract a `SectionLabel`. (`SettingsPage.jsx:1516`)
- **[BUG]** *(Profile)* "Save Changes" button has **no `onClick`** — purely decorative; fields seeded with mock defaults, nothing persists, no loading/saving/success state. *Fix:* wire to a profile-update call with feedback; load real values. (`SettingsPage.jsx:253–260,337`)
- **[POLISH]** *(Profile)* "Change Photo" opens a picker but the file input has no `onChange` — selecting a file does nothing. *Fix:* add upload handler or disable. (`SettingsPage.jsx:276`)
- **[POLISH]** *(Team)* Read-only invite-link is a hand-rolled `<input>` duplicating the `Input` primitive's wrapper styles. *Fix:* `<Input readOnly>`. (`SettingsPage.jsx:519–526`)
- **[POLISH]** *(Team)* Identity load shows plain "Loading…" text, no skeleton. (`SettingsPage.jsx:445–447`)
- **[BUG]** *(Notifications)* Toggles live in local state only; "Save Changes" has **no `onClick`**, nothing persists, no feedback. *Fix:* wire save with feedback; load real prefs. (`SettingsPage.jsx:607–612,649`)
- **[POLISH]** *(AI Agent)* Knowledge-base `<textarea>` hand-rolls the Input glass wrapper inline (no `Textarea` primitive exists). *Fix:* add a `Textarea` primitive. (`SettingsPage.jsx:957–963`)
- **[POLISH]** *(AI Agent)* KB file metadata persists to `localStorage` while KB text goes to `onSave` — the two can desync. *Fix:* persist file list with org settings. (`SettingsPage.jsx:810,828`)
- **[POLISH]** *(AI Agent)* Same fire-and-forget `onSave`+2s swap with no error path. *Fix:* await + error toast. (`SettingsPage.jsx:817–820`)
- **[NICE]** *(AI Agent)* Raw emoji (`👔😊📋🧪📄`) as iconography instead of `Icons.*`. (`SettingsPage.jsx:834–836,937`)
- **[POLISH]** *(Integrations)* `testWhatsApp` surfaces errors only as `text-[11px] text-rose-600` (no token); also calls `graph.facebook.com` directly from the client with the access token (functional concern, out of UI scope). (`SettingsPage.jsx:1224–1226,1065–1072`)
- **[POLISH]** *(Integrations)* Facebook `#1877F2` / Instagram `#E4405F` hardcoded in inline SVGs — deliberate brand-correctness, acceptable. (`SettingsPage.jsx:1248,1255`)
- **[POLISH]** *(Integrations)* Same fire-and-forget `onSave`+2s swap. *Fix:* await + error toast. (`SettingsPage.jsx:1060–1063`)
- **[NICE]** *(Integrations)* `WaStep` clickable header is a `<div onClick>` — not keyboard-focusable. *Fix:* make it a `<button>`. (`SettingsPage.jsx:1086–1088`)
- **[NICE]** *(Integrations)* Connect Facebook/Instagram/Google buttons have no `onClick` — visual stubs. *Fix:* wire or disable. (`SettingsPage.jsx:1246,1253,1274`)
- **[BUG]** *(Billing)* Entirely mock — invoices/meters/`$49` plan hardcoded; "Upgrade Now" and download buttons have no `onClick`; no loading/empty/error states for what should be live billing data. *Fix:* load real data with states; wire actions. (`SettingsPage.jsx:657–667,728–734`)
- **[POLISH]** *(API Keys)* Operator-contact CTA `<a>` hand-rolls the navy-gradient button inline (Button renders a `<button>`, no link variant). *Fix:* add a `Button as="a"` prop. (`SettingsPage.jsx:778–785`)
- **[POLISH]** *(Doctor Form / Prescription Template)* Confirm-remove box uses Tailwind `red-*` while the rest of the page uses `rose-*` for destructive surfaces — inconsistent red scale. *Fix:* `rose-50/100`. (`SettingsPage.jsx:1701`)
- **[POLISH]** *(Doctor Form / Prescription Template)* Template preview/loading use plain text, no skeleton for the 32×44 preview slot. (`SettingsPage.jsx:1627–1633,1671–1673`)

*Clean tabs:* Agency AI (operator-only) and the API-Keys informational notice are fully tokenized and correct.

---

## Summary

| Page | BUG | POLISH | NICE | Total |
|------|----:|-------:|-----:|------:|
| Dashboard | 2 | 3 | 2 | 7 |
| Patients — list & profile shell | 3 | 3 | 1 | 7 |
| Patients — profile tabs | 2 | 17 | 5 | 24 |
| Inbox | 2 | 4 | 1 | 7 |
| Calendar | 3 | 5 | 2 | 10 |
| Tasks | 5 | 2 | 1 | 8 |
| Goals | 2 | 3 | 0 | 5 |
| Docs | 3 | 3 | 1 | 7 |
| Automations | 2 | 4 | 1 | 7 |
| Forms | 5 | 2 | 0 | 7 |
| Social Pages | 5 | 3 | 1 | 9 |
| Integrations | 4 | 2 | 1 | 7 |
| Reports | 0 | 3 | 0 | 3 |
| Finance | 0 | 2 | 1 | 3 |
| Settings (all tabs) | 4 | 20 | 4 | 28 |
| **TOTAL** | **42** | **76** | **21** | **139** |

### Severity definitions
- **BUG** — visibly broken or illegible in at least one theme: dark literal bleeding into the light shell, light-on-light / dark-on-dark text, broken/overflowing layout, a data view with no loading **and** no empty state, an unstyled/decorative control, or a "Save" with no handler/feedback.
- **POLISH** — works and is legible but bypasses the token system, diverges from a canonical primitive, has a plain-text loading/empty state, or has a minor spacing/typography inconsistency.
- **NICE-TO-HAVE** — purely cosmetic refinement, micro-typography, a11y nicety.

### Highest-leverage fixes (not part of this audit — recommendations only)
1. **`design.js` → `--velo-*` migration.** The dark-literal `C`/`card`/`makeBtn`/`inputStyle` set is the root of ~30 of the 42 BUGs (Tasks, Goals, Docs, Integrations, Automations, Forms, plus the patient-profile `DentalSpinner`/inputs). Retokenizing `design.js` once fixes most pages at the source.
2. **SocialMonitor full rewrite.** It doesn't even use `design.js` — raw inline dark hex throughout; needs a from-scratch pass onto tokens + `ui/` primitives.
3. **Settings form wiring.** Profile / Notifications / Billing have decorative "Save" buttons that silently do nothing — the most user-facing "is this broken?" risk despite the page looking clean.
4. **Adopt `SkeletonGlass`/`EmptyState` everywhere.** Nearly every page substitutes plain "Loading…" text and bespoke empty states for the canonical primitives.

### Items needing a rendered/visual confirmation
Tagged **[needs-visual]** inline — chiefly: exact contrast ratios on low-contrast text candidates (Dashboard timestamp, Calendar mini-cal labels), narrow-viewport overflow on multi-column modal grids (Treatment Plan, Prescriptions), and whether the `.ds-root` input rescue silently kills the Treatment-Plan colored status-select background.
