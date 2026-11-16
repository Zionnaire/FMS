# EFIMS — Frontend Redesign Assessment (Phase 0)

**Date:** 2026-11-14. **A note on chronology, for honesty's sake**: the directive asked for this
assessment before any broad redesign work began. In practice, the reference image arrived, the
token/font/shell foundation was implemented immediately against it, and this document was written
afterward, consolidating what was actually found and decided along the way — not reconstructed
from memory after the fact, but also not produced strictly before implementation the way the
directive's own phase ordering asked for. Flagging this directly rather than presenting a tidier
narrative than what actually happened.

---

## What existed before this pass

- **Design system**: "Botanical Precision" (2026-11-09/10) — a deep spruce-green primary
  (`#072320`), Vanguard Precision's cooler slate/blue surfaces, Playfair Display for every page's
  `<h1>`, Plus Jakarta Sans for body text, JetBrains Mono for references, Material Symbols
  Outlined (a ligature icon font) for every icon in the app — ~164 separate `<span
  class="material-symbols-outlined">` usages across 46 files.
- **Architecture**: already sound going into this pass (see "What should remain," below) — a
  single semantic CSS-variable indirection layer (`--color-primary` etc. in `globals.css`), a
  shared `QueueDashboard` shell composed per-role by `dashboard-loaders.ts`, 4 bespoke dashboards
  for the roles that genuinely need a different shape, a hard platform/tenant identity split.
- **Testing**: no frontend automated tests existed (confirmed independently by this session's
  earlier backend/frontend engineering audit — `docs/engineering/implementation-assessment.md`).
- **Known pre-existing gaps**, also already tracked in `docs/OPEN_ITEMS.md` before this pass: only
  2 of ~20 routes had a `loading.tsx`; `recovery`/`regulatory` registers fetch unbounded with no
  pagination; a single generic `error.tsx` with no differentiation by error type.

## What should remain (confirmed, not rebuilt)

- **The semantic-token indirection layer itself.** This is the single reason the entire palette
  swap — navy/teal replacing spruce-green/slate across the whole app — was a one-file change to
  `globals.css` rather than a mechanical per-component sweep. Every component already referenced
  `var(--color-primary)` etc., never a literal hex value (two narrow, deliberate exceptions —
  `executive-dashboard.tsx`'s severity/status color maps and `segmented-bar.tsx`'s luminance-
  contrast calculation — both need a literal hex alongside the token for WCAG contrast math, and
  both were caught and corrected when their hardcoded values drifted from the new palette).
- **`QueueDashboard` + `dashboard-loaders.ts`'s role-composition architecture.** The directive's
  Part 6 explicitly warns against either "same dashboard for every role" or "20 independent
  frontends." Neither risk existed going in — this was already the right shape, built during the
  2026-10-14 twenty-role expansion. This pass re-skinned it (new KPI-tile style, a severity-mix
  card, a needs-attention panel, a recent-activity feed, a brand card — see
  `docs/design/role-workspace-mapping.md`) rather than replacing it.
- **The platform/tenant identity split.** `PlatformUser` living entirely outside the `Role` enum,
  with its own JWT secret and shell, was already correct and untouched.
- **Backend-enforced authorization.** Confirmed via this session's earlier parallel frontend audit:
  every frontend role check is UI-visibility-only; the backend independently rejects anything a
  hidden-but-reachable control would attempt. No duplicated authorization logic was found or
  introduced.

## What was replaced

- **Every visual token**: navy ink (`#172B45`) + teal (`#167D83`) replacing spruce-green/slate,
  Inter + IBM Plex Mono replacing Plus Jakarta Sans/JetBrains Mono, new `success`/`warning`/`info`
  status tokens added (previously absent — `StatusBadge` had reused brand tokens as a stand-in).
  Severity tokens (S1–S4) were deliberately **not** touched — already a correct, distinct
  4-color system; re-inventing it without institutional sign-off is exactly what the directive
  warns against.
- **Every icon**: Material Symbols Outlined removed entirely (the `<link>` in `layout.tsx` and the
  dead CSS rule in `globals.css`, not just the usages) in favor of real `lucide-react` components,
  per explicit instruction to avoid anything that reads as a generic/AI-templated icon set.
- **KPI tile style**: the old "one dark gradient hero card + plain neutral cards" pattern is gone
  everywhere (bespoke dashboards and the shared shell alike) in favor of uniform white cards with
  a colored circular icon badge, matching the reference image exactly.
- **Playfair Display's role**: pulled back from every page's default `<h1>` to near-zero usage,
  per the new spec's "restrained display typeface only for major editorial headings, not every
  page" — still loaded, not yet deleted, in case a genuinely editorial heading surfaces later.

## What's incomplete / explicitly deferred

- **The other 3 bespoke dashboards' deeper composition** (`AdminDashboard`, `ConfigAdminDashboard`,
  `ReporterDashboard`) received the token/icon/KPI-tile re-skin but not a reference-image-specific
  layout pass the way `QueueDashboard` and `ExecutiveDashboard` did — they didn't have a directly
  analogous section in the reference image to replicate.
- **Component documentation / Storybook** (directive Part 4.5) — this project has no Storybook
  configured; per the directive's own fallback instruction ("do not let that block
  implementation"), this was not introduced.
- **`docs/design/interaction-patterns.md`** — not yet written; nothing in this pass's actual
  implementation work produced enough new interaction decisions to document yet beyond what
  `docs/design/responsive-guidelines.md` now covers for the shell itself.
- **Per-page responsive review beyond the shell** — the shell (sidebar/topnav/main) and the shared
  `Table` primitive (already horizontally scrollable) are now genuinely responsive (see
  `docs/design/responsive-guidelines.md`), but individual pages' own denser layouts (e.g. the
  Cases filter bar's multi-column form) weren't each separately re-checked at every breakpoint —
  none broke in spot checks, but this wasn't an exhaustive page-by-page sweep.
- **Full accessibility audit** — the shell's own icon-only controls (hamburger, close, sign-out,
  notification bell, drawer close) now carry real `aria-label`s, keyboard tab order through the
  sidebar was verified live, and `prefers-reduced-motion` is respected globally. Not yet done:
  a sweep of icon-only controls on *individual* pages (e.g. table row "open" icons on pages this
  pass didn't specifically touch for aria-labels), and no automated contrast/axe-core scan has
  been run — this was a manual, shell-focused pass, not a certified WCAG audit.

## What was found duplicated or inconsistent (and fixed)

- `executive-dashboard.tsx`'s `INCIDENT_STATUS_COLOR` map held literal hex values that had drifted
  from the new token palette the moment the palette changed — caught and corrected during the
  icon-migration pass, not left stale.
- No genuinely duplicate component implementations were found (one `StatusBadge`, one `Table`
  primitive family, one `SegmentedBar`) — confirmed, not assumed, during the earlier parallel
  frontend audit this session.

## What was found unsafe

Nothing new. The earlier parallel security/frontend audit this session (see
`docs/engineering/implementation-assessment.md`) already covered authorization, secrets, and
AI-advisory presentation in depth; this visual pass didn't touch any of that surface.

---

## Recommended next steps for Track B (unchanged from the master roadmap)

Role-aware workspace composition is already structurally done (see
`docs/design/role-workspace-mapping.md`); the next real increments are the responsive pass, the
accessibility pass, and documenting interaction/responsive patterns as they're decided — not a
further visual rebuild.
