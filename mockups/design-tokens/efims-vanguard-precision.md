---
name: EFIMS Vanguard Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#0051d5'
  on-tertiary: '#ffffff'
  tertiary-container: '#316bf3'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  data-cell:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  mono-compact:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0em
  badge-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  column-header:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-compact: 1rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-2xl: 2rem
---

## Brand & Style

This design system serves an enterprise tier of financial crime analysts, Anti-Money Laundering (AML) investigators, Money Laundering Reporting Officers (MLRO), and executive compliance directors. The platform operates in high-stress, high-consequence environments where decision velocity, evidentiary integrity, and cognitive endurance are paramount. 

The aesthetic synthesizes modern engineering precision (inspired by Linear and Stripe Dashboard) with high-density forensic investigative structures (inspired by Palantir Gotham and ServiceNow). Visual noise is rigorously eliminated in favor of clean structure, intentional whitespace, structural micro-borders, and high legibility. The interface establishes absolute confidence through institutional weight and operational efficiency:
- **Tone:** Calm, authoritative, surgical, vigilant, and uncompromised.
- **Visual Stance:** Utilitarian Enterprise Modernism. Crisp 1px division, subdued tonal canvases, high-contrast monospace metadata anchors, and disciplined semantic signaling.
- **Core Design Principles:**
  1. *Density without Chaos:* Accommodate 40+ attributes per screen using precise alignment, strict scale hierarchy, and tabular data density rather than visual ornamentation.
  2. *Defensive Contrast:* Color is reserved strictly for operational state changes, severity escalations, and actionable signals. Never use decorative color.
  3. *Zero Ambiguity:* Every financial identifier, transaction hash, case ID, and regulatory deadline is elevated via dedicated monospace treatments and accompanied by dual-channel signaling (never relying on color alone).

## Colors

The system uses a calibrated multi-surface palette engineered for sustained 8-to-12-hour operational shifts. 

### Canvas & Surfaces
- **App Background Canvas:** `#F8FAFC` (Slate 50) for reduced eye strain across broad displays.
- **Card Surface & Modals:** `#FFFFFF` (Pure White) providing sharp contrast against `#F8FAFC`.
- **Sidebar Navigation:** `#0F172A` (Slate 900) grounding navigation hierarchy and anchoring spatial orientation.
- **Subtle Surface Container:** `#F1F5F9` (Slate 100) for inset wells, inactive tabular stripes, and filter bars.

### Primary Accents & Interaction
- **Primary Brand Teal:** `#0D9488` (Teal 600) — used for verified workflows, critical actions, and active tab indicators.
- **Primary Hover:** `#0F766E` (Teal 700).
- **Primary Subdued Background:** `#F0FDFA` (Teal 50).
- **Primary Surface Border:** `#99F6E4` (Teal 200).

### Semantic Severity Hierarchy (Universal Operational Standard)
Severity tokens are unyielding across badges, telemetry dots, table alerts, and container borders:
- **S1 Critical:** Crimson `#EF4444` | Light BG: `#FEF2F2` | Border: `#FECACA` | Text: `#991B1B`
- **S2 High:** Alert Orange `#F97316` | Light BG: `#FFF7ED` | Border: `#FFEDD5` | Text: `#9A3412`
- **S3 Medium:** Warning Amber `#F59E0B` | Light BG: `#FFFBEB` | Border: `#FEF3C7` | Text: `#92400E`
- **S4 Low:** Slate Gray-Blue `#64748B` | Light BG: `#F1F5F9` | Border: `#E2E8F0` | Text: `#334155`

### Status & SLA Threshold Tokens
- **Open / In Progress:** `#2563EB` | Light BG: `#EFF6FF` | Text: `#1E40AF`
- **Pending Approval:** `#D97706` | Light BG: `#FFFBEB` | Text: `#B45309`
- **Overdue / SLA Breached:** `#DC2626` | Light BG: `#FEF2F2` | Text: `#991B1B`
- **Closed / Resolved:** `#059669` | Light BG: `#ECFDF5` | Text: `#065F46`
- **On Hold / Suspended:** `#6B7280` | Light BG: `#F3F4F6` | Text: `#374151`

