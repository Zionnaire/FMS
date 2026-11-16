import { requireSession } from "@/features/auth/session";
import { SideNav } from "@/components/shell/sidenav";
import { TopNav } from "@/components/shell/topnav";
import { UnratifiedConfigurationBanner } from "@/components/shell/unratified-banner";
import { MobileNavProvider } from "@/components/shell/mobile-nav-context";
import { RealtimeToastListener } from "@/components/shell/realtime-toast-listener";

/**
 * `requireSession()` here is the real (server-side) auth check for every route under this
 * layout — `proxy.ts`'s redirect is only an optimistic, UX-level first line; this is what
 * actually stops the shell (and everything it wraps) from rendering without a valid session. See
 * the Next.js authentication guide's warning that a layout's own check doesn't stop nested
 * segments from rendering on its own — this call still matters here because every page under
 * `(app)/` renders inside this layout, and each of those pages additionally calls
 * `requireSession()`/`getSession()` itself before touching the backend, per that same guide's
 * recommendation not to rely on a shared layout check alone.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, accessToken } = await requireSession();

  return (
    <MobileNavProvider>
      <RealtimeToastListener />
      <div className="min-h-screen bg-surface">
        <SideNav role={user.role} />
        <TopNav user={user} accessToken={accessToken} />
        <main className="min-h-screen pt-16 lg:ml-64">
          <UnratifiedConfigurationBanner accessToken={accessToken} />
          <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </MobileNavProvider>
  );
}
