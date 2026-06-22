# Silent-Catch Swallow Audit (Phase 1 — read-only diagnostic)

**Date:** 2026-06-22
**Trigger:** PR #34 fixed `OperatorConsole` `handleAddOrg` / `updateOrgStatus` / `deleteOrg`, which shared a
silent-catch swallow: `console.error` only (no toast), unconditional modal close, unconditional form reset.
This audit checks whether the same anti-pattern survives elsewhere in the repo.

**Scope:** all 106 `catch (` blocks + ~28 `.catch(...)` chains across 22 files under `src/`.
**Method:** 6 parallel read-only passes, each classifying every catch site against the PR #34 reference shape.
**Status:** AUDIT COMPLETE — no code changed. Phase 2 (fixes) not yet started.

---

## Reference pattern (the correct, post-PR #34 shape)

In any UI event handler performing a Supabase/API write:

```
try {
  ...await write...
  // SUCCESS BRANCH ONLY: optimistic state mutation, modal close, form reset, success toast
  setOrgs(prev => [...])
  setShowModal(false)
  setForm(blank)
  toast('Created', 'success')
} catch (err) {
  console.error('...', err)
  toast(err.message || '...', 'error')
  return            // <-- early return: UI does NOT advance
} finally {
  setSaving(false)  // loading flag only; never success UI
}
```

**The anti-pattern (a finding):** a `catch` that *only* `console.error`s (no toast / `setError` / inline surface)
**and then** the UI advances unconditionally — modal closes, form resets, success toast fires, or local state
mutates regardless of failure. Also flagged: modal-close/reset placed in `finally` (or after the try) with no
success guard.

---

## Headline result

**The swallow-pattern has been almost entirely eradicated already.** Of ~134 catch sites audited, the vast
majority already match the PR #34 shape (toast/`setError` on error + success-gated UI advance) or are
intentional fire-and-forget fallbacks. This is consistent with the `CLAUDE.md` invariant *"Errors: surface via
toast + structured log; never silent-catch."*

| Severity | Count | Notes |
|---|---|---|
| **SEVERE** | **1** | `DentalDashboard.handleAction` — optimistic destructive status write, silent on failure, no rollback |
| **MODERATE** | 0 | no create/insert handler swallows + closes modal |
| **MINOR** | 6 | read-path silent-empties (load failure looks identical to "no data") |
| **LOW / borderline** | 1 | `AppointmentsPage.handleSave` — error *is* toasted, but modal closes unconditionally |
| **FALSE POSITIVE / intentional** | ~78 | correct shape, re-throwing data layer, role-prefetch fallbacks, JSON-parse fallbacks, storage cleanup |

Well under the 30-finding split threshold. Recommended as **2 small PRs** (see end).

---

## Findings

### 🔴 SEVERE

#### `src/components/DentalDashboard.jsx:175` — `handleAction`

- **Action:** destructive appointment status update (`confirm` / `cancel` / `complete`) via `updateAppointmentStatus`.
- **Current behavior:** optimistically mutates `appointmentsList` status, then on write failure does
  `console.error` **only** — no toast, no rollback. The UI permanently shows e.g. "cancelled" / "completed"
  even though the DB write failed.
- **Why SEVERE:** destructive action, fails silently, advances UI as if successful — the exact PR #34 profile,
  on the **live dental module**. The sibling optimistic handlers in `DentalTabs` (`handlePlanStatus`,
  `handleItemStatus`, `togglePin`) all roll back via `reload()`; `handleAction` is the lone outlier.
- **Proposed fix:** on failure, `toast('Failed to update appointment', 'error')` **and** roll back the optimistic
  status (snapshot prior status, or re-sync via `setRefreshTrigger`). **Blocker:** `DentalDashboard` does not
  currently receive a `toast` prop — the fix must thread `toast` down from the parent (App.jsx render site).
- **Ceremony:** dental module is live → per `CLAUDE.md`, this fix requires `/code-review` before push.

---

### 🟡 MINOR — read-path silent-empties

These leave the UI on a plausible empty/loading state with no error surface; a real load/auth failure is
indistinguishable from "no data." Not destructive, but dishonest UX. Grouped by file for batching.

| # | file:line | Handler | Action | Current behavior | Proposed fix |
|---|---|---|---|---|---|
| 1 | `src/pages/SettingsPage.jsx:389` | `TeamTab` load `useEffect` | read (members + invites) | `console.error` only; team list silently empty | add error toast/banner |
| 2 | `src/pages/SettingsPage.jsx:1313` | `ClinicTab` mount `useEffect` | read (orgId/fetchAll) | `catch { setLoading(false) }`; org-resolve failure → empty doctor list | add error toast |
| 3 | `src/pages/SettingsPage.jsx:1324` | `ClinicTab.fetchAll` | read (listDoctorsInOrg) | `console.error` only; finally clears loading → silent empty | add error toast |
| 4 | `src/pages/FinancePage.jsx:451` | search `useEffect` (debounced) | read (patient search) | `console.error` + `setResults([])` → "No results" | optional: distinct "search failed" state |
| 5 | `src/pages/FinancePage.jsx:473` | plans-load `useEffect` (`.catch`) | read (treatment plans) | `console.error` + `setPlans([])`; optional dropdown hides | low priority; toast for honesty |
| 6 | `src/pages/DentalDashboard.jsx:146` / `:163` | stats / doctors `useEffect` | read | `console.error` only → empty "No appointments / patients" | optional banner; blocked on same missing `toast` prop as the SEVERE fix |

