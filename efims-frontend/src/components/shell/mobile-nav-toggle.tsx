"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

/** The one interactive piece `TopNav` (a Server Component) needs from the shared mobile-nav
 * state — split into its own tiny client component rather than converting all of `TopNav` to a
 * Client Component just for one button. */
export function MobileNavToggle() {
  const { toggle } = useMobileNav();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open navigation menu"
      className="shrink-0 rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface lg:hidden"
    >
      <Menu size={20} strokeWidth={2} />
    </button>
  );
}
