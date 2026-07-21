# Performance Audit — Velo/SupCod3 Dental (React + Vite)

**Date:** 2026-07-22 · **Scope:** entire `src/` tree, read-only (no code changes)
**Method:** [vercel-react-best-practices](../../.claude/skills/vercel-react-best-practices) rules (React-core + JS + bundle categories; Next.js-only rules — Server Components, `next/dynamic`, ISR, RSC — excluded as N/A for Vite).
**Audience impact lens:** clinic front desk, mid-range hardware, Iraqi broadband (high latency, moderate bandwidth). Repeated network round-trips and dev-mode render cost hurt most here.

---

## Build evidence (baseline)

`npm run build` (rolldown-vite, current config):

| Artifact | Size | gzip | Note |
|---|---|---|---|
| `index-*.js` (main entry) | **703 KB** | — | shell + App.jsx monolith + **dev-mode React** |
| `heic2any-*.js` | 1,352 KB | 345 KB | lazy (loads only on HEIC upload) — **OK** |
| `jsx-dev-runtime-*.js` | 25 KB | 8 KB | **should be ~0 in prod** |
| `index-*.css` | 99.6 KB | 18.2 KB | Tailwind — acceptable |
| `supabase-*.js` | 184 KB | — | vendor, lazy-adjacent |

**Smoking-gun measurements:**
- `jsxDEV(` appears **1,055×** in the production `index.js`.
- Dev-only React strings present in the prod bundle: `"Each child in a list"`, `"Invalid hook call"` (these exist ONLY in `react-dom.development`).
- `ReactQueryDevtools` code is **present in the prod bundle** (`index`, `OJ5GAW4I` chunks).
- No `react-dom.production` / `scheduler.production` strings found — **the production build is bundling development React.**

Root cause located: `.env.local` and the committed template `.env.example` both set **`NODE_ENV=development`**. Vite treats `NODE_ENV` in env files as authoritative, so `vite build` produces a development build.

---

## Findings (priority order by real front-desk impact)

Effort: **S** ≤1h · **M** ~half-day · **L** ≥1 day. Impact: user-perceived on the target hardware/network.

### 🔴 F1 — Production build ships the React **development** runtime — CRITICAL
- **Where:** `.env.local:NODE_ENV=development`, `.env.example:NODE_ENV=development` (template propagates the bug). `vite.config.js` adds no `mode`/`define` override to correct it.
- **Rule:** bundle-size + rendering-performance (dev React does per-render prop/key/hook validation and ships unminified dev branches).
- **Evidence:** `jsxDEV`×1055, dev-only warning strings in `index.js`, devtools in prod bundle, `index.js` = 703 KB.
- **Impact on front desk:** dev-mode React is materially slower on every render (validation overhead) and inflates the main bundle (larger download on Iraqi broadband + slower parse on mid-range CPUs). This single issue dominates all others.
- **Effort: S · Impact: HIGH.** (Fix is config-only; the win is disproportionate.)

### 🔴 F2 — React Query Devtools bundled into production
- **Where:** `src/main.jsx:36` — `{import.meta.env.DEV && <ReactQueryDevtools .../>}`. The guard is correct, but under the F1 dev build `import.meta.env.DEV` is `true`, so the devtools **render in production** and ship in the bundle (the beach-colored `tsqd-open-btn` seen bottom-left in Task 7 preview).
- **Rule:** bundle-defer-third-party / bundle-conditional.
- **Impact:** ~tens of KB + a stray floating button visible to clinic users. **Resolves automatically once F1 is fixed** (guard tree-shakes out), but flag: verify after F1.
- **Effort: S · Impact: MED** (mostly subsumed by F1).