### Sensitive Compartments
Compartments including AML/MLRO, Whistleblower Protection, HR Escalations, and Legal Privilege require dual-channel recognition: a solid `#0F172A` badge or a `#475569` neutral slate badge coupled with an unambiguous prefix icon (e.g., Lock or Shield).

## Typography

Typography prioritizes maximum scan-speed, visual order, and forensic fidelity.

- **Primary Font Family:** `Inter` handles all primary interfaces, titles, forms, and general content body. Its mechanical neutrality and large x-height maximize reading efficiency on standard enterprise-grade monitors.
- **Monospace Family:** `JetBrains Mono` handles evidentiary identifiers: Transaction Hashes, Incident/Case IDs (`INC-88392-A`), Swift MT103/ISO 20022 message snippets, IP addresses, IBANs, and ISO 8601 UTC timestamps (`YYYY-MM-DD HH:mm:ssZ`).
- **Data Densities:**
  - Table and grid cell body uses `data-cell` (12px) and `body-sm` (13px) to maximize row visibility above the fold.
  - Column headers and badge indicators apply uppercase tracking (`letterSpacing: 0.04em - 0.05em`) to clearly distinguish programmatic metadata labels from user data values.
  - Page headings sit within a tight range of 20px-24px, preserving vertical real estate for tables, investigation graphs, and dossier timelines.

## Layout & Spacing

The platform is engineered desktop-first with an operational base grid of 8px (with 4px micro-increments for compact enterprise components).

### Global Frame Architecture
- **Persistent Global Sidebar:** Fixed width at `256px` (`16rem`), dark slate background (`#0F172A`), zero-bleed full viewport height. Accommodates hierarchical case streams and access compartments.
- **Top Command Header:** Fixed height at `60px` (`3.75rem`), backdrop-stabilized border (`#1E293B` or `#E2E8F0`), spanning from the sidebar boundary to the right viewport edge. Hosts global quick-search (`Ctrl+K`), live incident stream alerts, and active role credentialing.
- **Main Canvas:** Fluid grid structure. Content stretches natively with min-widths enforced (`1280px` desktop baseline) to eliminate layout wrapping of complex tabular feeds. Outer margin is uniform at `space-xl` (`1.5rem`).

### Adaptive Breakpoints
- **Ultra-Wide (≥1920px):** 16-column layout allowing 3-panel workflows (Sidebar + Main Case Register + Slide-over Evidence Inspector).
- **Standard Enterprise Desktop (1440px - 1919px):** 12-column layout; slide-over drawer overlays rightward panels without collapsing the primary table.
- **Compact Desktop (1280px - 1439px):** Sidebar collapses to 64px icon-only rail; table columns hide lower-priority metadata (e.g., secondary audit hashes) behind row expansion.

## Elevation & Depth

Visual depth utilizes crisp low-contrast outlines coupled with minimal, ambient shadows. Heavy skeuomorphism and thick dropshadows are prohibited, as they pollute information-dense workflows.

- **Level 0 (Flat Canvas):** `#F8FAFC` base operational canvas with no elevation.
- **Level 1 (Structural Cards & Modules):** Pure white `#FFFFFF` surface enclosed by a 1px solid `#E2E8F0` border. Shadow is ambient and subtle: `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)`.
- **Level 2 (Hover States, Popovers & Context Menus):** `#FFFFFF` surface, 1px solid `#CBD5E1` border, elevated by `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.06)`.
- **Level 3 (Slide-Over Dossier Drawers & Critical Modals):** Dedicated slide-over panels (480px or 640px) pinned to the right edge with a solid 1px border (`#CBD5E1`) and deep shadow `0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)`. Overlayed across an ambient canvas backdrop blur (`backdrop-filter: blur(4px); background-color: rgba(15, 23, 42, 0.4)`).

## Shapes

The design system employs a structured, institutional geometric baseline. 

- **Cards, Panels, and Wells:** Standard radius of `8px` (`rounded-md` / `0.5rem`). This provides balanced containment for high-density components without softening the professional rigor of the enterprise environment.
- **Form Controls & Inputs:** Exact match to container logic with `6px` to `8px` corner radii, ensuring unified concentric alignment within form field groupings.
- **Badges, Tags, and Pills:** Full pill rounding (`rounded-full` / `9999px`) reserved specifically for discrete state chips, severity indicators, and compartment locks. This strong geometric contrast distinguishes functional status tokens from interactive card structures and input fields.

