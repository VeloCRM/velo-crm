# SupCod3 Dental Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Velo → SupCod3 Dental behind one token layer (navy/teal/IBM Plex), migrate the daily front-desk surfaces to match `supcod3-dental-preview.html`, and add a reduced-motion-safe GSAP motion system.

**Architecture:** A new `src/styles/tokens.css` is the single source of truth for brand hexes + type. The three existing color systems (`index.css --velo-*`, `tailwind.config.js`, `theme.css`) alias into it, so unmigrated screens recolor for free. Identity strings/marks route through `src/config/brand.js` (white-label seam). Six GSAP helpers live in `src/lib/motion.js`, each `gsap.matchMedia()`-wrapped with a reduced-motion branch; pure sub-helpers are unit-tested with `node --test`. Six screen groups are fully migrated; everything else stays functional on aliases, tracked in `MIGRATION-STATUS.md`.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (`@tailwindcss/vite`), GSAP + `@gsap/react`, `node --test` (no Vitest, no TypeScript).

## Global Constraints

- Brand hexes (ONLY in `tokens.css`): teal `#14B8A6`, teal-hover `#0F8F82`, navy `#0A2540`, bg `#F8FAFC`, card `#FFFFFF`, border `#E2E8F0`. Status: confirmed teal, in-progress navy-blue `#1D4ED8`, waiting amber `#B45309`, danger red `#B91C1C`.
- Type: IBM Plex Sans (UI), IBM Plex Mono + `tabular-nums` (money/times). Tajawal for Arabic. No Syne/DM Sans/Inter going forward.
- Money: IQD = thousands separators, no decimals. `src/lib/money.js` rules unchanged.
- Motion: transform + opacity only (no layout props → no CLS). UI feedback 150–300ms; stagger ≤0.06s/item. Every animation inside `gsap.matchMedia()` with a `(prefers-reduced-motion: reduce)` branch that sets final state instantly and never blocks interaction. No parallax/scroll-jack/springy overshoot on data surfaces.
- RTL-safe: logical properties only (`margin-inline`, `inset-inline`, `border-inline`) — never hardcoded `left`/`right`. Latin wordmark must lay out correctly in RTL.
- Display layer only: do NOT rename repo, `package.json` name, DB objects, or env vars.
- Components consume tokens/semantic classes — never raw hex. `tokens.css` → aliases → components is one-directional.
- Branch: `feat/supcod3-rebrand` (already created). Commit per task.
- No claim of "done" without pasted command output (verification-before-completion).

---

### Task 0: Dependencies + test script

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `gsap` + `@gsap/react` available; `npm test` runs `node --test`.

- [ ] **Step 1: Install GSAP**

Run: `npm i gsap @gsap/react`
Expected: added to `dependencies`, no peer errors.

- [ ] **Step 2: Add the test script**

In `package.json` `scripts`, add:

```json
"test": "node --test \"src/**/*.test.mjs\" \"src/**/*.test.js\""
```

- [ ] **Step 3: Verify the existing suite runs via the new script**

Run: `npm test`
Expected: `conflicts.test.mjs` reports `pass 5  fail 0`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add gsap + node --test script"
```

---

### Task 1: Token layer — `src/styles/tokens.css`

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/index.css:2` (add import before theme.css)

**Interfaces:**
- Produces: CSS vars `--brand-navy/-rgb`, `--brand-teal/-rgb`, `--brand-teal-hover`, `--brand-teal-tint`, `--surface-canvas/-raised/-sunken`, `--border-default`, `--text-primary/-secondary/-tertiary`, `--status-{confirmed,progress,waiting,danger}-{fg,bg}`, `--font-sans`, `--font-mono`. Values verbatim from `supcod3-dental-preview.html`.

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
/* SupCod3 Dental — brand token layer. SINGLE SOURCE OF TRUTH for brand hexes.
   No other file may introduce brand hex literals; they alias into these vars.
   RGB-triplet forms feed Tailwind's rgb(var(--x) / <alpha-value>) syntax. */
