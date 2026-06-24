# Velo CRM — Session State
## Last updated: 2026-06-24

## Current branch: master (working tree clean)

## ⭐ Critical framing (read first)
- **Velo is a multi-tenant SaaS dental CRM — NOT a Le Royal-specific build.** Every
  feature must generalize across clinics; org-scoping via RLS is the boundary.
- **Le Royal = real production customer** (org_id 66f75f33-40b0-4f00-bf33-b9ac1c20af46).
  Earlier notes treating it as "test-scale" are stale — treat its data as production.
- **Saif Dental = incoming paying customer**, onboarding mid-to-late **July 2026**.
  - 4-doctor clinic: **Saif + Hawkar + 2 others**, plus an **X-ray department** and **reception**.
  - **Has paid.** Explicit expectation: **"better than GHL"** (they're migrating off GoHighLevel).
  - GHL data to import: **3,171 contacts**, already **tagged per doctor (Saif vs Hawkar)**,
    with notes / payments / documents attached.
  - Saif was **told tonight (2026-06-24)** about the timeline shift to late July — accepted.

## V1 dental features: ALL SHIPPED ✅ (PRs #36–#46)
- Palmer notation toggle (per-doctor FDI/Palmer) — PR #36
- 5-surface diamond-wedge dental chart, hybrid whole-tooth/wedge render — PR #37
- X-ray module: backend + bucket (#38), UI tab/upload/grid (#39), in-place lightbox (#40)
- Fracture + Wear finding types w/ required-surface validation — PR #41
- Tooth wedge divider WCAG contrast — PR #42
- Patient profile + sidebar UI polish (7 targets) — PR #43
- Demo-blocker fixes from the dental-flow dry-run (6 fixes: lightbox click-through,
  HEIC upload feedback, dashboard skeleton, patient-form validation, in-profile Book
  Appointment, operator confirm dialogs) — **PR #46 (merge 6d63b25)**
- Phase 1 dry-run audit committed to master: `scripts/dental-flow-dry-run-2026-06-24.md` (6d7fb5e)

## Security perimeter: HARDENED
- PR #44 (c54c0a0): stop leaking raw DB error detail to clients (H-4, L-11)
- PR #45 (e198908): HTTP security headers + CSP consolidated to vercel.json
- Supabase auth config tightened: **8-char passwords w/ special chars required, JWT 1h,
  OTP 1h, rate limits at defaults.**
- Audit doc: `scripts/security-audit-2026-06-24.md` (7 categories)

## Schema state (all live on production)
- profiles.tooth_notation enum('fdi','palmer') default 'fdi'
- xrays table + patient-xrays bucket (25 MB, jpeg/png/webp, 4 storage RLS incl. INSERT hotfix)
- dental_finding enum extended with 'fracture' + 'wear' (surface-required, app-enforced)
- prescriptions + prescription_items (doctor-role enforced via trigger)
- profile_role enum currently: owner | doctor | receptionist | assistant

# ── V1.5 PLAN (next cycle — Saif onboarding prep) ──────────────────────────

## Scope (3 workstreams)
1. **Role-scoped patient ownership** — 4 roles with **separate views**:
   owner / doctor / **xray_tech (NEW role)** / receptionist.
   - Doctors see their own caseload (Saif's vs Hawkar's patients, driven by the
     per-doctor GHL tags); reception sees all; xray_tech scoped to imaging.
   - New `xray_tech` role → profile_role enum migration + permissions + RLS + UI gating.
2. **Mobile responsive pass** — **both phone AND tablet** (clinic reception + chairside).
3. **GHL import pipeline** — 3,171 contacts, preserve per-doctor tags → primary_doctor_id,
   plus notes / payments / documents. Route to categorized tabs via external_id/external_source.

## Decisions locked (2026-06-24)
- Separate role-specific views (not one shared view with hide/show).
- New `xray_tech` role (4 roles total).
- Mobile = phone + tablet both.
- Late-July onboarding is acceptable to Saif.

## Timeline — 4 weeks
- **Week 1–2:** V1.5 architecture — role-scoped ownership + xray_tech role + RLS/permissions.
- **Week 3:** Mobile responsive pass (phone + tablet).
- **Week 4:** GHL import (3,171 contacts w/ doctor tags) + Saif Dental onboarding.

## V2 restructure: DEFERRED
- ARCH-V2-PLATFORM.md on master (deferred banner); PR #31 (Phase 1A SQL draft) closed,
  branch refactor/v2-platform-phase-1a preserved. Resume 6–12 months out.

## Pattern recognition / lessons (carry forward)
- **Phase 1 (read + propose) before Phase 2 (execute)** repeatedly catches stale-memory
  ghosts and audit miscounts before any code is touched. Verify "broken" claims against
  current code/schema first.
- **Storage RLS:** every new bucket needs all 4 op policies (SELECT/INSERT/UPDATE/DELETE)
  verified before declaring a migration complete (silent INSERT denial cost ~30 min, PR #38).
- **Merge ordering:** `gh pr merge --auto` doesn't enforce manual migration steps from the PR
  body — code can ship before SQL. Mitigate for migration PRs.
- **Mandatory code-review on dental code earns its keep:** caught real concurrency bugs in
  PR #35/#37/#40 that would've shipped silently.
- **Runtime-dep discipline preserved** (PR #40: 70-LOC custom zoom/pan over a library).
- **Supabase `.update()` matching 0 rows under RLS returns NO error** — cross-user writes
  silently no-op; use SECURITY DEFINER RPC or check rows-affected.

## Backlog (filed)
- DentalTabs' inline useMyRole → shared src/hooks/useMyRole.js (small refactor)
- V1.1: Missing/whole-tooth finding should clear/block surface findings on same tooth
- Remaining MINOR silent-catch sites (SettingsPage/FinancePage/AppointmentsPage)
- Agency dashboard dark-on-light bleed (visual polish)
- Storage RLS 4-policy convention → add to CLAUDE.md
- Demo seed: scripts/seed-demo-patient-ahmed-hassan.sql (Ahmed Hassan Al-Bayati, Le Royal)
