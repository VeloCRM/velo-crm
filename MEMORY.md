# Velo CRM — Session State
## Last updated: 2026-06-25

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
  - Saif **messaged ~2026-06-22 (3 days ago)** confirming a **mid-July** onboarding timeline — accepted.

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
- profile_role enum: owner | doctor | receptionist | assistant | **xray_tech** (V1.5)

# ── V1.5 (Saif onboarding prep) ────────────────────────────────────────────

## Workstream 1 — xray_tech role + role gating: ✅ COMPLETE (live on production, 2026-06-25)
Three PRs merged + deployed today, and the prod DB migration applied:
- **PR #49** (merge bd724b9) — backend: `ALTER TYPE profile_role ADD VALUE 'xray_tech'`
  (two-phase) + xrays table/storage RLS (xray_tech INSERT any patient, UPDATE/DELETE
  own uploads only via uploaded_by / storage owner) + hardened `api/ai/chat.js`
  (owner/doctor/receptionist) and `api/social-fetch.js` (owner-only) with the
  PR #47 auth pattern. Script: `scripts/v1.5-add-xray-tech-role.sql`.
- **PR #50** (merge 1dc068e) — frontend: permissions.js xray_tech (ROLES/MATRIX/labels/
  descriptions), PatientProfile hides clinical/financial tabs from xray_tech
  (Overview + Appointments[read-only] + X-rays only; defaults to X-rays), XraysTab
  EDIT_ROLES, Settings invite dropdown, Join labels. **PaymentsTab latent-bug fix**:
  Add/Delete were ungated for all roles → now `can(role,'payments','w')` (owner+
  receptionist write; doctor/assistant read-only).
- **PR #51** (merge f816ff2) — server invite allow-list: `api/invitations/create.js`
  INVITABLE_ROLES now accepts `xray_tech`.
- **Enum + RLS APPLIED TO PRODUCTION** (per Ali; the SQL script is a manual run —
  verification queries in the script footer). xray_tech is usable end-to-end.

**5 roles now:** owner, doctor, receptionist, **assistant (defined but UNUSED — 0
production users)**, **xray_tech (new, live)**. NB: profiles.role DEFAULTs to
'assistant' and normalizeRole falls back to it — so any future stray/defaulted
row reads as assistant. Helper to audit: `scripts/role-distribution-check.mjs`.

> ⚠️ **V1.5 receptionist clinical hiding + xray_tech tab hiding are UI-ENFORCED only.**
> Core clinical tables (dental_chart/treatment_plans/prescriptions/notes/payments)
> RLS stays org-only — a non-owner with API access can still read/write clinical
> rows the UI hides. Only `xrays` has role-aware RLS. DB-enforced PHI separation
> (the `patient_clinical` split) is deferred to V2. Documented in the security audit.

## Remaining V1.5 workstreams
2. **Mobile responsive pass (Week 2)** — phone + tablet. Diagnostic done:
   `scripts/mobile-ux-audit-2026-06-24.md` (1 CRITICAL: dental-chart wedge tap
   targets ~4px iPhone / ~14px iPad; 8 HIGH). Quick wins already shipped (PR #48:
   iOS input-zoom fix + lazy HEIC→JPG). The chart-interaction redesign (M-01) is
   the open scope decision.
3. **GHL import + Saif onboarding (Week 3)** — 3,171 contacts, per-doctor tags
   (Saif vs Hawkar) → primary_doctor_id, + notes/payments/documents via
   external_id/external_source. GHL export format still UNKNOWN (separate diagnostic).

## Decisions locked
- Separate role-specific views (not one shared hide/show). xray_tech = 5th role.
- Mobile = phone + tablet both. Mid-July onboarding accepted by Saif.

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

## V1.5 diagnostics on master (recoverable reference)
- `scripts/v1.5-architecture-diagnostic.md` — full RLS/ownership plan (V2 PHI split lives here).
- `scripts/v1.5-roles-permissions-diagnostic.md` — role-check inventory + the xray_tech plan.
- `scripts/mobile-ux-audit-2026-06-24.md` — mobile findings (workstream 2).
- `scripts/security-audit-2026-06-24.md` — security perimeter audit.

## Backlog (filed)
- DentalTabs' inline useMyRole → shared src/hooks/useMyRole.js (small refactor)
- V1.1: Missing/whole-tooth finding should clear/block surface findings on same tooth
- Remaining MINOR silent-catch sites (SettingsPage/FinancePage/AppointmentsPage)
- Agency dashboard dark-on-light bleed (visual polish)
- Storage RLS 4-policy convention → add to CLAUDE.md
- Demo seed: scripts/seed-demo-patient-ahmed-hassan.sql (Ahmed Hassan Al-Bayati, Le Royal)
