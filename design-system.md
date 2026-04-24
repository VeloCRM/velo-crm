# Velo CRM — Design System

**Codename:** Clinical Luxury
**Version:** 1.0
**Owners:** Velo product/design
**Stack target:** React 19, Tailwind, Supabase
**Locales:** English (LTR), Arabic (RTL)

---

## 1. Brand North Star

Velo is software for high-end dental practices. The product should feel like the front desk of a private clinic in Erbil — calm, polished, quietly confident, never sterile. Surfaces are warm and paper-like; type is composed and unhurried; color is restrained, with Electric Mint reserved for moments that *matter* (the primary action, the active item, the number you are supposed to read first). The aesthetic borrows from premium banking, fine hospitality, and editorial design — and avoids the saturated, alert-heavy chrome of hospital software.

Three rules govern every decision in this system:

1. **Mint is currency.** Spend it sparingly. If everything is mint, nothing is.
2. **Warm beats cold.** Surfaces, neutrals, shadows, and even semantic colors lean warm. There are no cold blue-grays in this palette.
3. **Density without harshness.** Dental staff stare at calendars and tooth charts all day. Type is comfortable at 13–14px, contrast is real, and lines/shadows are soft so dense screens don't feel loud.

---

## 2. Token Architecture

Three layers, each lower layer composing the next:

```
Layer 1 — Primitives    Raw values. Never used directly in components.
   ├── color.ink.50…900            (warm neutral ramp)
   ├── color.mint.100…900          (brand accent)
   ├── color.success/warning/…     (semantic raw)
   ├── color.clinic.rose/azure/…   (multi-doctor categorical)
   ├── font.syne / dmSans
   ├── size.0…96 (4px base)
   ├── radius.none…full
   ├── shadow.layer1…layer4
   └── duration / easing

Layer 2 — Semantic       Purpose-bound. Resolves per theme (light/dark).
   ├── surface.canvas / raised / sunken / overlay
   ├── text.primary / secondary / tertiary / inverse / brand / onAccent
   ├── border.subtle / default / strong / brand / focus
   ├── accent.solid / solidHover / muted / subtle / fg
   └── status.success/warning/danger/info → bg / border / fg

Layer 3 — Component      Component-specific, derived from semantic.
   ├── button.{variant}.{state}.{prop}
   ├── input.{state}.{prop}
   ├── card / modal / table-row / badge / nav-item / calendar-chip
   └── …
```

**Rule:** components import from Layer 3. Layer 3 imports from Layer 2. Layer 2 imports from Layer 1. Skipping layers (a component using a primitive directly) is a smell.

---

## 3. Color

### 3.1 Primitives — Warm Neutrals (`ink`, 8 steps)

A single warm-leaning ramp powers every surface, border, and text token. Hue ~38° (paper warmth), saturation ~6–10%. There are no cold gray-blues in Velo.

| Token       | Hex       | Use                                       |
|-------------|-----------|-------------------------------------------|
| `ink-50`    | `#FAF8F5` | Canvas / app background (light mode)       |
| `ink-100`   | `#F4F1EC` | Raised surface, hover backgrounds          |
| `ink-200`   | `#E9E4DC` | Hairline borders, table dividers           |
| `ink-300`   | `#D1CBBF` | Default borders, dividers, control outlines|
| `ink-400`   | `#A8A095` | Disabled fg, faint icons                   |
| `ink-500`   | `#7A7468` | Tertiary text, placeholders, captions      |
| `ink-700`   | `#3D3A33` | Secondary text                             |
| `ink-900`   | `#15140F` | Primary text, display                      |

### 3.2 Primitives — Mint (5 steps)

The brand accent. **Only `mint-700` and `mint-800` are accessible as text on white.** `mint-500` is the canonical brand color and is used for solid CTA backgrounds (with dark text on it), focus rings, and key data emphasis — never as text on light surfaces.

