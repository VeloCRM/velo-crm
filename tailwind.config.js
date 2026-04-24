// Velo CRM — Tailwind tokens
// Companion to design-system.md (Clinical Luxury, v1.0)
// Three-layer model: primitives -> semantics (CSS variables) -> components.
// Components consume semantic vars (e.g. `bg-surface-raised`) so theme switching
// is a single `class="dark"` toggle on <html> and never requires component edits.

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
      },
      animation: {
        'fade-in':       'fade-in 220ms cubic-bezier(0.2, 0, 0, 1) forwards',
        'fade-slide-up': 'fade-slide-up 220ms cubic-bezier(0, 0, 0, 1) forwards',
        'scale-in':      'scale-in 220ms cubic-bezier(0, 0, 0, 1) forwards',
        'pulse-ring':    'pulse-ring 1600ms cubic-bezier(0.2, 0, 0, 1) infinite',
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