## Components

### Buttons
- **Primary:** Background `#0D9488`, text `#FFFFFF`, hover `#0F766E`, height 32px or 36px, horizontal padding `12px`, border radius `6px`, font weight `600`, font size `13px`. Focused with a 2px offset ring of `#99F6E4`.
- **Secondary:** Background `#FFFFFF`, text `#0F172A`, 1px solid border `#CBD5E1`, hover `#F8FAFC`.
- **Destructive / Containment Action:** Background `#EF4444`, text `#FFFFFF`, hover `#DC2626`. Used exclusively for containment executions (e.g., "Freeze Account", "Kill Session").
- **Ghost Action:** Background transparent, text `#475569`, hover `#F1F5F9`.

### Badges & Compartment Pills
- Height `20px` to `22px`, font size `11px`, font family `Inter`, weight `600`, uppercase letter spacing `0.04em`, border radius `9999px`, internal padding `2px 8px`.
- **Severity Badges:** Must combine solid 6px dot or standardized SVG icon + background + text token:
  - *S1:* `#FEF2F2` bg, `#FECACA` border, `#991B1B` text, `#EF4444` dot.
  - *S2:* `#FFF7ED` bg, `#FFEDD5` border, `#9A3412` text, `#F97316` dot.
  - *S3:* `#FFFBEB` bg, `#FEF3C7` border, `#92400E` text, `#F59E0B` dot.
  - *S4:* `#F1F5F9` bg, `#E2E8F0` border, `#334155` text, `#64748B` dot.
- **Sensitive Compartment Pills:** Preceded by a mandatory inline SVG Lock or Security Shield icon:
  - *AML/MLRO & Legal:* `#0F172A` background with `#F8FAFC` text, or `#F1F5F9` background with `#0F172A` border and lock icon. Never rely on hue alone.

### Tables & Data Grids
- **Header Row:** Height `36px`, background `#F8FAFC`, border-bottom `1px solid #CBD5E1`, column headers uppercase 11px Inter semibold `#475569`.
- **Data Rows:** Height `40px` (dense) to `48px` (standard), border-bottom `1px solid #E2E8F0`. Hover transition to background `#F8FAFC`.
- **Cell Content:** Numerical and forensic IDs aligned with `JetBrains Mono` 12px. Action triggers pinned in a sticky right-aligned column with quick-action icons.

### Inputs & Global Search (Ctrl+K)
- **Inputs:** Height `34px`, border `1px solid #CBD5E1`, background `#FFFFFF`, font size `13px`, text `#0F172A`. Active focus ring: `2px solid #0D9488` with 0px offset.
- **Global Command Search:** Top bar anchor with explicit `Ctrl + K` or `⌘K` visual shortcut badge (`JetBrains Mono`, 11px, background `#1E293B`, text `#94A3B8`).

### Slide-Over Drawers (Case Dossier Inspector)
- Pinned to the right margin, widths available: `480px` (compact triage) or `640px` (full forensic timeline).
- Continuous `1px solid #E2E8F0` structural left border, pure `#FFFFFF` background, sticky top navigation with dismiss action, sticky footer housing audit sign-off and escalation actions.

---

## Note on scope (added 2026-09-15)

This is a **second, distinct design system** from "Botanical Executive" — cooler teal/blue Material tokens (`primary #00685f`, `tertiary #0051d5`), Inter + JetBrains Mono typography (not Playfair Display/Plus Jakarta Sans), and a flatter "enterprise SaaS" visual language rather than the warm/editorial botanical style.

It matches the two mockups previously flagged as stylistic outliers: [command-center-alt.html](../screens/command-center-alt.html) and [notification-center-drawer-vanguard.html](../screens/notification-center-drawer-vanguard.html) (the pre-restyle version of the notification drawer — a "Botanical Executive Restyle" comment in the source of the other variant, `notification-center-drawer.html`, confirms that screen was later reskinned from this palette into the botanical one).

This suggests **"EFIMS Vanguard Precision" was an earlier or alternative design exploration that was later superseded by "Botanical Executive"** for the majority of the product — worth confirming with the user, but the weight of evidence (18 of 20 screens, plus an explicit restyle comment) points to Botanical Executive as canonical going forward.
