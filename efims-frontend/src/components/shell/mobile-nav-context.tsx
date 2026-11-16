"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";

interface MobileNavState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

/** Shared open/closed state for the off-canvas sidebar at narrow widths — `SideNav` and `TopNav`
 * are siblings in `(app)/layout.tsx`, not parent/child, so the topnav's hamburger button and the
 * sidenav's own slide-in behavior need a state holder above both of them. Desktop (`lg:` and up)
 * never reads this — the sidebar stays permanently visible there regardless of `open`. */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on every navigation — otherwise the overlay would stay open after following a link.
  // Adjusted during render (React's documented pattern for "reset state when a prop changes"),
  // not in an Effect, so it doesn't cause an extra cascading render.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <MobileNavContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavState {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within a MobileNavProvider");
  return ctx;
}
