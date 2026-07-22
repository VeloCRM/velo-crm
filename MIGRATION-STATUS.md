# SupCod3 Dental — Rebrand Migration Status

Token layer: `src/styles/tokens.css` is the single source of truth. Unmigrated
screens render via aliases (`index.css --velo-*`, `tailwind.config.js`,
`theme.css`) and are functional + recolored teal where they consume tokens, but
retain hardcoded inline hex until individually migrated.

## Migrated (preview-matched: tokens / teal / IBM Plex / motion)

| Screen | File | Notes |
|---|---|---|
| Shell chrome | `App.jsx` header + sidebar | stacked product/clinic identity, SC logo, RTL-safe |
| Auth (login / reset) | `pages/Auth.jsx` | zero raw hex; SC mark, "by SupCod3", teal focus |
| Dashboard ("Today") | `pages/DentalDashboard.jsx` | entrance, countUp, progress bar, pulse, check-in toast |
| Patients list | `PatientsPage` (in `App.jsx`) | bounded entrance (first 12 rows only) |
| Patient profile | `PatientProfile` (in `App.jsx`) | tooth chart: pressFeedback on selection only |
| Appointments + calendar + modal | `pages/AppointmentsPage.jsx`, `components/AddAppointmentModal.jsx`, shared `Modal` | modal 0.2s in / 0.15s out; status-token banners |

**Residual hex in the migrated set is intentional, not a violation** — zero stray
mint/cyan remains. What's left: teal in `rgba()` form (brand-correct, e.g. the
dashboard glow `rgba(20,184,166,…)`), neutral grays/whites/shadows, the
clinical-neutral tooth outline `#64748b`, and the deliberately-preserved
clinical/categorical colors below.

## Aliased (functional, recolored via aliases — not yet preview-matched)

Raw-hex literal counts (`grep -cE '#hex|rgba(…)'`). These screens work and are
recolored teal *where they consume tokens*, but retain hardcoded inline hex.
Priority ≈ front-desk visibility.

| Count | File | Note |
|---|---|---|
| 51 | `pages/operator/OperatorConsole.jsx` | operator-only (dark theme); low clinic visibility |
| 50 | `components/EmptyState.jsx` | shared empty-state; touches several pages |
| 48 | `pages/SocialMonitor.jsx` | operator/marketing surface |
| 39 | `pages/operator/ClinicCredentials.jsx` | operator-only |
| 25 | `pages/ReportsPage.jsx` | includes chart colors (categorical) |
| 23 | `components/DentalTabs.jsx` | **clinical condition colors — intentional; see future pass** |
| 13 | `pages/TasksPage.jsx` | |
| 12 | `pages/IntegrationsPage.jsx` | |
| 9 | `pages/AppointmentsPage.jsx` | **doctor categorical palette + slate fallbacks — intentional** |
| 9 | `components/Toast.jsx` | shared; status-colored toasts |
| 8 | `components/NotificationCenter.jsx` | |
| 7 | `components/TestAccountBanner.jsx` | |
| 6 | `pages/InventoryPage.jsx` / `pages/DesignSystem.jsx` (operator) / `components/AIAssistant.jsx` | AIAssistant is a dark floating panel (intentional dark) |
| 2–3 | `SettingsPage.jsx`, `DocsPage.jsx`, `KeyboardShortcuts.jsx`, `CommandPalette.jsx` | |
| 1 | `ui/*` primitives (`Button/Input/Select/SkeletonGlass`), `shared.jsx`, `Logo.jsx` | single neutral/brand value each — benign |

Next-pass priority for real recolor work: **EmptyState** and **Toast** (shared,
wide reach), then **ReportsPage** (chart palette needs a categorical system, not
a flat teal remap), then the operator surfaces (lower clinic visibility).

## Future passes (recorded so they don't evaporate)

### Dedicated tooth-chart session (out of scope for the rebrand pass)
The dental chart carries a **clinical** color system (condition/finding colors
in `DentalTabs.jsx` + `FINDING_STYLES`), which is medically meaningful and was
deliberately NOT remapped to brand teal during the rebrand. It deserves its own
session.

**Step 1 — Create a custom dental-charting skill** via `skill-creator`, encoding:
- FDI notation conventions (and Palmer mapping)
- condition/finding **color standards** (caries, restorations, crowns, endo,
  missing, etc. — the clinical palette, distinct from brand tokens)
- surface charting conventions (5-surface / Dentrix-style zones, whole-tooth vs
  per-surface finding rules)

**Step 2 — Redesign the chart against that skill** as a **three-tier design**
(a dentist in the loop; clinical validation is required BEFORE implementation):

1. **Tier 1 — Charting surface (primary):** anatomically realistic **2D SVG**
   per tooth *type* (incisor / canine / premolar / molar — not one generic
   glyph), FDI notation, **surface-level marking**. This is the day-to-day
   charting path and must stay fast, keyboard-accessible, and print-clean.
   A reference concept exists in the project docs — locate and cite it when
   the session starts.
2. **Tier 2 — Anatomical detail view:** tap/click a tooth to open a larger
   anatomical detail of that single tooth (surfaces, existing findings,
   history). Still 2D; a drill-down from Tier 1, not a replacement for it.
3. **Tier 3 — Optional on-demand 3D single-tooth mode (patient presentation):**
   a 3D render of one tooth for explaining treatment to the patient.
   **On-demand and presentation-only — NEVER in the charting path** (never
   blocks or replaces Tiers 1–2; lazy-loaded so the 3D engine never ships to
   the charting bundle).

Until then, the chart stays structurally unchanged; the rebrand only aligned the
UI-accent (hover/focus/selection = teal) and added `pressFeedback` on selection.

### Other rebrand follow-ups
- **SVG logo marks** — replace the PNG pack with SVGs exported from Illustrator
  (exact hexes #14B8A6 / #0A2540 / #FFFFFF). PNG pack is live now
  (`public/brand/`); SVG is a crispness/scaling upgrade.
- **Tenant white-label config UI** — the `src/config/brand.js` seam exists; a
  per-clinic branding settings screen is a later pass (brief §5).

## Technical debt (separate audits, not rebrand scope)
- **Dependency vulnerabilities** — `npm audit` reports 10 (7 high), from the
  `puppeteer`/stealth chain in `dependencies` (server/api-only; NOT in the
  client bundle). Schedule a dedicated dependency-audit pass.
- **Dev-mode React in production build** — `.env.local` + `.env.example` set
  `NODE_ENV=development`, so `vite build` ships the React development runtime
  (see `docs/superpowers/PERFORMANCE-AUDIT.md` F1). Highest-impact perf fix;
  config-only. Tracked in the performance audit's Pass A.
- Full performance findings + 3-pass fix plan: `docs/superpowers/PERFORMANCE-AUDIT.md`.
