# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Velo CRM (v2.0) — a dental/general CRM with multi-language support (English/Arabic). React 19 SPA with Supabase backend, deployed on Vercel. Multi-tenant with agency impersonation. Production currently holds test-scale data — treat the dental module with production-grade care regardless. See docs/DATA-HISTORY.md for historical context on Saif Dental's planned GHL migration.

## Commands

- **Dev server:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Preview production build:** `npm run preview`

No test framework is configured. (Tech debt — adding Vitest is roadmap work.)

## Architecture

### Frontend
- **React 19** + **Vite 8** with React Router DOM v7
- **JavaScript, not TypeScript** — files are `.jsx` and `.js`
- Entry: `src/main.jsx` → `src/App.jsx` (monolithic ~3,500 lines — central routing/state hub)
- State via React hooks in App.jsx, passed by props — no external state library
- Design system in `src/design.js` (8px grid, dark/light theming, CSS-in-JS constants)
- Inline styles via `design.js` constants — Tailwind v4 installed but not used for component styles
- Translations in `src/translations.js` (English/Arabic)
- Mobile breakpoint: 768px
- **Comprehensive design docs in `design-system.md` at repo root — read this before any UI work**

### Backend
- **Supabase** (Postgres) for DB, auth, storage with Row-Level Security
- Auth: Supabase email/password, rate limit (5/5min), 8h session timeout, login lockout
- **Vercel Serverless Functions** in `api/` — 12 functions (Hobby tier ceiling; see Infra note below). **The service-role key (which bypasses RLS) is used in 11 of the 12** — only `api/invitations/accept.js` runs as the caller (its SECURITY DEFINER RPC needs the real `auth.uid()`). Despite the name, only `api/admin/payments.js` actually lives under `api/admin/`. Grouped by who calls them:
  - **End-user-facing** (caller is a clinic user with a Supabase JWT — these MUST self-enforce auth + org-scope + role; RLS does NOT protect them, see the invariant below):
    - `api/whatsapp/send.js` — send outbound WhatsApp; role-gated to owner/doctor/receptionist (PR #47), org-scoped patient lookup
    - `api/invitations/create.js` — owner invites a member; owner-role-gated
    - `api/invitations/[id].js` — revoke invite; owner-or-operator-gated
    - `api/invitations/accept.js` — accept invite; runs as caller (no service role)
    - `api/ai/chat.js` — Claude proxy; JWT-verified + org-resolved, ⚠️ no role gate (any member can spend the org's AI budget) — touches only `profiles`/`ai_usage`, no clinical data
    - `api/social-fetch.js` — social stats scrape; JWT-only, ⚠️ no org-scope (no DB read/write, no clinical data)
  - **System / elevated-facing** (own auth, not an end-user identity):
    - `api/webhooks/whatsapp.js` — Meta inbound webhook; per-org HMAC signature verification
    - `api/cron/cleanup-test-accounts.js` — cron; `Bearer CRON_SECRET`
    - `api/auth/create-test-account.js` — **public/unauthenticated by design**; only ever creates a fresh test org (no cross-tenant reach), gated to `status='test'` downstream
    - `api/operator/set-secret.js` — operator-gated (checks `operators` table)
    - `api/admin.js` — operator org CRUD; operator-gated
    - `api/admin/payments.js` — cross-org payments; super-admin-gated (`profiles.is_super_admin`)

### AI Integration
- Claude API is proxied **server-side** via `api/ai/chat.js` (rate-limited per org through `ai_usage`); the client (`src/lib/ai.js`) calls that endpoint. The API key lives in server env, **not** the bundle — the earlier client-side-key exposure is resolved.
- Model: `claude-sonnet-4-20250514` for auto-replies, lead scoring, CRM analysis
- ⚠️ Remaining gap: `api/ai/chat.js` has no role gate — any authenticated org member can spend the org's AI budget (see Backend).

### Key Directories
- `src/lib/` — services: `supabase.js`, `auth.js`, `database.js`, `ai.js`, `sanitize.js`, `permissions.js`, `dental.js`, `whatsapp.js`, `invitations.js`, plus SQL schemas (`schema_*.sql`)
- `src/components/` — reusable UI: AI assistant, command palette (Cmd+K), dental chart/tabs, toasts, skeletons, modals
- `src/pages/` — pages: dashboard, calendar, finance, forms, reports, settings, tasks, projects, docs, agency dashboard, growth intelligence (`pages/growth/`)
- `scripts/` — Node migration utils for GoHighLevel → Velo import (Puppeteer-based)

## Working with this codebase — context constraints

**1. App.jsx is 273 KB.** Do NOT read it whole-file by default. Use Grep/search to locate the relevant section, then read with line ranges. Suggest extracting routes or state slices into smaller files only when a natural seam appears — don't do unsolicited refactors.

**2. Other large files** (SettingsPage 90KB, AppointmentsPage 58KB, TasksPage 45KB, FinancePage 35KB, ProjectsPage 31KB) — same rule: search before reading.

**3. Don't pile new features into App.jsx.** Prefer new files in `src/pages/` or `src/components/`.

## Non-negotiable invariants

**Multi-tenancy via RLS — every query, every time.**
- Every tenant-scoped table has `org_id` (NOT `tenant_id`). Every read/write enforced by RLS at the DB via the `current_org_id()` helper.
- Never bypass RLS from the client. The client only ever uses the anon key (`src/lib/supabase.js`); the service-role key is server-only.
- **Service-role bypasses RLS, and it is used broadly across `api/` (11 of 12 functions), not just `api/admin/`.** Any service-role endpoint that an **end user** can call MUST self-enforce at the top of the handler: (1) verify the Supabase JWT, (2) resolve the caller's `org_id` **and `role`** from `profiles`, (3) explicitly `org_id`-scope every query and role-gate the action — RLS will not. Canonical pattern: `api/invitations/create.js` (and `api/whatsapp/send.js` per PR #47). System endpoints (webhook/cron/operator/admin) instead use their own auth (HMAC, cron secret, operator/super-admin check). See the Backend section for the per-endpoint breakdown.
- New tables: write the RLS policy in the same migration.

**Agency impersonation.**
- When an agency user acts on a sub-account, track both acting user and effective tenant. Audit-log every write with both.
- Reference: `src/pages/AgencyDashboard.jsx`, `src/pages/agency/`.

**Currency: minor units + currency code.**
- IQD in fils, USD in cents. Never store decimals.
- Every monetary column has a sibling currency column.
- Never sum across currencies without explicit conversion.

**Dental module is live.**
- Live schema, test-scale data today. Schema changes follow full ceremony regardless of row count.
- Schema changes to dental tables require dry-run on a copy + written rollback plan.
- Files: `src/lib/dental.js`, `DentalChart.jsx`, `DentalTabs.jsx`, `DentalDashboard.jsx`.

## Known risks / tech debt
- `api/ai/chat.js` and `api/social-fetch.js` are user-facing service-role endpoints with no role gate (JWT-only) — flagged for the V1.5 permissions rework (see `scripts/v1.5-architecture-diagnostic.md` §8)
- Two parallel privilege models coexist: `profiles.is_super_admin` (used by `api/admin/payments.js`) vs the `operators` table (used by other operator endpoints) — reconcile during the permissions rework
- Hardcoded super-admin email in App.jsx — replace with `super_admin` role flag during permissions rework
- No automated tests
- Monolithic App.jsx (extraction is roadmap work)

## Code conventions
- One component per file, PascalCase filename
- Hooks named `use*`, one per file when non-trivial
- Supabase access via `src/lib/database.js` and other `src/lib/` modules — components don't call `supabase.from()` directly
- Stages, statuses, role names NEVER hardcoded — fetch from config/role tables
- Errors: surface via toast + structured log; never silent-catch
- Use `src/lib/sanitize.js` for any user input touching the DB or DOM

## Workflow expectations
- `/plan` before non-trivial work
- `/code-review` before pushing anything touching auth, RLS, billing, or dental
- `/security-review` for changes to auth, RLS, env handling, or `api/admin/*`
- UI work: read `design-system.md` first

## Active rules (from ~/.claude/rules/)
- `common/security.md`, `common/testing.md`, `common/code-review.md`, `common/git-workflow.md`, `common/performance.md`
- `web/*` for React/Vite patterns

## Active skills (from ~/.claude/skills/)
- `frontend-patterns`, `backend-patterns`, `security-review`, `continuous-learning-v2`

## Things Claude must never do
- Never read App.jsx whole-file by default — search first.
- Never write a query without confirming the RLS policy.
- Never run a migration against production from chat — generate the SQL, the human reviews and runs.
- Never store secrets in the repo. Vercel env vars + Supabase vault only.
- Never modify `dental_*` tables without explicit confirmation.

## Environment Variables

Required (see `.env.example`):

    VITE_SUPABASE_URL              # client-bundled
    VITE_SUPABASE_ANON_KEY         # client-bundled
    SUPABASE_SERVICE_ROLE_KEY      # server-only — never VITE_-prefixed

Falls back to demo mode with sample data if Supabase is not configured.

## Deployment

Vercel. `vercel.json` has SPA rewrite (all routes → `/index.html`).