:root {
  /* Brand */
  --brand-navy: #0A2540;        --brand-navy-rgb: 10 37 64;
  --brand-teal: #14B8A6;        --brand-teal-rgb: 20 184 166;
  --brand-teal-hover: #0F8F82;
  --brand-teal-tint: #CCFBF1;   /* confirmed-status background */
  --brand-white: #FFFFFF;

  /* Surfaces / borders */
  --surface-canvas: #F8FAFC;
  --surface-raised: #FFFFFF;
  --surface-sunken: #F1F5F9;
  --border-default: #E2E8F0;

  /* Text */
  --text-primary:   #0F172A;
  --text-secondary: #475569;
  --text-tertiary:  #64748B;

  /* Status — brand book */
  --status-confirmed-fg: #0F8F82;  --status-confirmed-bg: #CCFBF1;
  --status-progress-fg:  #1D4ED8;  --status-progress-bg:  #DBEAFE;
  --status-waiting-fg:   #B45309;  --status-waiting-bg:   #FEF3C7;
  --status-danger-fg:    #B91C1C;  --status-danger-bg:    #FEE2E2;

  /* Type */
  --font-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
}
```

- [ ] **Step 2: Import tokens FIRST in `src/index.css`**

`src/index.css` currently starts:
```
1: @import url('https://fonts.googleapis.com/css2?...');   (removed in Task 3)
2: @import './styles/theme.css';
```
Insert `@import './styles/tokens.css';` immediately BEFORE the theme.css import so tokens resolve first:

```css
@import './styles/tokens.css';
@import './styles/theme.css';
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds, no CSS import errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/index.css
git commit -m "feat: add tokens.css brand token layer"
```

---

### Task 2: Alias repoint — full teal remap (recolor without rewrite)

**Files:**
- Modify: `src/index.css` (`--velo-*` accent/brand/surface/border vars)
- Modify: `tailwind.config.js` (`mint`, `accent-cyan` ramps; mint rgba in shadows)
- Modify: `src/styles/theme.css` (mint accent vars)

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: every mint/cyan accent in the app resolves to teal; navy unchanged.

- [ ] **Step 1: Repoint `--velo-*` brand/accent/surface vars in `src/index.css`**

In the `:root` block (light values, ~lines 14–55), change these RGB triplets:

```css
--velo-surface-canvas:  248 250 252;   /* was 250 248 245 → F8FAFC */
--velo-surface-raised:  255 255 255;   /* unchanged */
--velo-surface-sunken:  241 245 249;   /* → F1F5F9 */
--velo-text-primary:     15  23  42;   /* → 0F172A */
--velo-text-secondary:   71  85 105;   /* → 475569 */
--velo-text-tertiary:   100 116 139;   /* → 64748B */
--velo-text-brand:       13 148 136;   /* teal-600 accessible text */
--velo-border-subtle:   226 232 240;   /* → E2E8F0 */
--velo-border-default:  226 232 240;
--velo-border-brand:     20 184 166;   /* teal */
--velo-accent-solid:        20 184 166; /* teal #14B8A6 */
--velo-accent-solid-hover:  15 143 130; /* teal-hover #0F8F82 */
--velo-accent-muted:      204 251 241;  /* CCFBF1 */
--velo-accent-subtle:     240 253 250;  /* teal @ ~6% over canvas */
--velo-accent-fg:           13 148 136;
```
Leave the `[data-theme="dark"]` block as-is (app is light-only; never resolves).

- [ ] **Step 2: Full-remap primitive ramps in `tailwind.config.js`**

Replace the `mint` ramp values and the `accent-cyan` ramp values with teal-family hexes (keys unchanged so class names keep working):

```js
mint: {
  100: '#CCFBF1', 300: '#5EEAD4', 500: '#14B8A6', 700: '#0D9488', 800: '#0F766E',
},
'accent-cyan': {
  50:'#F0FDFA',100:'#CCFBF1',200:'#99F6E4',300:'#5EEAD4',400:'#2DD4BF',
  500:'#14B8A6',600:'#0F8F82',700:'#0F766E',800:'#115E59',900:'#134E4A',950:'#042F2E',
},
```

- [ ] **Step 3: Repoint mint rgba inside shadow tokens in `tailwind.config.js`**

Replace every `rgba(0,255,178,...)` occurrence (in `focus-brand`, `glow-mint`, `pulse-ring` keyframes) with `rgba(20,184,166,...)` at the same alpha.

- [ ] **Step 4: Point the Tailwind font stacks at IBM Plex**

In `theme.extend.fontFamily`, set:
```js
display: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
sans:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
inter:   ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
// ar: (Tajawal) unchanged
```

- [ ] **Step 5: Repoint mint accent vars in `src/styles/theme.css`**

```css
--accent-primary: #14B8A6;  --accent-green: #14B8A6;  --accent-cyan: #14B8A6;
--font-display: 'IBM Plex Sans', sans-serif;
--font-body:    'IBM Plex Sans', sans-serif;
--font-data:    'IBM Plex Mono', monospace;
```

- [ ] **Step 6: Build + confirm no stray brand hex outside tokens.css**

Run: `npm run build`
Expected: succeeds.
Run: `grep -rn "00FFB2\|00ffb2\|06B6D4\|06b6d4" src/ tailwind.config.js`
Expected: zero hits (all mint/cyan literals removed from aliases).

- [ ] **Step 7: Commit**

```bash
git add src/index.css tailwind.config.js src/styles/theme.css
git commit -m "feat: alias legacy color systems to teal token layer"
```

---

### Task 3: Fonts — load IBM Plex, drop old faces

**Files:**
- Modify: `index.html` (Google Fonts `<link>`, `<title>`)
- Modify: `src/index.css:1` (remove duplicate `@import`)

**Interfaces:**
- Consumes: Task 1 `--font-sans/--font-mono`.
- Produces: IBM Plex Sans + Mono + Tajawal loaded; Syne/DM Sans/Inter gone.

- [ ] **Step 1: Swap the Google Fonts link in `index.html`**

Replace the existing `<link href="https://fonts.googleapis.com/css2?family=Syne...">` with:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update the tab title**

In `index.html`, change `<title>Velo Dental</title>` → `<title>SupCod3 Dental</title>`.

- [ ] **Step 3: Remove the duplicate `@import` in `src/index.css`**

Delete line 1 (`@import url('https://fonts.googleapis.com/css2?family=DM+Sans...');`). The file must now start with the tokens.css import from Task 1.

- [ ] **Step 4: Point the base body font at the token**

In `src/index.css`, find the `body`/`.ds-root` `font-family: 'Inter', ...` declaration (~line 176) and change it to `font-family: var(--font-sans);`. Leave the `:lang(ar)`/Tajawal rule intact.

- [ ] **Step 5: Verify no old font families remain referenced**

Run: `grep -rn "Syne\|DM Sans\|'Inter'" src/index.css src/styles/theme.css tailwind.config.js index.html`
Expected: zero hits.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add index.html src/index.css
git commit -m "feat: swap global type to IBM Plex Sans + Mono"
```

