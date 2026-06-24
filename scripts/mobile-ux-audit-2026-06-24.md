# Mobile UX Audit — Velo Dental (V1.5 responsive pass)

**Phase 1, read-only diagnostic. No fixes.** Date: 2026-06-24.
**Targets:** iPhone Safari (after-visit notes, quick checks) + iPad Safari (chairside use by all 4 Saif doctors). Built desktop-first.
**Method:** hybrid — code-level audit (this doc, Part A) maps theoretical issues; Ali confirms with real devices (Part B test plan). Breakpoint convention: **768px** (`App.css:74`, `App.jsx:193` `isMobile = innerWidth < 768`).

Evidence: full read of the chairside dental/X-ray components, the app shell + critical flows, the admin surfaces, and the global CSS. File:line citations throughout.

---

## Executive summary

**Severity counts (deduped):** CRITICAL **1** · HIGH **8** · MEDIUM **9** · LOW **6**.

### ✅ Already done right — do NOT rebuild these
The shell is more mobile-ready than feared:
- **Sidebar → off-canvas bottom-nav + drawer.** Desktop `.desktop-sidebar` is hard-hidden at ≤768px (`App.css:76`); a fixed 4-item bottom nav + slide-up "More" drawer renders when `isMobile` (`App.jsx:1091–1153`). Not a shrunk sidebar, not a hamburger.
- **Modals → full-width bottom sheets.** `.modal-overlay`/`.modal-content` (used by `shared.jsx Modal` + the inline `App.jsx Modal`) become `width:100%`, `border-radius:14px 14px 0 0`, `max-height:85vh` at ≤768px (`App.css:80–85`). So hardcoded `width={…}` props are desktop-only.
- **Tables → horizontal scroll.** Global `table { display:block; overflow-x:auto; white-space:nowrap }` at ≤768px (`App.css:87–88`) keeps every table from breaking layout.
- **X-ray lightbox pinch/pan is correct** — `useZoomPan` uses Pointer Events with `touch-action:none` (`XrayLightbox.jsx:220`, `useZoomPan.js:55–86`); double-tap-reset works. The one fully touch-native feature.
- **Other wins:** `XrayMetadataForm` restacks (`grid-cols-1 md:grid-cols-2`), `XrayGrid` auto-fills, the patient-profile 10-tab bar scrolls (`overflow-x-auto`), the booking flow uses native `<input type=date>`/`<select>` pickers, FinancePage is fully responsive.

### 🚑 The three headline problems
1. **🔴 CRITICAL — the dental chart is unusable by touch.** The 5-wedge SVG caps at `maxWidth:46` in a 16-tooth row; on iPhone (~375px) each tooth renders ~13px wide → **center occlusal wedge ≈ 4px**, outer wedges ~5–8px. Even on iPad it caps at ~14px center. iOS minimum is 44pt. A gloved fingertip cannot reliably hit a 4px target → **mis-taps record findings on the wrong surface (clinical-data integrity risk)**. This is the one item needing an interaction redesign, not a Tailwind tweak (see Scope flag).
2. **🟠 HIGH, app-wide, cheapest fix — iOS input focus-zoom.** `body` is 14px (`index.css:353`) and every input/select/textarea is 14px (`shared.jsx:70 inputStyle`, `ui/Input.jsx:58`, `ui/Select.jsx:48`). iOS Safari auto-zooms the viewport on focus of any sub-16px field and doesn't cleanly zoom back — so **every** field tap (sign-in, patient search, booking, every clinical form) jolts the view. One global rule fixes it everywhere.
3. **🟠 HIGH — clinical form line-items collapse on mobile.** The treatment-plan and prescription **line-item grids use fixed-px columns that never restack** (`grid-cols-[60px_90px_1fr_110px_32px]`, and a 6-col Rx grid) — inside the mobile bottom sheet the flexible fields squeeze to ~20–50px. Prescription writing is chairside-critical.

### Triage headline
Almost everything except the chart (CRITICAL) and the HEIC trap is a **bounded responsive pass fittable in V1.5 Week 3**. The chart interaction redesign is the scope decision (V1.5 vs V1.6) — see below.

---

## Part A — Code-level findings

### Cluster 1 — Dental chart (chairside-critical, hardest)

