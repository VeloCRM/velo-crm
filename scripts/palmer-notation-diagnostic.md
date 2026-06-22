# Palmer Notation Toggle — Phase 1 Diagnostic (read-only)

**Date:** 2026-06-22
**Goal:** Scope adding Palmer (British) notation alongside the current FDI notation, with a
per-doctor preference set in Settings → Profile. Map the change before any code/schema work.
**Status:** DIAGNOSTIC ONLY — no code, no schema changes. Findings + phased plan below.

---

## TL;DR

- **`profiles.tooth_notation` does NOT exist today.** ARCH-V2-PLATFORM.md *plans* it
  (`tooth_notation enum('fdi','palmer') DEFAULT 'fdi'`, lines 137/148) but the live schema
  (`src/lib/schema.sql:184-192`) has only `id, org_id, role, full_name, avatar_url, locale,
  created_at`. **Needs adding** (1 column). Memory's "planned for V2" is accurate — it was never shipped.
- **Internal data is already FDI-canonical and should stay that way.** `tooth_number int CHECK
  (BETWEEN 11 AND 48)` on both dental tables; validated to true FDI (quadrant 1-4 × position 1-8)
  in `src/lib/dental.js`. Palmer is a **presentation-layer transform only — no data migration ever.**
- **5 live tooth-number surfaces** (4 display + 1 input), all in `src/components/DentalTabs.jsx`.
  The lone **input** surface (treatment-plan item entry) is what pushes this past a trivial
  display-swap — see Scope flag.
- **`src/components/DentalChart.jsx` is dead code** (renders 2 more tooth-number sites but is never
  mounted). Exclude from scope; flag for deletion so it can't drift.
- **No `api/` changes** → Vercel function count unaffected (stays 12/12). The preference is written
  client-side through `updateProfile` → Supabase, same as `full_name`/`locale`.

---

## 1. Current chart implementation

| Concern | Reality (file:line) |
|---|---|
| Live chart component | `DentalTabs.DentalChartTab` — lazy-loaded at `App.jsx:39` (`m.DentalChartTab`) |
| Legacy/dead chart | `src/components/DentalChart.jsx` — default export **never imported** anywhere. Dead code. |
| Tooth ordering | `UPPER_TEETH`/`LOWER_TEETH` arrays, FDI order, `DentalTabs.jsx:332-333` |
| Finding styles | `FINDING_STYLES`, `DentalTabs.jsx:335-344` |
| Data helper | `src/lib/dental.js` — `fetchDentalChartEntries` / `addDentalChartEntry` / treatment plans |
| FDI validator | `dental.js:56` `assertToothNumber` (server-side wall) + `dental.js:70` `isValidFdiTooth` (client) |

The chart renders a 16-column grid of `<Tooth>` buttons per jaw; each cell shows the raw FDI `num`.

---

## 2. Data model

Teeth are identified by an **integer FDI code** (`11`–`48`), not strings, everywhere:

| Table | Column | Definition |
|---|---|---|
| `dental_chart_entries` | `tooth_number` | `int NOT NULL CHECK (BETWEEN 11 AND 48)` — `schema.sql:283` |
| `treatment_plan_items` | `tooth_number` | `int CHECK (BETWEEN 11 AND 48)` (nullable) — `schema.sql:264` |

- Quadrant = `floor(n/10)` (1=UR, 2=UL, 3=LL, 4=LR); position = `n % 10` (1-8).
- The schema CHECK is a loose `11..48`; `dental.js` tightens it to real FDI (rejects 19/20/29/… —
  see `dental.js:18-23`, `assertToothNumber:56-67`).
- No UI ever shows "tooth 14" as free text disconnected from the chart — every surface renders the
  stored integer, prefixed `#`. So a single display transform covers all of them.
- ⚠️ **Discrepancy to note (not in scope):** `api/auth/create-test-account.js:221` seeds
  `tooth_number: randomInt(1, 32)` — a 1–32 sequential range, **not** FDI. Test-only seed data;
  it can write non-FDI values that the chart will render as `healthy` (no match). Flag, don't fix here.

---

## 3. Every UI surface that renders a tooth number (catalog)

**LIVE — all in `src/components/DentalTabs.jsx`:**

