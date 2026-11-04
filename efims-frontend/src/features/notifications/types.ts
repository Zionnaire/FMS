export const NOTIFICATION_PRIORITIES = ["NORMAL", "HIGH"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsResult {
  notifications: Notification[];
  total: number;
}