| Token       | Hex       | Use                                                  |
|-------------|-----------|------------------------------------------------------|
| `mint-100`  | `#D6FFEE` | Subtle tint background (active nav, selected row)    |
| `mint-300`  | `#6FFFD2` | Hover highlight, glow ring, secondary tint           |
| `mint-500`  | `#00FFB2` | Brand. Solid CTA bg, focus ring, key data underline  |
| `mint-700`  | `#00A372` | Mint as text/icon on light surfaces (AA passes)      |
| `mint-800`  | `#006D4D` | Mint as text on lighter tints, strong emphasis       |

### 3.3 Primitives — Semantic raw

Each semantic family is tonally aligned with the warm neutral palette (no jarring cold blues or neon reds).

| Family      | -50         | -500        | -700        | Notes                              |
|-------------|-------------|-------------|-------------|------------------------------------|
| `success`   | `#ECFDF3`   | `#15803D`   | `#166534`   | Forest, distinct from mint         |
| `warning`   | `#FFF7E6`   | `#C8841C`   | `#92590E`   | Warm gold, not yellow              |
| `danger`    | `#FDEDEC`   | `#C0392B`   | `#8E2A20`   | Warm rose-red                      |
| `info`      | `#EEF2F8`   | `#3D5A8A`   | `#26396B`   | Slate-blue, sophisticated          |

### 3.4 Primitives — Multi-doctor categorical (`clinic.*`)

For multi-doctor calendars and any other categorical encoding (e.g. treatment categories). These are intentionally desaturated luxury tones so eight stacked event chips read as a palette, not a clown car.

| Token            | Hex       |  | Token            | Hex       |
|------------------|-----------|--|------------------|-----------|
| `clinic-rose`    | `#C4677B` |  | `clinic-violet`  | `#8770B6` |
| `clinic-amber`   | `#B98A4F` |  | `clinic-coral`   | `#C0795D` |
| `clinic-azure`   | `#4F7FA6` |  | `clinic-teal`    | `#5C8884` |
| `clinic-sage`    | `#6B9079` |  | `clinic-clay`    | `#9D6F4F` |

For each, derive `-50` (8% alpha tint on white) and `-700` (dark variant for text) at component level.

### 3.5 Semantic Tokens (theme-aware)

Where a `light` and `dark` value are listed, the token resolves to the appropriate value per theme. Components only ever read the semantic name.

#### Surfaces

| Token              | Light       | Dark        | Use                                |
|--------------------|-------------|-------------|------------------------------------|
| `surface.canvas`   | `#FAF8F5`   | `#14120E`   | App background                     |
| `surface.raised`   | `#FFFFFF`   | `#1F1C17`   | Cards, panels, popovers            |
| `surface.sunken`   | `#F4F1EC`   | `#0E0C09`   | Inset areas, table headers         |
| `surface.overlay`  | `rgba(20,18,15,0.50)` | `rgba(8,6,4,0.66)` | Modal backdrop      |

#### Text

| Token            | Light       | Dark        | Use                                  |
|------------------|-------------|-------------|--------------------------------------|
| `text.primary`   | `ink-900`   | `#ECE7DF`   | Body, headings                       |
| `text.secondary` | `ink-700`   | `#B8B2A7`   | Subheadings, secondary copy          |
| `text.tertiary`  | `ink-500`   | `#7A7468`   | Captions, meta, placeholders         |
| `text.inverse`   | `ink-50`    | `ink-900`   | Text on solid neutral fills          |
| `text.brand`     | `mint-700`  | `mint-300`  | Mint used as text                    |
| `text.onAccent`  | `ink-900`   | `ink-900`   | Text sitting on `mint-500` solid     |

#### Borders

| Token             | Light       | Dark        | Use                                |
|-------------------|-------------|-------------|------------------------------------|
| `border.subtle`   | `ink-200`   | `#2A2722`   | Hairlines, dividers                |
| `border.default`  | `ink-300`   | `#3A3630`   | Inputs, cards                      |
| `border.strong`   | `ink-500`   | `#5C5850`   | Emphasized outlines                |
| `border.brand`    | `mint-500`  | `mint-500`  | Active/focused brand state         |
| `border.focus`    | `mint-500`  | `mint-500`  | Focus ring color (3px, alpha 0.30) |

