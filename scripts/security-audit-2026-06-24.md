# Security Audit — Velo Dental CRM

**Date:** 2026-06-24 · **Scope:** production codebase on `master` · **Type:** Phase 1 read-only diagnostic (no fixes, no exploit testing)
**Context:** Pre-onboarding hardening before Saif Dental (~3 weeks out). Stack: Supabase (Auth + RLS + Storage), Vercel (hosting + serverless), React/Vite SPA. No MongoDB, no SQL ORM.

---

## Executive summary

**Overall posture: STRONG core, with hardening gaps.** The authorization architecture is the standout — every one of the 12 serverless endpoints that uses the RLS-bypassing service-role key gates on an operator/owner/super-admin role check **before** the privileged operation, and the two intentionally-unauthenticated paths are scoped so they can only touch `status='test'` data. RLS + per-endpoint role gates mean **no cross-tenant data breach and no privilege-escalation path was found.**

**No CRITICAL findings. No actively-exploitable data breach.** The gaps are concentrated in (a) missing HTTP security headers, (b) a few endpoints leaking raw DB error text, and (c) brute-force protection that is client-side-only.

| Severity | Count | Notes |
|---|---|---|
| 🔴 CRITICAL | **0** | No auth bypass, no cross-tenant access, no committed secrets, no service-role key in the client bundle |
| 🟠 HIGH | **4** | Unauth DB-error leak; client-side-only login lockout; no CSP; no clickjacking protection |
| 🟡 MEDIUM | **11** | Security headers (3), error-message leaks (3), social-fetch hardening, PostgREST filter injection, local-disk live key, ErrorBoundary stack, dep version pinning |
| 🔵 LOW | **14** | Hygiene + defense-in-depth (CORS, client toasts, SPA 404, dep placement, etc.) |
| ⚙️ Config-dependent | **2** | Supabase dashboard settings (JWT expiry, reset-token TTL) — unverifiable from code |

### ⚠️ Most urgent (action before onboarding)
1. **🟠 H-4 — `api/auth/create-test-account.js:306` returns `detail: err.message` on the ONLY unauthenticated endpoint.** Any anonymous caller can trigger a DB error and receive raw Supabase/Postgres text — a free schema map of the dental module (table/column/constraint names). One-line fix (drop `detail`). **This is the single finding that changes the risk profile.**
2. **🟠 H-2 / H-3 — No CSP and no X-Frame-Options.** An authenticated CRM with patient + financial data has no clickjacking protection and no XSS-exfiltration defense-in-depth. Both fixed in one `vercel.json` headers block (do all 6 headers at once — see §5).
3. **🟠 H-1 — Login lockout / "5 per 5 min" is client-side, in-memory only.** It does not protect the real Supabase auth endpoint; scripted brute-force bypasses it. Mitigate via Supabase's server-side auth rate limiting + CAPTCHA.

**Reassuring:** the previously-documented "client-side Claude API key" risk (CLAUDE.md) is **already remediated** — the key moved server-side to `api/ai/chat.js`; the client sends a JWT. CLAUDE.md is stale and should be updated.

---

## Findings by category

### Category 1 — Authentication

| ID | Sev | File:line | Finding |
|---|---|---|---|
| **H-1** | 🟠 HIGH | `src/lib/sanitize.js:136-158` (used by `Auth.jsx:129`, `Join.jsx:246`) | **Login rate-limit/lockout is client-side, in-memory only.** `checkRateLimit()` stores attempts in a module-level JS object in the browser tab — resets on reload, gone in a new tab/incognito, never reaches the server. The real credential check (`supabase.auth.signInWithPassword`) is not gated by it. Scripting directly against Supabase's `/auth/v1/token` bypasses it entirely. The documented "5/5min" + "login lockout" provide **no real brute-force protection**. **Fix:** enable Supabase Auth's server-side rate limiting + CAPTCHA/Turnstile in the dashboard, or front auth with a proxy enforcing per-IP/email limits in a shared store. Keep the client throttle as UX only. |
| L-1 | 🔵 LOW | `src/lib/sanitize.js:192-207` + `src/App.jsx:547-559` | **"8h session timeout" is a client-side inactivity logout** (localStorage `velo_last_active`, 60s interval). Bypassable; does not shorten the actual Supabase token lifetime. The main client (`supabase.js:19-21`) calls `createClient` with no auth options → tokens auto-refresh until server-side expiry. **Fix:** rely on the Supabase JWT expiry (see C-1); keep the inactivity logout as UX. |
| L-2 | 🔵 LOW | `src/lib/auth.js:74-78` | `resetPassword()` calls `resetPasswordForEmail(email)` with **no `redirectTo`** and no documented TTL → reset link uses the project default Site URL; expiry is dashboard-governed (see C-2). **Fix:** pass an explicit allow-listed `redirectTo`. |