| ID | Finding | Sev | Effort | Proposed fix |
|----|---------|-----|--------|--------------|
| **M-01** | **Wedge tap targets ~4px (iPhone) / ~14px (iPad)** — `ToothSurfaces.jsx:64` `maxWidth:46`; 16-col arch `gap-1.5` (`DentalTabs.jsx:567,571`). Center occlusal wedge = 30% of tooth width. | **CRITICAL** | **L** | **Mobile interaction redesign:** tap a tooth → open a per-tooth sheet listing the 5 surfaces as full-width ≥44px rows (reuse the add-finding Modal). Decouples hit-target from the 16-across arch. *Or* enlarge `maxWidth`→64 + wrap each arch in `overflow-x-auto` with `min-w-[64px]` per cell + add an invisible larger center hit polygon. |
| M-02 | **Wedge "which surface" cue is hover/`<title>`-only** (`ToothSurfaces.jsx:31` `hover:[stroke…]`, `:91` `<title>`) — no feedback on touch. | HIGH | S | Add `active:[stroke:#06b6d4]`; rely on the modal/detail-sheet (M-01) to name the surface. Drop `<title>` reliance for touch. |
| M-03 | **Whole-tooth entry is the ~10px tooth-number label** (`ToothSurfaces.jsx:113–123`) — only way to record missing/crown/implant. | HIGH | S | `min-h-[44px] min-w-[44px] inline-flex` on mobile, or fold a "Whole tooth" row into the M-01 sheet. |
| M-04 | **Recent-findings row packs 7 inline items on one line** (`DentalTabs.jsx:604–631`), only notes truncate → crushes on phone. | MEDIUM | S | `flex-col md:flex-row`: line 1 tooth+finding+delete, line 2 surface·notes·when·recorder. |

### Cluster 2 — X-rays (chairside-critical)

| ID | Finding | Sev | Effort | Proposed fix |
|----|---------|-----|--------|--------------|
| **M-05** | **Upload rejects iPhone-default HEIC** — `XrayUploadModal.jsx:14` `ACCEPT_MIME` excludes heic; "Take Photo" on iOS yields HEIC → rejected toast. Chairside trap. | **HIGH** | XS–M | Add client-side HEIC→JPEG (e.g. `heic2any`, new dep), OR add a dedicated "Take photo" `<input capture="environment">` + make the rejection toast name the iOS "Most Compatible" camera setting. (Tap-to-pick fallback already exists, `:133`.) |
| M-06 | Lightbox controls 32px — zoom −/fit/+ + close `w-8 h-8` (`XrayLightbox.jsx:202,250–252`); prev/next `w-10 h-10`. | MEDIUM | XS | `w-11 h-11 md:w-8 md:h-8`. (Pinch mitigates zoom; close/next are primary.) |
| M-07 | Upload thumbnail remove-× is `w-5 h-5` (20px) overlapping the tile corner (`XrayUploadModal.jsx:172`). | LOW | XS | `w-7 h-7`+ and more offset, or move delete below the tile on mobile. |
| M-08 | Rx **print preview** is an mm-unit canvas in a `width={620}` modal (`DentalTabs.jsx:1748–1794`) — overflows on phone; AirPrint-from-phone is plausible. | MEDIUM | S | Scale preview to fit width on mobile (`transform:scale` or `overflow-x-auto` + "preview scaled" note). |
| — | ✅ Lightbox pinch/pan + XrayGrid auto-fill + XrayMetadataForm restack are correct. | — | — | No action. |

### Cluster 3 — Clinical forms & modals