#### Accent

| Token              | Light       | Dark        | Use                                  |
|--------------------|-------------|-------------|--------------------------------------|
| `accent.solid`     | `mint-500`  | `mint-500`  | Primary CTA bg                       |
| `accent.solidHover`| `#00D695`   | `#3FFFC4`   | Primary CTA hover                    |
| `accent.muted`     | `mint-100`  | `rgba(0,255,178,0.12)` | Active nav bg, selected row tint |
| `accent.subtle`    | `rgba(0,255,178,0.06)` | `rgba(0,255,178,0.06)` | Faintest tint    |
| `accent.fg`        | `mint-700`  | `mint-300`  | Mint icon/text on light surface      |

#### Status (per family: bg / border / fg)

For `success | warning | danger | info` the pattern is identical:

| Slot      | Light                    | Dark                              |
|-----------|--------------------------|-----------------------------------|
| `status.x.bg`     | family `-50`     | `rgba(family-500, 0.14)`          |
| `status.x.border` | family `-500` @ 24% | family `-500` @ 32%            |
| `status.x.fg`     | family `-700`    | family `-500` lifted +12% L       |

---

## 4. Typography

### 4.1 Family Assignments

| Role     | Family   | Weight axis used      |
|----------|----------|------------------------|
| Display  | Syne     | 600 / 700 / 800        |
| Headings | Syne     | 500 / 600              |
| Body     | DM Sans  | 400 / 500 / 600        |
| Numerals (data-dense) | DM Sans, `font-feature-settings: "tnum" 1, "lnum" 1` | 400 / 500 |

**Rationale.** Syne is geometric and distinctive — used only for display and headings, where a few words can carry brand voice. DM Sans is humanist-neutral, holds up at 13–14px, and remains legible inside calendars and tables. Pairing geometric display with humanist body is a long-established editorial move; it gives Velo the "magazine" tone without sacrificing data legibility. Syne also has good Latin-extended coverage and pairs cleanly with Arabic system fonts (no clash because Syne is reserved for Latin display copy that has Arabic counterparts in dedicated Arabic display fonts — see §10).

### 4.2 Type Scale

| Token       | Family   | Size  | Line-height | Tracking | Weight | Usage                                |
|-------------|----------|-------|-------------|----------|--------|--------------------------------------|
| `display`   | Syne     | 56    | 60 (1.07)   | -0.04em  | 600    | Marketing, splash, empty-state hero  |
| `h1`        | Syne     | 40    | 44 (1.10)   | -0.035em | 600    | Page titles                          |
| `h2`        | Syne     | 28    | 34 (1.21)   | -0.025em | 600    | Section titles                       |
| `h3`        | Syne     | 20    | 28 (1.40)   | -0.015em | 600    | Card titles, modal titles            |
| `body-lg`   | DM Sans  | 16    | 26 (1.625)  | 0        | 400    | Long-form copy, settings descriptions|
| `body`      | DM Sans  | 14    | 22 (1.571)  | 0        | 400    | Default body, table cells, inputs    |
| `body-sm`   | DM Sans  | 13    | 20 (1.538)  | +0.005em | 400    | Dense data, calendar chips           |
| `caption`   | DM Sans  | 11    | 16 (1.45)   | +0.04em  | 600    | Labels, metadata, badges (uppercase) |

`caption` is intended for ALL CAPS or small-caps usage; the +0.04em tracking compensates for tightness at small sizes.

### 4.3 Numeric data

Anywhere money, durations, tooth IDs, or counts appear, apply the data feature flags:

```css
font-variant-numeric: tabular-nums lining-nums;
font-feature-settings: "tnum" 1, "lnum" 1, "ss01" 1;
```

This keeps columns of IQD totals and tooth numbers (FDI two-digit notation, e.g. 11, 21, 36) optically aligned.

---

## 5. Spacing

**Base:** 4px. Tailwind's default scale aligns; this section names the steps Velo uses canonically.

