# CLAUDE.md — Velo CRM

Multi-tenant CRM SaaS for clinics. React + Vite + Supabase (Postgres, RLS).
Canonical architecture reference: ARCH-V2-PLATFORM.md — read it before structural changes.

## Non-negotiable workflow

1. Before building any feature or component: use the brainstorming skill.
   Present a short design and get approval before writing code.
2. All new logic is test-first (TDD): failing tests first, minimal implementation,
   watch them pass. Use Vitest. Business logic lives in pure functions under
   src/lib/ so it is testable without the DOM.
3. All bugs go through systematic-debugging: reproduce, read the error, form a
   hypothesis, make ONE change. Never shotgun-fix.
4. Never claim done without evidence (verification-before-completion): paste
   passing test/build output before saying a task is complete.
5. UI work loads the design skills: ui-ux-pro-max (run its search tool),
   frontend-design, vercel-react-best-practices; gsap-react + gsap-core for animation.
6. Before opening a PR: run /security-review on the diff. This codebase handles
   patient health data — treat every RLS policy change as security-critical.

## Design system (brand book v2.0 — overrides any skill's palette suggestion)

- Navy #0A2540 (primary surface/header), Teal #14B8A6 (action/accent)
- Background #F8FAFC, card #FFFFFF, border #E2E8F0 (flat, 1px, no gradients, no heavy shadows)
- Status: confirmed teal, in-progress navy/blue, waiting amber, no-show/danger red
- Type: IBM Plex Sans; IBM Plex Mono with tabular numerals for money and times
- Money is always dual-currency aware (IQD / USD). IQD with thousands separators, never decimals.
- Accessibility floor: 4.5:1 contrast, 44x44px touch targets, visible focus rings,
  prefers-reduced-motion respected in every animation, RTL-safe layout (logical
  properties: margin-inline, inset-inline) — Arabic UI is coming.

## Animation rules (gsap-core / gsap-react)

- GSAP via useGSAP hook with proper scope + cleanup; never bare useEffect without context revert.
- Durations 150–300ms for UI feedback; entrance staggers <= 0.06s per item.
- Every animation wrapped in gsap.matchMedia() with a reduced-motion branch.

## React performance (vercel-react-best-practices)

- No data-fetch waterfalls: parallelize independent Supabase queries with Promise.all.
- Long lists (patients, appointments) are virtualized.
- Colocate state; memoize only what measurement says to memoize.
- Import directly, no barrel files.

## Scheduling domain rules

- Conflict detection: src/lib/scheduling/conflicts.mjs (same-chair overlap OR
  gap < sterilization buffer, symmetric). Keep its test file green; extend test-first.
- The database is the last line of defense: chair double-booking is also blocked
  by a Postgres exclusion constraint (see supabase/migrations). App-level checks
  are UX; the constraint is truth.

## Multi-tenant safety

- Every table has org scoping enforced by RLS. Never write a query that assumes
  a single org. Never disable RLS "temporarily".
- Secrets never appear in code, chat transcripts, or commits. If exposed, rotate
  immediately — zero tolerance.
