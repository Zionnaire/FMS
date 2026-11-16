# EFIMS Design Tokens — Institutional Intelligence

**Supersedes:** `docs/design-system.md` ("Botanical Executive"/"Botanical Precision"), which
described a palette this codebase no longer uses as of 2026-11-14. That file is left in place as
historical record (its component-structure/Storybook sections are mostly still accurate) but its
**color and font tables are stale** — this file is the current source of truth for tokens.

**Source of truth for every value below:** `efims-frontend/src/app/globals.css` (the actual
running CSS) and `efims-frontend/src/app/layout.tsx` (the actual font loading). This document
describes what the code does, not the reverse — if they ever disagree, the code is right and this
file needs updating.

---

## 1. Color tokens

Every CSS variable name below is unchanged from the prior "Botanical Precision" palette — ~160
call sites across the app reference `var(--color-primary)` etc., and the whole point of this
token-indirection layer is that a full palette replacement is a single-file change to the `:root`
hex values, never a per-component sweep.

| Token | Hex | Role |
|---|---|---|
| `--color-primary` | `#172b45` | Navy ink — sidebar surface, brand, major headings (sparingly — see Typography) |
| `--color-on-primary` | `#ffffff` | Text/icons on `primary` |
| `--color-primary-container` | `#213b5c` | Lighter navy — hover states, dark container fills |
| `--color-on-primary-container` | `#9fb2c9` | Muted labels on navy (sidebar section headings, inactive nav text) |
| `--color-secondary` | `#64748b` | Neutral slate — secondary chips, neutral accents |
| `--color-secondary-container` | `#eef2f5` | Light slate container |
| `--color-tertiary` | `#167d83` | **Teal — the one real interactive accent.** Buttons, active nav pill, links, primary chart lines |
| `--color-tertiary-container` | `#e3f2f3` | Light teal — icon-badge tint background |
| `--color-error` | `#b94343` | Critical/destructive |
| `--color-error-container` | `#f9e6e6` | Light error tint |
| `--color-success` | `#25845a` | Positive status (added 2026-11-14 — no dedicated slot existed before; `StatusBadge` previously reused `tertiary-fixed` as a stand-in) |
| `--color-success-container` | `#e5f3ec` | |
| `--color-warning-status` | `#d99a32` | Attention/warning status (added 2026-11-14) |
| `--color-warning-status-container` | `#fbf1e2` | |
| `--color-info` | `#3975b9` | Informational status (added 2026-11-14) |
| `--color-info-container` | `#e8f0fa` | |
| `--color-text-muted` | `#8a97a6` | Metadata/tertiary text (added 2026-11-14) |
| `--color-surface` | `#f4f6f8` | Canvas — app background |
| `--color-surface-container-lowest` | `#ffffff` | White cards/panels |
| `--color-surface-container-low` / `-container` | `#eef2f5` | Surface-muted |
| `--color-surface-container-high` | `#e4e9ed` | |
| `--color-outline` | `#c7d0d9` | Stronger border |
| `--color-outline-variant` | `#dfe5eb` | Standard border (most card borders use `/60` opacity of this) |
| `--color-on-surface` | `#172b45` | Primary body text (same value as `primary` — correct per spec, not a mistake) |
| `--color-on-surface-variant` | `#64748b` | Secondary body text |

**Severity tokens — deliberately unchanged, do not re-derive:**

| Token | Hex |
|---|---|
| `--color-severity-s1` | `#ef4444` |
| `--color-severity-s2` | `#f97316` |
| `--color-severity-s3` | `#f59e0b` |
| `--color-severity-s4` | `#64748b` |

This 4-distinct-color set already satisfies the new directive's own rule ("do not invent
severity-to-color mappings... inspect the existing vocabulary") — it was fixed from a real S2=S3
bug on 2026-11-09 and has been used consistently everywhere since. Severity is a separate,
raw utility layer, never derived from the brand tokens above.

## 2. Typography

| Role | Font | CSS variable | Notes |
|---|---|---|---|
| Interface (body, nav, tables, buttons) | **Inter** | `--font-plus-jakarta-sans` (name kept from the prior font to avoid touching ~160 `font-sans` call sites) | Replaces Plus Jakarta Sans |
| References/identifiers/timestamps | **IBM Plex Mono** | `--font-jetbrains-mono` (name kept, same reasoning) | Replaces JetBrains Mono |
| Major editorial headings only | Playfair Display | `--font-playfair-display` | Still loaded; usage pulled back from every page's default `<h1>` (which now uses plain `text-2xl font-bold text-on-surface`) to near-zero — no page in the redesigned set currently uses it, kept loaded in case a genuinely editorial heading (not a list/detail page title) needs it later |

All icons render via `lucide-react` components, not a ligature icon font — Material Symbols
Outlined was removed entirely (both its `<link>` tag and its CSS rule) once the last usage was
migrated.

## 3. Spacing, radius, shadow

Unchanged from the prior palette except `--radius-sm` (4px → 6px, to match the new spec's "small
controls: 6px" exactly). Cards use `rounded-xl` (12px) consistently across the redesigned set,
not the prior `rounded-2xl` (16px) — a deliberate, slightly tighter radius matching the reference
image's less-rounded card chrome. Shadows (`--shadow-card`, `--shadow-hover`, etc.) are unchanged
— the prior "Vanguard Precision" subtle neutral shadows already fit the cooler palette direction.

## 4. Component-level conventions established this pass

- **KPI tile**: uniform white card (`bg-surface-container-lowest`, `border-outline-variant/60`,
  `rounded-xl`, `shadow-card`), a `size-10` circular icon badge tinted via
  `color-mix(in srgb, ${color} 16%, white)`, the icon itself colored via inline `style`. No
  "hero" dark/gradient-filled card variant exists anymore anywhere in the app.
- **Primary action buttons**: `bg-tertiary text-on-tertiary` (teal), not `bg-primary` (navy is now
  reserved for the sidebar/brand surface, not an interactive button color).
- **Status badges** (`StatusBadge`): `positive`→`success`, `warning`→`warning-status`,
  `critical`→`error`, `neutral`→`surface-container-high` — real dedicated tokens, not brand-token
  reuse.
