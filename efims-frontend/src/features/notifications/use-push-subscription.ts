"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToPushAction, unsubscribeFromPushAction } from "./actions";

export type PushSupportState = "unsupported" | "checking" | "subscribed" | "unsubscribed";

/** Standard Web Push boilerplate — `PushManager.subscribe`'s `applicationServerKey` wants a
 * `Uint8Array`, not the base64url string every VAPID key is generated/transmitted as. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * Manages this browser's Web Push subscription against the backend's `push_subscriptions` table
 * (see `PushSubscription`'s schema.prisma doc comment). Registers `public/sw.js` on mount
 * regardless of subscription state (cheap, idempotent, and needed before `subscribe()` can ever
 * succeed) — never auto-subscribes on its own, since that would mean silently requesting OS-level
 * notification permission without the user asking for it, exactly what a real opt-in toggle
 * exists to avoid.
 */
export function usePushSubscription(): {
  state: PushSupportState;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
} {
  const [state, setState] = useState<PushSupportState>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "subscribed" : "unsubscribed");
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error("Push notifications aren't configured on this deployment.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return; // user declined — stay in "unsubscribed", no error, this is a normal outcome
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    await subscribeToPushAction({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } });
    setState("subscribed");
  }, []);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unsubscribeFromPushAction(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState("unsubscribed");
  }, []);

  return { state, subscribe, unsubscribe };
}