---

### Task 4: Identity seam — `src/config/brand.js` + Logo

**Files:**
- Create: `src/config/brand.js`
- Create: `src/components/Logo.jsx`
- Modify: `src/translations.js:6` and `:421` (appName re-export)
- Modify: `index.html` (favicon/app-icon links)

**Interfaces:**
- Produces: `BRAND` object; `<Logo variant="white|navy|teal" withWordmark />` React component that renders the mark image when present, else a styled text wordmark; `translations.appName === 'SupCod3 Dental'` (both locales).

- [ ] **Step 1: Create `src/config/brand.js`**

```js
// SupCod3 Dental — white-label seam. All product identity routes through here
// so per-clinic branding becomes a config swap in a later pass.
// NOTE: this is the PRODUCT name; the per-tenant clinic name lives in
// orgSettings.name and is rendered ALONGSIDE this, never replaced.
export const BRAND = {
  appName: 'SupCod3 Dental',
  vendorTagline: 'by SupCod3',
  marks: {
    white: '/brand/sc-mark-white.png', // navy header / dark surfaces
    navy:  '/brand/sc-mark-navy.png',  // white / light surfaces, print
    teal:  '/brand/sc-mark-teal.png',  // light surfaces where teal has contrast
  },
  favicons: {
    16: '/brand/favicon-16.png', 32: '/brand/favicon-32.png',
    48: '/brand/favicon-48.png', apple: '/brand/apple-touch-180.png',
    app: '/brand/app-icon-512.png',
  },
}
```

- [ ] **Step 2: Create `src/components/Logo.jsx` (correct-on-drop fallback)**

```jsx
import { useState } from 'react'
import { BRAND } from '../config/brand'

// Renders the SC mark PNG per surface; if the asset is absent (pack not yet
// dropped), falls back to a styled monogram so no broken-image glyph shows.
// Wordmark uses logical spacing so the Latin mark lays out in RTL too.
export function Logo({ variant = 'navy', withWordmark = true, size = 28 }) {
  const [imgOk, setImgOk] = useState(true)
  const src = BRAND.marks[variant] || BRAND.marks.navy
  return (
    <span className="inline-flex items-center gap-2" dir="ltr">
      {imgOk ? (
        <img src={src} alt="" width={size} height={size}
             onError={() => setImgOk(false)}
             style={{ display: 'block' }} />
      ) : (
        <span aria-hidden="true"
          style={{ width: size, height: size, borderRadius: 8,
            background: 'var(--brand-teal)', color: 'var(--brand-navy)',
            fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: size * 0.5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          SC
        </span>
      )}
      {withWordmark && (
        <span className="leading-tight" style={{ fontFamily: 'var(--font-sans)' }}>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em',
            color: 'var(--brand-navy)' }}>{BRAND.appName}</span>
          <small style={{ display: 'block', fontSize: 10, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: -2,
            color: 'var(--text-tertiary)' }}>{BRAND.vendorTagline}</small>
        </span>
      )}
    </span>
  )
}
```
(On dark/navy surfaces the wordmark colors are overridden by the caller; see Task 6.)

