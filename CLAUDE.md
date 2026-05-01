# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Velo CRM (v2.0) — a dental/general CRM with multi-language support (English/Arabic). React 19 SPA with Supabase backend, deployed on Vercel. Multi-tenant with agency impersonation. Has live customer data including 3,000+ dental patient records — handle accordingly.

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
- **Vercel Serverless Functions** in `api/`:
  - `api/admin/payments.js` — admin payments (bypasses RLS with service key)
  - `api/webhooks/whatsapp.js` — WhatsApp Cloud API webhook
- Auth: Supabase email/password, rate limit (5/5min), 8h session timeout, login lockout

### AI Integration
- Claude API called from client (`src/lib/ai.js`) using org-stored key
- Model: `claude-sonnet-4-20250514` for auto-replies, lead scoring, CRM analysis
- ⚠️ Risk: client-side key exposure. Migrate to a Vercel Function proxy when bandwidth allows.

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
- Every tenant-scoped table has `tenant_id`. Every read/write enforced by RLS at the DB.
- Never bypass RLS from the client. Service-role key is only used in `api/admin/*`.
- New tables: write the RLS policy in the same migration.

**Agency impersonation.**
- When an agency user acts on a sub-account, track both acting user and effective tenant. Audit-log every write with both.
- Reference: `src/pages/AgencyDashboard.jsx`, `src/pages/agency/`.

**Currency: minor units + currency code.**
- IQD in fils, USD in cents. Never store decimals.
- Every monetary column has a sibling currency column.
- Never sum across currencies without explicit conversion.

**Dental module is live.**
- 3,000+ real patient records.
- Schema changes to dental tables require dry-run on a copy + written rollback plan.
- Files: `src/lib/dental.js`, `DentalChart.jsx`, `DentalTabs.jsx`, `DentalDashboard.jsx`.

## Known risks / tech debt
- Client-side Claude API key (see AI Integration)
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

    VITE_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY
    VITE_SUPABASE_SERVICE_KEY

Falls back to demo mode with sample data if Supabase is not configured.

## Deployment

Vercel. `vercel.json` has SPA rewrite (all routes → `/index.html`).