# Onboarding Submit-Bug Diagnostic (Phase 1 — read-only)

**Date:** 2026-06-19
**Author:** Claude (Phase 1 diagnosis; no fixes written)
**Branch analyzed:** `master`
**Scope:** Root-cause the "UI advances past step 2, org never persists" onboarding bug. No code edits, no SQL run against production.

---

## TL;DR — the premise is partially stale (read this first)

The bug described in the prompt was **real**, but it lived in a flow that **no longer exists on `master`**. The self-serve Onboarding wizard (`src/pages/Onboarding.jsx`) was **deleted in Sprint 0** (`d0bf184`, v0.3.0), and the whole signup model was inverted to **invite-only / operator-provisioned**. As a result:

1. There is **no self-serve onboarding submit handler** to fix anymore — it's gone.
2. `Auth.jsx` has **no signup/register mode** at all (only `login` + `forgot`). Brand-new clinic owners genuinely cannot self-register — **by design**, not via a silent bug.
3. The `create_first_org` RPC the prompt references is **doubly dead**: (a) per memory it was never deployed to the production Supabase DB, and (b) it now targets a **table and columns that no longer exist** (`organizations` was renamed to `orgs`; `primary_color`/`industry` columns were dropped).
4. The **current** org-creation path (operator console → `/api/admin createOrg`) **works** (service-role insert into `orgs`), but has its own **silent-failure smell** in the operator UI.

So Phase 2 is **not** "fix the onboarding wizard." It's a product decision: either (A) operationalize the existing operator-provisioning path for Saif Dental (small), or (B) rebuild self-serve onboarding against the *new* schema (medium–large). Details in [Recommended fix approach](#recommended-fix-approach).

---

## 1. Code path traced

### 1a. Historical path (what the prompt describes — now deleted)

`src/pages/Onboarding.jsx` existed until Sprint 0. Timeline from git:

| Commit | Date | What it did |
|--------|------|-------------|
| `d97b3d5` | — | "Onboarding step 2 — invitations now create rows (was silently dropped)" — fixed a **swallowed-error** in step 2. |
| `e38ba95` | Apr 28 | "SECURITY DEFINER function for first-org creation + industry case fix" — replaced `Onboarding.jsx`'s direct `supabase.from('organizations').insert(...)` + `profiles.update(...)` with a **single `supabase.rpc('create_first_org', {...})`** call. Added `scripts/create-first-org-function.sql`. |
| `d0bf184` | — | **"Sprint 0: dental-only foundation (v0.3.0)"** — **DELETED `src/pages/Onboarding.jsx`**, renamed `organizations`→`orgs`, dropped `departments`, moved to operator-provisioning. |

Verification:
```
$ git cat-file -e master:src/pages/Onboarding.jsx
fatal: path 'src/pages/Onboarding.jsx' does not exist in 'master'
$ git grep -n "create_first_org" master -- src/ api/
(no matches — no client code calls this RPC anymore)
```

