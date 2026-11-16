"use client";

import { toast } from "sonner";
import { useRealtimeNotifications } from "@/features/notifications/use-realtime-notifications";

/**
 * Mounted exactly once, in `(app)/layout.tsx` — the one persistent shell every authenticated page
 * renders inside — so it opens exactly one extra socket connection per session and fires exactly
 * one toast per `notification.created` event, regardless of which page is open. `NotificationBellBadge`
 * and `NotificationsLiveList` each already open their own socket for their own reason (see
 * `useRealtimeNotifications`'s own doc comment); this is a third, independent consumer of the same
 * cheap-to-duplicate connection, not a replacement for either.
 */
export function RealtimeToastListener() {
  useRealtimeNotifications((notification) => {
    const show = notification.priority === "HIGH" ? toast.warning : toast.info;
    show(notification.title, { description: notification.body });
  });

  return null;
}
