# Velo Dental — Static Code Audit, 2026-05-07

**Bounds acknowledged.** Read-only Phase 1, then low-risk fixes on `audit/static-pass-2026-05-07` in Phase 2. No DB migrations, no deploys, no merges, no master pushes, no .env edits, no architectural changes, no file deletes.

**Master baseline:** `92f2306` (latest after agency-placeholder restore PR landed today).

> Summary block at top, populated at end of Phase 3.

## Session summary

**Branch:** `audit/static-pass-2026-05-07`, off `master@92f2306`.

**Findings by severity:**
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 1 (Pass 8 — `chair_id` is still throughout the appointments domain despite the audit prompt's premise that "chairs were fully removed"; UI still renders a `<FormField label="Chair">`. Architectural decision required, escalated.)
- LOW: 19 (14 unused imports + 5 hardcoded English strings)

**Phase 2 commits (in order on this branch):**
1. `df6d33f` — `audit: Phase 1 findings + scanner scripts (2026-05-07)` (read-only artifact: findings .md + 3 scanner .cjs files)
2. `d78e4f0` — `audit: remove 13 unused named imports across 7 files`

Total: **2 commits** beyond `master`. Each cherry-pickable; the second carries the only source-tree change.

**Lint:**
- Starting baseline (master @92f2306): **54 problems** (45 errors, 9 warnings)
- After Phase 2 commit `d78e4f0`: **46 problems** (37 errors, 9 warnings)
- Net: **−8 errors**, no new warnings, no regressions.

**Build:** clean throughout — `vite ✓ built in 475ms` after final commit. Pre-existing chunk-size warning on `assets/index-*.js` (640 kB / 178 kB gzip) is unrelated to this work.

**Time-boxed / skipped tasks:**
- None skipped due to time. Comment-aware regex tooling for Passes 3–7 took several iterations to be trustworthy; results are in §Pass 4's auditor's note. The dead-ref scanner needed three rewrites and the unused-imports scanner needed two before the spot-checks aligned with manual greps.

**Concerns / surprises to flag:**

1. **Pass 8 — premise mismatch on chairs.** The audit prompt asserts "chairs were fully removed; verify nothing slipped through." The codebase has 15 `chair_id` references across 6 files including a live UI form field (`AddAppointmentModal.jsx:328`) and the schema definition (`schema.sql:224`). Memory has no entry stating chairs were fully removed; closest is *"Velo Clinical Luxury session 3 progress (incomplete) — Commit B (DayView chair→doctor axis pivot, 7 hunks) approved but not applied"*, which describes a *single-view* axis pivot, not a model-level removal. Either the prompt's premise is mis-remembered, or the chair-removal work was intended but not yet done. Logged for review — no fix attempted (architectural decision required).

2. **Pass 5 — theme.css is not a zombie.** It's actively `@import`-ed at `src/index.css:2`. The migration backlog item is real (165 lines of legacy CSS still loaded) but it is not unused — removing or migrating it is multi-file, architectural work, and was correctly out of audit scope.

3. **`React` default import in `AddAppointmentModal.jsx`** is unused (the project uses automatic JSX runtime; no other file in `src/` imports React explicitly). I deliberately did not remove it, because the audit spec says "Remove unused **named** imports" and `React` is a default import. Trivial human-call follow-up if you want lint at 45.

4. **Audit tooling artifacts kept in repo.** `.audit-dead-refs.cjs`, `.audit-unused-imports.cjs`, `.audit-hardcoded-strings.cjs` are committed alongside the findings file. They're re-runnable for future audits and document the limitations of regex-based JS parsing (see §Pass 3's note). If you don't want them in the tree they're trivial to revert with a single commit.

5. **Hardcoded strings sample, not exhaustive.** `.audit-hardcoded-strings.cjs` only catches JSX *text content between tags*. Strings inside attributes (`title=`, `aria-label=`, `placeholder=`), template literals, and `style={{ ... 'string' ... }}` patterns are not in scope. If full i18n coverage is the goal, a tokenizer-based pass is needed.

6. **Files I never touched in Phase 2:** `App.jsx`, all of `src/pages/*` other than the three above, `src/lib/*` other than `database.js`, all of `src/contexts/*`, and the api/ and scripts/ folders. The bounds intentionally limited Phase 2 to import-removal — nothing else was eligible.

---

## Phase 1 findings

### Pass 1 — Console artifacts

**Search:** `console.log|console.warn|console.error|console.debug|debugger;` across `src/`.

