"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { Notification } from "./types";

/**
 * Connects directly to the EFIMS backend's realtime gateway — the one deliberate exception to
 * this app's "browser never talks to the backend directly" rule (see `.env.example`'s own note
 * on why a long-lived push channel can't be proxied through a Server Action the way REST calls
 * are). Authenticates with the same short-lived access token already used for REST, fetched from
 * `/api/realtime-token` since the session cookie itself is httpOnly.
 *
 * Each component that calls this hook opens its own socket connection (the topnav bell, the
 * notifications page, and the global toast listener all use it independently) — simpler than a
 * shared context/provider for a handful of consumers, and a Socket.IO connection is cheap enough
 * that this isn't worth the extra plumbing.
 *
 * `onRead`: fires on `notification.read`, emitted by the backend's `NotificationsService.markRead`
 * after a successful update — the only way a consumer with its own local unread count (the badge)
 * finds out a notification was read from *another* consumer (the list page, another tab, another
 * device), not just its own. Optional because most callers only care about new notifications.
 */
export function useRealtimeNotifications(onNotification: (notification: Notification) => void, onRead?: (id: string) => void): void {
  const callbackRef = useRef(onNotification);
  useEffect(() => {
    callbackRef.current = onNotification;
  });
  const readCallbackRef = useRef(onRead);
  useEffect(() => {
    readCallbackRef.current = onRead;
  });

  useEffect(() => {
    let socket: Socket | undefined;
    let cancelled = false;

    (async () => {
      let token: string | undefined;
      try {
        const res = await fetch("/api/realtime-token");
        if (!res.ok) return; // redirected to /login or otherwise unauthenticated — don't connect
        ({ token } = await res.json());
      } catch {
        return;
      }
      if (cancelled || !token) return;

      socket = io(`${process.env.NEXT_PUBLIC_REALTIME_URL}/realtime`, { auth: { token } });
      socket.on("notification.created", (notification: Notification) => callbackRef.current(notification));
      socket.on("notification.read", ({ id }: { id: string }) => readCallbackRef.current?.(id));
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);
}
