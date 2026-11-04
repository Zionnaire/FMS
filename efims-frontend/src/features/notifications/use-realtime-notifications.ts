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
 * Each component that calls this hook opens its own socket connection (the topnav bell and the
 * notifications page both use it independently) — simpler than a shared context/provider for two
 * consumers, and a Socket.IO connection is cheap enough that this isn't worth the extra plumbing.
 */
export function useRealtimeNotifications(onNotification: (notification: Notification) => void): void {
  const callbackRef = useRef(onNotification);
  useEffect(() => {
    callbackRef.current = onNotification;
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
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);
}