| # | Surface | Line | Type | Notes |
|---|---|---|---|---|
| 1 | Chart cell — `<span>{num}</span>` | ~457 | display | 32 grid buttons |
| 2 | Chart cell tooltip — `title={`#${num} — …`}` | ~447 | display (a11y) | already a good hook for an aria-friendly label |
| 3 | Jaw range labels — "Upper jaw (18-11 / 21-28)" / "Lower jaw (48-41 / 31-38)" | ~487, ~497 | display (literal) | hardcoded FDI ranges; need Palmer-aware text or rephrasing |
| 4 | Recent-findings list — `#{e.tooth_number}` | ~529 | display | |
| 5 | Treatment-plan item row — `{item.tooth_number ? `#${item.tooth_number}` : '—'}` | ~798 | display | |
| 6 | **Treatment-plan item INPUT** — `<input type="number" min=11 max=48 placeholder="FDI">` + validation strings | ~909-915, ~987-990 | **input (bidirectional)** | the hard one — see scope flag |

**DEAD — `src/components/DentalChart.jsx` (NOT mounted, exclude):**

| Surface | Line |
|---|---|
| SVG tooth label `<text>{num}` | 41 |
| Selected-tooth header `Tooth #${selectedTooth}` | 87 |

**Prescriptions / Notes / Medical history:** grepped — **no tooth-number rendering**. Out of scope.

### 🚩 Scope flag (per guardrail: surfaces at the threshold + a bidirectional one)
There are **6 live sites** but 5 are simple display swaps. The 6th (#6, the treatment-plan item
**input**) is materially harder: accepting Palmer entry means either (a) keep the input FDI-canonical
with a Palmer hint/echo, or (b) build a quadrant-picker + position field that composes back to FDI.
Recommendation: **(a) for the first PR** — keep entry FDI, show a live Palmer echo next to the field —
and defer a full Palmer input widget. This keeps the first PR a display-layer change.

---

## 4. Profile preference storage

**Status: NOT present — needs adding.** (Guardrail check: it does *not* already exist, so adding is correct.)

- `profiles` columns today: `schema.sql:184-192` — no notation column.
- `profiles.js` has **zero** `tooth_notation` references; `sanitizeProfileUpdate` (`profiles.js:21-27`)
  only allow-lists `full_name`, `avatar_url`, `locale`; `fetchMyProfile` (`profiles.js:36`) selects the
  same 6 columns.

**Proposed addition (Phase A):**
- One column `profiles.tooth_notation` defaulting to `'fdi'`. Match the existing enum convention
  (`profile_role`, `locale_code` are Postgres enums) → new enum `notation_pref AS ENUM ('fdi','palmer')`,
  or a `text NOT NULL DEFAULT 'fdi' CHECK (tooth_notation IN ('fdi','palmer'))` if avoiding a new enum type.
