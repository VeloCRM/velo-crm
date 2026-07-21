# SupCod3 Dental — Rebrand Migration Status

Token layer: `src/styles/tokens.css` is the single source of truth. Unmigrated
screens render via aliases (`index.css --velo-*`, `tailwind.config.js`,
`theme.css`) and are functional + recolored teal where they consume tokens, but
retain hardcoded inline hex until individually migrated.

> The full migrated-vs-aliased per-file checklist (with raw-hex literal counts)
> is completed in Task 12. This file already records the items that must not be
> lost: **Future passes** and **Technical debt**.

## Migrated so far (preview-matched, tokens/teal/IBM Plex)
- [x] Shell chrome (App.jsx header + sidebar) — stacked product/clinic identity, SC logo
- [x] Auth (login / reset)
- [x] Dashboard (`DentalDashboard`) — entrance, countUp, progress bar, pulse, toast
- [x] Patients list (`PatientsPage` in App.jsx) — bounded entrance (first 12 rows)
- [x] Patient profile (`PatientProfile` in App.jsx) — tooth chart: pressFeedback on selection only
- [ ] Appointments + calendar + AddAppointmentModal — Task 11 (pending)

## Future passes (recorded so they don't evaporate)

### Dedicated tooth-chart session (out of scope for the rebrand pass)
The dental chart carries a **clinical** color system (condition/finding colors
in `DentalTabs.jsx` + `FINDING_STYLES`), which is medically meaningful and was
deliberately NOT remapped to brand teal during the rebrand. It deserves its own
session:
1. **Create a custom dental-charting skill** via `skill-creator`, encoding:
   - FDI notation conventions (and Palmer mapping)
   - condition/finding **color standards** (caries, restorations, crowns,
     endo, missing, etc. — the clinical palette, distinct from brand tokens)
   - surface charting conventions (5-surface / Dentrix-style zones, whole-tooth
     vs per-surface finding rules)
2. **Redesign the chart against that skill with clinical input** (a dentist in
   the loop), rather than ad-hoc visual tweaks.
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
