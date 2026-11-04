# EFIMS Frontend Design System & Component Documentation

**Design System:** Botanical Executive
**Platform:** EFIMS (Enterprise Financial Crime Intelligence & Incident Management System)
**Version:** 1.2.0 — Reconciled against shipped mockup palette
**Target Environment:** Storybook 8+, Tailwind CSS v3.4+, React 18+ / TypeScript, Material Symbols Outlined

> Source: `efims_frontend_design_tokens_storybook_stories_documentation.txt` (superset of the
> earlier `efims_frontend_design_tokens_component_documentation.md`, which this file replaces
> as the canonical reference).
>
> **2026-09-18 reconciliation note:** v1.1.0 of this doc was hand-authored from a standalone
> design-tokens/Storybook text document *before* any real screens existed. Once all 35 EFIMS
> mockup HTML files (`mockups/screens/`) were in hand, it turned out every one of them ships a
> different, internally-consistent Material-Design-3-style token set — different hex values for
> `primary`, `primary-container`, `on-primary-container`, etc., and **Plus Jakarta Sans** instead
> of **Inter** for body/UI text. This version replaces every color and font-family value below
> with the values actually verified across all 35 mockups (cross-checked against
> [`mockups/design-tokens/botanical-executive.md`](../mockups/design-tokens/botanical-executive.md)'s
> YAML frontmatter, which independently confirms the same values). Where old and new values
> differ, the old value is kept in a `~~strikethrough~~` aside so the change is traceable. Layout,
> component structure, Storybook architecture, and interaction-testing patterns are unaffected —
> only literal color/font token values changed.

---

## 1. Design Tokens Specification

### 1.1 Color Tokens & Semantic Mappings

The **Botanical Executive** palette pairs a near-black deep evergreen primary (`#072320`) and
spruce container tone (`#1E3835`) with delicate warm porcelain backgrounds (`#FCF9F7`), crisp
card surfaces (`#FFFFFF`), and a muted warm-taupe secondary/blush accent (`#735854` /
`#FFDAD4`).

#### Core Color Palette

Full Material-3-style token set, verified against every saved mockup's Tailwind config
(`mockups/screens/*.html`) and against `mockups/design-tokens/botanical-executive.md`'s
frontmatter:

