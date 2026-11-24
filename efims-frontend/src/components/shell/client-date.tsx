"use client";

import { useEffect, useState } from "react";

/**
 * Renders a locale-formatted date/time safely in a Client Component. `toLocaleString()`/
 * `toLocaleDateString()` called directly in JSX is NOT hydration-safe: Next.js still renders a
 * Client Component once on the server to produce the initial HTML, and the server container's
 * local timezone (Render: UTC) almost always differs from the browser's (the actual viewer's
 * machine) — the server and client then compute different text for the exact same timestamp,
 * which React detects as a hydration mismatch (error #418, "Hydration failed because the server
 * rendered text didn't match the client"). `toLocaleString()` (date+time) hits this reliably,
 * since the hour digits shift by the UTC-offset difference between the two environments;
 * `toLocaleDateString()` (date-only) only visibly breaks near a day boundary, which is why it can
 * look fine in testing and still be the same latent bug — found live 2026-11-24 on one of 9 files
 * sharing this exact unsafe pattern across the app, fixed in all of them at once rather than only
 * the one that happened to trip a visible error.
 *
 * Renders a stable, locale-independent placeholder ("—", already this app's established
 * no-value convention) on the first render — identical on server and client, so there's nothing
 * to mismatch — then swaps to the real formatted string after mount via an ordinary client-side
 * state update, which isn't subject to hydration comparison at all.
 */
export function ClientDate({ value, mode = "date" }: { value: string | null | undefined; mode?: "date" | "datetime" }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  // Deliberately setState-in-effect, not useMemo: useMemo would run during the SSR render too,
  // reintroducing the exact mismatch this component exists to avoid. The computation must happen
  // strictly after mount, client-only.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!value) {
      setFormatted(null);
      return;
    }
    const d = new Date(value);
    setFormatted(mode === "datetime" ? d.toLocaleString() : d.toLocaleDateString());
  }, [value, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!value) return <>—</>;
  return <>{formatted ?? "—"}</>;
}