| Token     | Px  | Common use                                         |
|-----------|-----|----------------------------------------------------|
| `space.0` | 0   | Reset                                              |
| `space.1` | 4   | Icon-to-text inside dense chips                    |
| `space.2` | 8   | Tight gaps, button icon-text                       |
| `space.3` | 12  | Input padding-x, table cell padding-x              |
| `space.4` | 16  | Card padding (compact), default content gap        |
| `space.5` | 20  | Section gap (compact)                              |
| `space.6` | 24  | Card padding (default)                             |
| `space.8` | 32  | Modal padding, page section gap                    |
| `space.10`| 40  | Nav item height, input height                      |
| `space.12`| 48  | Hero spacing, large vertical rhythm                |
| `space.16`| 64  | Page max-width margins on wide screens             |
| `space.20`| 80  | Splash / empty-state padding                       |
| `space.24`| 96  | Top-level container generous gap                   |

**Layout grids.**
- Calendar day column: 64px wide minimum, 1-hour row = 56px.
- Table row: 52px (data dense), 60px (medium), 72px (rich, with secondary line).
- Page max content width: 1440 with 64–96px gutters; full-bleed for calendars/charts.

---

## 6. Radius

| Token        | Px   | Use                                          |
|--------------|------|----------------------------------------------|
| `radius.none`| 0    | Crisp dividers, chart bars                   |
| `radius.sm`  | 6    | Tags, small badges                           |
| `radius.md`  | 10   | Buttons, inputs, segmented controls          |
| `radius.lg`  | 14   | Cards, popovers                              |
| `radius.xl`  | 20   | Modals, drawers, large surfaces              |
| `radius.2xl` | 28   | Hero panels, marketing surfaces              |
| `radius.full`| 9999 | Pills, status badges, avatars                |

A consistent +4 progression keeps radii visually harmonious whether components nest or sit side by side.

---

## 7. Shadow

All shadows are multi-layered with low-alpha warm-black (`rgba(20,18,15,…)`) — never pure black, never harsh single-layer drops. Each layer's first stop is a 1px hairline (gives the edge a subtle lift) and subsequent stops produce ambient softness.

| Token         | Value                                                                                                         | Use                                  |
|---------------|---------------------------------------------------------------------------------------------------------------|--------------------------------------|
| `shadow.1`    | `0 1px 0 0 rgba(20,18,15,0.04), 0 1px 2px 0 rgba(20,18,15,0.04)`                                              | Cards (rest), inputs                 |
| `shadow.2`    | `0 1px 0 rgba(20,18,15,0.04), 0 4px 16px -4px rgba(20,18,15,0.06)`                                            | Cards (hover), low-elevation panels  |
| `shadow.3`    | `0 1px 0 rgba(20,18,15,0.04), 0 8px 24px -8px rgba(20,18,15,0.08), 0 2px 6px -2px rgba(20,18,15,0.04)`        | Popovers, dropdowns, raised cards    |
| `shadow.4`    | `0 1px 0 rgba(20,18,15,0.04), 0 24px 48px -16px rgba(20,18,15,0.16), 0 8px 16px -8px rgba(20,18,15,0.08)`     | Modals, command palette, drawers     |
| `shadow.focus.brand`  | `0 0 0 3px rgba(0,255,178,0.30)`                                                                       | Focus ring for inputs/buttons        |
| `shadow.focus.danger` | `0 0 0 3px rgba(192,57,43,0.22)`                                                                       | Focus ring for destructive actions   |
| `shadow.glow.mint`    | `0 0 24px -4px rgba(0,255,178,0.35)`                                                                   | Primary CTA hover, key emphasis only |

Dark mode swaps the shadow base to `rgba(0,0,0,0.55)` and increases alphas roughly +8 absolute points to compensate for reduced contrast against dark surfaces.

---

## 8. Motion

### Durations

