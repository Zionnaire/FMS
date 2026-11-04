import { requireSession } from "@/features/auth/session";
import { listNotifications } from "@/features/notifications/api";
import { NotificationsLiveList } from "./notifications-live-list";

export default async function NotificationsPage() {
  const { accessToken } = await requireSession();
  const { notifications, total } = await listNotifications(accessToken, { limit: 50 });

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Notifications</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{total} total — live via the realtime gateway, no reload needed.</p>
      </div>
      <NotificationsLiveList initialNotifications={notifications} />
    </>
  );
}