### 🔴 F3 — Patients list is **not virtualized** (contradicts CLAUDE.md) — HIGH
- **Where:** `src/App.jsx:1530` — `{filtered.map((p, i) => …)}` renders every loaded row into the DOM. `filtered = searchActive ? searchResults.rows : patients` (`App.jsx:1395`). Pagination exists (`loadMorePatients`, `patientsTotal`) so not all 3,171 mount at once, but infinite-scroll **accumulates** rows with no windowing — the DOM and per-render reconciliation cost grow unbounded as the front desk scrolls.
- **Good parts (credit):** stable `key={p.id}` ✓; `patients` is `useMemo`'d (`App.jsx:471`); search is server-paged.
- **Rule:** rendering-content-visibility (virtualization for long lists).
- **Impact:** Saif's **3,171-contact** import is the exact trigger. After a few "load more"s, scrolling/typing janks on mid-range hardware.
- **Effort: M · Impact: HIGH.**

### 🟠 F4 — Shell monolith re-renders wholesale; **zero memoization app-wide** — HIGH
- **Where:** `src/App.jsx` is a single ~3,000-line component that owns all top-level state (`page`, `notifications`, `cmdPaletteOpen`, `sidebarCollapsed`, `showUserMenu`, impersonation…) **and** renders the sidebar + header + content inline. `grep -rn "React.memo\|memo("` across `src/` = **0 matches**.
- **Consequence:** every `setPage` (route change), notification tick, sidebar toggle, or user-menu open re-renders the entire shell tree (sidebar nav, header, and the active page wrapper). `visibleNavGroups` is `useMemo`'d (`App.jsx:821`) but the surrounding JSX still re-executes.
- **Rule:** rerender-memo, rendering-hoist-jsx.
- **Impact:** MED–HIGH — route changes and the 60s notification poll cause avoidable full-shell reconciliation; compounded by F1 (dev-mode render cost).
- **Effort: L · Impact: MED-HIGH** (needs extraction of Sidebar/Header/Content into memoized components).

### 🟠 F5 — Dashboard fetches via manual `useEffect`, not TanStack Query — no cache/dedup
- **Where:** `src/pages/DentalDashboard.jsx` — three independent `useEffect` fetches: profile/name (`:129`), stats (`:142` → `fetchDentalDashboardStats`), doctors (`:206` → `listDoctorsInOrg`). The app HAS a `queryClient` (`src/lib/queryClient.js`) but the dashboard bypasses it.
- **Good parts (credit):** the three effects fire in **parallel** (not a waterfall); `fetchDentalDashboardStats` internally uses `Promise.all` (`dental_dashboard.js:42`).
- **Rule:** client-swr-dedup.
- **Impact:** MED — every navigation back to the dashboard re-fetches all stats + doctors + profile with no cache/dedup/background-revalidate. On Iraqi latency this is a repeated multi-second cost the front desk pays each visit.
- **Effort: M · Impact: MED.**

