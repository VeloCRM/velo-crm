\# Velo — Sprint 1 Backlog



\*\*Status as of v0.3.0-foundation:\*\* Foundation shipped. Clinic-owner experience verified end-to-end. Operator flow architected but not browser-tested. Several pages localStorage-backed pending real DB wiring. Visual design is functional but generic.



\*\*Sprint 1 goal:\*\* Make the product demoable to Dr. Saif (first customer) without operator embarrassment, and ship the dental chart visual that closes the "this looks like a real dental product" perception gap.



\*\*Effort scale:\*\* S = under half a day. M = half to one full day. L = 1-2 days. XL = 3+ days.



\---



\## P0 — Must fix before Dr. Saif demo



\### S1.1 — Move operator detection out of the API route

\*\*Type:\*\* Architecture fix  

\*\*Effort:\*\* M  

\*\*Why it matters:\*\* The `/api/auth/is-operator` round-trip doesn't work in `npm run dev`, which broke our entire smoke test today. Also: it's an unnecessary network hop. The operators table is RLS-readable by authenticated users (selecting their own row). Move the check into a direct Supabase query from `OperatorContext`. Eliminates the dependency on Vercel functions for the most fundamental routing decision in the app.



\*\*Acceptance:\*\*

\- `useIsOperator()` hook works in `npm run dev` AND `vercel dev` AND production

\- Sign in as madmaxali → land on OperatorConsole, no clinic dashboard ever rendered

\- Sign in as a clinic owner → land on dental dashboard, no OperatorConsole

\- `api/auth/is-operator.js` deleted (no longer needed)

\- Audit log captures impersonation correctly (acting\_user\_id ≠ effective\_user\_id when operator impersonates)



\### S1.2 — Test and fix the operator → impersonate → clinic flow end-to-end

\*\*Type:\*\* Smoke test gap  

\*\*Effort:\*\* M  

\*\*Why it matters:\*\* This is your business model. You sell to clinics by managing their accounts. If impersonation has any bug, you can't onboard your first paying customer. Phase 7 built this. Nobody has clicked through it.



\*\*Acceptance:\*\*

\- Operator clicks "Impersonate" on My Test Clinic → drops into clinic UI as Dr. Ali

\- TestAccountBanner shows correctly when impersonating a test org

\- All audit log entries during impersonation have correct acting\_user\_id (operator) and effective\_user\_id (clinic owner)

\- Clean exit from impersonation back to OperatorConsole

\- Operator can create a real clinic from OperatorConsole UI (not via SQL)

\- Operator can create a test clinic with seeded data via UI



\### S1.3 — Build the dental chart visual properly

\*\*Type:\*\* Visual / UX  

\*\*Effort:\*\* L  

\*\*Why it matters:\*\* The current 32-box grid labeled with FDI numbers is functional but unprofessional. A dentist looking at it sees "spreadsheet" not "dental chart." This is the single thing that most affects "does this look like a real dental product" perception.



\*\*Scope:\*\*

\- Each tooth rendered as anatomically-recognizable SVG (incisor, canine, premolar, molar — different shapes per tooth class)

\- Color coding for findings (cavity red, restoration blue, missing gray, crown gold, bridge purple, implant teal, root canal dark blue)

\- Visual indicator for missing/extracted teeth (dashed outline or strike-through, not just color)

\- Click zones for the 5 surfaces within each tooth (mesial, distal, buccal, lingual, occlusal) — currently the modal asks for surface as a dropdown

\- Mouth-view orientation: patient's right on viewer's left (FDI quadrants laid out correctly)

\- Two arches visible: upper jaw on top, lower jaw on bottom



\*\*Reference:\*\* Look at how DentalDesk, Curve, Carestream display dental charts for visual benchmarks. The Iraqi market won't care about pixel perfection — they care that it looks "real."



\### S1.4 — Add /reset-password route

\*\*Type:\*\* Auth gap  

\*\*Effort:\*\* S  

\*\*Why it matters:\*\* Today's session burned 30+ minutes on locked-out passwords. Users WILL forget passwords. The Supabase recovery email already works — the app just doesn't have a page to handle the redirect target.



\*\*Acceptance:\*\*

\- `/reset-password` page reads access\_token from URL hash

\- Shows "Set new password" form

\- On submit, calls Supabase `updateUser({ password })`

\- On success, redirects to dashboard

\- Bilingual EN/AR



\---



\## P1 — Should fix soon (within Sprint 1)



\### S1.5 — Tasks page persistence (currently localStorage)

\*\*Type:\*\* DB wiring  

\*\*Effort:\*\* M  