| ID | Finding | Sev | Effort | Proposed fix |
|----|---------|-----|--------|--------------|
| **M-09** | **Treatment-plan & prescription line-item grids are fixed-px, never restack** (`DentalTabs.jsx:1099,1109` `grid-cols-[60px_90px_1fr_110px_32px]`; `:1535,1544` 6-col Rx) → fields ~20–50px in the bottom sheet. | **HIGH** | M | Vertical card per row on mobile: `flex flex-col gap-2 md:grid md:grid-cols-[…]`; each field full-width labeled ≥44px. |
| **M-10** | **MiniToothChart buttons ~17×26px** (`MiniToothChart.jsx:36,47` 16-col `gap-1`, `min-h-[26px]`) — multi-select teeth-shown picker. | HIGH | S | 8-col on mobile (two rows/arch) or `overflow-x-auto` + `min-w-[40px]`; `min-h-[40px]`. |
| M-11 | Plan results table inline status `<select>` is `height:26 fontSize:11` (`DentalTabs.jsx:930`) — sub-44 + worse iOS zoom. | MEDIUM | S | `height:44 font-size:16` on mobile; add a scroll-hint; or card-per-item (with M-09). |
| M-12 | Action/destructive icon buttons `w-7 h-7` (28px) throughout (`DentalTabs.jsx:626,885,1309,2108,2272,2284,2292`); allergy remove-× ~12px (`:220`). | MEDIUM | XS–S | Sweep to `w-11 h-11 md:w-7 md:h-7` on touch; explicit hit area on the allergy ×. |
| — | ✅ Add-finding modal & medical-history form are single-column and restack fine (only need M-13 font). | — | — | No action beyond M-13. |

### Cluster 4 — App-wide / shell / critical non-dental flows

| ID | Finding | Sev | Effort | Proposed fix |
|----|---------|-----|--------|--------------|
| **M-13** | **All inputs + body 14px → iOS focus-zoom** (`index.css:353`; `shared.jsx:70`; `ui/Input.jsx:58`; `ui/Select.jsx:48`). App-wide. | **HIGH** | S | One global rule: `@media (max-width:768px){ input,select,textarea{ font-size:16px } }` (note `theme.css` already has an `!important` input rule but no font-size, so no conflict). Highest leverage / lowest effort. |
| **M-14** | **Global `button { min-height:36px }`** (`App.css:86`, inside the mobile query) sets the touch floor *below* 44pt. | HIGH | XS | Change to `min-height:44px` (or scope icon-button opt-outs). |
| **M-15** | **32px icon buttons app-wide** — patient-row edit/delete pair (`App.jsx:1468,1477`), header notification/avatar (`:959,966`), modal close (`ui/Modal.jsx:113`, `AddAppointmentModal.jsx:209,224`). Edit/delete adjacency on a destructive action. | HIGH | S | `max-sm:w-11 max-sm:h-11`; widen patient-row gap `gap-1`→`gap-2`. |
| **M-16** | **`ui/Modal` does NOT go full-screen on mobile** (`ui/Modal.jsx:80–100`, `max-w-md`, no breakpoint) — the canonical `ui/` modal (Auth operator modal); future heavy content will be cramped. | HIGH | S | `max-sm:items-end` wrapper + `max-sm:max-w-none max-sm:rounded-b-none`; body `px-4 sm:px-6`. |
| **M-17** | **AddAppointmentModal forces 2-col grids inline** (`AddAppointmentModal.jsx:300,313,325` `gridTemplateColumns:'1fr 1fr'`) → Type/Duration, Date/Time collapse to ~155px in the sheet. | HIGH | S | Convert to `className="grid grid-cols-1 sm:grid-cols-2 gap-x-3"` (drop inline grid). |
| M-18 | Patient-search dropdown `max-h-[250px]` absolute (`AddAppointmentModal.jsx:238`) can clip past the bottom sheet; "Add as new patient" CTA unreachable on short viewports. | MEDIUM | S | `max-h-[min(250px,40vh)]` or render inline (push content) on mobile. |
| M-19 | Auth text-link targets small — "Forgot password?" `text-xs` (`Auth.jsx:282`), secondary links line-height-sized. | MEDIUM | XS | `py-2 -my-2` to expand hit area without visual change. |
| M-20 | Header search "pill" shows a `Ctrl+K` `<kbd>` on mobile (meaningless on touch) and competes for width at 375px (`App.jsx:946–951`). | LOW | XS | Collapse to a search icon button on mobile; `hidden` the `<kbd>` at `max-sm`. |
| M-21 | 10-tab profile bar scrolls but has no edge-fade hint and doesn't `scrollIntoView` the active deep tab (`App.jsx:1880–1906`). | LOW | XS | Right-edge fade mask + `scrollIntoView` active tab. Optional. |

### Cluster 5 — Admin / operator (desktop-primary — lower priority per guardrail)

