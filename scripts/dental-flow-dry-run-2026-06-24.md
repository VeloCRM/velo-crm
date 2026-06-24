# Dental Flow Dry-Run Audit — 2026-06-24

**Scope:** Read-only, end-to-end clinical-workflow walkthrough of `velo-crm` (master, PRs #41–45 merged) ahead of the Dr. Saif demo. Phase 1 diagnostic only — **no fixes, no writes, no migrations.**
**Lens:** What would a discerning, paying dentist notice/react to on first use?
**Method:** Static source analysis across 6 screen clusters. Runtime-only items are tagged with a test plan rather than guessed.
**Not in scope:** Security (see `scripts/security-audit-2026-06-24.md`), feature-gap audit (Saif's known asks are shipped).

---

## Executive Summary

**No CRITICAL (crash/data-loss) findings.** The core clinical mechanics are sound: the dental chart (10 finding types, FDI↔Palmer round-trip, PR #41 fracture/wear surface-required enforcement, PR #42 wedge-stroke contrast, RTL non-mirroring) is correctly implemented and schema-consistent; the X-ray lightbox has a real focus trap + signed-URL retry; optimistic updates roll back correctly across multiple tabs.

### 🚨 Demo-blockers (fix or rehearse-around before showing Dr. Saif)

| # | Severity | Screen | One-liner | Scope |
|---|----------|--------|-----------|-------|
| **DB-1** | HIGH | X-ray Lightbox | Single-click **on the radiograph** closes the viewer (image is `pointer-events-none`, all clicks hit the close-on-backdrop container). A dentist inspecting a film will dismiss it repeatedly, esp. on touch. | M |
| **DB-2** | HIGH | X-ray Upload | Non-image files (**incl. iPhone HEIC**) are silently dropped — no toast, nothing appears. Dentist photographs a film on iPhone → "nothing happened." | S |
| **DB-3** | HIGH | Dashboard | Fresh paint shows **"0 patients / no appointments today"** during its own async load (the render isn't gated on `dbData.loading`). A populated clinic flashes empty — reads as "my data is gone." | S |
| **DB-4** | HIGH | Create Patient | Save on a form missing Name/Phone **silently returns** — no error, no toast, no focus. The real toast is unreachable. Looks broken. | M |
| **DB-5** | HIGH | Patient → Appointments tab | **No "New Appointment" / status control** anywhere on the patient profile; the tab is read-only. A dentist will try to book a follow-up from here and find nothing. | M |
| **DB-6** | HIGH | Prescriptions | Print button is **hard-disabled when the doctor has no template uploaded**, and the "print on pre-printed pad" fallback is unreachable through the normal path. Very likely state for the demo doctor → Print looks broken. | S |
| **DB-7** | HIGH | Prescriptions print | Print overlay positions are hardcoded `%` offsets (`index.css:456-458`) tuned to an assumed pad. On Dr. Saif's real template, text may overlap the letterhead. | M |
| **DB-8** | HIGH (Arabic) | Login error | Bad-credential errors render the **raw English Supabase string** even in the Arabic/RTL UI. Fires the moment Dr. Saif fat-fingers a password. | S |
| **DB-9** | HIGH (Arabic) | Add Appointment modal | Entire modal is **hardcoded English + `dir="ltr"`** — no translations. Fully English in an Arabic demo. | M |
| **DB-10** | MEDIUM | App cold-start | First frame is a **purple-"V" loader** (`#A78BFA`) that then rebrands to the navy/cyan "Velo" auth mark — two brand colors back-to-back on the literal first screen. | S |
| **DB-11** | MEDIUM | Sidebar branding | Sidebar title **flickers from "Velo" → "Le Royal"** on every sign-in/load (org name renders after `orgSettings` resolves). | S |

> **Operator-console caveat (not a code blocker, but a live-demo hazard):** if you screen-share the agency console, a **single mis-click on any org row immediately impersonates that client**, **Suspend has no confirm and no loading state**, and a **fetch error silently shows 6 fake sample orgs**. Don't open the operator console live unless deliberately demoing it.

> **Two tabs to avoid opening live:** Settings → **Integrations** and Settings → **AI Agent** are elaborate forms that show "Saved!" but **silently discard everything** (`sanitizeOrgUpdate` whitelist drops all those fields). They look real and do nothing.

### Severity tally
- **CRITICAL:** 0
- **HIGH:** ~14 (11 demo-blockers above + the silent-discard Settings tabs + email-validation gaps)
- **MEDIUM:** ~25
- **LOW:** ~22
- **POLISH:** ~10

### ⚠️ Must-verify-at-runtime before the demo (auth-gated, can't confirm statically)
1. **Does the demo doctor account have `prescription_template_url` set?** If not, Print is disabled everywhere (DB-6).
2. **Print on Dr. Saif's real template** — confirm overlay offsets don't collide with his letterhead (DB-7).
3. **Is Supabase actually configured in the demo env?** Several screens fall back to fake `SAMPLE_TEAM` / `SAMPLE_ORGS` on un-configured *or errored* loads (Settings Team, Operator Console).
4. **Profile-Save persistence smoke test** (per memory): login → Settings → Profile → save name → hard refresh → confirm it persists. Only wire-up touching live Supabase self-update RLS.
5. **Demo account role:** if logged in as owner-only with **no doctor-role user**, prescriptions can't be created (empty doctor dropdown).
6. **X-ray lightbox click-close** (DB-1), **wedge hit-target size at projector resolution**, **chart role-resolution dead-click window** on slow network.
7. The **"Create test account" button seeds a random new clinic**, *not* "Le Royal." To show Dr. Saif's branding/data, he must sign in with real credentials.

---

## Findings by Screen / Flow

### 1. Sign-in / Auth

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| A-1 | HIGH | Bad credentials | `setError(err.message)` surfaces raw English Supabase strings ("Invalid login credentials"); no localization layer. In RTL the English text right-aligns in the red banner. | Localized friendly message (EN/AR). | S | **yes** (Arabic) | `Auth.jsx:144,148`; `lib/auth.js:13-17` |
| A-2 | MED | Create-test-account error | API returns English `"Failed to create test account"` / `HTTP {status}`; rendered verbatim in Arabic banner. | Localized failure. | S | no | `Auth.jsx:166-176`; `api/auth/create-test-account.js:307-309` |
| A-3 | MED | Create-test-account latency | ~9 sequential seed steps + a second `signIn` round-trip; only feedback is an inline button spinner. Multi-second silent wait. | Fuller busy/progress state. | M | needs runtime test | `api/auth/create-test-account.js:100-289`; `Auth.jsx:157-179` |
| A-4 | HIGH (ops) | `/api/auth/create-test-account` | No auth/captcha/rate-limit; `Access-Control-Allow-Origin: *`; each call provisions a real auth user + org + ~63 rows. Only 14-day cron cleans up. | IP rate-limit / soft gate. | M | no (pre-launch) | `api/auth/create-test-account.js:9-11,77-83` |
| A-5 | LOW | Sign-in submit | No client timeout; if Supabase hangs the spinner spins indefinitely. | Timeout/error after N s. | S | no | `Auth.jsx:140-155,302-305` |
| A-6 | ✅ | RTL email/password | Inputs correctly forced `dir="ltr"`; icon uses logical `start-3`. Verified OK. | — | — | no | `Auth.jsx:255-280`; `ui/Input.jsx:73-81` |
| A-7 | ✅ | Sign-in card | GlassCard, `role="alert"`/`status` banners, password reveal, lockout countdown, operator-contact modal with fallback. Solid. | — | — | no | `Auth.jsx:204-390` |

**Auth bootstrap (cross-cutting):**
- **A-8 (MED, DB-10):** Cold-start full-screen loader uses legacy purple gradient `linear-gradient(135deg, ${C.primary}, #A78BFA)` on `C.bg`, clashing with the navy/cyan auth brand mark. First frame of the demo. `App.jsx:597-605` vs `Auth.jsx:206-216`. Scope S.
- **A-9 (LOW):** `onAuthStateChange` never clears `authLoading`; only `getCurrentUser().then(...)` does, with no `.catch`. If `getCurrentUser()` rejects (stale token / network blip), the app hangs on the purple loader. Add `.catch(() => setAuthLoading(false))`. `App.jsx:334-341`; `lib/auth.js:52-56`. Scope S. *Runtime test: cold-load offline with a stale session.*

---

### 2. Dashboard

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| D-1 | HIGH | First paint | `DentalDashboard` mounts with `loading:true` but **never gates render on it** — shows "Total Patients 0 / No appointments today / No recent patients" for the duration of the stats fetch, then pops to real numbers. App-level `SkeletonDashboard` only covers patient/payment load, not stats. | Gate render on `dbData.loading`. | S | **yes (DB-3)** | `DentalDashboard.jsx:84-88,108-169,249-296`; `App.jsx:1050-1061` |
| D-2 | MED | Overall | No charts at all — `KPICard`/`ChartCard` exist but are unused; dashboard is 3 inline stat tiles + lists. Reads list-heavy/flat for a "dashboard." | At least one visual, or confirm intentional minimalism. | M | no | `DentalDashboard.jsx:249-503`; unused `ds/KPICard.jsx`, `ChartCard.jsx` |
| D-3 | LOW | Load transition | `SkeletonDashboard` renders 5 KPI placeholders in an `auto-fill` grid; real dashboard shows 3 in `md:grid-cols-3`. Column/card-count shift on load→loaded. | Skeleton mirrors real layout. | S | no | `Skeleton.jsx:43-58`; `DentalDashboard.jsx:274` |
| D-4 | MED | Stats fetch failure | Error fires a toast then renders the same 0/empty body as a legit empty clinic; no inline retry. | Inline error + Retry on the body. | M | no | `DentalDashboard.jsx:155-163,386-394` |
| D-5 | LOW | Hero greeting | `myFullName` starts `''` → brief "Good morning, there"; honorific stripper only handles "Dr."/"د.". Test account → "Good morning, Test". | Hold/skeleton name until profile resolves. | S | no | `DentalDashboard.jsx:70-105,207-264` |
| D-6 | ✅ | Appointment status | Per-row optimistic update with single-row revert + localized failure toast; good "No appointments today" CTA; doctors section hidden when empty. Genuinely good. | — | — | no | `DentalDashboard.jsx:188-205,331,386-395` |
| D-7 | POLISH | Date label | `today`/`greetingKey` recompute each render but `dateLabel` memoized on `[lang]` only; won't refresh across midnight. Irrelevant to demo. | — | S | no | `DentalDashboard.jsx:207-214` |

---

### 3. Sidebar / Branding

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| S-1 | MED | Header on load | Branding header swaps `t.appName`+tagline → org name + cyan "VELO" pill once `orgSettings` loads (init/reset to `{}`). Title visibly flickers "Velo" → "Le Royal" every sign-in/page-load. | Skeleton org name; avoid the swap. | S | **yes (DB-11, minor)** | `App.jsx:846-855,539` |
| S-2 | MED | Long org name | Org title is single-line `truncate` in ~150px text area at 19px extrabold, **no `title`/tooltip**. "Le Royal" fits; longer Arabic clinic names hard-truncate with no reveal. | Add `title={orgSettings.name}`; verify Arabic length. | S | needs runtime test | `App.jsx:846-855,820-822` |
| S-3 | LOW | Mobile header logo | Hardcoded hex (`#ECFEFF/#CFFAFE/#0891B2/#0A2540`) instead of `--velo`/`accent-cyan` tokens (desktop uses tokens). Token-drift risk. | Use accent-cyan tokens. | S | no (mobile) | `App.jsx:935-941` vs `843-850` |
| S-4 | ✅ | Nav / collapse / avatar | `data-active`+`aria-current`, localized collapse `aria-label` with RTL-flipped chevron, deterministic avatar gradient + online dot. Solid. | — | — | no | `App.jsx:859-931` |

---

### 4. Patient List / Create / Profile Overview

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| P-1 | HIGH | Create patient validation | `handleSubmit` silently `return`s on empty Name/Phone — no field error, no toast, no focus, no required-asterisk. The real toast in `addPatient` is unreachable (modal guard returns first). | Inline field errors (the `ui/Input` supports `error`) + focus + required markers. | M | **yes (DB-4)** | `App.jsx:1579-1581,669-676,1612-1617` |
| P-2 | HIGH | Create patient email | `type="email"` but no `<form>` wrapper and a plain `onClick` Save → native validation never runs; no format check; "abc" saved to DB. | Validate email before save. | S | no | `App.jsx:1618-1620,1579-1593` |
| P-3 | MED | Profile overview | **PR #43 "cyan VELO tag" not found** in the patient header/overview. All other PR #43 targets present & correct (lighter `font-medium` name, `tone="strong"` card, gradient tab underline, uppercase labels, "Not specified" empty state, hover-pill back link). | Confirm whether the VELO tag was intended here or the memory note is stale. | S | no | `App.jsx:1763-1829` |
| P-4 | MED | DOB display | Raw stored string ("1990-05-14") in list row, header chip, and overview field; no locale format, no age. Appointments tab *does* use `toLocaleDateString` — inconsistent within one profile. | Format DOB; consider age. | S | no | `App.jsx:1458,1795,1902` vs `1927` |
| P-5 | MED | "My patients" + search | Search filters the in-memory **paginated page** only; a match on an unfetched page → false "No matching patients." `countLabel` shows server total while searching. | Server-side search, or signal "loaded patients only." | M | needs runtime test | `App.jsx:1305-1314,1337-1341,1489-1504` |
| P-6 | MED | My-patients empty state | When the My-patients filter is ON and the doctor has 0 assigned, it shows "No patients yet / Add your first patient" — misleading; org may be full. | "No patients assigned to you" + "Show all." | S | no | `App.jsx:1406-1426` |
| P-7 | LOW | Save button state | No disabled/pending state; relies on optimistic insert + modal close. On failure the optimistic row appears then vanishes (confusing on flaky network). | Disable while saving or keep modal open until confirmed. | S | needs runtime test | `App.jsx:1640-1643,695-707` |
| P-8 | LOW | Form primitives | List search uses polished `ui/Input`; patient form uses raw `<input style={inputStyle}>` via `FormField` with no error affordance. Two input languages in one feature. | Migrate form to `ui/Input`/`ui/Select`. | M | no | `App.jsx:1373-1380` vs `1611-1638` |
| P-9 | LOW | Primary-doctor selector | `listDoctorsInOrg()` failure swallowed (`.catch(() => {})`); dropdown shows only "— Unassigned —" with no explanation. | Surface load failure; partly mitigated by defaulting to current doctor. | S | needs runtime test | `App.jsx:1570-1577` |
| P-10 | LOW | RTL row subline | Phone/email subline hardcoded `dir="ltr"` (correct for those), but non-Latin email local-parts stay LTR. | RTL completeness review. | S | no | `App.jsx:1451-1455` |
| P-11 | POLISH | List DOB column | Bare right-aligned date with no column header/label floats next to the name. | Label it or drop it. | S | no | `App.jsx:1457-1459` |
| P-12 | POLISH | Overview sparseness | Overview is one card repeating the six header fields; no last-visit / next-appointment / balance / treatment summary at a glance. | At-a-glance snapshot cards. | L | no | `App.jsx:1892-1913` |

---

### 5. Dental Chart (centerpiece)

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| C-1 | HIGH | Recent findings — surface label | List prints raw DB surface `{e.surface}` (`capitalize`) → "Occlusal" for an **anterior** tooth, while the wedge & modal correctly relabel it "Incisal." Chart and list directly contradict each other. | Map anterior center → "Incisal" using `surfaceLayout`. | S | no | `DentalTabs.jsx:617` vs `449-452`; `toothSurfaces.js:59` |
| C-2 | HIGH | Recent findings — Arabic | Surface chip renders the English enum ("mesial", "buccal") untranslated even in Arabic, though `SURFACE_LABELS` has the Arabic terms. | Use `SURFACE_LABELS` for AR. | S | no (yes if AR demo) | `DentalTabs.jsx:617`; `toothSurfaces.js:24-31` |
| C-3 | MED | Add-finding modal title | Title hardcodes raw FDI (`Tooth #16`), ignoring the user's Palmer preference shown everywhere else. | Use `<ToothLabel notation>` in title. | S | no | `DentalTabs.jsx:644` |
| C-4 | MED | Empty chart affordance | Fresh chart is an all-grey 32-tooth grid; wedges have grey idle stroke, cyan only on hover. No first-time "click a surface" cue except the legend paragraph. | Idle affordance / inline empty hint near the chart. | S | no | `ToothSurfaces.jsx:28`; `DentalTabs.jsx:545-549` |
| C-5 | MED | Wedge hit targets | Center occlusal polygon ≈14×14px rendered (`maxWidth:46`); outer trapezoids taper to slivers at corners. Fiddly on small anteriors / projector / touch. | Verify at demo resolution; consider larger SVG/min cell. | M | needs runtime test | `toothSurfaces.js:35-41`; `ToothSurfaces.jsx:64` |
| C-6 | MED | First-paint role resolution | `useMyRole` + `useMyToothNotation` each fire a **separate** `fetchMyProfile()`; until role resolves `canEdit=false` → brief read-only window where doctor clicks do nothing. | Share one profile fetch; gate on role-resolved. | M | no | `DentalTabs.jsx:65-75`; `useMyToothNotation.js:12-18` |
| C-7 | MED | Recent findings cap | `entries.slice(0,12)` with no count/"show more"; full-mouth session (20+) silently hides older entries while wedges still reflect all → list/chart disagree on completeness. | Show "12 of N" / pagination. | S | no | `DentalTabs.jsx:599` |
| C-8 | LOW | Finding ordering | Query sorts `recorded_at DESC` but only `created_at` is indexed (both default `now()`, so identical today). | Index `recorded_at` or sort indexed column. | S | no | `dental.js:255`; `schema.sql:469` |
| C-9 | LOW | Finding colors | All 10 styles present & schema-consistent. Wear `#78350f` is near-black at 14px (confusable with Root Canal `#1e40af`); Healthy bg `rgba(255,255,255,0.04)` is invisible on white (legend chip near-empty). | Lighter Wear; faint visible Healthy chip. | S | no | `DentalTabs.jsx:347-350` |
| C-10 | LOW | Fracture+Wear (PR #41) | Logic correct & consistent across schema enum / `SURFACE_REQUIRED_FINDINGS` (server-enforced) / form mirror / `WHOLE_TOOTH_FINDINGS`. Nit: switching to Fracture while surface="Whole tooth" silently resets surface with no hint. | Optional micro-hint on auto-clear. | S | no | `dental.js:58,279`; `DentalTabs.jsx:461-473,682` |
| C-11 | LOW | Divider visibility (PR #42) | Wedge stroke `#64748b` 1.5 got the WCAG bump (good). The jaw-separating rule `bg-navy-100/80` did **not** — faint on white, in both chart and MiniToothChart. | Darken jaw divider to match. | S | no | `ToothSurfaces.jsx:98-99` vs `DentalTabs.jsx:570`; `MiniToothChart.jsx:64` |
| C-12 | ✅ | Palmer round-trip | `fdiToPalmer` validated; `ToothLabel` brackets keyed by quadrant, intentionally NOT mirrored under RTL; storage stays FDI; aria-labels carry quadrant + FDI. Correct. | — | — | no | `toothNotation.js:31-39`; `ToothLabel.jsx:22-72` |
| C-13 | ✅ | RTL chart orientation | Arch pinned `dir="ltr"` so anatomy never mirrors (correct dental convention, well-commented). | — | — | no | `DentalTabs.jsx:565-571`; `ToothSurfaces.jsx:18` |
| C-14 | POLISH | Recent findings row | When `recorded_by` is null → "· Unknown"; with long note + timestamp the flex row can collide ≤768px (no wrap defined). | Verify at 375px; allow wrap. | S | needs runtime test | `DentalTabs.jsx:602-620` |
| C-15 | POLISH (backlog) | Missing + surface finding | Documented backlog: marking a tooth Missing shows the whole-tooth tint (correct) but the Recent list still lists the earlier surface finding → contradictory "Missing + Cavity on tooth 16" **only if that exact sequence is performed live.** | (Backlog) clear/block surface findings under whole-tooth. | M | no (sequence-dependent) | `toothSurfaces.js:83-107`; `DentalTabs.jsx:599-633` |

---

### 6. X-rays

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| X-1 | HIGH | Lightbox click | Image is `pointer-events-none`; container `onClick` closes when target===container at scale 1. So a single click **on the radiograph** closes the lightbox. Touch users especially lose the viewer. | Close only on the dark margin/backdrop, not the image. | M | **yes (DB-1)** | `XrayLightbox.jsx:215,221,230` |
| X-2 | HIGH | Upload rejection | `addFiles` filters to `ACCEPT_MIME` then `if (!incoming.length) return` — drops PDFs/DICOM/**HEIC** silently, no toast. | Toast on all-rejected; count partial rejections. | S | **yes (DB-2)** | `XrayUploadModal.jsx:42-43` |
| X-3 | MED | Double-click | `onDoubleClick={reset}` always resets; standard viewer UX is double-click to *zoom in*. Does nothing at 100%. | Toggle fit↔2x at click point. | S | no | `XrayLightbox.jsx:214` |
| X-4 | MED | Size validation | Only MIME checked at add-time; 25 MB cap enforced only at submit (`xrays.js:195`). A 40 MB pano sits happily in the tray, then fails after metadata entry. | Reject/flag oversize at add-time. | S | no | `XrayUploadModal.jsx:41-51`; `xrays.js:195-197` |
| X-5 | MED | Batch progress | Sequential `await` loop; only feedback is the "Uploading…" button. No per-file/"3 of 10" progress; tiles update once after the whole loop. Batch looks frozen. | Incremental per-tile status + counter. | M | no | `XrayUploadModal.jsx:71-82` |
| X-6 | MED | Upload modal a11y | Shared `Modal` has no focus trap, no autofocus, no Esc (overlay-click only). Tab escapes behind the modal. | Trap focus, autofocus, Esc-to-close. | M | no | `shared.jsx:48-56`; `XrayUploadModal.jsx:107` |
| X-7 | MED | Delete confirm focus | `ConfirmDialog` doesn't grab focus or trap; lightbox Tab-trap collects sidebar buttons behind the confirm. | Confirm grabs & traps focus. | M | no | `XrayLightbox.jsx:82-87,288-296`; `ConfirmDialog.jsx:3-42` |
| X-8 | MED | Delete double-fire | Confirm button not disabled while `deleting` (only label changes); second click re-calls `deleteXray` on a deleted row → spurious "Delete failed" toast. | Disable Confirm while deleting. | S | no | `XrayLightbox.jsx:159-173,288-296` |
| X-9 | LOW | Retry button | On image-load error, Retry shows no intermediate loading state. | Brief loading state. | S | no | `XrayLightbox.jsx:237-242` |
| X-10 | LOW | Stale filter | If you filter to a type then delete its last item, the chip vanishes but `filter` stays → empty grid, no chips highlighted, no "no results." | Reset to 'all' when active type leaves `presentTypes`. | S | no | `XrayGrid.jsx:46,52-56,93-103` |
| X-11 | LOW | File-cap toast | Over-cap check uses stale closure `items.length`; counts type-valid files only (compounds X-2). Slice cap itself is correct. | Compute from authoritative `prev.length`. | S | no | `XrayUploadModal.jsx:46-50` |
| X-12 | LOW | Undated sort | `date_taken DESC` → Postgres NULLs sort FIRST, so undated (legacy/GHL) x-rays appear above recent ones. | `NULLS LAST`. | S | no | `xrays.js:271-272`; `XrayGrid.jsx:57-65` |
| X-13 | ✅/LOW | Role gating | `canEdit` with `roleLoading` guard prevents flashing; Upload hidden (not disabled) for receptionists; copy is appropriate. Correct. Nit: no "read-only" hint on a populated grid for receptionists. | Optional read-only hint. | S | no | `XraysTab.jsx:14,19,59`; `XrayGrid.jsx:84-102` |
| X-14 | POLISH | Tray placeholder | Pre-thumbnail tiles show a "IMG" text box; a 20-file batch reads as a wall of "IMG". | Pulsing skeleton. | S | no | `XrayUploadModal.jsx:146-148` |
| X-15 | POLISH | MiniToothChart mobile | 16-col grid of min-26px buttons may overflow the 560px modal at 320/375px. | Verify no overflow at 320/375. | S | needs runtime test | `MiniToothChart.jsx:36,47` |
| X-16 | POLISH | Plan load failure | Treatment-plan fetch errors swallowed to console; falls back to generic "Linked"/"None" with no hint. | Tiny "couldn't load plans" note. | S | no | `XrayMetadataForm.jsx:22-28`; `XrayLightbox.jsx:68-74` |

> **Lightbox strengths (no action):** real Tab focus-trap + Esc + arrow keys + focus restore, signed-URL retry-on-expiry, optimistic edit with rollback, EXIF-aware thumbnails, UTC-safe dates.

---

### 7. Appointments tab (patient profile)

> **Architecture note:** this tab is rendered **inline in `App.jsx:1915-1961` as a read-only list**, not in `DentalTabs.jsx`. That split drives the findings below.

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| AP-1 | HIGH | Booking from profile | No "New Appointment"/Add/Edit/status control on the tab; `AddAppointmentModal`/`upsertAppointment` exist but are only wired into the global calendar. | Let the dentist book a follow-up from the patient context. | M | **yes (DB-5)** | `App.jsx:1915-1961`; `AddAppointmentModal.jsx:70` |
| AP-2 | HIGH | Row content | Status is display-only `<Badge>`; doctor not shown; no upcoming/past split; no inline status progression. | Inline status + assigned doctor (matches sibling tabs). | M | no | `App.jsx:1938-1955` |
| AP-3 | MED | Load error | Catch logs to console only → `appointments=[]` → user sees the empty state on error. No toast. Violates the repo "never silent-catch" rule. | Distinct error state + retry. | S | no | `App.jsx:1715-1718` |
| AP-4 | MED | Add Appointment modal — Arabic | Entire modal hardcoded English + forced `dir="ltr"`; no translations anywhere (title, labels, option labels, "No doctors found"). | EN+AR/RTL parity. | M | **yes (DB-9, Arabic)** | `AddAppointmentModal.jsx:199,203,285,301-343,12-31` |
| AP-5 | MED | Time validation | Time `<select>` has an empty option while `time` defaults to "10:00"; clearing it → single generic banner, no field highlight. | Field-level validation. | S | no | `AddAppointmentModal.jsx:166-167,318-321` |
| AP-6 | LOW | Link to treatment | Confirmed not implemented: `appointments` has no `treatment_plan_id` (though `payments` does — asymmetry may surprise). | (Feature gap, flag only.) | L | no | `schema.sql:228-240` vs `304` |

---

### 8. Treatment Plan tab

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| T-1 | HIGH | Link to chart findings | Line items are fully manual free-text (tooth typed by hand, generic surface dropdown, free-text procedure). No picker pulls existing chart findings → re-keying risks mismatch. | "finding → propose treatment" continuity. | L | no (works, manual) | `DentalTabs.jsx:1106-1163`; `schema.sql:261-278` |
| T-2 | MED | Silent row drop | Rows kept only if `procedure_label` non-empty; a row with tooth + amount but blank procedure is silently dropped, no warning. | Warn/validate before dropping. | S | no | `DentalTabs.jsx:1027-1032` |
| T-3 | MED | Mixed currency | Items can carry their own currency (`item.currency || plan.currency`) but totals sum in `plan.currency` only → import-sourced mixed-currency plans mis-total. | Guard mixed-currency sums. | M | no | `DentalTabs.jsx:858,926`; `dental.js:405` |
| T-4 | LOW | Status color | `in_progress` uses purple `#8b5cf6` inline (plan + item) — off-palette, no `--velo` purple token (initiative shifted purple→blue elsewhere). | Token-based status colors. | S | no | `DentalTabs.jsx:741-754` |
| T-5 | LOW | Empty/error parity | Empty + loading handled; load error shows a toast **and** falls through to empty state. Acceptable. | — | S | no | `DentalTabs.jsx:772-777,835-838` |
| T-6 | POLISH | RTL table | Header alignment flipped via `textAlign` ternary; data cells use `px-3.5` without dir-aware alignment (numbers `tabular-nums`, good). Could drift. | dir-aware cell alignment. | S | no | `DentalTabs.jsx:897-949` |

---

### 9. Prescriptions tab

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| RX-1 | HIGH | Print availability | List Print button hard-disabled unless `rx.doctor.prescription_template_url` set; the **"print on pre-printed pad" fallback in the modal is unreachable** because you can't open the modal. | Allow opening the modal sans template to reach the fallback. | S | **yes (DB-6)** | `DentalTabs.jsx:1272,1286-1294` vs `1798-1806` |
| RX-2 | HIGH | Print overlay position | Hardcoded `%` offsets (patient `27%`, meds `33%/27%`, general `73%`, margins `16mm`) tuned to an assumed template; may overlap Dr. Saif's letterhead. | Tune against the real pad (CSS) / per-template config. | M / L | **yes (DB-7)** | `index.css:456-458,425-428` |
| RX-3 | MED | Template cache | Documented backlog: template uploaded in Settings while a PrescriptionsTab is open elsewhere → stale value until hard refresh. | Focus-refetch / Refresh button. | M | no | `DentalTabs.jsx:1272`; `prescriptions.js:216` |
| RX-4 | MED | No doctor-role user | Doctor dropdown filters `role==='doctor'` only (owners excluded); if the only prescriber is an owner, dropdown is empty and you can't save. Error "Please select a doctor" gives no hint. | Allow owner-prescribers or clear message. | S | **yes if demo logs in as owner-only** | `DentalTabs.jsx:1432-1436,1451-1453` |
| RX-5 | MED | Print header completeness | Header shows only name + date; fetched `dob`/`gender` unused; no age, no prescriber name/signature line in the overlay. | Render age/sex + signature line. | S | no | `DentalTabs.jsx:1758-1767`; `prescriptions.js:417` |
| RX-6 | LOW | Print RTL | Preview dir-aware but "Rx" symbol/structure LTR-fixed; verify meds-list `paddingInlineStart` bullet placement in Arabic. | Runtime RTL check. | S | no | `DentalTabs.jsx:1768-1787` |
| RX-7 | POLISH | Disabled tooltip | Print-disabled guidance only via `title=` tooltip — invisible on touch/iPad (common in clinics). | Visible affordance. | S | no | `DentalTabs.jsx:1286-1294` |

---

### 10. Documents tab

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| DOC-1 | MED | Multi-file errors | Only the FIRST error is surfaced; if 3 of 5 fail for different reasons, user sees one generic message + success toast for the rest. | Per-file / counted failure reporting. | S | no | `DentalTabs.jsx:1899-1924` |
| DOC-2 | LOW | View vs Download | "View" opens signed URL in a new tab for all types; .docx/.xls download instead of render → View and Download behave identically for Office files. | Relabel/hide View for non-inline types. | S | no | `DentalTabs.jsx:1940-1957,2085-2102` |
| DOC-3 | ✅ | Delete confirm | Proper confirm Modal with destructive button + "cannot be undone." Correct. | — | S | no | `DentalTabs.jsx:2121-2136` |
| DOC-4 | LOW | Upload progress | Generic "Uploading…" label, no per-file progress; 25 MB on a slow line looks frozen. | Progress/spinner with file name. | M | no | `DentalTabs.jsx:2001-2005` |
| DOC-5 | LOW | Type/size feedback | Client validates MIME + 25 MB with clear messages (good), but drag-drop of disallowed types bypasses the `accept` whitelist → server fails via the generic-first-error path. | — | S | no | `DentalTabs.jsx:1899-1937`; `documents.js:124-129` |

---

### 11. Settings

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| SET-1 | HIGH | Profile → Language → Save | Save persists `locale` to DB but never calls app-level `setLang`; app language is driven by `localStorage.velo_lang`. Pick "العربية" → "Profile saved" toast → **UI stays English.** | Saving Arabic should flip the app (or on reload). | M | no (likely tried live) | `SettingsPage.jsx:356-364,305-316`; `App.jsx:162,266-270` |
| SET-2 | HIGH | Organization → Save | Form holds `industry, primary_color, currency, timezone, name` but `sanitizeOrgUpdate` whitelists only `name/slug/timezone/locale/currency/operator_notes`. **`industry` + `primary_color` silently dropped** (no columns). Shows "Saved!", resets on reopen. | Persist or remove the controls. | M | no | `SettingsPage.jsx:137-150`; `orgs.js:8-9,19-28` |
| SET-3 | HIGH | Integrations tab | WhatsApp wizard / Meta / Gmail inputs → Save passes `whatsapp_*`/`gmail_email`/`meta_access_token`, **all dropped** by `sanitizeOrgUpdate`. Shows "Saved!"; banner even says manage from the Integrations *page*. "Test Connection" hits graph.facebook.com with an un-persisted token (CORS/fail). Elaborate fake. | Gut like Billing, or wire to `org_secrets`. | L | no — **don't open live** | `SettingsPage.jsx:1078-1095,1141-1143,1252-1262` |
| SET-4 | MED/HIGH | AI Agent tab | Save passes `ai_personality/knowledge_base/channels/hours/...` — all dropped; KB uploads go to `localStorage` only; "Test AI" needs a server proxy. Mostly non-persisting. | Persist or scope honestly. | L | no — **don't open live** | `SettingsPage.jsx:849-863,1050-1059` |
| SET-5 | MED | "Saved!" inconsistency | Org/Notifications/AI/Integrations flip a button to "Saved!" for 2s; Profile/Team/Clinic use real toasts. Org/AI/Integrations can show "Saved!" *and* a "Failed to save" error toast simultaneously. | One consistent, truthful feedback mechanism. | M | no | `SettingsPage.jsx:147-150,697-701,849-852,1092-1095`; `App.jsx:740-750` |
| SET-6 | MED | Industry dental-mode note | "Dental mode active" only shows when `industry==='dental'`, but industry is never loaded (no column) and defaults `'general'` with no control to set it → dead conditional, never appears for the real clinic. | Drive from a real signal or remove. | S | no | `SettingsPage.jsx:137-143,225-234` |
| SET-7 | MED | Avatar inconsistency | Clinic tab DoctorForm has a working "Avatar URL" text field (persists), but ProfileTab shows a disabled "Photo upload coming soon." Contradictory. | Consistent avatar handling. | S | no | `SettingsPage.jsx:334-340,1810-1816` |
| SET-8 | MED | Team tab error/demo | Load error logs only → empty "Team Members 0" card, no explanation. Demo mode shows `SAMPLE_TEAM` (incl. "owner@velo.app") → fake teammates leak if Supabase unconfigured. | Graceful error; ensure Supabase configured for demo. | S | no (env-dependent) | `SettingsPage.jsx:44-49,437-468` |
| SET-9 | LOW | Invite copy fallback | If `clipboard.writeText` throws (non-HTTPS), it selects the input but no toast and Copy never flips to "Copied!". | Toast "Press Ctrl+C"; ensure HTTPS origin. | S | no | `SettingsPage.jsx:507-517` |
| SET-10 | LOW | Notation auto-save | Tooth-notation auto-saves on toggle while name/language wait for the Save button; no cue it auto-saved. | "Saves instantly" hint. | S | no | `SettingsPage.jsx:284-303` |
| SET-11 | LOW | Too many half-working tabs | A clinic owner sees 9 tabs; Org/AI/Integrations partially/entirely non-persisting alongside honest Billing/API notices → reads as "half of settings is broken." | Trim/mark non-persisting tabs. | M | no | `SettingsPage.jsx:21-32` |
| SET-12 | ✅/POLISH | Gutted notices | Billing ("managed by your agency"), API Keys, Agency-AI notices read cleanly in EN+AR. Confirm "SupCod3" is the intended client-facing agency name. | Confirm brand string. | S | no | `SettingsPage.jsx:746-825,1310-1339` |
| SET-13 | LOW | Arabic/RTL | Settings use inline `lang==='ar'?…` ternaries (not `t.*`); coverage looks complete, logical props flip cleanly. Spot-check the WhatsApp step rail `ps-[38px]` indent in RTL. | Runtime visual pass. | S | needs runtime test | `SettingsPage.jsx:62,1135` |

---

### 12. Operator Console

| ID | Sev | Step | Observed | Expected | Scope | Demo-blocker | Evidence |
|----|-----|------|----------|----------|-------|--------------|----------|
| OP-1 | HIGH | Row click | The **entire org row** `onClick` enters/impersonates that client (no confirm); only the Actions cell `stopPropagation`s. A mis-click during a live demo drops into another clinic's data. | Restrict enter to an explicit button / add confirm. | M | no (high mis-click risk) | `OperatorConsole.jsx:319-330,361-366` |
| OP-2 | MED | Suspend/Activate | Fire immediately, **no confirm** (only Delete confirms), and no loading/disabled state during the `/api/admin` call → duplicate-request risk, no feedback. | Confirm + in-flight disable/spinner. | M | no | `OperatorConsole.jsx:71-90,368-378` |
| OP-3 | MED | Delete button state | Delete-confirm button has no in-flight/disabled state; awaits before closing → repeat clicks fire multiple deletes. | Disable + "Deleting…". | S | no | `OperatorConsole.jsx:92-112,516-521` |
| OP-4 | MED | Demo-mode destructive | Un-configured Supabase → updateStatus/delete mutate local state with green success toasts; destructive actions look real on fake data. | Make demo-mode actions clearly non-persisting. | S | no (env-dependent) | `OperatorConsole.jsx:71-112,396-406` |
| OP-5 | MED | Add Org without invite | Success modal only opens when `result.invite?.url` exists; if no invite (blank admin_email, which isn't required) the owner gets no onboarding link and no way to retrieve it. | Always surface invite / require email / per-row "copy invite." | M | no | `OperatorConsole.jsx:114-160,430-438` |
| OP-6 | MED | Fetch error → fake orgs | On a production `orgs` fetch error the catch falls back to `SAMPLE_ORGS` (6 fake clinics) with no error indicator — operator could Suspend/Delete "Justice Partners LLP". | Show error/empty, never fall back to samples when configured. | S | no | `OperatorConsole.jsx:45-67,15-22` |
| OP-7 | LOW | MRR card | "Revenue (MRR)" is a hardcoded `$—` next to real counts → looks unfinished. | Wire up or remove. | S | no | `OperatorConsole.jsx:248` |
| OP-8 | LOW | Deleted filter | Optimistic delete removes the row, but the "Deleted" filter option then can't show it without refetch → partly non-functional for same-session deletes. | Decide hard vs soft delete; make filter consistent. | S | no | `OperatorConsole.jsx:92-112,277-286` |
| OP-9 | LOW | Theme flip | Operator pages are hardcoded dark (`#07080E`/`#0C0E1A`, raw hex) vs the light app — jarring on navigation (aligns with the known raw-hex debt cluster). | Future tokenization. | L | no | `OperatorConsole.jsx:192`; `ClinicCredentials.jsx:113-124` |
| OP-10 | ✅ | Gating | `isOperator` fail-closed self-select; console rendered only when `isOperator && !impersonation`; non-operators routed away; ClinicCredentials hard "Forbidden." Normal users (Dr. Saif) never see it. Correct. | — | S | no | `OperatorContext.jsx:40-61`; `App.jsx:584-594,1076` |
| OP-11 | ✅ | ClinicCredentials | Full AR strings + `dir`, RTL table alignment, secrets forced LTR, proper loading/error/empty + Save-disabled-while-saving. Solid. | — | S | no | `ClinicCredentials.jsx:12,140-151,274-275,305-323` |

---

### 13/14. Cross-cutting

- **XC-1 (MED):** All four patient-profile tabs derive edit gates from `fetchMyProfile()` directly (`DentalTabs.jsx:65-75`), **not impersonation-aware** — under operator impersonation UI affordances may reflect the acting (not effective) user. RLS is the real boundary, but verify edit buttons match the effective role during an impersonated demo. Scope M.
- **XC-2 (LOW):** `searchPatientsForAppointment` interpolates the sanitized query into a PostgREST `.or()` ILIKE filter; `%`/`,`/`(` in a name could distort the filter. RLS-scoped/read-only → low risk. Confirm `sanitizeText` strips PostgREST metacharacters. `appointments.js:236-248`. Scope S.
- **XC-3 (LOW):** Shared `Modal` (`shared.jsx:48-56`) — used by X-ray upload, patient form, etc. — has **no focus trap / autofocus / Esc**. A single fix improves several flows (see X-6). Scope M.

---

## Recommended pre-demo punch list (by effort, demo-blockers first)

**Quick wins (Scope S, high demo payoff):**
1. DB-3 / D-1 — gate dashboard render on `dbData.loading` (stop the empty flash).
2. DB-2 / X-2 — toast when upload files are rejected (HEIC).
3. DB-6 / RX-1 — let the print modal open without a template so the pre-printed fallback is reachable.
4. DB-8 / A-1 — map common Supabase auth errors to localized strings.
5. DB-10 / A-8 — recolor the cold-start loader to the navy/cyan brand.
6. DB-11 / S-1 — skeleton the sidebar org name to kill the "Velo → Le Royal" flicker.

**Medium (Scope M):**
7. DB-1 / X-1 — restrict lightbox click-close to the backdrop, not the image.
8. DB-4 / P-1 — inline validation + focus on the patient form.
9. DB-5 / AP-1 — add a "New Appointment" entry point on the patient profile.
10. DB-9 / AP-4 — translate the Add Appointment modal.

**Verify-at-runtime before going live:** the 7 items in the Executive Summary's runtime list — especially the demo doctor's `prescription_template_url`, print on the real pad (DB-7), and whether Supabase is configured (sample-data leakage).

**Rehearse-around (don't fix, just avoid):** Settings → Integrations & AI tabs (SET-3/SET-4, silent discard); Operator Console row-click impersonation + no-confirm Suspend (OP-1/OP-2) if shown live.