| Token Name | HEX | Tailwind Class / CSS Variable | Role / Usage |
| :--- | :--- | :--- | :--- |
| `primary` | `#072320` | `bg-primary`, `text-primary` | Main brand tone, active titles, high-emphasis icons, KPI figures |
| `primary-container` | `#1E3835` | `bg-primary-container` | Sidebar background, dark hero/terminal cards, active nav rail fill |
| `on-primary` | `#FFFFFF` | `text-on-primary` | High-contrast text on `primary` / `primary-container` surfaces |
| `on-primary-container` | `#86A19D` | `text-on-primary-container` | Muted navigation labels, sidebar secondary text |
| `inverse-primary` | `#B0CCC8` | `text-inverse-primary` | Primary-toned text on inverted (dark) surfaces |
| `primary-fixed` | `#CBE8E4` | `bg-primary-fixed` | Fixed-tone light accent, unaffected by dark/light surface swaps |
| `primary-fixed-dim` | `#B0CCC8` | `bg-primary-fixed-dim` | Dimmer fixed-tone variant |
| `on-primary-fixed` | `#04201D` | `text-on-primary-fixed` | Text on `primary-fixed` |
| `on-primary-fixed-variant`| `#314C48` | `text-on-primary-fixed-variant` | Secondary text on `primary-fixed` |
| `secondary` | `#735854` | `text-secondary`, `bg-secondary` | Warm taupe accent, callout highlights, key markers |
| `on-secondary` | `#FFFFFF` | `text-on-secondary` | Text on `secondary` |
| `secondary-container` | `#FFDAD4` | `bg-secondary-container` | Active navigation pill, active filter pills, soft alert/blush badges |
| `on-secondary-container`| `#795E59` | `text-on-secondary-container` | Text on `secondary-container` badges |
| `secondary-fixed` | `#FFDAD4` | `bg-secondary-fixed` | Fixed-tone blush accent (same value as `secondary-container` in this palette) |
| `secondary-fixed-dim` | `#E1BFB9` | `bg-secondary-fixed-dim` | Dimmer fixed blush |
| `on-secondary-fixed` | `#2A1713` | `text-on-secondary-fixed` | Text on `secondary-fixed` |
| `on-secondary-fixed-variant`| `#59413D` | `text-on-secondary-fixed-variant` | Secondary text on `secondary-fixed` |
| `tertiary` | `#002419` | `text-tertiary`, `bg-tertiary` | Success/verified accents, positive telemetry |
| `on-tertiary` | `#FFFFFF` | `text-on-tertiary` | Text on `tertiary` |
| `tertiary-container` | `#163A2D` | `bg-tertiary-container` | Dark success/verified surfaces |
| `on-tertiary-container` | `#7FA494` | `text-on-tertiary-container` | Text on `tertiary-container` |
| `tertiary-fixed` | `#C4EBD9` | `bg-tertiary-fixed` | Verified/"ATTESTED"/success badge fill |
| `tertiary-fixed-dim` | `#A8CFBD` | `bg-tertiary-fixed-dim` | Dimmer verified badge fill |
| `on-tertiary-fixed` | `#002116` | `text-on-tertiary-fixed` | Text on `tertiary-fixed` |
| `on-tertiary-fixed-variant`| `#2A4D40` | `text-on-tertiary-fixed-variant` | Text on verified badges (most common "Compliant" text color) |
| `error` | `#BA1A1A` | `text-error`, `border-error` | S1/critical accents, destructive action borders |
| `on-error` | `#FFFFFF` | `text-on-error` | Text on `error` |
| `error-container` | `#FFDAD6` | `bg-error-container` | S1/critical badge fill, destructive-action hover backgrounds |
| `on-error-container` | `#93000A` | `text-on-error-container` | Text on `error-container` badges |
| `surface` / `background` | `#FCF9F7` | `bg-surface`, `bg-background` | Application canvas / base background |
| `on-surface` | `#1B1C1B` | `text-on-surface` | Primary body text |
| `on-surface-variant` | `#414847` | `text-on-surface-variant` | Secondary/muted body text, captions |
| `surface-bright` | `#FCF9F7` | `bg-surface-bright` | Same as `surface`; used for emphasis containers |
| `surface-dim` | `#DCD9D8` | `bg-surface-dim` | Dimmed surface for de-emphasized panels |
| `surface-container-lowest`| `#FFFFFF` | `bg-surface-container-lowest` | Foreground card containers, tables, modal dialogs |
| `surface-container-low` | `#F6F3F1` | `bg-surface-container-low` | Subtle card background, hovered rows, section dividers |
| `surface-container` | `#F0EDEB` | `bg-surface-container` | Filter pill backgrounds, table header background |
| `surface-container-high`| `#EAE8E6` | `bg-surface-container-high` | Input field backgrounds, tab trays, badge backgrounds |
| `surface-container-highest`| `#E5E2E0` | `bg-surface-container-highest` | Highest-emphasis neutral container |
| `surface-variant` | `#E5E2E0` | `bg-surface-variant` | Alternate neutral surface (same value as `surface-container-highest`) |
| `surface-tint` | `#496360` | — | Tint overlay reference for elevation |
| `inverse-surface` | `#30302F` | `bg-inverse-surface` | Dark inverted surface (e.g. tooltips, dark-mode base) |
| `inverse-on-surface` | `#F3F0EE` | `text-inverse-on-surface` | Text on `inverse-surface` |
| `outline` | `#727877` | `border-outline` | Standard card borders, structural dividers |
| `outline-variant` | `#C1C8C6` | `border-outline-variant` | Subtle table row borders, subtle inner item borders |

> **What changed from v1.1.0:** `primary` was `~~#1E3835~~`, now `#072320`. `primary-container`
> was `~~#122422~~`, now `#1E3835`. `on-primary-container` was `~~#E1EFEA~~`, now `#86A19D`.
> `secondary` was `~~#D48372~~`, now `#735854`. `secondary-container` was `~~#F7D3CD~~`, now
> `#FFDAD4`. `on-secondary-container` was `~~#4D231C~~`, now `#795E59`. `outline` was
> `~~#D8D1CB~~`, now `#727877`; `outline-variant` was `~~#E8E2DD~~`, now `#C1C8C6`. Every other
> token above (`tertiary`, `error`, all `-fixed` variants) did not previously exist in this doc
> at all — the v1.1.0 palette only modeled 13 tokens; the real system uses ~45.

#### Severity & Status Color Tokens

Severity/status colors are a **deliberately separate, raw utility layer** — verified across
mockups, they are *not* derived from the Botanical Executive brand tokens above (e.g. the S1
badge in `notification-center-drawer.html` is a literal `#EF4444`, not `error` `#BA1A1A`, even
though both read as "critical red"). Keep them as independent semantic constants:

| Semantic Token | HEX | Surface / Pill BG | Text / Border Class | Application |
| :--- | :--- | :--- | :--- | :--- |
| `severity-s1-critical` | `#EF4444` | `#FEF2F2` / `#FFDAD6` (`error-container`) | `text-red-700 border-red-300`, or brand `text-on-error-container border-error/30` | S1 breaches, unauthorized defalcation, kill-switch |
| `severity-s2-high` | `#F59E0B` | `#FFF7ED` | `text-orange-800 border-orange-200` | S2 severe anomalies, mule account syndication |
| `severity-s3-medium` | `#F59E0B` | `#FFFBEB` | `text-amber-800 border-amber-200` | Ingress latency spikes, anomalous routing flags |
| `severity-s4-low` | `#94A3B8` | `#F1F5F9` | `text-slate-600 border-slate-200` | Routine audit notices, standard regulatory receipts |
| `status-verified-active`| `#0D9488` / brand `tertiary-fixed` `#C4EBD9` | `#F0FDFA` or `tertiary-fixed` | `text-on-tertiary-fixed-variant` (`#2A4D40`) | Attested signatures, HSM active, WORM verified — most mockups use the brand `tertiary-fixed` pairing rather than a raw teal |
| `status-frozen-lien` | brand `secondary-container` `#FFDAD4` | `secondary-container` | `text-on-secondary-fixed` (`#2A1713`) | Post-No-Debit (PND) active, Mareva injunctions |

