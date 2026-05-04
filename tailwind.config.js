// Velo CRM — Tailwind tokens
//
// Two parallel design systems live here:
//   1. "Clinical Luxury" (warm/mint) — design-system.md v1.0; powers existing
//      Sprint 0 surfaces. Tokens: ink-*, mint-*, surface-*, accent-*, etc.
//   2. "Liquid Glass" (navy/cyan, iOS-style) — Sprint 1 redesign foundation.
//      Tokens: navy-*, accent-cyan-*, surface-glass-*, glass shadows.
//
// Sprint 1 Phase 1.1 only adds tokens + primitives + a /design-system showcase.
// Existing pages still consume Layer 2 semantics so nothing breaks until
// Phase 2 migrates them.

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  // Use the existing app's [data-theme="dark"] attribute toggle (set by App.jsx)
  // as the single source of truth, so new Tailwind-based screens swap in lockstep
  // with legacy screens. Custom-selector syntax supported by Tailwind v4.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // ──────────────────────────────────────────────────────────────────
      //  COLOR  ·  Layer 1: Primitives
      //  Raw values. Do not reference these directly in components — go
      //  through the semantic tokens below.
      // ──────────────────────────────────────────────────────────────────
      colors: {
        // Warm neutral ramp ("ink"). Warm-leaning paper tones, ~38° hue.
        ink: {
          50:  '#FAF8F5',
          100: '#F4F1EC',
          200: '#E9E4DC',
          300: '#D1CBBF',
          400: '#A8A095',
          500: '#7A7468',
          700: '#3D3A33',
          900: '#15140F',
        },

        // Brand mint. mint-500 is the canonical accent; mint-700/800 are the
        // accessible "mint as text" tokens on light surfaces.
        mint: {
          100: '#D6FFEE',
          300: '#6FFFD2',
          500: '#00FFB2', // brand
          700: '#00A372',
          800: '#006D4D',
        },

        // Semantic raw — warm-aligned (no jarring cold reds/blues).
        success: { 50: '#ECFDF3', 500: '#15803D', 700: '#166534' },
        warning: { 50: '#FFF7E6', 500: '#C8841C', 700: '#92590E' },
        danger:  { 50: '#FDEDEC', 500: '#C0392B', 700: '#8E2A20' },
        info:    { 50: '#EEF2F8', 500: '#3D5A8A', 700: '#26396B' },

        // Multi-doctor categorical palette. Desaturated luxury hues so a
        // calendar with 6+ doctors reads as a coherent palette.
        clinic: {
          rose:   '#C4677B',
          amber:  '#B98A4F',
          azure:  '#4F7FA6',
          sage:   '#6B9079',
          violet: '#8770B6',
          coral:  '#C0795D',
          teal:   '#5C8884',
          clay:   '#9D6F4F',
        },

        // ────────────────────────────────────────────────────────────────
        //  Sprint 1 — "Liquid Glass" primitive palettes (additive)
        //  Brand navy + cool accent. Tailwind-style 50→950 ramps so they
        //  drop straight into utility classes (`bg-navy-700`, `text-accent-cyan-600`).
        // ────────────────────────────────────────────────────────────────
        // Navy ramp built around the spec hex #0A2540 (sits at navy-900).
        // 600 / 700 are the recommended brand tones for solid surfaces and
        // text-on-light. Keep AA contrast in mind: navy-700 on white = 11:1.
        navy: {
          50:  '#F1F5FB',
          100: '#DDE7F4',
          200: '#B6CAE5',
          300: '#88A6CF',
          400: '#5680B3',
          500: '#2F5C92',
          600: '#1B4477',  // brand primary (CTAs, headings on glass)
          700: '#103562',  // deeper / hover, AAA on white
          800: '#0A2540',  // hero / footer surfaces (the spec hex)
          900: '#061830',
          950: '#030C1C',
        },

        // Cool accent ramp (cyan/teal family) — used for highlights, focus
        // rings, link colors, secondary CTAs. Mirrors Tailwind cyan but with
        // a slightly cooler 500 to read against navy without clashing.
        'accent-cyan': {
          50:  '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',  // spec accent
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
          950: '#083344',
        },

        // Glass surface fills. Components blend these over the page gradient
        // and combine with `backdrop-blur-glass` for the frosted iOS look.
        glass: {
          'bg-soft':    'rgba(255, 255, 255, 0.55)',  // hero / large cards
          'bg':         'rgba(255, 255, 255, 0.70)',  // default card fill
          'bg-strong':  'rgba(255, 255, 255, 0.85)',  // dropdowns, popovers
          'bg-tinted':  'rgba(241, 245, 251, 0.70)',  // navy-50-tinted fill
          'border':     'rgba(255, 255, 255, 0.55)',  // top-light highlight
          'border-ink': 'rgba(15,  23,  42,  0.06)',  // bottom-shadow edge
          'overlay':    'rgba(10, 37,  64,  0.30)',   // modal backdrop (navy-tinted)
        },

        // Solid surface elevations on the white-dominant background.
        // Use these when you don't want translucency (tables, dense data).
        'surface-1': '#FFFFFF',  // raised over canvas
        'surface-2': '#F8FAFC',  // app canvas (paired with bg gradient)
        'surface-3': '#F1F5F9',  // sunken (table headers, inset)
        'surface-4': '#E2E8F0',  // strong sunken / dividers

        // ────────────────────────────────────────────────────────────────
        //  Layer 2: Semantic tokens (theme-aware)
        //  These read CSS variables defined in src/index.css under :root
        //  and .dark. Components consume only these names.
        // ────────────────────────────────────────────────────────────────
        // Note: semantic tokens reference CSS custom properties prefixed with
        // --velo-* to avoid collision with the existing src/styles/theme.css
        // legacy variables (which define --text-primary etc. for the current
        // dark theme). The new design system lives in its own namespace.
        surface: {
          canvas:  'rgb(var(--velo-surface-canvas) / <alpha-value>)',
          raised:  'rgb(var(--velo-surface-raised) / <alpha-value>)',
          sunken:  'rgb(var(--velo-surface-sunken) / <alpha-value>)',
          overlay: 'rgb(var(--velo-surface-overlay) / <alpha-value>)',
        },
        content: {
          primary:   'rgb(var(--velo-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--velo-text-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--velo-text-tertiary) / <alpha-value>)',
          inverse:   'rgb(var(--velo-text-inverse) / <alpha-value>)',
          brand:     'rgb(var(--velo-text-brand) / <alpha-value>)',
          'on-accent': 'rgb(var(--velo-text-on-accent) / <alpha-value>)',
        },
        stroke: {
          subtle:  'rgb(var(--velo-border-subtle) / <alpha-value>)',
          DEFAULT: 'rgb(var(--velo-border-default) / <alpha-value>)',
          strong:  'rgb(var(--velo-border-strong) / <alpha-value>)',
          brand:   'rgb(var(--velo-border-brand) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'rgb(var(--velo-accent-solid) / <alpha-value>)',
          solid:      'rgb(var(--velo-accent-solid) / <alpha-value>)',
          'solid-hover': 'rgb(var(--velo-accent-solid-hover) / <alpha-value>)',
          muted:      'rgb(var(--velo-accent-muted) / <alpha-value>)',
          subtle:     'rgb(var(--velo-accent-subtle) / <alpha-value>)',
          fg:         'rgb(var(--velo-accent-fg) / <alpha-value>)',
        },
        // Status semantics — bg / border / fg per family
        'status-success-bg':     'rgb(var(--velo-status-success-bg) / <alpha-value>)',
        'status-success-border': 'rgb(var(--velo-status-success-border) / <alpha-value>)',
        'status-success-fg':     'rgb(var(--velo-status-success-fg) / <alpha-value>)',
        'status-warning-bg':     'rgb(var(--velo-status-warning-bg) / <alpha-value>)',
        'status-warning-border': 'rgb(var(--velo-status-warning-border) / <alpha-value>)',
        'status-warning-fg':     'rgb(var(--velo-status-warning-fg) / <alpha-value>)',
        'status-danger-bg':      'rgb(var(--velo-status-danger-bg) / <alpha-value>)',
        'status-danger-border':  'rgb(var(--velo-status-danger-border) / <alpha-value>)',
        'status-danger-fg':      'rgb(var(--velo-status-danger-fg) / <alpha-value>)',
        'status-info-bg':        'rgb(var(--velo-status-info-bg) / <alpha-value>)',
        'status-info-border':    'rgb(var(--velo-status-info-border) / <alpha-value>)',
        'status-info-fg':        'rgb(var(--velo-status-info-fg) / <alpha-value>)',
      },

      // ──────────────────────────────────────────────────────────────────
      //  TYPOGRAPHY
      // ──────────────────────────────────────────────────────────────────
      fontFamily: {
        display: ['Syne', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Arabic locales should switch to IBM Plex Sans Arabic via :lang(ar)
        // declarations in src/index.css; tokens stay direction-agnostic.

        // Sprint 1 (Liquid Glass) primary stack. `font-inter` is the canonical
        // body font for the new design system; `font-ar` swaps in Tajawal for
        // Arabic copy and is auto-applied to [lang="ar"] via index.css.
        inter: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        ar:    ['Tajawal', '"Noto Sans Arabic"', 'Inter', 'sans-serif'],
      },

      // Type scale: [size, { lineHeight, letterSpacing, fontWeight }]
      fontSize: {
        display:   ['56px', { lineHeight: '60px', letterSpacing: '-0.04em',  fontWeight: '600' }],
        h1:        ['40px', { lineHeight: '44px', letterSpacing: '-0.035em', fontWeight: '600' }],
        h2:        ['28px', { lineHeight: '34px', letterSpacing: '-0.025em', fontWeight: '600' }],
        h3:        ['20px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '26px', letterSpacing: '0',        fontWeight: '400' }],
        body:      ['14px', { lineHeight: '22px', letterSpacing: '0',        fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '20px', letterSpacing: '0.005em',  fontWeight: '400' }],
        caption:   ['11px', { lineHeight: '16px', letterSpacing: '0.04em',   fontWeight: '600' }],
      },

      // ──────────────────────────────────────────────────────────────────
      //  SPACING  ·  4px base
      //  Tailwind's default already aligns to 4px. We add a couple of named
      //  steps for layout rhythm clarity.
      // ──────────────────────────────────────────────────────────────────
      spacing: {
        // Default Tailwind 0/0.5/1/1.5/...96 already covers our scale at 4px base.
        // Named aliases for canonical layout dims:
        'page-gutter':  '64px',
        'page-gutter-lg': '96px',
        'row-dense':    '52px',
        'row-medium':   '60px',
        'row-rich':     '72px',
        'cal-hour':     '56px',
        'cal-col':      '64px',
      },

      // ──────────────────────────────────────────────────────────────────
      //  RADIUS
      // ──────────────────────────────────────────────────────────────────
      borderRadius: {
        none: '0',
        sm:   '6px',
        md:   '10px',
        lg:   '14px',
        xl:   '20px',
        '2xl': '28px',
        full: '9999px',
        // Sprint 1 (Liquid Glass) — distinct names so existing rounded-2xl /
        // rounded-3xl usage is undisturbed.
        glass:      '16px',
        'glass-lg': '20px',
        'glass-xl': '24px',
      },

      // ──────────────────────────────────────────────────────────────────
      //  BACKDROP BLUR  ·  iOS frosted-glass tiers
      // ──────────────────────────────────────────────────────────────────
      backdropBlur: {
        'glass-sm': '12px',
        'glass':    '20px',  // default frosted-glass card
        'glass-lg': '32px',  // hero / modal panels
      },

      // ──────────────────────────────────────────────────────────────────
      //  SHADOW  ·  Soft, multi-layer, warm-black
      //  No harsh single-layer drops. First layer is always a 1px hairline.
      // ──────────────────────────────────────────────────────────────────
      boxShadow: {
        1: '0 1px 0 0 rgba(20,18,15,0.04), 0 1px 2px 0 rgba(20,18,15,0.04)',
        2: '0 1px 0 rgba(20,18,15,0.04), 0 4px 16px -4px rgba(20,18,15,0.06)',
        3: '0 1px 0 rgba(20,18,15,0.04), 0 8px 24px -8px rgba(20,18,15,0.08), 0 2px 6px -2px rgba(20,18,15,0.04)',
        4: '0 1px 0 rgba(20,18,15,0.04), 0 24px 48px -16px rgba(20,18,15,0.16), 0 8px 16px -8px rgba(20,18,15,0.08)',
        'focus-brand':  '0 0 0 3px rgba(0,255,178,0.30)',
        'focus-danger': '0 0 0 3px rgba(192,57,43,0.22)',
        'glow-mint':    '0 0 24px -4px rgba(0,255,178,0.35)',

        // ────────────────────────────────────────────────────────────────
        //  Sprint 1 — Liquid Glass shadows
        //  Multi-layer soft drops on cool-navy ink. `inset 0 1px 0`
        //  highlight gives the iOS top-edge shimmer; outer drops carry the
        //  weight. Pair with `backdrop-blur-glass` and `bg-glass-bg`.
        // ────────────────────────────────────────────────────────────────
        'glass-sm': [
          'inset 0 1px 0 rgba(255,255,255,0.55)',
          '0 1px 2px rgba(15, 23, 42, 0.04)',
          '0 2px 6px -2px rgba(15, 23, 42, 0.05)',
        ].join(', '),
        'glass': [
          'inset 0 1px 0 rgba(255,255,255,0.65)',
          '0 1px 2px rgba(15, 23, 42, 0.03)',
          '0 8px 24px -8px rgba(15, 23, 42, 0.10)',
          '0 2px 6px -2px rgba(15, 23, 42, 0.05)',
        ].join(', '),
        'glass-lg': [
          'inset 0 1px 0 rgba(255,255,255,0.75)',
          '0 1px 3px rgba(15, 23, 42, 0.04)',
          '0 24px 56px -16px rgba(10, 37, 64, 0.22)',
          '0 8px 16px -8px rgba(15, 23, 42, 0.08)',
        ].join(', '),

        // Brand glow for primary CTAs in the Liquid Glass system.
        'navy-glow':      '0 8px 24px -6px rgba(16, 53, 98, 0.35), 0 2px 6px rgba(10, 37, 64, 0.10)',
        'navy-glow-soft': '0 4px 16px -4px rgba(16, 53, 98, 0.22)',

        // Focus rings for the new system.
        'focus-cyan':  '0 0 0 3px rgba(6, 182, 212, 0.32)',
        'focus-navy':  '0 0 0 3px rgba(16, 53, 98, 0.28)',
      },

      // ──────────────────────────────────────────────────────────────────
      //  MOTION
      // ──────────────────────────────────────────────────────────────────
      transitionDuration: {
        instant: '80ms',
        fast:    '140ms',
        base:    '220ms',
        slow:    '320ms',
        slower:  '480ms',
      },
      transitionTimingFunction: {
        standard:    'cubic-bezier(0.2, 0, 0, 1)',
        decelerate:  'cubic-bezier(0, 0, 0, 1)',
        accelerate:  'cubic-bezier(0.3, 0, 1, 1)',
        emphasized:  'cubic-bezier(0.2, 0, 0, 1.05)',
      },

      // ──────────────────────────────────────────────────────────────────
      //  Z-INDEX  ·  Canonical layers
      // ──────────────────────────────────────────────────────────────────
      zIndex: {
        base:      '0',
        raised:    '10',
        dropdown:  '40',
        sticky:    '50',
        drawer:    '60',
        modal:     '70',
        popover:   '80',
        tooltip:   '90',
        toast:     '100',
      },

      // ──────────────────────────────────────────────────────────────────
      //  Animations  ·  Tied to motion tokens
      // ──────────────────────────────────────────────────────────────────
      keyframes: {
        'fade-in':       { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':      { from: { opacity: '0', transform: 'scale(0.96)' },     to: { opacity: '1', transform: 'scale(1)' } },
        'pulse-ring':    {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,255,178,0.40)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(0,255,178,0)' },
        },
        // Sprint 1 — Liquid Glass motion
        'glass-in':      {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-in':      {
          from: { opacity: '0', transform: 'translateX(24px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'toast-in-rtl':  {
          from: { opacity: '0', transform: 'translateX(-24px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'glass-shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in':       'fade-in 220ms cubic-bezier(0.2, 0, 0, 1) forwards',
        'fade-slide-up': 'fade-slide-up 220ms cubic-bezier(0, 0, 0, 1) forwards',
        'scale-in':      'scale-in 220ms cubic-bezier(0, 0, 0, 1) forwards',
        'pulse-ring':    'pulse-ring 1600ms cubic-bezier(0.2, 0, 0, 1) infinite',
        'glass-in':      'glass-in 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-in':      'toast-in 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-in-rtl':  'toast-in-rtl 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'glass-shimmer': 'glass-shimmer 1800ms ease-in-out infinite',
      },

      // ──────────────────────────────────────────────────────────────────
      //  Component tokens (Layer 3)
      //  Exposed as data attributes / utility helpers via @layer components
      //  in CSS; surfaced here for documentation parity. Components reference
      //  these via Tailwind classes that compose the semantic tokens above.
      // ──────────────────────────────────────────────────────────────────
      // (Layer 3 is realized as @layer components rules in src/styles/components.css.
      //  Keeping component-level tokens out of theme.extend keeps Tailwind's
      //  generated CSS lean. See design-system.md §9 for the full spec.)
    },
  },
  plugins: [
    // Recommended companion plugins (install separately):
    //   require('@tailwindcss/forms')        // form reset baseline
    //   require('@tailwindcss/typography')   // long-form copy in docs
    //   require('tailwindcss-logical')       // logical properties for RTL
  ],
}
