# Diagnostic — Add Fracture + Wear surface-specific finding types

**Phase 1 (read-only scope map). No code/schema/Supabase changed.**
Date: 2026-06-23 · Project: `velo-crm/` (the `Desktop/*_OLD_DELETE_ME_AFTER_VERIFY` copies were ignored).

## TL;DR

Adding `fracture` + `wear` is a **small, mostly additive change touching 3 live files** (+1 verified no-op). The UI is fully data-driven from a single constant (`FINDING_STYLES`), so legend, dropdown, recent-list badge, and wedge tint all update from one edit. The one real "gotcha" is that `finding` is a **Postgres ENUM**, not a CHECK constraint or free text — so the migration is `ALTER TYPE ... ADD VALUE`, which is additive and safe **but not cleanly reversible** (see §1). There is **no existing `fracture`/`wear` data** anywhere (the enum can't physically hold values it doesn't define yet), so the legacy-data guardrail is satisfied by construction.

## §1 — Schema CHECK-constraint state → **Migration needed: YES (ENUM, additive)**

The prompt anticipated either a CHECK constraint or free-text. **Neither.** Reality:

- `dental_chart_entries.finding` is typed `dental_finding NOT NULL` — a Postgres **ENUM**. `src/lib/schema.sql:285`.
- Enum definition: `src/lib/schema.sql:78–87` →
  `cavity, restoration, missing, crown, bridge, implant, root_canal_done, healthy` (8 values).
- `surface` is plain `text` (`schema.sql:284`) — no constraint there; new wedge surfaces need no schema work (already supported).

**Migration shape (additive):**
```sql
ALTER TYPE dental_finding ADD VALUE IF NOT EXISTS 'fracture';
ALTER TYPE dental_finding ADD VALUE IF NOT EXISTS 'wear';
```
Plus update the `CREATE TYPE` block in `schema.sql:78–87` so fresh installs match.

