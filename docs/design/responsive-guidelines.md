# EFIMS — Responsive & Accessibility Guidelines (Application Shell)

**Date:** 2026-11-14. Covers the application shell (`sidenav.tsx`, `topnav.tsx`, `(app)/layout.tsx`,
`DetailDrawer`) — the one piece of UI every page in the app shares, and the piece that had zero
responsive behavior before this pass (a permanently `fixed w-64` sidebar, a topnav hard-anchored
to `left-64`, no way to reach the nav on a narrow screen at all).

## Breakpoint model

One breakpoint, matching Tailwind's `lg` (1024px), separates two real layouts:

- **`lg` and up (desktop/laptop)**: the sidebar is permanently visible (`lg:translate-x-0`),
  `lg:ml-64` on `<main>` reserves its width, the topnav's hamburger toggle is hidden
  (`lg:hidden`), and the topnav's institution name / user role text are shown in full.
- **Below `lg` (tablet/mobile)**: the sidebar is off-canvas by default
  (`-translate-x-full`), toggled by a hamburger button in the topnav via `MobileNavProvider`'s
  shared context (`src/components/shell/mobile-nav-context.tsx`) — `SideNav` and `TopNav` are
  siblings, not parent/child, so this context is what lets one control the other. Opening it
  shows a dismissible dark overlay and a close (`X`) button inside the sidebar itself; navigating
  to any link closes it automatically (handled during render via React's documented "adjust state
  when a prop changes" pattern, not an Effect, to avoid a cascading-render lint error). `<main>`
  drops its left margin entirely below `lg` since the sidebar no longer reserves space there.

No intermediate "tablet gets a collapsed icon-only rail" state was built — the off-canvas pattern
is used uniformly below `lg`, including on tablet-width devices, since this app's content density
(wide tables, multi-column filter bars) needs the full viewport width more than a persistently
visible nav does at that size.

## What else is responsive

- `Table`'s container already wraps every table in `overflow-x-auto` — wide tables (e.g.
  `OperationalQueueTable`) scroll horizontally rather than breaking layout on a narrow screen.
  This predates this pass; confirmed still correct, not re-implemented.
- `QueueDashboard`'s KPI grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) and most page-level
  grids already had responsive column counts before this pass.
- `DetailDrawer` gained `max-w-[90vw]` so its fixed `480px`/`640px` width doesn't force horizontal
  page scroll on a phone-width viewport.
- Topnav content degrades gracefully, not just hides: institution name hidden below `sm`, user
  email/role text hidden below `md`, avatar and icons always visible — so identity/context is
  never fully lost, just progressively less verbose.

## Accessibility — what this pass covered

- Every icon-only shell control now has a real `aria-label` (not just a `title` tooltip, which
  isn't a reliable accessible name for all assistive technology): the hamburger toggle, the
  sidebar's mobile close button, the notification bell (including the live unread count in the
  label), the sign-out button (both the tenant and platform shells), and `DetailDrawer`'s close
  button.
- `DetailDrawer` gained `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at
  its own title — it was already Escape-to-close; it wasn't previously announced as a dialog at
  all to assistive technology.
- The sidebar's collapsible "Configuration" group button gained `aria-expanded`.
- The sidebar's `<nav>` landmark gained `aria-label="Primary"`.
- `prefers-reduced-motion: reduce` is now respected globally (`globals.css`) — every
  animation/transition (the sidebar's slide, any spinner) drops to near-zero duration for a user
  who has asked their OS for reduced motion, rather than just ignoring the setting.
- Verified live: full keyboard Tab order through the sidebar reaches every link in visual order,
  each with a visible focus ring (the shadcn `Button` base already provides `focus-visible` ring
  styles; raw `<button>`s in the shell were checked to still show a browser-default or
  Tailwind-provided focus indicator, not suppressed).

## What this pass did not cover

- No automated contrast or `axe-core`/Lighthouse accessibility scan — this was a manual pass
  focused on the shell, not a certified audit.
- Individual pages' own icon-only controls (table row "open" eye icons, filter-chip remove
  buttons, etc.) were not swept for `aria-label` beyond what the earlier icon-migration forks
  already did incidentally — a dedicated page-by-page pass is still open.
- No focus trap inside `DetailDrawer` (Tab can currently move focus out to the page behind the
  overlay) — Escape-to-close and a dialog role exist, but full focus containment does not yet.
