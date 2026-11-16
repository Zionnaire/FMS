"use client";

import { useState } from "react";
import { useRealtimeNotifications } from "@/features/notifications/use-realtime-notifications";

/** Wraps only the numeric badge, not the whole topnav — the server-computed `initialUnread` count
 * (from `TopNav`'s own `listNotifications` call) avoids a flash of "0" on first paint; this
 * increments it live as `notification.created` events arrive and decrements on `notification.read`
 * (same socket-per-consumer trade-off as `NotificationsLiveList`). The decrement side is the fix
 * for a real bug: before `notification.read` existed, this count only ever grew, even after the
 * user read everything on the notifications page in the same tab — see
 * `use-realtime-notifications.ts`'s own doc comment. */
export function NotificationBellBadge({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useRealtimeNotifications(
    () => setUnread((prev) => prev + 1),
    () => setUnread((prev) => Math.max(0, prev - 1)),
  );

  if (unread <= 0) return null;

  return (
    <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-on-error">
      {unread}
    </span>
  );
}