**⚠️ Reversibility caveat (deviation from the guardrail's assumption).** The guardrail assumed a CHECK constraint ("DROP CONSTRAINT + ADD CONSTRAINT" — trivially reversible). An ENUM is different:
- `ADD VALUE` **cannot run inside a transaction block** alongside statements that use the new value (Postgres restriction); run the two `ALTER TYPE` statements on their own.
- Postgres has **no `DROP VALUE`**. True rollback means recreating the type (create new enum without the values → `ALTER COLUMN ... TYPE` with a cast → drop old type → rename). That is heavy and only possible while **no row uses** `fracture`/`wear`.
- Net: forward migration is safe + idempotent (`IF NOT EXISTS`); rollback is only clean **before any finding of the new types is recorded**. After the demo records one, reversal is a full type-rebuild.
- Per CLAUDE.md dental ceremony: dry-run on a copy + written rollback plan required regardless of row count. Human runs it, not chat.

## §2 — Second source of truth: the data-layer whitelist (easy to miss)

`src/lib/dental.js` mirrors the enum in JS and **rejects anything not listed** before insert:

- `DENTAL_FINDINGS` Set — `src/lib/dental.js:50–53`.
- `assertFinding()` — `src/lib/dental.js:98–104` → throws `unsupported dental finding "<x>"` on miss; called from `addDentalChartEntry` at `dental.js:266`.
- Doc comment listing the enum — `src/lib/dental.js:24` (update for accuracy).

**If only the schema + UI are updated and this Set is not, every save of a `fracture`/`wear` finding throws client-side** ("Failed to add finding" toast). This is the single most likely bug in Phase 2. Add `'fracture', 'wear'` to the Set at `dental.js:51–52`.

## §3 — Hybrid render rule → **No change needed (verified)**

`src/lib/toothSurfaces.js`:
- `WHOLE_TOOTH_FINDINGS` Set — `toothSurfaces.js:16–18` = `missing, implant, crown, bridge, root_canal_done`.
- `groupBySurface()` — `toothSurfaces.js:83–107`: any finding **not** in that Set, recorded **with a real surface**, is routed to `bySurface[surface]` → rendered as a **wedge** (`ToothSurfaces.jsx:82–108`, fill from `styleFor(entry.finding).color`).
- **Therefore `fracture`/`wear` must NOT be added to `WHOLE_TOOTH_FINDINGS`** → they default to the surface-specific (wedge) path automatically. Matches the greenlit decision ("render as wedges, NOT whole-tooth tint"). **Zero edits to `toothSurfaces.js` and `ToothSurfaces.jsx`.**
- Edge note: if a `fracture`/`wear` is ever saved with surface = null/"Whole tooth", `groupBySurface` falls back to a whole-tooth tint (legacy path, `toothSurfaces.js:99–104`). The modal does **not** lock the surface for these types (`isWholeFinding` is false — `DentalTabs.jsx:437`), so the dentist can pick a surface; whole-tooth is only the no-surface fallback. Acceptable; flag for Ali if you want surface to be *required* for these two.

## §4 — UI surfaces → **all driven by one constant**

`FINDING_STYLES` — `src/components/DentalTabs.jsx:339–348` — is the single style/label map. Adding two keys propagates to **every** surface below with no other edits:

| Surface | Location | Mechanism |
|---|---|---|
| Legend swatches | `DentalTabs.jsx:493` | `Object.entries(FINDING_STYLES).map(...)` |
| Finding dropdown (add-modal) | `DentalTabs.jsx:607` | `Object.keys(FINDING_STYLES).map(...)` |
| Recent-findings badge + color | `DentalTabs.jsx:559, 574` | `FINDING_STYLES[e.finding]` + `findingLabel()` |
| Wedge tint on the chart | `DentalTabs.jsx:479` → `ToothSurfaces.jsx:85` | `findingStyles={FINDING_STYLES}` prop → `styleFor()` |
| EN/AR label helper | `DentalTabs.jsx:359–363` (`findingLabel`) | reads `def.label` / `def.ar` from the same map |

So **one edit at `DentalTabs.jsx:339–348`** covers dropdown, legend, recent list, wedge color, and localization simultaneously.

## §5 — Color assignments

**Existing palette (actual hex, verified at `DentalTabs.jsx:340–347`):**

| Finding | Color | Hue band |
|---|---|---|
| Cavity | `#ef4444` | red |
| Restoration | `#3b82f6` | blue |
| Missing | `#64748b` | slate grey |
| Crown | `#d97706` | **amber/orange** |
| Bridge | `#8b5cf6` | violet |
| Implant | `#0d9488` | teal |
| Root Canal | `#1e40af` | dark blue |
| Healthy | `#22c55e` | green |

Reserved (not a finding): hover/focus stroke `#06b6d4` cyan (`ToothSurfaces.jsx:31`) — avoid cyan for findings.

**⚠️ Palette-crowding flag (guardrail trigger).** The prompt's proposals — Fracture `#f97316` (orange) and Wear `#a16207` (tan/brown) — **both land in the same warm orange→amber→brown band that Crown `#d97706` already occupies.** Three warm swatches adjacent in the legend, and adjacent wedge tints, is a real read-at-a-glance risk for the dentist demo. Specifically:
- Wear `#a16207` vs Crown `#d97706`: **too close** (both amber/brown, ~32–40° hue) — recommend changing.
- Fracture `#f97316` vs Crown `#d97706`: distinguishable (bright vs dark) but still same band — borderline.

**Recommended assignments (separation-first):**

| Finding | Recommended | bg (`rgba(...,0.12–0.14)`) | Rationale |
|---|---|---|---|
| **Fracture** | `#db2777` (fuchsia/pink-600) | `rgba(219,39,123,0.12)` | Breaks out of the warm band entirely; open hue (~330°), no neighbor; reads as "alert/structural." |
| **Wear** | `#78350f` (deep espresso brown, amber-900) | `rgba(120,53,15,0.14)` | Keeps the "worn/brown" semantic but is markedly **darker** than Crown's mid-amber, so the two don't blur. |

**Prompt-faithful alternative (if Ali prefers the original orange/tan intent):**

| Finding | Color | bg | Note |
|---|---|---|---|
| Fracture | `#f97316` (orange-500) | `rgba(249,115,22,0.12)` | Accept w/ MEDIUM clash note vs Crown. |
| Wear | `#a16207` (amber-700) | `rgba(161,98,7,0.12)` | **Not recommended** — too close to Crown `#d97706`. |

Full new entries (recommended option), to slot into `FINDING_STYLES`:
```js
  fracture: { color: '#db2777', bg: 'rgba(219,39,123,0.12)', label: 'Fracture', ar: 'كسر' },
  wear:     { color: '#78350f', bg: 'rgba(120,53,15,0.14)',  label: 'Wear',     ar: 'تآكل' },
```

## §6 — Localization → **self-contained, no shared dictionary needed**

- `src/translations.js` has **zero** finding-type labels (grep for `cavity|finding` → no matches). Finding localization is **not** in the i18n dictionary.
- All EN/AR finding labels live **inline** in `FINDING_STYLES` (`label` = EN, `ar` = AR), surfaced via `findingLabel()` (`DentalTabs.jsx:359–363`).
- So the Arabic strings are added **in the same two-line edit** as the colors — no new file, no `translations.js` touch. **No localization-complexity scope flag.**
- Arabic terms (match the prompt; consistent with the "confirm with native-speaking dentist" caveat already on `SURFACE_LABELS`/`xrayTypes`):
  - Fracture → **كسر** (kasr)
  - Wear → **تآكل** (taʼākul)

## §7 — X-ray module → **separate concept, no overlap (verified)**

- X-ray types are their own enum `xray_type` with its own option list: `src/lib/xrayTypes.js:9–16` = `bitewing, periapical, panoramic, occlusal, cbct, other`. Sourced from `scripts/xray-module-migration.sql`.
- Completely disjoint from `dental_finding`; different table/column. `fracture`/`wear` have no bearing here. **No X-ray changes.**
- (Coincidence noted: `occlusal` appears both as an X-ray type and as a tooth surface — different columns, irrelevant to this change. `MiniToothChart.jsx` does not consume finding colors — its only match was a focus-ring class.)

## §8 — Legacy-data guardrail → **satisfied by construction**

- Grep for `fracture|wear|تآكل|كسر` across `src/` → **no matches** (only this doc would appear).
- The DB enum physically cannot store `fracture`/`wear` until the `ALTER TYPE` runs, so **no pre-existing rows can carry these values.** No STOP condition.
- (A live-DB `SELECT DISTINCT finding ...` confirmation is impossible from chat/read-only and unnecessary given the enum constraint; note it as a 10-second human check before the migration if desired.)

## §9 — Complete change inventory (for Phase 2)

| # | File:line | Change | Risk |
|---|---|---|---|
| 1 | `src/lib/schema.sql:78–87` + migration script | `CREATE TYPE` add 2 values; new `ALTER TYPE ... ADD VALUE` migration | Dental ceremony (dry-run + rollback plan; human runs) |
| 2 | `src/lib/dental.js:51–52` (+comment `:24`) | Add `'fracture','wear'` to `DENTAL_FINDINGS` Set | **HIGH if missed** — saves throw otherwise |
| 3 | `src/components/DentalTabs.jsx:339–348` | Add 2 `FINDING_STYLES` entries (color+bg+label+ar) | Low — drives all UI from one spot |
| 4 | `src/lib/toothSurfaces.js` | **NONE** — must NOT add to `WHOLE_TOOTH_FINDINGS` | Verified; surface-default path is automatic |

## §10 — Complexity estimate

- **Phase 2 (UI + data layer):** ~30 min. Two-line edit to `FINDING_STYLES` + two entries in `DENTAL_FINDINGS`. No new components, no render-logic changes, no `translations.js`. Visual smoke test (legend/dropdown/wedge tint) is the bulk of it.
- **Phase 3 (schema migration):** ~30–45 min incl. dry-run on a copy + written rollback plan per CLAUDE.md ceremony. The SQL itself is 2 lines; the ceremony is the cost. Human executes against prod.
- **Total estimate:** small. No data migration (additive). No backend function added → **Vercel 12/12 function cap untouched.**

## §11 — Open questions for Ali

1. **Colors (decision needed):** Go with the separation-first recommendation (**Fracture `#db2777` fuchsia, Wear `#78350f` deep brown**) to avoid crowding Crown's amber? Or keep the original orange/tan intent and accept Crown/Wear looking similar on the chart? *(Recommend the former for demo clarity.)*
2. **Surface requirement:** Should `fracture`/`wear` *require* a surface (block whole-tooth entry), or allow the whole-tooth fallback that the current hybrid rule permits when no surface is picked? Current code allows the fallback.
3. **Arabic terms:** OK to ship كسر / تآكل with the standing "confirm with a native-speaking dentist" caveat already applied to surfaces and X-ray types?
4. **Migration timing:** Run the `ALTER TYPE` before or after the UI ships? (UI without the enum/whitelist = guaranteed save failures, so schema + `dental.js` should land first or together — never UI-first.)
