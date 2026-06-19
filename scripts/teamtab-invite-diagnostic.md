# TeamTab Invite-Flow Diagnostic (Phase 1 — read-only)

**Date:** 2026-06-19
**Author:** Claude (Phase 1 diagnosis; no fixes)
**Branch analyzed:** `master`
**Scope:** Verify the memory-flagged "TeamTab invite flow returns 404" against current code + live production. No code changes, no SQL run against prod.

---

## TL;DR — 404 is STALE / resolved (same shape as the onboarding ghost)

**Is the 404 still real on current code? → NO.**

The original report (memory `phase_2_4_deferred.md`, tested **2026-05-05**) was a real, reproducible `"Create invitation failed (404)"` toast on **Settings → Team → Invite Member**. But it was a **transient missing-function-deploy** during the Sprint 0 fallout, not a code defect — and it is gone now:

- `api/invitations/create.js` exists, is a valid Vercel handler (`export default async function handler`), and is **live on production**: a no-auth `POST /api/invitations/create` returns **HTTP 401** (the handler's auth guard), **not 404**. A missing function returns Vercel's platform 404.
- The generated invite URL is `{base}/join?token=…`; the `/join` deep-link returns **HTTP 200** on prod (SPA rewrite serves the app), and the `/join` route is registered (`App.jsx:611`).
- TeamTab is **active and fully wired** — it was *not* deprecated by Sprint 0.

No code fix is required for the 404. Remaining items are **verification-only** (see below).

---

## 1. Where TeamTab lives + the invite flow

`TeamTab` is a component **inside** `src/pages/SettingsPage.jsx` (def at line 350; rendered at line 119 under the `team` tab). It is the active team-management surface. Flow:

| Step | Code | Notes |
|------|------|-------|
| Owner submits invite | `SettingsPage.jsx:400` `invite()` → `createInvitation({email, role})` | Owner-gated UI (`isOwner = myRole === 'owner'`, line 363) |
| Create (server) | `src/lib/invitations.js:64` `createInvitation` → `POST /api/invitations/create` | JWT + owner + non-test-org checks server-side |
| Build link | `invitations.js:30` `buildInviteUrl(token)` → `` `${base}/join?token=…` `` | `base` = `VITE_APP_URL` or `window.location.origin` |
| Share | Modal shows copyable link (WhatsApp/SMS/email) | **Link-only flow — no email is sent by the system** |
| Invitee opens link | `App.jsx:611` `/join` → `JoinPage` | SPA route; `vercel.json` rewrites `/(.*) → /` |
| Preview | `Join.jsx` → `getInvitationPreview` → `get_invitation_preview` RPC | Callable signed-out (granted to `anon`) |
| Accept | `acceptInvitation` → `POST /api/invitations/accept` → `accept_invitation` RPC | Sets profile org_id + role, marks accepted, audits (verified yesterday in `onboarding-bug-diagnostic.md`) |

This is the **same `/join` + `accept_invitation` backbone** confirmed working in yesterday's onboarding diagnostic.

## 2. The original 404 — root cause (historical)

Original symptom (memory, 2026-05-05): toast **`"Create invitation failed (404)"`**.

That exact string is produced by `invitations.js:86`:
```js
if (!res.ok) {
  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error || `Create invitation failed (${res.status})`)
}
```
The `Create invitation failed (404)` fallback only fires when the 404 response carries **no JSON `error` field** — i.e. a **Vercel platform 404 (function not deployed/found)**. The handler's own 404 path (`create.js:82`, "Org not found") always includes a JSON `error`, so it would surface as `"Org not found"`, not the bare fallback.

⇒ The May 404 was the **`/api/invitations/create` function not being present in the deployed production build at that moment**, not a logic bug. The commit history corroborates a Sprint-0 deploy churn right around the test date:
- `771b32d fix: restore /api/admin endpoint + adapt agency dashboard…`
- `276f9e8 polish: … + restored /api/admin endpoint`
- `92f2306 fix: restore agency-mode component definitions deleted by Sprint 0 cleanup`

`api/invitations/create.js` itself has existed since Sprint 0 (`d0bf184`) — so the file wasn't missing from the *repo*; the deployed *production alias* was mid-restoration / stale when tested.

## 3. Current state — live evidence (2026-06-19)

| Check | Result |
|-------|--------|
| `git ls-files api/` function count | **12** (at Hobby limit — matches the "12/12" memory flag) |
| `api/invitations/create.js` valid handler | ✅ `export default async function handler` (line 30) |
| `POST /api/invitations/create` (no auth) on prod | **HTTP 401** — handler runs, rejects no-auth (not 404) |
| `GET /join?token=…` on prod | **HTTP 200** — SPA served (not 404) |
| `/join` route registered | ✅ `App.jsx:611` |
| `vercel.json` SPA rewrite | ✅ `/(.*) → /` covers `/join`; `/api/*` resolves first (proven by the 401) |
| TeamTab imports resolve | ✅ `createInvitation/listPendingInvitations/revokeInvitation/buildInviteUrl` (`lib/invitations`), `listTeamMembersInOrg/fetchMyProfile` (`lib/profiles`), `isValidEmail` (`lib/sanitize`) |

**Verdict: the create endpoint is deployed and functioning; the deep-link route serves; the flow is coherent end-to-end. The 404 premise is stale.**

## 4. Real current behaviors that could be *mistaken* for "broken" (NOT 404s)

1. **Test orgs are blocked from inviting — by design.** `create.js:83` returns **403** `"Test accounts cannot invite team members…"` when `org.status === 'test'`. The `orgs.status` column **defaults to `'test'`** (`schema.sql:175`). Operator-provisioned orgs are set to `'active'` (`api/admin.js` createOrg hardcodes `status:'active'`), so they invite fine — **but any org left at the default `'test'` cannot invite.** ⚠️ **This is the thing to check before Saif Dental onboarding:** confirm their org `status = 'active'`, or "Invite Member" will 403 (not 404) when they try to add Sara as receptionist.
2. **Invitation RPC deploy-gap (carryover from yesterday).** The `/join` half depends on `get_invitation_preview` and `accept_invitation` being **deployed** on production Supabase. Couldn't verify from here (read-only constraint, no DB creds). If `get_invitation_preview` is absent, `/join` shows "invalid invitation" (logic failure, not a 404); if `accept_invitation` is absent, accept fails with a mapped error. Same risk flagged in `onboarding-bug-diagnostic.md` §3.

## 5. Recommended approach + complexity

**No code fix needed for the reported 404.** Phase 2 = verification only:

| Action | Type | Complexity |
|--------|------|------------|
| Owner-token smoke test: real owner → Settings → Team → invite → confirm link generated + `/join` accept works | Manual / auth-gated | **Trivial** |
| Confirm Saif Dental's org `status = 'active'` (not `'test'`) before they invite Sara | Read-only DB / operator console | **Trivial** |
| Confirm `get_invitation_preview` + `accept_invitation` RPCs deployed on prod | Read-only DB (`pg_proc`) | **Trivial** |
| *(Optional, separate)* If test-org owners *should* be allowed to invite, relax `create.js:83` — but that's a product decision, not a bug | Code | Small |

**Estimated complexity: verification-only (no code change). If a behavioral tweak to the test-org gate is later wanted, Small.**

---

## 6. STOP

No application code or SQL was changed. Diagnosis only. The reported 404 does not reproduce on current `master` / production. Before Saif Dental onboarding, run the three trivial verifications in §5 — the most likely real blocker is the **`status='test'` invite gate** (§4.1), not a 404.

---

## Appendix — read-only verification queries (for a human)

```sql
-- Saif Dental's org status (must be 'active' to invite; 'test' → 403)
SELECT id, name, status FROM orgs ORDER BY created_at DESC;

-- Invitation RPCs deployed? (expect both rows present)
SELECT proname FROM pg_proc
WHERE proname IN ('get_invitation_preview','accept_invitation')
  AND pronamespace = 'public'::regnamespace;
```