- Self-editable: the `enforce_profile_immutable_fields` trigger gates **only** `role`/`org_id`
  (per `profiles.js:7-9` + the trigger's documented purpose), so a doctor updating their own
  `tooth_notation` is allowed — **verify the trigger body doesn't enumerate an allow-list that would
  reject unknown columns** before relying on this.
- `profiles.js` edits: add `tooth_notation` to `sanitizeProfileUpdate`’s allow-list and to the
  `fetchMyProfile` / `listTeamMembersInOrg` selects.
- **Ceremony:** this is a `profiles` migration, not a `dental_*` one, so it's lighter than the dental
  schema ceremony — but still "generate SQL, human reviews & runs" (never run migrations from chat).
- **No Vercel function added** (client → Supabase via `updateProfile`). Count stays 12/12.

---

## 5. Render strategy (recommended)

**Store FDI internally always; convert to the doctor's preference at render.** No per-tooth notation
tagging — that would fragment the canonical column, break the `11..48` CHECK contract, and make
cross-doctor data inconsistent (doctor A's Palmer tag unreadable to doctor B). The conversion is
pure presentation and reversible, so no migration is ever required.

### FDI ↔ Palmer translation (code-ready — arithmetic, no lookup table)

Palmer position == the FDI **units digit**; the FDI **tens digit** picks the quadrant bracket.

```
quadrant = Math.floor(fdi / 10)   // 1=UR, 2=UL, 3=LL, 4=LR
position = fdi % 10               // 1..8  (this IS the Palmer number)

// reverse: fdi = quadrant * 10 + position
```

| FDI range | Quadrant | Palmer number | Bracket (corner around the number) |
|---|---|---|---|
| 11–18 | 1 — Upper Right | 1–8 | horizontal **above** + vertical on **right** (toward midline, mirror view) |
| 21–28 | 2 — Upper Left  | 1–8 | horizontal **above** + vertical on **left** |
| 31–38 | 3 — Lower Left  | 1–8 | horizontal **below** + vertical on **left** |
| 41–48 | 4 — Lower Right | 1–8 | horizontal **below** + vertical on **right** |

e.g. FDI `16` → Palmer `6` in the Upper-Right bracket; FDI `38` → Palmer `8` in the Lower-Left bracket.

### 🚩 Non-obvious rendering / a11y challenge (surfaced now, per guardrail)

Palmer's quadrant is encoded **only by a graphical L-shaped bracket** around the digit. There is **no
single reliable Unicode codepoint** per quadrant (the "reversed not sign" `⌐` and box-drawing corners
`┌ ┐ └ ┘` are font-dependent and don't align well around a digit). Three implementation options:

1. **CSS-border bracket** *(recommended)* — a `<span>` with two borders per quadrant
   (`border-top`+`border-right` for UR, etc.) drawn via a small `<ToothLabel>` component.
   Font-independent, crisp, trivial to position. Downside: a touch more CSS.
2. **Unicode glyphs** — quick but renders inconsistently across the app's fonts (DM Sans / Syne) and
   especially under RTL Arabic; not recommended for a clinical surface.
3. **SVG bracket** — most precise, overkill for inline list rows (#4/#5).

**Accessibility (must-do, not optional):** a CSS/SVG bracket conveys quadrant *visually only* —
screen readers read just the digit "6", which is ambiguous. Every Palmer label MUST carry an
`aria-label`/`title` with the unambiguous form, e.g. `"upper-right 6 (FDI 16)"`. Surface #2 (the
existing `title` attr) is the natural anchor. Also: Arabic locale renders digits as Arabic-Indic
(`٦`), so the formatter must respect `lang` for the numerals (the existing input title at
`DentalTabs.jsx:990` already does this for FDI).

---

## 6. Settings toggle placement

`ProfileTab` in `src/pages/SettingsPage.jsx:250-343`. The form already saves `full_name` + `locale`
via `updateProfile` (`SettingsPage.jsx:278`) and hydrates from `fetchMyProfile` (`:263-272`). Drop a
`<Select>` (or segmented control) **right after the Language `<Select>` at line ~325-333**:

```
{ value: 'fdi',    label: 'FDI (11–48)' }
{ value: 'palmer', label: 'Palmer (1–8)' }
```

Thread `toothNotation` into the `form` state + the `handleSave` `updateProfile({ … tooth_notation })`
call. Low effort; the tab is already the right home and already does a profile round-trip.

---

## 7. Proposed implementation phases + complexity

| Phase | Work | Complexity | Notes |
|---|---|---|---|
| **A. Schema + data layer** | Add `profiles.tooth_notation` (enum or text+CHECK, default `'fdi'`); extend `sanitizeProfileUpdate` allow-list + `fetchMyProfile`/`listTeamMembersInOrg` selects; verify the immutable trigger doesn't reject it. | **LOW** | Human-run SQL. No `api/` change → function count untouched. |
| **B. Render utility** | `src/lib/toothNotation.js` (`toPalmer`, `toFdi`, `formatTooth(fdi, notation, lang)`) + a `<ToothLabel fdi notation lang>` component (CSS-border bracket + aria-label). Pure, unit-testable. | **LOW–MEDIUM** | The bracket CSS is the only fiddly bit; a11y label is mandatory. |
| **C. Preference plumbing + toggle** | Add the toggle to `ProfileTab`. Get the preference to the chart/plan tabs. Two idiomatic options: (a) thread a `toothNotation` prop from `App.jsx` alongside `lang` (consistent with existing prop-drilling), or (b) a `useMyToothNotation()` hook mirroring the existing `useMyRole()` in `DentalTabs.jsx:~66` (lowest blast radius). | **LOW** toggle / **MEDIUM** plumbing | Recommend (b) — local, no App.jsx surgery. |
| **D. Chart + plan conditional render** | Swap display sites #1–#5 to `<ToothLabel>`; rephrase jaw labels (#3); for input #6, keep FDI entry + live Palmer echo (defer full Palmer input). | **MEDIUM** | #6 input is the complexity driver — see scope flag. |
| **E. (deferred) Full Palmer input widget** | Quadrant picker + position → composes to FDI on save. | **MEDIUM** | Optional follow-up PR; not needed for v1 of the feature. |

**Suggested PR split:** A+B+C+D as one feature PR (display + toggle, FDI input retained); E as an
optional follow-up. Dental-adjacent (chart render) → `/code-review` before push per CLAUDE.md.
Bilingual (EN/AR) toasts/labels required, matching existing dental surfaces.

---

## Open questions for the dentist / product

1. Does Palmer entry need to be *typeable* in the treatment-plan form, or is **display-only Palmer +
   FDI entry** acceptable for v1? (Determines whether Phase E is in-scope now.)
2. Is the preference strictly **per-doctor** (profile), or should the clinic owner be able to set a
   clinic-wide default? (Current plan: per-doctor only, matching the feedback as written.)
3. Confirm permanent dentition only (no primary teeth 51–85) — current validators are permanent-only.