- [ ] **Step 3: Re-export appName from BRAND in `src/translations.js`**

At the top of `src/translations.js`, add `import { BRAND } from './config/brand'`. Change both `appName:` values (`en` line 6, `ar` line 421) to `appName: BRAND.appName,`.

- [ ] **Step 4: Wire favicon/app-icon links in `index.html`**

After the existing `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` (kept as final fallback), add:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/brand/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-180.png" />
```
(These 404 until the PNG pack is dropped; `favicon.svg` keeps the tab from breaking. Documented in Task 12.)

- [ ] **Step 5: Verify appName propagated + build**

Run: `grep -rn "appName: BRAND.appName" src/translations.js`
Expected: 2 hits.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/config/brand.js src/components/Logo.jsx src/translations.js index.html
git commit -m "feat: SupCod3 brand config + Logo + favicon wiring"
```

---

### Task 5: Motion module — `src/lib/motion.js` (TDD on pure helpers)

**Files:**
- Create: `src/lib/motion.js`
- Test: `src/lib/motion.test.mjs`

**Interfaces:**
- Consumes: `gsap`, `@gsap/react` (Task 0).
- Produces (pure, tested): `formatIQD(n) → string`, `clampPct(n) → number` (0–100), `resolveMotion(prefersReduced) → { instant: boolean }`.
- Produces (GSAP wrappers, browser-verified): `entrance(scope)`, `countUp(el, target, {format})`, `progressBar(el, pct)`, `pulse(el)`, `pressFeedback(el)`, `toast(el)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/motion.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatIQD, clampPct, resolveMotion } from './motion.js'

test('formatIQD adds thousands separators, no decimals', () => {
  assert.equal(formatIQD(1500000), '1,500,000')
  assert.equal(formatIQD(0), '0')
  assert.equal(formatIQD(999), '999')
})
test('formatIQD floors fractional input (no decimals ever)', () => {
  assert.equal(formatIQD(1234.9), '1,234')
})
test('clampPct constrains to 0..100', () => {
  assert.equal(clampPct(-5), 0)
  assert.equal(clampPct(50), 50)
  assert.equal(clampPct(150), 100)
})
test('clampPct guards NaN to 0', () => {
  assert.equal(clampPct(NaN), 0)
})
test('resolveMotion returns instant sentinel when reduced', () => {
  assert.deepEqual(resolveMotion(true), { instant: true })
  assert.deepEqual(resolveMotion(false), { instant: false })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test src/lib/motion.test.mjs`
Expected: FAIL — cannot find `./motion.js`.

- [ ] **Step 3: Write `src/lib/motion.js`**

```js
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
gsap.registerPlugin(useGSAP)

/* ── Pure helpers (unit-tested, no DOM) ───────────────────────────────── */
export function formatIQD(n) {
  const v = Math.floor(Number(n) || 0)
  return v.toLocaleString('en-US')
}
export function clampPct(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return 0
  return Math.min(100, Math.max(0, v))
}
export function resolveMotion(prefersReduced) {
  return { instant: !!prefersReduced }
}

/* ── GSAP wrappers (browser-verified) ─────────────────────────────────── */
// Each wrapper uses gsap.matchMedia so the reduced-motion branch sets final
// state instantly. Callers pass a scoped root element/selector.
export function entrance(scope) {
  const mm = gsap.matchMedia(scope)
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    ok: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    const q = gsap.utils.selector(scope)
    if (ctx.conditions.reduce) {
      gsap.set([q('[data-anim="title"]'), q('[data-anim="card"]'), q('[data-anim="row"]')],
        { clearProps: 'all', opacity: 1, y: 0 })
      return
    }
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
    tl.from(q('[data-anim="title"]'), { opacity: 0, y: 12, duration: 0.25 })
      .from(q('[data-anim="card"]'), { opacity: 0, y: 16, duration: 0.25, stagger: 0.06 }, '-=0.1')
      .from(q('[data-anim="row"]'),  { opacity: 0, y: 12, duration: 0.22, stagger: 0.05 }, '-=0.12')
  })
  return mm
}
export function countUp(el, target, { format = formatIQD } = {}) {
  const mm = gsap.matchMedia()
  const obj = { v: 0 }
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      if (ctx.conditions.reduce) { el.textContent = format(target); return }
      gsap.to(obj, { v: target, duration: 0.9, ease: 'power1.out',
        onUpdate: () => { el.textContent = format(obj.v) } })
    })
  return mm
}
export function progressBar(el, pct) {
  const target = clampPct(pct)
  const mm = gsap.matchMedia()
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      if (ctx.conditions.reduce) { el.style.width = target + '%'; return }
      gsap.fromTo(el, { width: '0%' }, { width: target + '%', duration: 0.7, ease: 'power2.out' })
    })
  return mm
}
export function pulse(el) {
  const mm = gsap.matchMedia()
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      if (ctx.conditions.reduce) return
      gsap.to(el, { opacity: 0.55, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 })
    })
  return mm
}
export function pressFeedback(el) {
  const mm = gsap.matchMedia()
  mm.add({ ok: '(prefers-reduced-motion: no-preference)' }, () => {
    gsap.to(el, { scale: 0.96, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' })
  })
  return mm
}
export function toast(el) {
  const mm = gsap.matchMedia()
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      if (ctx.conditions.reduce) { gsap.set(el, { opacity: 1, y: 0 }); return }
      gsap.timeline()
        .fromTo(el, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' })
        .to(el, { opacity: 0, y: -8, duration: 0.3, ease: 'power2.in', delay: 2.2 })
    })
  return mm
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test src/lib/motion.test.mjs`
Expected: `pass 5  fail 0`.

