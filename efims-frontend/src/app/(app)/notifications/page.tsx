import { requireSession } from "@/features/auth/session";
import { listNotifications } from "@/features/notifications/api";
import { PushNotificationToggle } from "@/features/notifications/push-notification-toggle";
import { NotificationsLiveList } from "./notifications-live-list";

export default async function NotificationsPage() {
  const { accessToken } = await requireSession();
  const { notifications, total } = await listNotifications(accessToken, { limit: 50 });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Notifications</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{total} total — live via the realtime gateway, no reload needed.</p>
        </div>
        <PushNotificationToggle />
      </div>
      <NotificationsLiveList initialNotifications={notifications} />
    </>
  );
}
