"use client";

import { useState } from "react";
import { markNotificationReadAction } from "@/features/notifications/actions";
import { useRealtimeNotifications } from "@/features/notifications/use-realtime-notifications";
import type { Notification } from "@/features/notifications/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientDate } from "@/components/shell/client-date";

export function NotificationsLiveList({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  useRealtimeNotifications((notification) => {
    setNotifications((prev) => (prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev]));
  });

  async function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await markNotificationReadAction(id);
  }

  if (notifications.length === 0) {
    return <p className="text-xs text-on-surface-variant">No notifications.</p>;
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <Card key={n.id} className={`border-outline-variant shadow-card ${!n.readAt ? "bg-secondary-container/20" : ""}`}>
          <CardContent className="flex items-start justify-between gap-4 pt-4 text-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-on-surface">{n.title}</span>
                {n.priority === "HIGH" && <Badge className="bg-error-container text-on-error-container">HIGH</Badge>}
              </div>
              <p className="mt-1 text-on-surface-variant">{n.body}</p>
              <p className="mt-1 text-on-surface-variant"><ClientDate value={n.createdAt} mode="datetime" /></p>
            </div>
            {!n.readAt && (
              <button
                type="button"
                onClick={() => handleMarkRead(n.id)}
                className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                Mark read
              </button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