**OK (no issue):** Password storage — Supabase-managed bcrypt; no custom/plaintext hashing anywhere (the only HMAC-SHA256 in code is WhatsApp webhook signature verification). Logout invalidation — `signOut()` revokes the refresh token server-side, clears React state + all `velo_*` localStorage; `onAuthStateChange` forces `setUser(null)` on `SIGNED_OUT`. **CSRF — N/A:** bearer-JWT auth in the `Authorization` header (not cookies); a cross-site request cannot forge it. No cookie-based state-changing flow exists.

### Category 2 — API endpoint authorization

**Per-endpoint matrix (all 12 read):**

| Endpoint | AuthN | Resource/role AuthZ | Verdict |
|---|---|---|---|
| `admin.js` | ✅ getUser | ✅ operator check before service-role op | PASS |
| `admin/payments.js` | ✅ getUser | ✅ `is_super_admin`, read-only | PASS |
| `ai/chat.js` | ✅ getUser | ✅ org-scoped, rate-limited 100/hr/org | PASS |
| `auth/create-test-account.js` | ⛔ open (intentional) | N/A — only `status='test'` data | MEDIUM (no rate limit) |
| `cron/cleanup-test-accounts.js` | ✅ `CRON_SECRET` bearer | N/A — deletes only `status='test'` | PASS |
| `invitations/accept.js` | ✅ getUser | ✅ RPC as caller, RLS + email-match in DB | PASS |
| `invitations/create.js` | ✅ getUser | ✅ owner-only + own `org_id` | PASS |
| `invitations/[id].js` | ✅ getUser | ✅ operator OR owner-of-same-org | PASS |
| `operator/set-secret.js` | ✅ getUser | ✅ operator check before service-role upsert | PASS |
| `social-fetch.js` | ✅ getUser | ⚠️ logged-in only, no org scope | **MEDIUM/HIGH** |
| `webhooks/whatsapp.js` | N/A (webhook) | ✅ HMAC-SHA256 timing-safe verify per-org | PASS |
| `whatsapp/send.js` | ✅ getUser | ✅ own org_id, patient scoped, rate-limited | PASS |