**Result:** 41 console occurrences across 13 files; zero `console.log`; zero `debugger;`. Every `console.error` and `console.warn` is either:
- Inside a `catch (err) { ... }` block (39 occurrences) — intentional error logging
- A guarded dev-mode boot warning at `src/lib/supabase.js:13` — fires only when Supabase env vars are missing in non-PROD builds, with explanatory text for the developer

**Verdict:** Nothing to remove. No leftover dev artifacts.

**Phase 2 eligible:** N (nothing to do).

---

### Pass 2 — TODO / FIXME / HACK / WIP / @deprecated

**Search:** comment-anchored `(// | /* | *) (TODO|FIXME|HACK|WIP|@deprecated)` across `src/`, plus a permissive case-insensitive sweep.

**Result:** zero. All apparent matches were false positives (the literal string `'todo'` is a task-status enum value used by `TasksPage.jsx` and `schema.sql`; the word "wipe" matched WIP without a word boundary; "XXX" matched a phone-format helper "07XX XXX XXXX" in `DesignSystem.jsx`).

**Verdict:** No orphan TODO markers to retag.

**Phase 2 eligible:** N.

---

### Pass 3 — Dead component references across `src/`

**Method:** purpose-built scanner (`.audit-dead-refs.cjs` at repo root, leave-as-is — auditor artifact). Walks every `.jsx/.tsx/.js/.ts` file under `src/`. For each file, collects JSX usages (`<Foo`), local definitions (`function Foo`, `const Foo =`, `let Foo =`, `class Foo`, destructure-rename `{ x: Foo }`), and full import bindings (default, named, aliased, namespace, default+named combos), with side-effect `import 'path'` lines pre-stripped to prevent CRLF/multi-line bleed. Reports any JSX usage not matched by any of those.

**Result:** **Clean — zero dead component references.** The three previously dead refs (`AgencyPlaceholder`, `AgencyEmptyState`, `AgencyDashboard`) were already restored in today's PRs.

**Verdict:** No follow-up.

**Phase 2 eligible:** N.

> **Auditor's note on tooling:** the dead-ref scanner needed several iterations to be trustworthy. The lazy regex `import\s+([^;]+?)\s+from` over the full source happily bridged across newlines, eating real code when (a) a side-effect import line preceded another import, (b) the word "imports" appeared in a doc-comment, or (c) a string literal contained `/*` (e.g. `accept="image/*"`, the glob `operator/*`). Final scanner uses a line-anchored `^\s*import` regex with side-effect-import pre-stripping, and **deliberately does not strip block comments** — regex-only comment removal cannot tell `/*` inside a string from a real block-comment opener. Worth knowing if anyone reuses these scanner files (`.audit-*.cjs` at repo root).

---

### Pass 4 — Unused named imports

**Method:** `.audit-unused-imports.cjs` walks every `.jsx/.tsx/.js/.ts` under `src/`, parses each file's full import bindings (default, named, aliased, namespace), strips all import statements from a working "body" copy, and word-boundary-matches each binding against the body. Same line-anchored regex / no-block-comment-strip caveats as the dead-ref scanner. Each finding manually spot-checked with `grep -c '\\bX\\b' file` (every flagged symbol returns exactly 1 occurrence — the import line itself).

**Result:** **14 confirmed unused imports** across 8 files. None are side-effect imports.

#### [LOW] src/components/AddAppointmentModal.jsx:1 — `React` (default)
**Found:** `import React, { useState, useEffect } from 'react'`
**Suggested action:** drop `React,` (project uses automatic JSX runtime — no other file in `src/` imports React explicitly, and this file uses no `React.X`).
**Phase 2 eligible:** N — strict reading of "Remove unused **named** imports" excludes default imports. Trivial follow-up, but logged for human call.

#### [LOW] src/components/DentalTabs.jsx:1 — `C, makeBtn, card` (named, from `../design`)
**Found:** all three imported, none referenced in body.
**Suggested action:** remove from named-import list.
**Phase 2 eligible:** Y.

#### [LOW] src/components/DentalTabs.jsx:1 — `Badge` (named, from `./ui`)
**Found:** imported, not referenced.
**Suggested action:** remove.
**Phase 2 eligible:** Y.

#### [LOW] src/components/EmptyState.jsx — `makeBtn` (named, from `../design`)
**Found:** imported, not referenced.
**Suggested action:** remove.
**Phase 2 eligible:** Y.

#### [LOW] src/components/shared.jsx — `C` (named, from `../design`)
**Found:** imported, not referenced.
**Suggested action:** remove.
**Phase 2 eligible:** Y.