- [ ] **Step 5: Verify the module bundles (gsap import resolves)**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/motion.js src/lib/motion.test.mjs
git commit -m "feat: GSAP motion module with reduced-motion-safe helpers"
```

---

### Task 6: Shell chrome migration (App.jsx header + sidebar) + RTL wordmark

**Files:**
- Modify: `src/App.jsx` (sidebar logo ~L860–870; mobile header logo ~L954–961; header avatar gradient ~L983; notification badge ~L979)
- Modify: `src/components/AIAssistant.jsx:68` ("Velo AI" → "SupCod3 AI")

**Interfaces:**
- Consumes: `Logo` (Task 4), `BRAND`, tokens.
- Produces: the persistent chrome that frames every migrated screen — SC wordmark + clinic name, teal accents, Plex.

- [ ] **Step 1: Replace the desktop sidebar logo block**

At `src/App.jsx` ~L865–870, replace the `orgSettings.name || t.appName` wordmark markup with the shared component, keeping the clinic name beside it:

```jsx
import { Logo } from './components/Logo'
// ...
<div className="flex items-center gap-2 min-w-0">
  <Logo variant="navy" withWordmark />
  {orgSettings?.name && (
    <span className="min-w-0 truncate border-inline-start ps-2 text-[12px] text-content-secondary"
          style={{ borderInlineStart: '1px solid var(--border-default)' }}>
      {orgSettings.name}
    </span>
  )}
