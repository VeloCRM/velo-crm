# Velo CRM — Brand Color Extraction

> Extracted from `src/index.css` and `tailwind.config.js` on 2026-06-25.
> All `--velo-*` triplets are space-separated RGB (Tailwind `rgb(var(--x) / <alpha>)`).

## ⚠️ Critical: TWO parallel color systems coexist

| System | Palette | Token namespace | Where it's active |
|--------|---------|-----------------|-------------------|
| **Clinical Luxury** (Sprint 0) | warm paper + **mint** accent | `--velo-*` (CSS) / `ink-*`, `mint-*`, `surface/content/stroke/accent` (Tailwind) | **Global default.** `body` bg/text, every legacy page (Patients, Settings, Dental, etc.) |
| **Liquid Glass** (Sprint 1) | white-gradient + **navy/cyan** | `--ds-*` (CSS) / `navy-*`, `accent-cyan-*`, `glass-*` (Tailwind) | **Scoped to `.ds-root`** — `/design-system`, glass primitives, migrated heavy-tab modals |

The app is **light-only** in practice (App.jsx strips `[data-theme="dark"]`), so the
`:root` (light) `--velo-*` values are what render. Dark values are listed for completeness but unreachable.

---

## 1. Primary navy variants (Liquid Glass brand)

### Tailwind `navy-*` ramp (`tailwind.config.js`) — built around spec hex `#0A2540`
| Token | Hex | Usage |
|-------|-----|-------|
| `navy-50`  | `#F1F5FB` | tinted fills, glass-bg-tinted base |
| `navy-100` | `#DDE7F4` | subtle surfaces |
| `navy-200` | `#B6CAE5` | borders / dividers |
| `navy-300` | `#88A6CF` | muted text on light, placeholders |
| `navy-400` | `#5680B3` | secondary text |
| `navy-500` | `#2F5C92` | mid surfaces |
| **`navy-600`** | **`#1B4477`** | **brand primary** — CTAs, headings on glass |
| **`navy-700`** | **`#103562`** | deeper / hover state, AAA on white |
| **`navy-800`** | **`#0A2540`** | hero / footer surfaces (**the spec hex**); `.ds-root` default text color |
| `navy-900` | `#061830` | deepest surface |
| `navy-950` | `#030C1C` | near-black navy |

### Raw CSS mirrors (`--ds-*`, for non-Tailwind consumers)
| Variable | Hex | Usage |
|----------|-----|-------|
| `--ds-navy-600` | `#1B4477` | mirror of navy-600 |
| `--ds-navy-700` | `#103562` | mirror of navy-700 |
| `--ds-navy-800` | `#0A2540` | mirror of navy-800; `.ds-root` text color |

### Navy gradients (CTA fills, `src/index.css`)
| Class | Value | Usage |
|-------|-------|-------|
| `.navy-gradient`        | `linear-gradient(158deg, #1B4477 0%, #0A2540 100%)` | primary CTA fill (white text) |
| `.navy-gradient:hover`  | `linear-gradient(158deg, #235486 0%, #103562 100%)` | hover (note `#235486` is the only one-off lighter navy) |
| `.navy-gradient` (RTL)  | `linear-gradient(202deg, …)` | RTL angle flip |

---

## 2. Cyan accent variants (Liquid Glass)

### Tailwind `accent-cyan-*` ramp — spec accent `#06B6D4`
| Token | Hex | Usage |
|-------|-----|-------|
| `accent-cyan-50`  | `#ECFEFF` | lightest tint |
| `accent-cyan-100` | `#CFFAFE` | subtle bg |
| `accent-cyan-200` | `#A5F3FC` | hover tint |
| `accent-cyan-300` | `#67E8F9` | light accent |
| `accent-cyan-400` | `#22D3EE` | gradient start, bright highlight |
| **`accent-cyan-500`** | **`#06B6D4`** | **spec accent** — focus rings, links, secondary CTA |
| `accent-cyan-600` | `#0891B2` | accent hover/darker |
| `accent-cyan-700` | `#0E7490` | accent text on light (used in Auth/Notes icons: `text-accent-cyan-700`) |
| `accent-cyan-800` | `#155E75` | deep accent |
| `accent-cyan-900` | `#164E63` | deepest accent |
| `accent-cyan-950` | `#083344` | near-black cyan |