#### [LOW] src/lib/database.js — `LIMITS` (named, from `./sanitize`)
**Found:** imported, not referenced.
**Suggested action:** remove.
**Phase 2 eligible:** Y.

#### [LOW] src/pages/FormsPage.jsx — `Modal, sanitizeText, sanitizeNotes, stripHtml` (named)
**Found:** four named imports, none referenced.
**Suggested action:** remove all four. Verify no dynamic access pattern, but spot-check confirms a single import-line occurrence per name.
**Phase 2 eligible:** Y.

#### [LOW] src/pages/operator/OperatorConsole.jsx — `C` (named, from `../../design`)
**Found:** imported, not referenced.
**Suggested action:** remove. (Already noted in earlier session; lint baseline carries it.)
**Phase 2 eligible:** Y.

#### [LOW] src/pages/SettingsPage.jsx — `ROLES` (named, from `../lib/permissions`)
**Found:** imported, not referenced.
**Suggested action:** remove.
**Phase 2 eligible:** Y.

**Total Phase 2-eligible removals:** 13 named imports across 7 files.

---

### Pass 5 — theme.css zombie inventory

**Search:** `theme.css` across `src/`.

**Result:** `src/styles/theme.css` exists (165 lines, 5,965 bytes). Still **actively loaded** via `@import './styles/theme.css'` at `src/index.css:2` — it is *not* a zombie file, despite the deferred-backlog memory note. The other six matches are commentary (one in `src/design.js:142`, five in `src/index.css` documenting known cascade overrides between the legacy palette and the new `--velo-*` tokens).

**Files referencing it (read-only, no migration):**
- `src/index.css:2` — live `@import`
- `src/index.css:9, 240, 246, 285, 315` — comments documenting overrides
- `src/design.js:142` — comment

**Verdict:** Backlog item still pending. Migration is multi-file and out of audit scope (architectural). Inventory only, no action.

**Phase 2 eligible:** N (out of scope per bounds — architectural).

---

### Pass 6 — `C.*` legacy token references

**Search:** `\bC\.\w+\b` across `src/`.

**Result:** **403 occurrences across 18 files.** Per-file counts (descending):

| File | Count |
|---|---|
| `src/App.jsx` | 85 |
| `src/pages/TasksPage.jsx` | 64 |
| `src/pages/FormsPage.jsx` | 49 |
| `src/pages/DocsPage.jsx` | 41 |
| `src/pages/InventoryPage.jsx` | 25 |
| `src/pages/GoalsPage.jsx` | 24 |
| `src/components/NotificationCenter.jsx` | 18 |
| `src/pages/AutomationsPage.jsx` | 17 |
| `src/components/CommandPalette.jsx` | 13 |
| `src/components/AIAssistant.jsx` | 13 |
| `src/components/DentalChart.jsx` | 11 |
| `src/components/Skeleton.jsx` | 11 |
| `src/pages/IntegrationsPage.jsx` | 11 |
| `src/components/KeyboardShortcuts.jsx` | 7 |
| `src/components/ConfirmDialog.jsx` | 5 |
| `src/components/EmptyState.jsx` | 3 |
| `src/components/Toast.jsx` | 3 |
| `src/pages/ReportBuilder.jsx` | 3 |

**Migration progress signal:** the recent Liquid Glass migration appears complete on `SettingsPage.jsx`, `AppointmentsPage.jsx`, and `FinancePage.jsx` — all three have zero `C.*` refs (verified). The 18 files above are the remaining migration backlog.

**Verdict:** Inventory only. Architectural migration, out of audit scope.

**Phase 2 eligible:** N.

---

### Pass 7 — Hardcoded English JSX strings

**Method:** `.audit-hardcoded-strings.cjs` walks `.jsx` under `src/`, captures JSX text between tags (`>...<`) that's pure ASCII, ≥3 word tokens, and contains no JS operator characters (filters out boolean comparisons that look like JSX text). Skips `DesignSystem.jsx` and `main.jsx`. Manually verified each survivor against the actual file.

**Result:** 5 real instances after filtering false positives. Note: scanner only catches *JSX text content between tags*; strings in attributes (`title=`, `aria-label=`, etc.), template-literals, or `style={{ content: '...' }}` are not in scope.

