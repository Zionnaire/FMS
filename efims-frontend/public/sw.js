// EFIMS push service worker. Deliberately minimal: this app has no other offline/caching need
// (every page is Server Component-rendered, access-control-sensitive, and explicitly
// `cache: "no-store"` — see `backend-client.ts`'s own doc comment on why), so this file exists
// for exactly one job, showing a push notification, not as a general-purpose PWA worker.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push with no body, or a non-JSON one — still show something rather than nothing.
  }

  const title = data.title || "EFIMS";
  const options = {
    body: data.body || "",
    data: { notificationId: data.notificationId },
    tag: data.notificationId, // replaces an earlier OS notification for the same id instead of stacking duplicates
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the OS-level notification focuses an already-open EFIMS tab if one exists, instead of
// always opening a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/notifications");
    }),
  );
});