### Raw CSS mirrors
| Variable | Hex |
|----------|-----|
| `--ds-cyan-500` | `#06B6D4` |
| `--ds-cyan-600` | `#0891B2` |

### Cyan gradient & focus
| Token | Value | Usage |
|-------|-------|-------|
| `.accent-gradient` | `linear-gradient(158deg, #22D3EE 0%, #06B6D4 60%, #0891B2 100%)` | secondary highlight fill (text `#062B36`) |
| `shadow-focus-cyan` | `0 0 0 3px rgba(6,182,212,0.32)` | cyan focus ring |

---

## 3. Branded `--velo-*` semantic variables (Clinical Luxury — the live global theme)

### Mint accent (brand) — `:root` / light
| Variable | RGB | Hex | Maps to | Usage |
|----------|-----|-----|---------|-------|
| `--velo-accent-solid` | `0 255 178` | `#00FFB2` | mint-500 | **canonical brand accent** (solid fill) |
| `--velo-accent-solid-hover` | `0 214 149` | `#00D695` | mint-500 darkened | accent hover |
| `--velo-accent-muted` | `214 255 238` | `#D6FFEE` | mint-100 | muted accent bg |
| `--velo-accent-subtle` | `235 248 240` | `#EBF8F0` | mint @6% over canvas | subtle accent bg |
| `--velo-accent-fg` | `0 163 114` | `#00A372` | mint-700 | accent text (accessible) |
| `--velo-text-brand` | `0 163 114` | `#00A372` | mint-700 | brand-colored text |
| `--velo-border-brand` | `0 255 178` | `#00FFB2` | mint-500 | brand border / focus |

### Mint primitive ramp (Tailwind `mint-*`)
| Token | Hex | Usage |
|-------|-----|-------|
| `mint-100` | `#D6FFEE` | muted |
| `mint-300` | `#6FFFD2` | dark-mode brand text |
| **`mint-500`** | **`#00FFB2`** | **brand accent** |
| `mint-700` | `#00A372` | accessible "mint as text" on light |
| `mint-800` | `#006D4D` | deepest mint text |

### Status families (`--velo-status-*`, light)
| Variable | RGB | Hex | Usage |
|----------|-----|-----|-------|
| `--velo-status-success-bg`     | `236 253 243` | `#ECFDF3` | success bg |
| `--velo-status-success-border` | `21 128 61`   | `#15803D` | success border |
| `--velo-status-success-fg`     | `22 101 52`   | `#166534` | success text |
| `--velo-status-warning-bg`     | `255 247 230` | `#FFF7E6` | warning bg |
| `--velo-status-warning-border` | `200 132 28`  | `#C8841C` | warning border |
| `--velo-status-warning-fg`     | `146 89 14`   | `#92590E` | warning text |
| `--velo-status-danger-bg`      | `253 237 236` | `#FDEDEC` | danger bg |
| `--velo-status-danger-border`  | `192 57 43`   | `#C0392B` | danger border |
| `--velo-status-danger-fg`      | `142 42 32`   | `#8E2A20` | danger text |
| `--velo-status-info-bg`        | `238 242 248` | `#EEF2F8` | info bg |
| `--velo-status-info-border`    | `61 90 138`   | `#3D5A8A` | info border |
| `--velo-status-info-fg`        | `38 57 107`   | `#26396B` | info text |

---

## 4. Default background, text, and border colors

### Global default (`body` in `src/index.css` — Clinical Luxury, light)
| Role | Variable | RGB | Hex | Maps to |
|------|----------|-----|-----|---------|
| **Default background** | `--velo-surface-canvas` | `250 248 245` | `#FAF8F5` | ink-50 (warm paper) |
| Raised surface (cards) | `--velo-surface-raised` | `255 255 255` | `#FFFFFF` | white |
| Sunken (table headers)  | `--velo-surface-sunken` | `244 241 236` | `#F4F1EC` | ink-100 |
| Overlay (backdrop @/50) | `--velo-surface-overlay` | `20 18 15` | `#14120F` | warm near-black |
| **Default text** | `--velo-text-primary` | `21 20 15` | `#15140F` | ink-900 |
| Secondary text | `--velo-text-secondary` | `61 58 51` | `#3D3A33` | ink-700 |
| Tertiary text | `--velo-text-tertiary` | `122 116 104` | `#7A7468` | ink-500 |
| Inverse text | `--velo-text-inverse` | `250 248 245` | `#FAF8F5` | ink-50 |
| Text on accent | `--velo-text-on-accent` | `21 20 15` | `#15140F` | ink-900 on mint |
| Border subtle | `--velo-border-subtle` | `233 228 220` | `#E9E4DC` | ink-200 |
| **Default border** | `--velo-border-default` | `209 203 191` | `#D1CBBF` | ink-300 |
| Border strong | `--velo-border-strong` | `122 116 104` | `#7A7468` | ink-500 |