| ID | Sev | File:line | Finding |
|---|---|---|---|
| **M-1** | 🟡 MEDIUM | `api/social-fetch.js:42-61` | **Weakest endpoint.** Authenticated but **not org-scoped and not rate-limited** (any logged-in user, any org). It's an open server-side fetch proxy: for Snapchat it fetches `https://www.snapchat.com/add/${username}` with **unvalidated `username`** concatenated in (mild SSRF/path-injection). It falls back to **server-held** `TWITTER_BEARER_TOKEN` / `GOOGLE_PLACES_API_KEY` when the caller omits a token → any user can spend the org's API quota with no throttle. **Fix:** add per-org rate limiting (mirror `ai/chat.js`), whitelist `username` (`[A-Za-z0-9._-]`), restrict the server-token fallback, org-scope the call. |
| M-2 | 🟡 MEDIUM | `api/auth/create-test-account.js:77-91` | **Unauthenticated service-role write with no rate limiting** (deferred by design: "abuse prevention out of scope for Sprint 0; 14-day cron is the safety net"). A script can mass-create auth users + orgs + ~70 seeded rows each until the daily cron reaps them. Blast radius limited to `status='test'` → not CRITICAL. **Fix:** per-IP rate limit / CAPTCHA / global cap on live test orgs. (Same endpoint as H-4 below.) |
| L-3 | 🔵 LOW | `api/social-fetch.js:60` | Uses the **service-role client just to call `auth.getUser()`** — heavier than needed and a latent risk if a future DB read is added without an org filter. **Fix:** verify the JWT with the anon key; instantiate the service client only when an RLS-bypass is actually required. |
| L-4 | 🔵 LOW | `api/admin/payments.js:16` (also `ai/chat`, `create-test-account`, `invitations/*`, `whatsapp/send`) | **CORS `Access-Control-Allow-Origin: '*'`** on an endpoint returning cross-tenant financial data. Not exploitable alone (bearer token still required, browsers don't auto-attach it cross-origin) but needlessly permissive. **Fix:** restrict to the app origin (as `social-fetch.js` already does). |
| L-5 | 🔵 LOW | `api/admin/payments.js:61` | Queries table `organizations` while the rest of the code uses `orgs` → org names silently fall back to "Unassigned". **Correctness, not security** — but suggests this admin endpoint is partly untested. **Fix:** confirm table name + join path. |

**No CRITICAL/HIGH-with-precondition.** Horizontal-escalation checks are consistent (`org_id` always derived from the caller's own profile, never the request body). Cron returns 500 if `CRON_SECRET` is unset (no insecure fallback). Webhook is the strongest endpoint (raw-body HMAC + `timingSafeEqual`, no mutation before verification).

### Category 3 — Hardcoded secrets / credentials

| ID | Sev | File:line | Finding |
|---|---|---|---|
| M-3 | 🟡 MEDIUM | `.env.local` (untracked, gitignored) | **A live Supabase service-role key (RLS-bypass) sits in plaintext in the local-only `.env.local`.** Verified **NOT in git** (not in index, not in history; only `.env.example` is tracked) — so this is **local-disk exposure only** (laptop theft, accidental `git add -f`, unencrypted cloud backup/sync), not a repo leak. Standard Vite practice, but the value is a real production key. **Fix:** keep it gitignored (already is); avoid unencrypted folder sync; **rotate the service-role key if the disk was ever imaged/shared.** *(Key value intentionally not reproduced in this report.)* |
| L-6 | 🔵 LOW | `.gitignore:13,26-35` | Redundant/overlapping env rules. Coverage is correct (`.env*` + `!.env.example` is the effective rule); cosmetic only. |

**CLEAN (verified):** No secret values committed in `src/`, `api/`, `scripts/`, or root config. No AWS keys (`AKIA`), no private keys (`-----BEGIN`), no DB connection strings (`postgres://`), no hardcoded JWTs/Anthropic/Stripe keys. All `SUPABASE_SERVICE_ROLE_KEY` (12 refs) and `ANTHROPIC_API_KEY`/`WHATSAPP_*`/`CRON_SECRET` are `process.env` reads in `api/` only — **zero references in `src/`**, none `VITE_`-prefixed. Every `VITE_`-prefixed (client-bundled) var is non-sensitive (URL, anon key, app URL, operator contact, feature flag). `.env.example` is placeholders only. Migration scripts take creds via CLI/env, no literals. **Per-org `org_secrets`** are written behind operator auth and **never logged** (audit payload stores `{ kind }` only). **CLAUDE.md "client-side Claude key" risk is RESOLVED** — migrated to the `api/ai/chat.js` proxy; client legacy key functions are no-op stubs. → Update CLAUDE.md.

### Category 4 — SQL / NoSQL injection

**NoSQL injection: N/A** — no document DB (no MongoDB/Firestore/Dynamo; zero `$where`/`$ne`/`mongoose` anywhere). **Classic SQL injection: none** — no ORM, no raw/template-literal SQL in app code, all `.eq/.in/.match/.insert/.update` use parameterized client args. The only interpolation surface is two PostgREST `.or()` filter-strings.

| ID | Sev | File:line | Finding |
|---|---|---|---|
| M-4 | 🟡 MEDIUM | `src/lib/appointments.js:245` (sanitizer `sanitize.js:17-18,35`) | **PostgREST `.or()` filter built from search input via an HTML-only sanitizer.** `.or(\`full_name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%\`)` — `sanitizeText` strips HTML but **not** PostgREST metacharacters (`,()*.\:`). Input like `foo,org_id.neq.<uuid>` injects extra OR-disjuncts. **Not** cross-tenant (bounded by `.eq('org_id', orgId)` + RLS) — impact is filter-logic manipulation / wildcard injection / malformed-filter errors within the caller's own org. **Fix:** add `sanitizeOrFilterValue()` to `sanitize.js` (strip/encode `,()*\:` and leading-`.`), or replace the `.or()` with an RPC taking the term as a bound param. |
| L-7 | 🔵 LOW | `api/webhooks/whatsapp.js:201` | `.or()` interpolates **raw `senderPhone`** as the second comparand (the first is digits-only sanitized). Reachable only after the HMAC signature check, and real Meta phone values can't contain metacharacters → defense-in-depth gap, not practically reachable. **Fix:** use `senderPhone.replace(/\D/g,'')` for both comparands. |

**CLEAN:** All 3 user-callable RPCs (`get_invitation_preview`, `accept_invitation`, `set_prescription_template_url`) are parameterized — read in full in `schema.sql`. **Zero dynamic SQL** in the schema (no `EXECUTE '<string>'`, `format()`, `quote_ident`, or `||`-built SQL; every `EXECUTE FUNCTION` is trigger-binding syntax). All SECURITY DEFINER functions `SET search_path = public`. Migration `.sql` files are human-run DDL, no external data.

### Category 5 — Deployment configuration (Vercel + Supabase + Vite)

`vercel.json` has `rewrites` + `crons` but **no `headers` block** → no security headers at all.

| ID | Sev | Finding | Recommended header |
|---|---|---|---|
| **H-2** | 🟠 HIGH | **No `Content-Security-Policy`** — no XSS-exfiltration defense-in-depth on an app holding patient/financial data + AI/WhatsApp surfaces. | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (deploy **report-only first**; `'unsafe-inline'` needed on `style-src` for `design.js` inline styles, **not** on `script-src`). |
| **H-3** | 🟠 HIGH | **No `X-Frame-Options`** — clickjacking against authenticated sessions. | `X-Frame-Options: DENY` (+ CSP `frame-ancestors 'none'`). |
| M-5 | 🟡 MEDIUM | No `X-Content-Type-Options` — MIME-sniff/content-confusion on assets/uploads. | `X-Content-Type-Options: nosniff` |
| M-6 | 🟡 MEDIUM | No `Referrer-Policy` — full URLs (incl. `/join?token=` invite links) leak via `Referer`. | `Referrer-Policy: strict-origin-when-cross-origin` |
| M-7 | 🟡 MEDIUM | **HSTS unconfirmed/likely absent** — not declared in-repo; Vercel may serve it on prod domains but not guaranteed for custom domains. | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (add `preload` only when all subdomains are HTTPS-only). |
| L-8 | 🔵 LOW | No `Permissions-Policy` — unused powerful features not disabled. | `Permissions-Policy: camera=(), microphone=(), geolocation=()` |

**All 6 are one `vercel.json` change** (a `"headers"` array on `"source": "/(.*)"`; safe because `/api/*` resolves before rewrites). **CLEAN:** source maps **off** (Vite default `build.sourcemap:false`; `vite.config.js` doesn't override — flag if anyone sets it true); no prod debug flags (`import.meta.env.DEV` guards are dead-stripped); anon key is the only client Supabase key; **zero** `service_role` references in `src/`; HTTPS + cert by default; SPA rewrite doesn't shadow `/api/*`; `supabase.js:6-12` fail-fast throws on missing keys in PROD.

### Category 6 — Dependency audit

`npm audit`: **9 vulnerabilities (1 low, 3 moderate, 5 high).** **Headline: every one is build-, dev-, or script-only — ZERO reach the production runtime** (the deployed `api/` functions import only `@supabase/supabase-js` + Node `crypto`; nothing else from the vulnerable set is imported by `src/` or `api/`).

| Package | npm sev | Prod-effective | Reaches via | Fix |
|---|---|---|---|---|
| `ws` 8.0.0–8.20.1 | high | **none** | puppeteer scripts; `@supabase/realtime-js` lists it but never imports it (uses native `WebSocket`; Realtime is unused — no `.channel()`/`.subscribe()` anywhere) | `npm audit fix` (non-breaking) |
| `vite` 8.0.0–8.0.15 | high | **none** | dev server only (never runs in prod) | → ≥8.0.16 |
| `react-router` / `react-router-dom` | high | **low** | direct client dep — but advisories are SSR/framework-mode (this is a client SPA; SSR surface not deployed) | → ≥7.15.x (within v7) |
| `basic-ftp`, `ip-address`, `js-yaml` | high/mod | **low** | puppeteer/eslint transitive (scripts/dev) | `npm audit fix` |
| `postcss`, `@babel/core` | mod/low | **low** | vite build / eslint | `npm audit fix` |

| ID | Sev | Finding |
|---|---|---|
| M-8 | 🟡 MEDIUM (hygiene) | **No version pinning** — every dep uses floating `^`; installs aren't reproducible without the lockfile. **Fix:** rely on committed `package-lock.json`; consider pinning security-sensitive deps. |
| L-9 | 🔵 LOW | **`puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth` are in `dependencies` but only used by `scripts/`** — they should be `devDependencies` and are the source of 4 of the 9 advisories. Moving them removes those from any prod-context audit. |
| L-10 | 🔵 LOW (info) | All 9 are fixable with a single **non-breaking** `npm audit fix` (no major bumps). **No typosquatting** — all direct deps are legitimate well-known packages. |

### Category 7 — Error handling / information disclosure

**Generally well-handled** — 9 of 12 endpoints sanitize errors, log server-side, and never echo raw DB text (several carry explicit "never echo" comments). Findings concentrated in 3 endpoints + the client ErrorBoundary.

| ID | Sev | File:line | Finding |
|---|---|---|---|
| **H-4** | 🟠 HIGH | `api/auth/create-test-account.js:306` | **`detail: err.message` on the ONLY unauthenticated endpoint.** Errors derive from raw Supabase exceptions (lines 108–281, e.g. `seedPatients: <pg error>`) → an anonymous caller gets a free schema map (table/column/constraint names) of the dental module. **Fix:** drop `detail`; keep the existing server `console.error`. Optionally return a static `step` label. |
| M-9 | 🟡 MEDIUM | `api/admin.js:131` | Catch echoes raw `err.message` (fed by `throw insertErr`/`throw error`) → Postgres constraint/table names to the (operator-authed) client. The **only** endpoint piping a raw Supabase message to the body. **Fix:** static `'Internal error'` + server log (mirror `invitations/create.js`). |
| M-10 | 🟡 MEDIUM | `api/admin/payments.js:66` | Early-return echoes raw `paymentsRes.error.message` — inconsistent with its own outer catch (which returns generic). **Fix:** static message + server log. |
| M-11 | 🟡 MEDIUM | `api/social-fetch.js:168` | Blanket `error.message` echo. Current thrown strings are app-authored (safe), but any unexpected/future throw would leak. **Fix:** generic fallback + server log. |
| M-12 | 🟡 MEDIUM | `src/main.jsx:15` | **ErrorBoundary renders the full JS stack trace to the prod DOM** on any render crash (no `import.meta.env.DEV` guard; styled as a dev debug panel). Leaks bundle structure + bad UX (clinic staff see a stack dump). **Fix:** DEV-gate the stack; show a friendly "reload" card in prod + `console.error`. |
| L-11 | 🔵 LOW | `api/cron/cleanup-test-accounts.js:96` | `detail: err.message` — but `CRON_SECRET`-gated (operator audience). Consistency only. |
| L-12 | 🔵 LOW | `ai/chat.js`, `invitations/*`, `whatsapp/send.js`, `operator/set-secret.js`, `social-fetch.js` | Several pre-body `await`s (getUser/profile) aren't in a top-level try/catch → an unexpected throw yields Vercel's default 500 (stack masked in prod, but breaks the JSON envelope). **Fix:** wrap handler bodies (5 endpoints already do). |
| L-13 | 🔵 LOW | `vercel.json:2` + `src/App.jsx:198` | **No SPA 404/catch-all** — app uses a manual `page` switch, not React Router `<Routes>`; an unknown path renders a **blank** content area. **Fix:** render `<NotFound>` (or redirect to dashboard) when `page` ∉ known set. |
| L-14 | 🔵 LOW | client (~36 sites: `Auth.jsx`, `AppointmentsPage`, `InventoryPage`, `DentalTabs`, `OperatorConsole`, …) | Client toasts render `err.message` verbatim over direct Supabase calls → a constraint violation shows the raw Postgres constraint name in a toast. Lower risk (client holds its own org data). **Fix:** centralize error mapping in the `src/lib/` data layer rather than per-call. |

**Done well:** `ai/chat.js`, `whatsapp/send.js`, `webhooks/whatsapp.js`, `invitations/accept.js` (explicit `mapAcceptError`), `invitations/create.js`/`[id].js`, `operator/set-secret.js` — all log server-side + return static/mapped messages. HTTP status codes are consistent and correct across all 12 (401/403/404/405/410/429/500/502/503).

---

## Does NOT apply

- **NoSQL injection** — no document database in the stack (Postgres-only via Supabase).
- **SQL ORM misuse** — no ORM; Supabase client + parameterized RPCs only.
- **Password hashing algorithm/cost factor** — Supabase-managed (bcrypt); not app-configurable, no custom hashing exists.
- **HTTPS / TLS certificate** — provided + auto-renewed by Vercel; verified default, no misconfiguration.
- **Cookie-based CSRF** — bearer-JWT auth, no auth cookies → classic CSRF not applicable.
- **Source-map exposure** — Vite default is off and not overridden; nothing to fix (noted as a watch item).

## ⚙️ Config-dependent — verify in the Supabase dashboard (not visible in code)

- **C-1 — JWT / access-token expiry ≤24h.** Code sets no override (`createClient` with no auth options). Supabase default access token = **1h** (meets the requirement) — **confirm** the dashboard value and the refresh-token absolute/inactivity timeout align with the intended 8h policy.
- **C-2 — Password-reset / recovery token TTL ≤1h.** `resetPasswordForEmail` sets nothing. Supabase default = **3600s** (meets it) — **confirm** in dashboard. Also confirm Supabase Auth **server-side rate limiting + CAPTCHA** are enabled (the real control behind H-1).

---

## Recommended triage

### 🔴 This week (before Saif Dental onboarding)
Small, high-leverage, mostly config/one-liners:

1. **H-4** — drop `detail: err.message` from `create-test-account.js` (unauth schema leak). *~1 line.*
2. **H-2 / H-3 / M-5 / M-6 / M-7 / L-8** — add the full security-headers block to `vercel.json` (CSP report-only first, X-Frame-Options, nosniff, Referrer-Policy, HSTS, Permissions-Policy). *One file, all 6 headers at once.*
3. **H-1 + C-1 + C-2** — in the Supabase dashboard: enable server-side auth rate limiting + CAPTCHA; confirm JWT expiry ≤24h and reset-token TTL ≤1h. *Config, no code.*
4. **M-9 / M-10 / M-11 / M-12** — replace raw `err.message` echoes with static messages (`admin.js`, `admin/payments.js`, `social-fetch.js`) and DEV-gate the ErrorBoundary stack. *Small, mechanical.*
5. **M-1** — `social-fetch.js`: add per-org rate limit + `username` whitelist + restrict server-token fallback. *Medium effort; do before any external social usage.*

### 🟡 Scheduled (next sprint, before GA / scale)
6. **M-4** — add `sanitizeOrFilterValue()` and apply at `appointments.js:245` (+ fix L-7 phone interpolation).
7. **M-2** — real abuse control on `create-test-account` (per-IP limit / CAPTCHA / global test-org cap).
8. **M-8 / L-9 / L-10** — dependency hygiene: `npm audit fix` (non-breaking, clears all 9), move `puppeteer*` to `devDependencies`, confirm lockfile pinning.
9. **L-13 / L-14** — SPA 404 fallback; centralize client error mapping in `src/lib/`.
10. **Docs** — update CLAUDE.md to remove the stale "client-side Claude key" risk (resolved).

### 🔵 Backlog / hygiene
- L-2 (`redirectTo` on reset), L-3 (anon key for `getUser`), L-4 (tighten CORS from `*`), L-5 (`organizations` vs `orgs`), L-6 (.gitignore cleanup), L-11/L-12 (error consistency), M-3 (rotate the local service-role key if the disk was ever shared).

---

*Phase 1 complete. No code, schema, or configuration was changed. No exploits were run against any system. All findings are static-analysis based; the two config-dependent items (C-1, C-2) require a human to read the Supabase dashboard.*
