# Velo CRM — Session State
## Last updated: 2026-06-23

## Current branch: master (working tree clean)

## Production state (aajwuwjxpmmqcwhiynla, free tier — test-scale data)

### Recent merges (most recent first)
- PR #40 (22981ae): X-ray lightbox — in-place zoom/pan/pinch + metadata edit + delete (replaces interim window.open)
- PR #39 (85f4516): X-ray UI tab — upload modal + grid + filter chips + MiniToothChart
- PR #38 (feb1dbb): X-ray backend — xrays table + patient-xrays bucket + data layer
- Hotfix: xrays_storage_insert policy added via scripts/xray-fix-storage-insert-policy.sql
- PR #37 (7d465b5): 5-surface diamond-wedge dental chart with hybrid whole-tooth/wedge rendering
- PR #36 (425f175): Palmer notation toggle (FDI/Palmer per-doctor preference + schema migration)
- PR #35 (e1a1b17): DentalDashboard handleAction rollback (SEVERE silent-catch fix)
- PR #34 (510e408): OperatorConsole silent-catch fixes + stale create-first-org SQL deleted

### Schema state (all live on production)
- profiles.tooth_notation enum('fdi','palmer') default 'fdi' — migration applied
- xrays table (17 columns, 5 indexes, 5 RLS policies) — migration applied
- patient-xrays bucket (25 MB, jpeg/png/webp, 4 storage RLS policies including hotfix INSERT) — applied

### Three dentist V1 asks: ALL LIVE ✅
- Palmer notation: ✅ live (per-doctor toggle in Settings → Profile)
- 5-surface chart with comments: ✅ live (diamond-wedge SVG, hybrid render rule)
- X-ray module: ✅ live (upload + browse + in-place lightbox + edit + delete)

### Components added this cycle
- src/hooks/useMyRole.js — shared role hook (DentalTabs still has inline version, migration is backlog)
- src/hooks/useMyToothNotation.js — Palmer/FDI preference hook
- src/hooks/useZoomPan.js — custom gesture handler (~70 LOC, no library dep)
- src/components/ToothLabel.jsx — FDI/Palmer rendering with CSS-border brackets
- src/components/ToothSurfaces.jsx — 5-wedge SVG with hybrid render rule
- src/components/MiniToothChart.jsx — multi-select FDI picker
- src/components/XraysTab.jsx + XrayGrid.jsx + XrayUploadModal.jsx + XrayLightbox.jsx + XrayMetadataForm.jsx
- src/lib/xrays.js — fetch/upload/update/delete/signed URL + canvas thumbnail
- src/lib/toothNotation.js + toothSurfaces.js — pure utils

## Three Phase 1 diagnostics on master (all stale-memory ghosts caught)
- scripts/onboarding-bug-diagnostic.md — premise stale (self-serve flow deleted in Sprint 0)
- scripts/teamtab-invite-diagnostic.md — premise stale (transient deploy gap, healed)
- scripts/cron-diagnostic.md — premise stale (rotation completed in May 2026)

## Pattern recognition / lessons recorded
- Storage RLS: every new Supabase Storage bucket needs all 4 op policies (SELECT/INSERT/UPDATE/DELETE) verified before declaring migration complete. Silent INSERT denial cost ~30 min on PR #38. Worth adding to CLAUDE.md.
- Merge ordering: gh pr merge --auto doesn't enforce manual migration steps from PR description. Code can ship before SQL. PR #38 hit this — code dormant so no harm, but worth mitigating for future migration PRs.
- Phase 1 diagnostic pattern: 3 ghosts caught this week + 1 X-ray legacy bucket caught at Phase 1 of PR #38. Read-only verification before fixing pays off repeatedly. When memory flags something as "broken," verify against current code/schema first.
- Code-review value: caught real concurrency bugs in PR #35 (whole-list snapshot rollback), PR #37 (whole-slot latest-overrides), PR #40 (stale snapshot on nav after edit). Each would have shipped silently. Mandatory review on dental code earning its keep.
- 4-runtime-dep discipline preserved: PR #40 considered react-zoom-pan-pinch, came in at 70 LOC custom instead. Conscious decision, not silent.

## V2 restructure: DEFERRED
- ARCH-V2-PLATFORM.md on master with deferred banner
- PR #31 (Phase 1A migration SQL draft) closed cleanly, branch refactor/v2-platform-phase-1a preserved
- V1 completion is current focus, V2 to resume 6-12 months out

## Next session — three options
1. Dentist demo (recommended) — show all three V1 features in production, capture his reactions before building more polish
2. GHL import pipeline (4 scripts) → Saif Dental onboarding prep (3 sessions est.)
3. Small backlog: migrate DentalTabs' inline useMyRole → shared hook; V1.1 Missing/whole-tooth surface rule; agency dashboard dark-on-light bleed

## Backlog (filed)
- V1.1: Missing/whole-tooth findings should clear or block subsequent surface findings on same tooth (dentist conversation item)
- DentalTabs' inline useMyRole → migrate to shared src/hooks/useMyRole.js (small refactor)
- Repo-wide silent-catch audit remaining MINOR/LOW findings (6 sites in SettingsPage/FinancePage/AppointmentsPage)
- Agency dashboard dark-on-light bleed (visual polish)
- PR #6 (operator-banner-suppression) still open from much earlier — decide later
- Optional cron hardening: add ?dryRun=1 mode to cleanup-test-accounts.js for verifiable runs
- Storage RLS 4-policy convention → add to CLAUDE.md