| Token              | Ms   | Use                                           |
|--------------------|------|-----------------------------------------------|
| `duration.instant` | 80   | Pressed states, micro-acks                    |
| `duration.fast`    | 140  | Hover/focus transitions, color shifts         |
| `duration.base`    | 220  | Modals open/close, card lifts, toasts         |
| `duration.slow`    | 320  | Page transitions, sequenced list reveals      |
| `duration.slower`  | 480  | Calendar drag-drops, complex orchestration    |

### Easings

| Token                | cubic-bezier              | Use                                 |
|----------------------|---------------------------|-------------------------------------|
| `easing.standard`    | `0.2, 0, 0, 1`            | Default for any state change        |
| `easing.decelerate`  | `0, 0, 0, 1`              | Entering: modals, popovers, toasts  |
| `easing.accelerate`  | `0.3, 0, 1, 1`            | Exiting: dismissals                 |
| `easing.emphasized`  | `0.2, 0, 0, 1.05`         | Tiny overshoot for success affordances |

**Default rule:** any color/transform transition uses `duration.fast` + `easing.standard` unless specified otherwise. Modal/drawer reveals use `duration.base` + `easing.decelerate`. Honor `prefers-reduced-motion` by clamping all durations ≤ `duration.instant` and disabling translate/scale transforms.

---

## 9. Components

Every component below is specified at three levels:
1. **Anatomy** — what it's made of.
2. **Spec** — concrete tokens and dimensions.
3. **States** — rest, hover, focus, active/pressed, disabled, (where relevant) loading, selected.

### 9.1 Button (5 variants)

**Anatomy.** Container · optional leading icon · label · optional trailing icon · optional spinner.

**Shared spec**

| Prop          | Value                                |
|---------------|--------------------------------------|
| Height        | sm 32 / md 36 (default) / lg 44      |
| Padding-x     | 16 (md), 12 (sm), 20 (lg)            |
| Radius        | `radius.md` (10)                     |
| Font          | `body` 14, weight 600                |
| Icon size     | 16 (md/sm), 18 (lg)                  |
| Icon gap      | 8                                    |
| Transition    | `duration.fast` `easing.standard` on `bg, color, box-shadow, transform` |
| Focus ring    | `shadow.focus.brand` (or `.danger` for danger variant) |

**Variants**

| Variant     | Rest bg               | Rest fg     | Border             | Hover                                | Pressed                       | Disabled                     |
|-------------|-----------------------|-------------|--------------------|--------------------------------------|-------------------------------|------------------------------|
| `primary`   | `accent.solid`        | `text.onAccent` | none           | bg `accent.solidHover` + `shadow.glow.mint` + translateY(-1) | translateY(0), bg `mint-700` | bg `ink-200`, fg `ink-400`   |
| `secondary` | `ink-900`             | `ink-50`    | none               | bg `#1F1C17`                         | bg `#000000`                  | bg `ink-200`, fg `ink-400`   |
| `outline`   | transparent           | `text.primary` | 1px `border.default` | bg `ink-100`, border `border.strong` | bg `ink-200`             | fg `ink-400`, border `ink-200` |
| `ghost`     | transparent           | `text.secondary` | none           | bg `ink-100`, fg `text.primary`      | bg `ink-200`                  | fg `ink-400`                 |
| `danger`    | `status.danger.bg`    | `status.danger.fg` | 1px `status.danger.border` | bg `status.danger.500` @ 0.18, border @ 0.40 | bg @ 0.26 | fg `ink-400`         |

**Loading.** Replace leading icon with 14px spinner (mint for primary, current fg for others). Disable pointer events but keep size.

**When to use.** *Primary* for the single most important action per surface (max one per modal/page region). *Secondary* for confirmatory non-CTA. *Outline* for paired actions with primary. *Ghost* for tertiary, toolbar, and icon-only. *Danger* for destructive (delete patient, void invoice).

### 9.2 Input

**Anatomy.** Container · optional leading icon · field · optional trailing icon/affix · optional helper or error text below.

**Spec**