> Highest-value MINOR pair: `SettingsPage.jsx:1313` + `:1324` — an auth/org-resolution failure renders
> identically to a legitimately empty clinic.

---

### 🟢 LOW / borderline (not a silent swallow — error is surfaced)

#### `src/pages/AppointmentsPage.jsx:324–350` — `handleSave` (create + edit)

- Error **is** toasted (`toast('Error creating: …', 'error')`), so this is **not** a silent swallow.
- **But:** `setShowModal(false)` at line **350** runs *unconditionally* after the try/catch — the modal closes
  even on failure. This matches the "modal close runs unconditionally" half of the PR #34 signature.
- **Proposed fix:** move `setShowModal(false)` into the success branch (inside the try, after the await), and
  early-`return` from the catch. Pairs naturally with the MINOR batch.

---

## False positives / intentional (no action) — summary by file

Every user-initiated **write/create/update/delete** handler outside the one SEVERE case already follows the
PR #34 shape. Notable confirmations:

- **`App.jsx`** (17 sites): `addPatient`/`updatePatient`/`deletePatient` all pair an error toast with
  `loadAllData()` re-sync (optimistic rollback). `addPayment`/`deletePayment`/`saveOrgSettings`/WhatsApp
  `handleSend` all toast on error. `.catch` one-liners (1266, 1570, 1667, 1699, 408) are intentional read
  fallbacks. ✅
- **`components/DentalTabs.jsx`** (27 + 4 sites): entire module clean — every write/delete toasts on error with
  success-gated advance; optimistic `handlePlanStatus`/`handleItemStatus`/`togglePin` roll back via `reload()`. ✅
- **`SettingsPage.jsx`** / **`FinancePage.jsx`** write handlers (`saveDoctor`, `handleConfirmRemove`,
  `handleFileChange`, invite/revoke, `RecordPaymentModal.handleSubmit`): textbook correct shape. ✅
- **`Auth.jsx`** / **`Join.jsx`**: use inline `setError(...)` (valid auth-flow surface) + success-gated nav. ✅
- **`SocialMonitor.jsx`** / **`ClinicCredentials.jsx`**: `handleSave`/`handleDelete` toast on error,
  success-only advance. (Unrelated color-token debt noted — already tracked for PR #D.) ✅
- **`AddAppointmentModal.jsx`**, **`InventoryPage.jsx`**, **`GoalsPage.jsx`**, **`ReportsPage.jsx`**,
  **`AIAssistant.jsx`**, **`OperatorContext.jsx`**: all clean (toast/`setError`/fail-closed/empty-state). ✅
- **Data layer `src/lib/`** (`database.js`, `documents.js`, `invitations.js`, `ai.js`, `whatsapp.js`): every
  mutating op uses `if (error) throw error` and propagates to the caller. The only swallowing catches are
  `res.json().catch(() => ({}))` JSON-parse fallbacks (each immediately followed by a `throw`), best-effort
  storage `.remove().catch(() => {})` cleanup *after* the primary op already failed (real error re-thrown next
  line), localStorage availability guards, and two deliberate read fallbacks (`getInvitationPreview`,
  `fetchOrgStatus`). Contract upheld throughout. ✅

---

## Phase 2 batching recommendation

Total actionable = 1 SEVERE + 6 MINOR + 1 LOW. Below the 30-finding split threshold, but the SEVERE fix has a
different blast radius (live dental + prop-threading + mandatory `/code-review`), so split into **2 PRs**:

- **PR-A (SEVERE, dental):** thread `toast` into `DentalDashboard`, fix `handleAction` (error toast + optimistic
  rollback), optionally also surface the two MINOR `:146/:163` reads while the prop is in hand. Requires
  `/code-review` (dental invariant). Smallest possible, isolated.
- **PR-B (MINOR/LOW read-path honesty):** add error toasts to `SettingsPage` Team/Clinic loads (`389`,
  `1313`, `1324`) and `FinancePage` (`451`, `473`); move `AppointmentsPage.handleSave` modal-close into the
  success branch. Pure UI, no dental/auth/RLS/billing → no mandatory `/code-review`, but run it anyway since it
  spans several files.

**Lint baseline awareness:** current baseline is **46 / 37 / 9** (errors/warnings/info). Phase 2 edits add
`toast(...)` calls and reorder existing statements only — no new imports beyond `toast` props already in scope
on most sites. Re-run `npm run lint` after each PR and confirm the baseline does **not** regress.