> **What changed from v1.1.0:** S1/S2/S3/S4 hexes were previously Tailwind's 600-weight shades
> (`#DC2626`, `#EA580C`, `#D97706`, `#64748B`); mockups actually use the lighter 500-weight
> shades (`#EF4444`, `#F59E0B` for both S2 and S3 depending on screen, `#94A3B8`). Same hue
> family, one shade step lighter — updated to match. `status-verified-active` and
> `status-frozen-lien` previously used raw emerald/blue; mockups predominantly route these
> through the brand `tertiary-fixed` and `secondary-container` tokens instead, so those are now
> listed as the primary mapping with the raw color kept as a fallback note.

---

### 1.2 Typography Hierarchy

EFIMS combines an authoritative editorial serif for executive scorecards and docket headers
with a high-density, legible sans-serif for telemetry, NUBANs, and payload streams.

- **Display & Headline Font:** `Playfair Display`, serif (Class: `font-serif` / `font-headline-*`)
- **Body & Interface Font:** `Plus Jakarta Sans`, sans-serif (Class: `font-sans` / `font-body-*`, `font-label-*`, `font-title-*`)
- **Forensic & Cryptographic Font:** `font-mono` (Tailwind's default monospace stack). A minority
  of screens (the notification-center-drawer variants) additionally load `JetBrains Mono` via
  Google Fonts but do **not** wire it into Tailwind's `mono` family — so `font-mono` classes
  currently render in the browser's default monospace stack everywhere. If JetBrains Mono is the
  intended forensic font, `fontFamily.mono` needs to be set explicitly in the real app's Tailwind
  config; it is not automatic from loading the Google Fonts `<link>` alone.

> **What changed from v1.1.0:** Body/interface font was `~~Inter~~`, now **Plus Jakarta Sans** —
> confirmed by every one of the 35 saved mockups' `<link>` tags and Tailwind `fontFamily` config;
> none of them load or reference Inter.

| Scale Token | Font Family | Size | Weight | Line Height | Letter Spacing | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `headline-xl` | Playfair Display | 40px | 600 | 48px | -0.02em | Master screen titles, Board Dossier titles |
| `headline-xl-mobile` | Playfair Display | 30px | 600 | 38px | -0.01em | Mobile master titles |
| `headline-lg` | Playfair Display | 28px | 600 | 36px | -0.015em | Section banners, Incident Dossier headers |
| `headline-lg-mobile` | Playfair Display | 24px | 600 | 32px | -0.01em | Mobile section banners |
| `headline-md` | Playfair Display | 22px | 600 | 28px | — | Card/module headers |
| `title-lg` | Plus Jakarta Sans | 18px | 700 | 24px | — | Card headers, table master labels |
| `title-md` | Plus Jakarta Sans | 16px | 600 | 22px | — | Subheadings, modal titles, form groups |
| `body-lg` | Plus Jakarta Sans | 15px | 400 | 24px | — | Editorial/narrative body copy |
| `body-md` | Plus Jakarta Sans | 13px | 400 | 20px | — | Standard table data cells, descriptive body text |
| `body-sm` | Plus Jakarta Sans | 12px | 400 | 16px | — | Secondary metadata, helper captions |
| `label-md` | Plus Jakarta Sans | 12px | 600 | 16px | 0.02em | Buttons, nav labels, badge text |
| `label-sm` | Plus Jakarta Sans | 11px | 600 | 14px | 0.04em | Smallest badge/caption labels |
| `kpi-metric` | Plus Jakarta Sans | 32px | 700 | 38px | -0.03em | Large monetary/telemetry figures |

> **What changed from v1.1.0:** the old scale (`display-lg`, `display-md`, `mono-data`,
> `mono-code`) used different names, sizes, and an Inter-based sans stack throughout. The table
> above replaces it with the actual scale token names and values used across every mockup's
> Tailwind config (`headline-*`, `title-*`, `body-*`, `label-*`, `kpi-metric`).

---

### 1.3 Spacing, Radii & Elevation Tokens

```css
/* Tailwind Spacing Scale (matches mockups' tailwind.config extend.spacing) */
--space-xs: 0.375rem;   /* 6px */
--space-sm: 0.75rem;    /* 12px */
--space-md: 1.25rem;    /* 20px */
--space-lg: 1.75rem;    /* 28px */
--space-xl: 2.5rem;     /* 40px */
--gutter: 1.25rem;      /* 20px */
--gutter-mobile: 0.75rem; /* 12px */
--margin: 2rem;         /* 32px */
--margin-mobile: 1rem;  /* 16px */

/* Radii Scale (matches mockups' tailwind.config extend.borderRadius) */
--radius-DEFAULT: 0.25rem; /* 4px: rounded — badge chips, small tags */
--radius-lg: 0.5rem;      /* 8px: rounded-lg — buttons, table cells, inputs */
--radius-xl: 0.75rem;     /* 12px: rounded-xl — standard cards */
--radius-full: 9999px;    /* rounded-full: navigation pills, avatar badges */
/* Note: mockups only extend the 4 keys above; larger card radii (rounded-2xl = 1rem,
   rounded-3xl = 1.5rem) rely on Tailwind's own un-extended defaults and appear
   directly in markup rather than via a named token — e.g. hero/spotlight cards. */

/* Elevation Shadows — verified unchanged; this exact shadow literal appears
   verbatim across many mockups (e.g. incident-triage-severity.html,
   transaction-flow-heatmap.html) as an arbitrary Tailwind shadow value rather
   than a named token: */
--shadow-card: 0 4px 20px -4px rgba(30, 56, 53, 0.04);
--shadow-hover: 0 8px 24px -6px rgba(22, 58, 45, 0.06);
--shadow-hero: 0 12px 32px -8px rgba(22, 43, 40, 0.22);   /* dark spruce hero cards */
--shadow-drawer: 0 20px 25px -5px rgba(15, 23, 42, 0.15);
--shadow-modal: 0 20px 48px -12px rgba(20, 36, 34, 0.16);
```

> **What changed from v1.1.0:** the old radii scale (`xs:4px, sm:6px, md:10px, lg:16px`) was
> invented and doesn't match any mockup. Replaced with the actual 4-key extend from the mockups'
> shared Tailwind config, plus a note about the un-extended larger radii used directly in markup.
> Spacing tokens are newly added (the old doc had none). Elevation shadow values are **unchanged
> in substance** — the old `--shadow-card` value was already correct and is now confirmed
> byte-for-byte against real mockup markup.

---

## 2. Core UI Component Specifications

### 2.1 SideNavBar (Persistent Shell)
- **Dimensions:** Width `256px` (`w-64`), full viewport height `100vh`, fixed dock left.
- **Surface:** `bg-primary-container` (`#1E3835`) with `border-r border-outline-variant/10`
  (`#C1C8C6` at 10% — ~~previously `bg-[#122422]` with `border-[#1E3835]/40`~~).
- **Branding Header:** Monogram Shield in rounded-full spruce container; title `EFIMS Core`
  (`font-bold text-surface-bright text-base`) with departmental enclave subtext (e.g.
  `PROD - NG CORE BANKING` / `AML Operations`).
- **Navigation Item States:**
  - *Active:* `bg-secondary-container text-on-secondary-container font-semibold rounded-full px-4 py-2.5 shadow-sm`
    (`#FFDAD4` fill, `#795E59` text — ~~previously `bg-[#F7D3CD] text-[#1E3835]`~~).
  - *Inactive:* `text-on-primary-container/80 hover:text-on-primary hover:bg-primary/40 rounded-full px-4 py-2.5 transition-colors`
    (`#86A19D`/80 → white on hover, `#072320`/40 hover fill — ~~previously
    `text-[#E1EFEA]/75 hover:text-white hover:bg-[#1E3835]/60`~~).
- **Footer Section:** System Health pill indicator (`99.98% Operational`) and clearance chip
  (`Clearance: Tier III`).

### 2.2 TopNavBar (Command & Breadcrumb Rail)
- **Dimensions:** Height `60px`–`64px` (varies slightly by screen), fixed top dock spanning
  `left-64 right-0`, `z-30`.
- **Surface:** `bg-surface/90 backdrop-blur-md border-b border-outline-variant/20 or /30`
  (`#FCF9F7`/90, `#C1C8C6` border — ~~previously `border-[#E8E2DD]`~~).
- **Components:**
  - *Breadcrumbs:* Interactive navigation trail (`EFIMS Core` / `Cases` / `CS-2024-0419`).
  - *Command Quick-Search:* Pill input with search icon; some screens show a `Ctrl + K` shortcut
    badge.
  - *Urgent SLA Breach Tracker:* Error-container pill (`S1 SLA Breach (00:14:22)`, `#FFDAD6` fill,
    `#93000A` text).
  - *Cryptographic Attestation Badge:* Hardware key / clearance status indicator.
  - *User Profile & Clearance Avatar:* Headshot or initials avatar with clearance ring.

### 2.3 Metric & KPI Telemetry Card
- **Surface:** `bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm`
  (`#FFFFFF`, `#C1C8C6` border — ~~previously `border-[#E8E2DD]`~~).
- **Structure:**
  - *Top Row:* Metric label (`text-label-md text-on-surface-variant uppercase tracking-wider`)
    paired with a leading status badge/icon.
  - *Center Value:* Display metric (e.g., `₦45,000,000.00` in `font-kpi-metric text-kpi-metric
    text-primary`, `#072320` — ~~previously `text-[#1E3835]`~~).
  - *Sub-Metrics Row:* Percentage delta, preservation ratio, target corridor badge.

### 2.4 Forensic Data Table & Ledger
- **Surface:** `bg-surface-container-lowest rounded-xl border border-outline-variant/40 overflow-hidden`.
- **Table Header:** `bg-surface-container-low border-b border-outline-variant/30`
  (`#F6F3F1` — unchanged); `text-label-sm font-bold uppercase tracking-wider text-on-surface-variant px-4 py-3 text-left`.
- **Table Rows:** Minimum `40px`–`48px` height, `border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors`
  (~~previously `border-[#E8E2DD]/70`~~). Monetary values in `font-mono font-semibold text-on-surface`.
  Account numbers (NUBAN) with instant copy-to-clipboard trigger. Action column: inline action
  menu (`Inspect`, `Freeze`, `Affidavit`).

### 2.5 Dual-Custody Quorum & Hardware Key Authorization Card
- **Surface:** `bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-6 shadow-sm`
  (~~previously `border-[#D8D1CB]`~~).
- **Quorum Progress Gauge:** Circular or bar indicator tracking required shares (e.g.,
  `2 of 3 Signed (66.7%)`).
- **Attestation Slot Components:**
  - Key Holder Avatar & Title (e.g. `Chief Compliance Officer`, `General Counsel`, `Audit Chair`).
  - Attestation State: *Attested* — `bg-tertiary-fixed text-on-tertiary-fixed-variant` badge
    (`#C4EBD9` / `#2A4D40`) with signature digest and hardware key serial. *Pending* — pulsing
    `bg-secondary-container text-on-secondary-fixed-variant` badge (`#FFDAD4` / `#59413D`) with a
    WebAuthn/biometric trigger button.
- **Cryptographic Seal Footer:** SHA-256 docket hash with direct verification link to
  cold-storage WORM node.

### 2.6 Emergency Action & Kill-Switch Pattern
- **Visual Isolation:** `border-error/30 bg-error-container/40 rounded-xl p-5`
  (`#BA1A1A`/30 border, `#FFDAD6`/40 fill — ~~previously raw `border-red-500/50 bg-red-50/40`~~).
- **Two-Step Safeguard:**
  1. Trigger click opens hardware token confirmation modal.
  2. Requires explicit textual confirmation (e.g., type `FREEZE-IMMEDIATE`) or multi-party HSM
     challenge response before dispatching interbank Post-No-Debit (PND) or API gateway
     revocation.

---

## 3. Storybook Architecture & Global Setup

EFIMS UI uses **Storybook 8+** with Component Story Format 3 (**CSF 3.0**), strict TypeScript
definitions, Tailwind CSS integration, and MSW (Mock Service Worker) for cryptographic and
interbank RPC simulation.

### 3.1 Global Configuration (`.storybook/preview.ts`)

```typescript
import type { Preview } from '@storybook/react';
import '../src/index.css'; // Includes Tailwind v3.4 directives & Botanical tokens

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'Botanical Porcelain',
      values: [
        { name: 'Botanical Porcelain', value: '#FCF9F7' },
        { name: 'White Surface', value: '#FFFFFF' },
        { name: 'Spruce Enclave', value: '#1E3835' }, // was '#122422' in v1.1.0
      ],
    },
    layout: 'padded',
  },
};

export default preview;
```

---

## 4. Component Stories Documentation (CSF 3.0)

### 4.1 SideNavBar Stories (`SideNavBar.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { SideNavBar } from './SideNavBar';

const meta: Meta<typeof SideNavBar> = {
  title: 'Shell/SideNavBar',
  component: SideNavBar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Primary persistent left navigation rail in deep spruce (#1E3835) with blush active pill indicators.',
      },
    },
  },
  argTypes: {
    activePath: {
      control: 'select',
      options: ['/incidents', '/cases', '/investigations', '/evidence', '/recovery', '/reporting', '/telemetry', '/audit'],
    },
    clearanceLevel: {
      control: 'select',
      options: ['Tier I', 'Tier II', 'Tier III - Forensic Lead', 'Cabinet MLRO'],
    },
    systemHealthPercentage: {
      control: { type: 'range', min: 90, max: 100, step: 0.01 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof SideNavBar>;

export const Default: Story = {
  args: {
    activePath: '/incidents',
    clearanceLevel: 'Tier III - Forensic Lead',
    systemHealthPercentage: 99.98,
    enclaveLabel: 'PROD - NG CORE BANKING',
  },
};

export const CriticalIsolationMode: Story = {
  args: {
    activePath: '/recovery',
    clearanceLevel: 'Cabinet MLRO',
    systemHealthPercentage: 97.42,
    enclaveLabel: 'RESTRICTED - WORM ENCLAVE #9',
    breakGlassArmed: true,
  },
};
```

---

### 4.2 TopNavBar Stories (`TopNavBar.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { TopNavBar } from './TopNavBar';

const meta: Meta<typeof TopNavBar> = {
  title: 'Shell/TopNavBar',
  component: TopNavBar,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    slaRemainingSeconds: { control: { type: 'number', step: 60 } },
    hardwareKeyActive: { control: 'boolean' },
    activeSlaBreach: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof TopNavBar>;

export const StandardOperations: Story = {
  args: {
    breadcrumbs: ['EFIMS Core', 'Case Management', 'CS-2024-0419'],
    hardwareKeyActive: true,
    hardwareKeyLabel: 'YubiKey 5C #8812',
    activeSlaBreach: false,
    slaRemainingSeconds: 3600,
    userProfile: {
      name: 'Dr. Folashade Adebayo',
      title: 'Chief Compliance Officer',
      avatarUrl: '/avatars/adebayo.jpg',
    },
  },
};

export const ImminentSlaBreach: Story = {
  args: {
    breadcrumbs: ['EFIMS Core', 'Containment & PND', 'INC-2024-8821'],
    hardwareKeyActive: true,
    hardwareKeyLabel: 'payShield HSM #04 Enclave',
    activeSlaBreach: true,
    slaRemainingSeconds: 862, // 14m 22s
    userProfile: {
      name: 'Fatima Eze, CAMS',
      title: 'Lead Anti-Money Laundering Officer',
      avatarUrl: '/avatars/eze.jpg',
    },
  },
};
```

---

### 4.3 Metric & KPI Telemetry Card Stories (`MetricTelemetryCard.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { MetricTelemetryCard } from './MetricTelemetryCard';

const meta: Meta<typeof MetricTelemetryCard> = {
  title: 'Forensics/MetricTelemetryCard',
  component: MetricTelemetryCard,
  argTypes: {
    statusTrend: { control: 'select', options: ['positive', 'negative', 'neutral', 'critical'] },
  },
};

export default meta;
type Story = StoryObj<typeof MetricTelemetryCard>;

export const GrossDefalcationExposure: Story = {
  args: {
    title: 'Gross Defalcation Disputed',
    amount: '₦45,000,000.00',
    caption: '100% Gross Baseline (4 Outbound Tranches)',
    trendDelta: '+16.2% vs baseline',
    statusTrend: 'critical',
    badgeText: 'S1 Exposure',
    iconName: 'warning',
  },
};

export const PreservedCapitalLien: Story = {
  args: {
    title: 'Successfully Liened & Secured',
    amount: '₦38,200,000.00',
    caption: '14 Mule Accounts Preserved',
    subText: '84.88% Preserved Rate',
    statusTrend: 'positive',
    badgeText: 'PND Enforced',
    iconName: 'lock',
  },
};

export const ResidualDefalcationNDIC: Story = {
  args: {
    title: 'Net Residual Defalcation',
    amount: '₦6,800,000.00',
    caption: '15.12% Residual • Bond #FBC-881 Claim',
    subText: 'Leadway Assurance Underwriting',
    statusTrend: 'neutral',
    badgeText: 'Under Review',
    iconName: 'verified',
  },
};
```

---

### 4.4 Forensic Ledger & Data Table Stories (`ForensicLedgerTable.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { ForensicLedgerTable } from './ForensicLedgerTable';

const mockTranches = [
  {
    trancheRef: 'TR-0921-A',
    beneficiaryName: 'GTBank Mule Primary',
    nuban: '0421098452',
    debitAmount: '₦15,000,000.00',
    pndStatus: 'ENFORCED',
    judicialStatus: 'Mareva Bound',
    recoveryStatus: '100% Repatriated',
  },
  {
    trancheRef: 'TR-0921-B',
    beneficiaryName: 'Kuda MFB Synthetic Escrow',
    nuban: '2004918201',
    debitAmount: '₦10,000,000.00',
    pndStatus: 'ENFORCED',
    judicialStatus: 'Court Order #912',
    recoveryStatus: '₦8,200,000 Liened (₦1.8M ATM Loss)',
  },
  {
    trancheRef: 'TR-0921-C',
    beneficiaryName: 'PalmPay Ltd Synthetic Wallet',
    nuban: '9921004812',
    debitAmount: '₦10,000,000.00',
    pndStatus: 'ENFORCED',
    judicialStatus: 'Mareva Bound',
    recoveryStatus: '100% Wallet Frozen',
  },
  {
    trancheRef: 'TR-0921-D',
    beneficiaryName: 'Zenith Bank Sub-Syndicate',
    nuban: '1029384756',
    debitAmount: '₦10,000,000.00',
    pndStatus: 'ENFORCED',
    judicialStatus: 'Mareva Bound',
    recoveryStatus: '₦5,000,000 Frozen (₦5.0M Crypto Outflow)',
  },
];

const meta: Meta<typeof ForensicLedgerTable> = {
  title: 'Forensics/ForensicLedgerTable',
  component: ForensicLedgerTable,
};

export default meta;
type Story = StoryObj<typeof ForensicLedgerTable>;

export const DefaultLedger: Story = {
  args: {
    title: 'Granular Recovery Tranche Ledger',
    subtitle: 'Statutory journal mapping legal status, post-no-debit enforcement, and forensic trace references.',
    rows: mockTranches,
    totalBalancedAmount: '₦45,000,000.00',
    isLoading: false,
  },
};

export const LoadingState: Story = {
  args: {
    title: 'Granular Recovery Tranche Ledger',
    rows: [],
    isLoading: true,
  },
};

export const EmptyState: Story = {
  args: {
    title: 'Granular Recovery Tranche Ledger',
    rows: [],
    isLoading: false,
  },
};
```

---

### 4.5 Dual-Custody Quorum Card Stories (`DualCustodyQuorumCard.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { DualCustodyQuorumCard } from './DualCustodyQuorumCard';

const meta: Meta<typeof DualCustodyQuorumCard> = {
  title: 'Security/DualCustodyQuorumCard',
  component: DualCustodyQuorumCard,
  argTypes: {
    onTriggerBiometric: { action: 'triggeredBiometricTap' },
    onExecuteUnmask: { action: 'executedUnmask' },
    onAbortReseal: { action: 'abortedReseal' },
  },
};

export default meta;
type Story = StoryObj<typeof DualCustodyQuorumCard>;

export const TwoOfThreeAttested: Story = {
  args: {
    docketId: 'WB-2024-9901-XQ4',
    statutoryBasis: 'Pursuant to Federal High Court Subpoena FHC/L/CS/2024/912',
    quorumRequired: 3,
    quorumCompleted: 2,
    sessionTtlSeconds: 509,
    custodians: [
      {
        role: 'Chief Compliance Officer',
        name: 'Mohammed Lawal, CAMS',
        status: 'ATTESTED',
        tokenLabel: 'YubiKey 5C #8812',
        signatureDigest: 'Ed25519-Verified',
        timestamp: '10:42:19 UTC',
      },
      {
        role: 'General Counsel',
        name: 'Barr. Folashade Ogundimu',
        status: 'ATTESTED',
        tokenLabel: 'YubiKey 5C #7712',
        signatureDigest: 'Ed25519-Verified',
        timestamp: '10:44:03 UTC',
      },
      {
        role: 'Board Audit Chair',
        name: 'Dr. A. Bello',
        status: 'AWAITING_TAP',
        tokenLabel: 'Hardware PKCS#11 FIPS Token',
        timestamp: 'Pending WebAuthn Tap',
      },
    ],
  },
};

export const FullQuorumAchieved: Story = {
  args: {
    docketId: 'WB-2024-9901-XQ4',
    quorumRequired: 3,
    quorumCompleted: 3,
    sessionTtlSeconds: 900,
    custodians: [
      {
        role: 'Chief Compliance Officer',
        status: 'ATTESTED',
        tokenLabel: 'YubiKey 5C #8812',
        signatureDigest: 'Ed25519-Verified',
      },
      {
        role: 'General Counsel',
        status: 'ATTESTED',
        tokenLabel: 'YubiKey 5C #7712',
        signatureDigest: 'Ed25519-Verified',
      },
      {
        role: 'Board Audit Chair',
        status: 'ATTESTED',
        tokenLabel: 'YubiKey 5C #9941',
        signatureDigest: 'Ed25519-Verified',
      },
    ],
  },
};
```

---

### 4.6 Emergency Kill-Switch & Action Modal Stories (`EmergencyActionCard.stories.tsx`)

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { EmergencyActionCard } from './EmergencyActionCard';

const meta: Meta<typeof EmergencyActionCard> = {
  title: 'Security/EmergencyActionCard',
  component: EmergencyActionCard,
  argTypes: {
    onArmKillSwitch: { action: 'armedKillSwitch' },
    onCancel: { action: 'cancelled' },
  },
};

export default meta;
type Story = StoryObj<typeof EmergencyActionCard>;

export const PostNoDebitKillSwitch: Story = {
  args: {
    title: 'Interbank API Gateway Revocation & Clearing Kill-Switch',
    description: 'Enacts an instantaneous Post-No-Debit (PND) broadcast across all NIBSS and neo-bank clearing settlement pipes. Irrevocable once confirmed.',
    actionLabel: 'Execute Post-No-Debit Kill-Switch',
    challengePhrase: 'FREEZE-NIP-GATEWAY',
    severity: 'critical',
    impactedRailCount: 4,
  },
};

export const BreakGlassVaultUnmask: Story = {
  args: {
    title: 'Break-Glass Protocol: Whistleblower Identity Vault',
    description: 'Unmasks Level-5 encrypted anonymous informant dossier. Requires judicial court order attachment and multi-party cryptographic attestation.',
    actionLabel: 'Execute Cryptographic Break-Glass & Unmask',
    challengePhrase: 'UNMASK-LEVEL5-COMPARTMENT',
    severity: 'warning',
  },
};
```

---

## 5. Storybook Interaction Testing & Accessibility (a11y)

### 5.1 Play Function Testing (User Flow Attestation)

```typescript
import { within, userEvent, expect } from '@storybook/test';
import type { StoryObj } from '@storybook/react';
import { EmergencyActionCard } from './EmergencyActionCard';

export const UserMustTypeExactConfirmation: StoryObj<typeof EmergencyActionCard> = {
  args: {
    title: 'Emergency Freeze',
    actionLabel: 'Execute Kill-Switch',
    challengePhrase: 'FREEZE-IMMEDIATE',
    severity: 'critical',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const executeButton = canvas.getByRole('button', { name: /Execute Kill-Switch/i });

    // Initially disabled
    await expect(executeButton).toBeDisabled();

    // Type incorrect phrase
    const input = canvas.getByPlaceholderText(/Type confirmation phrase/i);
    await userEvent.type(input, 'WRONG-PHRASE');
    await expect(executeButton).toBeDisabled();

    // Type exact phrase
    await userEvent.clear(input);
    await userEvent.type(input, 'FREEZE-IMMEDIATE');
    await expect(executeButton).toBeEnabled();
  },
};
```

### 5.2 Accessibility & Contrast Validation
- **Contrast Standard:** All body text on `surface` (`#FCF9F7`) meets **WCAG 2.1 AAA**
  (contrast ratio > 7:1) using `#072320` (`primary` — ~~previously `#1E3835`~~; the corrected
  value is darker still, so the AAA claim holds a fortiori).
- **Monospace Financial Cells:** All currency amounts feature `tabular-nums` and
  screen-reader accessible aria-labels (e.g., `aria-label="45 million Nigerian Naira"`).
- **Keyboard Navigation:** All Storybook stories verify focus states
  (`focus-visible:ring-2 focus-visible:ring-[#072320] focus-visible:outline-none`).

---

## 6. Tailwind Configuration Integration

```javascript
// tailwind.config.js snippet — verified against every mockup's inline tailwind-config script
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#072320',
        'on-primary': '#ffffff',
        'primary-container': '#1e3835',
        'on-primary-container': '#86a19d',
        'inverse-primary': '#b0ccc8',
        'primary-fixed': '#cbe8e4',
        'primary-fixed-dim': '#b0ccc8',
        'on-primary-fixed': '#04201d',
        'on-primary-fixed-variant': '#314c48',

        secondary: '#735854',
        'on-secondary': '#ffffff',
        'secondary-container': '#ffdad4',
        'on-secondary-container': '#795e59',
        'secondary-fixed': '#ffdad4',
        'secondary-fixed-dim': '#e1bfb9',
        'on-secondary-fixed': '#2a1713',
        'on-secondary-fixed-variant': '#59413d',

        tertiary: '#002419',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#163a2d',
        'on-tertiary-container': '#7fa494',
        'tertiary-fixed': '#c4ebd9',
        'tertiary-fixed-dim': '#a8cfbd',
        'on-tertiary-fixed': '#002116',
        'on-tertiary-fixed-variant': '#2a4d40',

        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        surface: '#fcf9f7',
        background: '#fcf9f7',
        'on-surface': '#1b1c1b',
        'on-surface-variant': '#414847',
        'surface-bright': '#fcf9f7',
        'surface-dim': '#dcd9d8',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f6f3f1',
        'surface-container': '#f0edeb',
        'surface-container-high': '#eae8e6',
        'surface-container-highest': '#e5e2e0',
        'surface-variant': '#e5e2e0',
        'surface-tint': '#496360',
        'inverse-surface': '#30302f',
        'inverse-on-surface': '#f3f0ee',
        'on-background': '#1b1c1b',

        outline: '#727877',
        'outline-variant': '#c1c8c6',
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'], // was Inter in v1.1.0
        mono: ['JetBrains Mono', 'monospace'], // aspirational — see § 1.2 note; not yet wired in any shipped mockup
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'space-xs': '0.375rem',
        'space-sm': '0.75rem',
        'space-md': '1.25rem',
        'space-lg': '1.75rem',
        'space-xl': '2.5rem',
        gutter: '1.25rem',
        'gutter-mobile': '0.75rem',
        margin: '2rem',
        'margin-mobile': '1rem',
      },
    },
  },
};
```

> **What changed from v1.1.0:** the old snippet modeled `primary`/`secondary`/`surface`/`outline`
> as nested objects with only 4 shallow keys each (13 tokens total) and got every hex wrong per
> § 1.1 above. The snippet is now a flat token map matching the mockups' actual config shape
> (each token a top-level Tailwind color key, ~45 tokens total), plus the corrected
> `fontFamily.sans` and `borderRadius`/`spacing` scales from §§ 1.2–1.3.