| Prop          | Value                                                    |
|---------------|----------------------------------------------------------|
| Height        | 40 (default), 36 (compact), 48 (large)                   |
| Padding-x     | 12 (or 36 with leading icon)                             |
| Radius        | `radius.md`                                              |
| Font          | `body` 14, weight 400                                    |
| Background    | `surface.raised` (i.e. white in light, raised in dark)   |
| Border        | 1px `border.default`                                     |
| Placeholder   | `text.tertiary`                                          |

**States**

| State        | Border                     | Outline                   | Notes                              |
|--------------|----------------------------|---------------------------|------------------------------------|
| Hover        | `border.strong`            | —                         |                                    |
| Focus        | `border.brand`             | `shadow.focus.brand`      | No layout shift                    |
| Filled       | `border.default`           | —                         |                                    |
| Error        | `status.danger.border`     | `shadow.focus.danger` (only when focused) | Helper turns danger.fg |
| Disabled     | `border.subtle`            | —                         | bg `surface.sunken`, fg `text.tertiary`, cursor not-allowed |
| Read-only    | `border.subtle`            | —                         | bg `surface.sunken`, fg `text.primary` |

**Helper text.** 12px, `text.tertiary` (default), `status.danger.fg` (error). 4px above. Live region for error announcements.

### 9.3 Card

**Anatomy.** Optional header (title + meta + actions) · content · optional footer.

**Spec**

| Prop      | Value                                                   |
|-----------|---------------------------------------------------------|
| Background | `surface.raised`                                       |
| Border    | 1px `border.subtle`                                     |
| Radius    | `radius.lg` (14)                                        |
| Shadow    | `shadow.1`                                              |
| Padding   | 24 (default), 16 (compact), 32 (spacious)               |
| Header→content gap | 16                                             |

**Interactive card.** Add `cursor: pointer`. Hover: `shadow.2` + `translateY(-1)`. Active/pressed: `shadow.1`, `translateY(0)`. Focus-visible: `shadow.focus.brand` (no border change).

### 9.4 Modal

**Anatomy.** Backdrop · panel · header (title + close) · body · footer (action row, primary-trailing in LTR, primary-leading in RTL).

**Spec**

| Prop          | Value                                          |
|---------------|------------------------------------------------|
| Backdrop      | `surface.overlay` + `backdrop-filter: blur(8px)` |
| Panel bg      | `surface.raised`                               |
| Panel border  | 1px `border.subtle`                            |
| Radius        | `radius.xl` (20)                               |
| Shadow        | `shadow.4`                                     |
| Padding       | 32 (header/body/footer each 32 except inner)   |
| Default width | 560 (sm 440, md 560, lg 720, xl 920, full 92vw)|
| Title         | `h3` (Syne 20)                                 |
| Body text     | `body` (DM Sans 14)                            |

**Motion.** Backdrop: opacity 0→1, `duration.base`, `easing.standard`. Panel: opacity 0→1 + scale 0.96→1 + translateY 8→0, `duration.base`, `easing.decelerate`. Exit reverses with `easing.accelerate`.

**Accessibility.** Trap focus within panel. Initial focus on first interactive element (or close button for confirmations). `aria-labelledby` → title id. Esc closes (unless explicitly disabled for destructive flows). Locks body scroll.

### 9.5 Table Row

**Anatomy.** Optional leading checkbox · cells · optional trailing actions menu.

**Spec**

| Prop            | Value                                                |
|-----------------|------------------------------------------------------|
| Height          | 52 (default), 60 (medium), 72 (rich)                 |
| Background      | transparent (inherits container)                     |
| Bottom border   | 1px `border.subtle`                                  |
| Padding-x       | 16 (per cell)                                        |
| Cell font       | `body-sm` 13, weight 400                             |
| Header row font | `caption` 11 uppercase, weight 600, `text.tertiary`  |
| Header row bg   | `surface.sunken`                                     |

**States**

| State     | Background                         | Notes                                |
|-----------|------------------------------------|--------------------------------------|
| Hover     | `ink-100` (`#F4F1EC`)              |                                      |
| Selected  | `accent.muted` (`mint-100`) + 3px left border `accent.solid` | Persists hover/focus       |
| Focus row | `shadow.focus.brand` inset 0       | Keyboard navigation                  |