\*\*Why:\*\* Tasks are real clinic workflow (receptionists assign things to doctors/assistants). Losing them when a user clears browser cache is a non-starter for paid clinics.



\*\*Scope:\*\*

\- Build `src/lib/tasks.js` with full CRUD (Phase 6 rigor: requireUser, getCurrentOrgId, audit, sanitize)

\- Schema already has `tasks` table — verify shape, add `appointment\_id` column if needed for "task linked to appointment" feature

\- Migrate any localStorage data on first sign-in (read once, write to DB, clear localStorage)

\- Update TasksPage.jsx to use the new helpers



\### S1.6 — Goals page persistence (currently localStorage)

\*\*Type:\*\* DB wiring + schema design  

\*\*Effort:\*\* M  

\*\*Why:\*\* Same reason as Tasks — clinics will set quarterly revenue goals and lose them when they clear cache.



\*\*Scope:\*\*

\- Design `goals` table schema: type (enum: patients\_seen | revenue\_usd | revenue\_iqd | treatments\_completed | new\_patients), target\_value, period (week/month/quarter/year), org\_id, created\_by, period\_start, period\_end

\- RLS: owner can CRUD, clinic users can read

\- Migrate the live progress computation from `lib/goals.js` to read targets from the new table



\### S1.7 — Permissions matrix audit (`patients` key fix surfaced a deeper issue)

\*\*Type:\*\* Hygiene  

\*\*Effort:\*\* S  

\*\*Why:\*\* When the schema rename pivot happened, the permissions MATRIX got `patients` added late (today). Audit every page key in App.jsx nav and confirm it has a corresponding entry in `lib/permissions.js`. Missing keys cause silent feature-hiding bugs like the one we just shipped.



\*\*Scope:\*\*

\- List every page key referenced in `navGroups` (App.jsx)

\- List every key in MATRIX (permissions.js)

\- Reconcile diff

\- Remove dead keys (e.g., `contacts` if it lingers post-rename, `deals`, `tickets`, `growth`)



\### S1.8 — InboxPage refactor to lib/messaging

\*\*Type:\*\* Code hygiene  

\*\*Effort:\*\* M  

\*\*Why:\*\* Inline `supabase.from('conversations')` / `supabase.from('messages')` calls violate the Phase 6 boundary. Also makes the conversations/messages live-data path untested.



\*\*Scope:\*\*

\- Create `src/lib/messaging.js` with helpers: listConversations, fetchMessages, sendMessage, markAsRead

\- Phase 6 rigor (requireUser, getCurrentOrgId, audit, sanitize)

\- Migrate InboxPage to use the new helpers

\- Test conversations + messages display real data



\### S1.9 — Lint warnings cleanup (49 → 0)

\*\*Type:\*\* Hygiene  

\*\*Effort:\*\* M  

\*\*Why:\*\* Small bugs hide in lint warnings. The 49 remaining warnings are mostly in deferred files (FormsPage, OperatorConsole, AutomationsPage). Fix in one focused pass.



\*\*Scope:\*\*

\- 17 no-unused-vars: drop or use `// eslint-disable-next-line` with justification

\- 9 react-hooks/static-components: hoist nested components to top of file

\- 9 react-hooks/exhaustive-deps: review each — some are intentional, mark with disable comment + reason

\- 7 react-hooks/set-state-in-effect: migrate to derived state where possible

\- Final target: lint passes with zero warnings



\---



\## P2 — Defer until first customer feedback



\### S1.10 — Translations cleanup

\*\*Type:\*\* Hygiene  

\*\*Effort:\*\* S  

\*\*Why:\*\* Several stale keys remain (`t.deals\_used`, `t.editor`, `t.viewer`, possibly `t.admin`). Harmless but messy.



\### S1.11 — TasksPage `lang` prop unused

\*\*Type:\*\* Hygiene  

\*\*Effort:\*\* XS  

\*\*Why:\*\* Wave B 2.2b voided the prop with `void lang`. Drop it from signature + matching App.jsx call.



\### S1.12 — InboxPage missing-patient fallback

\*\*Type:\*\* UX bug  

\*\*Effort:\*\* S  

\*\*Why:\*\* When an inbox conversation references a patient\_id that doesn't exist (legacy data, deleted patient), the "View profile" button 404s.



\### S1.13 — SAMPLE\_TEAM in SettingsPage

\*\*Type:\*\* Polish  

\*\*Effort:\*\* XS  

\*\*Why:\*\* Hardcoded demo team data; should derive from SAMPLE\_DENTAL\_DOCTORS dynamically.



\### S1.14 — DocsPage uploads to Supabase Storage

\*\*Type:\*\* Feature gap  

\*\*Effort:\*\* M  

