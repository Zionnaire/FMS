import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/types";
import { listNotifications } from "@/features/notifications/api";
import { NotificationBellBadge } from "./notification-bell-badge";

export async function TopNav({ user, accessToken }: { user: SessionUser; accessToken: string }) {
  const { total: unreadTotal } = await listNotifications(accessToken, { unreadOnly: true, limit: 1 });

  return (
    <header className="fixed top-0 right-0 left-64 z-30 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/90 px-8 backdrop-blur-md">
      <div>
        <p className="text-xs text-on-surface-variant">Signed in as</p>
        <p className="text-sm font-semibold text-on-surface">{user.email}</p>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/notifications" className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <NotificationBellBadge initialUnread={unreadTotal} />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1.5 text-xs font-medium text-on-secondary-container">
          <span className="material-symbols-outlined text-[14px]">verified_user</span>
          {user.role.replaceAll("_", " ")}
        </span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
