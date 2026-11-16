"use client";

import { useState } from "react";
import { toast } from "sonner";
import { usePushSubscription } from "./use-push-subscription";

/** Explicit opt-in/opt-out control — this is the one place in the app that triggers the browser's
 * own OS-level notification-permission prompt, and it only ever does so from a direct click here,
 * never automatically on page load (see `usePushSubscription`'s own doc comment). */
export function PushNotificationToggle() {
  const { state, subscribe, unsubscribe } = usePushSubscription();
  const [pending, setPending] = useState(false);

  if (state === "unsupported" || state === "checking") return null;

  async function handleClick() {
    setPending(true);
    try {
      if (state === "subscribed") {
        await unsubscribe();
        toast.info("Push notifications turned off on this device.");
      } else {
        await subscribe();
        toast.success("Push notifications turned on for this device.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update push notification settings.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
    >
      {state === "subscribed" ? "Turn off push notifications" : "Turn on push notifications"}
    </button>
  );
}
