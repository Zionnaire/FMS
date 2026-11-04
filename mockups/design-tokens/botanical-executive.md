---
name: Botanical Executive
colors:
  surface: '#fcf9f7'
  surface-dim: '#dcd9d8'
  surface-bright: '#fcf9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f1'
  surface-container: '#f0edeb'
  surface-container-high: '#eae8e6'
  surface-container-highest: '#e5e2e0'
  on-surface: '#1b1c1b'
  on-surface-variant: '#414847'
  inverse-surface: '#30302f'
  inverse-on-surface: '#f3f0ee'
  outline: '#727877'
  outline-variant: '#c1c8c6'
  surface-tint: '#496360'
  primary: '#072320'
  on-primary: '#ffffff'
  primary-container: '#1e3835'
  on-primary-container: '#86a19d'
  inverse-primary: '#b0ccc8'
  secondary: '#735854'
  on-secondary: '#ffffff'
  secondary-container: '#ffdad4'
  on-secondary-container: '#795e59'
  tertiary: '#002419'
  on-tertiary: '#ffffff'
  tertiary-container: '#163a2d'
  on-tertiary-container: '#7fa494'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cbe8e4'
  primary-fixed-dim: '#b0ccc8'
  on-primary-fixed: '#04201d'
  on-primary-fixed-variant: '#314c48'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#e1bfb9'
  on-secondary-fixed: '#2a1713'
  on-secondary-fixed-variant: '#59413d'
  tertiary-fixed: '#c4ebd9'
  tertiary-fixed-dim: '#a8cfbd'
  on-tertiary-fixed: '#002116'
  on-tertiary-fixed-variant: '#2a4d40'
  background: '#fcf9f7'
  on-background: '#1b1c1b'
  surface-variant: '#e5e2e0'
typography:
  headline-xl:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Playfair Display
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Playfair Display
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  kpi-metric:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 1.75rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies an editorial, boutique executive tone crafted for high-performing modern teams, boutique consultancies, and executive analytics suites. It moves deliberately away from the cold, sterile blues of legacy enterprise software, replacing them with warm porcelain canvases, rich deep evergreen anchors, and expressive blush-botanical accents.

The design movement is **Warm Editorial Contemporary**:
- **Poise & Humanism:** High-level narrative headlines utilize refined serif letterforms reminiscent of high-end editorial publications, instilling a feeling of bespoke prestige and calm confidence.
- **Biophilic Contrast:** Heavy operational surfaces (primary navigation sidebars, hero telemetry widgets, dark KPI cards) use velvety spruce evergreen tones, creating deep visual grounding against porcelain cream workbenches.
- **Sensory Micro-surfaces:** Light touches of translucent rose glows, pill-shaped tactile controls, and soft radial segment visualizations make data review feel pleasant, focused, and stress-free while strictly adhering to enterprise data hierarchy.

## Colors

The palette balances organic resonance with functional UI clarity:

- **Primary Anchor (`#1E3835` / Spruce Evergreen):** Utilized for structural navigation bars, dark hero data cards, primary button states, and deep contrast text tokens (`#142422`).
- **Secondary Highlight (`#F7D3CD` / Warm Blush Coral):** Utilized for active navigation pill backgrounds, focus badges, glow halos, and primary highlight accents. When paired with `#1E3835` text, it provides high contrast with an organic, gentle feel.
- **Tertiary Accent (`#6B9080` / Soft Sage):** Supports positive data trends, secondary metric badges, balanced progress rings, and calm status markers.
- **Neutral Canvas (`#FBF8F6` / Soft Porcelain Cream):** The global canvas background. Component surfaces rest on pure warm white (`#FFFFFF`) with borders defined by subtle bisque tones (`#EDE7E3`).

### Functional Severity & Status Scale
- **S1 Critical / Red-Coral (`#D95D5D`):** Immediate action required, blocking alerts, severe regressions.
- **S2 High / Warm Terracotta (`#E07A5F`):** Major warnings, capacity thresholds, urgent operational tasks.
- **S3 Medium / Warm Honey Amber (`#D4A373`):** Non-blocking notifications, pending reviews, scheduled items.
- **S4 Low / Slate Herb (`#8D99AE`):** Neutral status, completed historical logs, passive telemetry markers.

## Typography

The type system blends editorial elegance with high-density enterprise efficiency:
- **Playfair Display:** Reserved for contextual greetings, report module titles, campaign cards, and top-tier section headings. It injects warmth and a curated personality into executive summaries.
- **Plus Jakarta Sans:** Drives all operational data representations, analytical tables, form interfaces, and dense navigation trees. Its geometric proportions maintain legible tracking at small dimensions (11px–13px) without visual fatigue.
- **KPI Metrics:** Rendered in heavy weights of Plus Jakarta Sans with negative letter-spacing for crisp numerical comprehension across multi-column data cards.

## Layout & Spacing

The architecture operates on an asymmetrical layout with a permanent vertical anchor and a multi-column fluid working area:

- **Sidebar Anchor:** Fixed width of 240px to 260px on desktop environments, housing the dark forest spruce control panel. Collapses into a floating bottom sheet or off-canvas drawer on mobile viewports (<768px).
- **Executive Grid:** 12-column dynamic fluid grid on desktop (`>1024px`), switching to an 8-column layout on tablet (`768px - 1023px`), and a single-column stacked hierarchy on mobile screens (`<767px`).
- **Rhythm & Padding:** Component cards maintain internal air with `space-md` (`1.25rem` / 20px) to `space-lg` (`1.75rem` / 28px) padding. Layout blocks favor horizontal groupings over infinite vertical scrolling, allowing glanceable operational status.