**Sticky header.** Position sticky with `shadow.1` once the body scrolls. Last column right-aligned actions; in RTL, mirror.

### 9.6 Badge

**Anatomy.** Optional dot/icon · label.

**Spec**

| Prop      | Value                                              |
|-----------|----------------------------------------------------|
| Height    | 22                                                 |
| Padding-x | 8 (10 with leading dot)                            |
| Radius    | `radius.full` (status pills) or `radius.sm` (tags) |
| Font      | `caption` 11, weight 600, +0.04em tracking         |
| Dot       | 6px circle, same color as fg                       |

**Variants**

| Variant | Background                | Foreground         | Border                    |
|---------|---------------------------|--------------------|---------------------------|
| `subtle`  | family `-50`             | family `-700`      | none                      |
| `solid`   | family `-500`            | white              | none                      |
| `outline` | transparent              | family `-700`      | 1px family `-500` @ 0.30  |

**Status presets** (subtle by default):

| Status         | Family    | Example label   |
|----------------|-----------|-----------------|
| `pending`      | ink (neutral) | "Pending"   |
| `confirmed`    | info      | "Confirmed"     |
| `in-progress`  | info      | "In progress"   |
| `completed`    | success   | "Completed"     |
| `paid`         | success   | "Paid"          |
| `overdue`      | danger    | "Overdue"       |
| `cancelled`    | danger    | "Cancelled"     |
| `draft`        | warning   | "Draft"         |

### 9.7 Nav Item

**Anatomy.** Container · icon · label · optional trailing badge/count.

**Spec**

| Prop            | Value                                              |
|-----------------|----------------------------------------------------|
| Height          | 40                                                 |
| Padding         | 0 12                                               |
| Radius          | `radius.md`                                        |
| Font            | `body` 14, weight 500                              |
| Icon            | 18, stroke 1.75                                    |
| Icon→label gap  | 12                                                 |

**States**

| State    | Background           | Label color     | Icon color      | Indicator                                  |
|----------|----------------------|-----------------|-----------------|--------------------------------------------|
| Rest     | transparent          | `text.secondary` | `text.tertiary` | none                                       |
| Hover    | `ink-100`            | `text.primary`  | `text.secondary` | none                                       |
| Active   | transparent          | `text.brand` (`mint-700`) | `text.brand` | 3px left bar `accent.solid` (RTL: right) |
| Disabled | transparent          | `text.tertiary` | `text.tertiary` | none                                       |

The active indicator is intentionally a thin 3px bar (not a fill) — keeps mint usage minimal and feels editorial rather than dashboard-y. Trailing count badges use the `subtle` info preset.

### 9.8 Calendar Event Chip

**Anatomy.** Doctor color bar (left, 3px) · time + status dot row · patient name · procedure caption.

**Spec**