#### [LOW] src/components/AddAppointmentModal.jsx:252 — "No patients found"
**Found:** `<div className="text-sm text-navy-500 mb-3">No patients found</div>` — empty-state message in patient search inside the appointment-add modal.
**Suggested action:** wrap with bilingual ternary (`isRTL ? 'لا يوجد مرضى' : 'No patients found'`). User-facing on a daily-use flow.
**Phase 2 eligible:** N — needs Arabic translation key, out of audit scope.

#### [LOW] src/components/AddAppointmentModal.jsx:268 — "Add New Patient"
**Found:** `<h4 className="m-0 mb-3 text-sm font-semibold text-navy-900">Add New Patient</h4>` — header inside inline-create-patient sub-form.
**Suggested action:** bilingual wrap. Same daily-flow context.
**Phase 2 eligible:** N — translation work.

#### [LOW] src/pages/SettingsPage.jsx:330 — "JPG, PNG. Max 2MB"
**Found:** file-format hint on the avatar-upload control.
**Suggested action:** translate or rephrase as language-neutral icons + numeric.
**Phase 2 eligible:** N — translation work.

#### [LOW] src/pages/operator/OperatorConsole.jsx:442 — invite success modal copy
**Found:** `<strong>{org.name}</strong> is ready. Send this invite link to <strong>{email}</strong> to onboard them as owner. Link expires in 7 days.`
**Suggested action:** operator-internal screen — bilingual coverage may be optional. Flag for product call.
**Phase 2 eligible:** N — translation/UX call.

#### [LOW] src/pages/operator/OperatorConsole.jsx:486 — "This action cannot be undone."
**Found:** Delete-org confirm modal subtitle.
**Suggested action:** operator-internal — same as above.
**Phase 2 eligible:** N — translation/UX call.

**Notes:**
- `SettingsPage.jsx:894` "Powered by Claude (Anthropic)" was filtered out by the operator-char rule but is intentional **brand attribution** — should remain English by convention. No action needed.
- The agency-side English-only surfaces (operator console + delete dialogs) are arguably acceptable; the clinic-side ones in `AddAppointmentModal.jsx` are not.

**Phase 2 eligible (overall):** N (translation work needs human authorship of Arabic strings, out of audit scope).

---

### Pass 8 — Chairs residue (IMPORTANT — premise mismatch)

**Search:** case-insensitive `chair|chairs|chair_id` across `src/` and `scripts/`.

**Result:** **`scripts/` is clean (zero matches). `src/` has 15 `chair_id` references across 6 files** — chairs are *not* fully removed from the dental data model.

| File | Line(s) | Role |
|---|---|---|
| `src/lib/schema.sql` | 224 | `chair_id text,` — column on `appointments` table |
| `src/lib/appointments.js` | 6, 77-78, 99, 227 | included in upsert payload normalisation + every fetch's `select(...)` |
| `src/lib/dental_dashboard.js` | 45 | selected in the dashboard appointments query |
| `src/components/AddAppointmentModal.jsx` | 80, 183, 328-329 | form state + `<FormField label="Chair">` with `placeholder="e.g. chair-1"` |
| `src/pages/AppointmentsPage.jsx` | 1084, 1095, 1148 | form state init + reset + payload to upsert |
| `src/sampleData.js` | 824, 849 | sample-data appointments `chair_id: null` |

**Premise mismatch with audit prompt:** the prompt asserts "Memory says chairs were fully removed; verify nothing slipped through." The memory entry I can read (`velo_clinical_luxury_session3_progress.md`) actually records *"Commit B (DayView chair→doctor axis pivot, 7 hunks) approved but not applied"* — i.e., the chair→doctor axis pivot was scoped to a *single view* (DayView) and that commit **was not applied**. There is no memory entry stating chairs are fully removed. The codebase confirms chairs remain throughout the appointments domain.

**[MEDIUM] Chair UI is still live and likely surprises operators**
- `AddAppointmentModal.jsx:328-329` renders a `<FormField label="Chair">` with input. Real users adding appointments still see this field.
- `AppointmentsPage.jsx` keeps `chair_id` in form state and writes it back to `upsertAppointment`.

**Suggested actions (out of scope for this audit, escalated for human call):**
1. Decide: keep chairs as a per-org optional concept, or finish the pivot to doctor-axis-only.
2. If keeping: rename "chair" → e.g. "operatory" (industry-standard) and surface it as a typed dropdown rather than a free-text "e.g. chair-1" placeholder.
3. If removing: drop the form field, the form-state plumbing, the schema column (DB migration — out of audit scope), and the sample-data `chair_id` keys.

**Phase 2 eligible:** N — architectural/UX decision required, far beyond the unused-import / console-log brief.

---