| ID | Finding | Sev | Effort | Proposed fix |
|----|---------|-----|--------|--------------|
| M-22 | **OperatorConsole is 100% fixed inline styles, no breakpoints** (`OperatorConsole.jsx` throughout); table scrolls via the global rule but 32px paddings + non-wrapping title row waste/overflow at phone width. | MEDIUM | XS (banner) / M (responsive) | **Per guardrail: add a `@media(max-width:768px)` "Operator console is optimized for desktop" banner** rather than redesigning. |
| M-23 | **ClinicCredentials modal is hand-rolled** (`ClinicCredentials.jsx:197–225`) — skips the global `.modal-content` bottom-sheet; secrets inputs 14px (`:271`). | HIGH* | S | Swap to shared `Modal` (or add `.modal-overlay/.modal-content` classes); raise input font to 16. *HIGH as a consistency/pattern gap, MEDIUM in business terms (operator-only). |
| M-24 | ClinicCredentials org table wrapper is `overflow:hidden` (`:136`) — relies entirely on the global block-scroll side-effect; can clip last column. | MEDIUM | XS | `overflowX:'auto'` on the wrapper; shorten the long action button to an icon on narrow widths. |
| M-25 | **Settings 220px tab rail never stacks** (`SettingsPage.jsx:70–113` `flex` + `w-[220px] sticky`) → ~120px left for forms on a 360px phone. Settings has user-facing forms (Profile). | MEDIUM | S | `flex-col md:flex-row`; nav `w-full md:w-[220px]`, `static md:sticky`; or horizontal scroll strip on mobile. |
| M-26 | **Dark mobile bottom-nav/drawer on a light-only app** — `App.css:54,66` `background:#0C0E1A`; drawer item colors hardcode dark greys (`App.jsx:1139–1147`). Color-bleed (the mobile analogue of the known token-migration cluster). | MEDIUM | XS | Repoint to `--velo-*` light tokens (surface-raised / text-secondary), matching the desktop sidebar. |
| M-27 | FinancePage payments table scrolls (6 cols) with no card-collapse alternative (`FinancePage.jsx:353`). Acceptable per guardrail. | LOW | M | Optional stacked-card mobile view. |

---

## Part B — Real-device test plan (Ali, iPhone + iPad)

For each row: test on **iPhone Safari** and **iPad Safari**, note anything code analysis can't predict (rendering glitches, timing, real touch feel, RTL). Mark ✅/⚠️/🔴 and add notes.

### Chairside-critical (do these first)
| # | Scenario | What to check | Predicted (code) |
|---|----------|---------------|------------------|
| T1 | **Dental chart — tap individual wedges (iPad)** | Can you reliably hit mesial vs occlusal on a molar AND on a small anterior (11/21)? Count mis-taps in 10 tries. | 🔴 ~14px targets — expect frequent mis-taps (M-01) |
| T2 | **Dental chart — tap wedges (iPhone)** | Same, at phone width | 🔴 ~4px — expect unusable (M-01) |
| T3 | **Add a finding via wedge → modal (iPad)** | Does the add-finding modal feel cramped? Does the surface lock correctly? | Modal restacks OK; only font-zoom (M-13) |
| T4 | **Record a treatment plan with 2 line items (iPhone)** | Can you read/fill Tooth/Surface/Procedure/Amount per row? | 🔴 fields collapse (M-09) |
| T5 | **Write a prescription, 2 drugs (iPad + iPhone)** | Drug/Dosage/Frequency/Duration/Instructions usable? | 🔴 6-col squeeze (M-09) |
| T6 | **X-ray lightbox — pinch zoom + pan + prev/next (iPad)** | Smooth? Does single-tap on the image (not) close it? Are zoom/close buttons hittable? | ✅ pinch/pan good; ⚠️ 32px buttons (M-06) |
| T7 | **Upload X-ray from iPhone — "Take Photo" AND "Photo Library"** | Does a freshly-taken photo upload, or get rejected (HEIC)? Library JPEG? | 🔴 Take Photo → HEIC reject (M-05) |
| T8 | **MiniToothChart — select teeth-shown on the upload form (iPhone)** | Can you toggle individual teeth without mis-tapping neighbors? | ⚠️ ~17×26px (M-10) |
| T9 | **Tap any clinical form field (iPhone)** | Does the viewport zoom in on focus and fail to zoom back? | 🔴 expect zoom on every field (M-13) |