### Ink primitive ramp (Tailwind `ink-*`, warm neutral ~38° hue)
`50 #FAF8F5` · `100 #F4F1EC` · `200 #E9E4DC` · `300 #D1CBBF` · `400 #A8A095` · `500 #7A7468` · `700 #3D3A33` · `900 #15140F`

### Liquid Glass defaults (`.ds-root` scope only)
| Role | Source | Value | Usage |
|------|--------|-------|-------|
| Background | `--ds-canvas-gradient` | `linear-gradient(180deg, #FFFFFF 0%, #F6F9FE 32%, #EEF3FB 68%, #E7EEF8 100%)` | `.ds-root` canvas |
| Text | `--ds-navy-800` | `#0A2540` | `.ds-root` default text |
| Solid surface-1 | Tailwind `surface-1` | `#FFFFFF` | raised over canvas |
| Solid surface-2 | `surface-2` | `#F8FAFC` | app canvas |
| Solid surface-3 | `surface-3` | `#F1F5F9` | sunken (table headers) |
| Solid surface-4 | `surface-4` | `#E2E8F0` | strong sunken / dividers |

### Glass fills (translucent, Tailwind `glass-*` + `--glass-*`)
| Token | Value | Usage |
|-------|-------|-------|
| `glass-bg-soft` | `rgba(255,255,255,0.55)` | hero / large cards |
| `glass-bg` | `rgba(255,255,255,0.70)` | default card fill |
| `glass-bg-strong` | `rgba(255,255,255,0.85)` | dropdowns, popovers |
| `glass-bg-tinted` | `rgba(241,245,251,0.70)` | navy-50-tinted fill |
| `glass-border` | `rgba(255,255,255,0.55)` | top-light highlight edge |
| `glass-border-ink` | `rgba(15,23,42,0.06)` | bottom-shadow edge |
| `glass-overlay` | `rgba(10,37,64,0.30)` | modal backdrop (navy-tinted) |

---

## 5. Other branded palettes

### Multi-doctor categorical (`clinic-*`, desaturated luxury hues)
| Token | Hex |
|-------|-----|
| `clinic-rose`   | `#C4677B` |
| `clinic-amber`  | `#B98A4F` |
| `clinic-azure`  | `#4F7FA6` |
| `clinic-sage`   | `#6B9079` |
| `clinic-violet` | `#8770B6` |
| `clinic-coral`  | `#C0795D` |
| `clinic-teal`   | `#5C8884` |
| `clinic-clay`   | `#9D6F4F` |

### Semantic raw primitives (Tailwind, warm-aligned)
| Token | 50 | 500 | 700 |
|-------|-----|-----|-----|
| `success` | `#ECFDF3`* | `#15803D` | `#166534` |
| `warning` | `#FFF7E6` | `#C8841C` | `#92590E` |
| `danger`  | `#FDEDEC` | `#C0392B` | `#8E2A20` |
| `info`    | `#EEF2F8` | `#3D5A8A` | `#26396B` |

\* config lists `success-50` as `#ECFDF3` in tailwind but the `--velo-status-success-bg` is `#ECFDF3` — consistent.

---

## Summary — the brand at a glance

- **Active brand accent (live, most pages):** mint `#00FFB2` (`mint-500` / `--velo-accent-solid`), with `#00A372` (`mint-700`) as the accessible text variant.
- **Brand direction (Liquid Glass, scoped):** navy `#0A2540`→`#1B4477` + cyan `#06B6D4`.
- **Default page background:** warm paper `#FAF8F5`.
- **Default text:** near-black `#15140F`.
- **Default border:** `#D1CBBF`.
