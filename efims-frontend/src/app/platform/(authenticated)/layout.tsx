import { requirePlatformSession } from "@/features/platform/session";
import { platformLogoutAction } from "@/features/platform/actions";

/**
 * `requirePlatformSession()` here is the real auth gate for everything under `/platform` except
 * `/platform/login` — that page is a sibling outside this route group (`(authenticated)`,
 * stripped from the URL), so it never gets wrapped by this layout and never triggers it, same
 * reasoning `(app)/layout.tsx` already uses to keep `/login` separate from the tenant shell.
 *
 * Deliberately NOT styled like the tenant app's sidenav shell (`components/shell/sidenav.tsx`) —
 * a plain top bar, no case/incident/signal navigation at all, so it's never visually ambiguous
 * which context (platform vs. a specific bank tenant) you're currently in.
 */
export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const { user } = await requirePlatformSession();

  return (
    <div className="min-h-screen bg-inverse-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface px-4 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
            <span className="text-base font-bold">E</span>
          </div>
          <div>
            <p className="text-base font-semibold text-on-surface">EFIMS Platform</p>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Super-admin console</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-on-surface-variant sm:inline">{user.email}</span>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8">{children}</main>
    </div>
  );
}