## Elevation & Depth

Visual hierarchy leverages soft atmospheric depth rather than heavy synthetic drop shadows:

- **Level 0 (Canvas Base):** Flat, un-elevated `#FBF8F6` warm porcelain tone.
- **Level 1 (Standard Metric Containers):** Crisp warm white (`#FFFFFF`) with a delicate single-pixel boundary: `border: 1px solid rgba(220, 212, 206, 0.5)`. The ambient shadow is warm and diffused: `0 4px 20px -4px rgba(30, 56, 53, 0.04)`.
- **Level 2 (Inverted Spruce Hero Surfaces):** Solid `#1E3835` card fills with internal glow treatment. Deep ambient grounding shadow: `0 12px 32px -8px rgba(22, 43, 40, 0.22)`. Charts within hero cards feature radiant translucent stroke gradients (`rgba(247, 211, 205, 0.8)` fading into `#1E383500`).
- **Level 3 (Interactive Modals & Overlays):** Elevated dialogs resting on a frosted warm glass backdrop blur (`backdrop-filter: blur(8px); background: rgba(251, 248, 246, 0.85)`), layered with `0 20px 48px -12px rgba(20, 36, 34, 0.16)`.

## Shapes

The shape language combines gentle, organic rectangles with friendly pill containers:
- **Cards & Data Modules:** Radiused at 1rem (16px) for standard cards, up to 1.5rem (24px) for hero spotlight cards, producing an inviting, tactile enclosure.
- **Action Elements:** Primary navigation links, search containers, status pills, and call-to-action buttons adopt complete pill geometry (`border-radius: 9999px`).
- **Visual Progress Rings & Avatars:** Fully circular geometry (`rounded-full`) contrasting against rectangular card structures.

## Components

### Buttons & Interactive Controls
- **Primary Pill Action:** Pill-shaped (`border-radius: 9999px`), styled with deep spruce (`#1E3835`), crisp ivory text (`#FBF8F6`), and a subtle arrow icon. On hover, shifts softly to `#284B47` with slight upward translation (`transform: translateY(-1px)`).
- **Secondary / Highlight Pill:** Styled with warm blush rose (`#F7D3CD`) fill, spruce text (`#1E3835`), and semi-bold weight. Active navigation links use this exact style.
- **Ghost Action:** Transparent background with `#1E3835` text and 1px border (`rgba(30, 56, 53, 0.15)`), shifting to warm porcelain blush on hover.

### Navigation Sidebar
- Vertical container clad in Spruce Evergreen (`#1E3835`) with muted ivory link labels (`rgba(255, 255, 255, 0.7)`).
- Active item styled as a flush or inset pill filled with blush coral (`#F7D3CD`) and high-contrast dark text (`#1E3835`).
- Footer block hosts a biophilic motivational widget or user avatar badge framed by subtle leaf line-art motifs.

### Metric & Hero Cards
- **Dark Revenue Card:** Spruce background, Playfair Display heading, Plus Jakarta Sans numerical figures, and a dynamic glowing rose line chart with `#F7D3CD` interactive node anchors.
- **Campaign Gradient Card:** Soft ambient blush linear gradient (`linear-gradient(135deg, #FFF5F2 0%, #FEE5E0 100%)`), housing an editorial Playfair serif headline, bulleted campaign metrics, and an organic watermark illustration.
- **Quick Action Icon Tiles:** Rounded square tiles (12px radius) in soft pastel hues (rose, mint, lilac, amber) topped with centered line-art icons and caption labels underneath.

### Data Visualization & Progress Rings
- Multi-segment circular rings utilizing warm terracotta (`#E07A5F`), soft sage green (`#6B9080`), and warm blush (`#F4ACB7`).
- Tooltips are rendered in deep spruce with miniature ivory typography and soft drop shadows.

### Form Inputs & Search Fields
- Fully rounded (`border-radius: 9999px`) search bars with pale ivory fill (`#F5EFEB`), placeholder text set in muted sage/taupe (`#8D99AE`), and an inset left icon.
- Borderless or hairline border focus state utilizing a gentle spruce ring (`box-shadow: 0 0 0 2px rgba(30, 56, 53, 0.2)`).

---

## ⚠️ Internal inconsistency, flagged during batch-2/3 mockup import (2026-09-15)

This source document is **internally inconsistent**: the YAML `colors:` frontmatter above (primary `#072320`, primary-container `#1e3835`, secondary `#735854`, etc.) is the token set that actually matches every saved mockup HTML file in `mockups/screens/`. But the prose sections below it ("Colors", "Components", etc.) describe a **different** palette — primary `#1E3835`, blush accent `#F7D3CD`, sage `#6B9080` — which does not match the mockups and instead matches the hand-authored `docs/design-system.md`.

This is the same mismatch already noted in `mockups/README.md` between `docs/design-system.md` and the mockup HTML. Likely explanation: the frontmatter was machine-exported from the actual shipped Tailwind config (ground truth), while the prose was hand-written earlier/separately and never reconciled against it. **Treat the YAML frontmatter as canonical**, not the prose, when resolving the token discrepancy.
