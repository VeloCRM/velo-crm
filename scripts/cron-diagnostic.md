# Vercel Cron / Service-Role-Key Diagnostic (Phase 1 — read-only)

**Date:** 2026-06-20
**Author:** Claude (Phase 1 diagnosis; no fixes)
**Branch analyzed:** `master`
**Scope:** Verify the memory-flagged "cron `cleanup-test-accounts` silently broken since the May 2026 service-role key rotation." Read-only, no production mutations.

---

## TL;DR — premise is STALE (the rotation *updated* the cron's key, it didn't break it)

**Is the cron broken on current code? → NO — not a code bug, and the rotation-break premise is contradicted by documented + live-corroborated evidence.**

- The cron handler is **deployed and reachable** (probe → 401, not 404).
- `CRON_SECRET` **is set** in Vercel (Prod+Preview); the auth gate works correctly (401 on missing/wrong secret — *not* the 500 "CRON_SECRET not configured" path).
- `SUPABASE_SERVICE_ROLE_KEY` **is set** in Vercel (Prod+Preview) under the **exact name the code reads** — env var **name mismatch is ruled out**.
- **The rotation was already completed and wired** (memory `security_keyrotation_pending.md`, titled *RESOLVED 2026-05-04*): the **new `sb_secret_eQUC7…` key was added to Vercel `SUPABASE_SERVICE_ROLE_KEY`**, scoped to all envs, production redeployed and smoke-tested clean; legacy JWT keys disabled in Supabase. **My live `vercel env ls` corroborates this** — `SUPABASE_SERVICE_ROLE_KEY` is set in Prod+Preview and **timestamped ~46d ago (≈ May 4–5), matching the 2026-05-04 rotation date.** The rotation *set* the key the cron reads; it did not orphan it.

**Verdict:** The "silently broken since the May rotation" premise is **stale** — same pattern as the onboarding and TeamTab diagnostics. The rotation-specific failure modes are ruled out, and the key the cron uses is the post-rotation `sb_secret_` key (documented + timestamp-corroborated). The single thing I could not directly *observe* is a green cron run in the dashboard (Hobby log retention too short for the CLI; invoking the cron is destructive). That is an optional confirmation, not an open risk.

---

## 1. Cron config + handler

**`vercel.json`** — one cron:
```json
"crons": [{ "path": "/api/cron/cleanup-test-accounts", "schedule": "0 3 * * *" }]
```
Daily at **03:00 UTC** (Hobby-compatible: once/day, single job). Last fire ≈ 2026-06-19 03:00 UTC (~18h before this diagnostic).

**Handler `api/cron/cleanup-test-accounts.js`** (deletes `orgs` with `status='test'` older than 14 days; CASCADE drops tenant rows; also tears down `auth.users`). Env + auth surface:

| Line | Reference | Purpose |
|------|-----------|---------|
| 24–26 | `process.env.CRON_SECRET` | Auth gate; **500 if unset**, else compares |
| 28–31 | `Authorization: Bearer ${CRON_SECRET}` | **401 if missing/wrong** |
| 17 | `VITE_SUPABASE_URL \|\| SUPABASE_URL` | project URL |
| 18 | `SUPABASE_SERVICE_ROLE_KEY` | **service-role key (no fallback)** |
| 33–35 | guard | **500 "Supabase not configured" if url or key missing** |
| 44–96 | `admin.from('orgs')…` / `admin.auth.admin.deleteUser` | service-role ops; any failure → **500 "Cleanup failed", detail** |

This is the **12th** Vercel serverless function (consistent with the "12/12 Hobby limit" memory flag).

## 2. Env-var alignment — code vs Vercel (the core check)

`vercel env ls` (names + metadata only; values stay encrypted):

| Var (in Vercel) | Set? | Environments | Last set | Code reads it? |
|-----------------|------|--------------|----------|----------------|
| `CRON_SECRET` | ✅ | Preview, Production | ~35d ago (≈May 16) | ✅ `cleanup-test-accounts.js:24` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Preview, Production | **~46d ago (≈May 5)** | ✅ `:18` (and 10 other handlers) |
| `VITE_SUPABASE_URL` | ✅ | Production, Preview | ~75d ago | ✅ `:17` → resolves to `aajwuwjxpmmqcwhiynla.supabase.co` (correct project) |

**Findings:**
- **No name mismatch.** Code reads `SUPABASE_SERVICE_ROLE_KEY`; Vercel has exactly that. The classic "rotation broke it" cause (key re-added under a slightly different name) is **ruled out**.
- **No `SUPABASE_SERVICE_KEY` exists** in Vercel. `api/admin.js` is the only handler with a `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_KEY` fallback — since the fallback name isn't set, **api/admin.js and the cron use the identical key var**. So whatever service-role key powers the (functioning) operator/admin paths is the same one the cron uses.
- `SUPABASE_SERVICE_ROLE_KEY` was **last updated ≈ May 5** — squarely in the "May 2026 rotation" window the premise references. If that update *was* the rotation, the value is **current** and the cron works.