### Doctor / front-desk flows
| # | Scenario | What to check |
|---|----------|---------------|
| T10 | **Sign in (iPhone)** | Keyboard type for email/password; does the card fit; do links (forgot pw) tap easily? (M-13, M-19) |
| T11 | **Open a patient profile (iPhone)** | Can you read all header info; does the 10-tab bar scroll; is the active tab reachable? (M-21) |
| T12 | **Patient list — search + "My patients" toggle + edit/delete a row (iPhone)** | Are the 32px edit/delete buttons mis-tappable side-by-side? (M-15) |
| T13 | **Book an appointment (receptionist, iPad)** | Patient search dropdown reachable; Type/Duration/Date/Time not squeezed; native pickers work? (M-17, M-18) |
| T14 | **Bottom-nav + "More" drawer (iPhone)** | Do all nav targets work; does the dark drawer look right on the light app? (M-26) |
| T15 | **Switch to Arabic / RTL (iPad)** | Chart arch stays LTR (correct); forms/tabs/nav mirror cleanly; no clipping. |
| T16 | **Operator console (iPhone)** | Confirm it's desktop-hostile → validates the "use desktop" banner recommendation (M-22). |

> Ground-truth from devices supersedes code predictions — log anything the code audit missed (e.g. momentum-scroll quirks, Safari 100vh/keyboard-inset bugs, sticky-header overlap, RTL rendering).

---

## Triage — V1.5 mobile pass vs V1.6 / later

**V1.5 (Week 3 responsive pass) — high value, bounded effort:**
- M-13 iOS input font (one rule, app-wide) — **do first**
- M-14 button min-height 44 · M-15 icon-button hit areas · M-12 clinical icon buttons
- M-09 line-item grids restack (plan + Rx) · M-17 AddAppointmentModal grids · M-16 ui/Modal mobile · M-10 MiniToothChart
- M-05 HEIC (at least the `capture` input + clearer toast; conversion if a dep is acceptable)
- M-02/M-03 wedge cue + whole-tooth target · M-04 findings row · M-06 lightbox buttons · M-11 plan-table selects · M-18 search dropdown · M-19 Auth links
- M-22 operator "use desktop" banner · M-23/M-24 ClinicCredentials modal+table · M-25 Settings rail stack · M-26 dark-nav tokens

**Scope decision — M-01 dental chart interaction redesign:** this is the only item beyond a Tailwind pass (a new mobile interaction model: tap-tooth → labeled surface sheet). **Recommendation: build it in V1.5** — chairside iPad is the *primary* reason for the mobile pass, and the chart is the centerpiece; shipping a mobile pass that leaves the chart untappable undercuts the goal. If Week 3 can't absorb the L effort, the fallback is to ship the iPad-workable enlarge+scroll variant (M) in V1.5 and defer the full iPhone tap-to-sheet redesign to V1.6 — but **not** ship mobile with 4px wedges silently.

**Defer to V1.6 (optional polish):** M-07, M-20, M-21, M-27, and any device-only findings that turn out cosmetic.

**Desktop-only (no mobile redesign, per guardrail):** OperatorConsole + ClinicCredentials are table-heavy operator surfaces — a "best viewed on desktop" banner (M-22) is the right call, not a responsive rebuild.

---

## Open questions for Ali

1. **Chart on mobile (M-01):** is full tap-to-sheet redesign in V1.5 scope, or is the iPad-workable enlarge+scroll variant acceptable for July with the iPhone redesign in V1.6? (Drives the single biggest effort estimate.)
2. **HEIC (M-05):** OK to add a client-side HEIC→JPEG dependency (`heic2any`, ~adds to bundle), or prefer the no-dep route (camera-capture input + "set iPhone to Most Compatible" guidance)?
3. **iPhone vs iPad priority:** is the iPhone experience must-have for July, or is iPad-chairside the only hard requirement (iPhone = best-effort)? Several findings are far worse on iPhone than iPad.
4. **Operator on mobile (M-22):** confirm the "use desktop" banner is acceptable (vs a responsive operator console).
5. **Rx print-from-phone (M-08):** do doctors actually print prescriptions from a phone/tablet (AirPrint), or only desktop? Determines M-08 priority.
6. **Arabic/RTL on mobile:** any known RTL device issues to prioritize in T15, or treat as standard regression?
7. After device testing, which ⚠️/🔴 rows from Part B does Ali want pulled into the V1.5 cut vs logged for V1.6?