</div>
```

- [ ] **Step 2: Replace the mobile header logo block (~L956–961)**

```jsx
{isMobile && (
  <div className="flex items-center gap-2 min-w-0 shrink">
    <Logo variant="navy" withWordmark={false} size={30} />
    <span className="truncate" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700,
      fontSize: 15, color: 'var(--brand-navy)' }}>{BRAND.appName}</span>
    {orgSettings?.name && (
      <span className="truncate text-[12px] ps-2" style={{
        borderInlineStart: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>
        {orgSettings.name}
      </span>
    )}
  </div>
)}
```
The clinic name truncates on mobile but must not disappear (per decision).

- [ ] **Step 3: Repoint the remaining raw hex in the header chrome to tokens**

At the avatar gradient (~L983) replace `linear-gradient(135deg, #00FFB2, #4DA6FF)` → `linear-gradient(135deg, var(--brand-teal), var(--brand-navy))` and `boxShadow` mint rgba → `rgba(20,184,166,0.25)`; the badge `background:'#FF6B6B'` (~L979) → `var(--status-danger-fg)`; avatar text `color:'#07080E'` → `var(--brand-navy)`.

- [ ] **Step 4: Rename the assistant label**

`src/components/AIAssistant.jsx:68`: `Velo AI` → `SupCod3 AI` (and the RTL string `مساعد CRM الذكي` may stay).

- [ ] **Step 5: Manual RTL check for the Latin wordmark**

Run: `npm run dev`, open the app, switch language to Arabic (globe toggle).
Expected: wordmark + clinic-name divider lay out right-to-left correctly, mark stays LTR-internal, no clipped/overlapping text, divider on the correct (inline-start) side. Capture a screenshot as evidence.

- [ ] **Step 6: Build + commit**

Run: `npm run build` → succeeds.

```bash
git add src/App.jsx src/components/Logo.jsx src/components/AIAssistant.jsx
git commit -m "feat: migrate shell chrome to SupCod3 identity + teal tokens"
```

---

### Task 7: Auth screen migration

**Files:**
- Modify: `src/pages/Auth.jsx` (STRINGS `welcome`/`tagline` ~L30; card/logo/focus styling)

**Interfaces:**
- Consumes: `Logo`, `BRAND`, tokens.
- Produces: login/reset matching the preview; security-sensitive → in the /security-review diff.

- [ ] **Step 1: Update the welcome copy**

`src/pages/Auth.jsx`, `STRINGS.en`: `welcome: 'Welcome to Velo'` → `` welcome: `Welcome to ${''}` `` is fragile — instead set `welcome: 'Welcome'` and render `{STRINGS[lang].welcome} <BRAND wordmark>` in the header, OR simply `welcome: 'Welcome to SupCod3 Dental'`. Use the literal: `welcome: 'Welcome to SupCod3 Dental'`. Arabic `welcome` similarly → `'مرحبًا بك في SupCod3 Dental'` (brand stays Latin).

- [ ] **Step 2: Render the navy mark on the light auth card**

Add `import { Logo } from '../components/Logo'` and place `<Logo variant="navy" withWordmark />` above the welcome heading.

- [ ] **Step 3: Repoint any raw hex in Auth to tokens**

Run: `grep -n "#[0-9A-Fa-f]\{6\}" src/pages/Auth.jsx`
For each hit, replace with the matching token/Tailwind semantic (teal focus ring → `box-shadow: var(--...)` or `shadow-focus-cyan`; navy text → `var(--brand-navy)`; borders → `var(--border-default)`). The `components/ui` primitives already read tokens, so most styling flows through them.

- [ ] **Step 4: Build + manual check**

Run: `npm run build` → succeeds. Load `/` logged-out; confirm teal focus rings, navy mark, Plex, no mint. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Auth.jsx
git commit -m "feat: migrate auth screen to SupCod3 branding"
```

---

### Task 8: Dashboard migration + motion

**Files:**
- Modify: `src/pages/DentalDashboard.jsx`

**Interfaces:**
- Consumes: `motion.js` (`entrance`, `countUp`, `progressBar`, `pulse`, `toast`), tokens.
- Produces: the preview's "Today" screen.

- [ ] **Step 1: Repoint colors + type to tokens**

Run: `grep -n "#[0-9A-Fa-f]\{6\}\|Syne\|DM Sans\|Inter" src/pages/DentalDashboard.jsx`
Replace each raw hex with the token/semantic equivalent; KPI values and times use `font-mono` + `tabular-nums`. Status chips use the four `--status-*` pairs (confirmed teal, in-progress navy-blue, waiting amber, no-show danger) exactly as in the preview `.chip.*` classes.

- [ ] **Step 2: Wire entrance choreography**

Add `data-anim="title"` to the page heading, `data-anim="card"` to each KPI card, `data-anim="row"` to each appointment row. In a `useGSAP(() => { const mm = entrance(scopeRef.current); return () => mm.revert() }, { scope: scopeRef })` on the dashboard root ref.

- [ ] **Step 3: Wire countUp + progressBar on KPIs, pulse on "In chair", toast on check-in**

For each numeric KPI, `countUp(elRef.current, value)`; for KPI progress bars, `progressBar(barRef.current, pct)`. Apply `pulse()` to the single "In chair" indicator (max one per view). On check-in action, animate the toast element with `toast()`.

- [ ] **Step 4: Build + manual check (normal motion)**

Run: `npm run build` → succeeds. Load dashboard; confirm entrance stagger, counters animate, one pulsing "In chair", check-in toast. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DentalDashboard.jsx
git commit -m "feat: migrate dashboard to tokens + motion system"
```

---

### Task 9: Patients list migration (PatientsPage in App.jsx)

**Files:**
- Modify: `src/App.jsx` (`PatientsPage` component + patient-count strings ~L1081, ~L1423)

**Interfaces:**
- Consumes: `motion.js` (`entrance`), tokens.
- Produces: patients list matching preview list styling; virtualized-safe motion.

- [ ] **Step 1: Repoint PatientsPage colors/type to tokens**

Within the `PatientsPage` function body, `grep` its raw hex and replace with token/semantic classes; row layout, status chips, and hover states match the preview `.appt`/`.chip` patterns (teal hairline accent on hover via `inset-inline-start`).

- [ ] **Step 2: Entrance stagger on the INITIAL visible window only**

Apply `data-anim="row"` only to the initially-rendered row window and call `entrance()` once on mount. Do NOT attach per-row animation inside the virtualizer's render callback (would fire per scroll item). Add a code comment stating this.

- [ ] **Step 3: Build + manual check**

Run: `npm run build` → succeeds. Load `/patients`; confirm teal styling, rows stagger once on load, scrolling is smooth (no per-item animation). Screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: migrate patients list to tokens + entrance motion"
```

---

### Task 10: Patient profile migration

**Files:**
- Modify: `src/App.jsx` (patient profile tabs ~L1900–2110)
- Modify: `src/components/ToothSurfaces.jsx`, `src/components/MiniToothChart.jsx` (selection feedback only, if they carry raw hex)

**Interfaces:**
- Consumes: `motion.js` (`pressFeedback`), tokens.
- Produces: profile matching brand; NO decorative motion on medical data.

- [ ] **Step 1: Repoint profile colors/type to tokens**

`grep` raw hex within the profile tab region and tooth components; replace with tokens/semantics. Tabs, headers, and data tables follow the preview surfaces.

- [ ] **Step 2: Tooth chart selection feedback**

On tooth/surface selection, call `pressFeedback(el)` — the ONLY motion allowed on the chart. Add a comment: "medical data: selection feedback only, no decorative/entrance motion."

- [ ] **Step 3: Build + manual check**

Run: `npm run build` → succeeds. Open a patient profile; confirm teal/Plex, tooth selection gives a subtle press, no entrance/pulse on clinical data. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/ToothSurfaces.jsx src/components/MiniToothChart.jsx
git commit -m "feat: migrate patient profile to tokens; tooth-chart press feedback"
```

---

### Task 11: Appointments + calendar + modal

**Files:**
- Modify: `src/pages/AppointmentsPage.jsx`
- Modify: `src/components/AddAppointmentModal.jsx`

**Interfaces:**
- Consumes: tokens; modal enter/exit motion.
- Produces: appointments/calendar matching preview; modal 0.2s fade+scale in / 0.15s out.

- [ ] **Step 1: Repoint colors/type to tokens**

`grep` raw hex in both files; replace with tokens/semantics. Status chips use the four `--status-*` pairs. Calendar chair columns / doctor colors keep the existing `clinic.*` categorical ramp (out of scope to change).

- [ ] **Step 2: Modal enter/exit motion**

Wrap the modal panel mount in a `useGSAP` that fades+scales `0.98→1` over 0.2s in, 0.15s out, inside `gsap.matchMedia()` with a reduced-motion branch that sets final state instantly. (May reuse the `scale-in`/`glass-in` Tailwind keyframes if simpler — but ensure reduced-motion disables them.)

- [ ] **Step 3: Build + manual check**

Run: `npm run build` → succeeds. Open appointments + add-appointment modal; confirm teal/Plex, modal transitions. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AppointmentsPage.jsx src/components/AddAppointmentModal.jsx
git commit -m "feat: migrate appointments + modal to tokens + motion"
```

---

### Task 12: Docs — MIGRATION-STATUS.md + CLAUDE.md corrections

**Files:**
- Create: `MIGRATION-STATUS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: the migrated-vs-aliased checklist future passes work from; CLAUDE.md matching reality.

- [ ] **Step 1: Create `MIGRATION-STATUS.md`**

```markdown
# SupCod3 Dental — Migration Status

Token layer: `src/styles/tokens.css` (single source of truth). Unmigrated
screens render via aliases (index.css `--velo-*`, tailwind.config, theme.css)
and are functional but not yet preview-matched.

## Migrated (preview-matched, tokens only)
- [x] Shell chrome (App.jsx header + sidebar)
- [x] Auth (login / reset)
- [x] Dashboard (DentalDashboard)
- [x] Patients list (PatientsPage in App.jsx)
- [x] Patient profile (App.jsx tabs, tooth chart)
- [x] Appointments + calendar + AddAppointmentModal

## Aliased (functional, recolored via aliases, not yet preview-matched)
- [ ] Finance, Reports, Report Builder, Goals, Inventory, Tasks
- [ ] Forms, Automations, Integrations, Social Monitor, Docs
- [ ] Settings (+ settings/*), Operator console (+ operator/*)
- [ ] Join, Command Palette, Notification Center, Keyboard Shortcuts

## Outstanding dependencies
- **Logo PNG pack** NOT in `public/brand/`: sc-mark-white/navy/teal.png,
  favicon-16/32/48.png, apple-touch-180.png, app-icon-512.png. Wiring is
  correct-on-drop; text-monogram fallback renders until the pack is added.
- **SVG marks** — follow-up when exported from Illustrator (exact hexes
  #14B8A6 / #0A2540 / #FFFFFF).
```

- [ ] **Step 2: Correct CLAUDE.md**

In `CLAUDE.md`: change "Use Vitest" (workflow rule 2) to "Use `node --test` (run `npm test`); no Vitest/TypeScript this pass." Add a line under the motion/animation section noting the shared module is `src/lib/motion.js`.

- [ ] **Step 3: Commit**

```bash
git add MIGRATION-STATUS.md CLAUDE.md
git commit -m "docs: migration status + CLAUDE.md test/motion corrections"
```

---

### Task 13: Verification pass (evidence + security review)

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: motion (5) + conflicts (5) → `pass 10  fail 0`. Paste output.

- [ ] **Step 2: Clean build**

Run: `npm run build`
Expected: succeeds. Paste tail.

- [ ] **Step 3: Raw-hex gate on migrated screens**

Run: `grep -rnE "#[0-9A-Fa-f]{6}" src/pages/Auth.jsx src/pages/DentalDashboard.jsx src/pages/AppointmentsPage.jsx src/components/AddAppointmentModal.jsx`
Expected: zero hits (App.jsx has migrated + unmigrated regions; report its migrated-region count qualitatively). Paste result.

- [ ] **Step 4: Reduced-motion evidence**

In DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Reload dashboard.
Expected: zero motion; counters show final values immediately; progress bars at final width; no pulse; toast appears static. Record screenshot/video.

- [ ] **Step 5: No-CLS confirmation**

Run: `grep -n "width\|height\|top\|left\|margin\|padding" src/lib/motion.js`
Expected: only `progressBar` touches `width` (intentional, on a fixed-height bar); entrance/countUp/pulse/press/toast use transform/opacity only. Confirm no layout-property tweens in the entrance timeline. Note: `progressBar` animates width on a 3px bar — acceptable, isolated, no page reflow.

- [ ] **Step 6: Route smoke test (unmigrated screens not broken)**

Load each top-level route (finance, reports, settings, inventory, tasks, forms, automations, integrations, social, docs, goals). Confirm each renders, is teal-recolored, and is not visually broken. Note any anomaly in MIGRATION-STATUS.md.

- [ ] **Step 7: Security review**

Run `/security-review` on the branch diff (auth screens touched → mandatory). Address any CRITICAL/HIGH finding before push. Paste summary.

- [ ] **Step 8: Final commit (if fixes) + push**

```bash
git add -A && git commit -m "chore: verification fixes for SupCod3 rebrand"
git push -u origin feat/supcod3-rebrand
```

---

## Self-Review

**Spec coverage:**
- Token layer / single source of truth → Task 1. ✅
- Full teal remap of mint + accent-cyan → Task 2. ✅
- IBM Plex via Google Fonts (+ Tajawal), drop Syne/DM/Inter → Tasks 2, 3. ✅
- Identity (appName, vendor tagline, marks, favicon, correct-on-drop) → Task 4. ✅
- Clinic name kept beside wordmark, all sizes, mobile truncate-not-hide → Task 6 Steps 1–2. ✅
- RTL Latin-wordmark check → Task 6 Step 5. ✅
- Motion module, six exports, reduced-motion, TDD pure helpers, node --test → Task 5. ✅
- Migrate shell + Auth + Dashboard + Patients + Patient profile + Appointments → Tasks 6–11. ✅
- MIGRATION-STATUS.md + CLAUDE.md corrections + `test` script → Tasks 0, 12. ✅
- Evidence: tests, build, reduced-motion, no-CLS, raw-hex grep, /security-review → Task 13. ✅
- PNG-pack dependency documented, fallback → Tasks 4, 12; acknowledged non-blocking. ✅

**Placeholder scan:** No TBD/TODO; test code and token values are concrete. Large JSX files (App.jsx, page components) use grep-driven mapping rules + exact anchors + representative snippets rather than full-file dumps — appropriate for a re-skin of existing 3000-line files; each carries a concrete build/visual/grep acceptance.

**Type consistency:** `formatIQD`/`clampPct`/`resolveMotion` and wrapper signatures identical across Task 5 definition and Tasks 8–11 usage. `BRAND` shape and `Logo` props consistent across Tasks 4, 6, 7. `data-anim` values (`title`/`card`/`row`) consistent between `entrance()` (Task 5) and consumers (Tasks 8–9).