The original failure (per `e38ba95`'s own commit body): every brand-new (non-super-admin) user hit
`new row violates row-level security policy for table "organizations"` on the first-org INSERT.
Existing orgs all worked only because they were created by the whitelisted super-admin.

### 1b. Current path (what actually runs on `master`)

Org creation is now **operator-only**, server-side, service-role:

- **UI:** `src/pages/operator/OperatorConsole.jsx:98` `handleAddOrg()` → `fetch('/api/admin', { action: 'createOrg', payload: { name, admin_email } })` (line 105–108).
- **Server:** `api/admin.js:47` `createOrg` branch:
  - Authenticates caller, requires a row in `operators` (`api/admin.js:34–41`).
  - `supabaseAdmin.from('orgs').insert({ name, slug, locale:'en', currency:'IQD', timezone:'Asia/Baghdad', status:'active' })` with the **service-role key** (bypasses RLS) — `api/admin.js:56–68`. **`insertErr` is checked** (`throw`).
  - Optionally inserts an `invitations` row + returns an invite URL (`api/admin.js:70–95`).
- **Owner side:** invited owner opens `/join?token=...` (`src/pages/Join.jsx`) → `api/invitations/accept.js:88` `rpc('accept_invitation', …)` which links the owner's `profile.org_id` to the org. **This is where `profile.org_id` gets set today — not at org-creation time.**

### 1c. Self-serve signup entry point

`src/pages/Auth.jsx:96` → `const [mode, setMode] = useState('login') // 'login' | 'forgot'`. There is **no `signup` mode**. App.jsx confirms the design intent:

- `src/App.jsx:402–403`: *"No-org branch: clinic users without an org_id are provisioned by the operator (Sprint 0+). The legacy onboarding wizard is gone."*
- `src/App.jsx:659`: *"Onboarding flow is gone — clinics are provisioned by the operator."*

---

## 2. Production DB state checked

> Per constraints I did **not** connect to or run SQL against production. The following is from in-repo schema/RLS source of truth + prior memory; the exact read-only verification query for a human to confirm is in [Appendix A](#appendix-a--read-only-verification-queries-for-a-human-to-run).

### `orgs` table (current schema — `src/lib/schema.sql:168–179`)
```sql
CREATE TABLE orgs (
  id, name, slug, locale, currency, timezone,
  status org_status NOT NULL DEFAULT 'test',
  created_at, created_by_operator_id, operator_notes
);
```
**No `primary_color`, no `industry`, no `plan`.** (`src/lib/orgs.js` header documents the rename + dropped columns explicitly.)

### `orgs` RLS (`src/lib/schema.sql:664–685`)
```sql
orgs_select_member    FOR SELECT  USING (id = public.current_org_id());
orgs_select_operator  FOR SELECT  USING (public.is_operator());
orgs_insert_operator  FOR INSERT  WITH CHECK (public.is_operator());   -- ← INSERT is operator-only
orgs_update_operator  FOR UPDATE  USING/CHECK (public.is_operator());
orgs_delete_operator  FOR DELETE  USING (public.is_operator());
```
**A non-operator authenticated user cannot INSERT into `orgs` at all.** There is no first-org self-creation carve-out. This is the intentional Sprint-0 model.

### `create_first_org` RPC
- Memory: **does not exist on the production Supabase project.** (`scripts/create-first-org-function.sql` was committed in `e38ba95` but is a migration the human runs manually — and the evidence says it was never applied.)
- Even if applied, it is now **broken against the live schema**: it `INSERT INTO public.organizations (name, slug, primary_color, industry)` — wrong table name *and* two non-existent columns. It would fail with `relation "organizations" does not exist` (or a column error).

---

## 3. Root cause

### Primary root cause (historical — the literal "org never persists" symptom)
**The org INSERT never reached a working backend, and the error was not surfaced to the user, so the wizard advanced anyway.** Two layers, in sequence across the project's history:

1. **Before `e38ba95`:** direct `insert` into `organizations` was **rejected by RLS** (`organizations_own_org` was `FOR ALL` with only a super-admin carve-out and no permissive first-org INSERT). Evidence: `e38ba95` commit body + `scripts/create-first-org-function.sql:14–22`.
2. **After `e38ba95`:** code called `supabase.rpc('create_first_org', …)`, but the function **was never deployed to production** → PostgREST returns **404 / `PGRST202` (function not found)**. The org still never persisted.

In both cases the *silent* part is the killer: the handler advanced the UI without surfacing the returned error. There is independent precedent for this swallow-pattern in the same flow — `d97b3d5` ("step 2 invitations … was silently dropped") fixed exactly this class of bug one step over.

### Why it's moot on `master`
The wizard was deleted (`d0bf184`). The current org-creation path (`api/admin.js createOrg`, service-role) **correctly checks `insertErr` and inserts the right columns**, so the historical "org never persists" failure does not reproduce there.

### Active (current) contributing issue — same *class* of silent failure, operator-facing
`OperatorConsole.handleAddOrg` swallows server errors:
```js
// src/pages/operator/OperatorConsole.jsx:111-135
if (!res.ok) throw new Error(result.error || 'Failed to create org')
...
} catch (err) {
  console.error('Failed to create org:', err)   // ← console only; NO toast
}
setSaving(false)
setNewOrg({ name: '', admin_email: '' })          // ← runs unconditionally
setShowAddModal(false)                            // ← modal closes even on failure
```
If `/api/admin createOrg` fails (e.g. duplicate slug → unique-constraint error, or missing service-role key → the `500` at `api/admin.js:20–22`), the operator sees **no error**, the modal closes, the form resets, and the org simply doesn't appear. That is the **exact "advances but doesn't persist" UX** — just relocated to the operator console. This is the most likely thing someone hit recently that produced the "still broken" impression.

---

## Recommended fix approach

Three viable directions for Phase 2 (decision is product-level, not purely technical):

### Option A — Operationalize the existing operator-provisioning path *(recommended; SMALL)*
Don't rebuild onboarding. Use what works:
1. Operator creates Saif Dental's org via OperatorConsole (`createOrg` → service-role insert → invite URL).
2. Send the invite link; owner accepts via `/join` (`accept_invitation` sets `profile.org_id`).
3. **Fix the one real silent-failure:** add a user-facing error toast in `OperatorConsole.handleAddOrg` and only close the modal / reset the form on success.
- **Pros:** Matches current architecture, unblocks Saif Dental immediately, tiny surface, no migration, no RLS change, Vercel function count untouched.
- **Cons:** No self-serve signup for future clinics (operator must provision each one).

### Option B — Rebuild self-serve onboarding against the *new* schema *(MEDIUM–LARGE)*
If self-serve signup is genuinely wanted:
1. Add a `signup` mode to `Auth.jsx`.
2. Rebuild an Onboarding step UI (recoverable shape from `git show e38ba95:src/pages/Onboarding.jsx`, but must be reworked for new fields).
3. Write a **new** SECURITY DEFINER `create_first_org` targeting `orgs` with the **current** columns (`name, slug, locale, currency, timezone, status`) — needed because `orgs_insert_operator` forbids non-operator INSERT. Apply it to prod.
4. Decide the security story: self-created orgs bypass the operator gate, so add guards (one-org-per-user, default `status='test'`, etc.).
- **Pros:** True self-serve growth path.
- **Cons:** Re-introduces the exact RLS-bypass surface Sprint 0 deliberately removed; larger test/security burden; reopens an architectural decision the team already made.

### Option C — Dead-code cleanup *(complements A or B; SMALL)*
Delete/rewrite `scripts/create-first-org-function.sql` (references dropped `organizations` table + `departments`) and clear the stale "use direct SQL CTE for org creation until fixed" memory note. Prevents the next session from re-chasing a ghost.

**Recommendation:** **Option A + C.** A unblocks Saif Dental now with minimal risk; C removes the stale artifacts that made this look like an open bug. Revisit B only if self-serve signup becomes a real product requirement.

**Estimated complexity:** Diagnosis — resolved. Recommended path (A+C) — **SMALL**. Full self-serve rebuild (B) — **MEDIUM–LARGE**.

---

## 4. Unrelated bugs / smells found during investigation (backlog)

1. **`OperatorConsole.handleAddOrg` silent catch** (`OperatorConsole.jsx:121–135`) — server errors only `console.error`'d; modal closes + form resets unconditionally. No user feedback. *(This is the live "silent failure" — fold into Option A.)*
2. **Stale migration script** — `scripts/create-first-org-function.sql` targets the dropped `organizations` table and `primary_color`/`industry` columns. Cannot be applied as-is. *(Option C.)*
3. **`orgs.status` default mismatch** — schema default is `'test'` (`schema.sql:175`) but `api/admin.js createOrg` hardcodes `status:'active'` (`api/admin.js:64`). New console-created orgs skip the `test` state. Confirm intended.
4. **`updateOrgPlan` is a 410 tombstone** (`api/admin.js:124–126`) — `orgs` has no `plan` column. Confirm no caller still references it.
5. **Memory note drift** — MEMORY workaround "use direct SQL CTE for org creation until fixed" predates Sprint 0 and is now misleading. Update when Phase 2 lands.

---

## 5. STOP

No application code or migration SQL was written. This is diagnosis only. Phase 2 (the actual fix) is a separate session and should begin from a product decision between Option A and Option B above.

---

## Appendix A — Read-only verification queries (for a human to run)

To confirm the DB-side claims in §2 against production (read-only; safe):

```sql
-- (1) Does create_first_org actually exist on prod? (expect 0 rows)
SELECT p.proname, p.prosecdef, pg_get_function_arguments(p.oid)
FROM pg_proc p
WHERE p.proname = 'create_first_org'
  AND p.pronamespace = 'public'::regnamespace;

-- (2) Confirm orgs INSERT is operator-only (expect orgs_insert_operator WITH CHECK is_operator())
SELECT policyname, cmd, qual AS using_clause, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'orgs'
ORDER BY policyname;

-- (3) Confirm the old organizations table is gone (expect 0 rows)
SELECT to_regclass('public.organizations') AS organizations_table;  -- NULL = gone
```