| Prop            | Value                                                              |
|-----------------|--------------------------------------------------------------------|
| Min height      | 36 (15-min slot), grows with duration                              |
| Background      | `clinic.{doctor}.50` (subtle tint of doctor's color)               |
| Left bar        | 3px solid `clinic.{doctor}.500`                                    |
| Radius          | `radius.md` (10)                                                   |
| Padding         | 6 8 8 12 (top/right/bottom/left). RTL flips horizontals.           |
| Border          | 1px `clinic.{doctor}.500` @ 0.18                                   |
| Shadow          | `shadow.1`                                                         |
| Time text       | `caption` 11, weight 600, `clinic.{doctor}.700`                    |
| Patient name    | `body-sm` 13, weight 600, `text.primary`, `truncate`               |
| Procedure       | `caption` 11, `text.tertiary`, `truncate`                          |
| Status dot      | 6px, color = status family `-500` (e.g. confirmed → info-500)      |

**States**

| State     | Treatment                                                                |
|-----------|--------------------------------------------------------------------------|
| Hover     | `shadow.2`, bg `clinic.{doctor}.100`                                     |
| Selected  | 2px outline `clinic.{doctor}.500`, `shadow.3`                             |
| Dragging  | `shadow.4`, opacity 0.92, bg unchanged                                   |
| Drop target | dashed 2px `accent.solid`, bg `accent.subtle`                          |
| Past (read-only) | opacity 0.65, no hover lift                                       |
| Cancelled | strikethrough on patient name, opacity 0.50                              |

**Density rules.**
- 15-minute slot: show time + truncated patient name only.
- 30-minute: time, name, status dot.
- 45+ minutes: full anatomy.
- The chip degrades gracefully — never overflow the slot.

---

## 10. RTL & Internationalization

The product runs in both LTR (English) and RTL (Arabic). Tokens themselves are direction-agnostic; **components are responsible for mirroring** using logical CSS properties.

### Rules

1. Use logical properties everywhere: `padding-inline-start`, `margin-inline-end`, `border-inline-start`, `inset-inline-start` — never `left`/`right` for layout.
2. Use Tailwind's `start-*` / `end-*` utilities (or a logical-properties plugin) for positioning.
3. Icons: directional icons (chevron, arrow, undo, send) must mirror in RTL. Decorative icons (bell, user, plus, check) must NOT mirror.
4. Numbers: always render in **Arabic-Indic Western numerals (0–9)** for IQD and clinical data — even in RTL. Do not switch to ٠١٢٣ in financial or clinical contexts; this is a deliberate clinic-safety choice (matches printed forms and bank statements in Iraq/Kurdistan).
5. Currency formatting in RTL: `IQD 1,250,000` → `1,250,000 د.ع` with a non-breaking space; the symbol is right of the number in RTL but the number itself remains LTR (use `dir="ltr"` on the digits span).
6. Active nav indicator: 3px bar pinned to `inline-start` (left in LTR, right in RTL).
7. Modal action row: primary-trailing in LTR (right), primary-leading in RTL (left).
8. Calendar: time axis stays vertical regardless of direction. The day axis flips: in RTL, days run right-to-left.

### Arabic typography

Syne is Latin-only. For Arabic display copy, pair with **IBM Plex Sans Arabic** (display weight 600) for headings and **IBM Plex Sans Arabic** (regular 400 / medium 500) for body. Both are open-source and have excellent Iraqi/Kurdish glyph coverage. Apply via `:lang(ar)` in CSS so the same `Syne` / `DM Sans` token references resolve correctly per-locale without changing component code.

---

## 11. Accessibility

- **Contrast.** All `text.primary` over any surface meets WCAG AA (≥ 4.5:1). `text.secondary` meets AA at body sizes (verified against `surface.canvas` and `surface.raised`).
- **Mint contrast.** `mint-500` (#00FFB2) is **non-compliant** as text on white (~1.6:1). It is reserved for solid CTA backgrounds (where `text.onAccent` = `ink-900` carries 14.2:1) and as a focus indicator. For mint as text/icon on light surfaces, always use `mint-700` (4.7:1) or `mint-800` (8.1:1).
- **Focus.** Every interactive element shows `shadow.focus.brand` on `:focus-visible`. Never remove outlines without replacement.
- **Hit targets.** Minimum 40×40 for any tap target on touch devices. Icon-only buttons have 40px container even when the icon is 16.
- **Motion.** Respect `prefers-reduced-motion`: clamp all durations to ≤80ms and remove transforms (translate/scale).
- **Color encoding.** Doctor colors and status colors must always be paired with a label, icon, or position — never color alone.

---

## 12. Theme switching

- Store preference in `localStorage` under `velo:theme` (`light` | `dark` | `system`).
- Toggle by adding `class="dark"` to `<html>`.
- All semantic tokens resolve via CSS variables defined on `:root` (light) and `.dark` (dark). Components reference the variables, not the raw values, so theme switching is a single class change.
- `system` mode follows `prefers-color-scheme` and updates live.

---

## 13. Versioning

This document is v1.0. Breaking token changes (renaming a semantic token, removing a primitive) require a major bump and a migration note. Adding new tokens is non-breaking.

---

*End of design system.*