## 3. Live probes (read-only)

| Probe | Result | Means |
|-------|--------|-------|
| `GET /api/cron/cleanup-test-accounts` (no auth) | **401 `{"error":"Unauthorized"}`** | Function deployed; `CRON_SECRET` configured (else 500) |
| `GET …` with wrong `Bearer` | **401** | Auth comparison works |
| `GET https://…supabase.co/rest/v1/` | **401** | Supabase project **awake** (not paused) |

The service-role DB path sits **behind** the secret gate, so it cannot be exercised without the real `CRON_SECRET`. And the cron is **destructive** (deletes data) — so even with the secret, invoking it is out of scope for a read-only diagnostic.

## 4. Why the value-freshness can't be confirmed from chat

1. **No `CRON_SECRET` in hand**, and the cron **mutates production** (deletes test orgs) — can't run it.
2. **Hobby log retention** is too short; `vercel logs <prod>` returned no historical cron line, and the CLI doesn't expose the dashboard's Cron run-history.
3. **Using the service-role key to query prod** to test validity = a production touch — disallowed by the constraints (and would be reading from prod with elevated creds).

## 5. Root-cause assessment

| Candidate cause | Status |
|-----------------|--------|
| Function not deployed (404) | ❌ ruled out (401 probe) |
| `CRON_SECRET` missing/misnamed | ❌ ruled out (401 not 500; var present) |
| `SUPABASE_SERVICE_ROLE_KEY` **name** mismatch after rotation | ❌ **ruled out** (name matches, var present in both envs) |
| Wrong project URL | ❌ ruled out (`VITE_SUPABASE_URL` → correct project) |
| `SUPABASE_SERVICE_ROLE_KEY` **value** stale (pre-rotation) | ❌ **ruled out** — rotation set the var to the new `sb_secret_` key on 2026-05-04 (memory `security_keyrotation_pending.md`), corroborated by the live env-var timestamp (~May 4–5) |
| Cron not registered / Hobby not running it | ⚠️ Not checkable via CLI; dashboard Crons tab shows this (only residual unobserved item) |

**State:** functional. All rotation-specific failure modes are ruled out; the cron reads the post-rotation `sb_secret_` key that was wired into Vercel and smoke-tested on 2026-05-04. Same "stale flag" pattern as the onboarding and TeamTab diagnostics. The only thing not directly *observed* (vs. inferred) is a green run in the dashboard Crons tab — optional confirmation, not an open risk.

## 6. Recommended approach + effort

**No code fix indicated.** Close the one open question with any **one** of these (human, ~5 min):

1. **Vercel Dashboard → Project → Crons** (or Observability → Logs, filter `/api/cron/cleanup-test-accounts`): read the last run's status. `200` = working; `500` = broken. *Fastest, fully read-only.*
2. **Compare keys:** Vercel `SUPABASE_SERVICE_ROLE_KEY` value vs Supabase Dashboard → Settings → API → `service_role` key. If different → stale → update Vercel + redeploy.
3. *(Avoid unless you accept the deletion)* Manually `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/cleanup-test-accounts` and read the JSON — `{ok:true,…}` vs `{error:"Cleanup failed", detail:"…Invalid API key…"}`. **Destructive** (deletes test orgs >14d); not recommended as a probe.

**If it turns out stale:** update `SUPABASE_SERVICE_ROLE_KEY` in Vercel to the current key and redeploy. **Effort: trivial (~5 min, no code).**

**Optional hardening (separate small PR, code):**
- The cron 500s silently on failure (visible only in Vercel logs). Add a `?dryRun=1`/health mode so it can be checked **without deleting**, and/or surface failures (log line the dashboard alerts on). This would have made this very diagnostic conclusive. ~Small.

## 7. Auto-pause coupling (context note)

Supabase free tier pauses after ~7 days of inactivity. **If the cron is working**, its daily `orgs` query doubles as a keep-alive. **If it's stale**, its request is rejected at the Supabase gateway (invalid key) and likely does **not** count as DB activity — meaning the cron is *not* protecting against pause, compounding the 7-day risk. Either way: **do not rely on this cron as the sole keep-alive.** (Supabase was awake at this diagnostic and at session start on 2026-06-19.)

---

## 8. STOP

No code or production state changed. The "broken since the May rotation" premise is **stale**: the rotation was completed on 2026-05-04 (new `sb_secret_` key wired into Vercel `SUPABASE_SERVICE_ROLE_KEY`, prod smoke-tested), and live `vercel env ls` corroborates the var is set in Prod+Preview with a matching ~May 4–5 timestamp. The cron is deployed, its secret gate works, and it reads the current key. The only item not directly *observed* (only inferred) is a 200 in the dashboard Crons run-history — a 30-second optional check (§6.1), not an open risk or a fix.
