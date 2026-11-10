import * as React from "react";
import { cn } from "cn";

/** Vanguard Precision's "Zero Ambiguity" principle: every forensic identifier — case/incident/
 * signal reference codes, audit hashes, user/entity ids, ISO timestamps — gets a dedicated
 * monospace treatment so it reads as data, never prose. `--font-mono` (JetBrains Mono) is already
 * loaded via next/font in the root layout; this just gives every call site one place to apply it
 * consistently instead of hand-writing `font-mono` + sizing per usage. */
export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="mono"
      className={cn("font-mono text-[12px] font-medium tabular-nums tracking-tight", className)}
      {...props}
    />
  );
}