\*\*Why:\*\* Doc storage is currently localStorage-only with no real upload path. Building this requires Supabase Storage bucket setup, RLS on storage, file size limits, MIME type validation. Real work, not blocking demo.



\### S1.15 — `/api/social-fetch.js` security audit

\*\*Type:\*\* Security  

\*\*Effort:\*\* S  

\*\*Why:\*\* This endpoint was created earlier in development and may not have been audited for auth/RLS in Phase 6. Quick review: does it require JWT? Does it scope queries by org\_id?



\### S1.16 — Calendar default doctor filter

\*\*Type:\*\* Product behavior (raised in smoke test today)  

\*\*Effort:\*\* S  

\*\*Why:\*\* Receptionists default to "All Doctors" view (correct). Doctors should default to "their own appointments" view with option to expand. Owners = doctors should default like doctors.



\*\*Spec from today's discussion:\*\*

\- Receptionist signs in → Calendar shows All Doctors by default

\- Doctor signs in → Calendar shows own appointments by default; can switch to All Doctors

\- Owner-as-dentist → behaves like doctor

\- Pure owner (non-clinical) → behaves like receptionist



\---



\## P3 — Real product features (post-Sprint 1)



These are NOT bugs. They're features your first customer will ask for once they're using the product:



\- \*\*Real WhatsApp end-to-end test\*\* with a Meta Business account on your phone

\- \*\*AI Assistant with real Anthropic key\*\* — currently API exists, never tested with credits

\- \*\*X-rays / image attachments\*\* — patient profile attaching photos and panoramic x-rays (Supabase Storage based)

\- \*\*Appointment reminders via WhatsApp\*\* — automated 24h-before reminder using the WhatsApp send API

\- \*\*Recall system\*\* — "patients who haven't visited in 6 months" auto-flagging

\- \*\*Treatment plan PDF export\*\* — patient-shareable PDF with itemized estimates

\- \*\*Receipt/invoice PDF\*\* — for payments recorded in Finance

\- \*\*Multi-doctor scheduling with conflict detection\*\* — already partially there

\- \*\*Insurance / claim tracking\*\* — only relevant if Iraqi private dental insurance becomes a market segment

\- \*\*Patient portal\*\* — patient logs in via phone OTP to see their own appointments, treatment plans, payments



\---



\## Untested features that shipped (potential bugs lurking)



These compiled but were never run in a browser. If they break, file a P0 bug ticket:



\- `/join` page — invitation acceptance flow

\- Test account creation via `api/auth/create-test-account` UI button

\- Test account 14-day cleanup cron

\- WhatsApp webhook signature verification

\- WhatsApp send rate-limit table (1000/day)

\- AI usage rate-limit table (100/hour/org)

\- Operator setting clinic credentials via `api/operator/set-secret`

\- TestAccountBanner display + dismiss



\---



\## Database technical debt



Items where schema works but isn't ideal long-term:



\- \*\*`schema.sql` GRANTs\*\* — added today after the DROP SCHEMA bit us. Verify they're at the TOP of the file so future fresh installs work

\- \*\*`accept\_invitation` SECURITY DEFINER\*\* — works but worth a security review (ensures no privilege escalation paths)

\- \*\*`current\_org\_id()` for operators\*\* — currently returns NULL because operators have no profile. Some queries depend on it being not-null. Consider: should operators have a "current\_impersonating\_org\_id" session variable?

\- \*\*No backups configured\*\* — Supabase free tier doesn't auto-backup. When you have real customers, upgrade to Pro and turn on PITR



\---



\## Notes for whoever picks this up



\- Read `CLAUDE.md` first. It documents project conventions.

\- The schema is in `src/lib/schema.sql`. It's the source of truth — all migrations must be appended there + applied to the running DB.

\- Phase 6 boundary: components don't call `supabase.from()` directly. Always go through `src/lib/`.

\- All money is `\*\_minor BIGINT` with sibling `currency` column. USD divides by 100 for display, IQD passes through (see `src/lib/money.js`).

\- FDI tooth numbering: 11-18 upper-right, 21-28 upper-left, 31-38 lower-left, 41-48 lower-right.

\- All RLS policies should be per-operation (separate SELECT/INSERT/UPDATE/DELETE), never `FOR ALL`.

\- Operator UUID: `7f35f01a-e823-482c-a8bf-9b78a9635a2f` (madmaxali@gmail.com)

\- Test clinic UUID: `64771656-2028-4e5a-86f4-397b8edfda88` ("My Test Clinic")

\- Test clinic owner UUID: lookup `dr.ali@testclinic.iq` in auth.users (password: `Velo2026!`)

