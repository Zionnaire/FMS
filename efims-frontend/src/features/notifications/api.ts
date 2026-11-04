import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { ListNotificationsResult, Notification } from "./types";

export async function listNotifications(
  accessToken: string,
  options?: { unreadOnly?: boolean; limit?: number; offset?: number },
): Promise<ListNotificationsResult> {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.set("unreadOnly", "true");
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  const query = params.toString();
  return backendFetch<ListNotificationsResult>(`/notifications${query ? `?${query}` : ""}`, { accessToken });
}

export async function markNotificationRead(accessToken: string, id: string): Promise<Notification> {
  return backendFetch<Notification>(`/notifications/${id}/read`, { method: "POST", accessToken });
}