### 🟠 F6 — Unstable inline props defeat any future memoization
- **Where:** `src/App.jsx:1090` — `<PatientsPage>` is called with a large inline prop list including fresh arrow closures; `App.jsx:1181` — `<CommandPalette onClose={(action)=>…} onAction={(action)=>…}>` creates new function identities every App render. `DentalDashboard`, etc. receive inline `toast`/handlers.
- **Rule:** rerender-memo-with-default-value, rerender-functional-setstate, advanced-event-handler-refs.
- **Impact:** LOW–MED today (children aren't memoized so nothing is "broken"), but this **blocks** F4's memo work until handlers are `useCallback`-stabilized.
- **Effort: M · Impact: MED** (prerequisite for F4).

### 🟡 F7 — Other non-virtualized lists (inbox / conversations)
- **Where:** `src/App.jsx:2544` (`conversations.filter`), `:2685` (`filtered.map(conv => …)`) — inbox list rendered unwindowed. Smaller cardinality than patients, but same class of issue.
- **Rule:** rendering-content-visibility.
- **Impact:** LOW–MED (inbox rarely 1000s). **Effort: M · Impact: LOW-MED.**

### 🟡 F8 — Index keys on dynamic lists
- **Where:** `src/App.jsx:2001` (allergy badges `key={i}`), `:2102` (`key={i}`), `:2888` (AI-suggestion buttons `key={i}`).
- **Rule:** reconciliation correctness / rerender.
- **Impact:** LOW (small, mostly-static lists). **Effort: S · Impact: LOW.**

### 🟡 F9 — Barrel imports
- **Where:** 10 sites import from the `src/components/ui/index.js` barrel; also `./components/Skeleton`. CLAUDE.md says "no barrel files."
- **Rule:** bundle-barrel-imports.
- **Impact:** LOW — Vite tree-shakes ESM, and per-page lazy chunks limit blast radius. Worth aligning to the stated rule opportunistically. **Effort: S · Impact: LOW.**

### 🟢 Verified GOOD (no action — documented so future passes don't "fix" them)
- **Route/feature code-splitting is excellent:** every page + `AIAssistant` + `CommandPalette` + `NotificationCenter` + all dental tabs are `lazy()` (`App.jsx:11–55`). The "AI/charts loaded eagerly" concern does **not** apply.
- **`heic2any` (1.35 MB) is lazy:** dynamic `await import('heic2any')` in `heicConverter.js:25`, triggered only on a HEIC X-ray upload. Correct.
- **`getCurrentOrgId` waterfall is mitigated:** `auth_session.js:86` uses a local session read + `_orgIdCache` + in-flight dedup, so the 190 `requireUser()`+`getCurrentOrgId()` call sites are cold-start cost only, not per-call round-trips. No action.
- **`puppeteer`/stealth are NOT in the client bundle** (server/api only) — confirmed no `src/` import. (They do drive the npm-audit vulns; tracked as tech-debt in MIGRATION-STATUS.md, separate dependency-audit pass.)
- **Patients query is memoized** and search is server-paged.

---

## JS micro-optimizations (LOW — batch opportunistically)
Light scan only; not individually blocking. Candidates: `js-set-map-lookups` / `js-index-maps` for repeated `.find()` over patient/doctor arrays in render paths; `js-tosorted-immutable` where `.sort()` may mutate; `js-hoist-regexp` for any per-render `new RegExp`. Address only if profiling flags a specific hot path after F1–F5.

---

## Proposed fix plan (3 passes)

### Pass A — Build config (do first; unblocks measurement) — **S, HIGH**
1. Remove `NODE_ENV=development` from `.env.local`; fix `.env.example` template (set to `production` or omit — let Vite manage mode). **(F1)**
2. Rebuild; confirm `jsxDEV`/dev-warning strings gone, `react-dom.production` present, devtools absent, and record the new `index.js` size delta. **(F1, F2)**
3. Add a guard so a stray `NODE_ENV=development` can't silently ship again (CI check or a `build`-time assertion).

*Expected: large main-bundle shrink + faster renders everywhere, for near-zero effort. Re-baseline all other numbers AFTER this — several may shrink on their own.*

### Pass B — Data & list performance (front-desk hot paths) — **M, HIGH/MED**
4. Virtualize the patients list (window the rows; `@tanstack/react-virtual` fits the existing TanStack stack). **(F3)**
5. Move dashboard fetching (and similar manual-effect pages) onto TanStack `useQuery` for caching/dedup/background revalidate. **(F5)**
6. Optionally apply `content-visibility` to the inbox list. **(F7)**

### Pass C — Shell re-render architecture — **L, MED**
7. Extract `Sidebar`, `Header`, and the active-page `Content` wrapper out of the App monolith into `React.memo` components. **(F4)**
8. Stabilize the props they receive: `useCallback` the handlers, hoist static objects, split the mega-state so a notification tick doesn't touch the sidebar. **(F6)**
9. Clean up `key={i}` sites and the `ui` barrel imports while touching these files. **(F8, F9)**

---

## Top 5 by impact
1. **F1** — dev-mode React in production (config). S / HIGH.
2. **F3** — patients list not virtualized (Saif's 3,171 import). M / HIGH.
3. **F4** — monolith shell re-renders wholesale, zero memo. L / MED-HIGH.
4. **F5** — dashboard manual-effect fetching, no cache/dedup on Iraqi latency. M / MED.
5. **F2** — devtools shipped to prod (auto-resolves with F1; verify). S / MED.
