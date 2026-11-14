/** `Date.now()`/`new Date()` calls are flagged as impure when inlined directly in a component's
 * render body (`react-hooks/purity` — this project's lint config treats Server Components the
 * same as Client Components for this rule). Isolating the "is this ISO timestamp already past"
 * check in a plain, non-component function avoids that false positive without disabling the
 * rule. */
export function isPastDeadline(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
