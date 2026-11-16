import Link from "next/link";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/types";
import { listNotifications } from "@/features/notifications/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBellBadge } from "./notification-bell-badge";
import { CommandPalette } from "./command-palette";
import { MobileNavToggle } from "./mobile-nav-toggle";

function initials(email: string): string {
  const name = email.split("@")[0].replaceAll(/[._]/g, " ");
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export async function TopNav({ user, accessToken, institutionName = "Bank 1" }: { user: SessionUser; accessToken: string; institutionName?: string }) {
  const { total: unreadTotal } = await listNotifications(accessToken, { unreadOnly: true, limit: 1 });

  return (
    <header className="fixed top-0 right-0 left-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-outline-variant bg-surface-bright px-4 lg:left-64 lg:gap-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNavToggle />
        <CommandPalette />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <Link
          href="/notifications"
          aria-label={unreadTotal > 0 ? `Notifications, ${unreadTotal} unread` : "Notifications"}
          className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          <Bell size={20} strokeWidth={2} />
          <NotificationBellBadge initialUnread={unreadTotal} />
        </Link>

        <div className="hidden items-center gap-1.5 border-l border-outline-variant pl-4 text-xs font-semibold text-on-surface sm:flex">
          {institutionName}
          <ChevronDown size={14} className="text-on-surface-variant" />
        </div>

        <div className="flex items-center gap-2.5 border-l border-outline-variant pl-2 sm:pl-4">
          <Avatar size="sm">
            <AvatarFallback className="bg-tertiary-container text-[11px] font-bold text-tertiary">{initials(user.email)}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col leading-tight md:flex">
            <span className="text-xs font-semibold text-on-surface">{user.email.split("@")[0]}</span>
            <span className="text-[11px] text-on-surface-variant">{user.role.replaceAll("_", " ")}</span>
          </div>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <LogOut size={18} strokeWidth={2} />
          </button>
        </form>
      </div>
    </header>
  );
}
