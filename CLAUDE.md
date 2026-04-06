# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Velo CRM (v2.0) — a dental/general CRM with multi-language support (English/Arabic). React 19 SPA with Supabase backend, deployed on Vercel.

## Commands

- **Dev server:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Preview production build:** `npm run preview`

No test framework is configured.

## Architecture

### Frontend

- **React 19** + **Vite 8** with React Router DOM v7 for client-side routing
- Entry point: `src/main.jsx` → `src/App.jsx` (monolithic ~3,500 lines — central routing and state management hub)
- State is managed with React hooks (useState/useEffect/useCallback) in App.jsx and passed via props — no external state library
- Design system defined in `src/design.js` (8px grid, dark/light theming, CSS-in-JS style constants)
- Translations in `src/translations.js` (English/Arabic)

### Backend

- **Supabase** (PostgreSQL) for database, auth, and file storage with Row-Level Security
- **Vercel Serverless Functions** in `api/` directory:
  - `api/admin/payments.js` — admin payments endpoint (bypasses RLS with service key)
  - `api/webhooks/whatsapp.js` — WhatsApp Cloud API webhook handler
- Auth: Supabase email/password auth with rate limiting (5 attempts/5 min), 8-hour session timeout, and login lockout

### AI Integration

- Claude API called directly from the client using org-stored API key (`src/lib/ai.js`)
- Uses `claude-sonnet-4-20250514` for auto-replies, lead scoring, CRM analysis

### Key Directories

- `src/lib/` — Core services: Supabase client (`supabase.js`), auth (`auth.js`), CRUD operations (`database.js`), Claude integration (`ai.js`), input validation (`sanitize.js`), SQL schemas (`schema_*.sql`)
- `src/components/` — Reusable UI: AI assistant, command palette (Cmd+K), dental chart, toast/notifications, skeletons
- `src/pages/` — Page components: dashboard, calendar, finance, forms, reports, settings, tasks, projects, docs, growth intelligence module (`pages/growth/`)
- `scripts/` — Node.js migration utilities for GoHighLevel → Velo CRM data import (Puppeteer-based scraping)

## Environment Variables

Required (see `.env.example`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_SERVICE_KEY
```

Falls back to demo mode with sample data if Supabase is not configured.

## Deployment

Deployed on Vercel. `vercel.json` contains SPA rewrite rule (all routes → `/index.html`).

## Key Patterns

- App.jsx is the central hub — most new features involve adding routes and state here
- Inline styles using `design.js` constants rather than CSS classes
- Pages are self-contained: each page component in `src/pages/` manages its own local state and Supabase queries
- Super admin check is hardcoded by email in App.jsx
- Mobile breakpoint at 768px
