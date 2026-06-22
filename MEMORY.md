# Velo CRM — Session State
## Last updated: 2026-06-23

## Current branch: master (working tree clean)

## Production state (aajwuwjxpmmqcwhiynla, free tier — test-scale data)

### Recent merges
- PR #34 (510e408): OperatorConsole silent-catch fixes + stale create-first-org SQL deleted
- PR #35 (e1a1b17): DentalDashboard handleAction rollback (SEVERE silent-catch fix)
- PR #36 (425f175): Palmer notation toggle (FDI/Palmer per-doctor preference + schema migration applied)
- PR #37 (7d465b5): 5-surface diamond-wedge dental chart with hybrid whole-tooth/wedge rendering
- PR #38 (feb1dbb): X-ray backend (xrays table + patient-xrays bucket + data layer, dormant)
- Hotfix (db78f81): xrays_storage_insert policy added via scripts/xray-fix-storage-insert-policy.sql
- PR #39 (85f4516): X-ray UI tab — upload modal + date-grouped grid + interim window.open view (lightbox = PR-B2)

### Schema state
- profiles.tooth_notation column added (enum 'fdi'/'palmer', default 'fdi')
- xrays table created (17 columns, 5 indexes, 5 RLS policies)
- patient-xrays bucket created (25 MB, jpeg/png/webp, 4 storage RLS policies)

### Three dentist V1 asks status
- Palmer notation: ✅ live
- 5-surface chart with comments: ✅ live
- X-ray tab: ✅ live (PR #38 backend + PR #39 UI: upload + grid; zoom/pan lightbox + metadata edit/delete = PR-B2)

## Three Phase 1 diagnostics on master (all stale-memory ghosts)
- scripts/onboarding-bug-diagnostic.md — premise stale (flow deleted in Sprint 0)
- scripts/teamtab-invite-diagnostic.md — premise stale (transient deploy gap, healed)
- scripts/cron-diagnostic.md — premise stale (rotation completed in May 2026)

## Pattern recognition / lessons recorded
- Storage RLS: every new bucket needs all 4 op policies (SELECT/INSERT/UPDATE/DELETE) verified before declaring migration complete. Silent INSERT denial cost ~30 min of recovery on PR #38.
- Merge ordering: gh pr merge --auto doesn't enforce manual migration steps from PR description. Code can ship before SQL. Mitigation: explicit confirmation step required, or defer auto-merge until manual step done.
- Phase 1 diagnostic pattern: 3 ghosts caught this week. When memory flags something as "broken," verify against current code/schema before fixing. Three for three rate justifies the discipline.

## V2 restructure: DEFERRED
- ARCH-V2-PLATFORM.md on master with deferred banner
- PR #31 (Phase 1A migration SQL draft) closed cleanly, branch refactor/v2-platform-phase-1a preserved
- V1 completion is current focus, V2 to resume 6-12 months out

## Next session
- PR-B2: in-app zoom/pan lightbox + metadata edit/delete (replaces the interim window.open full-size view)
- After PR-B2: GHL import pipeline rewrite (4 scripts) → Saif Dental onboarding

## Backlog
- V1.1: Missing/whole-tooth findings should clear or block subsequent surface findings on same tooth
- Migrate DentalTabs inline useMyRole → shared src/hooks/useMyRole.js (from PR-B1 review)
- PR-B silent-catch audit follow-up (6 MINOR sites in SettingsPage/FinancePage/AppointmentsPage)
- Agency dashboard dark-on-light bleed (visual polish)
- PR #6 (operator-banner-suppression) still open, untouched — decide later
