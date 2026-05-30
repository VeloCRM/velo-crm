# Post-PR #28 Mini-Audit — what remains after the system #3 bleed fix

**Date:** 2026-05-30
**Base:** `master` @ `dd86dd6` (PR #28 merged — `design.js` + `shared.jsx` + `theme.css` input rule → `--velo-*` tokens)
**Scope:** the worst-affected pages from AUDIT-PR27.md — Tasks, Forms, Social Pages, Settings
**Method:** source-grounded, read-only. No changes made.

## How to read this
PR #28 migrated everything sourced from `design.js` (`C`, `card`, `makeBtn`, `STATUS_BADGE`), `shared.jsx` (`inputStyle`/`selectStyle`/`FormField`), and the global `theme.css` `input,textarea,select{…!important}` rule. The app is light-only, so those tokens resolve to light values — **any surface/text built on them now renders correctly light.** What remains is classified as one of:
- **residual --velo miss** — an *inline* hardcoded color in the page file that the migration couldn't reach (not sourced from design.js/shared.jsx)
- **Liquid Glass .ds-root (sys#2)** — a system-#2 navy/cyan issue
- **functional bug** — a dead handler / mock-as-live / missing state (never a color problem)

---

## Tasks — `src/pages/TasksPage.jsx`

The dark-slab bleed is **resolved**: `C.*`, `card`, `makeBtn`, `inputStyle`/`selectStyle`/`FormField`, and the `StatusBadge` light palette all render correctly now. What remains is a set of **inline white-alpha tints tuned for the old dark canvas** that the migration couldn't touch (they live in TasksPage, not design.js) — on white they're effectively invisible.

- **Tasks › Board (column backgrounds)** — `COLUMN_BG` uses dark-canvas tints (`rgba(255,255,255,0.02)`, `rgba(0,255,178,0.04)`, `rgba(124,58,237,0.04)`, `rgba(0,255,136,0.04)`) at 2–4% alpha over white, so per-column color coding renders as no background and columns are visually indistinguishable. _Class:_ residual --velo miss. (`TasksPage.jsx:16`)
- **Tasks › List view (row hover)** — row hover sets `background: rgba(255,255,255,0.02)`, a white tint on a white canvas → the hover highlight is invisible (dead interaction feedback). _Class:_ residual --velo miss. (`TasksPage.jsx:386`)
- **Tasks › Board/List (Low-priority badge)** — `PRIORITY_COLORS.low.bg = rgba(255,255,255,0.04)` is invisible on white, so the Low badge has no pill while urgent/high/medium show colored chips. _Class:_ residual --velo miss. (`TasksPage.jsx:27`)

**Resolved by PR #28:** `C.*`, `card`, `makeBtn`, `inputStyle`/`selectStyle`/`FormField`, `StatusBadge` palette.

---

## Forms — `src/pages/FormsPage.jsx`

The big win landed: all `card`/`C.*` surfaces and **every form input** (via the global input rule + `inputStyle`) now render light. Remaining issues split between a few inline color literals and several genuine functional dead-ends.

- **Forms › Submissions table (header)** — header cells hardcode `color:'#374151'` (slate) inline, unreachable by the token migration. _Class:_ residual --velo miss. (`FormsPage.jsx:285`)
- **Forms › Submissions table (dynamic columns)** — the field-label column map repeats the same inline `color:'#374151'`. _Class:_ residual --velo miss. (`FormsPage.jsx:286`)
- **Forms › Preview submit button** — Submit hardcodes `color:'#fff'` against `background:C.primary` (mint); the white literal is inline, not tokenized → low-contrast white-on-mint. _Class:_ residual --velo miss. (`FormsPage.jsx:254`)
- **Forms › Builder (field-type icons)** — field-type affordances are emoji (`📞 📅 📎 📋`) used as functional icons instead of the `Icons.*` SVG set. _Class:_ functional bug. (`FormsPage.jsx:144`; empty-state emoji `:64`)
- **Forms › Preview (Submit)** — the preview Submit only calls `e.preventDefault()` with no handler; it never records a submission, while `SubmissionsView` reads a `form.submissions` that nothing in this file writes. _Class:_ functional bug. (`FormsPage.jsx:235`, `:254`)
- **Forms › Builder (Copy Link)** — "Copy Link" calls `navigator.clipboard?.writeText(...)` with no success/failure feedback and silently no-ops where the API is unavailable. _Class:_ functional bug. (`FormsPage.jsx:84`)
- **Forms › List (Delete)** — Delete removes a form immediately with no confirmation/undo, risking accidental destructive loss. _Class:_ functional bug. (`FormsPage.jsx:85`)

**Resolved by PR #28:** forms list, empty state, builder canvas/panels, preview card, submissions card surfaces, and all inputs.

---

## Social Pages — `src/pages/SocialMonitor.jsx`

**Untouched by PR #28 — this page never imported `design.js`; it uses raw inline hex throughout.** So the entire color bleed remains: dark surfaces (`#0C0E1A`, `rgba(255,255,255,0.0x)`) and near-white text (`#E8EAF5`, `#7B7F9E`) on the light shell. This is the single largest remaining cluster and matches AUDIT-PR27.md's recommendation to **rewrite SocialMonitor onto tokens**.

- **Social › Page header** — H1 (`#E8EAF5`) + subtitle (`#7B7F9E`) render as near-white/washed text on the light shell, illegible. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:431`, `:434`)
- **Social › Empty-state card** — surface `rgba(255,255,255,0.03)` is invisible on light; heading `#E8EAF5` / body `#7B7F9E` washed out. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:470`)
- **Social › Connection card surface** — `rgba(255,255,255,0.03)` bg + `rgba(255,255,255,0.07)` border, both effectively invisible on white. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:508`)
- **Social › Connection card text** — platform label `#7B7F9E`, page name `#E8EAF5`, stat values `#E8EAF5` render near-white, illegible. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:525`, `:528`, `:579`)
- **Social › Card stat tiles** — `rgba(255,255,255,0.02)` bg + `rgba(255,255,255,0.05)` border invisible; labels `#7B7F9E` washed out. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:573`, `:582`)
- **Social › Card footer row** — footer text `#7B7F9E` + `rgba(255,255,255,0.05)` top border washed/invisible. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:590`)
- **Social › Edit button (card)** — transparent bg, `#7B7F9E` text, `rgba(255,255,255,0.08)` border → invisible outline, illegible label. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:551`)
- **Social › ConnectionFormModal panel** — hand-rolled modal hardcodes `#0C0E1A` bg + `rgba(255,255,255,0.08)` border → dark slab on the light app. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:144`)
- **Social › ConnectionFormModal title** — `<h2>` uses `#E8EAF5` near-white. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:150`)
- **Social › ConnectionFormModal inputs** — `numberInput`/`textInput` hardcode `background:'#0C0E1A'` + `color:'#E8EAF5'` **inline**, which beats the global `theme.css` `!important` rule (inline styles override stylesheet `!important`), so these inputs stay dark even after PR #28. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:121`, `:127`)
- **Social › ConnectionFormModal labels** — `labelStyle` uses `#7B7F9E`, washed out on a light panel. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:128`)
- **Social › ConnectionFormModal Cancel** — transparent bg, `#7B7F9E` text, invisible `rgba(255,255,255,0.08)` border. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:252`)
- **Social › OperatorContactModal panel** — second hand-rolled modal also hardcodes `#0C0E1A` bg + invisible border → dark slab. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:298`)
- **Social › OperatorContactModal text/close** — heading `#E8EAF5`, body `#7B7F9E`, transparent/`#7B7F9E`/invisible-border Close button, all washed out. _Class:_ residual --velo miss (raw inline hex). (`SocialMonitor.jsx:303`, `:306`, `:344`)

**Resolved by PR #28:** none. Notable nuance — the inline `background:#0C0E1A` on this page's inputs **overrides** the global `theme.css` input `!important` rule (inline beats stylesheet `!important`), so even the input-bleed fix doesn't reach Social. Full migration to `--velo-*`/`ui` primitives required.

---

## Settings — `src/pages/SettingsPage.jsx`

As expected, **no color residue** — Settings is Liquid Glass (system #2), which PR #28 didn't target and which was already fine. The remaining issues are **all functional**.

**Priority question answered — yes, the dead Save buttons still do nothing:**
- **Profile › Save** — `<Button variant="primary">` at line 337 has **no `onClick`**; the whole profile form is local-state-only and never persisted. _Class:_ functional bug. (`SettingsPage.jsx:337`)
- **Notifications › Save** — `<Button variant="primary">` at line 649 has **no `onClick`**; all 8 toggles are local-state-only, never saved. _Class:_ functional bug. (`SettingsPage.jsx:649`)
- **Billing › Upgrade Now** — `<Button variant="primary">` at line 683 has **no `onClick`**; purely decorative. _Class:_ functional bug. (`SettingsPage.jsx:683`)

(For contrast, Organization/AI/Integrations Save buttons *are* wired to real handlers — the dead-button problem is specific to Profile, Notifications, Billing.)

Other functional dead-ends:
- **Settings › Profile (avatar)** — "Change Photo" opens a picker but the `<input type="file">` has no `onChange` → selected photo is silently discarded. _Class:_ functional bug. (`SettingsPage.jsx:276`)
- **Settings › Billing (data)** — entire tab renders hardcoded mock data ($49 Pro plan, fixed 248/34/1.2GB meters, three fake "Paid" invoices) presented as live. _Class:_ functional bug (mock-as-live). (`SettingsPage.jsx:657-667`)
- **Settings › Billing (invoice download)** — each invoice download button has no `onClick`. _Class:_ functional bug. (`SettingsPage.jsx:728`)
- **Settings › Integrations (Connect stubs)** — "Connect Facebook", "Connect Instagram", "Connect Google Account" buttons have no `onClick` — stub buttons that do nothing (OAuth never initiated). _Class:_ functional bug. (`SettingsPage.jsx:1246`, `:1253`, `:1274`)

**Resolved by PR #28:** n/a (Settings color was never the problem).

---

## Summary

| Page | Remaining BUGs | residual --velo miss | functional bug | sys#2 .ds-root |
|------|---:|---:|---:|---:|
| Tasks | 3 | 3 | 0 | 0 |
| Forms | 7 | 3 | 4 | 0 |
| Social Pages | 14 | 14 | 0 | 0 |
| Settings | 8 | 0 | 8 | 0 |
| **TOTAL** | **32** | **20** | **12** | **0** |

### Takeaways
1. **PR #28 worked as intended** — every dark-slab bleed sourced from `design.js`/`shared.jsx`/the global input rule is resolved on Tasks and Forms. Zero remaining system #2 (`.ds-root`) color bugs on these pages.
2. **The biggest remaining cluster is Social Pages (14)** — it never used `design.js`, so the migration couldn't reach it. Needs a dedicated rewrite onto `--velo-*` + `ui/` primitives (matches AUDIT-PR27.md recommendation #2). Note its inline-hex inputs even defeat the global input fix.
3. **20 of 32 are residual --velo misses** — inline hardcoded colors (Social's raw hex; Tasks' dark-canvas white-alpha tints; Forms' `#374151`/`#fff`) that a `design.js`-level migration structurally cannot reach. These require per-file edits.
4. **12 of 32 are functional, not color** — dead Save buttons (Profile/Notifications/Billing **confirmed still inert**), stub Connect buttons, mock-as-live billing, a dead Forms submit, and an unconfirmed-destructive Forms delete. These are independent of the whole color-system effort.
